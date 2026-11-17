import { account, database, rate } from '../../../database/queries/repository';
import { HttpError } from '../../middleware/security';
import { compileFormula } from '../../engines/scan';
import { avatar, bodyHandle, canAdmin, canWrite, COMMUNITY_LIMITS, field, id, assignableRole, revisionNumber, type GroupRole } from './community-model';

const CONSENT_VERSION = '2026-11-14-v4';
type ProfileRow = { subject: string; handle: string; display_name: string; bio: string; avatar: string; created_at: string; updated_at: string };
type MemberRow = { group_id: string; role: GroupRole; owner_subject: string; name: string; description: string; created_at: string };
type SoulRow = { id: string; group_id: string; revision: number; revision_id: string; state: string; created_at: string; updated_at: string };
type PostRow = { id: string; group_id: string; soul_id: string; revision: number; revision_id: string; hidden_at: string | null };
const stamp = () => new Date().toISOString();
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
const publicBody = (row: ProfileRow | null) => row ? { handle: row.handle, displayName: row.display_name, bio: row.bio, avatar: row.avatar, createdAt: row.created_at, updatedAt: row.updated_at } : null;
const jsonRule = (value: string) => JSON.parse(value) as ReturnType<typeof compileFormula>;

export async function communityBody(subject: string): Promise<ProfileRow | null> {
  return database().prepare('SELECT * FROM x1_bodies WHERE subject=?').bind(subject).first<ProfileRow>();
}

async function requireBody(subject: string): Promise<ProfileRow> {
  const profile = await communityBody(subject);
  if (!profile) throw new HttpError(403, 'Create your Body before using Community.');
  return profile;
}

async function membership(subject: string, groupId: unknown, permission: 'read' | 'write' | 'admin' | 'owner' = 'read'): Promise<MemberRow> {
  const group = id(groupId, 'Group');
  const row = await database().prepare('SELECT m.group_id,m.role,g.owner_subject,g.name,g.description,g.created_at FROM x1_memberships m JOIN x1_groups g ON g.id=m.group_id WHERE m.subject=? AND m.group_id=?').bind(subject, group).first<MemberRow>();
  if (!row) throw new HttpError(404, 'Group not found.');
  if ((permission === 'write' && !canWrite(row.role)) || (permission === 'admin' && !canAdmin(row.role)) || (permission === 'owner' && row.role !== 'OWNER')) throw new HttpError(403, 'Your group role does not permit this action.');
  return row;
}

async function groupSoul(subject: string, soulId: unknown, permission: 'read' | 'write' | 'admin' = 'read'): Promise<{ soul: SoulRow; member: MemberRow }> {
  const soul = await database().prepare('SELECT * FROM x1_group_souls WHERE id=?').bind(id(soulId, 'Soul')).first<SoulRow>();
  if (!soul) throw new HttpError(404, 'Soul not found.');
  const member = await membership(subject, soul.group_id, permission);
  return { soul, member };
}

async function groupPost(subject: string, postId: unknown, permission: 'read' | 'admin' = 'read'): Promise<{ post: PostRow; member: MemberRow }> {
  const post = await database().prepare('SELECT id,group_id,soul_id,revision,revision_id,hidden_at FROM x1_group_posts WHERE id=?').bind(id(postId, 'Post')).first<PostRow>();
  if (!post) throw new HttpError(404, 'Post not found.');
  const member = await membership(subject, post.group_id, permission);
  if (post.hidden_at && !canAdmin(member.role)) throw new HttpError(404, 'Post not found.');
  return { post, member };
}

/** Bounded, server-authoritative group projection. Internal subjects and invitations are never returned. */
export async function getCommunity(subject: string, selectedId?: string | null, before?: string | null): Promise<Record<string, unknown>> {
  const db = database(), profile = await communityBody(subject);
  const groups = await db.prepare('SELECT g.id,g.name,g.description,g.created_at AS createdAt,m.role,b.handle AS ownerHandle FROM x1_groups g JOIN x1_memberships m ON m.group_id=g.id JOIN x1_bodies b ON b.subject=g.owner_subject WHERE m.subject=? ORDER BY g.created_at DESC,g.id LIMIT 31').bind(subject).all();
  const selected = selectedId ? await membership(subject, selectedId) : null;
  const base = {
    body: publicBody(profile), groups: groups.results.slice(0, COMMUNITY_LIMITS.groupsPerBody),
    selectedGroup: selected ? { id: selected.group_id, name: selected.name, description: selected.description, role: selected.role, visibility: 'GROUP', createdAt: selected.created_at } : null,
    members: [], souls: [], revisions: [], posts: [], comments: [], invitations: [], reports: [],
    capabilities: { publicPublishing: false, photoUpload: false, siteAudience: 'UNCHANGED', canEdit: !!selected && canWrite(selected.role), canPublish: !!selected && canAdmin(selected.role), canInvite: !!selected && canAdmin(selected.role) },
    pagination: { postLimit: COMMUNITY_LIMITS.readPage, commentsLimit: COMMUNITY_LIMITS.commentsPage, nextPostBefore: null as string | null },
  };
  if (!selected) return base;
  const group = selected.group_id;
  let cursor = '9999-12-31T23:59:59.999Z';
  if (before) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-zA-Z0-9_-]{8,80}$/.test(before)) throw new HttpError(400, 'Post cursor is invalid.');
    cursor = before;
  }
  const members = await db.prepare('SELECT b.handle,b.display_name AS displayName,b.avatar,m.role,m.joined_at AS joinedAt FROM x1_memberships m JOIN x1_bodies b ON b.subject=m.subject WHERE m.group_id=? ORDER BY CASE m.role WHEN \'OWNER\' THEN 0 WHEN \'ADMIN\' THEN 1 WHEN \'EDITOR\' THEN 2 ELSE 3 END,b.handle LIMIT 100').bind(group).all();
  const souls = await db.prepare('SELECT s.id,s.group_id AS groupId,s.revision,s.state,s.created_at AS createdAt,s.updated_at AS updatedAt,r.title,r.formula,r.summary,r.rule,r.author_handle AS authorHandle FROM x1_group_souls s JOIN x1_soul_revisions r ON r.id=s.revision_id WHERE s.group_id=? ORDER BY s.updated_at DESC,s.id LIMIT 50').bind(group).all<{ rule: string } & Record<string, unknown>>();
  const revisions = await db.prepare('SELECT r.id,r.soul_id AS soulId,r.revision,r.title,r.formula,r.summary,r.rule,r.change_note AS changeNote,r.author_handle AS authorHandle,r.created_at AS createdAt FROM x1_soul_revisions r JOIN x1_group_souls s ON s.id=r.soul_id WHERE s.group_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 100').bind(group).all<{ rule: string } & Record<string, unknown>>();
  const posts = await db.prepare('SELECT p.id,p.group_id AS groupId,p.soul_id AS soulId,p.revision,p.created_at AS createdAt,p.author_handle AS authorHandle,p.hidden_at AS hiddenAt,r.title,r.formula,r.summary,(SELECT count(*) FROM x1_supers x WHERE x.post_id=p.id) AS superCount,(SELECT count(*) FROM x1_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS commentCount,EXISTS(SELECT 1 FROM x1_supers x WHERE x.post_id=p.id AND x.subject=?) AS supered FROM x1_group_posts p JOIN x1_soul_revisions r ON r.id=p.revision_id WHERE p.group_id=? AND (p.hidden_at IS NULL OR ?=1) AND (p.created_at || \'|\' || p.id)<? ORDER BY p.created_at DESC,p.id DESC LIMIT 51').bind(subject, group, canAdmin(selected.role) ? 1 : 0, cursor).all<{ id: string; createdAt: string; supered: number } & Record<string, unknown>>();
  const visiblePosts = posts.results.slice(0, COMMUNITY_LIMITS.readPage);
  // Comments use the same bounded post page rather than exposing comments from another page/group.
  const comments = visiblePosts.length ? await db.prepare(`SELECT c.id,c.post_id AS postId,c.parent_id AS parentId,c.author_handle AS authorHandle,c.content AS text,c.created_at AS createdAt,c.edited_at AS editedAt,c.deleted_at AS deletedAt,(c.author_subject=?) AS isMine FROM x1_comments c JOIN x1_group_posts p ON p.id=c.post_id WHERE p.group_id=? AND c.post_id IN (${visiblePosts.map(() => '?').join(',')}) ORDER BY c.created_at,c.id LIMIT 201`).bind(subject, group, ...visiblePosts.map(p => p.id)).all() : { results: [] };
  const invitations = canAdmin(selected.role) ? await db.prepare('SELECT id,invited_handle AS invitedHandle,role,created_at AS createdAt,expires_at AS expiresAt,accepted_at AS acceptedAt,revoked_at AS revokedAt FROM x1_invitations WHERE group_id=? ORDER BY created_at DESC LIMIT 50').bind(group).all() : { results: [] };
  const reports = canAdmin(selected.role) ? await db.prepare('SELECT r.id,r.post_id AS postId,r.reason,r.created_at AS createdAt,r.resolved_at AS resolvedAt FROM x1_reports r JOIN x1_group_posts p ON p.id=r.post_id WHERE p.group_id=? ORDER BY r.created_at DESC LIMIT 50').bind(group).all() : { results: [] };
  const last = visiblePosts.at(-1);
  return {
    ...base, members: members.results, souls: souls.results.map(row => ({ ...row, rule: jsonRule(row.rule) })),
    revisions: revisions.results.map(row => ({ ...row, rule: jsonRule(row.rule) })),
    posts: visiblePosts.map(row => ({ ...row, supered: !!row.supered })), comments: comments.results.slice(0, COMMUNITY_LIMITS.commentsPage), invitations: invitations.results, reports: reports.results,
    pagination: { ...base.pagination, nextPostBefore: posts.results.length > COMMUNITY_LIMITS.readPage && last ? `${last.createdAt}|${last.id}` : null, commentsTruncated: comments.results.length > COMMUNITY_LIMITS.commentsPage },
  };
}

async function saveProfile(subject: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handle = bodyHandle(input.handle), displayName = field(input.displayName, 'Display name', 60), bio = field(input.bio ?? '', 'Bio', 320, 0), colour = avatar(input.avatar ?? 'mint');
  const db = database(), current = await account(subject), now = stamp();
  if (!current || current.adult_confirmed !== 1 || current.consent_version !== CONSENT_VERSION) {
    if (input.adult !== true || input.privacy !== true || input.terms !== true) throw new HttpError(403, 'Confirm age 18+, privacy and terms separately before creating a Body.');
    await db.prepare('INSERT INTO accounts (subject,alias,consent_at,consent_version,adult_confirmed,last_active) VALUES (?,?,?,?,1,?) ON CONFLICT(subject) DO UPDATE SET consent_at=excluded.consent_at,consent_version=excluded.consent_version,adult_confirmed=1,last_active=excluded.last_active').bind(subject, displayName, now, CONSENT_VERSION, now).run();
  }
  try {
    await db.prepare('INSERT INTO x1_bodies (subject,handle,display_name,bio,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET handle=excluded.handle,display_name=excluded.display_name,bio=excluded.bio,avatar=excluded.avatar,updated_at=excluded.updated_at').bind(subject, handle, displayName, bio, colour, now, now).run();
  } catch (error) {
    if (/UNIQUE constraint failed: x1_bodies.handle|x1_body_handle_unique/.test(String(error))) throw new HttpError(409, 'That Body handle is already in use.');
    throw error;
  }
  return { body: publicBody(await communityBody(subject)) };
}

function soulContent(input: Record<string, unknown>) {
  const title = field(input.title, 'Soul title', 100), summary = field(input.summary, 'Methodology summary', 2000, 10), source = field(input.formula, 'Formula', 4000);
  let rule: ReturnType<typeof compileFormula>;
  try { rule = compileFormula(source); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Formula is invalid.'); }
  return { title, summary, formula: rule.formula, rule: JSON.stringify(rule) };
}

/** All side effects use stable Site subjects. No incoming email/account/role is trusted. */
export async function mutateCommunity(subject: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  await rate(subject + ':x1-community-write', COMMUNITY_LIMITS.writesPerMinute, 60000);
  if (input.action === 'profile') return saveProfile(subject, input);
  const profile = await requireBody(subject), current = await account(subject), db = database(), now = stamp();
  if (!current || current.adult_confirmed !== 1 || current.consent_version !== CONSENT_VERSION) throw new HttpError(403, 'Accept the current adult, privacy and terms notices before using Community.');
  await db.prepare('UPDATE accounts SET last_active=? WHERE subject=?').bind(now, subject).run();
  if (input.action === 'create-group') {
    const name = field(input.name, 'Group name', 80), description = field(input.description ?? '', 'Group description', 500, 0), groupId = crypto.randomUUID();
    const result = await db.batch([
      db.prepare('INSERT INTO x1_groups (id,owner_subject,name,description,created_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM x1_memberships WHERE subject=?)<?').bind(groupId, subject, name, description, now, subject, COMMUNITY_LIMITS.groupsPerBody),
      db.prepare('INSERT INTO x1_memberships (group_id,subject,role,joined_at) SELECT ?,?,\'OWNER\',? WHERE EXISTS (SELECT 1 FROM x1_groups WHERE id=? AND owner_subject=?)').bind(groupId, subject, now, groupId, subject),
    ]);
    if (!result[0].meta.changes) throw new HttpError(429, 'Group limit reached. Leave a group before creating another.');
    return { groupId };
  }
  if (input.action === 'invite') {
    const member = await membership(subject, input.groupId, 'admin'), invitedHandle = bodyHandle(input.handle ?? input.invitedHandle), role = assignableRole(input.role ?? 'EDITOR');
    if (role === 'ADMIN' && member.role !== 'OWNER') throw new HttpError(403, 'Only the group owner can invite an administrator.');
    await rate(subject + ':x1-community-invite', COMMUNITY_LIMITS.invitesPerDay, 86400000);
    const code = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''), expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(), invitationId = crypto.randomUUID();
    const created = await db.prepare('INSERT INTO x1_invitations (id,code_hash,group_id,invited_handle,role,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=? AND role IN (\'OWNER\',\'ADMIN\') AND (?<>\'ADMIN\' OR role=\'OWNER\'))').bind(invitationId, await digest(code), member.group_id, invitedHandle, role, subject, now, expiresAt, member.group_id, subject, role).run();
    if (!created.meta.changes) throw new HttpError(409, 'Your group role changed before the invitation was created.');
    return { invitationId, code, expiresAt, invitedHandle, notice: 'Share this one-time code with the named Body. It does not grant access to the restricted Site.' };
  }
  if (input.action === 'accept-invite') {
    const code = field(input.code, 'Invitation code', 64, 64);
    if (!/^[a-f0-9]{64}$/.test(code)) throw new HttpError(400, 'Invitation code is invalid.');
    const codeHash = await digest(code), invitation = await db.prepare('SELECT id,group_id,accepted_by FROM x1_invitations WHERE code_hash=? AND invited_handle=?').bind(codeHash, profile.handle).first<{ id: string; group_id: string; accepted_by: string | null }>();
    if (!invitation) throw new HttpError(404, 'Invitation not found for this Body.');
    if (invitation.accepted_by === subject) return { groupId: (await membership(subject, invitation.group_id)).group_id, accepted: true };
    const results = await db.batch([
      db.prepare('UPDATE x1_invitations SET accepted_by=?,accepted_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND invited_handle=? AND (SELECT count(*) FROM x1_memberships WHERE group_id=x1_invitations.group_id)<? AND (SELECT count(*) FROM x1_memberships WHERE subject=?)<? AND EXISTS (SELECT 1 FROM x1_memberships m WHERE m.group_id=x1_invitations.group_id AND m.subject=x1_invitations.created_by AND m.role IN (\'OWNER\',\'ADMIN\') AND (x1_invitations.role<>\'ADMIN\' OR m.role=\'OWNER\'))').bind(subject, now, invitation.id, now, profile.handle, COMMUNITY_LIMITS.membersPerGroup, subject, COMMUNITY_LIMITS.groupsPerBody),
      db.prepare('INSERT OR IGNORE INTO x1_memberships (group_id,subject,role,joined_at) SELECT group_id,?,role,? FROM x1_invitations WHERE id=? AND accepted_by=? AND accepted_at=?').bind(subject, now, invitation.id, subject, now),
    ]);
    if (!results[0].meta.changes) throw new HttpError(409, 'Invitation expired, used, revoked or the membership limit was reached.');
    return { groupId: invitation.group_id, accepted: true };
  }
  if (input.action === 'revoke-invite') {
    const invitationId = id(input.invitationId, 'Invitation'), row = await db.prepare('SELECT group_id FROM x1_invitations WHERE id=?').bind(invitationId).first<{ group_id: string }>();
    if (!row) throw new HttpError(404, 'Invitation not found.');
    await membership(subject, row.group_id, 'admin');
    await db.prepare('UPDATE x1_invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL').bind(now, invitationId).run();
    return { revoked: true };
  }
  if (input.action === 'set-role' || input.action === 'transfer-owner') {
    const member = await membership(subject, input.groupId, 'owner'), handle = bodyHandle(input.handle), target = await db.prepare('SELECT m.subject,m.role FROM x1_memberships m JOIN x1_bodies b ON b.subject=m.subject WHERE m.group_id=? AND b.handle=?').bind(member.group_id, handle).first<{ subject: string; role: GroupRole }>();
    if (!target || target.subject === subject) throw new HttpError(400, 'Choose another current group member.');
    if (input.action === 'set-role') {
      const role = assignableRole(input.role);
      await db.prepare('UPDATE x1_memberships SET role=? WHERE group_id=? AND subject=? AND role<>\'OWNER\' AND EXISTS (SELECT 1 FROM x1_groups WHERE id=? AND owner_subject=?)').bind(role, member.group_id, target.subject, member.group_id, subject).run();
      return { updated: true };
    }
    const result = await db.batch([
      db.prepare('UPDATE x1_groups SET owner_subject=? WHERE id=? AND owner_subject=?').bind(target.subject, member.group_id, subject),
      db.prepare('UPDATE x1_memberships SET role=CASE WHEN subject=? THEN \'OWNER\' WHEN subject=? THEN \'ADMIN\' ELSE role END WHERE group_id=? AND EXISTS (SELECT 1 FROM x1_groups WHERE id=? AND owner_subject=?)').bind(target.subject, subject, member.group_id, member.group_id, target.subject),
    ]);
    if (!result[0].meta.changes) throw new HttpError(409, 'Group ownership changed. Refresh before trying again.');
    return { transferred: true };
  }
  if (input.action === 'leave-group') {
    const member = await membership(subject, input.groupId);
    if (member.role === 'OWNER') throw new HttpError(409, 'Transfer group ownership before leaving.');
    await db.prepare('DELETE FROM x1_memberships WHERE group_id=? AND subject=? AND role<>\'OWNER\'').bind(member.group_id, subject).run();
    return { left: true };
  }
  if (input.action === 'create-soul') {
    const member = await membership(subject, input.groupId, 'write'), content = soulContent(input), soulId = crypto.randomUUID(), revisionId = crypto.randomUUID();
    const results = await db.batch([
      db.prepare('INSERT INTO x1_group_souls (id,group_id,revision,revision_id,state,created_at,updated_at) SELECT ?,?,1,?,\'DRAFT\',?,? WHERE EXISTS (SELECT 1 FROM x1_memberships WHERE group_id=? AND subject=? AND role IN (\'OWNER\',\'ADMIN\',\'EDITOR\')) AND (SELECT count(*) FROM x1_group_souls WHERE group_id=?)<100').bind(soulId, member.group_id, revisionId, now, now, member.group_id, subject, member.group_id),
      db.prepare('INSERT INTO x1_soul_revisions (id,soul_id,revision,title,formula,summary,rule,change_note,author_subject,author_handle,created_at) SELECT ?,?,1,?,?,?,?,\'Initial methodology\',?,?,? WHERE EXISTS (SELECT 1 FROM x1_group_souls WHERE id=? AND revision_id=?)').bind(revisionId, soulId, content.title, content.formula, content.summary, content.rule, subject, profile.handle, now, soulId, revisionId),
    ]);
    if (!results[0].meta.changes) throw new HttpError(409, 'Role changed or this group has reached its Soul limit.');
    return { soulId, revision: 1 };
  }
  if (input.action === 'revise-soul') {
    const { soul } = await groupSoul(subject, input.soulId, 'write'), base = revisionNumber(input.baseRevision), content = soulContent(input), changeNote = field(input.changeNote, 'Change note', 500, 3), revisionId = crypto.randomUUID();
    if (soul.revision !== base) throw new HttpError(409, 'This Soul has a newer revision. Refresh and compare before saving.');
    const results = await db.batch([
      db.prepare('UPDATE x1_group_souls SET revision=?,revision_id=?,state=\'DRAFT\',updated_at=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM x1_memberships WHERE group_id=x1_group_souls.group_id AND subject=? AND role IN (\'OWNER\',\'ADMIN\',\'EDITOR\'))').bind(base + 1, revisionId, now, soul.id, base, subject),
      db.prepare('INSERT INTO x1_soul_revisions (id,soul_id,revision,title,formula,summary,rule,change_note,author_subject,author_handle,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM x1_group_souls WHERE id=? AND revision_id=?)').bind(revisionId, soul.id, base + 1, content.title, content.formula, content.summary, content.rule, changeNote, subject, profile.handle, now, soul.id, revisionId),
    ]);
    if (!results[0].meta.changes) throw new HttpError(409, 'Concurrent edit or role change detected. Your changes were not overwritten; refresh and compare.');
    return { soulId: soul.id, revision: base + 1 };
  }
  if (input.action === 'restore-revision') {
    const { soul } = await groupSoul(subject, input.soulId, 'write'), from = revisionNumber(input.revision), base = revisionNumber(input.baseRevision);
    const prior = await db.prepare('SELECT title,formula,summary FROM x1_soul_revisions WHERE soul_id=? AND revision=?').bind(soul.id, from).first<{ title: string; formula: string; summary: string }>();
    if (!prior) throw new HttpError(404, 'Revision not found.');
    return mutateCommunity(subject, { action: 'revise-soul', soulId: soul.id, baseRevision: base, ...prior, changeNote: `Restored methodology from revision ${from}.` });
  }
  if (input.action === 'publish') {
    const { soul } = await groupSoul(subject, input.soulId, 'admin'), revision = revisionNumber(input.revision), postId = crypto.randomUUID();
    if (revision !== soul.revision) throw new HttpError(409, 'Only the current reviewed revision can be published. Refresh this Soul.');
    if (input.visibility && input.visibility !== 'GROUP') throw new HttpError(403, 'Public publishing is disabled. Publication is restricted to current members of this private group.');
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO x1_group_posts (id,group_id,soul_id,revision,revision_id,author_subject,author_handle,created_at) SELECT ?,group_id,id,revision,revision_id,?,?,? FROM x1_group_souls WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM x1_memberships m WHERE m.group_id=x1_group_souls.group_id AND m.subject=? AND m.role IN (\'OWNER\',\'ADMIN\'))').bind(postId, subject, profile.handle, now, soul.id, revision, subject),
      db.prepare('UPDATE x1_group_souls SET state=\'PUBLISHED\' WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM x1_group_posts p WHERE p.soul_id=x1_group_souls.id AND p.revision=x1_group_souls.revision)').bind(soul.id, revision),
    ]);
    const saved = await db.prepare('SELECT id FROM x1_group_posts WHERE soul_id=? AND revision=?').bind(soul.id, revision).first<{ id: string }>();
    if (!saved) throw new HttpError(409, 'Soul or group permissions changed before publication.');
    return { postId: saved.id, visibility: 'GROUP', published: true };
  }
  if (input.action === 'super') {
    const { post } = await groupPost(subject, input.postId);
    if (typeof input.active !== 'boolean') throw new HttpError(400, 'Set the desired Super state explicitly.');
    if (post.hidden_at) throw new HttpError(409, 'Hidden posts cannot receive Supers.');
    if (input.active) await db.prepare('INSERT OR IGNORE INTO x1_supers (post_id,subject,created_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM x1_group_posts p JOIN x1_memberships m ON m.group_id=p.group_id WHERE p.id=? AND p.hidden_at IS NULL AND m.subject=?)').bind(post.id, subject, now, post.id, subject).run();
    else await db.prepare('DELETE FROM x1_supers WHERE post_id=? AND subject=?').bind(post.id, subject).run();
    return { active: input.active, superCount: (await db.prepare('SELECT count(*) AS count FROM x1_supers WHERE post_id=?').bind(post.id).first<{ count: number }>())!.count };
  }
  if (input.action === 'comment') {
    const { post } = await groupPost(subject, input.postId), text = field(input.text, 'Comment', 2000, 1), commentId = crypto.randomUUID();
    if (post.hidden_at) throw new HttpError(409, 'Hidden posts cannot receive comments.');
    const parentId = input.parentId ? id(input.parentId, 'Parent comment') : null;
    if (parentId) {
      const parent = await db.prepare('SELECT id FROM x1_comments WHERE id=? AND post_id=? AND deleted_at IS NULL').bind(parentId, post.id).first();
      if (!parent) throw new HttpError(404, 'Parent comment not found in this post.');
      const depth = await db.prepare('WITH RECURSIVE ancestors(id,parent_id,depth) AS (SELECT id,parent_id,1 FROM x1_comments WHERE id=? AND post_id=? UNION ALL SELECT c.id,c.parent_id,a.depth+1 FROM x1_comments c JOIN ancestors a ON c.id=a.parent_id WHERE c.post_id=? AND a.depth<5) SELECT max(depth) AS depth FROM ancestors').bind(parentId, post.id, post.id).first<{ depth: number }>();
      if ((depth?.depth ?? 0) >= 4) throw new HttpError(400, 'Reply depth limit reached. Add a new comment instead.');
    }
    const requestId = input.requestId ? id(input.requestId, 'Request') : crypto.randomUUID(), requestKey = await digest(subject + ':' + requestId);
    const prior = await db.prepare('SELECT id,content,parent_id FROM x1_comments WHERE post_id=? AND request_key=?').bind(post.id, requestKey).first<{ id: string; content: string; parent_id: string | null }>();
    if (prior) {
      if (prior.content !== text || prior.parent_id !== parentId) throw new HttpError(409, 'Comment request ID was already used for different content.');
      return { commentId: prior.id, saved: true };
    }
    await db.prepare('INSERT OR IGNORE INTO x1_comments (id,post_id,parent_id,author_subject,author_handle,content,created_at,request_key) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM x1_group_posts p JOIN x1_memberships m ON m.group_id=p.group_id WHERE p.id=? AND p.hidden_at IS NULL AND m.subject=?) AND (? IS NULL OR EXISTS (SELECT 1 FROM x1_comments c WHERE c.id=? AND c.post_id=? AND c.deleted_at IS NULL))').bind(commentId, post.id, parentId, subject, profile.handle, text, now, requestKey, post.id, subject, parentId, parentId, post.id).run();
    const saved = await db.prepare('SELECT id,content,parent_id FROM x1_comments WHERE post_id=? AND request_key=?').bind(post.id, requestKey).first<{ id: string; content: string; parent_id: string | null }>();
    if (!saved) throw new HttpError(409, 'Post, parent or group permissions changed before saving.');
    if (saved.content !== text || saved.parent_id !== parentId) throw new HttpError(409, 'Comment request ID was already used for different content.');
    return { commentId: saved.id, saved: true };
  }
  if (input.action === 'edit-comment' || input.action === 'delete-comment') {
    const commentId = id(input.commentId, 'Comment'), row = await db.prepare('SELECT post_id,author_subject FROM x1_comments WHERE id=? AND deleted_at IS NULL').bind(commentId).first<{ post_id: string; author_subject: string | null }>();
    if (!row) throw new HttpError(404, 'Comment not found.');
    await groupPost(subject, row.post_id);
    if (row.author_subject !== subject) throw new HttpError(404, 'Comment not found.');
    if (input.action === 'edit-comment') await db.prepare('UPDATE x1_comments SET content=?,edited_at=? WHERE id=? AND author_subject=? AND deleted_at IS NULL').bind(field(input.text, 'Comment', 2000), now, commentId, subject).run();
    else await db.prepare('UPDATE x1_comments SET content=\'[Deleted by author]\',deleted_at=?,edited_at=? WHERE id=? AND author_subject=? AND deleted_at IS NULL').bind(now, now, commentId, subject).run();
    return { saved: true };
  }
  if (input.action === 'report') {
    const { post } = await groupPost(subject, input.postId), reason = field(input.reason, 'Report reason', 500, 5);
    await rate(subject + ':x1-community-report', 10, 86400000);
    await db.prepare('INSERT OR IGNORE INTO x1_reports (id,post_id,reporter_subject,reason,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), post.id, subject, reason, now).run();
    return { reported: true, notice: 'Saved for this group’s owner and administrators. No external message was sent.' };
  }
  if (input.action === 'moderate') {
    const { post } = await groupPost(subject, input.postId, 'admin');
    if (typeof input.hidden !== 'boolean') throw new HttpError(400, 'Choose whether to hide this group post.');
    await db.batch([
      db.prepare('UPDATE x1_group_posts SET hidden_at=? WHERE id=? AND EXISTS (SELECT 1 FROM x1_memberships WHERE group_id=x1_group_posts.group_id AND subject=? AND role IN (\'OWNER\',\'ADMIN\'))').bind(input.hidden ? now : null, post.id, subject),
      db.prepare('UPDATE x1_reports SET resolved_at=? WHERE post_id=? AND EXISTS (SELECT 1 FROM x1_group_posts p JOIN x1_memberships m ON m.group_id=p.group_id WHERE p.id=x1_reports.post_id AND m.subject=? AND m.role IN (\'OWNER\',\'ADMIN\'))').bind(now, post.id, subject),
    ]);
    return { hidden: input.hidden };
  }
  throw new HttpError(400, 'Unsupported Community action.');
}

/** Used by the existing explicit privacy erasure flow before deleting accounts.
 * Deleting an owner cascades that owner's group workspace; transfer ownership first to retain it.
 */
export function communityPrivacyStatements(subject: string): D1PreparedStatement[] {
  const db = database();
  return [
    db.prepare('UPDATE x1_soul_revisions SET author_handle=\'deleted\',author_subject=NULL WHERE author_subject=?').bind(subject),
    db.prepare('UPDATE x1_group_posts SET author_handle=\'deleted\',author_subject=NULL WHERE author_subject=?').bind(subject),
    db.prepare('UPDATE x1_comments SET author_handle=\'deleted\',author_subject=NULL,content=\'[Deleted by author]\',deleted_at=? WHERE author_subject=?').bind(stamp(), subject),
  ];
}

export async function exportCommunityData(subject: string): Promise<Record<string, unknown>> {
  const db = database();
  // These projections do not depend on each other; do not serialize D1 round trips.
  const [profile, revisions, comments, community] = await Promise.all([
    communityBody(subject),
    db.prepare('SELECT r.* FROM x1_soul_revisions r JOIN x1_group_souls s ON s.id=r.soul_id JOIN x1_memberships m ON m.group_id=s.group_id AND m.subject=? WHERE r.author_subject=? ORDER BY r.created_at LIMIT 1001').bind(subject, subject).all(),
    db.prepare('SELECT id,post_id,parent_id,content,created_at,edited_at,deleted_at FROM x1_comments WHERE author_subject=? ORDER BY created_at LIMIT 1001').bind(subject).all(),
    getCommunity(subject),
  ]);
  if (revisions.results.length > 1000 || comments.results.length > 1000) throw new HttpError(413, 'Community export exceeds this release’s limit. Request a complete operator export; no partial export was returned.');
  return { body: publicBody(profile), memberships: community.groups, authoredRevisions: revisions.results, authoredComments: comments.results, notice: 'Group workspaces owned by this account are deleted on confirmed account erasure. Transfer ownership first to preserve shared work.' };
}
