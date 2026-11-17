/** Known synthetic arithmetic fixtures; never surfaced as market observations. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const scanURL = pathToFileURL(resolve("lib/x1/scan.ts")).href;
const transpile = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
const dataURL = (code) =>
  "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const researchURL = dataURL(
  transpile("lib/x2/research.ts").replace(
    '"../x1/scan"',
    JSON.stringify(scanURL),
  ),
);
const { validateResearch, labelOutcome, compileTree, treeFromFormula } =
  await import(researchURL);
const { backtestResearch } = await import(
  dataURL(
    transpile("lib/x2/backtest.ts")
      .replace('"../x1/scan"', JSON.stringify(scanURL))
      .replace('"./research"', JSON.stringify(researchURL)),
  )
);
const at = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
const outcome = {
  family: "POSITIVE_RETURN",
  horizon: 1,
  threshold: 0,
  target: 5,
  stop: 3,
  costBps: 0,
};
const definition = () =>
  validateResearch({
    name: "TEST research",
    description: "Explicit synthetic fixture hypothesis.",
    formula: "close > 0",
    mode: "ADVANCED",
    outcome,
  });
const options = { pointInTime: true, adjusted: true, storagePermitted: true };
const fixture = () => ({
  instrumentId: "TEST:X",
  source: "Explicit TEST DATA",
  currency: "INR",
  permitted: true,
  observations: [
    {
      eventAt: at(0),
      knownAt: at(0),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
    },
    {
      eventAt: at(1),
      knownAt: at(1),
      open: 100,
      high: 111,
      low: 99,
      close: 110,
    },
  ],
});
test("research simulation uses next open, no overlap and independently computed return/cost arithmetic", () => {
  const result = backtestResearch(definition(), fixture(), at(3), options);
  assert.equal(result.status, "RESEARCH BACKTEST");
  assert.equal(result.trades.length, 1);
  assert.ok(Math.abs(result.summary.totalReturnPct - 10) < 1e-10);
  assert.equal(result.trades[0].entryAt, at(1));
  assert.equal(result.trades[0].signalAt, at(0));
  const charged = backtestResearch(
    { ...definition(), outcome: { ...outcome, costBps: 100 } },
    fixture(),
    at(3),
    { ...options, slippageBps: 100 },
  );
  assert.ok(Math.abs(charged.summary.totalReturnPct - 8) < 1e-10);
  assert.equal(charged.summary.turnover, 2);
});
test("simulation fails closed on absent PIT/adjustments/retention and missing OHLC", () => {
  for (const config of [
    { ...options, pointInTime: false },
    { ...options, adjusted: false },
    { ...options, storagePermitted: false },
  ]) {
    const result = backtestResearch(definition(), fixture(), at(3), config);
    assert.equal(result.status, "DATA UNAVAILABLE");
    assert.equal(result.summary, null);
    assert.equal(result.curve.length, 0);
  }
  const broken = fixture();
  delete broken.observations[0].high;
  assert.equal(
    backtestResearch(definition(), broken, at(3), options).status,
    "DATA UNAVAILABLE",
  );
});
test("ambiguous barrier curve is labelled stop-first scenario; unmatured signals remain censored", () => {
  const dataset = fixture();
  dataset.observations[1] = {
    eventAt: at(1),
    knownAt: at(1),
    open: 100,
    high: 106,
    low: 96,
    close: 100,
  };
  const result = backtestResearch(
    { ...definition(), outcome: { ...outcome, family: "FIRST_BARRIER" } },
    dataset,
    at(3),
    options,
  );
  assert.equal(result.summary.ambiguous, 1);
  assert.ok(Math.abs(result.summary.totalReturnPct + 3) < 1e-10);
  assert.equal(result.trades[0].label, "AMBIGUOUS");
  const unresolved = backtestResearch(
    { ...definition(), outcome: { ...outcome, horizon: 5 } },
    dataset,
    at(3),
    options,
  );
  assert.equal(unresolved.trades.length, 0);
  assert.equal(unresolved.summary.unresolved, 1);
});
test("opening gaps establish first barrier order before unknown intrabar paths", () => {
  const barrier = { ...outcome, family: "FIRST_BARRIER" };
  const stop = labelOutcome(
    100,
    [{ at: at(1), knownAt: at(1), open: 90, high: 106, low: 89, close: 100 }],
    barrier,
    at(3),
  );
  assert.equal(stop.label, "FAILURE");
  assert.ok(Math.abs(stop.returnPct + 10) < 1e-10);
  const target = labelOutcome(
    100,
    [{ at: at(1), knownAt: at(1), open: 110, high: 111, low: 96, close: 100 }],
    barrier,
    at(3),
  );
  assert.equal(target.label, "SUCCESS");
  assert.ok(Math.abs(target.returnPct - 10) < 1e-10);
});
test("nested visual-to-Advanced roundtrip preserves canonical method and does not accumulate wrappers", () => {
  const tree = {
    kind: "ALL",
    children: [
      { kind: "condition", rule: { field: "close", op: ">", value: 0 } },
      {
        kind: "NOT",
        child: {
          kind: "condition",
          rule: { field: "rsi14", op: ">", value: 70 },
        },
      },
    ],
  };
  const rule = compileTree(tree);
  assert.equal(
    compileTree(treeFromFormula(rule.formula)).formula,
    rule.formula,
  );
});
