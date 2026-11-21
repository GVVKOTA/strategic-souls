import "../../operations/scripts/ts-node-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { compileFormula, evaluateScan } = await import("../../backend/engines/scan.ts");
const {
  CLASSIC_50_PRESETS,
  CLASSIC_PRESET_CATEGORIES,
} = await import("../../backend/services/research/classic-presets.ts");
const {
  DISCOVER_EXAMPLES,
  parseDiscoverQuery,
} = await import("../../backend/services/research/discover-parser.ts");
const {
  PATTERN_TEMPLATES,
  matchDrawnPattern,
  resampleStroke,
  zNormalize,
} = await import("../../backend/engines/pattern-draw.ts");
const {
  MIN_GENOME_SAMPLE,
  runSoulGenomeEvidence,
} = await import("../../backend/engines/soul-genome.ts");
const { manualHistoricalInvestment } = await import("../../backend/engines/math.ts");
const {
  buildEventIcs,
  getEconomicCalendarEvents,
  wallClockToUtcIso,
} = await import("../../backend/services/market-data/economic-calendar.ts");
const { BANNER_PRESETS } = await import("../../backend/services/profile/banners.ts");

function buildSyntheticDataset(
  instrumentId,
  count = 260,
  generator = (i) => 100 + i * 0.4 + Math.sin(i * 0.25) * 4,
) {
  const baseMs = Date.UTC(2025, 0, 1);
  const observations = [];
  for (let i = 0; i < count; i++) {
    const close = Math.round(generator(i) * 1000) / 1000;
    const prev = i > 0 ? observations[i - 1].close : close;
    const open = Math.round(((prev + close) / 2) * 1000) / 1000;
    const high = Math.round((Math.max(open, close) + 1.8) * 1000) / 1000;
    const low = Math.round((Math.min(open, close) - 1.8) * 1000) / 1000;
    const volume = i === count - 1 ? 500_000 : 120_000 + (i % 7) * 5_000;
    const eventAt = new Date(baseMs + i * 86_400_000).toISOString();
    observations.push({
      eventAt,
      knownAt: eventAt,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return {
    instrumentId,
    currency: "INR",
    source: "TEST:SYNTHETIC",
    permitted: true,
    frequency: "DAILY",
    observations,
  };
}

test("Classic Soul Scan catalog has exactly 50 unique presets across 5 categories x 10 rules, all compiling and evaluating deterministically", () => {
  assert.equal(CLASSIC_50_PRESETS.length, 50);
  assert.equal(CLASSIC_PRESET_CATEGORIES.length, 5);

  const ids = new Set();
  const numbers = new Set();
  const byCat = new Map();
  const datasets = [
    buildSyntheticDataset("TEST:UPTREND", 260, (i) => 100 + i * 0.65 + Math.sin(i * 0.3) * 2),
    buildSyntheticDataset("TEST:DOWNTREND", 260, (i) => 300 - i * 0.5 + Math.cos(i * 0.25) * 2),
    buildSyntheticDataset("TEST:RANGE", 260, (i) => 150 + Math.sin(i * 0.35) * 6),
  ];
  const asOf = "2026-11-22T00:00:00.000Z";

  for (const preset of CLASSIC_50_PRESETS) {
    assert.ok(!ids.has(preset.id), `Duplicate preset id: ${preset.id}`);
    assert.ok(!numbers.has(preset.number), `Duplicate preset number: ${preset.number}`);
    ids.add(preset.id);
    numbers.add(preset.number);
    byCat.set(preset.category, (byCat.get(preset.category) ?? 0) + 1);

    const compiled = compileFormula(preset.formula);
    assert.ok(compiled.ast, `Preset ${preset.id} failed to produce AST`);
    const report = evaluateScan(compiled, datasets, asOf);
    assert.equal(report.total, 3);
    assert.equal(
      report.matches + report.failed + report.unknown,
      report.total,
      `Reconciliation mismatch on preset ${preset.id}`,
    );
  }

  for (const cat of CLASSIC_PRESET_CATEGORIES) {
    assert.equal(byCat.get(cat), 10, `Category ${cat} must contain exactly 10 rules`);
  }
  for (let n = 1; n <= 50; n++) {
    assert.ok(numbers.has(n), `Missing preset #${n}`);
  }
});

test("Zero-volume protection: volume ratio preset yields UNKNOWN (never division by zero or Infinity) when average volume is 0", () => {
  const zeroVol = buildSyntheticDataset("TEST:ZEROVOL", 40);
  for (const p of zeroVol.observations) p.volume = 0;
  const volPreset = CLASSIC_50_PRESETS.find((p) => p.id.includes("volume"));
  assert.ok(volPreset);
  const compiled = compileFormula(volPreset.formula);
  const report = evaluateScan(compiled, [zeroVol], "2026-11-22T00:00:00.000Z");
  assert.equal(report.matches, 0);
});

test("Advanced Discover deterministic parser compiles multi-clause English intent and rejects unsupported concepts honestly", () => {
  for (const ex of DISCOVER_EXAMPLES) {
    const bp = parseDiscoverQuery(ex.query);
    assert.equal(bp.supported, true, `Example failed to parse: ${ex.title}`);
    assert.ok(bp.formula && bp.canonicalRule, `Missing canonical AST for ${ex.title}`);
    assert.ok(bp.clauses.length >= 1);
  }

  const breakout = parseDiscoverQuery(
    "Find stocks trading sideways for 15 closed candles, breaking resistance on more than 1.5x volume while the daily trend is rising",
  );
  assert.equal(breakout.supported, true);
  assert.ok(breakout.clauses.length >= 3);
  assert.ok(breakout.formula.includes("volume"));
  assert.ok(breakout.assumptions.length >= 1);

  const rejected = parseDiscoverQuery(
    "Predict guaranteed tomorrow price using insider news and level 2 order book depth",
  );
  assert.equal(rejected.supported, false);
  assert.equal(rejected.formula, null);
  assert.ok(rejected.unsupportedPhrases.length >= 2);
});

test("Interactive Draw engine matches W-shape cleanly with Pattern Fit >= 90, penalizes inverted shape, and excludes short history", () => {
  assert.equal(PATTERN_TEMPLATES.length, 8);
  const doubleBottom = PATTERN_TEMPLATES.find((t) => t.id === "double_bottom");
  assert.ok(doubleBottom);

  const targetSeries = resampleStroke(doubleBottom.points, 20);
  const exactDs = buildSyntheticDataset("TEST:EXACT_W", 20, (i) => 100 + targetSeries[i] * 25);
  const invertedDs = buildSyntheticDataset("TEST:INVERTED_M", 20, (i) => 100 + (1 - targetSeries[i]) * 25);
  const shortDs = buildSyntheticDataset("TEST:TOO_SHORT", 8);

  const report = matchDrawnPattern(doubleBottom.points, [exactDs, invertedDs, shortDs], {
    windowBars: 20,
    minPatternFit: 65,
    asOf: "2026-11-22T00:00:00.000Z",
  });

  assert.equal(report.evaluated, 2);
  assert.equal(report.insufficientBarsCount, 1);
  assert.equal(report.excluded[0].instrumentId, "TEST:TOO_SHORT");
  assert.ok(report.matches.length >= 1);
  assert.equal(report.matches[0].instrumentId, "TEST:EXACT_W");
  assert.ok(
    report.matches[0].patternFit >= 90,
    `Expected exact W Pattern Fit >= 90, got ${report.matches[0].patternFit}`,
  );
  assert.ok(
    !report.matches.some((m) => m.instrumentId === "TEST:INVERTED_M"),
    "Inverted shape must not pass high Pattern Fit threshold",
  );
  assert.equal(zNormalize([5, 5, 5]).every((v) => v === 0), true);
});

test("Soul Genome Evidence enforces INSUFFICIENT EVIDENCE for n < 15 and computes calibrated quantiles + Anti-Scan checks when n >= 15", () => {
  const shortDs = buildSyntheticDataset("TEST:SMALL", 35);
  const smallReport = runSoulGenomeEvidence([shortDs], {
    windowBars: 12,
    horizonBars: 5,
    asOf: "2026-11-22T00:00:00.000Z",
  });
  assert.equal(smallReport.futurePaths.status, "INSUFFICIENT EVIDENCE");
  assert.equal(smallReport.futurePaths.positiveOutcomeRatePct, null);
  assert.equal(smallReport.futurePaths.quantilesPct, null);
  assert.ok(smallReport.gatedModules.length >= 2);
  assert.ok(smallReport.gatedModules.every((g) => g.status === "GATED"));

  // Build repeating periodic cycles across 3 datasets so >= 15 purged non-overlapping twins emerge
  const bigDatasets = [1, 2, 3].map((k) =>
    buildSyntheticDataset(`TEST:CYCLE_${k}`, 260, (i) => {
      const phase = i % 16;
      const base = 100 + Math.floor(i / 16) * 2.2;
      return base + Math.sin((phase / 16) * Math.PI * 2) * 8 + phase * 0.4;
    }),
  );
  const bigReport = runSoulGenomeEvidence(bigDatasets, {
    windowBars: 12,
    horizonBars: 4,
    minTwinFit: 65,
    asOf: "2026-11-22T00:00:00.000Z",
  });
  assert.ok(
    bigReport.historicalTwins.length >= MIN_GENOME_SAMPLE,
    `Expected >= ${MIN_GENOME_SAMPLE} purged twins, got ${bigReport.historicalTwins.length}`,
  );
  assert.equal(bigReport.futurePaths.status, "CALIBRATED_EMPIRICAL");
  assert.ok(bigReport.futurePaths.quantilesPct !== null);
  assert.ok(bigReport.futurePaths.wilson95IntervalPct !== null);
  assert.ok(bigReport.antiScan.some((a) => a.id === "cost-stress"));
});

test("Formula Lab manualHistoricalInvestment computes exact arithmetic and rejects invalid inputs", () => {
  const res = manualHistoricalInvestment({
    amount: 10000,
    buyPrice: 200,
    sellPrice: 300,
    buyDate: "2023-01-01",
    sellDate: "2025-01-01",
    fees: 100,
  });
  assert.equal(res.units, 50);
  assert.equal(res.grossValue, 15000);
  assert.equal(res.netValue, 14900);
  assert.equal(res.netProfit, 4900);
  assert.ok(Math.abs(res.netReturnPct - 49) < 1e-6);
  assert.ok(res.annualizedCagrPct !== null && res.annualizedCagrPct > 20 && res.annualizedCagrPct < 23);
  assert.ok(res.limitations.some((l) => /splits/i.test(l)));

  assert.throws(() =>
    manualHistoricalInvestment({
      amount: 1000,
      buyPrice: 100,
      sellPrice: 120,
      buyDate: "2026-01-02",
      sellDate: "2026-01-01",
    }),
  );
  assert.throws(() =>
    manualHistoricalInvestment({
      amount: -500,
      buyPrice: 100,
      sellPrice: 120,
      buyDate: "2025-01-01",
      sellDate: "2026-01-01",
    }),
  );
});

test("Economic Calendar handles IANA DST shifts accurately, never fabricates actuals/consensus, and emits valid .ics", () => {
  // US Eastern Standard Time (January: UTC-5 -> 08:30 ET = 13:30 UTC)
  assert.equal(
    wallClockToUtcIso("2026-01-14", "08:30", "America/New_York"),
    "2026-01-14T13:30:00.000Z",
  );
  // US Eastern Daylight Time (July: UTC-4 -> 08:30 EDT = 12:30 UTC)
  assert.equal(
    wallClockToUtcIso("2026-07-15", "08:30", "America/New_York"),
    "2026-07-15T12:30:00.000Z",
  );
  // India Standard Time (UTC+05:30 -> 10:00 IST = 04:30 UTC)
  assert.equal(
    wallClockToUtcIso("2026-12-04", "10:00", "Asia/Kolkata"),
    "2026-12-04T04:30:00.000Z",
  );

  const cal = getEconomicCalendarEvents({
    range: "all",
    nowMs: Date.parse("2026-11-21T12:00:00.000Z"),
  });
  assert.ok(cal.events.length >= 15);
  assert.equal(cal.defaultTimezone, "Asia/Kolkata");
  for (const ev of cal.events) {
    assert.equal(ev.actual, null, `Actual must never be fabricated (${ev.eventId})`);
    assert.equal(ev.consensus, null, `Consensus must never be fabricated (${ev.eventId})`);
    assert.ok(ev.primarySourceUrl.startsWith("https://"));
  }
  const dateOnly = cal.events.find((e) => e.announcedDateOnly);
  assert.ok(dateOnly, "Calendar should honestly cover a date-only TIME_NOT_ANNOUNCED release");
  assert.equal(dateOnly.scheduledAtUTC, null);

  const ics = buildEventIcs(cal.events[0]);
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("END:VCALENDAR"));
});

test("Obsidian Banner catalog provides 8 unique curated presets", () => {
  assert.equal(BANNER_PRESETS.length, 8);
  assert.equal(new Set(BANNER_PRESETS.map((b) => b.id)).size, 8);
});
