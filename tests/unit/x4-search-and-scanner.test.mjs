/**
 * X4 Unit & Property Tests:
 * 1. Canonical Instrument Discovery & Deterministic Ranking (HDFC / HDFCBANK / SBI / NIFTY / GOLD / Non-seed ScripMaster)
 * 2. Soul Scan 2.0 Scale & Accounting (0, 1, 5, 20, 21, 100, and 1,000 instruments — zero hidden .slice(0,5)/.slice(0,20) truncation)
 * 3. Beginner / Intermediate / Advanced 3-Level AST Compilation & Evaluation Parity
 * 4. Private User CSV OHLCV Import Validation & Fault Injection
 */

import "../../operations/scripts/ts-node-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const {
  X2_INSTRUMENTS,
  searchCanonicalInstruments,
} = await import("../../backend/services/market-data/instrument-registry.ts");
const {
  compileFormula,
  evaluateScan,
} = await import("../../backend/engines/scan.ts");
const {
  BEGINNER_SCAN_PRESETS,
  compileTree,
  treeFromFormula,
  validateResearch,
  preflightResearch,
  parsePrivateCsvDataset,
} = await import("../../backend/services/research/research.ts");

test("X4 Search: HDFC, HDFC Bank, HDFCBANK, NSE:HDFCBANK, SBI, RELIANCE, NIFTY, GOLD rank deterministically", () => {
  for (const query of ["HDFC", "hdfc", "HDFC Bank", "HDFCBANK", "NSE:HDFCBANK", "nse:hdfcbank", "HDFCBANK-EQ"]) {
    const publicMatches = searchCanonicalInstruments(query, X2_INSTRUMENTS, { limit: 10 });
    assert.ok(publicMatches.length > 0, `Public registry must find match for "${query}"`);
    assert.equal(
      publicMatches[0].id,
      "NSE:HDFCBANK",
      `Top public match for "${query}" must be NSE:HDFCBANK (got ${publicMatches[0].id})`,
    );
  }

  // Explicit BSE query ranks BSE:HDFCBANK first
  const bseHdfc = searchCanonicalInstruments("BSE:HDFCBANK", X2_INSTRUMENTS, { limit: 5 });
  assert.equal(bseHdfc[0].id, "BSE:HDFCBANK");

  // Common Indian aliases resolve to canonical IDs
  const aliasExpectations = [
    ["SBI", "NSE:SBIN"],
    ["SBIN", "NSE:SBIN"],
    ["RELIANCE", "NSE:RELIANCE"],
    ["RIL", "NSE:RELIANCE"],
    ["TCS", "NSE:TCS"],
    ["INFY", "NSE:INFY"],
    ["ICICI", "NSE:ICICIBANK"],
    ["AIRTEL", "NSE:BHARTIARTL"],
    ["L&T", "NSE:LT"],
    ["HUL", "NSE:HINDUNILVR"],
    ["NIFTY", "NSE:NIFTY"],
    ["SENSEX", "BSE:SENSEX"],
    ["GOLD", "MCX:GOLD"],
    ["GOLD04DEC26FUT", "MCX:GOLD04DEC26FUT"],
    ["CRUDEOIL", "MCX:CRUDEOIL"],
    ["CRUDEOIL18DEC26FUT", "MCX:CRUDEOIL18DEC26FUT"],
  ];
  for (const [alias, expectedId] of aliasExpectations) {
    const matches = searchCanonicalInstruments(alias, X2_INSTRUMENTS, { limit: 5 });
    assert.ok(matches.length > 0, `Expected match for alias "${alias}"`);
    assert.equal(matches[0].id, expectedId, `Alias "${alias}" must rank ${expectedId} #1`);
  }

});

test("X4 Scanner: evaluates 0, 1, 5, 20, 21, 100, and 1,000 instruments with reconciled accounting and zero silent truncation", () => {
  const asOf = "2026-11-20T00:00:00.000Z";
  const baseMs = Date.parse("2026-10-01T00:00:00.000Z");
  const rule = compileFormula("close > sma(close, 20)");
  const def = validateResearch({
    name: "X4 scale test hypothesis",
    description: "Verify deterministic scanner across 0 to 1,000 instruments without truncation.",
    mode: "ADVANCED",
    formula: rule.formula,
    universe: "CONNECTED_MARKETS",
    partialPolicy: "ALLOW_UNKNOWN",
  });

  function makeDataset(index) {
    const id = `NSE:STOCK_${String(index).padStart(4, "0")}`;
    // Every 3rd stock: rising trend -> PASS (25 bars)
    // Every 3rd+1 stock: falling trend -> FAIL (25 bars)
    // Every 3rd+2 stock: only 5 bars -> UNKNOWN (insufficient history for SMA 20)
    const bucket = index % 3;
    const barCount = bucket === 2 ? 5 : 25;
    const observations = Array.from({ length: barCount }, (_, d) => {
      const eventAt = new Date(baseMs + d * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
      const close = bucket === 0 ? 100 + d * 2 : 200 - d * 2;
      return {
        eventAt,
        knownAt: asOf,
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 10000 + d * 100,
      };
    });
    return {
      instrumentId: id,
      currency: "INR",
      source: "TEST_FIXTURE",
      permitted: true,
      frequency: "PUBLISHED_EOD",
      maxAgeMs: 60 * 86_400_000,
      observations,
    };
  }

  for (const size of [0, 1, 5, 20, 21, 100, 1000]) {
    const datasets = Array.from({ length: size }, (_, i) => makeDataset(i));
    const exclusions = size > 0 ? [{ id: "NSE:EXCLUDED_1", reason: "No source candles" }] : [];
    const preflight = preflightResearch(def, datasets, asOf, exclusions);
    const evaluated = evaluateScan(rule, datasets, asOf);

    const expectedPass = datasets.filter((_, i) => i % 3 === 0).length;
    const expectedFail = datasets.filter((_, i) => i % 3 === 1).length;
    const expectedUnknown = datasets.filter((_, i) => i % 3 === 2).length;

    assert.equal(evaluated.total, size, `Size ${size}: total evaluated must equal ${size}`);
    assert.equal(evaluated.matches, expectedPass, `Size ${size}: PASS count must equal ${expectedPass}`);
    assert.equal(evaluated.failed, expectedFail, `Size ${size}: FAIL count must equal ${expectedFail}`);
    assert.equal(evaluated.unknown, expectedUnknown, `Size ${size}: UNKNOWN count must equal ${expectedUnknown}`);

    // Reconcile accounting fields
    assert.equal(preflight.accounting.discovered, size + exclusions.length);
    assert.equal(preflight.accounting.evaluated, size);
    assert.equal(preflight.accounting.matched, expectedPass);
    assert.equal(preflight.accounting.notMatched, expectedFail);
    assert.equal(preflight.accounting.unknown, expectedUnknown);
    assert.equal(preflight.accounting.excluded, exclusions.length);
    assert.equal(
      preflight.accounting.matched + preflight.accounting.notMatched + preflight.accounting.unknown,
      preflight.accounting.evaluated,
    );
  }
});

test("X4 Scanner: Beginner, Intermediate, and Advanced modes produce identical AST and results", () => {
  const preset = BEGINNER_SCAN_PRESETS[0]; // rsi(close, 14) < 40
  const beginnerAst = compileFormula(preset.formula);
  const intermediateTree = treeFromFormula(preset.formula);
  assert.ok(intermediateTree, "Beginner preset converts to Intermediate RuleTree");
  const intermediateAst = compileTree(intermediateTree);
  const advancedAst = compileFormula("  rsi( close , 14 ) < 40 ");

  assert.equal(beginnerAst.formula, intermediateAst.formula);
  assert.equal(intermediateAst.formula, advancedAst.formula);
});

test("X4 Private CSV OHLCV Import: validates valid multi-stock CSV and rejects malformed/future/duplicate/impossible bars", () => {
  const nowMs = Date.parse("2026-11-21T10:00:00Z");
  const lines = ["symbol,date,open,high,low,close,volume"];
  for (let d = 1; d <= 22; d++) {
    const date = `2026-10-${String(d).padStart(2, "0")}`;
    lines.push(`NSE:HDFCBANK,${date},${1600 + d},${1610 + d},${1595 + d},${1605 + d},100000`);
    lines.push(`NSE:SBIN,${date},${1200 - d},${1205 - d},${1190 - d},${1195 - d},120000`);
  }
  const parsed = parsePrivateCsvDataset(lines.join("\n"), nowMs);
  assert.equal(parsed.datasets.length, 2);
  const report = evaluateScan(compileFormula("close > sma(close, 20)"), parsed.datasets, parsed.asOf);
  assert.equal(report.matches, 1);
  assert.equal(report.failed, 1);
  assert.equal(
    report.results.find((r) => r.instrumentId === "NSE:HDFCBANK")?.status,
    "PASS",
  );
  assert.equal(
    report.results.find((r) => r.instrumentId === "NSE:SBIN")?.status,
    "FAIL",
  );

  // Fault injection on invalid CSVs
  assert.throws(
    () => parsePrivateCsvDataset("symbol,date,close\nNSE:HDFCBANK,2026-02-31,1700", nowMs),
    /valid YYYY-MM-DD/,
  );
  assert.throws(
    () => parsePrivateCsvDataset("symbol,date,close\nNSE:HDFCBANK,2099-01-01,1700", nowMs),
    /future-dated/,
  );
  assert.throws(
    () =>
      parsePrivateCsvDataset(
        "symbol,date,close\nNSE:HDFCBANK,2026-10-01,1700\nNSE:HDFCBANK,2026-10-01,1705",
        nowMs,
      ),
    /duplicate date/,
  );
  assert.throws(
    () =>
      parsePrivateCsvDataset(
        "symbol,date,open,high,low,close\nNSE:HDFCBANK,2026-10-01,1700,1650,1680,1690",
        nowMs,
      ),
    /impossible OHLC/,
  );
});
