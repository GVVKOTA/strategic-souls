import {
  clearSessionCookie,
  getAuthenticatedUser,
} from "../../../backend/auth/session";
import { database, account, history, rate } from "../../../database/queries/repository";
import {
  HttpError,
  protectMutation,
  body,
  assertAdultConsent,
  DISABLED_FEATURES,
} from "../../../backend/middleware/security";
import {
  parseFormula,
  validateHolding,
  holdingKey,
  TIMEFRAMES,
} from "../../../backend/services/legacy/research";
import { RELEASE_GATES } from "../../../backend/services/legacy/gates";
import {
  notebookArchive,
  createNotebook,
  appendNotebookEvent,
} from "../../../database/queries/notebook-repository";
import { workspaceState } from "../../../backend/services/research/workspace";
import {
  exportCommunityData,
  communityPrivacyStatements,
} from "../../../backend/services/community/community";
import { exportSocial, socialEraseStatements } from "../../../backend/services/community/social";
export const dynamic = "force-dynamic";
const VERSION = "2026-11-14-v4";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const hash = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
async function records(subject: string) {
  const data = await database()
    .prepare(
      "SELECT id,kind,created_at,payload,digest FROM workspace_records WHERE subject=? ORDER BY created_at DESC LIMIT 1001",
    )
    .bind(subject)
    .all<{
      id: string;
      kind: string;
      created_at: string;
      payload: string;
      digest: string;
    }>();
  if (data.results.length > 1000)
    throw new HttpError(
      413,
      "Workspace exceeds the alpha export limit; a complete operator export is required.",
    );
  return data.results.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}
async function chartExport(subject: string) {
  const rows = await database()
    .prepare(
      "SELECT instrument_id,version,payload,updated_at FROM x2_chart_layouts WHERE subject=? ORDER BY instrument_id LIMIT 1001",
    )
    .bind(subject)
    .all();
  if (rows.results.length > 1000)
    throw new HttpError(
      413,
      "Chart layout export exceeds the bounded application export; a complete owner export is required.",
    );
  return rows.results;
}
async function handle(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user)
      throw new HttpError(
        401,
        "Sign in to use your private workspace.",
      );
    const subject = user.userId,
      path = new URL(request.url).pathname.replace(/^\/api\//, "");
    if (request.method !== "GET") protectMutation(request);
    if (DISABLED_FEATURES.has(path.split("/")[0]))
      throw new HttpError(
        403,
        "Feature gated pending provider, legal and owner approvals.",
      );
    await rate(subject + ":minute", 180, 60000);
    const current = await account(subject);
    if (path === "session" && request.method === "GET")
      return json({
        authenticated: true,
        accepted: !!current && current.consent_version === VERSION,
        alias: current?.alias ?? "Researcher",
        consentVersion: VERSION,
        gates: RELEASE_GATES,
      });
    const input =
      request.method === "GET"
        ? {}
        : await body(
            request,
            ["notebook", "notebook-event"].includes(path) ? 32768 : 4096,
          );
    if (path === "consent" && request.method === "POST") {
      if (
        input.adult !== true ||
        input.privacy !== true ||
        input.terms !== true
      )
        throw new HttpError(
          400,
          "Confirm age 18+, privacy and terms separately.",
        );
      await database()
        .prepare(
          "INSERT INTO accounts (subject,alias,consent_at,consent_version,adult_confirmed,last_active) VALUES (?,?,?,?,1,?) ON CONFLICT(subject) DO UPDATE SET consent_at=excluded.consent_at,consent_version=excluded.consent_version,adult_confirmed=1,last_active=excluded.last_active",
        )
        .bind(
          subject,
          "Researcher",
          new Date().toISOString(),
          VERSION,
          new Date().toISOString(),
        )
        .run();
      return json({ accepted: true });
    }
    // Privacy access and withdrawal remain available without accepting revised terms.
    const privacyControl =
      (path === "export" && request.method === "GET") ||
      (path === "erase" && request.method === "POST");
    if (!privacyControl)
      assertAdultConsent(
        !!current &&
          current.adult_confirmed === 1 &&
          current.consent_version === VERSION,
      );
    await database()
      .prepare("UPDATE accounts SET last_active=? WHERE subject=?")
      .bind(new Date().toISOString(), subject)
      .run();
    if (["scan", "outcome"].includes(path))
      throw new HttpError(
        503,
        "Live data unavailable — provider/entitlement not connected. No Soul created, no outcome invented and no quota charged.",
      );
    if (path === "notebooks" && request.method === "GET")
      return json(await notebookArchive(subject));
    if (path === "notebook" && request.method === "POST") {
      await rate(subject + ":notebook", 100, 86400000);
      return json({ soul: await createNotebook(subject, input.payload) }, 201);
    }
    if (path === "notebook-event" && request.method === "POST") {
      await rate(subject + ":review", 200, 86400000);
      return json(await appendNotebookEvent(subject, input), 201);
    }
    if (path === "workspace" && request.method === "GET")
      return json({
        records: await records(subject),
        legacyCount: (await history(subject)).length,
      });
    if (path === "souls" && request.method === "GET")
      return json({
        records: [],
        legacyCount: (await history(subject)).length,
        notice:
          "Legacy synthetic records preserved separately; excluded from research and performance.",
      });
    if (path === "save" && request.method === "POST") {
      const kind = String(input.kind);
      let payload: unknown, dedupe: string;
      if (kind === "strategy") {
        const p = input.payload as Record<string, unknown>;
        if (
          !p ||
          typeof p.name !== "string" ||
          p.name.trim().length < 1 ||
          p.name.length > 80 ||
          typeof p.formula !== "string" ||
          typeof p.thesis !== "string" ||
          p.thesis.length > 1000 ||
          typeof p.instrument !== "string" ||
          !p.instrument.trim() ||
          p.instrument.length > 50 ||
          !TIMEFRAMES.includes(String(p.timeframe))
        )
          throw new HttpError(400, "Invalid strategy fields.");
        let parsed;
        try {
          parsed = parseFormula(p.formula);
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        payload = {
          name: p.name.trim(),
          formula: p.formula,
          thesis: p.thesis,
          instrument: p.instrument.trim(),
          timeframe: p.timeframe,
          ...parsed,
          status: "DRAFT_UNVALIDATED",
          dataFingerprint: null,
          aggregateConsent: false,
        };
        dedupe = await hash(payload);
      } else if (kind === "holding") {
        try {
          payload = validateHolding(input.payload);
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        dedupe = await hash(
          holdingKey(payload as ReturnType<typeof validateHolding>),
        );
      } else if (kind === "note") {
        const p = input.payload as { text?: unknown };
        if (
          !p ||
          typeof p.text !== "string" ||
          !p.text.trim() ||
          p.text.length > 2000
        )
          throw new HttpError(
            400,
            "Private note must contain 1–2,000 characters.",
          );
        payload = { text: p.text.trim(), visibility: "PRIVATE_DRAFT" };
        dedupe = await hash(payload);
      } else throw new HttpError(400, "Unsupported record kind.");
      await rate(subject + ":save", 200, 86400000);
      const id = crypto.randomUUID();
      await database()
        .prepare(
          "INSERT OR IGNORE INTO workspace_records (id,subject,kind,created_at,payload,digest,dedupe_key) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          subject,
          kind,
          new Date().toISOString(),
          JSON.stringify(payload),
          await hash(payload),
          dedupe,
        )
        .run();
      return json({ saved: true, records: await records(subject) }, 201);
    }
    if (path === "remove" && request.method === "POST") {
      if (typeof input.id !== "string")
        throw new HttpError(400, "Record ID required.");
      const result = await database()
        .prepare(
          "DELETE FROM workspace_records WHERE id=? AND subject=? AND kind IN ('holding','note')",
        )
        .bind(input.id, subject)
        .run();
      if (!result.meta.changes)
        throw new HttpError(
          404,
          "Record not found or immutable strategy version.",
        );
      return json({ removed: true });
    }
    if (path === "profile" && request.method === "POST") {
      if (
        typeof input.alias !== "string" ||
        !input.alias.trim() ||
        input.alias.length > 40
      )
        throw new HttpError(400, "Name must contain 1–40 characters.");
      await database()
        .prepare("UPDATE accounts SET alias=? WHERE subject=?")
        .bind(input.alias.trim(), subject)
        .run();
      return json({ saved: true });
    }
    if (path === "support" && request.method === "POST") {
      if (
        !["privacy", "correction", "grievance", "security", "general"].includes(
          String(input.category),
        ) ||
        typeof input.message !== "string" ||
        input.message.trim().length < 5 ||
        input.message.length > 1000
      )
        throw new HttpError(400, "Enter a category and 5–1,000 characters.");
      await rate(subject + ":support", 5, 86400000);
      const id = crypto.randomUUID();
      await database()
        .prepare(
          "INSERT INTO support_requests (id,subject,category,message,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(
          id,
          subject,
          input.category,
          input.message.trim(),
          new Date().toISOString(),
        )
        .run();
      return json(
        {
          id,
          notice:
            "Recorded privately. No email sent; staffed grievance service awaiting setup.",
        },
        201,
      );
    }
    if (path === "export" && request.method === "GET") {
      // These owner-scoped reads are independent. Avoid one network roundtrip
      // chain across every feature; any failed component still rejects export.
      const [
        notebooks,
        workspace,
        x1Workspace,
        community,
        social,
        chartLayouts,
        legacySyntheticArchive,
        requests,
      ] = await Promise.all([
        notebookArchive(subject),
        records(subject),
        workspaceState(subject, { includeSnapshots: true }),
        exportCommunityData(subject),
        exportSocial(subject),
        chartExport(subject),
        history(subject),
        database()
          .prepare(
            "SELECT id,category,message,created_at FROM support_requests WHERE subject=?",
          )
          .bind(subject)
          .all(),
      ]);
      return json({
        account: current,
        notebooks,
        workspace,
        x1Workspace,
        community,
        social,
        chartLayouts,
        legacySyntheticArchive,
        requests: requests.results,
        notice:
          "Legacy synthetic archive is not market evidence. Export is private user data, not a research report.",
      });
    }
    if (path === "erase" && request.method === "POST") {
      if (input.confirmation !== "DELETE MY DATA")
        throw new HttpError(400, "Exact deletion confirmation required.");
      const db = database();
      const ownedGroups = await db
        .prepare("SELECT count(*) n FROM x1_groups WHERE owner_subject=?")
        .bind(subject)
        .first<{ n: number }>();
      if (
        (ownedGroups?.n || 0) > 0 &&
        input.confirmSharedGroupDeletion !== true
      )
        throw new HttpError(
          400,
          "This account owns private group workspaces. Transfer their ownership first, or explicitly confirm shared group deletion as a separate acknowledgement.",
        );
      const sharedConversations = await db
        .prepare(
          "SELECT count(*) n FROM x2_conversations WHERE first_subject=? OR second_subject=?",
        )
        .bind(subject, subject)
        .first<{ n: number }>();
      if (
        (sharedConversations?.n || 0) > 0 &&
        input.confirmSharedConversationDeletion !== true
      )
        throw new HttpError(
          400,
          "This account participates in private conversations. Deleting this account also removes the paired conversations and participant copies. Confirm shared-conversation deletion separately, or export before continuing.",
        );
      await db.batch([
        ...socialEraseStatements(subject),
        db
          .prepare("DELETE FROM x2_chart_layouts WHERE subject=?")
          .bind(subject),
        ...communityPrivacyStatements(subject),
        db
          .prepare(
            "DELETE FROM notebook_events WHERE soul_id IN (SELECT id FROM notebook_souls WHERE subject=?)",
          )
          .bind(subject),
        db.prepare("DELETE FROM notebook_souls WHERE subject=?").bind(subject),
        db
          .prepare("DELETE FROM workspace_records WHERE subject=?")
          .bind(subject),
        db.prepare("DELETE FROM ownership WHERE subject=?").bind(subject),
        db
          .prepare("DELETE FROM support_requests WHERE subject=?")
          .bind(subject),
        db.prepare("DELETE FROM accounts WHERE subject=?").bind(subject),
        db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(subject),
        db.prepare("DELETE FROM auth_users WHERE id=?").bind(subject),
        db
          .prepare("DELETE FROM rate_limits WHERE key LIKE ?")
          .bind(subject + ":%"),
      ]);
      return Response.json(
        {
          erased: true,
          notice:
            "Personal app records, account credentials, sessions and ownership links deleted. Unlinked legacy synthetic originals and platform backups follow separate retention.",
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Set-Cookie": clearSessionCookie(request),
          },
        },
      );
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("Strategic Souls operation failed", {
      type: e instanceof Error ? e.name : "Unknown",
    });
    return json(
      {
        error:
          "Service unavailable. No successful save is implied; retry safely.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
