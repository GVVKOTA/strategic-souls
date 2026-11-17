import { env } from "cloudflare:workers";
import { HttpError, protectMutation, body } from "../../../../backend/middleware/security";
import {
  config,
  requiredConfig,
  backend,
  identity,
  rpc,
  read,
  cookie,
  cookies,
  sessionHeaders,
} from "../../../../backend/services/v3/supabase";
import {
  object,
  text,
  uuid,
  validateProfile,
  validateSoul,
  validateScan,
  moderate,
  handle as validHandle,
  sha256,
} from "../../../../backend/services/v3/model";
import { timestamp, sourceUrl } from "../../../../backend/services/legacy/notebook";
import { validateHolding } from "../../../../backend/services/legacy/research";
import { getChatGPTUser } from "../../../../backend/auth/chatgpt-auth";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200, headers?: Headers) => {
  const h = headers ?? new Headers();
  h.set("Cache-Control", "private, no-store");
  h.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { status, headers: h });
};
function random() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
function email(v: unknown) {
  const e = text(v, "Email", 254, 3).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new HttpError(400, "Enter a valid email address.");
  return e;
}
async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\/v3\//, ""),
      method = request.method;
    if (method !== "GET")
      protectMutation(request, path === "avatar" ? 262144 : 32768);
    const input =
        method === "GET"
          ? {}
          : await body(request, path === "avatar" ? 262144 : 32768),
      c = config();
    if (path === "health")
      return json({
        product: "Strategic Souls V3",
        backend: c ? "CONFIGURED_NOT_CERTIFIED" : "NOT_CONFIGURED",
        marketData: "NOT_CONFIGURED",
        publicPublishing: "DISABLED",
        worker: "SEPARATE_PROCESS",
        productionCutover: false,
      });
    if (path === "session" && method === "GET") {
      if (!c)
        return json({
          configured: false,
          authenticated: false,
          google: false,
          notice:
            "Independent sign-in and new research saving are not connected. Existing owner research remains available in the owner workspace.",
        });
      try {
        const who = await identity(request, c),
          profiles = (await read(
            c,
            who.token,
            "bodies",
            "id=eq." + who.id + "&limit=1",
          )) as unknown[],
          prefs = (await read(
            c,
            who.token,
            "notification_preferences",
            "body_id=eq." + who.id + "&limit=1",
          )) as unknown[];
        return json({
          configured: true,
          authenticated: true,
          id: who.id,
          profile: profiles[0] ?? null,
          preferences: prefs[0] ?? null,
          google: c.google,
        });
      } catch (e) {
        if (e instanceof HttpError && e.status === 401)
          return json({
            configured: true,
            authenticated: false,
            google: c.google,
          });
        throw e;
      }
    }
    const conf = requiredConfig();
    if (path === "auth/google" && method === "GET") {
      if (!conf.google)
        throw new HttpError(
          503,
          "Google sign-in needs an authorized OAuth client configuration.",
        );
      const verifier = random(),
        state = random(),
        challengeBytes = new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        );
      const challenge = btoa(String.fromCharCode(...challengeBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const redirect = url.origin + "/api/v3/auth/callback?state=" + state;
      const target = new URL(conf.url + "/auth/v1/authorize");
      target.search = new URLSearchParams({
        provider: "google",
        redirect_to: redirect,
        code_challenge: challenge,
        code_challenge_method: "s256",
      }).toString();
      const headers = new Headers({
        Location: target.href,
        "Cache-Control": "private, no-store",
      });
      headers.append("Set-Cookie", cookie("ss_pkce", verifier, request, 600));
      headers.append(
        "Set-Cookie",
        cookie("ss_oauth_state", state, request, 600),
      );
      return new Response(null, { status: 303, headers });
    }
    if (path === "auth/callback" && method === "GET") {
      const jar = cookies(request),
        state = url.searchParams.get("state"),
        code = url.searchParams.get("code");
      if (!code || !state || state !== jar.ss_oauth_state || !jar.ss_pkce)
        throw new HttpError(
          400,
          "Sign-in state expired or mismatched. Start sign-in again.",
        );
      const result = await backend(
        conf,
        "/auth/v1/token?grant_type=pkce",
        null,
        {
          method: "POST",
          body: JSON.stringify({
            auth_code: code,
            code_verifier: decodeURIComponent(jar.ss_pkce),
          }),
        },
      );
      const headers = sessionHeaders(result, request);
      headers.set("Location", "/workspace?view=profile");
      headers.append("Set-Cookie", cookie("ss_pkce", "", request, 0));
      headers.append("Set-Cookie", cookie("ss_oauth_state", "", request, 0));
      return new Response(null, { status: 303, headers });
    }
    if (path === "auth/email-code" && method === "POST") {
      const address = email(input.email);
      await backend(conf, "/auth/v1/otp", null, {
        method: "POST",
        body: JSON.stringify({ email: address, create_user: true }),
      });
      const h = new Headers();
      h.append("Set-Cookie", cookie("ss_pending_email", address, request, 600));
      return json(
        {
          sent: true,
          notice: conf.local
            ? "Check the local Mailpit inbox. No external email is sent by the local stack."
            : "If this address is eligible, a sign-in code will arrive shortly.",
        },
        200,
        h,
      );
    }
    if (path === "auth/verify" && method === "POST") {
      const pending = decodeURIComponent(
          cookies(request).ss_pending_email ?? "",
        ),
        token = text(input.code, "Code", 10, 6);
      if (
        !/^\d{6,10}$/.test(token) ||
        !pending ||
        email(input.email) !== pending
      )
        throw new HttpError(400, "Start a new email-code sign-in.");
      const result = await backend(conf, "/auth/v1/verify", null, {
        method: "POST",
        body: JSON.stringify({ email: pending, token, type: "email" }),
      });
      const h = sessionHeaders(result, request);
      h.append("Set-Cookie", cookie("ss_pending_email", "", request, 0));
      return json({ authenticated: true }, 200, h);
    }
    if (path === "auth/refresh" && method === "POST") {
      const refresh = decodeURIComponent(cookies(request).ss_refresh ?? "");
      if (!refresh) throw new HttpError(401, "Sign in again.");
      const result = await backend(
        conf,
        "/auth/v1/token?grant_type=refresh_token",
        null,
        { method: "POST", body: JSON.stringify({ refresh_token: refresh }) },
      );
      return json({ refreshed: true }, 200, sessionHeaders(result, request));
    }
    if (path === "auth/logout" && method === "POST") {
      const token = decodeURIComponent(cookies(request).ss_access ?? "");
      let revocationConfirmed = !token;
      if (token) {
        try {
          await backend(conf, "/auth/v1/logout?scope=global", token, {
            method: "POST",
          });
          revocationConfirmed = true;
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
        }
      }
      const h = new Headers();
      for (const name of [
        "ss_access",
        "ss_refresh",
        "ss_pkce",
        "ss_oauth_state",
        "ss_pending_email",
      ])
        h.append("Set-Cookie", cookie(name, "", request, 0));
      return json(
        {
          signedOut: true,
          revocationConfirmed,
          notice: revocationConfirmed
            ? "Refresh sessions revoked; short-lived JWTs already issued expire according to the Auth token lifetime."
            : "Browser session cleared. Server-wide revocation could not be confirmed; issued access tokens expire according to the Auth lifetime.",
        },
        200,
        h,
      );
    }
    const who = await identity(request, conf),
      operation = (name: string, p: Record<string, unknown>) =>
        rpc(conf, who.token, name, { p });
    if (path === "profile" && method === "POST")
      return json(
        await operation("save_profile", {
          ...validateProfile(input),
          adult: input.adult === true,
          privacy: input.privacy === true,
          terms: input.terms === true,
        }),
        201,
      );
    if (path === "avatar") {
      if (method === "GET") {
        const profiles = (await read(
          conf,
          who.token,
          "bodies",
          "id=eq." + who.id + "&select=avatar_path&limit=1",
        )) as { avatar_path: string | null }[];
        const path = profiles[0]?.avatar_path;
        if (!path || !path.startsWith(who.id + "/avatar-"))
          throw new HttpError(404, "Avatar not found.");
        const response = await fetch(
          conf.url + "/storage/v1/object/authenticated/v3-private/" + path,
          {
            headers: { apikey: conf.key, Authorization: "Bearer " + who.token },
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw new HttpError(404, "Avatar unavailable.");
        return new Response(response.body, {
          headers: {
            "Content-Type":
              response.headers.get("Content-Type") ??
              "application/octet-stream",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      const data = text(input.base64, "Image data", 180000, 4),
        mime = text(input.mime, "Image type", 20, 1);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data))
        throw new HttpError(400, "Invalid image encoding.");
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      } catch {
        throw new HttpError(400, "Invalid image encoding.");
      }
      if (bytes.length > 131072 || bytes.length < 12)
        throw new HttpError(400, "Use an image between 12 bytes and 128 KiB.");
      const valid =
        (mime === "image/png" &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) ||
        (mime === "image/jpeg" &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255) ||
        (mime === "image/webp" &&
          new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
          new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
      if (!valid)
        throw new HttpError(
          400,
          "Only PNG, JPEG and WebP image files are accepted.",
        );
      const hash = [
          ...new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer),
          ),
        ]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join(""),
        ext =
          mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp",
        path = who.id + "/avatar-" + hash + "." + ext;
      await backend(conf, "/storage/v1/object/v3-private/" + path, who.token, {
        method: "POST",
        headers: { "Content-Type": mime, "x-upsert": "true" },
        body: bytes.buffer as ArrayBuffer,
      });
      return json(await operation("set_avatar", { path }), 201);
    }
    if (path === "datasets" && method === "GET")
      return json(
        await operation("dataset_catalog", {
          teamId: url.searchParams.get("teamId")
            ? uuid(url.searchParams.get("teamId"))
            : null,
        }),
      );
    const resources: Record<string, string> = {
      holdings: "holdings",
      souls: "souls",
      versions: "soul_versions",
      events: "soul_events",
      teams: "teams",
      members: "memberships",
      scans: "scan_versions",
      comments: "comments",
      tasks: "research_tasks",
      activity: "audit_events",
      runs: "scan_runs",
      moderation: "moderation_cases",
    };
    if (path in resources && method === "GET") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
        throw new HttpError(400, "Invalid page.");
      let query =
        (path === "members"
          ? "order=created_at.desc,team_id.asc,body_id.asc"
          : "order=created_at.desc,id.desc") +
        "&limit=101&offset=" +
        offset;
      const soulId = url.searchParams.get("soulId"),
        teamId = url.searchParams.get("teamId");
      if (soulId && ["versions", "events", "comments", "tasks"].includes(path))
        query += "&soul_id=eq." + uuid(soulId);
      if (teamId && ["members", "activity"].includes(path))
        query += "&team_id=eq." + uuid(teamId);
      const rows = (await read(
        conf,
        who.token,
        resources[path],
        query,
      )) as unknown[];
      return json({
        rows: rows.slice(0, 100),
        nextOffset: rows.length > 100 ? offset + 100 : null,
        notice: "Access is rechecked in PostgreSQL for every read.",
      });
    }
    if (path === "holding-batch" && method === "POST") {
      if (
        !Array.isArray(input.rows) ||
        input.rows.length < 1 ||
        input.rows.length > 100
      )
        throw new HttpError(400, "Import 1–100 validated holdings.");
      let rows;
      try {
        rows = input.rows.map(validateHolding);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      return json(await operation("import_holdings", { rows }), 201);
    }
    if (path === "holding-archive" && method === "POST")
      return json(
        await operation("archive_holding", {
          id: uuid(input.id),
          restore: input.restore === true,
        }),
      );
    if (path === "soul" && method === "POST") {
      const payload = validateSoul(input.payload),
        teamId = input.teamId ? uuid(input.teamId) : null;
      const m = moderate(JSON.stringify(payload), teamId ? "TEAM" : "PRIVATE");
      if (m.decision === "REVIEW_REQUIRED") {
        await operation("record_moderation", m);
        return json(
          {
            error:
              "Team sharing needs review. Edit the highlighted content or save privately.",
            moderation: m,
          },
          422,
        );
      }
      return json(
        await operation("save_soul", {
          payload,
          teamId,
          soulId: input.soulId ? uuid(input.soulId) : null,
          expectedHead: input.expectedHead ? uuid(input.expectedHead) : null,
          requestId: uuid(input.requestId),
        }),
        201,
      );
    }
    if (path === "event" && method === "POST") {
      const type = text(input.type, "Event type", 24, 1),
        payload = object(input.payload ?? {});
      if (type === "REVIEW") {
        if (
          ![
            "RESOLVED_SUPPORTED",
            "RESOLVED_INVALIDATED",
            "INCONCLUSIVE",
          ].includes(String(payload.outcome))
        )
          throw new HttpError(400, "Choose a review outcome.");
        payload.versionId = uuid(payload.versionId);
        payload.note = text(payload.note, "Review reasoning", 2000, 10);
        payload.observedAt = timestamp(payload.observedAt, "Observed at");
        if (String(payload.observedAt) > new Date().toISOString())
          throw new HttpError(400, "Future observations cannot be reviewed.");
        payload.sourceUrl = sourceUrl(payload.sourceUrl);
      } else if (!["ARCHIVE", "RESTORE", "MERGE_DECISION"].includes(type))
        throw new HttpError(400, "Unknown event.");
      return json(
        await operation("append_event", {
          soulId: uuid(input.soulId),
          type,
          payload,
          requestId: uuid(input.requestId),
        }),
        201,
      );
    }
    if (path === "team" && method === "POST") {
      const slug = text(input.slug, "Slug", 40, 3).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug))
        throw new HttpError(
          400,
          "Use letters, digits and hyphens in the Team slug.",
        );
      return json(
        await operation("create_team", {
          name: text(input.name, "Team name", 80, 2),
          slug,
        }),
        201,
      );
    }
    if (path === "invite" && method === "POST") {
      if (
        !["ADMIN", "EDITOR", "REVIEWER", "VIEWER"].includes(String(input.role))
      )
        throw new HttpError(400, "Choose an invite role.");
      return json(
        await operation("invite", {
          teamId: uuid(input.teamId),
          role: input.role,
          handle: input.handle ? validHandle(input.handle) : null,
        }),
        201,
      );
    }
    if (path === "accept-invite" && method === "POST")
      return json(
        await operation("accept_invite", {
          token: text(input.token, "Invite token", 64, 64),
        }),
      );
    if (path === "revoke-invite" && method === "POST")
      return json(await operation("revoke_invite", { id: uuid(input.id) }));
    if (path === "member" && method === "POST") {
      if (
        input.action !== "remove" &&
        !["ADMIN", "EDITOR", "REVIEWER", "VIEWER"].includes(String(input.role))
      )
        throw new HttpError(400, "Choose a member role.");
      return json(
        await operation("manage_member", {
          teamId: uuid(input.teamId),
          bodyId: uuid(input.bodyId),
          role: input.role,
          action: input.action,
        }),
      );
    }
    if (path === "comment" && method === "POST")
      return json(
        await operation("comment", {
          soulId: uuid(input.soulId),
          content: text(input.content, "Comment", 2000, 1),
          requestId: uuid(input.requestId),
        }),
        201,
      );
    if (path === "task" && method === "POST")
      return json(
        await operation("task", {
          ...input,
          soulId: uuid(input.soulId),
          title: text(input.title ?? "Task", "Task", 160, 1),
          assigneeId: input.assigneeId ? uuid(input.assigneeId) : null,
        }),
        201,
      );
    if (path === "scan-version" && method === "POST")
      return json(
        await operation("save_scan", {
          ast: validateScan(input.ast),
          name: text(input.name, "Scan name", 100, 1),
          branch: text(input.branch ?? "main", "Branch", 60, 1),
          summary: text(input.summary, "Change summary", 500, 5),
          requestId: uuid(input.requestId),
          teamId: input.teamId ? uuid(input.teamId) : null,
          scanId: input.scanId ? uuid(input.scanId) : null,
          expectedHead: input.expectedHead ? uuid(input.expectedHead) : null,
          parentId: input.parentId ? uuid(input.parentId) : null,
        }),
        201,
      );
    if (path === "run" && method === "POST") {
      const e = env as unknown as Record<string, string | undefined>;
      if (e.V3_QUANT_ENABLED !== "1")
        throw new HttpError(
          503,
          "No authorized dataset and connected worker are configured. No backtest result or quota charge was created.",
        );
      return json(
        await operation("queue_run", {
          scanVersionId: uuid(input.scanVersionId),
          datasetVersionId: uuid(input.datasetVersionId),
          asOf: timestamp(input.asOf, "Research cutoff"),
          approved: input.approved === true,
          requestId: uuid(input.requestId),
        }),
        202,
      );
    }
    if (path === "publish")
      throw new HttpError(
        403,
        "Public publishing remains disabled pending qualified legal review, entitlements and owner authorization.",
      );
    if (path === "moderate" && method === "POST")
      return json(
        moderate(
          text(input.content, "Content", 10000),
          input.visibility === "TEAM"
            ? "TEAM"
            : input.visibility === "PUBLIC"
              ? "PUBLIC"
              : "PRIVATE",
        ),
      );
    if (path === "appeal" && method === "POST")
      return json(
        await operation("appeal", {
          id: uuid(input.id),
          appeal: text(input.appeal, "Appeal", 2000, 10),
        }),
      );
    if (path === "block" && method === "POST")
      return json(await operation("block", { bodyId: uuid(input.bodyId) }));
    if (path === "report" && method === "POST")
      return json(
        await operation("report", {
          resourceId: uuid(input.resourceId),
          reason: text(input.reason, "Report reason", 1000, 10),
        }),
      );
    if (path === "export" && method === "GET")
      return json(await rpc(conf, who.token, "export_account"));
    if (path === "export-team" && method === "POST")
      return json(
        await operation("export_team", { teamId: uuid(input.teamId) }),
      );
    if (path === "erase" && method === "POST") {
      if (input.confirmation !== "DELETE MY V3 DATA")
        throw new HttpError(400, "Type DELETE MY V3 DATA to confirm.");
      return json(
        await operation("erase_account", { confirmation: input.confirmation }),
      );
    }
    if (path === "handoff/issue" && method === "POST") {
      const e = env as unknown as Record<string, string | undefined>;
      if (
        e.V3_HANDOFF_ENABLED !== "1" ||
        !e.SUPABASE_HANDOFF_SERVICE_KEY ||
        !e.LEGACY_SITE_OWNER_SUBJECT
      )
        throw new HttpError(
          503,
          "Legacy handoff is disabled until the verified owner configuration is installed.",
        );
      const siteUser = await getChatGPTUser();
      if (!siteUser || siteUser.userId !== e.LEGACY_SITE_OWNER_SUBJECT)
        throw new HttpError(
          403,
          "The authenticated legacy Site owner must initiate this handoff.",
        );
      const token = random(),
        p = {
          tokenHash: await sha256(token),
          legacySubjectHash: await sha256(siteUser.userId),
        };
      await backend(
        { ...conf, key: e.SUPABASE_HANDOFF_SERVICE_KEY },
        "/rest/v1/rpc/v3_register_handoff",
        e.SUPABASE_HANDOFF_SERVICE_KEY,
        { method: "POST", body: JSON.stringify({ p }) },
      );
      return json({
        token,
        expiresInMinutes: 10,
        notice:
          "This links identities only. It does not move production data or cut over the Site.",
      });
    }
    if (path === "handoff/consume" && method === "POST")
      return json(
        await operation("consume_handoff", {
          token: text(input.token, "One-use handoff", 64, 64),
        }),
      );
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("V3 request failed", {
      type: e instanceof Error ? e.name : "Unknown",
    });
    return json(
      { error: "Service unavailable. No successful save is implied." },
      503,
    );
  }
}
export const GET = handler;
export const POST = handler;
