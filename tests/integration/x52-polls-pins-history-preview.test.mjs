/**
 * Strategic Souls Post-X5.1 (X5.2) — Integration & Negative Security Tests:
 * - Applies ALL D1 migrations 0000..0009 in in-memory SQLite (foreign_keys=ON)
 * - [19] Daily Market Pulse: 0-vote 0% (no NaN), concurrent double-vote race -> 1 effective vote,
 *        post-cutoff vote rejection (409), NSE holiday / 15:30 IST rollover
 * - [29] Pinned Group Research: VIEWER/EDITOR rejected (403), OWNER/ADMIN max-3 atomic guard (400),
 *        unpin + repin, projection in getCommunity
 * - [30] Post Preview: Angel One broker scan blocked (allowed: false), simulated TEST DATA CSV
 *        blocked for PUBLIC Web, official ECB scan returns exact redacted preview without DB writes
 * - [11] Smart Search History & [24] My Watch Regions: private per-user IDOR isolation & opt-out
 * - Profile Privacy: opt-in Age hidden by default on public researcher profile, <18 rejected (400)
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
let nowMs = Date.parse("2026-11-23T03:00:00.000Z"); // Monday 08:30 IST (post Fri close, before Mon 09:15 IST open)

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

for (const tbl of [
  "x52_market_polls",
  "x52_market_poll_votes",
  "x52_group_pins",
  "x52_search_history",
  "x52_watch_regions",
  "x52_intelligence_events",
]) {
  assert.ok(
    sql.prepare("SELECT name FROM sqlite_master WHERE name=?").get(tbl),
    `Migration 0009 must create table ${tbl}`,
  );
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

const context = vm.createContext({
  console,
  crypto: {
    subtle: webcrypto.subtle,
    getRandomValues: (arr) => webcrypto.getRandomValues(arr),
    randomUUID,
  },
  Date: MockDate,
  Intl,
  URL,
  URLSearchParams,
  Response,
  Request,
  Headers,
  TextEncoder,
  TextDecoder,
  AbortController,
  setTimeout,
  clearTimeout,
  process: { env: {} },
});

const cache = new Map();
function resolveFile(spec, from) {
  const base = resolve(dirname(from), spec);
  for (const c of [base, base + ".ts", base + ".tsx", base + "/index.ts"]) {
    if (existsSync(c)) return c;
  }
  throw new Error(`Cannot resolve ${spec} from ${from}`);
}

async function loadTs(filePath) {
  const abs = resolve(filePath);
  if (cache.has(abs)) return cache.get(abs);
  const code = ts.transpileModule(readFileSync(abs, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const mod = new vm.SourceTextModule(code, { context, identifier: abs });
  cache.set(abs, mod);
  await mod.link(async (spec) => {
    if (spec === "cloudflare:workers") {
      if (cache.has("cf:workers")) return cache.get("cf:workers");
      const s = new vm.SyntheticModule(
        ["env"],
        function () {
          this.setExport("env", { DB });
        },
        { context },
      );
      cache.set("cf:workers", s);
      return s;
    }
    return loadTs(resolveFile(spec, abs));
  });
  await mod.evaluate();
  return mod;
}

const pulseMod = (await loadTs("backend/services/market-data/daily-pulse.ts")).namespace;
const communityMod = (await loadTs("backend/services/community/community.ts")).namespace;
const networkMod = (await loadTs("backend/services/community/research-network.ts")).namespace;
const prefsMod = (await loadTs("backend/services/user/preferences-store.ts")).namespace;
const profileMod = (await loadTs("backend/services/profile/profile.ts")).namespace;

function seedUser(subject, handle, displayName, discoverable = 1) {
  const now = new Date(nowMs).toISOString();
  sql
    .prepare(
      "INSERT OR REPLACE INTO auth_users (id, email, display_name, password_hash, auth_provider, created_at, updated_at) VALUES (?, ?, ?, 'hash', 'email', ?, ?)",
    )
    .run(subject, `${handle}@example.test`, displayName, now, now);
  sql
    .prepare(
      "INSERT OR REPLACE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(subject, displayName, now, CONSENT_VERSION, now);
  sql
    .prepare(
      "INSERT OR REPLACE INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at) VALUES (?, ?, ?, '', 'a01', ?, ?)",
    )
    .run(subject, handle, displayName, now, now);
  sql
    .prepare(
      "INSERT OR REPLACE INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at) VALUES (?, ?, 'REQUESTS', 0, 1, ?)",
    )
    .run(subject, discoverable, now);
}

seedUser("user-a", "alice_quant", "Alice Quant", 1);
seedUser("user-b", "bob_macro", "Bob Macro", 1);

// ── [19] Daily Market Pulse ───────────────────────────────────────────────────
test("[19] Daily Market Pulse: zero-vote 0% (no NaN), concurrent double-vote race -> 1 vote, cutoff enforcement", async () => {
  const initial = await pulseMod.getDailyPulsePolls(null, nowMs);
  assert.equal(initial.polls.length, 2);
  const nifty = initial.polls.find((p) => p.underlying === "NIFTY50");
  assert.equal(nifty.sessionDate, "2026-11-23");
  assert.equal(nifty.totalVotes, 0);
  assert.ok(nifty.tallies.every((t) => t.pct === 0 && !Number.isNaN(t.pct)));

  // Concurrent double-vote race from same account
  await Promise.all([
    pulseMod.castDailyPulseVote("user-a", { pollId: nifty.pollId, choice: "STRONG_RISE" }, nowMs),
    pulseMod.castDailyPulseVote("user-a", { pollId: nifty.pollId, choice: "SLIGHT_RISE" }, nowMs),
  ]);
  const afterA = await pulseMod.getDailyPulsePolls("user-a", nowMs);
  const niftyA = afterA.polls.find((p) => p.underlying === "NIFTY50");
  assert.equal(niftyA.totalVotes, 1, "Same account must hold at most 1 effective vote");

  // Second user votes -> 2 total votes, 50% / 50%
  await pulseMod.castDailyPulseVote("user-a", { pollId: nifty.pollId, choice: "STRONG_RISE" }, nowMs);
  await pulseMod.castDailyPulseVote("user-b", { pollId: nifty.pollId, choice: "STRONG_FALL" }, nowMs);
  const afterBoth = await pulseMod.getDailyPulsePolls("user-a", nowMs);
  const niftyBoth = afterBoth.polls.find((p) => p.underlying === "NIFTY50");
  assert.equal(niftyBoth.totalVotes, 2);
  assert.equal(niftyBoth.tallies.find((t) => t.choice === "STRONG_RISE").pct, 50);
  assert.equal(niftyBoth.tallies.find((t) => t.choice === "STRONG_FALL").pct, 50);

  // Strict server-time cutoff gate: 09:15 IST (03:45 UTC) on 2026-11-23 rejects vote for 2026-11-23 poll!
  const atSessionOpenMs = Date.parse("2026-11-23T03:45:00.000Z");
  await assert.rejects(
    () =>
      pulseMod.castDailyPulseVote(
        "user-a",
        { pollId: nifty.pollId, choice: "SLIGHT_FALL" },
        atSessionOpenMs,
      ),
    (err) => err.status === 409,
  );

  // During live NSE trading hours (11:30 IST), next-session poll (2026-11-25, skipping Nov 24 holiday) is UPCOMING/CLOSED until 15:30 IST!
  const duringMarketMs = Date.parse("2026-11-23T06:00:00.000Z");
  const nextSpec = pulseMod.resolveActivePollSpec("NIFTY50", duringMarketMs);
  assert.equal(nextSpec.sessionDate, "2026-11-25", "Should skip NSE holiday 2026-11-24");
  await assert.rejects(
    () =>
      pulseMod.castDailyPulseVote(
        "user-a",
        { pollId: nextSpec.pollId, choice: "SLIGHT_RISE" },
        duringMarketMs,
      ),
    (err) => err.status === 409,
  );

  // After 15:30 IST (10:01 UTC) on 2026-11-23, the 2026-11-25 poll opens cleanly!
  const afterCloseMs = Date.parse("2026-11-23T10:01:00.000Z");
  const afterCloseSnapshot = await pulseMod.getDailyPulsePolls("user-a", afterCloseMs);
  const niftyNext = afterCloseSnapshot.polls.find((p) => p.underlying === "NIFTY50");
  assert.equal(niftyNext.sessionDate, "2026-11-25");
  assert.equal(niftyNext.status, "OPEN");
});

// ── [29] Pinned Group Research ────────────────────────────────────────────────
test("[29] Pinned Group Research: role check (403 for non-moderator), atomic max-3 limit (400), unpin/repin", async () => {
  const { groupId } = await communityMod.mutateCommunity("user-a", {
    action: "create-group",
    name: "India Macro Desk",
    description: "Research desk",
  });
  // Add user-b as EDITOR (non-admin)
  const inv = await communityMod.mutateCommunity("user-a", {
    action: "invite",
    groupId,
    handle: "bob_macro",
    role: "EDITOR",
  });
  await communityMod.mutateCommunity("user-b", {
    action: "accept-invite",
    code: inv.code,
  });

  // Create & publish 4 group posts
  const postIds = [];
  for (let i = 1; i <= 4; i++) {
    const { soulId } = await communityMod.mutateCommunity("user-a", {
      action: "create-soul",
      groupId,
      title: `Macro Thesis #${i}`,
      summary: `Detailed methodology note #${i} for peer review.`,
      formula: "close > sma(close, 20)",
    });
    const pub = await communityMod.mutateCommunity("user-a", {
      action: "publish",
      soulId,
      revision: 1,
    });
    postIds.push(pub.postId);
  }

  // Non-admin EDITOR rejected with 403
  await assert.rejects(
    () =>
      communityMod.mutateCommunity("user-b", {
        action: "pin-group-item",
        groupId,
        targetKind: "POST",
        targetId: postIds[0],
      }),
    (err) => err.status === 403,
  );

  // OWNER pins 3 posts cleanly
  for (let i = 0; i < 3; i++) {
    const r = await communityMod.mutateCommunity("user-a", {
      action: "pin-group-item",
      groupId,
      targetKind: "POST",
      targetId: postIds[i],
    });
    assert.equal(r.pinned, true);
  }

  // 4th pin rejected with 400
  await assert.rejects(
    () =>
      communityMod.mutateCommunity("user-a", {
        action: "pin-group-item",
        groupId,
        targetKind: "POST",
        targetId: postIds[3],
      }),
    (err) => err.status === 400,
  );

  // Unpin post 1, then pin post 4 succeeds
  await communityMod.mutateCommunity("user-a", {
    action: "unpin-group-item",
    groupId,
    targetKind: "POST",
    targetId: postIds[0],
  });
  const fourth = await communityMod.mutateCommunity("user-a", {
    action: "pin-group-item",
    groupId,
    targetKind: "POST",
    targetId: postIds[3],
  });
  assert.equal(fourth.pinned, true);

  const view = await communityMod.getCommunity("user-a", groupId);
  assert.equal(view.pinnedItems.length, 3);
  assert.equal(view.capabilities.canPin, true);
});

// ── [30] Server-Validated Post Preview ────────────────────────────────────────
test("[30] Post Preview: mirrors exact source-rights blocks (Angel One & Test CSV) and zero DB side effects", async () => {
  const now = new Date(nowMs).toISOString();
  const insertScan = (id, name, payload) => {
    sql
      .prepare(
        "INSERT INTO x1_scans (id, subject, mode, name, payload, digest, request_key, created_at) VALUES (?, 'user-a', 'SIMPLE', ?, ?, 'deadbeef', ?, ?)",
      )
      .run(id, name, JSON.stringify(payload), `rk-${id}`, now);
  };

  insertScan("scan-broker-1", "Broker Intraday", {
    source: "Angel One SmartAPI (Owner Private)",
    rule: { formula: "rsi14 < 30" },
    results: { total: 5, matches: 1, results: [{ instrumentId: "NSE:SBIN", status: "PASS" }] },
  });
  insertScan("scan-testcsv-1", "Test Fixture Run", {
    source: "Private user CSV",
    description: "Simulated 5-stock Indian equity test CSV fixture (TEST DATA)",
    research: { universe: "CUSTOM_CSV", interval: "1d" },
    rule: { formula: "close > sma(close, 20)" },
    results: { total: 5, matches: 2, results: [{ instrumentId: "CSV:NSE:TCS", status: "PASS" }] },
  });
  insertScan("scan-ecb-1", "ECB Momentum Check", {
    source: "European Central Bank daily FX",
    research: { universe: "ECB_DAILY", interval: "1d" },
    rule: { formula: "close > sma(close, 20)" },
    results: { total: 10, matches: 3, results: [{ instrumentId: "ECB:USDINR", status: "PASS" }] },
  });

  const brokerPrev = await networkMod.previewSoulPublish("user-a", {
    scanId: "scan-broker-1",
    audience: "PUBLIC",
  });
  assert.equal(brokerPrev.allowed, false);
  assert.match(brokerPrev.blockReason, /private non-redistributable/i);
  assert.doesNotMatch(brokerPrev.blockReason, /Angel One|SmartAPI/i);

  const testCsvPrev = await networkMod.previewSoulPublish("user-a", {
    scanId: "scan-testcsv-1",
    audience: "PUBLIC",
  });
  assert.equal(testCsvPrev.allowed, false);
  assert.match(testCsvPrev.blockReason, /Test CSV/i);

  const ecbPrev = await networkMod.previewSoulPublish("user-a", {
    scanId: "scan-ecb-1",
    audience: "PUBLIC",
    summary: "Daily ECB FX filter verification",
  });
  assert.equal(ecbPrev.allowed, true);
  assert.equal(ecbPrev.preview.authorHandle, "alice_quant");
  assert.deepEqual([...ecbPrev.preview.matchedSymbols], ["ECB:USDINR"]);

  // Confirm preview wrote zero rows to x51_web_souls
  const count = sql.prepare("SELECT count(*) AS n FROM x51_web_souls").get().n;
  assert.equal(count, 0);
});

// ── [11] Smart Search History & [24] My Watch Regions Isolation ───────────────
test("[11][24] Search History & Watch Regions: per-user isolation, favorites, and opt-out", async () => {
  await prefsMod.mutateSearchHistory("user-a", {
    action: "record",
    entry: { kind: "ASSET", target: "NSE:HDFCBANK", label: "HDFC Bank" },
  });
  await prefsMod.mutateSearchHistory("user-a", {
    action: "toggle-favorite",
    entry: { kind: "ASSET", target: "NSE:HDFCBANK", label: "HDFC Bank" },
  });
  const aHist = await prefsMod.getSearchHistory("user-a");
  const bHist = await prefsMod.getSearchHistory("user-b");
  assert.equal(aHist.recents.length, 1);
  assert.equal(aHist.favorites.length, 1);
  assert.equal(bHist.recents.length, 0, "User B must never read User A history");

  // Opt-out clears recents and suppresses new recording
  const optedOut = await prefsMod.mutateSearchHistory("user-a", {
    action: "set-opt-out",
    optedOut: true,
  });
  assert.equal(optedOut.optedOut, true);
  assert.equal(optedOut.recents.length, 0);
  await prefsMod.mutateSearchHistory("user-a", {
    action: "record",
    entry: { kind: "ASSET", target: "NSE:TCS", label: "TCS" },
  });
  const stillEmpty = await prefsMod.getSearchHistory("user-a");
  assert.equal(stillEmpty.recents.length, 0);

  // Watch regions isolation
  await prefsMod.mutateWatchRegions("user-a", {
    action: "toggle-region",
    regionId: "india",
  });
  const aWatch = await prefsMod.getWatchRegions("user-a");
  const bWatch = await prefsMod.getWatchRegions("user-b");
  assert.deepEqual([...aWatch.regions], ["india"]);
  assert.deepEqual([...bWatch.regions], []);
});

// ── Profile Opt-In Age Privacy (Never DOB) ────────────────────────────────────
test("Profile Privacy: age stays hidden publicly unless showAge=true and rejects <18", async () => {
  const userObj = {
    userId: "user-a",
    displayName: "Alice Quant",
    email: "alice_quant@example.test",
    authProvider: "email",
  };
  await assert.rejects(
    () =>
      profileMod.mutatePrivateProfile(userObj, {
        action: "update-profile",
        displayName: "Alice Quant",
        age: 16,
      }),
    (err) => err.status === 400,
  );

  await profileMod.mutatePrivateProfile(userObj, {
    action: "update-profile",
    displayName: "Alice Quant",
    age: 29,
    showAge: false,
  });
  const pubHidden = await networkMod.getPublicResearcherProfile("user-b", "alice_quant");
  assert.equal(pubHidden.profile.age, null, "Age must stay hidden when showAge=false");

  await profileMod.mutatePrivateProfile(userObj, {
    action: "update-profile",
    displayName: "Alice Quant",
    age: 29,
    showAge: true,
  });
  const pubVisible = await networkMod.getPublicResearcherProfile("user-b", "alice_quant");
  assert.equal(pubVisible.profile.age, 29);
});
