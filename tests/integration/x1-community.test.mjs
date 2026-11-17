/** Actual X1 route and repository against real SQLite with isolated synthetic identities.
 * These are backend integration tests, not proof of live multi-user sign-in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { webcrypto, randomUUID } from 'node:crypto';

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
assert.ok(sql.prepare("SELECT name FROM sqlite_master WHERE name='x1_bodies'").get(), 'Run the generated additive X1 migration before these tests.');

class Statement {
  constructor(query, args = []) { this.query = query; this.args = args; }
  bind(...args) { return new Statement(this.query, args); }
  async first() { return sql.prepare(this.query).get(...this.args) ?? null; }
  async all() { return { results: sql.prepare(this.query).all(...this.args), success: true }; }
  execute() { const r = sql.prepare(this.query).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  async run() { return this.execute(); }
}
const DB = {
  prepare: query => new Statement(query),
  async batch(statements) {
    // Synchronous SQLite transaction models D1's atomic batch, including rollback.
    sql.exec('BEGIN');
    try { const out = statements.map(s => s.execute()); sql.exec('COMMIT'); return out; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
let currentUser = null;
const context = vm.createContext({ console, Request, Response, Headers, TextEncoder, TextDecoder, crypto: { subtle: webcrypto.subtle, randomUUID }, URL, Intl, Date, Uint8Array, Number, Math, JSON, Set, Map });
const cache = new Map();
async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  if (file.replaceAll('\\', '/').endsWith('/backend/auth/chatgpt-auth.ts')) {
    const m = new vm.SyntheticModule(['getChatGPTUser'], function () { this.setExport('getChatGPTUser', async () => currentUser); }, { context });
    cache.set(file, m); return m;
  }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const m = new vm.SourceTextModule(code, { context, identifier: file }); cache.set(file, m);
  await m.link(async (spec, refer) => {
    if (spec === 'cloudflare:workers') {
      if (!cache.has(spec)) cache.set(spec, new vm.SyntheticModule(['env'], function () { this.setExport('env', { DB }); }, { context }));
      return cache.get(spec);
    }
    let target = resolve(dirname(refer.identifier), spec); if (!existsSync(target)) target += '.ts'; return load(target);
  });
  return m;
}
const route = await load('app/api/x1/community/route.ts'); await route.evaluate();
const repository = cache.get(resolve('backend/services/community/community.ts')).namespace;
const plain = value => JSON.parse(JSON.stringify(value));
async function call(input, subject = 'alpha', groupId, extraHeaders = {}) {
  currentUser = subject ? { userId: subject, email: subject + '@example.invalid', displayName: subject, fullName: null } : null;
  const url = new URL('https://test.invalid/api/x1/community'); if (groupId) url.searchParams.set('groupId', groupId);
  const request = new Request(url, { method: input === undefined ? 'GET' : 'POST', headers: { origin: 'https://test.invalid', 'content-type': 'application/json', ...extraHeaders }, body: input === undefined ? undefined : JSON.stringify(input) });
  const response = await route.namespace[input === undefined ? 'GET' : 'POST'](request);
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const profile = (handle, more = {}) => ({ action: 'profile', handle, displayName: 'Test ' + handle, bio: 'Isolated integration test account.', avatar: 'mint', adult: true, privacy: true, terms: true, ...more });
const content = { title: 'Point-in-time test method', summary: 'Only a methodology fixture, with no performance claim.', formula: 'close > sma(close, 2)' };
let groupId, betaCode, gammaCode, soulId, postId, post2, commentId;
test.beforeEach(() => sql.prepare('DELETE FROM rate_limits').run());

test('Community requires native identity, origin, separate consent, and bounded fields', async () => {
  assert.equal((await call(undefined, null)).status, 401);
  assert.equal((await call(profile('alpha_body'), 'alpha', null, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await call(profile('alpha_body', { terms: false }))).status, 403);
  assert.equal((await call(profile('admin'))).status, 400);
  assert.equal((await call(profile('alpha_body', { avatar: 'https://private.invalid/photo' }))).status, 400);
  assert.equal((await call(profile('alpha_body', { bio: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await call(profile('Alpha_Body'))).status, 200);
  const r = await call(); assert.equal(r.data.body.handle, 'alpha_body');
  assert.equal(r.data.capabilities.publicPublishing, false); assert.equal(r.data.capabilities.photoUpload, false);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
});

test('Body handle collision is case insensitive and database unique under concurrent registration', async () => {
  const runs = await Promise.all([call(profile('Shared_Body'), 'collision1'), call(profile('shared_body'), 'collision2')]);
  assert.equal(runs.filter(r => r.status === 200).length, 1); assert.equal(runs.filter(r => r.status === 409).length, 1);
  assert.equal(sql.prepare('SELECT count(*) n FROM x1_bodies WHERE handle=?').get('shared_body').n, 1);
  assert.equal((await call(profile('beta_body'), 'beta')).status, 200);
  assert.equal((await call(profile('gamma_body'), 'gamma')).status, 200);
  assert.equal((await call(profile('outside_body'), 'outsider')).status, 200);
});

test('Private groups hide direct IDs from outsiders and invitation codes are hashed and handle bound', async () => {
  const made = await call({ action: 'create-group', name: 'Isolated research room', description: 'Private test workspace.' });
  assert.equal(made.status, 200); groupId = made.data.groupId;
  assert.equal((await call(undefined, 'outsider', groupId)).status, 404);
  assert.equal((await call(undefined, 'outsider')).data.groups.length, 0);
  const a = await call({ action: 'invite', groupId, handle: 'beta_body', role: 'EDITOR' });
  assert.equal(a.status, 200); betaCode = a.data.code;
  const b = await call({ action: 'invite', groupId, handle: 'gamma_body', role: 'VIEWER' });
  gammaCode = b.data.code;
  const rows = sql.prepare('SELECT code_hash FROM x1_invitations').all();
  assert.ok(rows.every(row => row.code_hash.length === 64 && row.code_hash !== betaCode && row.code_hash !== gammaCode));
  assert.equal((await call({ action: 'accept-invite', code: betaCode }, 'outsider')).status, 404);
  assert.equal((await call({ action: 'accept-invite', code: betaCode }, 'beta')).status, 200);
  assert.equal((await call({ action: 'accept-invite', code: betaCode }, 'beta')).status, 200);
  assert.equal((await call({ action: 'accept-invite', code: gammaCode }, 'gamma')).status, 200);
  const state = (await call(undefined, 'beta', groupId)).data;
  assert.equal(state.members.length, 3); assert.equal(state.selectedGroup.role, 'EDITOR');
  assert.ok(!JSON.stringify(state).includes('example.invalid'));
  assert.ok(!JSON.stringify(state).includes('owner_subject')); assert.ok(!JSON.stringify(state).includes('author_subject'));
  assert.equal(state.invitations.length, 0);
});

test('Shared Souls compile through the canonical engine and enforce editor/viewer boundaries', async () => {
  assert.equal((await call({ action: 'create-soul', groupId, ...content }, 'gamma')).status, 403);
  assert.equal((await call({ action: 'create-soul', groupId, ...content, formula: 'globalThis.process.exit()' }, 'beta')).status, 400);
  assert.equal((await call({ action: 'create-soul', groupId, ...content }, 'outsider')).status, 404);
  const made = await call({ action: 'create-soul', groupId, ...content }); assert.equal(made.status, 200); soulId = made.data.soulId;
  const state = (await call(undefined, 'beta', groupId)).data;
  assert.equal(state.souls.length, 1); assert.equal(state.souls[0].rule.version, 'x1-rule-1');
  assert.equal(state.revisions[0].authorHandle, 'alpha_body'); assert.equal(state.revisions[0].revision, 1);
  assert.equal((await call({ action: 'revise-soul', soulId, baseRevision: 1, ...content, changeNote: 'Unauthorized edit' }, 'outsider')).status, 404);
});

test('Optimistic revision batches detect concurrent edits and retain each author and prior content', async () => {
  const revised = await call({ action: 'revise-soul', soulId, baseRevision: 1, ...content, formula: 'close > sma(close, 3)', changeNote: 'Editor extended the window.' }, 'beta');
  assert.equal(revised.status, 200); assert.equal(revised.data.revision, 2);
  assert.equal((await call({ action: 'revise-soul', soulId, baseRevision: 1, ...content, changeNote: 'Stale source content.' })).status, 409);
  const concurrent = await Promise.all([
    call({ action: 'revise-soul', soulId, baseRevision: 2, ...content, formula: 'close > sma(close, 4)', changeNote: 'Owner draft edit.' }),
    call({ action: 'revise-soul', soulId, baseRevision: 2, ...content, formula: 'close > sma(close, 5)', changeNote: 'Editor draft edit.' }, 'beta'),
  ]);
  assert.equal(concurrent.filter(r => r.status === 200).length, 1); assert.equal(concurrent.filter(r => r.status === 409).length, 1);
  const rows = sql.prepare('SELECT revision,formula,author_handle FROM x1_soul_revisions WHERE soul_id=? ORDER BY revision').all(soulId);
  assert.equal(rows.length, 3); assert.equal(rows[0].author_handle, 'alpha_body'); assert.equal(rows[1].author_handle, 'beta_body');
  assert.ok(rows[0].formula.includes('2')); assert.ok(rows[1].formula.includes('3'));
  assert.equal((await call({ action: 'restore-revision', soulId, revision: 1, baseRevision: 3 }, 'beta')).status, 200);
  const restored = (await call(undefined, 'alpha', groupId)).data.souls[0]; assert.equal(restored.revision, 4);
  assert.equal(restored.formula, rows[0].formula);
});

test('Only group administrators publish the current immutable snapshot; retries return the same post', async () => {
  assert.equal((await call({ action: 'publish', soulId, revision: 4 }, 'beta')).status, 403);
  assert.equal((await call({ action: 'publish', soulId, revision: 3 })).status, 409);
  assert.equal((await call({ action: 'publish', soulId, revision: 4, visibility: 'PUBLIC' })).status, 403);
  const first = await call({ action: 'publish', soulId, revision: 4 }); assert.equal(first.status, 200); postId = first.data.postId;
  assert.equal((await call({ action: 'publish', soulId, revision: 4 })).data.postId, postId);
  assert.equal(sql.prepare('SELECT count(*) n FROM x1_group_posts').get().n, 1);
  const page = (await call(undefined, 'gamma', groupId)).data;
  assert.equal(page.posts.length, 1); assert.equal(page.posts[0].formula, page.souls[0].formula);
  assert.equal(page.posts[0].superCount, 0); assert.equal(page.posts[0].commentCount, 0);
});

test('Supers are explicit idempotent desired-state writes, unique per account and unauthorized IDs fail', async () => {
  assert.equal((await call({ action: 'super', postId, active: true }, 'outsider')).status, 404);
  assert.equal((await call({ action: 'super', postId }, 'beta')).status, 400);
  const runs = await Promise.all(Array.from({ length: 4 }, () => call({ action: 'super', postId, active: true }, 'beta')));
  assert.ok(runs.every(r => r.status === 200));
  assert.equal(sql.prepare('SELECT count(*) n FROM x1_supers WHERE post_id=?').get(postId).n, 1);
  assert.equal((await call(undefined, 'beta', groupId)).data.posts[0].supered, true);
  assert.equal((await call({ action: 'super', postId, active: false }, 'beta')).data.superCount, 0);
  assert.equal((await call({ action: 'super', postId, active: false }, 'beta')).data.superCount, 0);
  assert.equal((await call({ action: 'super', postId, active: true }, 'gamma')).data.superCount, 1);
});

test('Comments survive reload, retries deduplicate, and parent comments cannot cross posts', async () => {
  const made = await call({ action: 'comment', postId, text: 'Can we explain this window choice?', requestId: 'comment-request-0001' }, 'beta');
  assert.equal(made.status, 200); commentId = made.data.commentId;
  assert.equal((await call({ action: 'comment', postId, text: 'Can we explain this window choice?', requestId: 'comment-request-0001' }, 'beta')).data.commentId, commentId);
  assert.equal((await call({ action: 'comment', postId, text: 'Different text', requestId: 'comment-request-0001' }, 'beta')).status, 409);
  assert.equal((await call({ action: 'comment', postId, parentId: commentId, text: 'The previous revision is available for comparison.' })).status, 200);
  assert.equal((await call({ action: 'comment', postId, text: 'Unauthorized contribution' }, 'outsider')).status, 404);
  const other = await call({ action: 'create-soul', groupId, ...content, title: 'Another test method' });
  const published = await call({ action: 'publish', soulId: other.data.soulId, revision: 1 }); post2 = published.data.postId;
  assert.equal((await call({ action: 'comment', postId: post2, parentId: commentId, text: 'Wrong thread' }, 'beta')).status, 404);
  const state = (await call(undefined, 'beta', groupId)).data;
  assert.equal(state.comments.length, 2); assert.ok(state.comments.some(c => c.id === commentId && c.isMine));
  assert.equal((await call({ action: 'edit-comment', commentId, text: 'Illicit rewrite' })).status, 404);
  assert.equal((await call({ action: 'edit-comment', commentId, text: 'Updated own question.' }, 'beta')).status, 200);
  assert.equal((await call(undefined, 'beta', groupId)).data.comments.find(c => c.id === commentId).text, 'Updated own question.');
});

test('Reports are private to group administrators and moderation enforces hidden-post permissions', async () => {
  assert.equal((await call({ action: 'report', postId, reason: 'Please review this methodology disclosure.' }, 'beta')).status, 200);
  assert.equal((await call(undefined, 'beta', groupId)).data.reports.length, 0);
  assert.equal((await call(undefined, 'alpha', groupId)).data.reports.length, 1);
  assert.equal((await call({ action: 'moderate', postId, hidden: true }, 'beta')).status, 403);
  assert.equal((await call({ action: 'moderate', postId, hidden: true })).status, 200);
  assert.equal((await call(undefined, 'gamma', groupId)).data.posts.some(p => p.id === postId), false);
  assert.equal((await call({ action: 'super', postId, active: true }, 'gamma')).status, 404);
  assert.equal((await call({ action: 'comment', postId, text: 'Hidden post comment.' }, 'beta')).status, 404);
  assert.equal((await call({ action: 'moderate', postId, hidden: false })).status, 200);
});

test('Only owners assign administrative roles, transfer ownership, and handles do not control ownership', async () => {
  assert.equal((await call({ action: 'set-role', groupId, handle: 'gamma_body', role: 'ADMIN' }, 'beta')).status, 403);
  assert.equal((await call({ action: 'set-role', groupId, handle: 'gamma_body', role: 'ADMIN' })).status, 200);
  assert.equal((await call({ action: 'invite', groupId, handle: 'outside_body', role: 'ADMIN' }, 'gamma')).status, 403);
  assert.equal((await call({ action: 'leave-group', groupId })).status, 409);
  assert.equal((await call(profile('renamed_alpha'))).status, 200);
  assert.equal((await call(undefined, 'alpha', groupId)).data.selectedGroup.role, 'OWNER');
  assert.equal((await call(undefined, 'alpha', groupId)).data.revisions.find(r => r.revision === 1 && r.soulId === soulId).authorHandle, 'alpha_body');
  assert.equal((await call({ action: 'transfer-owner', groupId, handle: 'beta_body' })).status, 200);
  assert.equal((await call(undefined, 'beta', groupId)).data.selectedGroup.role, 'OWNER');
  assert.equal((await call({ action: 'leave-group', groupId })).status, 200);
  assert.equal((await call(undefined, 'alpha', groupId)).status, 404);
  assert.equal(plain(await repository.exportCommunityData('alpha')).authoredRevisions.length, 0, 'Removed members cannot export private group methodology snapshots.');
});

test('Revoked invitations cannot add members and privacy helpers anonymize contributions before cascade erasure', async () => {
  const invite = await call({ action: 'invite', groupId, handle: 'outside_body', role: 'EDITOR' }, 'beta');
  assert.equal(invite.status, 200);
  assert.equal((await call({ action: 'revoke-invite', invitationId: invite.data.invitationId }, 'beta')).status, 200);
  assert.equal((await call({ action: 'accept-invite', code: invite.data.code }, 'outsider')).status, 409);
  const exported = plain(await repository.exportCommunityData('beta'));
  assert.equal(exported.body.handle, 'beta_body'); assert.ok(exported.authoredRevisions.length >= 1);
  await DB.batch([...repository.communityPrivacyStatements('gamma'), DB.prepare('DELETE FROM accounts WHERE subject=?').bind('gamma')]);
  assert.equal(sql.prepare('SELECT count(*) n FROM x1_bodies WHERE subject=?').get('gamma').n, 0);
  assert.equal(sql.prepare('SELECT count(*) n FROM x1_supers WHERE subject=?').get('gamma').n, 0);
  assert.equal((await call(undefined, 'beta', groupId)).data.members.some(m => m.handle === 'gamma_body'), false);
  assert.equal(sql.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('Community mutation rate cap is atomic and rejected requests do not save profile changes', async () => {
  const runs = await Promise.all(Array.from({ length: 31 }, (_, i) => call(profile('outside_body', { displayName: 'Rate fixture ' + i }), 'outsider')));
  assert.equal(runs.filter(r => r.status === 200).length, 30);
  assert.equal(runs.filter(r => r.status === 429).length, 1);
  assert.equal(sql.prepare('SELECT count FROM rate_limits WHERE key=?').get('outsider:x1-community-write').count, 30);
});
