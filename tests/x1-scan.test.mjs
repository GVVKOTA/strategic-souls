import test from "node:test";
import assert from "node:assert/strict";
import {
  compileFormula,
  compileRules,
  renderFormula,
  toSimpleRules,
  evaluateScan,
  RULE_VERSION,
  FormulaError,
} from "../lib/x1/scan.ts";
const day = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
function data(values, extra = {}) {
  return {
    instrumentId: "TEST:EURUSD",
    source: "Explicit test fixture, not market data",
    currency: "USD",
    permitted: true,
    observations: values.map((close, i) => ({
      eventAt: day(i),
      knownAt: day(i),
      close,
      ...(typeof extra === "function" ? extra(i) : extra),
    })),
  };
}
const status = (rule, d, asOf = day(100)) =>
  evaluateScan(
    typeof rule === "string" ? compileFormula(rule) : rule,
    [d],
    asOf,
  ).results[0].status;

test("one canonical engine: 80 varied Simple rules compile to equivalent Advanced outcomes", () => {
  for (let i = 0; i < 80; i++) {
    const blocks = [
        { field: "close", op: ">", value: i * 0.75 },
        { field: "sma20", op: "<=", value: 70 - i * 0.2 },
      ],
      join = i % 2 ? "ALL" : "ANY";
    const simple = compileRules(blocks, join),
      advanced = compileFormula(
        `${join}(close > ${i * 0.75}, sma(close,20) <= ${70 - i * 0.2})`,
      );
    const d = data(Array.from({ length: 35 }, (_, j) => 20 + j + i * 0.1));
    assert.deepEqual(
      evaluateScan(simple, [d], day(40)).results,
      evaluateScan(advanced, [d], day(40)).results,
    );
    assert.deepEqual(toSimpleRules(simple), {
      blocks: [
        { field: "close", op: ">", value: i * 0.75 },
        { field: "sma20", op: "<=", value: 70 - i * 0.2 },
      ],
      join,
    });
  }
});
test("parser handles precedence, nested booleans, functions, NOT and safe immutable parameters", () => {
  const p = { threshold: 25 };
  const rule = compileFormula(
    "close > threshold AND NOT(close < 10 OR close == 20)",
    p,
  );
  p.threshold = 100;
  assert.equal(rule.version, RULE_VERSION);
  assert.equal(status(rule, data([30])), "PASS");
  assert.equal(
    status("ALL(close > 1, ANY(close < 5, close > 20))", data([30])),
    "PASS",
  );
  assert.equal(status("close + 2 * 3 == 16", data([10])), "PASS");
  assert.equal(status("range(close, 5, 20)", data([10])), "PASS");
  assert.equal(status("abs(-2) + 1 == 3", data([10])), "PASS");
});
test("rejects code, property access, unknown operations, bad argument counts and unsafe complexity", () => {
  for (const text of [
    "process.exit()",
    "close.constructor",
    "close;fetch(1)",
    "close[0] > 1",
    "close => 0",
    "eval(close)",
    "sma(close,0)>0",
    "sma(close,251)>0",
    "rsi(close,2.5)>0",
    "macd(close,26,12)>0",
    "atr()>0",
    "ALL()",
    "NOT(close)",
    "close > 1 > 0",
    "close + volume > 1",
    "close > rsi(close,14)",
    "sma(close,true)>0",
    "(".repeat(26) + "close>1" + ")".repeat(26),
    "1e999 > 0",
  ])
    assert.throws(() => compileFormula(text), Error, text);
  assert.throws(() => compileFormula("close > 0", { close: 20 }));
  assert.throws(() => compileFormula("close > 0", { constructor: 1 / 0 }));
  assert.throws(() => compileFormula("close > 0", { x: NaN }));
  assert.throws(() =>
    compileFormula("close > threshold", { threshold: 1, Threshold: 2 }),
  );
});
test("syntax errors expose exact line/column; canonical rendering is semantically round-trippable", () => {
  let error;
  try {
    compileFormula("close > 1\n AND @bad");
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof FormulaError);
  assert.equal(error.line, 2);
  assert.equal(error.column, 6);
  const rule = compileFormula(
    "any(rsi14 < 30, crossesabove(close, sma(close, 20)))",
  );
  assert.equal(
    renderFormula(compileFormula(renderFormula(rule))),
    renderFormula(rule),
  );
  assert.equal(toSimpleRules(rule), null);
});
test("point-in-time filter excludes future values and data released after the as-of time", () => {
  const d = data([10, 12, 999]);
  d.observations[1].knownAt = day(4);
  assert.equal(status("close == 10", d, day(1)), "PASS");
  assert.equal(status("close == 999", d, day(1)), "FAIL");
  assert.equal(status("close == 999", d, day(3)), "PASS");
  const allFuture = data([10]);
  allFuture.observations[0].knownAt = day(4);
  assert.equal(status("close > 0", allFuture, day(1)), "UNKNOWN");
});
test("UNKNOWN is distinct from FAIL and follows three-valued ALL/ANY/NOT semantics", () => {
  const d = data([10]);
  assert.equal(status("volume > 0", d), "UNKNOWN");
  assert.equal(status("ALL(close < 0, volume > 0)", d), "FAIL");
  assert.equal(status("ALL(volume > 0, close < 0)", d), "FAIL");
  assert.equal(status("ANY(close > 0, volume > 0)", d), "PASS");
  assert.equal(status("ANY(volume > 0, close > 0)", d), "PASS");
  assert.equal(status("NOT(volume > 0)", d), "UNKNOWN");
  assert.equal(status("ANY(close < 0, volume > 0)", d), "UNKNOWN");
});
test("missing lookbacks, zero division, source rights, stale values and units fail honestly", () => {
  assert.equal(status("sma(close,20)>0", data([1, 2])), "UNKNOWN");
  assert.equal(status("close / 0 > 1", data([1])), "UNKNOWN");
  assert.equal(status("sma(volume,2)>0", data([1, 2])), "UNKNOWN");
  assert.equal(
    status("close > 1", { ...data([2]), permitted: false }),
    "UNKNOWN",
  );
  assert.equal(
    status("close > 1", { ...data([2]), maxAgeMs: 1000 }, day(1)),
    "UNKNOWN",
  );
  assert.equal(status("close > 1", data([-1])), "UNKNOWN");
  assert.equal(status("volume > 0", data([1], { volume: -1 })), "UNKNOWN");
  assert.throws(() => compileFormula("sma(close,20) > volume"));
});
test("seven category architecture never fills unconnected fields with zeros", () => {
  const fields = ["close", "pe", "iv", "cpi", "earningsindays", "sentiment"];
  for (const f of fields) {
    const rule = compileFormula(`${f} > 0`);
    assert.equal(rule.categories.length, 1);
    assert.equal(status(rule, data([2])), f === "close" ? "PASS" : "UNKNOWN");
  }
  const custom = compileFormula("close/sma(close,2)>1");
  assert.ok(custom.categories.includes("Custom"));
  assert.equal(status("pe > 10", data([1], { fields: { pe: 12 } })), "PASS");
});
test("SMA, seeded EMA, Wilder RSI, MACD, ATR, percent changes and crosses match known calculations", () => {
  const d = data([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (i) => ({
    high: i + 2,
    low: i + 0.5,
    volume: 100,
  }));
  for (const rule of [
    "sma(close,3)==9",
    "ema(close,3)==9",
    "rsi(close,3)==100",
    "macd(close,2,4)>0",
    "atr(3)>1",
    "change(close,1)>11",
    "lag(close,2)==8",
    "within(close==8,3)",
    "crossesabove(close,9.5)",
    "crossesbelow(-close,-9.5)",
  ])
    assert.equal(status(rule, d), "PASS", rule);
  assert.equal(status("rsi(close,3)==0", data([10, 9, 8, 7, 6])), "PASS");
  assert.equal(status("rsi(close,3)==50", data([10, 10, 10, 10, 10])), "PASS");
  assert.equal(status("within(close>0,20)", d), "UNKNOWN");
  assert.equal(status("crossesabove(close,0)", data([1])), "UNKNOWN");
});
test("invalid order, duplicate dates, impossible availability and malformed dates are UNKNOWN", () => {
  const bads = [
    { eventAt: day(0), knownAt: "bad", close: 1 },
    { eventAt: day(1), knownAt: day(0), close: 1 },
    { eventAt: "2026-01-01", knownAt: day(0), close: 1 },
    {
      eventAt: "2026-02-30T00:00:00Z",
      knownAt: "2026-03-03T00:00:00Z",
      close: 1,
    },
  ];
  for (const o of bads)
    assert.equal(
      status("close>0", { ...data([]), observations: [o] }),
      "UNKNOWN",
    );
  const duplicate = data([1, 2]);
  duplicate.observations[1].eventAt = day(0);
  assert.equal(status("close>0", duplicate), "UNKNOWN");
  const descending = data([1, 2]);
  descending.observations.reverse();
  assert.equal(status("close>0", descending), "UNKNOWN");
});
test("report counts and immutable rule/source snapshots distinguish eligible from unavailable", () => {
  const report = evaluateScan(
    compileFormula("close>2"),
    [
      data([3]),
      { ...data([1]), instrumentId: "SECOND" },
      { ...data([]), instrumentId: "THIRD" },
    ],
    day(2),
  );
  assert.deepEqual(
    [
      report.total,
      report.eligible,
      report.matches,
      report.failed,
      report.unknown,
    ],
    [3, 2, 1, 1, 1],
  );
  assert.ok(report.results[0].reasons[0].includes("Matched"));
  assert.equal(report.results[2].latestEventAt, null);
  assert.equal(
    report.results[0].source,
    "Explicit test fixture, not market data",
  );
});
test("untrusted canonical ASTs and duplicate instruments cannot bypass compilation/resource limits", () => {
  const rule = compileFormula("close>0");
  assert.throws(() => evaluateScan({ ...rule, version: "evil" }, [], day(0)));
  assert.throws(() =>
    evaluateScan(
      { ...rule, ast: { kind: "call", name: "eval", args: [] } },
      [],
      day(0),
    ),
  );
  assert.throws(() => evaluateScan(rule, [data([1]), data([2])], day(1)));
  assert.throws(() => evaluateScan(rule, [], "2026-01-01"));
  const cyclic = { kind: "unary", op: "NOT" };
  cyclic.arg = cyclic;
  assert.throws(() => evaluateScan({ ...rule, ast: cyclic }, [], day(0)));
});
