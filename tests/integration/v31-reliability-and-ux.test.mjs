import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID, webcrypto } from "node:crypto";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const root = process.cwd();
const context = vm.createContext({
  console,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  Headers,
  Request,
  Response,
  Intl,
  Date,
  Math,
  Number,
  JSON,
  Map,
  Set,
  Promise,
  Float64Array,
  Uint8Array,
  Error,
  TypeError,
  RegExp,
  Array,
  Object,
  String,
  Boolean,
  Symbol,
  AbortController,
  AbortSignal,
  setTimeout,
  clearTimeout,
  fetch,
});
const moduleCache = new Map();
async function loadTs(relOrAbsPath) {
  const file = resolve(root, relOrAbsPath);
  if (moduleCache.has(file)) return (await moduleCache.get(file)).namespace;
  const promise = (async () => {
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    await mod.link(async (spec, refer) => {
      if (spec === "cloudflare:workers") {
        if (!moduleCache.has(spec)) {
          moduleCache.set(
            spec,
            Promise.resolve(
              new vm.SyntheticModule(["env"], function () {
                this.setExport("env", {});
              }, { context }),
            ),
          );
        }
        return moduleCache.get(spec);
      }
      const base = resolve(dirname(refer.identifier), spec);
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((p) =>
        existsSync(p),
      );
      if (!target) throw new Error(`Cannot resolve ${spec} from ${refer.identifier}`);
      await loadTs(target);
      return moduleCache.get(target);
    });
    await mod.evaluate();
    return mod;
  })();
  moduleCache.set(file, promise);
  return (await promise).namespace;
}

const {
  InstrumentMaster,
  VERIFIED_SEED_INSTRUMENTS,
  normalizeScripMasterRow,
} = await loadTs("backend/services/market-data/angelone/instrument-master.ts");
const {
  getIndianExchangeSession,
  getNymexGlobexSession,
} = await loadTs("backend/services/market-data/angelone/calendar.ts");
const {
  completedBrokerObservations,
  completedCommercialIntradayObservations,
  hourlyBarCloseMs,
  thirtyMinBarCloseMs,
} = await loadTs("backend/services/market-data/angelone/scan-history.ts");
const {
  CLASSIC_DAILY_LIMIT,
  ADVANCED_ROLLING_LIMIT,
  getScanQuotaSummary,
  persistReservedScan,
  reserveScanSlot,
} = await loadTs("backend/services/research/scan-quota.ts");
const {
  compileFormula,
  computeScanMetrics,
  evaluateScan,
  requiredScanBars,
} = await loadTs("backend/engines/scan.ts");
const { CLASSIC_50_PRESETS } = await loadTs("backend/services/research/classic-presets.ts");
const {
  PATTERN_TEMPLATES,
  matchDrawnPattern,
  validateStrokePoints,
} = await loadTs("backend/engines/pattern-draw.ts");
const { providerIntradayCandles } = await loadTs("backend/services/market-data/providers.ts");
const { APP_RELEASE } = await loadTs("backend/services/release-meta.ts");

// Lightweight synchronous D1 adapter backed by in-memory node:sqlite for quota concurrency tests
function createTestQuotaDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE x1_scans (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      request_key TEXT NOT NULL,
      mode TEXT NOT NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      digest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(subject, request_key)
    );
    CREATE TABLE x51_scan_reservations (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      tier TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      ist_day TEXT NOT NULL,
      state TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      completed_at TEXT,
      scan_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(subject, idempotency_key)
    );
  `);
  const wrap = (sql, params = []) => ({
    bind: (...args) => wrap(sql, args),
    run: async () => {
      const info = sqlite.prepare(sql).run(...params);
      return { meta: { changes: info.changes } };
    },
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  });
  return {
    prepare: (sql) => wrap(sql),
    batch: async (stmts) => {
      const out = [];
      sqlite.exec("BEGIN");
      try {
        for (const s of stmts) out.push(await s.run());
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
      return out;
    },
  };
}

// ── 1. R03 / R04 / R05: Canonical 8-card tokens & true exchange sessions ─────

test("V3.1 R03/R04: NSE:NIFTYMIDCAP100 (99926011) and MCX Gold/Silver exact contracts resolve without mini/guinea mismatch", () => {
  const master = new InstrumentMaster();
  const midcap = master.resolve("NSE:NIFTYMIDCAP100");
  assert.ok(midcap, "NSE:NIFTYMIDCAP100 must resolve from verified seed catalog");
  assert.equal(midcap.token, "99926011");
  assert.equal(midcap.exchange, "NSE");
  assert.equal(midcap.segment, "INDEX");

  // Spaced alias resolves identically
  const midcapSpaced = master.resolve("NSE:NIFTY MIDCAP 100");
  assert.equal(midcapSpaced?.id, "NSE:NIFTYMIDCAP100");
  assert.equal(midcapSpaced?.token, "99926011");

  // Scrip-master normalization strips spaces in NSE AMXIDX IDs
  const norm = normalizeScripMasterRow({
    token: "99926011",
    symbol: "NIFTY MIDCAP 100",
    name: "NIFTY MIDCAP 100",
    expiry: "",
    strike: "-1.000000",
    lotsize: "1",
    instrumenttype: "AMXIDX",
    exch_seg: "NSE",
    tick_size: "0.05",
  });
  assert.equal(norm?.id, "NSE:NIFTYMIDCAP100");

  // Verified seed catalog includes both MCX Gold and MCX Silver active contracts
  const goldSeeds = VERIFIED_SEED_INSTRUMENTS.filter(
    (i) => i.exchange === "MCX" && i.symbol === "GOLD",
  );
  const silverSeeds = VERIFIED_SEED_INSTRUMENTS.filter(
    (i) => i.exchange === "MCX" && i.symbol === "SILVER",
  );
  assert.ok(goldSeeds.length >= 2, "Expected active + next MCX GOLD futures seeds");
  assert.ok(silverSeeds.length >= 2, "Expected active + next MCX SILVER futures seeds");
  assert.ok(silverSeeds.every((s) => s.symbol === "SILVER" && s.lotSize === 30));
});

test("V3.1 R05: MCX partial-holiday schedule and NYMEX Globex CL schedule are timezone- and DST-accurate", () => {
  // 2026-11-24 is Guru Nanak Jayanti: NSE closed all day; MCX closed morning (11:00 IST) and open evening (18:00 IST)
  const gnjMorning = Date.parse("2026-11-24T05:30:00.000Z"); // 11:00 IST
  const gnjEvening = Date.parse("2026-11-24T12:30:00.000Z"); // 18:00 IST

  assert.equal(getIndianExchangeSession("NSE", gnjMorning).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("NSE", gnjEvening).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("MCX", gnjMorning).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("MCX", gnjEvening).state, "OPEN");

  // NYMEX Globex CL: Tuesday 14:00 ET (19:00 UTC in winter EST) is OPEN; 17:30 ET (22:30 UTC) is daily maintenance CLOSED; Saturday is WEEKEND
  const clOpen = getNymexGlobexSession(Date.parse("2026-11-24T19:00:00.000Z"));
  assert.equal(clOpen.state, "OPEN");
  const clMaint = getNymexGlobexSession(Date.parse("2026-11-24T22:30:00.000Z"));
  assert.equal(clMaint.state, "CLOSED");
  const clWeekend = getNymexGlobexSession(Date.parse("2026-11-21T15:00:00.000Z"));
  assert.equal(clWeekend.state, "CLOSED");
  assert.match(clWeekend.label, /Weekend/i);
  const clSundayReopen = getNymexGlobexSession(Date.parse("2026-11-22T23:30:00.000Z")); // Sun 18:30 EST
  assert.equal(clSundayReopen.state, "OPEN");
});

// ── 2. R09 & R19: Atomic 20/day Classic quota, concurrency & parity ──────────

test("V3.1 R09/R19: Classic quota enforces exact 20/day limit, blocks concurrent 20th-slot race, enforces owner/member parity, and recovers expired leases", async () => {
  assert.equal(CLASSIC_DAILY_LIMIT, 20);
  assert.equal(ADVANCED_ROLLING_LIMIT, 1);

  const db = createTestQuotaDb();
  const baseMs = Date.parse("2026-11-23T06:00:00.000Z"); // 11:30 IST

  // Complete 19 distinct scans for ordinary member
  for (let i = 1; i <= 19; i++) {
    const reqKey = `member_scan_${i}_${randomUUID().slice(0, 8)}`;
    const res = await reserveScanSlot(db, "member-1", "CLASSIC", reqKey, baseMs + i * 1000);
    await persistReservedScan(db, {
      reservationId: res.id,
      subject: "member-1",
      id: randomUUID(),
      requestKey: reqKey,
      mode: "SIMPLE",
      name: `Scan ${i}`,
      payload: JSON.stringify({ ok: true }),
      digest: `dig_${i}`,
      completedAt: new Date(baseMs + i * 1000).toISOString(),
    });
  }

  const beforeRace = await getScanQuotaSummary(db, "member-1", baseMs + 25_000);
  assert.equal(beforeRace.classic.used, 19);
  assert.equal(beforeRace.classic.remaining, 1);

  // Two simultaneous requests racing for final 20th slot: strictly ONE succeeds, ONE rejected 429
  const raceOutcomes = await Promise.allSettled([
    reserveScanSlot(db, "member-1", "CLASSIC", "race_req_alpha_12345", baseMs + 30_000),
    reserveScanSlot(db, "member-1", "CLASSIC", "race_req_beta_67890", baseMs + 30_000),
  ]);
  const fulfilled = raceOutcomes.filter((r) => r.status === "fulfilled");
  const rejected = raceOutcomes.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "Only one concurrent reservation may take the 20th slot");
  assert.equal(rejected.length, 1, "Second concurrent request must fail with 429");
  assert.equal(rejected[0].reason.status, 429);

  // If that 20th reservation never completes and lease expires (>90s), slot recovers automatically!
  const afterLeaseExpiry = await getScanQuotaSummary(db, "member-1", baseMs + 130_000);
  assert.equal(afterLeaseExpiry.classic.used, 19);
  assert.equal(afterLeaseExpiry.classic.remaining, 1);

  // Owner account gets the exact same 20/day limit (parity)
  const ownerQuota = await getScanQuotaSummary(db, "owner-1", baseMs);
  assert.equal(ownerQuota.classic.limit, 20);
  assert.equal(ownerQuota.classic.remaining, 20);
});

// ── 3. R13 & R14: Genuine 30m & 1h intraday session-boundary enforcement ─────

test("V3.1 R13/R14: 30m and 1h intraday filters enforce exact NSE/MCX session closes and never fabricate bars from daily closes", async () => {
  // NSE regular day (2026-11-23 Monday): 09:15–15:30 IST
  // 09:15 IST = 03:45 UTC -> 30m closes at 09:45 IST (04:15 UTC); 1h closes at 10:15 IST (04:45 UTC)
  const bar0915 = Date.parse("2026-11-23T03:45:00.000Z");
  assert.equal(
    new Date(thirtyMinBarCloseMs("NSE", bar0915)).toISOString(),
    "2026-11-23T04:15:00.000Z",
  );
  assert.equal(
    new Date(hourlyBarCloseMs("NSE", bar0915)).toISOString(),
    "2026-11-23T04:45:00.000Z",
  );

  // Terminal 15:15 IST bar (09:45 UTC) closes cleanly at 15:30 IST (10:00 UTC) for BOTH 30m and 1h
  const bar1515 = Date.parse("2026-11-23T09:45:00.000Z");
  assert.equal(
    new Date(thirtyMinBarCloseMs("NSE", bar1515)).toISOString(),
    "2026-11-23T10:00:00.000Z",
  );
  assert.equal(
    new Date(hourlyBarCloseMs("NSE", bar1515)).toISOString(),
    "2026-11-23T10:00:00.000Z",
  );

  // Holiday bar (Guru Nanak Jayanti 2026-11-24 10:00 IST) returns null on NSE
  assert.equal(thirtyMinBarCloseMs("NSE", Date.parse("2026-11-24T04:30:00.000Z")), null);

  // Developing bar exclusion & date-only rejection on commercial feed
  const retrievalIso = "2026-11-23T04:30:00.000Z"; // 10:00 IST
  const commercialCandles = [
    { date: "2026-11-23", open: 100, high: 105, low: 99, close: 104, adjustedClose: null, volume: 1000, openInterest: null, knownAt: retrievalIso, adjustment: "RAW", provider: "TrueData" }, // date-only -> MUST REJECT
    { date: "2026-11-23T03:45:00.000Z", open: 100, high: 102, low: 99, close: 101, adjustedClose: null, volume: 500, openInterest: null, knownAt: retrievalIso, adjustment: "RAW", provider: "TrueData" }, // 09:15-09:45 -> COMPLETED
    { date: "2026-11-23T04:15:00.000Z", open: 101, high: 103, low: 100, close: 102, adjustedClose: null, volume: 300, openInterest: null, knownAt: retrievalIso, adjustment: "RAW", provider: "TrueData" }, // 09:45-10:15 -> DEVELOPING (exclude!)
  ];
  const obs30m = completedCommercialIntradayObservations(commercialCandles, "NSE", retrievalIso, "30m");
  assert.equal(obs30m.length, 1);
  assert.equal(obs30m[0].eventAt, "2026-11-23T03:45:00.000Z");

  // Broker series rejects mismatched interval (daily series passed for 30m -> empty)
  const fakeDailyFor30m = completedBrokerObservations(
    {
      instrument: VERIFIED_SEED_INSTRUMENTS[0],
      interval: "1d",
      retrievalTimestampUTC: retrievalIso,
      candles: [],
    },
    "30m",
  );
  assert.equal(fakeDailyFor30m.length, 0);

  // providerIntradayCandles requests TrueData `30min` cleanly and rejects EODHD `30m` honestly
  let capturedUrl = "";
  const tdCfg = {
    provider: "TRUEDATA",
    enabled: true,
    priority: 1,
    version: 1,
    rights: { display: true, analysis: true, storage: true, redistribution: true, verified: true, cacheSeconds: 60, contractReference: "T", expiresAt: "2028-01-01T00:00:00Z" },
    instruments: [],
    datasets: ["candles"],
    dailyCallLimit: 100,
    lastWrite: "2026-11-23T00:00:00Z",
  };
  const inst = { id: "NSE:SBIN", name: "SBI", symbol: "SBIN", providerSymbol: "SBIN", market: "NSE", mic: "XNSE", type: "EQUITY", currency: "INR", unit: "INR", timezone: "Asia/Kolkata" };
  await providerIntradayCandles(
    tdCfg,
    inst,
    "test_bearer_token_1234",
    "30m",
    15,
    async (u) => {
      capturedUrl = String(u);
      return new Response(
        JSON.stringify({
          status: "Success",
          records: [
            ["timestamp", "o", "h", "l", "c", "v", "oi"],
            ["2026-11-23 09:15:00", 800, 808, 798, 806, 12000, 0],
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
    Date.parse("2026-11-23T06:00:00.000Z"),
  );
  assert.match(capturedUrl, /interval=30min/);

  await assert.rejects(
    () =>
      providerIntradayCandles(
        { ...tdCfg, provider: "EODHD" },
        inst,
        "test_eodhd_token_1234",
        "30m",
        15,
      ),
    /30-minute/i,
  );
});

// ── 4. R10 & R16: Independent Differential Math + All 50 Classic Presets ─────

function refSma(arr, n) {
  return arr.slice(-n).reduce((s, v) => s + v, 0) / n;
}
function refEma(arr, n) {
  let e = arr.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const k = 2 / (n + 1);
  for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function refWilderRsi(arr, n) {
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = arr[i] - arr[i - 1];
    g += Math.max(d, 0) / n;
    l += Math.max(-d, 0) / n;
  }
  for (let i = n + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (g === 0 && l === 0) return 50;
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}

function makeOhlcvDataset(instrumentId, closes, volumeFn = () => 100_000) {
  const base = Date.parse("2025-11-01T00:00:00.000Z");
  return {
    instrumentId,
    source: "TestFixture",
    permitted: true,
    observations: closes.map((c, i) => {
      const ts = new Date(base + i * 86_400_000).toISOString();
      return {
        eventAt: ts,
        knownAt: ts,
        open: Math.max(0.01, c * 0.995),
        high: c * 1.015,
        low: Math.max(0.01, c * 0.985),
        close: c,
        volume: volumeFn(i),
      };
    }),
  };
}

test("V3.1 R10/R16: Independent differential indicator verification, editable Classic AST changes outcome, and all 50 presets evaluate cleanly", () => {
  // Deterministic non-trivial 260-bar series (oscillating uptrend ~65 RSI, downtrend ~25 RSI, flat)
  const rising = Array.from({ length: 260 }, (_, i) => 100 + i * 0.6 + Math.sin(i / 2.2) * 5);
  const falling = Array.from({ length: 260 }, (_, i) => 400 - i * 0.9 + Math.cos(i / 2.5) * 4);
  const flat = Array.from({ length: 260 }, () => 150);
  const asOf = "2026-12-31T00:00:00.000Z";

  // Independent differential check: SMA(20), EMA(20), Wilder RSI(14), MACD(12,26)
  const expectedSma20 = refSma(rising, 20);
  const expectedEma20 = refEma(rising, 20);
  const expectedRsi14 = refWilderRsi(rising, 14);
  const expectedMacd = refEma(rising, 12) - refEma(rising, 26);

  const dsRising = makeOhlcvDataset("FIXTURE:RISE", rising, (i) => (i === 259 ? 500_000 : 100_000));
  const dsFalling = makeOhlcvDataset("FIXTURE:FALL", falling);
  const dsFlat = makeOhlcvDataset("FIXTURE:FLAT", flat);

  // Verify production AST agrees with independent reference within 1e-6
  const checkBound = (expr, ds, expectedPass) => {
    const rep = evaluateScan(compileFormula(expr), [ds], asOf);
    assert.equal(rep.results[0].status, expectedPass ? "PASS" : "FAIL", `Failed differential check: ${expr}`);
  };
  checkBound(`sma(close, 20) > ${expectedSma20 - 1e-5}`, dsRising, true);
  checkBound(`sma(close, 20) < ${expectedSma20 + 1e-5}`, dsRising, true);
  checkBound(`ema(close, 20) > ${expectedEma20 - 1e-5}`, dsRising, true);
  checkBound(`ema(close, 20) < ${expectedEma20 + 1e-5}`, dsRising, true);
  checkBound(`rsi(close, 14) > ${expectedRsi14 - 1e-5}`, dsRising, true);
  checkBound(`rsi(close, 14) < ${expectedRsi14 + 1e-5}`, dsRising, true);
  checkBound(`macd(close, 12, 26) > ${expectedMacd - 1e-5}`, dsRising, true);
  checkBound(`macd(close, 12, 26) < ${expectedMacd + 1e-5}`, dsRising, true);

  // Flat series RSI convention == 50, all-gains == 100, all-losses == 0
  checkBound("rsi(close, 14) == 50", dsFlat, true);
  const allUp = makeOhlcvDataset("FIXTURE:ALLUP", Array.from({ length: 40 }, (_, i) => 100 + i));
  const allDn = makeOhlcvDataset("FIXTURE:ALLDN", Array.from({ length: 40 }, (_, i) => 200 - i));
  checkBound("rsi(close, 14) == 100", allUp, true);
  checkBound("rsi(close, 14) == 0", allDn, true);

  // Divide-by-zero yields UNKNOWN cleanly (never NaN or uncaught throw)
  const divZero = evaluateScan(compileFormula("close / (close - close) > 1"), [dsRising], asOf);
  assert.equal(divZero.results[0].status, "UNKNOWN");

  // Editing a Classic formula parameter genuinely changes AST evaluation outcome while keeping preset immutable
  const rsiPreset = CLASSIC_50_PRESETS.find((p) => p.formula.includes("rsi(close, 14)"));
  assert.ok(rsiPreset);
  const originalFormula = rsiPreset.formula;
  const origOutcome = evaluateScan(compileFormula("rsi(close, 14) < 35"), [dsRising, dsFalling], asOf);
  const editedOutcome = evaluateScan(compileFormula("rsi(close, 14) < 85"), [dsRising, dsFalling], asOf);
  assert.equal(origOutcome.matches, 1);
  assert.equal(editedOutcome.matches, 2);
  assert.notEqual(
    origOutcome.matches,
    editedOutcome.matches,
    "Editing Classic threshold from 35 to 85 must change actual AST match outcome",
  );
  assert.equal(rsiPreset.formula, originalFormula, "Canonical Classic preset must remain immutable");

  // All 50 Classic presets compile, compute valid requiredScanBars, and run deterministically with zero errors
  assert.equal(CLASSIC_50_PRESETS.length, 50);
  for (const preset of CLASSIC_50_PRESETS) {
    const compiled = compileFormula(preset.formula);
    const minBars = requiredScanBars(compiled.ast);
    assert.ok(minBars >= 1 && minBars <= 400, `${preset.id} minBars out of bounds: ${minBars}`);
    const run1 = evaluateScan(compiled, [dsRising, dsFalling, dsFlat], asOf);
    const run2 = evaluateScan(compiled, [dsRising, dsFalling, dsFlat], asOf);
    assert.deepEqual(run1, run2, `Preset ${preset.id} must be 100% deterministic`);
    assert.equal(run1.matches + run1.failed + run1.unknown, 3, `Disjoint partition conserved for ${preset.id}`);
  }
});

// ── 5. R17 & R18: Pattern Scan validation, flat-line rejection & no look-ahead ──

test("V3.1 R17/R18: Pattern Scan rejects flat/invalid shapes, ignores future bars, clamps fit in [0,100], and ranks deterministically", () => {
  // Reject flat horizontal line
  assert.throws(
    () =>
      validateStrokePoints([
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.5 },
      ]),
    /flat lines/i,
  );
  // Reject nonfinite coordinates
  assert.throws(
    () => validateStrokePoints([{ x: 0, y: Number.NaN }, { x: 1, y: 0.2 }]),
    /finite/i,
  );

  // Build dataset that matches Double Bottom in trailing 20 bars, plus a flat constant dataset, plus future bar
  const tpl = PATTERN_TEMPLATES[0]; // double_bottom
  const base = Date.parse("2026-10-01T00:00:00.000Z");
  const wCloses = [
    182, 165, 145, 130, 114, 128, 142, 152, 160, 150,
    138, 125, 116, 135, 158, 172, 180, 185, 188, 190,
  ];
  const dsMatch = {
    instrumentId: "FIXTURE:WSHAPE",
    source: "TestFixture",
    permitted: true,
    observations: [
      ...wCloses.map((c, i) => {
        const ts = new Date(base + i * 86_400_000).toISOString();
        return { eventAt: ts, knownAt: ts, close: c };
      }),
      // Future bar AFTER asOf cutoff — must be ignored (no look-ahead!)
      { eventAt: "2026-12-15T00:00:00.000Z", knownAt: "2026-12-15T00:00:00.000Z", close: 10 },
    ],
  };
  const dsFlat = makeOhlcvDataset("FIXTURE:FLATLINE", Array.from({ length: 25 }, () => 100));

  const rep1 = matchDrawnPattern(tpl.points, [dsMatch, dsFlat], {
    windowBars: 20,
    minPatternFit: 75,
    asOf: "2026-11-01T00:00:00.000Z",
  });
  const rep2 = matchDrawnPattern(tpl.points, [dsMatch, dsFlat], {
    windowBars: 20,
    minPatternFit: 75,
    asOf: "2026-11-01T00:00:00.000Z",
  });
  assert.deepEqual(rep1, rep2);
  assert.equal(rep1.matches.length, 1);
  assert.equal(rep1.matches[0].instrumentId, "FIXTURE:WSHAPE");
  assert.ok(rep1.matches[0].patternFit >= 75 && rep1.matches[0].patternFit <= 100);
  assert.ok(Date.parse(rep1.matches[0].windowEndAt) <= Date.parse("2026-11-01T00:00:00.000Z"));
});

// ── 6. R01, R05, R07, R08, R10, R17, R23: V3.1 UI & Security Contracts ──────

test("V3.1 UI & Release Contracts: zero 'Last available', clean chart-first Asset Research, editable Classic 20/day, simplified Pattern Scan, teal tokens, clean release meta", () => {
  assert.equal(APP_RELEASE.releaseTrack, "V3.1");
  assert.equal(APP_RELEASE.revisionMarker, "x1-workspace-rollout-2026-11-25");
  assert.equal(APP_RELEASE.workspaceExperience, "X 1.0");

  const gridSrc = readFileSync("frontend/features/global/market-grid.tsx", "utf8");
  assert.doesNotMatch(gridSrc, /Last available/i, "Repetitive 'Last available' badge must be removed");
  assert.match(gridSrc, /SharedLiveClock/);
  assert.match(gridSrc, /#42CF91/);
  assert.match(gridSrc, /#EF666A/);

  const assetSrc = readFileSync("frontend/features/global/asset-terminal.tsx", "utf8");
  assert.match(assetSrc, /Scan Asset/);
  assert.match(assetSrc, /"1D",\s*\n\s*"1W",\s*\n\s*"1M",\s*\n\s*"3M",\s*\n\s*"1Y",\s*\n\s*"ALL"/);
  assert.doesNotMatch(assetSrc, /Private Owner Read-Only/i);
  assert.doesNotMatch(assetSrc, /Token \{ownerQuote\.token\}/);

  const stratSrc = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  assert.match(stratSrc, /Browse all 50 formulas/);
  assert.match(stratSrc, /ss-v31-classic-formula/);
  assert.match(stratSrc, /Did not match:/);
  assert.doesNotMatch(stratSrc, /\boptional\b/i);
  assert.doesNotMatch(stratSrc, /8 scans per IST day/);

  const drawSrc = readFileSync("frontend/features/strategy/draw-canvas.tsx", "utf8");
  assert.match(drawSrc, /Pattern Scan/);
  assert.match(drawSrc, /Draw a pattern\. Find similar historical market movements\./);
  assert.match(drawSrc, /Find Similar Patterns/);
  assert.match(drawSrc, /#4FA3A1/);
  assert.doesNotMatch(drawSrc, /5-stock Indian equity CSV fixture/i);

  const cssSrc = readFileSync("frontend/styles/ss-v3.css", "utf8");
  assert.match(cssSrc, /--ss-teal:\s*#4fa3a1/i);
  assert.match(cssSrc, /--ss-gain:\s*#42cf91/i);
  assert.match(cssSrc, /--ss-loss:\s*#ef666a/i);
  assert.match(cssSrc, /100dvh/);
});

// ── 7. Soul Scan Liquid Universe, Deterministic Metrics & Rich Output Contracts ──

test("Soul Scan liquid seed catalog covers 30 NSE leaders + 5 core MCX commodities with clean canonical IDs", () => {
  const nseEq = VERIFIED_SEED_INSTRUMENTS.filter(
    (i) => i.exchange === "NSE" && i.segment === "EQUITY",
  );
  assert.ok(nseEq.length >= 30, `Expected >=30 verified NSE equity seeds, got ${nseEq.length}`);
  const ids = VERIFIED_SEED_INSTRUMENTS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "All seed IDs must be unique");
  for (const id of ids) {
    assert.match(
      id,
      /^[A-Za-z0-9:._-]{3,50}$/,
      `Seed ID ${id} must stay compatible with watchlist & chart layout regexes`,
    );
  }
  const mcxRoots = new Set(
    VERIFIED_SEED_INSTRUMENTS.filter(
      (i) => i.exchange === "MCX" && i.segment === "FUTURE",
    ).map((i) => i.symbol),
  );
  for (const root of ["GOLD", "SILVER", "CRUDEOIL", "NATURALGAS", "COPPER"]) {
    assert.ok(mcxRoots.has(root), `Core MCX commodity ${root} missing from verified seeds`);
  }
});

test("evaluateScan computes independently verified deterministic metrics, crossover proof, and handles index null volume", () => {
  const closes = Array.from({ length: 65 }, (_, i) =>
    100 + i * 0.4 + Math.sin(i / 4) * 2.5,
  );
  // Force clean upward crossover above EMA20 on the final bar
  closes[closes.length - 2] = refEma(closes.slice(0, -1), 20) - 0.8;
  closes[closes.length - 1] = refEma(closes, 20) + 3.5;

  const dsEq = makeOhlcvDataset("NSE:SBIN", closes);
  // Make latest volume exactly 2.0x the prior 19 bars' average -> check volRatio > 1.5
  for (let i = 0; i < dsEq.observations.length - 1; i++) {
    dsEq.observations[i].volume = 100_000;
  }
  dsEq.observations[dsEq.observations.length - 1].volume = 220_000;

  const dsIndex = makeOhlcvDataset("NSE:NIFTY", closes);
  for (const obs of dsIndex.observations) obs.volume = null;

  const rule = compileFormula("crossesAbove(close, ema(close, 20))");
  const report = evaluateScan(rule, [dsEq, dsIndex], "2026-12-01T00:00:00.000Z");

  const sbin = report.results.find((r) => r.instrumentId === "NSE:SBIN");
  assert.ok(sbin && sbin.metrics);
  assert.equal(sbin.status, "PASS");
  assert.ok(
    sbin.reasons.some((line) => /crossesAbove/i.test(line) && /PASS/.test(line)),
    "Crossover scans must record explicit prev -> now comparison proof",
  );
  assert.equal(sbin.metrics.barsEvaluated, 65);
  assert.ok(Math.abs(sbin.metrics.sma20 - refSma(closes, 20)) < 1e-2);
  assert.ok(Math.abs(sbin.metrics.ema20 - refEma(closes, 20)) < 1e-2);
  assert.ok(Math.abs(sbin.metrics.rsi14 - refWilderRsi(closes, 14)) < 0.2);
  assert.ok(sbin.metrics.volRatio !== null && sbin.metrics.volRatio > 1.9);
  assert.ok(sbin.metrics.atr14 !== null && sbin.metrics.atr14 > 0);
  assert.ok(sbin.metrics.atrPct !== null && sbin.metrics.atrPct > 0);
  assert.ok(
    sbin.metrics.low20 !== null &&
      sbin.metrics.high20 !== null &&
      sbin.metrics.high20 > sbin.metrics.low20,
  );
  assert.ok(
    sbin.metrics.rangePosPct !== null &&
      sbin.metrics.rangePosPct >= 0 &&
      sbin.metrics.rangePosPct <= 100,
  );

  // Index with null volume never fabricates volume or volRatio
  const nifty = report.results.find((r) => r.instrumentId === "NSE:NIFTY");
  assert.ok(nifty && nifty.metrics);
  assert.equal(nifty.metrics.volume, null);
  assert.equal(nifty.metrics.volRatio, null);
  assert.ok(typeof nifty.metrics.rsi14 === "number");

  // Empty observations produce strictly null metrics without throwing
  const emptyMetrics = computeScanMetrics([]);
  assert.equal(emptyMetrics.close, null);
  assert.equal(emptyMetrics.barsEvaluated, 0);
});

test("Soul Scan UI exposes trading analysis metrics, breadth, sort, CSV export, evaluated snapshot, and 65s timeout cleanly", () => {
  const stratSrc = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  assert.match(stratSrc, /Universe Breadth/);
  assert.match(stratSrc, /Export CSV/);
  assert.match(stratSrc, /Evaluated Market Snapshot/);
  assert.match(stratSrc, /20-Bar S\/R Range/);
  assert.match(stratSrc, /timeoutMs:\s*65_000/);
  assert.doesNotMatch(stratSrc, /angel\s*one|smartapi/i);
  assert.doesNotMatch(stratSrc, /\boptional\b/i);

  const projSrc = readFileSync("backend/services/research/scan-projection.ts", "utf8");
  assert.match(projSrc, /raw && derived && row\.metrics/);
});
