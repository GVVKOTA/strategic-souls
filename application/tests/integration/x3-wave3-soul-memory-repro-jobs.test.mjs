import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { d1MigrationsDir } from "../helpers/paths.mjs";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys = ON;");
for (const file of readdirSync(d1MigrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  sql.exec(readFileSync(resolve(d1MigrationsDir, file), "utf8"));
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

const env = {
  DB,
  X2_OWNER_SUBJECT: "owner-sub",
  MARKET_DATA_PROVIDER: "BHARATSTOCK",
  MARKET_DATA_API_KEY: "test_canonical_secret_123456",
};

const context = vm.createContext({
  console,
  Response,
  Request,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: {
    subtle: webcrypto.subtle,
    getRandomValues: (arr) => webcrypto.getRandomValues(arr),
    randomUUID,
  },
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
    throw new Error("Unexpected external network fetch in offline Wave 3 test.");
  },
});

const cache = new Map();
function resolveFile(spec, from) {
  if (spec === "cloudflare:workers") return "virtual:cloudflare";
  if (spec === "next/headers") return "virtual:headers";
  if (spec === "next/server") return "virtual:server";
  const base = resolve(dirname(from), spec);
  for (const cand of [base, base + ".ts", base + ".tsx", base + ".js", base + "/index.ts"]) {
    if (existsSync(cand)) return cand;
  }
  throw new Error("Cannot resolve " + spec + " from " + from);
}

function getModule(path) {
  if (cache.has(path)) return cache.get(path);
  let mod;
  if (path === "virtual:cloudflare") {
    mod = new vm.SyntheticModule(["env"], function () {
      this.setExport("env", env);
    }, { context });
  } else if (path === "virtual:headers") {
    mod = new vm.SyntheticModule(["headers", "cookies"], function () {
      this.setExport("headers", async () => new Headers());
      this.setExport("cookies", async () => ({ get: () => undefined, getAll: () => [] }));
    }, { context });
  } else if (path === "virtual:server") {
    mod = new vm.SyntheticModule(["NextResponse"], function () {
      this.setExport("NextResponse", {
        json: (d, i = {}) =>
          new Response(JSON.stringify(d), {
            ...i,
            headers: { "Content-Type": "application/json", ...i.headers },
          }),
      });
    }, { context });
  } else {
    const js = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    mod = new vm.SourceTextModule(js, { context, identifier: path });
  }
  cache.set(path, mod);
  return mod;
}

async function load(path) {
  const mod = getModule(path);
  if (mod.status === "unlinked") {
    await mod.link((spec, refer) => getModule(resolveFile(spec, refer.identifier)));
  }
  if (mod.status === "linked") {
    await mod.evaluate();
  }
  return mod;
}

const soulMemory = (await load(resolve("backend/services/research/soul-memory.ts"))).namespace;
const repro = (await load(resolve("backend/services/research/reproducible-research.ts"))).namespace;
const scanJobs = (await load(resolve("backend/services/research/market-scan-jobs.ts"))).namespace;
const { istCalendarDay } = (await load(resolve("backend/services/research/scan-quota.ts"))).namespace;

function seedAccount(subject, alias) {
  const now = new Date().toISOString();
  sql
    .prepare(
      `INSERT OR IGNORE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
       VALUES (?, ?, ?, '2026-11-14-v4', 1, ?)`,
    )
    .run(subject, alias, now, now);
}

function seedScanRow(id, subject, name, createdAt) {
  sql
    .prepare(
      `INSERT OR IGNORE INTO x1_scans (id, subject, request_key, mode, name, payload, digest, created_at)
       VALUES (?, ?, ?, 'SIMPLE', ?, '{}', 'digest_test', ?)`,
    )
    .run(id, subject, `req_${id}`, name, createdAt);
}

test("X3-130 Contract D (D7 Mandatory Evidence): SOUL MEMORY isolation, no look-ahead, dedup, adaptive ranking, and IST midnight reset", async () => {
  seedAccount("user-sm-a", "Researcher A");
  seedAccount("user-sm-b", "Researcher B");

  // Use today's IST date at 10:00 IST (04:30 UTC) and 13:00 IST (07:30 UTC)
  const todayIst = istCalendarDay(Date.now());
  const t1Iso = `${todayIst}T04:30:00.000Z`; // 10:00 IST
  const t2Iso = `${todayIst}T07:30:00.000Z`; // 13:00 IST
  const futureIso = `${todayIst}T09:30:00.000Z`; // 15:00 IST (AFTER t2)
  const t1Ms = Date.parse(t1Iso);
  const t2Ms = Date.parse(t2Iso);

  const matches = [
    {
      instrumentId: "NSE:INFY",
      status: "PASS",
      reasons: ["RSI < 40"],
      latestEventAt: t1Iso,
      source: "TEST",
      metrics: { changePct: 0.4, volRatio: null, rsi14: 34, rangePosPct: 30 }, // Missing volume!
    },
    {
      instrumentId: "NSE:TCS",
      status: "PASS",
      reasons: ["RSI < 40"],
      latestEventAt: t1Iso,
      source: "TEST",
      metrics: { changePct: 2.1, volRatio: 2.0, rsi14: 38, rangePosPct: 60 },
    },
    {
      instrumentId: "NSE:SBIN",
      status: "PASS",
      reasons: ["RSI < 40"],
      latestEventAt: t1Iso,
      source: "TEST",
      metrics: { changePct: -0.2, volRatio: 1.1, rsi14: 39, rangePosPct: 45 },
    },
  ];
  const formula = "rsi(close, 14) < 40";
  const direction = soulMemory.inferSignalDirection(formula);
  assert.equal(direction, "LONG");
  const sig = await soulMemory.computeRuleSignature(formula, "CLASSIC", "1h", direction);

  // 1. Baseline frozen state for User A at T1
  const frozenT1 = await soulMemory.captureFrozenSoulMemory("user-sm-a", t1Ms);
  assert.equal(frozenT1.status, "BASELINE");
  assert.equal(frozenT1.scansAnalyzed, 0);

  const baselineRank = soulMemory.rankMatchesWithSoulMemory({
    matches,
    frozen: frozenT1,
    ruleSignature: sig,
    timeframe: "1h",
    direction,
  });
  // Original match set is NEVER modified (exact same 3 instruments!)
  assert.deepEqual(
    Array.from(baselineRank.rankings, (r) => r.instrumentId).sort(),
    ["NSE:INFY", "NSE:SBIN", "NSE:TCS"],
  );
  // Missing volume for INFY must omit volume component cleanly (not zero-fill)
  const infyBase = baselineRank.rankings.find((r) => r.instrumentId === "NSE:INFY");
  assert.equal(infyBase?.components.volumeConfirmation, null);

  // 2. Record completed scan observations + verify duplicate request deduplication
  seedScanRow("scan-a-1", "user-sm-a", "Morning RSI", t1Iso);
  const sectorMap = new Map([
    ["NSE:INFY", "IT"],
    ["NSE:TCS", "IT"],
    ["NSE:SBIN", "Banking"],
  ]);
  const rec1 = await soulMemory.recordCompletedScanObservations({
    subject: "user-sm-a",
    scanId: "scan-a-1",
    requestDigest: "digest_identical_0001",
    formula,
    origin: "CLASSIC",
    timeframe: "1h",
    cutoffIso: t1Iso,
    dataVersion: "u-v1",
    matches,
    sectorByInstrument: sectorMap,
  });
  assert.equal(rec1.recorded, 3);
  assert.equal(rec1.skippedDuplicates, 0);

  // Submitting identical scan request digest a second time MUST deduplicate (0 new observations!)
  seedScanRow("scan-a-dup", "user-sm-a", "Morning RSI Dup", t1Iso);
  const recDup = await soulMemory.recordCompletedScanObservations({
    subject: "user-sm-a",
    scanId: "scan-a-dup",
    requestDigest: "digest_identical_0001",
    formula,
    origin: "CLASSIC",
    timeframe: "1h",
    cutoffIso: t1Iso,
    dataVersion: "u-v1",
    matches,
    sectorByInstrument: sectorMap,
  });
  assert.equal(recDup.recorded, 0);
  assert.equal(recDup.skippedDuplicates, 3);

  // 3. Cross-user isolation: User B MUST NOT see any of User A's SOUL MEMORY
  const frozenB = await soulMemory.captureFrozenSoulMemory("user-sm-b", t2Ms);
  assert.equal(frozenB.scansAnalyzed, 0);
  assert.equal(frozenB.distinctSignals, 0);
  assert.equal(frozenB.status, "BASELINE");

  // 4. Future-bar rejection (anti-lookahead): bars completing AFTER T2 MUST remain PENDING
  const evalFutureRejected = await soulMemory.evaluatePendingSoulMemoryOutcomes({
    subject: "user-sm-a",
    evaluationCutoffMs: t2Ms,
    getSignalAndForwardBars: async () => ({
      entryClose: 100,
      forwardBar: { eventAt: t2Iso, closeAt: futureIso, close: 110 }, // closeAt > T2!
    }),
  });
  assert.equal(evalFutureRejected.evaluated, 0);
  assert.equal(evalFutureRejected.pendingRemaining, 3);

  // 5. Valid completed forward bars (t1 < closeAt <= t2) confirm outcomes & activate SOUL MEMORY
  const evalValid = await soulMemory.evaluatePendingSoulMemoryOutcomes({
    subject: "user-sm-a",
    evaluationCutoffMs: t2Ms,
    getSignalAndForwardBars: async (instrumentId) => ({
      entryClose: 100,
      forwardBar: {
        eventAt: `${todayIst}T06:30:00.000Z`,
        closeAt: t2Iso,
        close: instrumentId === "NSE:SBIN" ? 98.5 : 103.0, // IT confirms (+3%), Banking fails (-1.5%)
      },
    }),
  });
  assert.equal(evalValid.evaluated, 3);
  assert.equal(evalValid.confirmed, 2);

  // Subsequent scan at T2 captures ACTIVE daily state and shifts optional ranking cleanly without altering matches
  const frozenT2 = await soulMemory.captureFrozenSoulMemory("user-sm-a", t2Ms);
  assert.equal(frozenT2.status, "ACTIVE");
  assert.equal(frozenT2.evaluatedOutcomes, 3);

  const activeRank = soulMemory.rankMatchesWithSoulMemory({
    matches,
    frozen: frozenT2,
    ruleSignature: sig,
    timeframe: "1h",
    direction,
    sectorByInstrument: sectorMap,
  });
  assert.equal(activeRank.status, "ACTIVE");
  // Same 3 original matches preserved verbatim
  assert.deepEqual(
    Array.from(activeRank.rankings, (r) => r.instrumentId).sort(),
    ["NSE:INFY", "NSE:SBIN", "NSE:TCS"],
  );
  // Confirmed IT stock with volume confirmation ranks ahead of unconfirmed Banking stock
  assert.equal(activeRank.rankings[0].instrumentId, "NSE:TCS");
  assert.equal(activeRank.rankings[activeRank.rankings.length - 1].instrumentId, "NSE:SBIN");
  // Point-in-time check: querying back at T1 must NOT leak state updated at T2
  const backAtT1 = await soulMemory.captureFrozenSoulMemory("user-sm-a", t1Ms - 60_000);
  assert.equal(backAtT1.status, "BASELINE");

  // 6. IST midnight rollover reset: next IST day immediately starts empty BASELINE & prunes prior active state
  // WITHOUT deleting GRAVEYARD archive (`x1_scans`)!
  const nextDayMs = Date.parse(`${todayIst}T18:30:01.000Z`); // 00:00:01 IST next day
  const frozenNextDay = await soulMemory.captureFrozenSoulMemory("user-sm-a", nextDayMs);
  assert.equal(frozenNextDay.status, "BASELINE");
  assert.equal(frozenNextDay.scansAnalyzed, 0);

  const resetRes = await soulMemory.resetExpiredSoulMemoryDailyState(nextDayMs);
  assert.ok(resetRes.prunedStates >= 1);
  assert.ok(resetRes.prunedObservations >= 3);
  // Immutable x1_scans archive MUST remain completely intact
  const archiveCount = sql
    .prepare("SELECT count(*) AS n FROM x1_scans WHERE subject='user-sm-a'")
    .get();
  assert.equal(archiveCount.n, 2);
});

test("X3-127 Contract B: Reproducible research lineage, rerun linkage, and drift detection", async () => {
  seedAccount("user-repro", "Repro Quant");
  const t1 = "2026-11-27T10:00:00.000Z";
  const t2 = "2026-11-28T10:00:00.000Z";
  seedScanRow("scan-orig-1", "user-repro", "Original Scan", t1);
  seedScanRow("scan-rerun-2", "user-repro", "Rerun Scan", t2);

  const recOrig = await repro.buildReproducibilityRecord({
    scanId: "scan-orig-1",
    formulaVersion: "x1-scan-1",
    formula: "close > sma(close, 20)",
    universeVersion: "u-2026-11-27",
    memberIds: ["NSE:TCS", "NSE:INFY"],
    timeframe: "1d",
    cutoffIso: t1,
    dataFreshness: "PUBLISHED_EOD",
    rightsMode: "DERIVED_ONLY",
    rawCandlesRetained: false,
  });
  // Unordered set hash must be order-invariant
  const hashReversed = await repro.computeUniverseHash(["NSE:INFY", "NSE:TCS"]);
  assert.equal(recOrig.universeHash, hashReversed);
  assert.equal(recOrig.reproducibilityStatus, "DERIVED_CHECKSUM_ONLY");
  await repro.persistScanLineage("user-repro", recOrig);

  const recRerun = await repro.buildReproducibilityRecord({
    scanId: "scan-rerun-2",
    rerunOfScanId: "scan-orig-1",
    rerunMode: "RERUN_LATEST",
    formulaVersion: "x1-scan-1",
    formula: "close > sma(close, 20)",
    universeVersion: "u-2026-11-28",
    memberIds: ["NSE:TCS", "NSE:INFY", "NSE:SBIN"],
    timeframe: "1d",
    cutoffIso: t2,
    dataFreshness: "PUBLISHED_EOD",
    rightsMode: "DISPLAY_AND_DERIVED",
    rawCandlesRetained: true,
  });
  assert.equal(recRerun.reproducibilityStatus, "FULL_SNAPSHOT");
  await repro.persistScanLineage("user-repro", recRerun);

  const loaded = await repro.getScanLineage("user-repro", "scan-orig-1");
  assert.equal(loaded.record?.scanId, "scan-orig-1");
  assert.equal(loaded.reruns.length, 1);
  assert.equal(loaded.reruns[0].scanId, "scan-rerun-2");
  const diffs = repro.diffReproducibility(recOrig, recRerun);
  assert.equal(diffs.length, 2); // Universe changed + Cutoff advanced
});

test("X3-126 Contract A: Scan job retry clears lease_until (no 60s queue stall) and reaps expired jobs", async () => {
  seedAccount("user-job-a", "Job User A");
  seedAccount("user-job-b", "Job User B");
  const nowIso = new Date().toISOString();
  const futureDeadline = new Date(Date.now() + 3600_000).toISOString();

  // Insert a reservation + queued job for User A
  sql
    .prepare(
      `INSERT INTO x51_scan_reservations (id, subject, tier, idempotency_key, ist_day, state, lease_expires_at, created_at)
       VALUES ('res-job-a', 'user-job-a', 'CLASSIC', 'req_job_retry_a_0001', ?, 'RUNNING', ?, ?)`,
    )
    .run(istCalendarDay(Date.now()), futureDeadline, nowIso);
  sql
    .prepare(
      `INSERT INTO x78_market_scan_jobs
         (id, subject, request_key, request_digest, reservation_id, universe_version, input, cutoff, deadline,
          state, cursor, evaluated, lease, lease_until, attempts, scope_members, selected_count)
       VALUES
         ('job-retry-a', 'user-job-a', 'req_job_retry_a_0001', 'dig-a', 'res-job-a', 'x8-scoped-v1',
          ?, ?, ?, 'QUEUED', 0, 0, NULL, NULL, 0, ?, 1)`,
    )
    .run(
      JSON.stringify({
        definition: {
          name: "Retry test",
          description: "Test retry lease cleanup.",
          formula: "close > 0",
          mode: "SIMPLE",
          universe: "CONNECTED_MARKETS",
          universePreset: "MY_WATCHLIST",
          interval: "1d",
          partialPolicy: "ALLOW_UNKNOWN",
          outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
          instrumentIds: ["NSE:TCS"],
        },
        origin: "CLASSIC",
      }),
      nowIso,
      futureDeadline,
      JSON.stringify(["NSE:TCS"]),
    );

  // Trigger a transient upstream error during batch processing
  const ran = await scanJobs.processMarketScanBatch(async () => {
    throw new Error("Simulated transient upstream 503");
  });
  assert.equal(ran, true);

  // CRITICAL ASSERTION: lease AND lease_until MUST BOTH be NULL after transient retry so other users are NOT stalled!
  const afterRetry = sql
    .prepare("SELECT state, lease, lease_until, attempts FROM x78_market_scan_jobs WHERE id='job-retry-a'")
    .get();
  assert.equal(afterRetry.state, "QUEUED");
  assert.equal(afterRetry.lease, null);
  assert.equal(afterRetry.lease_until, null);
  assert.equal(afterRetry.attempts, 1);

  // Verify expired job reaper cleans up past-deadline jobs and releases reservation
  const pastDeadline = new Date(Date.now() - 60_000).toISOString();
  sql
    .prepare("UPDATE x78_market_scan_jobs SET deadline=? WHERE id='job-retry-a'")
    .run(pastDeadline);
  const reaped = await scanJobs.reapExpiredScanJobs(new Date().toISOString());
  assert.equal(reaped, 1);
  const finalJob = sql
    .prepare("SELECT state FROM x78_market_scan_jobs WHERE id='job-retry-a'")
    .get();
  const finalRes = sql
    .prepare("SELECT state FROM x51_scan_reservations WHERE id='res-job-a'")
    .get();
  assert.equal(finalJob.state, "FAILED");
  assert.equal(finalRes.state, "FAILED");
});
