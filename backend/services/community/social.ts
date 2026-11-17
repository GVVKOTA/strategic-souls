import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { bodyHandle, field, id } from "./community-model";
import { mutateCommunity } from "./community";

type Profile = {
  subject: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar: string;
};
type Conversation = {
  id: string;
  first_subject: string;
  second_subject: string;
  requested_by: string;
  state: string;
  created_at: string;
  updated_at: string;
};
type Message = {
  id: string;
  conversation_id: string;
  sender: string;
  content: string;
  request_key: string;
  reference_soul: string | null;
  reference_revision: number | null;
  created_at: string;
  edited_at: string | null;
  retracted_at: string | null;
  version: number;
};
const now = () => new Date().toISOString();
const missing = () => new HttpError(404, "Research item not found.");
const defaults = {
  discoverable: false,
  messages: "REQUESTS",
  receipts: false,
  notifications: true,
};
const ownBody = (subject: string) =>
  database()
    .prepare(
      "SELECT subject,handle,display_name,bio,avatar FROM x1_bodies WHERE subject=?",
    )
    .bind(subject)
    .first<Profile>();
const publicBody = (p: Profile) => ({
  handle: p.handle,
  displayName: p.display_name,
  bio: p.bio,
  avatar: p.avatar,
});
const blockedSQL = (viewer: string, target: string) =>
  database()
    .prepare(
      "SELECT 1 AS yes FROM x2_blocks WHERE (subject=? AND target=?) OR (subject=? AND target=?)",
    )
    .bind(viewer, target, target, viewer)
    .first();
const query = async <T = Record<string, unknown>>(
  sql: string,
  ...args: (string | number | null)[]
) =>
  (
    await database()
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
const requestKey = (value: unknown) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(value))
    throw new HttpError(400, "A stable request ID is required.");
  return value;
};
const boolean = (v: unknown, label: string) => {
  if (typeof v !== "boolean")
    throw new HttpError(400, label + " must be true or false.");
  return v;
};
const cursor = (v: string | null) => {
  if (!v) return "9999";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-zA-Z0-9_-]{1,80}$/.test(
      v,
    )
  )
    throw new HttpError(400, "Invalid page cursor.");
  return v;
};
async function preferences(subject: string) {
  const row = await database()
    .prepare(
      "SELECT discoverable,messages,receipts,notifications FROM x2_social_preferences WHERE subject=?",
    )
    .bind(subject)
    .first<{
      discoverable: number;
      messages: string;
      receipts: number;
      notifications: number;
    }>();
  return row
    ? {
        discoverable: !!row.discoverable,
        messages: row.messages,
        receipts: !!row.receipts,
        notifications: !!row.notifications,
      }
    : defaults;
}
async function requireBody(subject: string) {
  const p = await ownBody(subject),
    a = await account(subject);
  if (
    !p ||
    !a ||
    a.adult_confirmed !== 1 ||
    a.consent_version !== "2026-11-14-v4"
  )
    throw new HttpError(
      403,
      "Create your Body and accept the current notices before using the research network.",
    );
  return p;
}
async function resolveBody(
  subject: string,
  value: unknown,
  discoverOnly = false,
): Promise<Profile> {
  const handle = bodyHandle(value),
    p = await database()
      .prepare(
        "SELECT subject,handle,display_name,bio,avatar FROM x1_bodies WHERE handle=?",
      )
      .bind(handle)
      .first<Profile>();
  if (!p || (await blockedSQL(subject, p.subject))) throw missing();
  if (p.subject === subject) return p;
  const prefs = await preferences(p.subject);
  if (prefs.discoverable) return p;
  if (
    !discoverOnly &&
    (await database()
      .prepare(
        "SELECT 1 FROM x1_memberships a JOIN x1_memberships b ON b.group_id=a.group_id WHERE a.subject=? AND b.subject=? LIMIT 1",
      )
      .bind(subject, p.subject)
      .first())
  )
    return p;
  throw missing();
}
async function member(subject: string, groupId: unknown, admin = false) {
  const group = id(groupId, "Group");
  const row = await database()
    .prepare(
      "SELECT m.role,g.id,g.name FROM x1_memberships m JOIN x1_groups g ON g.id=m.group_id WHERE m.subject=? AND m.group_id=?",
    )
    .bind(subject, group)
    .first<{ role: string; id: string; name: string }>();
  if (!row) throw missing();
  if (admin && !["OWNER", "ADMIN"].includes(row.role))
    throw new HttpError(
      403,
      "Only group administrators can manage this setting.",
    );
  return row;
}
async function soul(subject: string, soulId: unknown, revision?: number) {
  const sid = id(soulId, "Soul");
  const row = await database()
    .prepare(
      "SELECT s.id,s.group_id AS groupId,r.revision,r.title,r.formula,r.summary,r.author_handle AS authorHandle,r.created_at AS createdAt FROM x1_group_souls s JOIN x1_soul_revisions r ON r.soul_id=s.id AND r.revision=COALESCE(?,s.revision) JOIN x1_memberships m ON m.group_id=s.group_id WHERE s.id=? AND m.subject=?",
    )
    .bind(revision ?? null, sid, subject)
    .first<Record<string, unknown>>();
  if (!row) throw missing();
  return row;
}
async function thread(subject: string, value: unknown) {
  const c = await database()
    .prepare(
      "SELECT * FROM x2_conversations WHERE id=? AND (first_subject=? OR second_subject=?)",
    )
    .bind(id(value, "Conversation"), subject, subject)
    .first<Conversation>();
  if (!c) throw missing();
  return c;
}
const peer = (c: Conversation, s: string) =>
  c.first_subject === s ? c.second_subject : c.first_subject;
async function notification(
  subject: string,
  kind: string,
  targetId: string,
  eventKey: string,
) {
  await database()
    .prepare(
      "INSERT OR IGNORE INTO x2_notifications (id,subject,kind,target_id,event_key,created_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT notifications FROM x2_social_preferences WHERE subject=?),1)=1",
    )
    .bind(
      crypto.randomUUID(),
      subject,
      kind,
      targetId,
      eventKey,
      now(),
      subject,
    )
    .run();
}
const searchFilter = `NOT EXISTS (SELECT 1 FROM x2_blocks z WHERE (z.subject=? AND z.target=b.subject) OR (z.subject=b.subject AND z.target=?))`;

export async function searchSocial(
  subject: string,
  search: string,
  kind = "all",
  before?: string | null,
) {
  const q = search.trim().replace(/^@/, "").toLowerCase();
  if (q.length > 80) throw new HttpError(400, "Search at most 80 characters.");
  if (!["all", "bodies", "groups", "souls"].includes(kind))
    throw new HttpError(400, "Choose a valid research search type.");
  const after = before ?? "";
  if (after.length > 100) throw new HttpError(400, "Invalid search cursor.");
  if (!(await ownBody(subject)) || !q)
    return { bodies: [], groups: [], souls: [], nextBody: null };
  const pattern = "%" + q.replace(/[!%_]/g, "!$&") + "%";
  const bodies = ["all", "bodies"].includes(kind)
    ? await query<Profile>(
        `SELECT b.subject,b.handle,b.display_name,b.bio,b.avatar FROM x1_bodies b JOIN x2_social_preferences p ON p.subject=b.subject WHERE p.discoverable=1 AND b.handle>? AND (b.handle LIKE ? ESCAPE '!' OR lower(b.display_name) LIKE ? ESCAPE '!') AND ${searchFilter} ORDER BY b.handle LIMIT 21`,
        after,
        pattern,
        pattern,
        subject,
        subject,
      )
    : [];
  const groups = ["all", "groups"].includes(kind)
    ? await query(
        `SELECT g.id,g.name,g.description,d.handle,EXISTS(SELECT 1 FROM x1_memberships m WHERE m.group_id=g.id AND m.subject=?) AS joined FROM x1_groups g JOIN x2_group_directory d ON d.group_id=g.id WHERE d.discoverable=1 AND (lower(g.name) LIKE ? ESCAPE '!' OR d.handle LIKE ? ESCAPE '!') AND NOT EXISTS(SELECT 1 FROM x2_blocks z WHERE (z.subject=? AND z.target=g.owner_subject) OR (z.subject=g.owner_subject AND z.target=?)) ORDER BY d.handle LIMIT 20`,
        subject,
        pattern,
        pattern,
        subject,
        subject,
      )
    : [];
  // Soul discovery is constrained to current membership; directory visibility never grants content access.
  const souls = ["all", "souls"].includes(kind)
    ? await query(
        `SELECT s.id,s.group_id AS groupId,s.revision,r.title,r.summary,r.author_handle AS authorHandle FROM x1_group_souls s JOIN x1_soul_revisions r ON r.id=s.revision_id JOIN x1_memberships m ON m.group_id=s.group_id WHERE m.subject=? AND (lower(r.title) LIKE ? ESCAPE '!' OR lower(r.summary) LIKE ? ESCAPE '!') ORDER BY s.updated_at DESC,s.id LIMIT 20`,
        subject,
        pattern,
        pattern,
      )
    : [];
  return {
    bodies: bodies.slice(0, 20).map(publicBody),
    groups,
    souls,
    nextBody: bodies.length > 20 ? bodies[19].handle : null,
  };
}
async function inbox(subject: string, q = "") {
  if (q.length > 80) throw new HttpError(400, "Search at most 80 characters.");
  return query(
    `SELECT c.id,c.state,c.created_at AS createdAt,c.updated_at AS updatedAt,b.handle,b.display_name AS displayName,b.avatar,(c.requested_by=?) AS requestedByMe,COALESCE(v.muted,0) AS muted,COALESCE(v.hidden,0) AS hidden,(SELECT count(*) FROM x2_messages x WHERE x.conversation_id=c.id AND x.sender<>? AND x.created_at>COALESCE(v.read_at,'')) AS unread FROM x2_conversations c JOIN x1_bodies b ON b.subject=CASE WHEN c.first_subject=? THEN c.second_subject ELSE c.first_subject END LEFT JOIN x2_conversation_views v ON v.conversation_id=c.id AND v.subject=? WHERE (c.first_subject=? OR c.second_subject=?) AND COALESCE(v.hidden,0)=0 AND ${searchFilter} AND (b.handle LIKE ? ESCAPE '!' OR lower(b.display_name) LIKE ? ESCAPE '!') ORDER BY c.updated_at DESC,c.id LIMIT 50`,
    subject,
    subject,
    subject,
    subject,
    subject,
    subject,
    subject,
    subject,
    "%" + q.replace(/[!%_]/g, "!$&").toLowerCase() + "%",
    "%" + q.replace(/[!%_]/g, "!$&").toLowerCase() + "%",
  );
}
async function invitationInbox(subject: string, handle: string) {
  return query(
    `SELECT i.id,g.id AS groupId,g.name,i.role,i.expires_at AS expiresAt,i.created_at AS createdAt FROM x1_invitations i JOIN x1_groups g ON g.id=i.group_id WHERE i.invited_handle=? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND NOT EXISTS(SELECT 1 FROM x2_blocks z WHERE (z.subject=? AND z.target=i.created_by) OR (z.subject=i.created_by AND z.target=?)) ORDER BY i.created_at DESC LIMIT 30`,
    handle,
    now(),
    subject,
    subject,
  );
}
async function threadView(subject: string, params: URLSearchParams) {
  const c = await thread(subject, params.get("threadId")),
    other = peer(c, subject);
  if (await blockedSQL(subject, other)) throw missing();
  const p = await ownBody(other);
  if (!p) throw missing();
  const messages = await query<Message & { authorHandle: string }>(
    `SELECT x.*,b.handle AS authorHandle FROM x2_messages x JOIN x1_bodies b ON b.subject=x.sender WHERE x.conversation_id=? AND (x.created_at||'|'||x.id)<? ORDER BY x.created_at DESC,x.id DESC LIMIT 41`,
    c.id,
    cursor(params.get("before")),
  );
  const page = messages.slice(0, 40),
    prefs = await preferences(other),
    otherView = await database()
      .prepare(
        "SELECT read_at FROM x2_conversation_views WHERE conversation_id=? AND subject=?",
      )
      .bind(c.id, other)
      .first<{ read_at: string | null }>();
  const projected = await Promise.all(
    page.map(async (m) => {
      let reference = null;
      if (m.reference_soul && !m.retracted_at) {
        try {
          reference = await soul(
            subject,
            m.reference_soul,
            m.reference_revision ?? undefined,
          );
        } catch {
          reference = { unavailable: true };
        }
      }
      return {
        id: m.id,
        text: m.content,
        authorHandle: m.authorHandle,
        isMine: m.sender === subject,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        retractedAt: m.retracted_at,
        version: m.version,
        reference,
        status: m.retracted_at
          ? "RETRACTED"
          : m.sender !== subject
            ? "RECEIVED"
            : prefs.receipts &&
                otherView?.read_at &&
                otherView.read_at >= m.created_at
              ? "READ"
              : "SENT_TO_SERVER",
      };
    }),
  );
  const views = await database()
    .prepare(
      "SELECT muted,hidden FROM x2_conversation_views WHERE conversation_id=? AND subject=?",
    )
    .bind(c.id, subject)
    .first();
  return {
    id: c.id,
    state: c.state,
    requestedByMe: c.requested_by === subject,
    peer: publicBody(p),
    preferences: views ?? { muted: 0, hidden: 0 },
    messages: projected.reverse(),
    nextBefore:
      messages.length > 40 ? page[39].created_at + "|" + page[39].id : null,
  };
}
async function groupView(subject: string, params: URLSearchParams) {
  const g = await member(subject, params.get("groupId")),
    settings = await database()
      .prepare(
        "SELECT handle,discoverable,pinned_soul AS pinnedSoul FROM x2_group_directory WHERE group_id=?",
      )
      .bind(g.id)
      .first();
  const rows = await query(
    `SELECT d.id,d.parent_id AS parentId,d.content AS text,d.source_url AS sourceUrl,d.source_as_of AS sourceAsOf,d.created_at AS createdAt,d.deleted_at AS deletedAt,b.handle AS authorHandle,(d.author=?) AS isMine FROM x2_discussions d JOIN x1_bodies b ON b.subject=d.author WHERE d.group_id=? AND (d.created_at||'|'||d.id)<? ORDER BY d.created_at DESC,d.id DESC LIMIT 41`,
    subject,
    g.id,
    cursor(params.get("before")),
  );
  const page = rows.slice(0, 40);
  const requests = ["OWNER", "ADMIN"].includes(g.role)
    ? await query(
        "SELECT b.handle,b.display_name AS displayName,r.created_at AS createdAt FROM x2_join_requests r JOIN x1_bodies b ON b.subject=r.subject WHERE r.group_id=? AND r.state='PENDING' ORDER BY r.created_at LIMIT 30",
        g.id,
      )
    : [];
  return {
    group: g,
    settings,
    discussions: page.reverse(),
    requests,
    nextBefore:
      rows.length > 40 ? String(rows[39].createdAt) + "|" + rows[39].id : null,
  };
}

export async function getSocial(
  subject: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const p = await ownBody(subject),
    view = params.get("view") || "home";
  if (view === "search")
    return searchSocial(
      subject,
      params.get("q") || "",
      params.get("kind") || "all",
      params.get("before"),
    );
  if (!p)
    return {
      body: null,
      preferences: defaults,
      inbox: [],
      invitations: [],
      notifications: [],
      bookmarks: [],
      blocked: [],
    };
  await requireBody(subject);
  if (view === "thread") return threadView(subject, params);
  if (view === "inbox")
    return { inbox: await inbox(subject, params.get("q") || "") };
  if (view === "group") return groupView(subject, params);
  if (view === "profile") {
    const target = await resolveBody(subject, params.get("handle"));
    const groups = await query(
      "SELECT g.id,g.name,m.role FROM x1_memberships m JOIN x1_groups g ON g.id=m.group_id WHERE m.subject=? AND EXISTS(SELECT 1 FROM x1_memberships own WHERE own.group_id=g.id AND own.subject=?) LIMIT 30",
      target.subject,
      subject,
    );
    const souls = await query(
      "SELECT s.id,s.group_id AS groupId,s.revision,r.title,r.summary,r.author_handle AS authorHandle FROM x1_group_souls s JOIN x1_soul_revisions r ON r.id=s.revision_id WHERE r.author_subject=? AND EXISTS(SELECT 1 FROM x1_memberships m WHERE m.group_id=s.group_id AND m.subject=?) LIMIT 30",
      target.subject,
      subject,
    );
    return {
      body: publicBody(target),
      isMe: target.subject === subject,
      canMessage:
        target.subject !== subject &&
        (await preferences(target.subject)).messages !== "NONE",
      groups,
      souls,
    };
  }
  const notices = await query(
    "SELECT id,kind,target_id AS targetId,created_at AS createdAt,read_at AS readAt FROM x2_notifications WHERE subject=? ORDER BY created_at DESC,id DESC LIMIT 50",
    subject,
  );
  const blocks = await query(
    "SELECT b.handle,b.display_name AS displayName FROM x2_blocks z JOIN x1_bodies b ON b.subject=z.target WHERE z.subject=? ORDER BY b.handle LIMIT 100",
    subject,
  );
  const marks = await query<{
    kind: string;
    target_id: string;
    created_at: string;
  }>(
    "SELECT kind,target_id,created_at FROM x2_bookmarks WHERE subject=? ORDER BY created_at DESC LIMIT 100",
    subject,
  );
  const bookmarks = [];
  for (const mark of marks) {
    try {
      bookmarks.push({
        kind: mark.kind,
        createdAt: mark.created_at,
        ...(mark.kind === "BODY"
          ? { body: publicBody(await resolveBody(subject, mark.target_id)) }
          : { soul: await soul(subject, mark.target_id) }),
      });
    } catch {
      /* Revoked/opted-out content is not exposed by a stale bookmark. */
    }
  }
  return {
    body: publicBody(p),
    preferences: await preferences(subject),
    inbox: await inbox(subject),
    groups: await query(
      "SELECT g.id,g.name,m.role FROM x1_groups g JOIN x1_memberships m ON m.group_id=g.id WHERE m.subject=? ORDER BY g.name LIMIT 30",
      subject,
    ),
    invitations: await invitationInbox(subject, p.handle),
    notifications: notices,
    bookmarks,
    blocked: blocks,
  };
}

export async function mutateSocial(
  subject: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const p = await requireBody(subject),
    db = database(),
    time = now();
  await rate(subject + ":x2-social-write", 60, 60000);
  if (input.action === "invite-body") {
    await resolveBody(subject, input.handle);
    const result = await mutateCommunity(subject, {
      action: "invite",
      groupId: input.groupId,
      handle: input.handle,
      role: "VIEWER",
    });
    return {
      invitationId: result.invitationId,
      expiresAt: result.expiresAt,
      invitedHandle: result.invitedHandle,
    };
  }
  if (input.action === "remove-member") {
    const g = await member(subject, input.groupId, true),
      handle = bodyHandle(input.handle);
    const result = await db
      .prepare(
        `DELETE FROM x1_memberships WHERE group_id=? AND subject IN (SELECT subject FROM x1_bodies WHERE handle=?) AND role<>'OWNER' AND EXISTS(SELECT 1 FROM x1_memberships actor WHERE actor.group_id=? AND actor.subject=? AND (actor.role='OWNER' OR (actor.role='ADMIN' AND x1_memberships.role<>'ADMIN')))`,
      )
      .bind(g.id, handle, g.id, subject)
      .run();
    if (!result.meta.changes) throw missing();
    return { saved: true };
  }
  if (input.action === "preferences") {
    const discoverable = boolean(input.discoverable, "Discoverability"),
      receipts = boolean(input.receipts, "Read receipts"),
      notifications = boolean(input.notifications, "Notifications");
    if (!["REQUESTS", "GROUPS", "NONE"].includes(String(input.messages)))
      throw new HttpError(
        400,
        "Choose requests, shared groups, or no new messages.",
      );
    await db
      .prepare(
        "INSERT INTO x2_social_preferences (subject,discoverable,messages,receipts,notifications,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET discoverable=excluded.discoverable,messages=excluded.messages,receipts=excluded.receipts,notifications=excluded.notifications,updated_at=excluded.updated_at",
      )
      .bind(
        subject,
        +discoverable,
        String(input.messages),
        +receipts,
        +notifications,
        time,
      )
      .run();
    return { saved: true };
  }
  if (input.action === "block") {
    const handle = bodyHandle(input.handle),
      target = await db
        .prepare("SELECT subject FROM x1_bodies WHERE handle=?")
        .bind(handle)
        .first<{ subject: string }>();
    if (!target) {
      if (input.active === false) return { saved: true };
      throw missing();
    }
    if (target.subject === subject) throw missing();
    if (boolean(input.active, "Block state")) {
      // A target must be discoverable or already known through a thread/group. Do not turn blocking into an existence oracle.
      const existingThread = await db
        .prepare(
          "SELECT 1 FROM x2_conversations WHERE (first_subject=? AND second_subject=?) OR (first_subject=? AND second_subject=?)",
        )
        .bind(subject, target.subject, target.subject, subject)
        .first();
      if (!existingThread) await resolveBody(subject, handle);
      await db
        .prepare(
          "INSERT OR IGNORE INTO x2_blocks (subject,target,created_at) VALUES (?,?,?)",
        )
        .bind(subject, target.subject, time)
        .run();
    } else
      await db
        .prepare("DELETE FROM x2_blocks WHERE subject=? AND target=?")
        .bind(subject, target.subject)
        .run();
    return { saved: true };
  }
  if (input.action === "start-thread") {
    const target = await resolveBody(subject, input.handle),
      prefs = await preferences(target.subject);
    if (target.subject === subject)
      throw new HttpError(400, "Choose another Body.");
    if (prefs.messages === "NONE") throw missing();
    const shared = !!(await db
      .prepare(
        "SELECT 1 FROM x1_memberships a JOIN x1_memberships b ON b.group_id=a.group_id WHERE a.subject=? AND b.subject=? LIMIT 1",
      )
      .bind(subject, target.subject)
      .first());
    if (prefs.messages === "GROUPS" && !shared) throw missing();
    const pair = [subject, target.subject].sort(),
      cid = crypto.randomUUID();
    await db
      .prepare(
        "INSERT OR IGNORE INTO x2_conversations (id,first_subject,second_subject,requested_by,state,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM x2_conversations WHERE first_subject=? OR second_subject=?)<100",
      )
      .bind(
        cid,
        pair[0],
        pair[1],
        subject,
        shared ? "ACTIVE" : "REQUESTED",
        time,
        time,
        subject,
        subject,
      )
      .run();
    const c = await db
      .prepare(
        "SELECT * FROM x2_conversations WHERE first_subject=? AND second_subject=?",
      )
      .bind(...pair)
      .first<Conversation>();
    if (!c) throw new HttpError(429, "Conversation limit reached.");
    if (c.state === "DECLINED") throw missing();
    await db
      .prepare(
        "INSERT INTO x2_conversation_views (conversation_id,subject,hidden,muted) VALUES (?,?,0,0) ON CONFLICT(conversation_id,subject) DO UPDATE SET hidden=0",
      )
      .bind(c.id, subject)
      .run();
    return { threadId: c.id, state: c.state };
  }
  if (input.action === "accept-thread" || input.action === "decline-thread") {
    const c = await thread(subject, input.threadId);
    if (
      c.requested_by === subject ||
      (await blockedSQL(subject, peer(c, subject)))
    )
      throw missing();
    if (c.state === "ACTIVE" && input.action === "accept-thread")
      return { saved: true };
    const result = await db
      .prepare(
        "UPDATE x2_conversations SET state=?,updated_at=? WHERE id=? AND state='REQUESTED'",
      )
      .bind(
        input.action === "accept-thread" ? "ACTIVE" : "DECLINED",
        time,
        c.id,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "Message request changed. Refresh the inbox.");
    return { saved: true };
  }
  if (input.action === "send") {
    const c = await thread(subject, input.threadId),
      other = peer(c, subject),
      text = field(input.text, "Message", 4000),
      key = requestKey(input.requestId);
    const existing = await db
      .prepare(
        "SELECT * FROM x2_messages WHERE conversation_id=? AND sender=? AND request_key=?",
      )
      .bind(c.id, subject, key)
      .first<Message>();
    const referenceId = input.soulId ? id(input.soulId, "Soul") : null;
    const referenceRevision =
      input.revision === undefined ? null : Number(input.revision);
    if (
      referenceRevision !== null &&
      (!Number.isSafeInteger(referenceRevision) || referenceRevision < 1)
    )
      throw new HttpError(400, "Invalid Soul revision.");
    if (existing) {
      if (
        existing.content !== text ||
        existing.reference_soul !== referenceId ||
        existing.reference_revision !== referenceRevision
      )
        throw new HttpError(409, "Retry ID belongs to a different message.");
      return { messageId: existing.id, status: "SENT_TO_SERVER" };
    }
    if (
      (await blockedSQL(subject, other)) ||
      (await preferences(other)).messages === "NONE"
    )
      throw missing();
    if (
      c.state === "DECLINED" ||
      (c.state === "REQUESTED" && c.requested_by !== subject)
    )
      throw new HttpError(403, "Accept the message request before replying.");
    if (referenceId) {
      await soul(subject, referenceId, referenceRevision ?? undefined);
      await soul(other, referenceId, referenceRevision ?? undefined);
    }
    await rate(subject + ":x2-message-send", 30, 60000);
    const mid = crypto.randomUUID();
    const results = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO x2_messages (id,conversation_id,sender,content,request_key,reference_soul,reference_revision,created_at,version) SELECT ?,?,?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM x2_conversations c WHERE c.id=? AND (c.state='ACTIVE' OR (c.state='REQUESTED' AND c.requested_by=? AND NOT EXISTS(SELECT 1 FROM x2_messages m WHERE m.conversation_id=c.id)))) AND NOT EXISTS(SELECT 1 FROM x2_blocks z WHERE (z.subject=? AND z.target=?) OR (z.subject=? AND z.target=?)) AND COALESCE((SELECT messages FROM x2_social_preferences WHERE subject=?),'REQUESTS')<>'NONE'`,
        )
        .bind(
          mid,
          c.id,
          subject,
          text,
          key,
          referenceId,
          referenceRevision,
          time,
          c.id,
          subject,
          subject,
          other,
          other,
          subject,
          other,
        ),
      db
        .prepare(
          "UPDATE x2_conversations SET updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM x2_messages WHERE id=?)",
        )
        .bind(time, c.id, mid),
    ]);
    const saved = await db
      .prepare(
        "SELECT * FROM x2_messages WHERE conversation_id=? AND sender=? AND request_key=?",
      )
      .bind(c.id, subject, key)
      .first<Message>();
    if (!saved)
      throw new HttpError(
        409,
        "Wait for request acceptance or refresh the conversation. No message was saved.",
      );
    if (
      saved.content !== text ||
      saved.reference_soul !== referenceId ||
      saved.reference_revision !== referenceRevision
    )
      throw new HttpError(409, "Retry ID belongs to a different message.");
    if (results[0].meta.changes) {
      const muted = await db
        .prepare(
          "SELECT muted FROM x2_conversation_views WHERE conversation_id=? AND subject=?",
        )
        .bind(c.id, other)
        .first<{ muted: number }>();
      if (!muted?.muted)
        await notification(other, "MESSAGE", c.id, "message:" + saved.id);
    }
    return { messageId: saved.id, status: "SENT_TO_SERVER" };
  }
  if (input.action === "edit-message" || input.action === "retract-message") {
    const mid = id(input.messageId, "Message"),
      message = await db
        .prepare("SELECT * FROM x2_messages WHERE id=? AND sender=?")
        .bind(mid, subject)
        .first<Message>();
    if (!message) throw missing();
    await thread(subject, message.conversation_id);
    if (
      !Number.isSafeInteger(input.version) ||
      Number(input.version) !== message.version
    )
      throw new HttpError(409, "The message changed. Refresh before editing.");
    if (message.retracted_at) return { retracted: true };
    if (
      input.action === "edit-message" &&
      Date.now() - Date.parse(message.created_at) > 15 * 60000
    )
      throw new HttpError(
        409,
        "Messages can be edited for 15 minutes. You can still retract your message.",
      );
    const retract = input.action === "retract-message",
      content = retract ? "" : field(input.text, "Message", 4000);
    const result = await db
      .prepare(
        "UPDATE x2_messages SET content=?,edited_at=?,retracted_at=?,reference_soul=CASE WHEN ?=1 THEN NULL ELSE reference_soul END,reference_revision=CASE WHEN ?=1 THEN NULL ELSE reference_revision END,version=version+1 WHERE id=? AND sender=? AND version=? AND retracted_at IS NULL",
      )
      .bind(
        content,
        time,
        retract ? time : null,
        +retract,
        +retract,
        mid,
        subject,
        message.version,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "The message changed. Refresh before editing.");
    return { saved: true };
  }
  if (input.action === "thread-view") {
    const c = await thread(subject, input.threadId),
      muted = boolean(input.muted, "Mute state"),
      hidden = boolean(input.hidden, "Hidden state");
    await db
      .prepare(
        "INSERT INTO x2_conversation_views (conversation_id,subject,muted,hidden) VALUES (?,?,?,?) ON CONFLICT(conversation_id,subject) DO UPDATE SET muted=excluded.muted,hidden=excluded.hidden",
      )
      .bind(c.id, subject, +muted, +hidden)
      .run();
    return { saved: true };
  }
  if (input.action === "mark-read") {
    const c = await thread(subject, input.threadId),
      latestId = id(input.lastMessageId, "Message");
    if (await blockedSQL(subject, peer(c, subject))) throw missing();
    const seen = await db
      .prepare(
        "SELECT created_at FROM x2_messages WHERE id=? AND conversation_id=?",
      )
      .bind(latestId, c.id)
      .first<{ created_at: string }>();
    if (!seen) throw missing();
    await db
      .prepare(
        "INSERT INTO x2_conversation_views (conversation_id,subject,muted,hidden,read_at) VALUES (?,?,0,0,?) ON CONFLICT(conversation_id,subject) DO UPDATE SET read_at=MAX(COALESCE(read_at,''),excluded.read_at)",
      )
      .bind(c.id, subject, seen.created_at)
      .run();
    await db
      .prepare(
        "UPDATE x2_notifications SET read_at=? WHERE subject=? AND kind='MESSAGE' AND target_id=? AND created_at<=? AND read_at IS NULL",
      )
      .bind(time, subject, c.id, time)
      .run();
    return { saved: true };
  }
  if (input.action === "read-notification") {
    await db
      .prepare("UPDATE x2_notifications SET read_at=? WHERE id=? AND subject=?")
      .bind(time, id(input.notificationId, "Notification"), subject)
      .run();
    return { saved: true };
  }
  if (input.action === "bookmark") {
    const kind = String(input.kind),
      active = boolean(input.active, "Bookmark state");
    let target: string;
    if (!active) {
      if (!["BODY", "SOUL"].includes(kind))
        throw new HttpError(400, "Bookmark a Body or a permitted Soul.");
      await db
        .prepare(
          "DELETE FROM x2_bookmarks WHERE subject=? AND kind=? AND target_id=?",
        )
        .bind(subject, kind, field(input.targetId, "Bookmark", 100))
        .run();
      return { saved: true };
    }
    if (kind === "BODY")
      target = (await resolveBody(subject, input.targetId)).handle;
    else if (kind === "SOUL")
      target = String((await soul(subject, input.targetId)).id);
    else throw new HttpError(400, "Bookmark a Body or a permitted Soul.");
    if (active) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO x2_bookmarks (subject,kind,target_id,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM x2_bookmarks WHERE subject=?)<100",
        )
        .bind(subject, kind, target, time, subject)
        .run();
      if (
        !(await db
          .prepare(
            "SELECT 1 FROM x2_bookmarks WHERE subject=? AND kind=? AND target_id=?",
          )
          .bind(subject, kind, target)
          .first())
      )
        throw new HttpError(
          429,
          "Bookmark limit reached. Remove one before adding another.",
        );
    } else
      await db
        .prepare(
          "DELETE FROM x2_bookmarks WHERE subject=? AND kind=? AND target_id=?",
        )
        .bind(subject, kind, target)
        .run();
    return { saved: true };
  }
  if (input.action === "report") {
    const kind = String(input.kind),
      target = id(input.targetId, "Item");
    if (kind === "MESSAGE") {
      const m = await db
        .prepare("SELECT conversation_id FROM x2_messages WHERE id=?")
        .bind(target)
        .first<{ conversation_id: string }>();
      if (!m) throw missing();
      await thread(subject, m.conversation_id);
    } else if (kind === "BODY") await resolveBody(subject, target);
    else throw new HttpError(400, "Report a message or Body.");
    await rate(subject + ":x2-social-report", 10, 86400000);
    await db
      .prepare(
        "INSERT INTO x2_social_reports (id,reporter,kind,target_id,reason,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        subject,
        kind,
        target,
        field(input.reason, "Reason", 1000, 10),
        time,
      )
      .run();
    return { saved: true };
  }
  if (input.action === "group-directory") {
    const g = await member(subject, input.groupId, true),
      handle = bodyHandle(input.handle),
      discoverable = boolean(input.discoverable, "Group discoverability");
    const pinned = input.pinnedSoul
      ? String((await soul(subject, input.pinnedSoul)).id)
      : null;
    if (pinned && String((await soul(subject, pinned)).groupId) !== g.id)
      throw missing();
    try {
      const saved = await db
        .prepare(
          "INSERT INTO x2_group_directory (group_id,handle,discoverable,pinned_soul,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=? AND role IN ('OWNER','ADMIN')) ON CONFLICT(group_id) DO UPDATE SET handle=excluded.handle,discoverable=excluded.discoverable,pinned_soul=excluded.pinned_soul,updated_at=excluded.updated_at WHERE EXISTS(SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=? AND role IN ('OWNER','ADMIN'))",
        )
        .bind(
          g.id,
          handle,
          +discoverable,
          pinned,
          time,
          g.id,
          subject,
          g.id,
          subject,
        )
        .run();
      if (!saved.meta.changes)
        throw new HttpError(409, "Your group role changed before this save.");
    } catch (e) {
      if (/UNIQUE/.test(String(e)))
        throw new HttpError(409, "That group handle is already in use.");
      throw e;
    }
    return { saved: true };
  }
  if (input.action === "request-join") {
    const gid = id(input.groupId, "Group"),
      g = await db
        .prepare(
          "SELECT g.owner_subject FROM x1_groups g JOIN x2_group_directory d ON d.group_id=g.id WHERE g.id=? AND d.discoverable=1",
        )
        .bind(gid)
        .first<{ owner_subject: string }>();
    if (!g || (await blockedSQL(subject, g.owner_subject))) throw missing();
    const saved = await db
      .prepare(
        "INSERT INTO x2_join_requests (group_id,subject,state,created_at) SELECT ?,?,'PENDING',? WHERE NOT EXISTS(SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=?) ON CONFLICT(group_id,subject) DO UPDATE SET state='PENDING',created_at=excluded.created_at WHERE x2_join_requests.state<>'PENDING'",
      )
      .bind(gid, subject, time, gid, subject)
      .run();
    if (saved.meta.changes)
      await notification(
        g.owner_subject,
        "JOIN_REQUEST",
        gid,
        "join:" + gid + ":" + subject + ":" + time,
      );
    return { saved: true };
  }
  if (input.action === "review-join") {
    const g = await member(subject, input.groupId, true),
      handle = bodyHandle(input.handle),
      target = await db
        .prepare("SELECT subject FROM x1_bodies WHERE handle=?")
        .bind(handle)
        .first<{ subject: string }>();
    if (!target) throw missing();
    const accept = boolean(input.accept, "Join decision");
    if (accept && (await blockedSQL(subject, target.subject))) throw missing();
    const claim = (accept ? "ACCEPTED:" : "DECLINED:") + crypto.randomUUID();
    const out = await db.batch([
      db
        .prepare(
          "UPDATE x2_join_requests SET state=? WHERE group_id=? AND subject=? AND state='PENDING' AND EXISTS(SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=? AND role IN ('OWNER','ADMIN')) AND (?=0 OR ((SELECT count(*) FROM x1_memberships WHERE group_id=?)<100 AND (SELECT count(*) FROM x1_memberships WHERE subject=?)<30))",
        )
        .bind(
          claim,
          g.id,
          target.subject,
          g.id,
          subject,
          +accept,
          g.id,
          target.subject,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO x1_memberships (group_id,subject,role,joined_at) SELECT ?,?,'VIEWER',? WHERE ?=1 AND EXISTS(SELECT 1 FROM x2_join_requests WHERE group_id=? AND subject=? AND state=?)",
        )
        .bind(g.id, target.subject, time, +accept, g.id, target.subject, claim),
      db
        .prepare(
          "UPDATE x2_join_requests SET state=? WHERE group_id=? AND subject=? AND state=?",
        )
        .bind(accept ? "ACCEPTED" : "DECLINED", g.id, target.subject, claim),
    ]);
    if (!out[0].meta.changes)
      throw new HttpError(
        409,
        "The join request changed or a membership limit was reached.",
      );
    await notification(
      target.subject,
      "JOIN_DECISION",
      g.id,
      "join-decision:" + g.id + ":" + target.subject,
    );
    return { saved: true };
  }
  if (
    input.action === "accept-invitation" ||
    input.action === "decline-invitation"
  ) {
    const iid = id(input.invitationId, "Invitation"),
      invitation = await db
        .prepare("SELECT * FROM x1_invitations WHERE id=? AND invited_handle=?")
        .bind(iid, p.handle)
        .first<{
          group_id: string;
          created_by: string;
          accepted_by: string | null;
          role: string;
        }>();
    if (!invitation || (await blockedSQL(subject, invitation.created_by)))
      throw missing();
    if (invitation.accepted_by === subject) {
      await member(subject, invitation.group_id);
      return { groupId: invitation.group_id };
    }
    if (input.action === "decline-invitation") {
      await db
        .prepare(
          "UPDATE x1_invitations SET revoked_at=? WHERE id=? AND invited_handle=? AND accepted_at IS NULL",
        )
        .bind(time, iid, p.handle)
        .run();
      return { saved: true };
    }
    const out = await db.batch([
      db
        .prepare(
          `UPDATE x1_invitations SET accepted_by=?,accepted_at=? WHERE id=? AND invited_handle=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND (SELECT count(*) FROM x1_memberships WHERE group_id=x1_invitations.group_id)<100 AND (SELECT count(*) FROM x1_memberships WHERE subject=?)<30 AND EXISTS(SELECT 1 FROM x1_memberships m WHERE m.group_id=x1_invitations.group_id AND m.subject=x1_invitations.created_by AND m.role IN ('OWNER','ADMIN') AND (x1_invitations.role<>'ADMIN' OR m.role='OWNER'))`,
        )
        .bind(subject, time, iid, p.handle, time, subject),
      db
        .prepare(
          "INSERT OR IGNORE INTO x1_memberships (group_id,subject,role,joined_at) SELECT group_id,?,role,? FROM x1_invitations WHERE id=? AND accepted_by=? AND accepted_at=?",
        )
        .bind(subject, time, iid, subject, time),
    ]);
    if (!out[0].meta.changes)
      throw new HttpError(
        409,
        "Invitation expired, changed or a membership limit was reached.",
      );
    return { groupId: invitation.group_id };
  }
  if (input.action === "discussion" || input.action === "remove-discussion") {
    const g = await member(subject, input.groupId);
    if (input.action === "remove-discussion") {
      const did = id(input.discussionId, "Discussion");
      const result = await db
        .prepare(
          "UPDATE x2_discussions SET content='',source_url=NULL,source_as_of=NULL,deleted_at=? WHERE id=? AND group_id=? AND EXISTS(SELECT 1 FROM x1_memberships m WHERE m.group_id=x2_discussions.group_id AND m.subject=? AND (x2_discussions.author=? OR m.role IN ('OWNER','ADMIN')))",
        )
        .bind(time, did, g.id, subject, subject)
        .run();
      if (!result.meta.changes) throw missing();
      return { saved: true };
    }
    const content = field(input.text, "Research discussion", 4000),
      key = requestKey(input.requestId),
      parentId = input.parentId ? id(input.parentId, "Discussion") : null;
    if (
      parentId &&
      !(await db
        .prepare("SELECT 1 FROM x2_discussions WHERE id=? AND group_id=?")
        .bind(parentId, g.id)
        .first())
    )
      throw missing();
    const sourceUrl = input.sourceUrl
      ? field(input.sourceUrl, "Source URL", 1000)
      : null;
    if (sourceUrl) {
      try {
        const u = new URL(sourceUrl);
        if (u.protocol !== "https:" || u.username || u.password)
          throw new Error();
      } catch {
        throw new HttpError(
          400,
          "Use an HTTPS source link without credentials.",
        );
      }
    }
    const asOf = input.sourceAsOf
      ? field(input.sourceAsOf, "Source observation date", 30)
      : null;
    if (
      asOf &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
        !Number.isFinite(Date.parse(asOf)) ||
        new Date(asOf).toISOString().slice(0, 10) !== asOf ||
        asOf > time.slice(0, 10))
    )
      throw new HttpError(400, "Use a valid past source date.");
    await db
      .prepare(
        "INSERT OR IGNORE INTO x2_discussions (id,group_id,parent_id,author,content,source_url,source_as_of,request_key,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=?)",
      )
      .bind(
        crypto.randomUUID(),
        g.id,
        parentId,
        subject,
        content,
        sourceUrl,
        asOf,
        key,
        time,
        g.id,
        subject,
      )
      .run();
    const saved = await db
      .prepare(
        "SELECT id,content,parent_id,source_url,source_as_of FROM x2_discussions WHERE group_id=? AND author=? AND request_key=?",
      )
      .bind(g.id, subject, key)
      .first<{
        id: string;
        content: string;
        parent_id: string | null;
        source_url: string | null;
        source_as_of: string | null;
      }>();
    if (
      !saved ||
      saved.content !== content ||
      saved.parent_id !== parentId ||
      saved.source_url !== sourceUrl ||
      saved.source_as_of !== asOf
    )
      throw new HttpError(409, "Retry ID belongs to another discussion.");
    for (const handle of [
      ...new Set(
        (content.match(/@[A-Za-z][A-Za-z0-9_]{2,29}/g) || []).map((h) =>
          h.slice(1).toLowerCase(),
        ),
      ),
    ].slice(0, 5)) {
      const target = await db
        .prepare(
          "SELECT b.subject FROM x1_bodies b JOIN x1_memberships m ON m.subject=b.subject WHERE m.group_id=? AND b.handle=? AND b.subject<>?",
        )
        .bind(g.id, handle, subject)
        .first<{ subject: string }>();
      if (target && !(await blockedSQL(subject, target.subject)))
        await notification(
          target.subject,
          "MENTION",
          g.id,
          "mention:" + saved.id + ":" + target.subject,
        );
    }
    return { discussionId: saved.id };
  }
  throw new HttpError(400, "Unknown social action.");
}

/** Authenticated portability export. Private recipient copies are included only for that participant. */
export async function exportSocial(subject: string) {
  const names = [
    "x2_social_preferences",
    "x2_blocks",
    "x2_conversation_views",
    "x2_notifications",
    "x2_bookmarks",
    "x2_join_requests",
  ] as const;
  // Independent bounded reads start together. A failed read rejects the whole export.
  const selections = [
    ...names.map((name) => ({
      name,
      rows: query(`SELECT * FROM ${name} WHERE subject=? LIMIT 1001`, subject),
    })),
    {
      name: "x2_conversations",
      rows: query(
        "SELECT * FROM x2_conversations WHERE first_subject=? OR second_subject=? LIMIT 101",
        subject,
        subject,
      ),
    },
    {
      name: "x2_messages",
      rows: query(
        "SELECT m.* FROM x2_messages m JOIN x2_conversations c ON c.id=m.conversation_id WHERE c.first_subject=? OR c.second_subject=? ORDER BY m.created_at,m.id LIMIT 5001",
        subject,
        subject,
      ),
    },
    {
      name: "x2_social_reports",
      rows: query(
        "SELECT * FROM x2_social_reports WHERE reporter=? LIMIT 1001",
        subject,
      ),
    },
    {
      name: "x2_discussions",
      rows: query(
        "SELECT * FROM x2_discussions WHERE author=? LIMIT 5001",
        subject,
      ),
    },
    {
      name: "x2_group_directory",
      rows: query(
        "SELECT d.* FROM x2_group_directory d JOIN x1_groups g ON g.id=d.group_id WHERE g.owner_subject=? LIMIT 31",
        subject,
      ),
    },
  ];
  const completed = await Promise.all(
    selections.map((selection) => selection.rows),
  );
  const result: Record<string, unknown[]> = Object.fromEntries(
    selections.map((selection, index) => [selection.name, completed[index]]),
  );
  for (const [name, rows] of Object.entries(result)) {
    const limit =
      name === "x2_messages" || name === "x2_discussions"
        ? 5000
        : name === "x2_conversations"
          ? 100
          : name === "x2_group_directory"
            ? 30
            : 1000;
    if (rows.length > limit)
      throw new HttpError(
        413,
        "Social export exceeds the bounded application export. Request a complete owner database export; no partial export is claimed.",
      );
  }
  return result;
}
/** Used inside the existing confirmed account-erasure transaction; no broad unscoped deletes. */
export function socialEraseStatements(subject: string): D1PreparedStatement[] {
  const db = database();
  return [
    db
      .prepare(
        "DELETE FROM x2_notifications WHERE kind='MESSAGE' AND target_id IN (SELECT id FROM x2_conversations WHERE first_subject=? OR second_subject=?)",
      )
      .bind(subject, subject),
    db
      .prepare(
        "DELETE FROM x2_conversations WHERE first_subject=? OR second_subject=?",
      )
      .bind(subject, subject),
    db.prepare("DELETE FROM x2_social_reports WHERE reporter=?").bind(subject),
    db.prepare("DELETE FROM x2_discussions WHERE author=?").bind(subject),
    ...[
      "x2_social_preferences",
      "x2_blocks",
      "x2_notifications",
      "x2_bookmarks",
      "x2_join_requests",
    ].map((t) => db.prepare(`DELETE FROM ${t} WHERE subject=?`).bind(subject)),
    db.prepare("DELETE FROM x2_blocks WHERE target=?").bind(subject),
  ];
}
