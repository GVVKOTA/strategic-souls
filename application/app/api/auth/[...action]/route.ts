import {
  authenticateEmailUser,
  changeUserPassword,
  clearSessionCookie,
  completePasswordReset,
  confirmEmailChange,
  createSession,
  getAuthenticatedUser,
  getEmailVerificationStatus,
  getSessionTokenHashFromRequest,
  listActiveSessions,
  registerEmailUser,
  requestEmailChange,
  requestPasswordReset,
  revokeOtherUserSessions,
  revokeSessionBySafeId,
  revokeSessionFromRequest,
  sha256Hex,
} from "../../../../backend/auth/session";
import { HttpError, body, protectMutation } from "../../../../backend/middleware/security";
import { RELEASE_GATES } from "../../../../backend/services/legacy/gates";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import { getSessionProfileMeta } from "../../../../backend/services/profile/profile";
import { account, database, rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";
const CONSENT_VERSION = "2026-11-14-v4";

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
      user: null,
      gates: RELEASE_GATES,
    };
  }
  const [current, meta] = await Promise.all([
    account(user.userId),
    getSessionProfileMeta(user.userId),
  ]);
  return {
    authenticated: true,
    accepted:
      !!current &&
      current.adult_confirmed === 1 &&
      current.consent_version === CONSENT_VERSION,
    alias: current?.alias ?? user.displayName,
    consentVersion: CONSENT_VERSION,
    isOwner: isDataOwner(user.userId),
    user: {
      displayName: current?.alias ?? user.displayName,
      email: user.email,
      authProvider: user.authProvider,
      avatarId: meta.avatarId,
      handle: meta.handle,
      bio: meta.bio,
      discoverable: meta.discoverable,
      legacyPrivateProfile: meta.legacyPrivateProfile,
      unreadNotifications: meta.unreadNotifications,
      genderSymbol: meta.genderSymbol,
      instagramHandle: meta.instagramHandle,
      bannerPresetId: meta.bannerPresetId,
      portfolioBackdrop: meta.portfolioBackdrop,
      defaultPostAudience: meta.defaultPostAudience,
      counts: meta.counts,
      preferences: meta.preferences,
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

      // Rotate out any prior session cookie stored in D1 before issuing a new token.
      await revokeSessionFromRequest(request);
      await database()
        .prepare("UPDATE accounts SET last_active = ? WHERE subject = ?")
        .bind(new Date().toISOString(), user.userId)
        .run();

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

    if (action === "change-password" && method === "POST") {
      protectMutation(request, 4096);
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, "Sign in to change your password.");
      const ipKey = await sha256Hex("cp:" + clientBucket(request));
      await rate("auth:cp:" + user.userId + ":" + ipKey.slice(0, 12), 10, 900_000);
      const input = await body(request, 4096);
      const { cookie } = await changeUserPassword(
        user.userId,
        input.currentPassword,
        input.newPassword,
        request,
      );
      const headers = new Headers();
      headers.append("Set-Cookie", cookie);
      return json(
        {
          ok: true,
          message: "Password updated and other active sessions signed out.",
        },
        200,
        headers,
      );
    }

    if (action === "forgot-password" && method === "POST") {
      protectMutation(request, 2048);
      const input = await body(request, 2048);
      const ipKey = await sha256Hex("fp:" + clientBucket(request));
      await rate("auth:fp:ip:" + ipKey.slice(0, 24), 10, 900_000);
      if (typeof input.email === "string") {
        const emKey = await sha256Hex("fp-em:" + input.email.trim().toLowerCase());
        await rate("auth:fp:em:" + emKey.slice(0, 24), 5, 900_000);
      }
      const result = await requestPasswordReset(input.email, url.origin);
      return json(result, 200);
    }

    if (action === "reset-password" && method === "POST") {
      protectMutation(request, 4096);
      const ipKey = await sha256Hex("rp:" + clientBucket(request));
      await rate("auth:rp:ip:" + ipKey.slice(0, 24), 15, 900_000);
      const input = await body(request, 4096);
      const result = await completePasswordReset(input.token, input.newPassword);
      const headers = new Headers();
      headers.append("Set-Cookie", clearSessionCookie(request));
      return json(
        {
          ok: true,
          ...result,
          message: "Password reset complete. Sign in with your new password.",
        },
        200,
        headers,
      );
    }

    if (action === "request-email-change" && method === "POST") {
      protectMutation(request, 4096);
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, "Sign in to update your email.");
      await rate("auth:emchg:" + user.userId, 6, 900_000);
      const input = await body(request, 4096);
      const result = await requestEmailChange(
        user.userId,
        input.currentPassword,
        input.newEmail,
        url.origin,
      );
      return json({ ok: true, ...result }, 200);
    }

    if (action === "confirm-email-change" && method === "POST") {
      protectMutation(request, 2048);
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, "Sign in to verify your email.");
      await rate("auth:emver:" + user.userId, 15, 900_000);
      const currentHash = await getSessionTokenHashFromRequest(request);
      const input = await body(request, 2048);
      const result = await confirmEmailChange(user.userId, input.token, currentHash);
      return json({ ok: true, ...result }, 200);
    }

    if (action === "sessions" && method === "GET") {
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, "Sign in to view active sessions.");
      const currentHash = await getSessionTokenHashFromRequest(request);
      const [sessions, emailStatus] = await Promise.all([
        listActiveSessions(user.userId, currentHash),
        getEmailVerificationStatus(user.userId, user.email),
      ]);
      return json({ sessions, emailStatus }, 200);
    }

    if (action === "sessions/revoke" && method === "POST") {
      protectMutation(request, 2048);
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, "Sign in to manage active sessions.");
      await rate("auth:srev:" + user.userId, 30, 900_000);
      const currentHash = await getSessionTokenHashFromRequest(request);
      const input = await body(request, 2048);
      if (input.allOthers === true) {
        const res = await revokeOtherUserSessions(user.userId, currentHash);
        return json({ ok: true, ...res }, 200);
      }
      const sessionId = String(input.sessionId ?? "");
      const res = await revokeSessionBySafeId(user.userId, sessionId, currentHash);
      const headers = new Headers();
      if (res.revokedCurrent) {
        headers.append("Set-Cookie", clearSessionCookie(request));
      }
      return json({ ok: true, ...res }, 200, headers);
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
