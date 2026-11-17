/** Explicit synthetic mathematical/security fixtures, never market observations or UI results. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { compileFormula, evaluateScan } from "../../backend/engines/scan.ts";
const output = ts
  .transpileModule(readFileSync("backend/services/research/research.ts", "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    '"../../engines/scan"',
    JSON.stringify(pathToFileURL(resolve("backend/engines/scan.ts")).href),
  );
const {
  validateResearch,
  compileTree,
  preflightResearch,
  labelOutcome,
  wilson,
  calibration,
  assessEvidence,
  replayResearch,
  outcomeKey,
} = await import(
  "data:text/javascript;base64," + Buffer.from(output).toString("base64")
);
const at = (n) => new Date(Date.UTC(2010, 0, 1 + n)).toISOString();
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
    name: "TEST: named hypothesis",
    description: "Explicit synthetic test hypothesis only.",
    mode: "ADVANCED",
    formula: "close > 0",
    outcome,
  });
const bar = (n, high = 102, low = 99, close = 101) => ({
  at: at(n),
  knownAt: at(n),
  open: 100,
  high,
  low,
  close,
});
const fixture = (n = 400) =>
  Array.from({ length: n }, (_, i) => ({
    id: "TEST:case-" + i,
    subject: "owner",
    clusterId: "TEST:market-cluster",
    instrumentId: "TEST:issuer",
    formula: compileFormula("close > 0").formula,
    outcomeKey: outcomeKey(outcome),
    signalAt: at(i * 3),
    endAt: at(i * 3 + 1),
    knownAt: at(i * 3 + 1),
    label: i % 5 < 3 ? "SUCCESS" : "FAILURE",
    returnPct: i % 5 < 3 ? 1 : -1,
    source: "Explicit test source, not market data",
    sourceVerified: true,
    pointInTime: true,
    storagePermitted: true,
  }));
const query = () => ({
  subject: "owner",
  asOf: at(2000),
  formula: "close > 0",
  outcome,
  reusePersonal: true,
  baseline: {
    rate: 0.5,
    verified: true,
    knownAt: at(0),
    source: "TEST unconditional population",
  },
});

test("research definition requires meaningful Unicode-aware name/description and safe bounded settings", () => {
  assert.equal(definition().name, "TEST: named hypothesis");
  for (const patch of [
    { name: "  " },
    { name: "xx" },
    { name: "x".repeat(101) },
    { description: "short" },
    { description: "x".repeat(2001) },
    { formula: "eval(close)" },
    { outcome: { ...outcome, horizon: 1.5 } },
    { outcome: { ...outcome, stop: 100 } },
    { instrumentIds: ["<script>"] },
    { partialPolicy: "pretend" },
  ])
    assert.throws(() => validateResearch({ ...definition(), ...patch }));
  assert.equal(
    validateResearch({ ...definition(), name: "💡💡💡" }).name,
    "💡💡💡",
  );
});
test("nested ALL ANY NOT visual tree exactly matches Advanced canonical evaluation", () => {
  const tree = {
    kind: "ALL",
    children: [
      { kind: "condition", rule: { field: "close", op: ">", value: 2 } },
      {
        kind: "ANY",
        children: [
          {
            kind: "NOT",
            child: {
              kind: "condition",
              rule: { field: "close", op: ">", value: 10 },
            },
          },
          { kind: "condition", rule: { field: "close", op: "==", value: 15 } },
        ],
      },
    ],
  };
  const rule = compileTree(tree),
    advanced = compileFormula(
      "all(close > 2, any(not(close > 10), close == 15))",
    );
  for (const close of [1, 3, 8, 11, 15]) {
    const ds = {
      instrumentId: "TEST:X",
      source: "TEST",
      permitted: true,
      observations: [{ eventAt: at(1), knownAt: at(1), close }],
    };
    assert.equal(
      evaluateScan(rule, [ds], at(2)).results[0].status,
      evaluateScan(advanced, [ds], at(2)).results[0].status,
    );
  }
  assert.throws(() => compileTree({ kind: "ALL", children: [] }));
});
test("preflight blocks absent/all unknown and requires explicit partial-data acceptance", () => {
  const good = {
      instrumentId: "TEST:X",
      source: "TEST",
      permitted: true,
      observations: [{ eventAt: at(1), knownAt: at(1), close: 10 }],
    },
    bad = { ...good, instrumentId: "TEST:Y", permitted: false };
  assert.equal(preflightResearch(definition(), [], at(2)).blocked, true);
  assert.equal(
    preflightResearch(definition(), [good, bad], at(2)).blocked,
    true,
  );
  const p = preflightResearch(
    { ...definition(), partialPolicy: "ALLOW_UNKNOWN" },
    [good, bad],
    at(2),
  );
  assert.equal(p.blocked, false);
  assert.equal(p.unknown, 1);
});
test("positive return uses registered threshold and explicit cost assumptions", () => {
  assert.equal(labelOutcome(100, [bar(1)], outcome, at(2)).label, "SUCCESS");
  assert.equal(
    labelOutcome(100, [bar(1)], { ...outcome, costBps: 150 }, at(2)).label,
    "FAILURE",
  );
  assert.equal(
    labelOutcome(100, [bar(1)], { ...outcome, threshold: 2 }, at(2)).label,
    "FAILURE",
  );
  assert.throws(() => labelOutcome(0, [bar(1)], outcome, at(2)));
});
test("target-before-stop preserves ambiguous bars, stop order, neutral and right censoring", () => {
  const barrier = { ...outcome, family: "FIRST_BARRIER", horizon: 2 };
  assert.equal(
    labelOutcome(100, [bar(1, 106, 96)], barrier, at(4)).label,
    "AMBIGUOUS",
  );
  assert.equal(
    labelOutcome(100, [bar(1, 102, 96), bar(2, 106, 99)], barrier, at(4)).label,
    "FAILURE",
  );
  assert.equal(
    labelOutcome(100, [bar(1, 106, 99), bar(2, 102, 96)], barrier, at(4)).label,
    "SUCCESS",
  );
  assert.equal(
    labelOutcome(100, [bar(1), bar(2)], barrier, at(4)).label,
    "NEUTRAL",
  );
  assert.equal(labelOutcome(100, [bar(1)], barrier, at(4)).label, "UNRESOLVED");
});
test("future release of an earlier bar cannot be skipped to claim a later outcome", () => {
  const late = { ...bar(1), knownAt: at(10) };
  assert.equal(
    labelOutcome(100, [late, bar(2)], outcome, at(4)).label,
    "UNRESOLVED",
  );
  assert.throws(() => labelOutcome(100, [bar(2), bar(1)], outcome, at(4)));
  assert.throws(() =>
    labelOutcome(100, [{ ...bar(1), high: 99 }], outcome, at(4)),
  );
});
test("Wilson intervals agree with analytic boundary and independent 50-of-100 reference", () => {
  assert.equal(wilson(0, 0), null);
  const [lo, hi] = wilson(50, 100);
  assert.ok(Math.abs(lo - 0.4038315304) < 1e-8);
  assert.ok(Math.abs(hi - 0.5961684696) < 1e-8);
  assert.ok(wilson(0, 1)[0] < 1e-15);
  assert.ok(wilson(1, 1)[1] > 0.99999999);
  assert.equal(wilson(2, 1), null);
});
test("Brier, calibration-in-large, bins and ECE are actual arithmetic", () => {
  const d = calibration([
    { probability: 0.8, outcome: 1 },
    { probability: 0.2, outcome: 0 },
  ]);
  assert.ok(Math.abs(d.brier - 0.04) < 1e-12);
  assert.ok(Math.abs(d.calibrationInLarge) < 1e-12);
  assert.ok(Math.abs(d.ece - 0.2) < 1e-12);
  assert.equal(
    d.bins.reduce((s, x) => s + x.n, 0),
    2,
  );
});
test("0/1/50/100 samples suppress numerical forward probability despite descriptive counts", () => {
  for (const n of [0, 1, 50, 100]) {
    const result = assessEvidence(fixture(n), query());
    assert.equal(result.status, "INSUFFICIENT EVIDENCE");
    assert.equal(result.probability, null);
    assert.equal(result.interval, null);
    assert.equal(result.descriptive.n, n);
  }
});
test("chronological held-out estimator passes only with stable independent evidence and baseline", () => {
  const result = assessEvidence(fixture(), query());
  assert.equal(result.status, "VALIDATED", result.reasons.join(" "));
  assert.ok(Math.abs(result.probability - 0.6) < 0.01);
  assert.equal(result.split.training, 240);
  assert.equal(result.split.validation, 80);
  assert.equal(result.split.holdout, 80);
  assert.ok(
    result.calibration.holdout.brier <= result.calibration.baseline.brier,
  );
  assert.ok(result.interval[0] < 0.6 && result.interval[1] > 0.6);
});
test("all wins/losses, missing baseline and calibration drift fail the release gate", () => {
  for (const label of ["SUCCESS", "FAILURE"])
    assert.equal(
      assessEvidence(
        fixture().map((x) => ({ ...x, label })),
        query(),
      ).probability,
      null,
    );
  assert.equal(
    assessEvidence(fixture(), { ...query(), baseline: undefined }).probability,
    null,
  );
  assert.equal(
    assessEvidence(
      fixture().map((x, i) => ({
        ...x,
        label: i < 320 ? "SUCCESS" : "FAILURE",
      })),
      query(),
    ).probability,
    null,
  );
});
test("duplicates, overlapping horizons, future knowledge and revised/non-PIT sources are excluded", () => {
  const rows = fixture(80);
  const result = assessEvidence(
    [
      ...rows,
      ...rows.map((x) => ({ ...x, id: x.id + "copy" })),
      { ...rows[0], id: "TEST:future", knownAt: at(3000) },
      { ...rows[1], id: "TEST:revised", pointInTime: false },
    ],
    query(),
  );
  assert.equal(result.descriptive.n, 80);
  assert.equal(result.exclusions["Duplicate or overlapping event cluster"], 80);
  assert.equal(result.exclusions["Future, unmatured or non-causal case"], 1);
  assert.equal(
    result.exclusions[
      "Unverified source, point-in-time history or retention rights"
    ],
    1,
  );
});
test("privacy filters run before counts; opt-out, unconsented third parties and links do not leak", () => {
  const own = fixture(50),
    others = fixture(300).map((x, i) => ({
      ...x,
      id: "OTHER:" + i,
      subject: "outsider",
      signalAt: at(500 + i * 3),
      endAt: at(501 + i * 3),
      knownAt: at(501 + i * 3),
    }));
  const withOthers = assessEvidence([...own, ...others], query());
  assert.equal(withOthers.descriptive.n, 50);
  assert.equal(withOthers.personalCaseLinks.length, 50);
  assert.ok(!JSON.stringify(withOthers).includes("outsider"));
  const optedOut = assessEvidence(own, { ...query(), reusePersonal: false });
  assert.equal(optedOut.descriptive.n, 0);
  assert.equal(optedOut.personalCaseLinks.length, 0);
  const aggregate = assessEvidence(
    others.map((x) => ({
      ...x,
      consent: { aggregate: true, withdrawn: false },
    })),
    { ...query(), includeAggregate: true },
  );
  assert.equal(aggregate.descriptive.n, 300);
  assert.equal(aggregate.personalCaseLinks.length, 0);
  assert.equal(
    assessEvidence(
      others.map((x) => ({
        ...x,
        consent: { aggregate: true, withdrawn: true },
      })),
      { ...query(), includeAggregate: true },
    ).descriptive.n,
    0,
  );
});
test("negative-only Graveyard cannot manufacture success; all eligible history forms denominator", () => {
  const data = fixture(200).map((x) => ({
      ...x,
      retired: x.label === "FAILURE",
    })),
    score = assessEvidence(data, query());
  assert.equal(score.descriptive.n, 200);
  assert.equal(score.descriptive.successes, 120);
  assert.equal(score.personalCaseLinks.filter((x) => x.retired).length, 20);
});
test("replay refuses daily retrospective retrieval history and never generates demo outcomes", () => {
  const dataset = {
    instrumentId: "TEST:X",
    source: "TEST",
    permitted: true,
    observations: Array.from({ length: 5 }, (_, i) => ({
      eventAt: at(i),
      knownAt: at(10),
      open: 100,
      high: 102,
      low: 99,
      close: 101,
    })),
  };
  const unavailable = replayResearch(definition(), dataset, at(12), {
    subject: "owner",
    pointInTime: false,
    adjusted: false,
    storagePermitted: true,
  });
  assert.equal(unavailable.status, "DATA UNAVAILABLE");
  assert.deepEqual(unavailable.cases, []);
  const historical = replayResearch(definition(), dataset, at(12), {
    subject: "owner",
    pointInTime: true,
    adjusted: true,
    storagePermitted: true,
  });
  assert.equal(
    historical.cases.length,
    0,
    "features were unknown at every historical signal instant",
  );
});
test("licensed PIT replay evaluates at each original cutoff and yields anchored descriptive outcomes", () => {
  const dataset = {
    instrumentId: "TEST:X",
    source: "TEST PIT",
    permitted: true,
    observations: Array.from({ length: 8 }, (_, i) => ({
      eventAt: at(i),
      knownAt: at(i),
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
    })),
  };
  const replay = replayResearch(definition(), dataset, at(10), {
    subject: "owner",
    pointInTime: true,
    adjusted: true,
    storagePermitted: true,
  });
  assert.equal(replay.status, "RESEARCH REPLAY");
  assert.equal(replay.cases.length, 7);
  assert.equal(replay.summary.n, 7);
  assert.equal(replay.cases[0].signalAt, at(0));
  assert.equal(replay.cases[0].endAt, at(1));
  assert.ok(
    Math.abs(replay.cases[0].returnPct - (102 / 101 - 1) * 100) < 1e-12,
  );
});
