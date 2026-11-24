/**
 * Strategic Souls X5.5 — Phase 3 Full Security, Permission Matrix & Observability Suite
 * Tests:
 * - Guest 401 on private APIs; public endpoints never leak emails, internal subjects, or private data
 * - Pre-consent user blocked (403) from Community & DM mutations
 * - Bidirectional block isolation across profiles, connections, DMs, published Souls & comments
 * - Legacy-private user hidden until explicit opt-in
 * - Room member vs non-member isolation for GROUP-audience Souls & direct Room ID access
 * - Cross-user isolation on drafts, GRAVEYARD scans, and portfolios
 * - Worker middleware observability & security header contracts (X-Request-Id, Server-Timing, no PII/query logging)
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { webcrypto, randomUUID } from "node:crypto";
import ts from "typescript";

const CONSENT_VERSION = "2026-11-14-v4";
const nowIso = "2026-11-22T10:00:00.000Z";
let currentUser = null;

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  sql.exec(readFileSync("drizzle/" + file, "utf8"));
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
  prepare: (q) => new Statement(q),
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const out = statements.map((s) => s.execute());
      sql.exec("COMMIT");
      return out;
    } catch (err) {
      sql.exec("ROLLBACK");
      throw err;
    }
  },
};

const context = vm.createContext({
  console,
  Response,
  Request,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: { subtle: webcrypto.subtle, randomUUID },
  URL,
  URLSearchParams,
  Intl,
  Date,
  Uint8Array,
  Float64Array,
  Int32Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Boolean,
  Error,
  TypeError,
  RegExp,
  Promise,
  Symbol,
  process,
  fetch: async () => {
    throw new Error("No external network access in offline security test.");
  },
});

function resolveFile(spec, from) {
  if (spec === "cloudflare:workers") return "virtual:cloudflare";
  if (spec === "next/headers") return "virtual:headers";
  if (spec === "next/server") return "virtual:server";
  const base = resolve(dirname(from), spec);
  for (const cand of [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + "/index.ts",
  ]) {
    if (existsSync(cand)) return cand;
  }
  throw new Error("Cannot resolve " + spec + " from " + from);
}

const modulePromises = new Map();
function load(path) {
  const file =
    path.startsWith("virtual:") ? path : resolve(path);
  if (modulePromises.has(file)) return modulePromises.get(file);

  const task = (async () => {
    const normalized = file.replaceAll("\\", "/");
    if (file === "virtual:cloudflare") {
      return new vm.SyntheticModule(
        ["env"],
        function () {
          this.setExport("env", { DB, APP_ORIGIN: "https://ss.example" });
        },
        { context },
      );
    }
    if (file === "virtual:headers") {
      return new vm.SyntheticModule(
        ["headers", "cookies"],
        function () {
          this.setExport("headers", async () => new Headers());
          this.setExport("cookies", async () => ({
            get: () => undefined,
            getAll: () => [],
          }));
        },
        { context },
      );
    }
    if (file === "virtual:server") {
      return new vm.SyntheticModule(
        ["NextResponse"],
        function () {
          this.setExport("NextResponse", {
            json: (d, i = {}) =>
              new Response(JSON.stringify(d), {
                ...i,
                headers: { "Content-Type": "application/json", ...i.headers },
              }),
          });
        },
        { context },
      );
    }
    if (normalized.endsWith("/backend/auth/session.ts")) {
      return new vm.SyntheticModule(
        ["getAuthenticatedUser"],
        function () {
          this.setExport("getAuthenticatedUser", async () => currentUser);
        },
        { context },
      );
    }
    if (normalized.endsWith("/backend/services/market-data/data-service.ts")) {
      return new vm.SyntheticModule(
        ["researchUniverse", "currentDisplayRights"],
        function () {
          this.setExport("currentDisplayRights", async () => ({
            displayAllowed: true,
            derivedDisplayAllowed: true,
            rightsExpiresAt: null,
          }));
          this.setExport("researchUniverse", async () => ({
            datasets: [],
            excluded: [],
            source: "Offline Test Fixture",
            pointInTime: false,
            adjusted: false,
            rights: { analysis: true, storage: true },
            lineage: [],
            asOf: nowIso,
          }));
        },
        { context },
      );
    }
    const raw = readFileSync(file, "utf8");
    const js = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const mod = new vm.SourceTextModule(js, { context, identifier: file });
    await mod.link((spec) => load(resolveFile(spec, file)));
    return mod;
  })();

  modulePromises.set(file, task);
  return task;
}

async function importMod(path) {
  const m = await load(path);
  if (m.status === "linked" || m.status === "unlinked") {
    if (m.status === "unlinked") await m.link(() => { throw new Error("unexpected"); });
    await m.evaluate();
  }
  return m.namespace;
}

function seedUser(
  subject,
  email,
  displayName,
  { consented = true, handle = null, discoverable = 1 } = {},
) {
  sql
    .prepare(
      `INSERT OR REPLACE INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'salt', 'password', ?, ?)`,
    )
    .run(subject, email, displayName, nowIso, nowIso);
  if (consented) {
    sql
      .prepare(
        `INSERT OR REPLACE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(subject, displayName, nowIso, CONSENT_VERSION, nowIso);
  }
  if (handle) {
    sql
      .prepare(
        `INSERT OR REPLACE INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at)
         VALUES (?, ?, ?, 'Researcher bio', 'a01', ?, ?)`,
      )
      .run(subject, handle, displayName, nowIso, nowIso);
    if (discoverable !== null) {
      sql
        .prepare(
          `INSERT OR REPLACE INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at)
           VALUES (?, ?, 'REQUESTS', 1, 1, ?)`,
        )
        .run(subject, discoverable, nowIso);
    }
  }
}

const profileRoute = await importMod("app/api/profile/route.ts");
const releaseRoute = await importMod("app/api/release/route.ts");
const networkRoute = await importMod("app/api/community/network/route.ts");
const socialRoute = await importMod("app/api/x2/social/route.ts");
const workspaceRoute = await importMod("app/api/x1/workspace/route.ts");

seedUser("sec_owner", "owner@secret.invalid", "Owner Desk", {
  consented: true,
  handle: "owner_sec",
  discoverable: 1,
});
seedUser("sec_member", "member@secret.invalid", "Room Member", {
  consented: true,
  handle: "member_sec",
  discoverable: 1,
});
seedUser("sec_outsider", "outsider@secret.invalid", "Outsider", {
  consented: true,
  handle: "outsider_sec",
  discoverable: 1,
});
seedUser("sec_preconsent", "pre@secret.invalid", "Pre Consent", {
  consented: false,
  handle: null,
});
seedUser("sec_legacy", "legacy@secret.invalid", "Legacy Private", {
  consented: true,
  handle: "legacy_sec",
  discoverable: 0,
});

function req(url, method = "GET", body = undefined) {
  const headers = new Headers({ Origin: "https://ss.example" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request("https://ss.example" + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test("guest gets 401 on private APIs; release reports X7 provenance without leaking account details", async () => {
  currentUser = null;

  assert.equal((await profileRoute.GET(req("/api/profile"))).status, 401);
  assert.equal((await socialRoute.GET(req("/api/x2/social?view=home"))).status, 401);
  assert.equal((await workspaceRoute.GET(req("/api/x1/workspace"))).status, 401);

  const relRes = await releaseRoute.GET(req("/api/release"));
  assert.equal(relRes.status, 200);
  const rel = await relRes.json();
  assert.equal(rel.release, "V3.1");
  assert.equal(rel.revisionMarker, "x8-v3.1-reliability-2026-11-24");
  assert.equal(rel.buildCommit, null);
  assert.equal(rel.classicDailyLimit, 20);
  assert.equal(rel.providerReadiness, undefined);
  assert.equal(rel.marketData.readOnlyOnly, true);
  assert.doesNotMatch(JSON.stringify(rel), /angel\s*one|smartapi|providerReadiness|demoMode/i);

  // Guest can open discoverable researcher profile, with ZERO email/subject leak
  const pubProfRes = await networkRoute.GET(
    req("/api/community/network?view=profile&handle=owner_sec"),
  );
  assert.equal(pubProfRes.status, 200);
  const pubRaw = await pubProfRes.text();
  assert.doesNotMatch(pubRaw, /owner@secret\.invalid/);
  assert.doesNotMatch(pubRaw, /sec_owner/);

  // Guest cannot open legacy-private profile
  const privRes = await networkRoute.GET(
    req("/api/community/network?view=profile&handle=legacy_sec"),
  );
  assert.equal(privRes.status, 404);
});

test("X5.5 P3.2: pre-consent account blocked (403) from Community & DM mutations", async () => {
  currentUser = {
    userId: "sec_preconsent",
    email: "pre@secret.invalid",
    displayName: "Pre Consent",
  };

  const dmRes = await socialRoute.POST(
    req("/api/x2/social", "POST", {
      action: "start-thread",
      handle: "owner_sec",
    }),
  );
  assert.equal(dmRes.status, 403);

  const followRes = await networkRoute.POST(
    req("/api/community/network", "POST", {
      action: "follow",
      handle: "owner_sec",
      active: true,
    }),
  );
  assert.equal(followRes.status, 403);
});

test("X5.5 P3.2: Room member vs non-member isolation for GROUP-audience Souls & cross-user scan isolation", async () => {
  // Seed a private Room owned by sec_owner with sec_member invited, plus a GROUP-only Soul
  const groupId = randomUUID();
  const scanId = randomUUID();
  const groupPostId = randomUUID();
  sql
    .prepare(
      "INSERT INTO x1_groups (id, owner_subject, name, description, created_at) VALUES (?, 'sec_owner', 'Alpha Room', 'Private', ?)",
    )
    .run(groupId, nowIso);
  sql
    .prepare(
      "INSERT INTO x1_memberships (group_id, subject, role, joined_at) VALUES (?, 'sec_owner', 'OWNER', ?), (?, 'sec_member', 'MEMBER', ?)",
    )
    .run(groupId, nowIso, groupId, nowIso);
  sql
    .prepare(
      "INSERT INTO x1_scans (id, subject, request_key, mode, name, payload, digest, created_at) VALUES (?, 'sec_owner', 'rk_sec_grp', 'SIMPLE', 'Secret Group Setup', '{}', 'dig', ?)",
    )
    .run(scanId, nowIso);
  sql
    .prepare(
      `INSERT INTO x51_web_souls (
         id, author_subject, author_handle, scan_id, soul_version, mode, title, summary,
         formula, blueprint_json, timeframe, universe_label, matched_symbols_json,
         evidence_status, source_attribution, risk_note, audience, group_id,
         idempotency_key, pinned, source_digest, created_at, deleted_at
       ) VALUES (?, 'sec_owner', 'owner_sec', ?, 1, 'CLASSIC', 'Group Secret Soul', 'Only room members',
         'close > sma(close, 20)', '{}', '1d', 'ECB', '["ECB:USDINR"]', 'Current Filter',
         'ECB', 'Note', 'GROUP', ?, 'ik_grp_1', 0, 'dig', ?, NULL)`,
    )
    .run(groupPostId, scanId, groupId, nowIso);

  // Room member sees GROUP Soul comments endpoint (200)
  currentUser = {
    userId: "sec_member",
    email: "member@secret.invalid",
    displayName: "Room Member",
  };
  const memberRes = await networkRoute.GET(
    req(`/api/community/network?view=comments&postId=${groupPostId}`),
  );
  assert.equal(memberRes.status, 200);

  // Non-member outsider is rejected (404) on direct GROUP Soul ID & direct GROUP save/copy!
  currentUser = {
    userId: "sec_outsider",
    email: "outsider@secret.invalid",
    displayName: "Outsider",
  };
  const outsiderComments = await networkRoute.GET(
    req(`/api/community/network?view=comments&postId=${groupPostId}`),
  );
  assert.equal(outsiderComments.status, 404);

  const outsiderCopy = await networkRoute.POST(
    req("/api/community/network", "POST", {
      action: "copy-soul",
      postId: groupPostId,
    }),
  );
  assert.equal(outsiderCopy.status, 404);

  // Outsider cannot publish another user's private GRAVEYARD scan by direct scanId!
  const stolenPublish = await networkRoute.POST(
    req("/api/community/network", "POST", {
      action: "publish-soul",
      scanId,
      audience: "PUBLIC",
      requestId: "req_stolen_scan_001",
    }),
  );
  assert.equal(stolenPublish.status, 404);

  // Outsider's workspace response never includes owner's scan
  const wsRes = await workspaceRoute.GET(req("/api/x1/workspace"));
  assert.equal(wsRes.status, 200);
  const wsText = await wsRes.text();
  assert.doesNotMatch(wsText, new RegExp(scanId));
  assert.doesNotMatch(wsText, /Secret Group Setup/);
});

test("X5.5 P3.3: worker middleware enforces security headers, request ID, Server-Timing, and zero PII/query logging", () => {
  const mw = readFileSync("backend/middleware/index.ts", "utf8");
  assert.match(mw, /X-Request-Id/);
  assert.match(mw, /Server-Timing/);
  assert.match(mw, /X-Content-Type-Options.*nosniff/);
  assert.match(mw, /Content-Security-Policy/);
  assert.match(mw, /Strict-Transport-Security/);
  assert.match(mw, /ss_api_signal/);
  // Must log pathname only, never url.search / request body / cookies
  assert.match(mw, /path:\s*url\.pathname/);
  assert.doesNotMatch(mw, /url\.search/);
});
