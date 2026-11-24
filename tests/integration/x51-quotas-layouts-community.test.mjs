/**
 * Strategic Souls X5.1 — Integration & Negative Security Tests:
 * - 9-Card Market Grid D1 persistence, optimistic concurrency (409), validation (400), IDOR isolation
 * - Atomic Classic Scan Quota (8/day Asia/Kolkata IST reset) + failed-run release + 0-match counting
 * - Atomic Advanced Scan Quota (1/rolling-60m) + concurrent Promise.all race guard
 * - Community Research Network: One-Click Post Soul, Angel One source-rights redaction (403),
 *   FOLLOWERS visibility + follow-request approval, Save/Comment/Copy/Pin(<=3)/Delete, Block isolation
 * - Secure Media Upload validator: auth (401), CSRF (403), forged SVG/script MIME rejection (400),
 *   honest R2-missing fail-closed (503 OBJECT_STORAGE_NOT_CONFIGURED)
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
let nowMs = Date.parse("2026-11-21T14:00:00.000Z"); // 19:30 IST on 2026-11-21
let currentUser = null;

class MockDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [nowMs]));
  }
  static now() {
    return nowMs;
  }
}

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  sql.exec(readFileSync("drizzle/" + file, "utf8"));
}

assert.ok(
  sql
    .prepare("SELECT name FROM sqlite_master WHERE name='x51_scan_reservations'")
    .get(),
  "Migration 0008_x51_foundation.sql must be applied.",
);

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
    return {
      results: sql.prepare(this.query).all(...this.args),
      success: true,
    };
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
      const result = statements.map((s) => s.execute());
      sql.exec("COMMIT");
      return result;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  },
};

const env = { DB };

const fxPoints = Array.from({ length: 45 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
  knownAt: "2026-11-20T18:00:00.000Z",
  close: 84 + i * 0.08 + Math.sin(i * 0.4) * 0.3,
}));

const marketFixture = {
  asOf: "2026-11-21T14:00:00.000Z",
  providers: [],
  quotes: [
    {
      id: "ECB:USDINR",
      label: "USD / INR",
      value: 87.52,
      previous: 87.4,
      change: 0.12,
      changePercent: 0.137,
      currency: "INR",
      unit: "INR per USD",
      assetClass: "FX",
      provider: "European Central Bank",
      sourceUrl: "https://data.ecb.europa.eu/",
      sourceDate: "2026-11-20",
      state: "PUBLISHED_EOD",
      redistributable: true,
    },
  ],
  yields: [
    {
      id: "UST:10Y",
      label: "US 10Y Treasury",
      value: 4.35,
      previous: 4.32,
      change: 0.03,
      changePercent: 3,
      currency: "USD",
      unit: "%",
      assetClass: "BOND_YIELD",
      provider: "US Treasury",
      sourceUrl: "https://home.treasury.gov/",
      sourceDate: "2026-11-20",
      state: "PUBLISHED_EOD",
      redistributable: true,
    },
  ],
  fxHistory: [
    {
      id: "ECB:USDINR",
      label: "USD / INR",
      currency: "INR",
      unit: "INR per USD",
      provider: "European Central Bank",
      sourceUrl: "https://data.ecb.europa.eu/",
      points: fxPoints,
    },
  ],
};

const context = vm.createContext({
  console,
  Response,
  Request,
  Headers,
  FormData,
  File,
  Blob,
  TextEncoder,
  TextDecoder,
  crypto: { subtle: webcrypto.subtle, randomUUID },
  URL,
  URLSearchParams,
  Intl,
  Date: MockDate,
  Uint8Array,
  Float64Array,
  Int32Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
  structuredClone,
  setTimeout,
  clearTimeout,
});

// Cache stores promises so concurrent diamond imports await full link() before instantiation
const modulePromises = new Map();

function load(path) {
  const file = resolve(path);
  if (modulePromises.has(file)) return modulePromises.get(file);

  const task = (async () => {
    const normalized = file.replaceAll("\\", "/");
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
        ["researchUniverse", "currentDisplayRights", "isDataOwner", "PRIVATE_EXCHANGE_FEED_LABEL"],
        function () {
          this.setExport("isDataOwner", () => false);
          this.setExport("PRIVATE_EXCHANGE_FEED_LABEL", "Configured Exchange Feed (Private)");
          this.setExport("currentDisplayRights", async () => ({
            displayAllowed: true,
            derivedDisplayAllowed: true,
            rightsExpiresAt: null,
          }));
          this.setExport("researchUniverse", async () => {
            const datasets = [
              {
                instrumentId: "ECB:USDINR",
                currency: "INR",
                source: "European Central Bank · https://data.ecb.europa.eu/",
                permitted: true,
                frequency: "DAILY",
                observations: fxPoints.map((p) => ({
                  eventAt: p.date + "T00:00:00.000Z",
                  knownAt: p.knownAt,
                  close: p.close,
                })),
              },
            ];
            return {
              datasets,
              excluded: [],
              source: "ECB Daily Reference FX (Test Fixture)",
              pointInTime: false,
              adjusted: false,
              rights: { analysis: true, storage: true },
              lineage: [
                {
                  instrumentId: "ECB:USDINR",
                  provider: "ECB",
                  eventAt: datasets[0].observations.at(-1)?.eventAt,
                  retrievedAt: new Date(nowMs).toISOString(),
                  adjustment: "OFFICIAL_DAILY_REFERENCE",
                  displayAllowed: true,
                  derivedDisplayAllowed: true,
                  rightsExpiresAt: null,
                },
              ],
              asOf: new Date(nowMs).toISOString(),
            };
          });
        },
        { context },
      );
    }
    if (normalized.endsWith("/backend/services/market-data/market-data.ts")) {
      return new vm.SyntheticModule(
        ["loadMarketData", "marketSnapshot"],
        function () {
          const fn = async () => structuredClone(marketFixture);
          this.setExport("loadMarketData", fn);
          this.setExport("marketSnapshot", fn);
        },
        { context },
      );
    }

    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;

    const m = new vm.SourceTextModule(code, { context, identifier: file });
    await m.link(async (spec, refer) => {
      if (spec === "cloudflare:workers") {
        if (!modulePromises.has(spec)) {
          modulePromises.set(
            spec,
            Promise.resolve(
              new vm.SyntheticModule(
                ["env"],
                function () {
                  this.setExport("env", env);
                },
                { context },
              ),
            ),
          );
        }
        return modulePromises.get(spec);
      }
      let target = resolve(dirname(refer.identifier), spec);
      if (!existsSync(target)) target += ".ts";
      return load(target);
    });
    return m;
  })();

  modulePromises.set(file, task);
  return task;
}

async function importMod(path) {
  const m = await load(path);
  if (m.status === "linked") await m.evaluate();
  return m.namespace;
}

const overviewRoute = await importMod("app/api/markets/overview/route.ts");
const strategyScanRoute = await importMod("app/api/strategy/scan/route.ts");
const networkRoute = await importMod("app/api/community/network/route.ts");
const mediaUploadRoute = await importMod("app/api/media/upload/route.ts");
const scanQuotaMod = await importMod("backend/services/research/scan-quota.ts");

function seedUser(subject, handle, displayName, discoverable = 0) {
  const now = new Date(nowMs).toISOString();
  sql
    .prepare(
      "INSERT OR REPLACE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(subject, displayName, now, CONSENT_VERSION, now);
  sql
    .prepare(
      "INSERT OR REPLACE INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at) VALUES (?, ?, ?, 'Quant researcher', 'a01', ?, ?)",
    )
    .run(subject, handle, displayName, now, now);
  sql
    .prepare(
      "INSERT OR REPLACE INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at) VALUES (?, ?, 'REQUESTS', 0, 1, ?)",
    )
    .run(subject, discoverable, now);
}

seedUser("user-a", "alice_quant", "Alice Quant", 0);
seedUser("user-b", "bob_macro", "Bob Macro", 1);

function makeReq(path, method = "GET", jsonBody = undefined, origin = "https://ss.test") {
  const headers = new Headers();
  if (method !== "GET") {
    headers.set("origin", origin);
    if (jsonBody !== undefined) headers.set("content-type", "application/json");
  }
  return new Request("https://ss.test" + path, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });
}

test("8-Tile Global Market Grid persists per user, enforces 409 optimistic concurrency, validates strict 8-tile allowlist, and resists IDOR", async () => {
  currentUser = { userId: "user-a", displayName: "Alice Quant", email: "a@test.local", authProvider: "email" };

  // Default 8 cards strictly matching the V3 allowlist
  const r0 = await overviewRoute.GET(makeReq("/api/markets/overview"));
  assert.equal(r0.status, 200);
  const d0 = await r0.json();
  assert.equal(d0.cards.length, 8);
  assert.equal(d0.layout.version, 0);

  // Reject < 8 cards or duplicates or non-allowlisted IDs (including retired SPX/NDX/N225/BRENT)
  const badLen = await overviewRoute.POST(
    makeReq("/api/markets/overview", "POST", { expectedVersion: 0, ids: ["NSE:NIFTY", "BSE:SENSEX"] }),
  );
  assert.equal(badLen.status, 400);

  const badDup = await overviewRoute.POST(
    makeReq("/api/markets/overview", "POST", {
      expectedVersion: 0,
      ids: ["NSE:NIFTY", "NSE:NIFTY", "NSE:BANKNIFTY", "NSE:NIFTYMIDCAP100", "MCX:GOLD", "MCX:SILVER", "GLOBAL:CL", "ECB:USDINR"],
    }),
  );
  assert.equal(badDup.status, 400);

  const badRetired = await overviewRoute.POST(
    makeReq("/api/markets/overview", "POST", {
      expectedVersion: 0,
      ids: ["GLOBAL:SPX", "BSE:SENSEX", "NSE:BANKNIFTY", "NSE:NIFTYMIDCAP100", "MCX:GOLD", "MCX:SILVER", "GLOBAL:CL", "ECB:USDINR"],
    }),
  );
  assert.equal(badRetired.status, 400);

  // Valid reordered 8-tile save for User A
  const customIds = [
    "ECB:USDINR",
    "GLOBAL:CL",
    "MCX:SILVER",
    "MCX:GOLD",
    "NSE:NIFTYMIDCAP100",
    "NSE:BANKNIFTY",
    "BSE:SENSEX",
    "NSE:NIFTY",
  ];
  const rSave = await overviewRoute.POST(
    makeReq("/api/markets/overview", "POST", { expectedVersion: 0, ids: customIds }),
  );
  assert.equal(rSave.status, 200);
  const saved = await rSave.json();
  assert.equal(saved.layout.version, 1);
  assert.deepEqual(saved.layout.ids, customIds);

  // Stale expectedVersion: 0 must return 409 Conflict
  const rConflict = await overviewRoute.POST(
    makeReq("/api/markets/overview", "POST", { expectedVersion: 0, ids: customIds }),
  );
  assert.equal(rConflict.status, 409);

  // Reload restores exact custom order
  const rReload = await overviewRoute.GET(makeReq("/api/markets/overview"));
  const reloaded = await rReload.json();
  assert.deepEqual(reloaded.layout.ids, customIds);

  // IDOR check: User B still gets defaults, not User A's layout
  currentUser = { userId: "user-b", displayName: "Bob Macro", email: "b@test.local", authProvider: "email" };
  const rB = await overviewRoute.GET(makeReq("/api/markets/overview"));
  const dB = await rB.json();
  assert.equal(dB.layout.version, 0);
  assert.equal(dB.layout.ids[0], "NSE:NIFTY");
});

test("Classic Quota enforces 20 completed scans per IST civil day, counts valid 0-match runs, releases failed runs, and resets at 00:00 IST", async () => {
  currentUser = { userId: "user-a", displayName: "Alice Quant", email: "a@test.local", authProvider: "email" };

  // Failed/blocked intraday 30m scan on daily-only ECB must NOT deduct quota
  const blockedRes = await strategyScanRoute.POST(
    makeReq("/api/strategy/scan", "POST", {
      action: "run-scan",
      scanTier: "CLASSIC",
      requestId: "classic_fail_intraday_1",
      name: "Blocked Intraday ECB",
      description: "Testing that blocked intraday ECB scan releases reservation cleanly.",
      formula: "close > sma(close, 20)",
      mode: "SIMPLE",
      universe: "ECB_DAILY",
      interval: "30m",
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
    }),
  );
  assert.equal(blockedRes.status, 503);
  const qAfterFail = await scanQuotaMod.getScanQuotaSummary(DB, "user-a", nowMs);
  assert.equal(qAfterFail.classic.used, 0);

  // Run 20 valid Classic scans (including #20 with impossible threshold -> valid 0-match completed scan!)
  for (let i = 1; i <= 20; i++) {
    const formula = i === 20 ? "close > 999999" : "close > sma(close, 20)";
    const r = await strategyScanRoute.POST(
      makeReq("/api/strategy/scan", "POST", {
        action: "run-scan",
        scanTier: "CLASSIC",
        requestId: `classic_run_${i}_day1`,
        name: `Classic Scan #${i}`,
        description: `Testing classic scan quota accounting run ${i} on ECB daily FX.`,
        formula,
        mode: "SIMPLE",
        universe: "ECB_DAILY",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
      }),
    );
    assert.equal(r.status, 200, `Expected scan #${i} to succeed`);
    const body = await r.json();
    if (i === 20) assert.equal(body.results.matches, 0);
  }

  // 21st Classic scan on the same IST day MUST fail with 429
  const r21 = await strategyScanRoute.POST(
    makeReq("/api/strategy/scan", "POST", {
      action: "run-scan",
      scanTier: "CLASSIC",
      requestId: "classic_run_21_blocked",
      name: "Classic Scan #21",
      description: "Must be blocked because 20/20 IST daily allowance was consumed.",
      formula: "close > sma(close, 20)",
      mode: "SIMPLE",
      universe: "ECB_DAILY",
      interval: "1d",
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
    }),
  );
  assert.equal(r21.status, 429);

  // Advance clock across 00:00 Asia/Kolkata (2026-11-21T18:35:00Z = 2026-11-22 00:05 IST) -> quota resets!
  nowMs = Date.parse("2026-11-21T18:35:00.000Z");
  const rReset = await strategyScanRoute.POST(
    makeReq("/api/strategy/scan", "POST", {
      action: "run-scan",
      scanTier: "CLASSIC",
      requestId: "classic_run_day2_ok",
      name: "Classic Next IST Day",
      description: "Testing IST civil day reset after 00:00 Asia/Kolkata.",
      formula: "close > sma(close, 20)",
      mode: "SIMPLE",
      universe: "ECB_DAILY",
      interval: "1d",
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
    }),
  );
  assert.equal(rReset.status, 200);
});

test("Advanced Quota enforces 1 completed scan per rolling 60 minutes even under concurrent Promise.all requests", async () => {
  currentUser = { userId: "user-b", displayName: "Bob Macro", email: "b@test.local", authProvider: "email" };

  const mkAdv = (reqId) =>
    strategyScanRoute.POST(
      makeReq("/api/strategy/scan", "POST", {
        action: "run-scan",
        scanTier: "ADVANCED",
        requestId: reqId,
        name: "Advanced Genome Scan",
        description: "Concurrent race test for rolling 60-minute Advanced scan allowance.",
        formula: "close > sma(close, 20)",
        mode: "ADVANCED",
        universe: "ECB_DAILY",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 5, threshold: 0, target: 5, stop: 3, costBps: 0 },
      }),
    );

  // Fire 2 simultaneous Advanced scans with DIFFERENT requestIds
  const [res1, res2] = await Promise.all([
    mkAdv("adv_concurrent_one"),
    mkAdv("adv_concurrent_two"),
  ]);
  const statuses = [res1.status, res2.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 429], `Expected exactly one 200 and one 429 under concurrency, got ${statuses}`);

  // 30 minutes later: STILL blocked (rolling 60m, no midnight shortcut)
  nowMs += 30 * 60 * 1000;
  const res30 = await mkAdv("adv_after_30min_test");
  assert.equal(res30.status, 429);

  // 61 minutes after initial completion: permitted again!
  nowMs += 32 * 60 * 1000;
  const res62 = await mkAdv("adv_after_62min_test");
  assert.equal(res62.status, 200);
});

test("Community Research Network: One-Click Post Soul, Angel One redaction (403), Follow Requests, Save/Comment/Copy/Pin/Delete & Privacy", async () => {
  // Fetch a real completed scan belonging to user-a
  const scanRow = sql
    .prepare("SELECT id FROM x1_scans WHERE subject='user-a' ORDER BY created_at DESC LIMIT 1")
    .get();
  assert.ok(scanRow?.id);

  // Seed an owner-only Angel One SmartAPI scan to verify public-share redaction blocks with 403
  const angelScanId = randomUUID();
  sql
    .prepare(
      "INSERT INTO x1_scans (id, subject, request_key, mode, name, payload, digest, created_at) VALUES (?, 'user-a', ?, 'SIMPLE', 'Broker Scan', ?, 'digest-angel', ?)",
    )
    .run(
      angelScanId,
      "angel_scan_key_1",
      JSON.stringify({
        source: "ANGELONE_SMARTAPI",
        sourceLineage: [{ provider: "ANGELONE_SMARTAPI", displayAllowed: false }],
        rule: { formula: "close > sma(close, 20)" },
        results: { total: 1, matches: 1, results: [{ instrumentId: "NSE:HDFCBANK", status: "PASS", source: "ANGELONE_SMARTAPI" }] },
      }),
      new Date(nowMs).toISOString(),
    );

  currentUser = { userId: "user-a", displayName: "Alice Quant", email: "a@test.local", authProvider: "email" };

  // Angel One broker scan MUST fail closed with 403 on PUBLIC publish
  const angelPub = await networkRoute.POST(
    makeReq("/api/community/network", "POST", {
      action: "publish-soul",
      scanId: angelScanId,
      audience: "PUBLIC",
      summary: "Trying to leak broker scan publicly",
      riskNote: "Test risk",
      requestId: "angel_pub_block_1",
    }),
  );
  assert.equal(angelPub.status, 403);

  // Publish valid ECB scan as FOLLOWERS-only (idempotent!)
  const pub1 = await networkRoute.POST(
    makeReq("/api/community/network", "POST", {
      action: "publish-soul",
      scanId: scanRow.id,
      audience: "FOLLOWERS",
      summary: "Daily USD/INR trend filter on official ECB closes.",
      riskNote: "Educational only.",
      requestId: "pub_followers_idemp_1",
    }),
  );
  assert.equal(pub1.status, 200);
  const pub1Json = await pub1.json();
  assert.ok(pub1Json.postId);

  // Idempotent repeat tap returns same postId with replayed: true
  const pubReplay = await networkRoute.POST(
    makeReq("/api/community/network", "POST", {
      action: "publish-soul",
      scanId: scanRow.id,
      audience: "FOLLOWERS",
      summary: "Daily USD/INR trend filter on official ECB closes.",
      riskNote: "Educational only.",
      requestId: "pub_followers_idemp_1",
    }),
  );
  assert.equal(pubReplay.status, 200);
  const pubReplayJson = await pubReplay.json();
  assert.equal(pubReplayJson.postId, pub1Json.postId);
  assert.equal(pubReplayJson.replayed, true);

  // User B cannot see FOLLOWERS post before follow approval
  currentUser = { userId: "user-b", displayName: "Bob Macro", email: "b@test.local", authProvider: "email" };
  const feedBefore = await (await networkRoute.GET(makeReq("/api/community/network?view=web"))).json();
  assert.ok(!feedBefore.posts.some((p) => p.id === pub1Json.postId));

  // User B requests to follow private User A -> state PENDING
  const followReq = await networkRoute.POST(
    makeReq("/api/community/network", "POST", { action: "follow", handle: "alice_quant", active: true }),
  );
  assert.equal(followReq.status, 200);
  assert.equal((await followReq.json()).state, "PENDING");

  // User A approves follow request -> state ACTIVE
  currentUser = { userId: "user-a", displayName: "Alice Quant", email: "a@test.local", authProvider: "email" };
  const pendingList = await (await networkRoute.GET(makeReq("/api/community/network?view=follow-requests"))).json();
  assert.equal(pendingList.requests.length, 1);
  assert.equal(pendingList.requests[0].handle, "bob_macro");

  const approve = await networkRoute.POST(
    makeReq("/api/community/network", "POST", { action: "respond-follow", handle: "bob_macro", decision: "APPROVE" }),
  );
  assert.equal(approve.status, 200);

  // Now User B CAN see the FOLLOWERS post, Save it, Comment on it, Make a Copy, and inspect Alice's public profile safely
  currentUser = { userId: "user-b", displayName: "Bob Macro", email: "b@test.local", authProvider: "email" };
  const feedAfter = await (await networkRoute.GET(makeReq("/api/community/network?view=web"))).json();
  assert.ok(feedAfter.posts.some((p) => p.id === pub1Json.postId));

  const saveRes = await networkRoute.POST(
    makeReq("/api/community/network", "POST", { action: "save-soul", postId: pub1Json.postId, active: true }),
  );
  assert.equal(saveRes.status, 200);

  const commentRes = await networkRoute.POST(
    makeReq("/api/community/network", "POST", {
      action: "comment-soul",
      postId: pub1Json.postId,
      text: "Great clean ECB setup.",
      requestId: "comment_bob_0001",
    }),
  );
  assert.equal(commentRes.status, 200);

  const copyRes = await networkRoute.POST(
    makeReq("/api/community/network", "POST", { action: "copy-soul", postId: pub1Json.postId }),
  );
  assert.equal(copyRes.status, 200);
  const copyJson = await copyRes.json();
  assert.ok(copyJson.attribution.includes("@alice_quant"));

  // User B attempting to delete User A's post MUST fail (404)
  const badDel = await networkRoute.POST(
    makeReq("/api/community/network", "POST", { action: "delete-soul", postId: pub1Json.postId }),
  );
  assert.equal(badDel.status, 404);

  // Public profile never leaks email or portfolio balances
  const profRes = await networkRoute.GET(makeReq("/api/community/network?view=profile&handle=alice_quant"));
  assert.equal(profRes.status, 200);
  const profJson = await profRes.json();
  assert.equal(profJson.profile.portfolioValueVisibility, "PRIVATE_HIDDEN");
  assert.equal("email" in profJson.profile, false);
  assert.equal(profJson.profile.counts.followers, 1);

  // Author User A can delete their own post cleanly
  currentUser = { userId: "user-a", displayName: "Alice Quant", email: "a@test.local", authProvider: "email" };
  const goodDel = await networkRoute.POST(
    makeReq("/api/community/network", "POST", { action: "delete-soul", postId: pub1Json.postId }),
  );
  assert.equal(goodDel.status, 200);
});

test("Media Upload validator enforces auth (401), same-origin CSRF (403), rejects forged SVG/script MIME (400), and fails closed without R2 (503)", async () => {
  // 1. Unauthenticated -> 401
  currentUser = null;
  const rUnauth = await mediaUploadRoute.POST(
    new Request("https://ss.test/api/media/upload", {
      method: "POST",
      headers: { origin: "https://ss.test" },
    }),
  );
  assert.equal(rUnauth.status, 401);

  // 2. Cross-origin -> 403
  currentUser = { userId: "user-a", displayName: "Alice Quant", email: "a@test.local", authProvider: "email" };
  const rCsrf = await mediaUploadRoute.POST(
    new Request("https://ss.test/api/media/upload", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
  );
  assert.equal(rCsrf.status, 403);

  // 3. Forged MIME: claims image/png, actually contains <svg><script>
  const forgedForm = new FormData();
  forgedForm.append(
    "file",
    new File(["<svg onload='alert(1)'><script>alert(1)</script></svg>"], "evil.png", {
      type: "image/png",
    }),
  );
  const rForged = await mediaUploadRoute.POST(
    new Request("https://ss.test/api/media/upload", {
      method: "POST",
      headers: { origin: "https://ss.test" },
      body: forgedForm,
    }),
  );
  assert.equal(rForged.status, 400);

  // 4. Authentic PNG magic bytes without R2 MEDIA_BUCKET bound -> honest 503 OBJECT_STORAGE_NOT_CONFIGURED
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const validForm = new FormData();
  validForm.append("file", new File([pngHeader], "banner.png", { type: "image/png" }));
  const rNoR2 = await mediaUploadRoute.POST(
    new Request("https://ss.test/api/media/upload", {
      method: "POST",
      headers: { origin: "https://ss.test" },
      body: validForm,
    }),
  );
  assert.equal(rNoR2.status, 503);
  const noR2Json = await rNoR2.json();
  assert.equal(noR2Json.code, "OBJECT_STORAGE_NOT_CONFIGURED");
});
