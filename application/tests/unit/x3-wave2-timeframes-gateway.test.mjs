import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const context = vm.createContext({
  console,
  URL,
  URLSearchParams,
  Date,
  Intl,
  Math,
  Number,
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
  crypto: globalThis.crypto,
  TextEncoder,
  TextDecoder,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch,
});
const cache = new Map();

function resolveFile(spec, from) {
  if (spec === "cloudflare:workers") return "virtual:cloudflare";
  const base = resolve(dirname(from), spec);
  for (const cand of [base, base + ".ts", base + ".tsx", base + ".js", base + "/index.ts"]) {
    if (existsSync(cand)) return cand;
  }
  throw new Error("Cannot resolve " + spec + " from " + from);
}

async function load(path) {
  if (cache.has(path)) return cache.get(path);
  let mod;
  if (path === "virtual:cloudflare") {
    mod = new vm.SyntheticModule(["env"], function () {
      this.setExport("env", {});
    }, { context });
  } else {
    const js = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    mod = new vm.SourceTextModule(js, { context, identifier: path });
  }
  cache.set(path, mod);
  await mod.link((spec) => load(resolveFile(spec, path)));
  await mod.evaluate();
  return mod;
}

const {
  ACTIVE_SCAN_INTERVALS,
  aggregateIntradayCandles,
  historyWindowForInterval,
  isIntradayInterval,
  normalizeIntervalInput,
  resolveNativeInterval,
  subtractCalendarMonthsClamped,
  validateWarmupCoverage,
} = (await load(resolve("backend/services/market-data/timeframes.ts"))).namespace;
const { secretFrom } = (await load(resolve("backend/services/market-data/providers.ts"))).namespace;

test("X3-131 Contract E: 5 scan timeframes, clamped calendar windows, and exhaustive nativeInterval", () => {
  assert.deepEqual([...ACTIVE_SCAN_INTERVALS], ["30m", "1h", "3h", "6h", "1d"]);
  assert.equal(normalizeIntervalInput("24H"), "1d");
  assert.equal(normalizeIntervalInput("3H"), "3h");
  assert.equal(normalizeIntervalInput("6H"), "6h");
  assert.equal(normalizeIntervalInput("invalid"), null);

  assert.equal(resolveNativeInterval("30m"), "30m");
  assert.equal(resolveNativeInterval("1h"), "1h");
  assert.equal(resolveNativeInterval("3h"), "1h");
  assert.equal(resolveNativeInterval("6h"), "1h");
  assert.equal(resolveNativeInterval("1d"), "1d");
  assert.equal(resolveNativeInterval("1wk"), "1d");
  assert.equal(resolveNativeInterval("1mo"), "1d");
  assert.throws(() => resolveNativeInterval("4h"));

  assert.equal(isIntradayInterval("30m"), true);
  assert.equal(isIntradayInterval("1h"), true);
  assert.equal(isIntradayInterval("3h"), true);
  assert.equal(isIntradayInterval("6h"), true);
  assert.equal(isIntradayInterval("1d"), false);

  // Month subtraction clamping: 2026-03-31 minus 1 month -> 2026-02-28; leap year 2024-03-31 -> 2024-02-29
  assert.equal(
    new Date(subtractCalendarMonthsClamped(Date.parse("2026-03-31T10:00:00Z"), 1)).toISOString(),
    "2026-02-28T10:00:00.000Z",
  );
  assert.equal(
    new Date(subtractCalendarMonthsClamped(Date.parse("2024-03-31T10:00:00Z"), 1)).toISOString(),
    "2024-02-29T10:00:00.000Z",
  );

  const cutoff = Date.parse("2026-11-28T10:00:00Z");
  assert.equal(historyWindowForInterval("30m", cutoff).calendarDaysApprox, 7);
  assert.equal(historyWindowForInterval("1h", cutoff).calendarDaysApprox, 14);
  assert.equal(historyWindowForInterval("3h", cutoff).startIso, "2026-10-28T10:00:00.000Z");
  assert.equal(historyWindowForInterval("6h", cutoff).startIso, "2026-09-28T10:00:00.000Z");
  assert.equal(historyWindowForInterval("1d", cutoff).startIso, "2025-11-28T10:00:00.000Z");
});

test("X3-131 Contract E: session-anchored 3H and 6H OHLCV aggregation drops stubs/gaps & preserves null volume", () => {
  // Full NSE cash trading day: Fri 2026-11-20 (09:15 IST = 03:45 UTC)
  // 6 full 1h bars: 03:45, 04:45, 05:45, 06:45, 07:45, 08:45 UTC + 15-min terminal stub 09:45 UTC
  const mk = (utcIso, o, h, l, c, v) => ({
    date: utcIso,
    open: o,
    high: h,
    low: l,
    close: c,
    adjustedClose: null,
    volume: v,
    openInterest: null,
    knownAt: "2026-11-20T11:00:00.000Z",
    adjustment: "RAW",
    provider: "TEST",
  });
  const dayBars = [
    mk("2026-11-20T03:45:00.000Z", 100, 105, 99, 104, 1000),
    mk("2026-11-20T04:45:00.000Z", 104, 108, 103, 107, 1200),
    mk("2026-11-20T05:45:00.000Z", 107, 110, 106, 109, 800),
    mk("2026-11-20T06:45:00.000Z", 109, 112, 105, 106, 500),
    mk("2026-11-20T07:45:00.000Z", 106, 107, 102, 103, null), // Missing volume in 2nd 3h bucket
    mk("2026-11-20T08:45:00.000Z", 103, 104, 101, 102, 400),
    mk("2026-11-20T09:45:00.000Z", 102, 103, 101, 102.5, 100), // 15m terminal stub excluded
  ];
  const afterCloseCutoff = Date.parse("2026-11-20T11:00:00.000Z");

  const agg3h = aggregateIntradayCandles(dayBars, "3h", "NSE", afterCloseCutoff);
  assert.equal(agg3h.bars.length, 2);
  assert.equal(agg3h.bars[0].open, 100);
  assert.equal(agg3h.bars[0].high, 110);
  assert.equal(agg3h.bars[0].low, 99);
  assert.equal(agg3h.bars[0].close, 109);
  assert.equal(agg3h.bars[0].volume, 3000);
  // Second bucket has one null volume -> aggregated volume MUST remain null (never 0 or partial sum)
  assert.equal(agg3h.bars[1].open, 109);
  assert.equal(agg3h.bars[1].close, 102);
  assert.equal(agg3h.bars[1].volume, null);

  const agg6h = aggregateIntradayCandles(dayBars, "6h", "NSE", afterCloseCutoff);
  assert.equal(agg6h.bars.length, 1);
  assert.equal(agg6h.bars[0].open, 100);
  assert.equal(agg6h.bars[0].high, 112);
  assert.equal(agg6h.bars[0].low, 99);
  assert.equal(agg6h.bars[0].close, 102);
  assert.equal(agg6h.bars[0].volume, null);

  // Mid-session cutoff at 12:00 IST (06:30 UTC): 05:45 bar closes at 06:45 > 06:30 -> unfinished 3h bucket dropped!
  const midCutoff = Date.parse("2026-11-20T06:30:00.000Z");
  const aggMid = aggregateIntradayCandles(dayBars, "3h", "NSE", midCutoff);
  assert.equal(aggMid.bars.length, 0);
  assert.equal(aggMid.excludedIncompleteBuckets, 1);

  // Gap inside bucket (remove middle 04:45 bar) -> incomplete bucket dropped
  const gapped = dayBars.filter((b) => b.date !== "2026-11-20T04:45:00.000Z");
  const aggGap = aggregateIntradayCandles(gapped, "3h", "NSE", afterCloseCutoff);
  assert.equal(aggGap.bars.length, 1);
  assert.equal(aggGap.excludedIncompleteBuckets, 1);

  // Warmup check
  const warmFail = validateWarmupCoverage(12, 20, "3h");
  assert.equal(warmFail.sufficient, false);
  assert.match(warmFail.reason ?? "", /requires 20 completed 3H bars/);
});

test("X3-129 Contract C: canonical MARKET_DATA_API_KEY activates targeted provider while preserving precedence", () => {
  // Provider-specific secret takes priority over canonical MARKET_DATA_API_KEY
  assert.equal(
    secretFrom("BHARATSTOCK", {
      BHARATSTOCK_API_KEY: "specific_key_1234",
      MARKET_DATA_API_KEY: "canonical_key_9999",
      MARKET_DATA_PROVIDER: "BHARATSTOCK",
    }),
    "specific_key_1234",
  );
  // Canonical MARKET_DATA_API_KEY works when MARKET_DATA_PROVIDER matches
  assert.equal(
    secretFrom("BHARATSTOCK", {
      MARKET_DATA_API_KEY: "canonical_key_9999",
      MARKET_DATA_PROVIDER: "BHARATSTOCK",
    }),
    "canonical_key_9999",
  );
  // Does NOT leak to a different provider
  assert.equal(
    secretFrom("EODHD", {
      MARKET_DATA_API_KEY: "canonical_key_9999",
      MARKET_DATA_PROVIDER: "BHARATSTOCK",
    }),
    null,
  );
  // Rejects demo/short placeholders
  assert.equal(
    secretFrom("BHARATSTOCK", {
      MARKET_DATA_API_KEY: "demo",
      MARKET_DATA_PROVIDER: "BHARATSTOCK",
    }),
    null,
  );
});
