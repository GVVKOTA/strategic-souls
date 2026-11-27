import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFormulaParameters,
  formatScanPrice,
  formatSignedPct,
  replaceFormulaToken,
  rsiZoneBadge,
  safeCsvCell,
  sortScanRows,
  sourceBadgeLabel,
} from "../../frontend/features/strategy/scan-helpers.ts";

test("safeCsvCell keeps negative numbers numeric, neutralizes formula injection, and quotes delimiters", () => {
  assert.equal(safeCsvCell(null), "");
  assert.equal(safeCsvCell(-2.5), "-2.5");
  assert.equal(safeCsvCell("-2.5"), "-2.5");
  assert.equal(safeCsvCell("-10"), "-10");
  assert.equal(safeCsvCell("=CMD()"), "'=CMD()");
  assert.equal(safeCsvCell("+1+2"), "'+1+2");
  assert.equal(safeCsvCell("-1+2"), "'-1+2");
  assert.equal(safeCsvCell("-CMD()"), "'-CMD()");
  assert.equal(safeCsvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(safeCsvCell('hello, "world"'), '"hello, ""world"""');
});

test("formatScanPrice, formatSignedPct, rsiZoneBadge, and sourceBadgeLabel format predictably", () => {
  assert.equal(formatScanPrice("NSE:RELIANCE", null), "—");
  assert.equal(formatScanPrice("ECB:USDINR", 84.12345), "84.1235");
  assert.equal(formatScanPrice("NSE:NIFTY", 24500.5), "24,500.50");
  assert.equal(formatScanPrice("NSE:TCS", 3900.25), "₹3,900.25");

  assert.equal(formatSignedPct(null), "—");
  assert.equal(formatSignedPct(1.234), "+1.23%");
  assert.equal(formatSignedPct(-0.5), "-0.50%");

  assert.equal(rsiZoneBadge(null), null);
  assert.deepEqual(rsiZoneBadge(25), { label: "Oversold", tone: "pos" });
  assert.deepEqual(rsiZoneBadge(55), { label: "Balanced", tone: "teal" });
  assert.deepEqual(rsiZoneBadge(82), { label: "Stretched", tone: "neg" });

  assert.equal(sourceBadgeLabel("MY_WATCHLIST"), "Watchlist");
  assert.equal(sourceBadgeLabel("MARKET"), "Market");
});

test("sortScanRows orders rows across move, rsi, and symbol keys", () => {
  const rows = [
    { instrumentId: "NSE:TCS", status: "MATCH", metrics: { changePct: 1.2, rsi14: 62 } },
    { instrumentId: "NSE:INFY", status: "MATCH", metrics: { changePct: 3.4, rsi14: 28 } },
    { instrumentId: "NSE:AXISBANK", status: "MATCH", metrics: { changePct: -1.1, rsi14: 78 } },
  ];
  assert.deepEqual(
    sortScanRows(rows, "move_desc").map((r) => r.instrumentId),
    ["NSE:INFY", "NSE:TCS", "NSE:AXISBANK"],
  );
  assert.deepEqual(
    sortScanRows(rows, "rsi_asc").map((r) => r.instrumentId),
    ["NSE:INFY", "NSE:TCS", "NSE:AXISBANK"],
  );
  assert.deepEqual(
    sortScanRows(rows, "symbol_asc").map((r) => r.instrumentId),
    ["NSE:AXISBANK", "NSE:INFY", "NSE:TCS"],
  );
});

test("extractFormulaParameters skips embedded identifier digits and replaces tokens cleanly", () => {
  const formula = "close > ema(close, 20) and rsi14 < 65";
  const tokens = extractFormulaParameters(formula);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].label, "EMA period");
  assert.equal(tokens[0].value, "20");
  assert.equal(tokens[1].label, "Threshold");
  assert.equal(tokens[1].value, "65");

  const updated = replaceFormulaToken(formula, tokens[0], "50");
  assert.equal(updated, "close > ema(close, 50) and rsi14 < 65");
  assert.equal(replaceFormulaToken(formula, tokens[0], "abc"), formula);
});
