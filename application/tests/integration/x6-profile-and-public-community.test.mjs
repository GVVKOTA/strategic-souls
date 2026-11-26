/** X6 integration tests: /api/profile ownership, 50-avatar persistence, preferences & /api/community/public. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { webcrypto, randomUUID } from 'node:crypto';
import { d1MigrationsDir } from '../helpers/paths.mjs';

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const file of readdirSync(d1MigrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  sql.exec(readFileSync(resolve(d1MigrationsDir, file), 'utf8'));
}

class Statement {
  constructor(query, args = []) {
    this.query = query;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.query, args);
  }
  async first() {
    return sql.prepare(this.query).get(...this.args) ?? null;
  }
  async all() {
    return { results: sql.prepare(this.query).all(...this.args), success: true };
  }
  execute() {
    const r = sql.prepare(this.query).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async run() {
    return this.execute();
  }
}

const DB = {
  prepare: (query) => new Statement(query),
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const out = statements.map((s) => s.execute());
      sql.exec('COMMIT');
      return out;
    } catch (err) {
      sql.exec('ROLLBACK');
      throw err;
    }
  },
};

let currentUser = null;
const context = vm.createContext({
  console,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: { subtle: webcrypto.subtle, randomUUID },
  URL,
  Intl,
  Date,
  Uint8Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
});
const cache = new Map();

async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  if (file.replaceAll('\\', '/').endsWith('/backend/auth/session.ts')) {
    const m = new vm.SyntheticModule(
      ['getAuthenticatedUser'],
      function () {
        this.setExport('getAuthenticatedUser', async () => currentUser);
      },
      { context },
    );
    cache.set(file, m);
    return m;
  }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const m = new vm.SourceTextModule(code, { context, identifier: file });
  cache.set(file, m);
  await m.link(async (spec, refer) => {
    if (spec === 'cloudflare:workers') {
      if (!cache.has(spec)) {
        cache.set(
          spec,
          new vm.SyntheticModule(
            ['env'],
            function () {
              this.setExport('env', { DB });
            },
            { context },
          ),
        );
      }
      return cache.get(spec);
    }
    let target = resolve(dirname(refer.identifier), spec);
    if (!existsSync(target)) target += '.ts';
    return load(target);
  });
  return m;
}

const profileRoute = await load('app/api/profile/route.ts');
await profileRoute.evaluate();
const publicCommRoute = await load('app/api/community/public/route.ts');
await publicCommRoute.evaluate();
const commRoute = await load('app/api/x1/community/route.ts');
await commRoute.evaluate();
const socialRoute = await load('app/api/x2/social/route.ts');
await socialRoute.evaluate();

// Seed two isolated synthetic users in auth_users + accepted consent in accounts
const now = new Date().toISOString();
for (const [id, email, name] of [
  ['user_alice', 'alice@example.invalid', 'Alice Researcher'],
  ['user_bob', 'bob@example.invalid', 'Bob Analyst'],
]) {
  sql
    .prepare(
      'INSERT INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, email, name, 'hash', 'salt', 'password', now, now);
  sql
    .prepare(
      'INSERT INTO accounts (subject, alias, adult_confirmed, consent_version, consent_at, last_active) VALUES (?, ?, 1, ?, ?, ?)',
    )
    .run(id, name, '2026-11-14-v4', now, now);
}

async function callProfile(input, user = { userId: 'user_alice', email: 'alice@example.invalid', displayName: 'Alice Researcher', authProvider: 'password' }, extraHeaders = {}) {
  currentUser = user;
  const req = new Request('https://test.invalid/api/profile', {
    method: input === undefined ? 'GET' : 'POST',
    headers: {
      origin: 'https://test.invalid',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const res = await profileRoute.namespace[input === undefined ? 'GET' : 'POST'](req);
  return { status: res.status, data: await res.json(), headers: res.headers };
}

test.beforeEach(() => sql.prepare('DELETE FROM rate_limits').run());

test('/api/profile rejects unauthenticated and cross-origin requests', async () => {
  assert.equal((await callProfile(undefined, null)).status, 401);
  assert.equal((await callProfile({ action: 'update-avatar', avatarId: 'b04' }, null)).status, 401);
  assert.equal(
    (
      await callProfile(
        { action: 'update-avatar', avatarId: 'b04' },
        { userId: 'user_alice', email: 'alice@example.invalid', displayName: 'Alice Researcher', authProvider: 'password' },
        { origin: 'https://evil.invalid' },
      )
    ).status,
    403,
  );
});

test('/api/profile persists avatar selection from 50 presets, rejects invalid IDs, and resists IDOR', async () => {
  const initial = await callProfile();
  assert.equal(initial.status, 200);
  assert.match(initial.data.profile.avatarId, /^[a-e](?:0[1-9]|10)$/);
  assert.equal(initial.headers.get('cache-control'), 'private, no-store');

  // Idempotent one-time backfill: second read returns the exact same assigned avatar
  const initialRepeat = await callProfile();
  assert.equal(initialRepeat.data.profile.avatarId, initial.data.profile.avatarId);

  const bobInitial = await callProfile(undefined, {
    userId: 'user_bob',
    email: 'bob@example.invalid',
    displayName: 'Bob Analyst',
    authProvider: 'password',
  });
  assert.match(bobInitial.data.profile.avatarId, /^[a-e](?:0[1-9]|10)$/);

  // Invalid external URL or arbitrary preset ID rejected with 400
  const bad1 = await callProfile({ action: 'update-avatar', avatarId: 'https://evil.invalid/a.svg' });
  assert.equal(bad1.status, 400);
  const bad2 = await callProfile({ action: 'update-avatar', avatarId: 'z99' });
  assert.equal(bad2.status, 400);

  // Valid update persists and ignores forged target userId (IDOR protection)
  const targetAvatar = bobInitial.data.profile.avatarId === 'e07' ? 'e08' : 'e07';
  const ok = await callProfile({
    action: 'update-avatar',
    avatarId: targetAvatar,
    userId: 'user_bob',
    subject: 'user_bob',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.profile.avatarId, targetAvatar);

  // Verify Alice updated & Bob untouched
  const aliceAfter = await callProfile();
  assert.equal(aliceAfter.data.profile.avatarId, targetAvatar);
  const bobAfter = await callProfile(undefined, {
    userId: 'user_bob',
    email: 'bob@example.invalid',
    displayName: 'Bob Analyst',
    authProvider: 'password',
  });
  assert.equal(bobAfter.data.profile.avatarId, bobInitial.data.profile.avatarId);
  if (targetAvatar !== 'e07') {
    await callProfile({ action: 'update-avatar', avatarId: 'e07' });
  }
});

test('/api/profile updates handle, displayName, bio, preferences and syncs x1_bodies', async () => {
  const updated = await callProfile({
    action: 'update-profile',
    displayName: 'Alice Quant',
    handle: 'alice_quant',
    bio: 'Studying sovereign yields and global FX.',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.profile.displayName, 'Alice Quant');
  assert.equal(updated.data.profile.handle, 'alice_quant');
  assert.equal(updated.data.profile.avatarId, 'e07');

  // Verify x1_bodies synced with avatarId e07
  const bodyRow = sql.prepare('SELECT handle, avatar, display_name FROM x1_bodies WHERE subject=?').get('user_alice');
  assert.equal(bodyRow.handle, 'alice_quant');
  assert.equal(bodyRow.avatar, 'e07');
  assert.equal(bodyRow.display_name, 'Alice Quant');

  // Handle collision from Bob returns 409
  const collide = await callProfile(
    { action: 'update-profile', displayName: 'Bob', handle: 'ALICE_QUANT', bio: '' },
    { userId: 'user_bob', email: 'bob@example.invalid', displayName: 'Bob Analyst', authProvider: 'password' },
  );
  assert.equal(collide.status, 409);

  // Preferences persist cleanly
  const prefs = await callProfile({
    action: 'update-preferences',
    motion: 'minimal',
    density: 'compact',
    earthQuality: 'reduced',
    social: { discoverable: true, messages: 'GROUPS' },
  });
  assert.equal(prefs.status, 200);
  assert.equal(prefs.data.profile.preferences.motion, 'minimal');
  assert.equal(prefs.data.profile.preferences.density, 'compact');
  assert.equal(prefs.data.profile.preferences.earthQuality, 'reduced');
  assert.equal(prefs.data.profile.social.discoverable, true);
  assert.equal(prefs.data.profile.social.messages, 'GROUPS');
});

test('/api/community/public returns ONLY explicitly opt-in discoverable rooms with zero private leakage', async () => {
  currentUser = { userId: 'user_alice', email: 'alice@example.invalid', displayName: 'Alice Quant', authProvider: 'password' };
  const makeRoom = async (name) => {
    const req = new Request('https://test.invalid/api/x1/community', {
      method: 'POST',
      headers: { origin: 'https://test.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create-group', name, description: 'Macro study room' }),
    });
    const res = await commRoute.namespace.POST(req);
    return (await res.json()).groupId;
  };

  const privateRoomId = await makeRoom('Secret Private Desk');
  const publicRoomId = await makeRoom('Public Macro Room');
  assert.ok(privateRoomId && publicRoomId);

  // Opt ONLY publicRoomId into directory discovery
  const dirReq = new Request('https://test.invalid/api/x2/social', {
    method: 'POST',
    headers: { origin: 'https://test.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'group-directory',
      groupId: publicRoomId,
      handle: 'public_macro',
      discoverable: true,
    }),
  });
  const dirRes = await socialRoute.namespace.POST(dirReq);
  assert.equal(dirRes.status, 200);

  // Unauthenticated guest hits /api/community/public
  currentUser = null;
  const pubRes = await publicCommRoute.namespace.GET(
    new Request('https://test.invalid/api/community/public'),
  );
  assert.equal(pubRes.status, 200);
  const pubData = await pubRes.json();
  assert.equal(pubData.rooms.length, 1);
  assert.equal(pubData.rooms[0].name, 'Public Macro Room');
  assert.equal(pubData.rooms[0].handle, 'public_macro');
  const serialized = JSON.stringify(pubData);
  assert.ok(!serialized.includes('Secret Private Desk'), 'Private room must NEVER leak');
  assert.ok(!serialized.includes('alice@example.invalid'), 'Email must NEVER leak');
  assert.ok(!serialized.includes('user_alice'), 'Internal subject ID must NEVER leak');
});
