import { getAuthenticatedUser } from "../../../backend/auth/session";
import { assertAdultConsent, body, HttpError, protectMutation } from "../../../backend/middleware/security";
import { notificationHref, notificationTarget } from "../../../backend/services/community/notification-target";
import { listWebSouls } from "../../../backend/services/community/research-network";
import { account, database, rate } from "../../../database/queries/repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function handle(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new HttpError(401, "Sign in to view notifications.");
    const actor = await account(user.userId);
    assertAdultConsent(actor?.adult_confirmed === 1 && actor.consent_version === "2026-11-14-v4");
    await rate(user.userId + ":notice-center", 55, 60_000);
    const db = database();
    if (request.method === "GET") {
      const rows = await db.prepare(`SELECT id,kind,created_at createdAt,read_at readAt
        FROM x1_visible_notices WHERE subject=? ORDER BY created_at DESC,id DESC LIMIT 40`)
        .bind(user.userId).all();
      return Response.json({ notifications: rows.results }, { headers });
    }
    protectMutation(request, 2048);
    const { id } = await body(request, 2048);
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new HttpError(404, "Notification unavailable.");
    const notice = await db.prepare("SELECT kind,target_id,event_key FROM x1_visible_notices WHERE id=? AND subject=?")
      .bind(id, user.userId).first<{ kind: string; target_id: string; event_key: string }>();
    if (!notice) throw new HttpError(404, "Notification unavailable.");
    const target = notificationTarget(notice.kind, notice.target_id, notice.event_key);
    let authorized = !!target;
    if (target?.kind === "chat") {
      authorized = !!await db.prepare(`SELECT 1 FROM x2_conversations c WHERE c.id=? AND (c.first_subject=? OR c.second_subject=?)
        AND NOT EXISTS(SELECT 1 FROM x2_blocks b WHERE
          (b.subject=c.first_subject AND b.target=c.second_subject) OR (b.subject=c.second_subject AND b.target=c.first_subject))`)
        .bind(target.id, user.userId, user.userId).first();
    } else if (target?.kind === "soul") {
      authorized = (await listWebSouls(user.userId, { postId: target.id })).posts.length > 0;
    } else if (target?.kind === "profile") {
      authorized = !!await db.prepare(`SELECT 1 FROM x1_bodies p WHERE lower(p.handle)=lower(?) AND NOT EXISTS(
        SELECT 1 FROM x2_blocks b WHERE (b.subject=? AND b.target=p.subject) OR (b.subject=p.subject AND b.target=?))`)
        .bind(target.id, user.userId, user.userId).first();
    } else if (target?.kind === "room") {
      authorized = !!await db.prepare("SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=?")
        .bind(target.id, user.userId).first();
    } else if (target?.kind === "scan") {
      authorized = !!await db.prepare("SELECT 1 FROM x1_scans WHERE id=? AND subject=?").bind(target.id, user.userId).first();
    } else if (target?.kind === "alert") {
      authorized = !!await db.prepare("SELECT 1 FROM x1_price_alerts WHERE id=? AND subject=?").bind(target.id, user.userId).first();
    }
    const [, , remaining] = await db.batch([
      db.prepare("UPDATE x2_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND subject=?")
        .bind(new Date().toISOString(), id, user.userId),
      db.prepare("UPDATE x1_account_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND subject=?")
        .bind(new Date().toISOString(), id, user.userId),
      db.prepare("SELECT count(*) n FROM x1_visible_notices WHERE subject=? AND read_at IS NULL").bind(user.userId),
    ]);
    const unread = (remaining.results[0] as { n?: number } | undefined)?.n ?? 0;
    return Response.json({ href: authorized && target ? notificationHref(target) : null, unread }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Notifications are temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
export const GET = handle;
export const POST = handle;
