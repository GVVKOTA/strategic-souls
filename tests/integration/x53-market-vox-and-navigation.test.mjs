/**
 * Strategic Souls X5.3 — Integration Tests for Market Vox Server Timing & Schedule Integrity:
 * - Applies all D1 migrations 0000..0009 in in-memory SQLite (foreign_keys=ON)
 * - Enforces BOTH opensAtUtc <= nowMs < closesAtUtc on GET and POST
 * - Verifies NIFTY 50 post-close open (15:30 IST) -> pre-open close (09:15 IST next NSE trading day)
 * - Rejects votes during live NSE trading hours (09:15-15:30 IST), at exact 09:15 IST open,
 *   1 minute before 15:30 IST close, and for future unopened sessions (409)
 * - Verifies Fri post-close -> Sat/Sun -> Mon pre-open, midnight IST/UTC crossings, and NSE holidays (2026-11-24)
 * - Verifies Gold (GLOBAL:XAUUSD OTC benchmark, NOT MCX futures) 21:00 UTC -> 07:00 UTC window
 * - Verifies legacy X5.2 poll row schedule repair preserves existing votes without corruption
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
let nowMs = Date.parse("2026-11-22T03:00:00.000Z"); // Sunday 08:30 IST

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
    return { results: sql.prepare(this.query).all(...this.args) };
  }
  async run() {
    const info = sql.prepare(this.query).run(...this.args);
    return { meta: { changes: Number(info.changes) } };
  }
}

const dbAdapter = {
  prepare: (q) => new Statement(q),
  batch: async (stmts) => {
    const out = [];
    for (const st of stmts) out.push(await st.run());
    return out;
  },
};

const vmContext = vm.createContext({
  console,
  Date: MockDate,
  Intl,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Set,
  Map,
  Promise,
  Error,
  RegExp,
  JSON,
  URL,
  setTimeout,
  clearTimeout,
  crypto: {
    subtle: webcrypto.subtle,
    getRandomValues: (arr) => webcrypto.getRandomValues(arr),
    randomUUID,
  },
});

const modCache = new Map();
async function loadTs(filePath) {
  const abs = resolve(filePath);
  if (modCache.has(abs)) return modCache.get(abs);
  const code = ts.transpileModule(readFileSync(abs, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const mod = new vm.SourceTextModule(code, {
    context: vmContext,
    identifier: abs,
  });
  modCache.set(abs, mod);
  await mod.link(async (spec) => {
    if (spec === "cloudflare:workers") {
      if (!modCache.has(spec)) {
        modCache.set(
          spec,
          new vm.SyntheticModule(
            ["env"],
            function () {
              this.setExport("env", { DB: dbAdapter });
            },
            { context: vmContext },
          ),
        );
      }
      return modCache.get(spec);
    }
    const base = resolve(dirname(abs), spec);
    const target = [base, base + ".ts", base + ".tsx"].find((c) => existsSync(c));
    if (!target) throw new Error(`Cannot resolve ${spec} from ${abs}`);
    return loadTs(target);
  });
  await mod.evaluate();
  return mod;
}

const pulseMod = (await loadTs("backend/services/market-data/daily-pulse.ts"))
  .namespace;

const seedIso = "2026-11-20T09:00:00.000Z";
for (const sub of ["vox-user-1", "vox-user-2"]) {
  sql
    .prepare(
      "INSERT OR REPLACE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(sub, sub, seedIso, CONSENT_VERSION, seedIso);
}

test("X5.3 Market Vox NIFTY 50: enforces BOTH opensAtUtc and closesAtUtc across live hours, post-close, midnight, weekend & NSE holiday", async () => {
  // 1. Sunday 2026-11-22 08:30 IST (after Fri 2026-11-20 15:30 IST close, before Mon 2026-11-23 09:15 IST open)
  const sunMs = Date.parse("2026-11-22T03:00:00.000Z");
  const sunSpec = pulseMod.resolveActivePollSpec("NIFTY50", sunMs);
  assert.equal(sunSpec.sessionDate, "2026-11-23");
  assert.equal(sunSpec.opensAtUtc, "2026-11-20T10:00:00.000Z", "Must open at prior Fri NSE close (15:30 IST)");
  assert.equal(sunSpec.closesAtUtc, "2026-11-23T03:45:00.000Z", "Must close at Mon NSE open (09:15 IST), NOT session close");

  // 2. Monday 2026-11-23 09:14 IST (1 min before NSE open) -> OPEN, vote succeeds
  const preOpenMs = Date.parse("2026-11-23T03:44:00.000Z");
  const votedMon = await pulseMod.castDailyPulseVote(
    "vox-user-1",
    { pollId: "poll:NIFTY50:2026-11-23", choice: "SLIGHT_RISE" },
    preOpenMs,
  );
  assert.equal(votedMon.status, "OPEN");
  assert.equal(votedMon.totalVotes, 1);

  // 3. Monday 2026-11-23 09:15 IST EXACTLY (session open) -> CLOSED, late vote rejected 409
  const exactOpenMs = Date.parse("2026-11-23T03:45:00.000Z");
  await assert.rejects(
    () =>
      pulseMod.castDailyPulseVote(
        "vox-user-2",
        { pollId: "poll:NIFTY50:2026-11-23", choice: "STRONG_FALL" },
        exactOpenMs,
      ),
    (err) => err.status === 409,
  );

  // 4. Monday 2026-11-23 11:30 IST & 15:29 IST (during live NSE session) -> next poll (2026-11-25) is UPCOMING/CLOSED, vote rejected 409!
  for (const liveIso of ["2026-11-23T06:00:00.000Z", "2026-11-23T09:59:00.000Z"]) {
    const liveMs = Date.parse(liveIso);
    const snap = await pulseMod.getDailyPulsePolls("vox-user-1", liveMs);
    const nifty = snap.polls.find((p) => p.underlying === "NIFTY50");
    assert.equal(nifty.sessionDate, "2026-11-25", "Must skip NSE holiday 2026-11-24");
    assert.equal(nifty.status, "CLOSED");
    assert.equal(nifty.windowState, "UPCOMING");
    assert.equal(nifty.opensAtUtc, "2026-11-23T10:00:00.000Z");
    await assert.rejects(
      () =>
        pulseMod.castDailyPulseVote(
          "vox-user-1",
          { pollId: nifty.pollId, choice: "STRONG_RISE" },
          liveMs,
        ),
      (err) => err.status === 409,
    );
  }

  // 5. Monday 2026-11-23 15:30 IST EXACTLY (post-close) -> 2026-11-25 poll OPENS!
  const exactCloseMs = Date.parse("2026-11-23T10:00:00.000Z");
  const openRes = await pulseMod.castDailyPulseVote(
    "vox-user-1",
    { pollId: "poll:NIFTY50:2026-11-25", choice: "STRONG_RISE" },
    exactCloseMs,
  );
  assert.equal(openRes.status, "OPEN");
  assert.equal(openRes.windowState, "OPEN");
  assert.equal(openRes.totalVotes, 1);

  // 6. Midnight IST & UTC crossing on NSE holiday Tue 2026-11-24 -> still OPEN for Wed 2026-11-25
  for (const crossIso of [
    "2026-11-23T18:35:00.000Z", // 00:05 IST Tue Nov 24
    "2026-11-24T00:05:00.000Z", // 00:05 UTC Tue Nov 24
  ]) {
    const res = await pulseMod.getDailyPulsePolls("vox-user-1", Date.parse(crossIso));
    const n = res.polls.find((p) => p.underlying === "NIFTY50");
    assert.equal(n.sessionDate, "2026-11-25");
    assert.equal(n.status, "OPEN");
  }
});

test("X5.3 Market Vox Gold (GLOBAL:XAUUSD OTC): explicit benchmark disclosure & strict 21:00 UTC -> 07:00 UTC window", async () => {
  // During weekday London/NY active hours (12:00 UTC) -> UPCOMING/CLOSED, vote rejected 409
  const middayMs = Date.parse("2026-11-23T12:00:00.000Z");
  const midday = await pulseMod.getDailyPulsePolls("vox-user-1", middayMs);
  const goldMid = midday.polls.find((p) => p.underlying === "GOLD");
  assert.equal(goldMid.status, "CLOSED");
  assert.equal(goldMid.windowState, "UPCOMING");
  assert.match(goldMid.referenceLabel, /XAUUSD/i);
  assert.match(goldMid.referenceLabel, /Not MCX/i);
  assert.equal(goldMid.opensAtUtc, "2026-11-23T21:00:00.000Z");
  assert.equal(goldMid.closesAtUtc, "2026-11-24T07:00:00.000Z");

  await assert.rejects(
    () =>
      pulseMod.castDailyPulseVote(
        "vox-user-1",
        { pollId: goldMid.pollId, choice: "SLIGHT_FALL" },
        middayMs,
      ),
    (err) => err.status === 409,
  );

  // At 21:00 UTC after NY OTC close -> OPEN, vote succeeds
  const postNyCloseMs = Date.parse("2026-11-23T21:00:00.000Z");
  const votedGold = await pulseMod.castDailyPulseVote(
    "vox-user-1",
    { pollId: "poll:GOLD:2026-11-24", choice: "SLIGHT_FALL" },
    postNyCloseMs,
  );
  assert.equal(votedGold.status, "OPEN");
  assert.equal(votedGold.totalVotes, 1);

  // At 07:00 UTC next day -> CLOSED, rejected 409
  const atCutoffMs = Date.parse("2026-11-24T07:00:00.000Z");
  await assert.rejects(
    () =>
      pulseMod.castDailyPulseVote(
        "vox-user-2",
        { pollId: "poll:GOLD:2026-11-24", choice: "STRONG_RISE" },
        atCutoffMs,
      ),
    (err) => err.status === 409,
  );
});

test("X5.3 Market Vox: legacy X5.2 poll row schedule is repaired safely while preserving all existing votes", async () => {
  // Simulate a pre-existing X5.2 row with old Sun opens_at_utc & Mon 15:30 IST closes_at_utc + existing vote
  sql
    .prepare(
      `INSERT OR REPLACE INTO x52_market_polls
        (poll_id, underlying, session_date, opens_at_utc, closes_at_utc, status, reference_label, cutoff_note, created_at)
       VALUES ('poll:NIFTY50:2026-11-27', 'NIFTY50', '2026-11-27', '2026-11-26T10:00:00.000Z', '2026-11-27T10:00:00.000Z', 'OPEN', 'Legacy', 'Legacy', ?)`,
    )
    .run(seedIso);
  sql
    .prepare(
      `INSERT OR REPLACE INTO x52_market_poll_votes (poll_id, subject, choice, created_at, updated_at)
       VALUES ('poll:NIFTY50:2026-11-27', 'vox-user-2', 'STRONG_RISE', ?, ?)`,
    )
    .run(seedIso, seedIso);

  // Query on Fri 2026-11-27 08:30 IST (before 09:15 IST open): repairs closes_at_utc to 03:45Z AND preserves vox-user-2's vote!
  const friPreOpenMs = Date.parse("2026-11-27T03:00:00.000Z");
  const snap = await pulseMod.getDailyPulsePolls("vox-user-2", friPreOpenMs);
  const nifty = snap.polls.find((p) => p.underlying === "NIFTY50");
  assert.equal(nifty.pollId, "poll:NIFTY50:2026-11-27");
  assert.equal(nifty.closesAtUtc, "2026-11-27T03:45:00.000Z");
  assert.equal(nifty.totalVotes, 1);
  assert.equal(nifty.myVote, "STRONG_RISE");
});
