/**
 * Strategic Souls X5.5 — Phase 3 Market-Data-Ready Validation & Entitlement Contracts
 * Strictly synthetic fixtures only — ZERO external API calls or provider keys.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const context = vm.createContext({
  console,
  URL,
  URLSearchParams,
  Intl,
  Date,
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
  RegExp,
});

const cache = new Map();
function resolveFile(spec, from) {
  const base = resolve(dirname(from), spec);
  for (const cand of [base, base + ".ts", base + "/index.ts"]) {
    if (existsSync(cand)) return cand;
  }
  throw new Error("Cannot resolve " + spec + " from " + from);
}
async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const raw = readFileSync(path, "utf8");
  const js = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = new vm.SourceTextModule(js, { context, identifier: path });
  cache.set(path, mod);
  await mod.link((spec) => load(resolveFile(spec, path)));
  await mod.evaluate();
  return mod;
}

const providers = (
  await load(resolve("backend/services/market-data/providers.ts"))
).namespace;

const NOW = Date.parse("2026-11-22T12:00:00.000Z");

const baseEquityInstrument = {
  id: "NSE:HDFCBANK",
  name: "HDFC Bank Ltd",
  symbol: "HDFCBANK",
  providerSymbol: "HDFCBANK.NSE",
  market: "NSE",
  mic: "XNSE",
  type: "EQUITY",
  currency: "INR",
  unit: "INR/share",
  timezone: "Asia/Kolkata",
};

const baseRights = {
  display: true,
  derivedDisplay: true,
  analysis: true,
  storage: true,
  redistribution: false,
  cacheSeconds: 300,
  verified: true,
  contractReference: "SYNTHETIC-LICENSE-2026",
  expiresAt: "2027-11-22T00:00:00.000Z",
};

test("X5.5 P3.4: valid NSE equity & MCX futures batches pass contract validation with explicit entitlements", () => {
  const batch = {
    providerId: "TRUEDATA",
    sourceAttribution: "Licensed TrueData NSE EOD (Synthetic Fixture)",
    instrument: baseEquityInstrument,
    granularity: "1d",
    retrievedAt: "2026-11-22T11:55:00.000Z",
    maxStaleMs: 3600_000,
    rights: baseRights,
    quota: { maxConcurrency: 2, dailyCallLimit: 500, callsUsed: 12 },
    candles: [
      {
        date: "2026-11-20",
        open: 1710,
        high: 1732.5,
        low: 1705,
        close: 1728,
        adjustedClose: 1728,
        volume: 8_420_000,
        openInterest: null,
        knownAt: "2026-11-20T18:30:00.000Z",
        adjustment: "RAW_OHLC_ADJUSTED_CLOSE",
        provider: "TrueData",
      },
      {
        date: "2026-11-21",
        open: 1729,
        high: 1745,
        low: 1720,
        close: 1741.25,
        adjustedClose: 1741.25,
        volume: null, // missing volume stays null, never coerced to 0
        openInterest: null,
        knownAt: "2026-11-21T18:30:00.000Z",
        adjustment: "RAW_OHLC_ADJUSTED_CLOSE",
        provider: "TrueData",
      },
    ],
  };

  const res = providers.validateFeedBatchContract(batch, NOW);
  assert.equal(res.valid, true, res.errors.join("; "));
  assert.equal(res.stale, false);
  assert.equal(res.normalizedCount, 2);
  assert.equal(res.entitlements.display.allowed, true);
  assert.equal(res.entitlements.derivedDisplay.allowed, true);
  assert.equal(res.entitlements.analysis.allowed, true);
  assert.equal(res.entitlements.storage.allowed, true);
  assert.equal(res.entitlements.publicRedistribution.allowed, false);
  assert.equal(res.entitlements.display.cacheSeconds, 300);

  // MCX Future with valid expiry, lotSize, tickSize, and openInterest
  const futureBatch = {
    ...batch,
    instrument: {
      id: "MCX:GOLDM",
      name: "MCX Gold Mini Futures",
      symbol: "GOLDM",
      providerSymbol: "GOLDM26DEC",
      market: "MCX",
      mic: "XMCX",
      type: "FUTURE",
      currency: "INR",
      unit: "INR/10g",
      timezone: "Asia/Kolkata",
      expiry: "2026-12-05",
      lotSize: 100,
      tickSize: 1,
    },
    candles: [
      {
        ...batch.candles[0],
        open: 76200,
        high: 76850,
        low: 76010,
        close: 76600,
        adjustedClose: null,
        openInterest: 14_250,
        adjustment: "RAW",
      },
    ],
  };
  const futRes = providers.validateFeedBatchContract(futureBatch, NOW);
  assert.equal(futRes.valid, true, futRes.errors.join("; "));
});

test("X5.5 P3.4: rejects malformed OHLCV, duplicate bars, expired futures, bad timezone/MIC, and quota breach", () => {
  const badBatch = {
    providerId: "EODHD",
    sourceAttribution: "Synthetic Fixture",
    instrument: {
      ...baseEquityInstrument,
      id: "bad id",
      mic: "123",
      timezone: "Mars/Olympus_Mons",
      type: "FUTURE",
      expiry: "2026-10-01", // expired before NOW
      lotSize: 0,
      tickSize: -1,
    },
    granularity: "1d",
    retrievedAt: "2026-11-20T00:00:00.000Z",
    maxStaleMs: 60_000, // stale!
    rights: baseRights,
    quota: { maxConcurrency: 1, dailyCallLimit: 10, callsUsed: 11 },
    candles: [
      {
        date: "2026-11-20",
        open: 100,
        high: 95, // invalid: high < open!
        low: 90,
        close: 98,
        adjustedClose: -5,
        volume: -10,
        openInterest: -1,
        knownAt: "2026-11-25T00:00:00.000Z", // future knownAt!
        adjustment: "RAW",
        provider: "EODHD",
      },
      {
        date: "2026-11-20", // duplicate date!
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        adjustedClose: 102,
        volume: 1000,
        openInterest: null,
        knownAt: "2026-11-20T18:00:00.000Z",
        adjustment: "RAW",
        provider: "EODHD",
      },
    ],
  };

  const res = providers.validateFeedBatchContract(badBatch, NOW);
  assert.equal(res.valid, false);
  assert.equal(res.stale, true);
  assert.ok(res.errors.some((e) => /canonical instrument ID/i.test(e)));
  assert.ok(res.errors.some((e) => /MIC/i.test(e)));
  assert.ok(res.errors.some((e) => /IANA timezone/i.test(e)));
  assert.ok(res.errors.some((e) => /expired/i.test(e)));
  assert.ok(res.errors.some((e) => /lotSize/i.test(e)));
  assert.ok(res.errors.some((e) => /tickSize/i.test(e)));
  assert.ok(res.errors.some((e) => /callsUsed/i.test(e)));
  assert.ok(res.errors.some((e) => /OHLC high\/low envelope/i.test(e)));
  assert.ok(res.errors.some((e) => /Duplicate candle timestamp/i.test(e)));
  assert.ok(res.errors.some((e) => /invalid volume/i.test(e)));
  assert.ok(res.errors.some((e) => /future knownAt/i.test(e)));
});

test("X5.5 P3.4: license entitlements fail closed on unverified/expired rights and ALWAYS deny Angel One public redistribution", () => {
  // Unverified license -> fail closed across ALL 5 actions even if booleans are true
  const unverified = { ...baseRights, verified: false, redistribution: true };
  for (const action of [
    "display",
    "derivedDisplay",
    "analysis",
    "storage",
    "publicRedistribution",
  ]) {
    const d = providers.evaluateFeedEntitlement("EODHD", unverified, action, NOW);
    assert.equal(d.allowed, false, `${action} must fail closed when unverified`);
    assert.equal(d.cacheSeconds, 0);
  }

  // Expired license -> fail closed
  const expired = { ...baseRights, expiresAt: "2026-11-21T00:00:00.000Z" };
  assert.equal(
    providers.evaluateFeedEntitlement("TRUEDATA", expired, "display", NOW).allowed,
    false,
  );

  // Angel One retail broker -> ALWAYS blocked from publicRedistribution even if redistribution=true!
  const retail = { ...baseRights, redistribution: true };
  const d = providers.evaluateFeedEntitlement(
    "ANGELONE_SMARTAPI",
    retail,
    "publicRedistribution",
    NOW,
  );
  assert.equal(d.allowed, false);
  assert.match(d.reason, /Angel One SmartAPI/i);
});
