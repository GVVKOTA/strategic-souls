import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import {
  computePortfolioAllocation,
  computeAssetComparison,
  computeCorrelationLab,
  computeEventWindowReturn,
  pearsonTwoPass,
} from "../../backend/engines/analytics.ts";
import {
  NSE_SECTOR_INDICES,
  buildSectorHeatmaps,
  getCompanyEcosystem,
  GEOPOLITICS_MARKET_PATHWAYS,
} from "../../backend/services/market-data/sectors-and-ecosystem.ts";
import { generateQrMatrix, buildQrSvgString } from "../../frontend/lib/qr-svg.ts";

// Load TypeScript module with extensionless relative imports cleanly under Node VM
const vmCtx = vm.createContext({ console, Date, Intl, Math, URL, AbortController, setTimeout, clearTimeout, crypto });
const vmCache = new Map();
async function loadTs(filePath) {
  const abs = resolve(filePath);
  if (vmCache.has(abs)) return vmCache.get(abs);
  const code = ts.transpileModule(readFileSync(abs, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const mod = new vm.SourceTextModule(code, { context: vmCtx, identifier: abs });
  vmCache.set(abs, mod);
  await mod.link(async (spec) => {
    const base = resolve(dirname(abs), spec);
    const target = [base, base + ".ts", base + ".tsx"].find((c) => existsSync(c));
    if (!target) throw new Error(`Cannot resolve ${spec} from ${abs}`);
    return loadTs(target);
  });
  await mod.evaluate();
  return mod;
}
const {
  parseUsgsGeoJson,
  parseEonetEvents,
  buildDailyWorldBriefing,
} = (await loadTs("backend/services/intelligence/news-and-disasters.ts")).namespace;

function makeSeries(closes) {
  const start = Date.UTC(2026, 6, 1);
  return closes.map((close, idx) => ({
    date: new Date(start + idx * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

// ── [27] Correlation Lab Exact Quantitative Tests ─────────────────────────────
test("[27] Correlation Lab: identical series => +1.0, opposite returns => -1.0, rolling windows work", () => {
  const baseReturns = Array.from({ length: 65 }, (_, i) =>
    ((i % 7) - 3) * 0.008 + Math.sin(i * 0.6) * 0.004,
  );
  const closesA = [100];
  const closesOpp = [100];
  for (const r of baseReturns) {
    closesA.push(closesA.at(-1) * (1 + r));
    closesOpp.push(closesOpp.at(-1) * (1 - r));
  }
  const sA = makeSeries(closesA);
  const sSame = makeSeries(closesA.map((c) => c * 2.5));
  const sOpp = makeSeries(closesOpp);

  const resPos = computeCorrelationLab({
    assetA: { id: "A", label: "Asset A", source: "Fixture", series: sA },
    assetB: { id: "B", label: "Asset B", source: "Fixture", series: sSame },
    returnMethod: "simple",
    rollingWindow: 20,
    minPairs: 30,
  });
  assert.equal(resPos.status, "OK");
  assert.equal(resPos.value.pearsonRho, 1);
  assert.equal(resPos.value.rSquared, 1);
  assert.equal(resPos.value.pairedReturnCount, 65);
  assert.equal(resPos.value.rollingSeries.length, 65 - 20 + 1);
  assert.equal(resPos.value.rollingSeries.at(-1).rho, 1);

  const resNeg = computeCorrelationLab({
    assetA: { id: "A", label: "Asset A", source: "Fixture", series: sA },
    assetB: { id: "C", label: "Asset C", source: "Fixture", series: sOpp },
    returnMethod: "simple",
    rollingWindow: 60,
    minPairs: 30,
  });
  assert.equal(resNeg.status, "OK");
  assert.equal(resNeg.value.pearsonRho, -1);
  assert.equal(resNeg.value.rollingSeries.length, 65 - 60 + 1);
});

test("[27] Correlation Lab: constant zero-variance series returns UNDEFINED_CONSTANT_SERIES and <30 pairs returns INSUFFICIENT_COVERAGE (never silent 0)", () => {
  const sVar = makeSeries(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5));
  const sConst = makeSeries(Array.from({ length: 40 }, () => 50));
  const zeroVar = computeCorrelationLab({
    assetA: { id: "A", label: "Var", source: "Fixture", series: sVar },
    assetB: { id: "CONST", label: "Const", source: "Fixture", series: sConst },
    minPairs: 30,
  });
  assert.equal(zeroVar.status, "UNDEFINED_CONSTANT_SERIES");
  assert.equal(zeroVar.value, null);
  assert.equal(pearsonTwoPass([1, 1, 1, 1], [1, 2, 3, 4]), null);

  const sShort = makeSeries(Array.from({ length: 15 }, (_, i) => 100 + i));
  const shortRes = computeCorrelationLab({
    assetA: { id: "S1", label: "S1", source: "Fixture", series: sShort },
    assetB: { id: "S2", label: "S2", source: "Fixture", series: sShort },
    minPairs: 30,
  });
  assert.equal(shortRes.status, "INSUFFICIENT_COVERAGE");
  assert.equal(shortRes.value, null);
  assert.equal(shortRes.sampleSize, 14);
});

test("[27] Correlation Lab: detects extreme >5 sigma outlier leverage", () => {
  const closesA = [100];
  const closesB = [100];
  for (let i = 0; i < 45; i++) {
    const rA = i === 25 ? 0.35 : ((i % 2 === 0 ? 1 : -1) * 0.002);
    const rB = i === 25 ? 0.35 : ((i % 3 === 0 ? 1 : -1) * 0.002);
    closesA.push(closesA.at(-1) * (1 + rA));
    closesB.push(closesB.at(-1) * (1 + rB));
  }
  const out = computeCorrelationLab({
    assetA: { id: "A", label: "A", source: "Fixture", series: makeSeries(closesA) },
    assetB: { id: "B", label: "B", source: "Fixture", series: makeSeries(closesB) },
    minPairs: 30,
  });
  assert.equal(out.status, "OK");
  assert.equal(out.value.outlierLeverageDetected, true);
  assert.ok(out.warnings.some((w) => /outlier|5σ/i.test(w)));
});

// ── [12] Portfolio Allocation Engine ──────────────────────────────────────────
test("[12] Portfolio Allocation: exact cost-basis %, truthful negative-cash note, and zero-denominator guard", () => {
  const pos = computePortfolioAllocation({
    currency: "INR",
    cash: 25000,
    holdings: [
      { symbol: "NSE:HDFCBANK", quantity: 25, basis: 50000 },
      { symbol: "NSE:TCS", quantity: 6, basis: 25000 },
    ],
  });
  assert.equal(pos.status, "OK");
  assert.equal(pos.value.allocationDenominator, 100000);
  const sumClassPct = pos.value.byAssetClass.reduce((a, s) => a + s.weightPct, 0);
  assert.equal(sumClassPct, 100);
  assert.equal(pos.value.bySector.find((s) => s.label === "Banking & Finance").weightPct, 50);

  // Negative manual cash (bought stocks without recording deposit)
  const negCash = computePortfolioAllocation({
    currency: "INR",
    cash: -40000,
    holdings: [
      { symbol: "NSE:HDFCBANK", quantity: 20, basis: 30000 },
      { symbol: "NSE:INFY", quantity: 5, basis: 10000 },
    ],
  });
  assert.equal(negCash.status, "OK");
  assert.equal(negCash.value.cashIsNegative, true);
  assert.ok(negCash.value.cashNote && /deposit/i.test(negCash.value.cashNote));
  assert.equal(negCash.value.allocationDenominator, 40000);
  assert.ok(negCash.value.byPosition.every((p) => p.weightPct > 0));
  assert.equal(negCash.value.byPosition.find((p) => p.label === "NSE:HDFCBANK").weightPct, 75);

  // Zero denominator -> UNAVAILABLE (no NaN)
  const empty = computePortfolioAllocation({
    currency: "INR",
    cash: 0,
    holdings: [],
  });
  assert.equal(empty.status, "UNAVAILABLE");
  assert.equal(empty.value.byAssetClass.length, 0);
});

// ── [13] Asset Comparison & [14] Event Window Return ──────────────────────────
test("[13] Asset Comparison: exact 100*(P_t/P_0 - 1), currency mismatch warning, and missing-series guard", () => {
  const sA = [
    { date: "2026-10-01", close: 100 },
    { date: "2026-10-02", close: 110 },
    { date: "2026-10-05", close: 125 },
  ];
  const sB = [
    { date: "2026-10-01", close: 200 },
    { date: "2026-10-03", close: 205 }, // Non-shared holiday dropped
    { date: "2026-10-05", close: 210 },
  ];
  const comp = computeAssetComparison({
    assetA: { id: "A", label: "A", currency: "INR", source: "S1", series: sA },
    assetB: { id: "B", label: "B", currency: "USD", source: "S2", series: sB },
  });
  assert.equal(comp.status, "OK");
  assert.equal(comp.sampleSize, 2); // Only 2026-10-01 and 2026-10-05 align!
  assert.equal(comp.value.totalReturnPctA, 25);
  assert.equal(comp.value.totalReturnPctB, 5);
  assert.equal(comp.value.spreadPct, 20);
  assert.equal(comp.value.currencyMismatch, true);

  const missing = computeAssetComparison({
    assetA: { id: "A", label: "A", currency: "INR", source: "S1", series: sA },
    assetB: { id: "NONE", label: "None", currency: "INR", source: "None", series: [] },
  });
  assert.equal(missing.status, "INSUFFICIENT_COVERAGE");
});

test("[14] Event Window Return: observed non-causal framing and future event guard", () => {
  const series = [
    { date: "2026-11-10", close: 84.0 },
    { date: "2026-11-11", close: 85.0 },
    { date: "2026-11-12", close: 86.7 },
  ];
  const past = computeEventWindowReturn({
    eventDate: "2026-11-11",
    announcedDateOnly: false,
    series,
  });
  assert.equal(past.status, "OK");
  assert.equal(past.value.framingLabel, "Observed after event (not causal)");
  assert.equal(past.value.observedWindowReturnPct, 2);

  const future = computeEventWindowReturn({
    eventDate: "2026-12-10",
    announcedDateOnly: true,
    series,
  });
  assert.equal(future.status, "INSUFFICIENT_COVERAGE");
  assert.equal(future.value.observedWindowReturnPct, null);
});

// ── [16] NSE Sectors, [17] Heatmaps, [18] Ecosystem, [22] Geopolitics ─────────
test("[16][17][18][22] Sectors, zero-fake-color Heatmaps, Company Ecosystem & Geopolitics pathways", () => {
  assert.equal(NSE_SECTOR_INDICES.length, 8);
  const emptyHms = buildSectorHeatmaps(new Map());
  assert.ok(
    emptyHms.every((h) => h.connectedCount === 0 && h.tiles.every((t) => t.tone === "UNAVAILABLE")),
    "No fake colored heatmap tiles may render when quotes are unavailable.",
  );

  const partialMap = new Map([
    ["NSE:HDFCBANK", { value: 1710, pctChange: 2.1, unit: "INR", provider: "Test" }],
    ["NSE:SBIN", { value: 820, pctChange: -0.8, unit: "INR", provider: "Test" }],
  ]);
  const bankHm = buildSectorHeatmaps(partialMap).find((h) => h.sectorId === "NSE:BANKNIFTY");
  assert.equal(bankHm.connectedCount, 2);
  assert.equal(bankHm.advancers, 1);
  assert.equal(bankHm.decliners, 1);
  assert.equal(bankHm.tiles.find((t) => t.id === "NSE:HDFCBANK").tone, "UP_STRONG");

  const eco = getCompanyEcosystem("NSE:HDFCBANK");
  assert.ok(eco.edges.some((e) => e.confidenceClass === "DOCUMENTED"));
  assert.ok(eco.edges.some((e) => e.confidenceClass === "INFERRED_EXPOSURE"));
  assert.ok(eco.edges.every((e) => e.sourceCitation && e.evidenceDate));

  assert.ok(GEOPOLITICS_MARKET_PATHWAYS.length >= 4);
  assert.ok(GEOPOLITICS_MARKET_PATHWAYS.every((p) => p.evidenceClass === "DOCUMENTED" || p.evidenceClass === "HYPOTHESIS"));
});

// ── [23] USGS / EONET Parsers + [20] Daily Briefing ───────────────────────────
test("[23][20] USGS & EONET parsers reject invalid coordinates and build factual Daily Briefing", () => {
  const usgs = parseUsgsGeoJson(
    {
      features: [
        {
          id: "ok1",
          properties: { mag: 5.4, place: "Offshore Japan", time: Date.parse("2026-11-21T06:00:00Z"), url: "https://earthquake.usgs.gov/earthquakes/eventpage/ok1" },
          geometry: { coordinates: [141.2, 37.5, 25.4] },
        },
        {
          id: "bad-lat",
          properties: { mag: 6.0, place: "Invalid", time: Date.parse("2026-11-21T06:00:00Z") },
          geometry: { coordinates: [10, 199, 10] },
        },
      ],
    },
    "2026-11-22T00:00:00Z",
  );
  assert.equal(usgs.length, 1);
  assert.equal(usgs[0].magnitude, 5.4);
  assert.equal(usgs[0].regionId, "japan");

  const eonet = parseEonetEvents(
    {
      events: [
        {
          id: "EONET_1",
          title: "Pacific Cyclone Test",
          categories: [{ title: "Severe Storms" }],
          sources: [{ url: "https://eonet.gsfc.nasa.gov/" }],
          geometry: [{ date: "2026-11-21T10:00:00Z", coordinates: [135.1, 22.4] }],
        },
      ],
    },
    "2026-11-22T00:00:00Z",
  );
  assert.equal(eonet.length, 1);

  const brief = buildDailyWorldBriefing([...usgs, ...eonet], Date.parse("2026-11-22T00:00:00Z"));
  assert.ok(brief.items.length >= 2 && brief.items.length <= 5);
});

// ── [28] Pure SVG QR Encoder ──────────────────────────────────────────────────
test("[28] QR encoder generates deterministic self-contained SVG matrix without external CDNs", () => {
  const url = "https://strategic-souls.vishnukota20071005.workers.dev/?view=community&profile=alpha_quant";
  const m = generateQrMatrix(url);
  assert.ok(m.size >= 25 && m.size <= 41);
  assert.equal(m.modules.length, m.size);
  // Top-left 7x7 finder border is dark
  assert.equal(m.modules[0][0], true);
  assert.equal(m.modules[0][6], true);
  assert.equal(m.modules[1][1], false);

  const svg = buildQrSvgString(url, 180);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org)/);
  assert.throws(() => generateQrMatrix("x".repeat(200)), /exceeds/i);
});

// ── UI Integrity Contracts ([04], [07], Index Units) ──────────────────────────
test("[04][07] UI source contracts: zero Impact select/badges in Economic Calendar, zero X2 in EclipseIntro, index pts units", () => {
  const calSrc = readFileSync("frontend/features/global/economic-calendar.tsx", "utf8");
  assert.doesNotMatch(calSrc, /Impact:\s*All/i);
  assert.doesNotMatch(calSrc, /importancePillClass/i);
  assert.match(calSrc, /x52-zone-picker/);

  const introSrc = readFileSync("frontend/components/workspace/eclipse-intro.tsx", "utf8");
  assert.doesNotMatch(introSrc, /\bX2\b/);

  const nineCardSrc = readFileSync("backend/services/market-data/nine-card-markets.ts", "utf8");
  assert.match(nineCardSrc, /quoteUnit:.+"index points"/);
});
