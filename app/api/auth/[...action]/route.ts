import {
  authenticateEmailUser,
  clearSessionCookie,
  createSession,
  findOrCreateGoogleUser,
  formatCookie,
  getAuthenticatedUser,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  parseCookieHeader,
  randomToken,
  registerEmailUser,
  revokeSessionFromRequest,
  safeRelativeReturnPath,
  sha256Base64Url,
  sha256Hex,
} from "../../../../backend/auth/session";
import { HttpError, body, protectMutation } from "../../../../backend/middleware/security";
import { RELEASE_GATES } from "../../../../backend/services/legacy/gates";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import { account, database, rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";
const CONSENT_VERSION = "2026-11-14-v4";
const OAUTH_STATE_COOKIE = "__ss_oauth_state";
const OAUTH_PKCE_COOKIE = "__ss_oauth_pkce";
const OAUTH_RETURN_COOKIE = "__ss_oauth_return";

function json(data: unknown, status = 200, headers?: Headers): Response {
  const h = headers ?? new Headers();
  h.set("Cache-Control", "private, no-store");
  h.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { status, headers: h });
}

function clientBucket(request: Request): string {
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  return raw.slice(0, 64);
}

async function sessionPayload(user: Awaited<ReturnType<typeof getAuthenticatedUser>>) {
  if (!user) {
    return {
      authenticated: false,
      accepted: false,
      alias: null,
      consentVersion: CONSENT_VERSION,
      isOwner: false,
      googleEnabled: isGoogleOAuthConfigured(),
      user: null,
      gates: RELEASE_GATES,
    };
  }
  const current = await account(user.userId);
  return {
    authenticated: true,
    accepted:
      !!current &&
      current.adult_confirmed === 1 &&
      current.consent_version === CONSENT_VERSION,
    alias: current?.alias ?? user.displayName,
    consentVersion: CONSENT_VERSION,
    isOwner: isDataOwner(user.userId),
    googleEnabled: isGoogleOAuthConfigured(),
    user: {
      displayName: current?.alias ?? user.displayName,
      email: user.email,
      authProvider: user.authProvider,
    },
    gates: RELEASE_GATES,
  };
}

async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/api\/auth\/?/, "");
    const method = request.method;

    if (action === "session" && method === "GET") {
      const user = await getAuthenticatedUser(request);
      return json(await sessionPayload(user));
    }

    if (action === "register" && method === "POST") {
      protectMutation(request, 4096);
      const input = await body(request, 4096);
      const ipKey = await sha256Hex("reg:" + clientBucket(request));
      await rate("auth:reg:ip:" + ipKey.slice(0, 24), 20, 3600_000);
      if (typeof input.email === "string") {
        const emailKey = await sha256Hex(
          "reg-email:" + input.email.trim().toLowerCase(),
        );
        await rate("auth:reg:em:" + emailKey.slice(0, 24), 10, 3600_000);
      }

      const user = await registerEmailUser({
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      });

      if (
        input.adult === true &&
        input.privacy === true &&
        input.terms === true
      ) {
        const now = new Date().toISOString();
        await database()
          .prepare(
            "INSERT INTO accounts (subject,alias,consent_at,consent_version,adult_confirmed,last_active) VALUES (?,?,?,?,1,?) ON CONFLICT(subject) DO UPDATE SET alias=excluded.alias,consent_at=excluded.consent_at,consent_version=excluded.consent_version,adult_confirmed=1,last_active=excluded.last_active",
          )
          .bind(user.userId, user.displayName, now, CONSENT_VERSION, now)
          .run();
      }

      const headers = new Headers();
      headers.append("Set-Cookie", await createSession(user.userId, request));
      return json(await sessionPayload(user), 201, headers);
    }

    if (action === "signin" && method === "POST") {
      protectMutation(request, 4096);
      const input = await body(request, 4096);
      const ipKey = await sha256Hex("in:" + clientBucket(request));
      await rate("auth:in:ip:" + ipKey.slice(0, 24), 40, 900_000);
      if (typeof input.email === "string") {
        const emailKey = await sha256Hex(
          "in-email:" + input.email.trim().toLowerCase(),
        );
        await rate("auth:in:em:" + emailKey.slice(0, 24), 15, 900_000);
      }

      const user = await authenticateEmailUser({
        email: input.email,
        password: input.password,
      });

      const headers = new Headers();
      headers.append("Set-Cookie", await createSession(user.userId, request));
      return json(await sessionPayload(user), 200, headers);
    }

    if (action === "signout" && method === "POST") {
      protectMutation(request, 1024);
      await revokeSessionFromRequest(request);
      const headers = new Headers();
      headers.append("Set-Cookie", clearSessionCookie(request));
      return json({ signedOut: true }, 200, headers);
    }

    if (action === "google" && method === "GET") {
      const oauth = getGoogleOAuthConfig();
      if (!oauth) {
        throw new HttpError(
          503,
          "Google sign-in is not configured on this deployment. Use email and password sign-in.",
        );
      }
      const state = randomToken(24);
      const verifier = randomToken(32);
      const challenge = await sha256Base64Url(verifier);
      const returnTo = safeRelativeReturnPath(
        url.searchParams.get("return_to"),
      );
      const redirectUri = `${url.origin}/api/auth/google/callback`;
      const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      target.searchParams.set("client_id", oauth.clientId);
      target.searchParams.set("redirect_uri", redirectUri);
      target.searchParams.set("response_type", "code");
      target.searchParams.set("scope", "openid email profile");
      target.searchParams.set("state", state);
      target.searchParams.set("code_challenge", challenge);
      target.searchParams.set("code_challenge_method", "S256");

      const headers = new Headers({
        Location: target.toString(),
        "Cache-Control": "private, no-store",
      });
      headers.append(
        "Set-Cookie",
        formatCookie(OAUTH_STATE_COOKIE, state, request, 600),
      );
      headers.append(
        "Set-Cookie",
        formatCookie(OAUTH_PKCE_COOKIE, verifier, request, 600),
      );
      headers.append(
        "Set-Cookie",
        formatCookie(
          OAUTH_RETURN_COOKIE,
          encodeURIComponent(returnTo),
          request,
          600,
        ),
      );
      return new Response(null, { status: 302, headers });
    }

    if (action === "google/callback" && method === "GET") {
      const oauth = getGoogleOAuthConfig();
      if (!oauth) {
        throw new HttpError(503, "Google sign-in is not configured.");
      }
      const jar = parseCookieHeader(request.headers.get("cookie"));
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (
        !code ||
        !state ||
        !jar[OAUTH_STATE_COOKIE] ||
        state !== jar[OAUTH_STATE_COOKIE] ||
        !jar[OAUTH_PKCE_COOKIE]
      ) {
        throw new HttpError(
          400,
          "Sign-in verification expired or did not match. Start again from Strategic Souls.",
        );
      }
      const redirectUri = `${url.origin}/api/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: jar[OAUTH_PKCE_COOKIE],
        }),
      });
      if (!tokenRes.ok) {
        throw new HttpError(502, "Google authentication could not be verified.");
      }
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        throw new HttpError(502, "Google authentication returned no token.");
      }
      const userRes = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        },
      );
      if (!userRes.ok) {
        throw new HttpError(502, "Google account profile could not be verified.");
      }
      const profile = (await userRes.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };
      if (!profile.sub || !profile.email || profile.email_verified !== true) {
        throw new HttpError(
          403,
          "A verified Google email address is required to sign in.",
        );
      }

      const user = await findOrCreateGoogleUser({
        sub: profile.sub,
        email: profile.email,
        name: profile.name,
      });
      let decodedReturn = "/";
      try {
        decodedReturn = safeRelativeReturnPath(
          decodeURIComponent(jar[OAUTH_RETURN_COOKIE] ?? "/"),
        );
      } catch {
        decodedReturn = "/";
      }
      const headers = new Headers({
        Location: decodedReturn,
        "Cache-Control": "private, no-store",
      });
      headers.append("Set-Cookie", await createSession(user.userId, request));
      headers.append(
        "Set-Cookie",
        formatCookie(OAUTH_STATE_COOKIE, "", request, 0),
      );
      headers.append(
        "Set-Cookie",
        formatCookie(OAUTH_PKCE_COOKIE, "", request, 0),
      );
      headers.append(
        "Set-Cookie",
        formatCookie(OAUTH_RETURN_COOKIE, "", request, 0),
      );
      return new Response(null, { status: 302, headers });
    }

    throw new HttpError(404, "Auth endpoint not found.");
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Auth operation failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      { error: "Authentication service is temporarily unavailable. Retry safely." },
      503,
    );
  }
}

export const GET = handle;
export const POST = handle;
