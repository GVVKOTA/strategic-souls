/**
 * Strategic Souls X5.3 — Unit Tests for:
 * - Exact 4-item Global 3-dot menu contract
 * - Exact 4-block Strategic Dashboard & complete 2D map removal
 * - 3D Perspective Globe camera zoom (1.0x-5.0x), circularity, occlusion, poles/dateline & ray unproject
 * - Evidence & Probability statistical helpers (Coverage%, Match%, EmpiricalP, Wilson 95% CI, Brier, N/A guards)
 * - Date-only timestamp precision & Marketaux entity-to-canonical-asset mapping
 * - Strategy compact results, bold Graveyard & redesigned Economic Calendar contracts
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import {
  GLOBAL_MENU_ITEMS,
  parseGlobalViewParam,
  parseIntelligenceSubViewParam,
} from "../../frontend/components/workspace/global-menu.ts";
import {
  GLOBE_ZOOM_MIN,
  GLOBE_ZOOM_MAX,
  clampGlobeZoom,
  globeCameraParams,
  projectPerspective,
  unprojectScreenToLatLon,
} from "../../backend/services/market-data/globe.ts";
import { EXCHANGES } from "../../backend/services/market-data/exchanges.ts";
import {
  computeCoveragePct,
  computeMatchPct,
  computeEmpiricalProbability,
  computeWilsonInterval95,
  computeBrierScore,
  formatStatPct,
} from "../../backend/engines/evidence-stats.ts";

const vmCtx = vm.createContext({
  console,
  Date,
  Intl,
  Math,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  crypto,
});
const vmCache = new Map();
async function loadTs(filePath) {
  const abs = resolve(filePath);
  if (vmCache.has(abs)) return vmCache.get(abs);
  const code = ts.transpileModule(readFileSync(abs, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
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

const newsMod = (await loadTs("backend/services/intelligence/news-and-disasters.ts"))
  .namespace;

// ── 1. Exact 4-Item Global Menu Contract ──────────────────────────────────────
test("X5.3 Global three-dot menu has EXACTLY 4 items in locked order with exact labels", () => {
  assert.equal(GLOBAL_MENU_ITEMS.length, 4);
  assert.deepEqual(
    GLOBAL_MENU_ITEMS.map((i) => i.label),
    [
      "Dashboard",
      "Market Intelligence",
      "Sector Heatmaps",
      "Strategic Globe",
    ],
  );
  assert.deepEqual(
    GLOBAL_MENU_ITEMS.map((i) => i.id),
    ["DASHBOARD", "INTELLIGENCE", "HEATMAP", "GLOBE_FOCUS"],
  );

  // Deep-link parsing resolves all views & subviews cleanly
  assert.equal(parseGlobalViewParam(null), "DASHBOARD");
  assert.equal(parseGlobalViewParam("intelligence"), "INTELLIGENCE");
  assert.equal(parseGlobalViewParam("heatmap"), "HEATMAP");
  assert.equal(parseGlobalViewParam("globe_focus"), "GLOBE_FOCUS");
  assert.equal(parseGlobalViewParam("portfolio"), "PORTFOLIO");
  assert.equal(parseGlobalViewParam("watchlists"), "WATCHLISTS");
  assert.equal(parseIntelligenceSubViewParam("market-vox"), "MARKET_VOX");
  assert.equal(parseIntelligenceSubViewParam("calendar"), "CALENDAR");
  assert.equal(parseIntelligenceSubViewParam("unknown"), "HEADLINES");
});

// ── 2. Exact 4-Block Main Overview & Complete 2D Map Removal ──────────────────
test("X5.3 Global Overview renders ONLY 4 blocks and completely removes 2D map & List switch", () => {
  const dashSrc = readFileSync("frontend/features/global/dashboard.tsx", "utf8");
  const globeSrc = readFileSync("frontend/features/global/strategic-globe.tsx", "utf8");
  const layoutSrc = readFileSync("app/layout.tsx", "utf8");
  const wsSrc = readFileSync("frontend/components/workspace/workspace.tsx", "utf8");

  // Complete 2D Map removal from Global runtime path
  assert.doesNotMatch(dashSrc, /world-conflict-map|WorldConflictMap|maplibre/i);
  assert.doesNotMatch(globeSrc, /world-conflict-map|WorldConflictMap|maplibre/i);
  assert.doesNotMatch(globeSrc, /Investigate on 2D|Zoom for 2D|2D compatibility view/i);
  assert.doesNotMatch(layoutSrc, /earth-map\.css/);

  // No remount key churn on Global & uses GLOBAL_MENU_ITEMS
  assert.doesNotMatch(wsSrc, /key=\{"global-" \+ globalPanel\}/);
  assert.match(wsSrc, /GLOBAL_MENU_ITEMS\.map/);

  // No redundant top ScrollTabs rail on Global Overview
  assert.doesNotMatch(dashSrc, /<ScrollTabs/);

  // Inspect strictly the DASHBOARD JSX block (between DASHBOARD and INTELLIGENCE)
  const startDash = dashSrc.indexOf('{globalView === "DASHBOARD" && (');
  const endDash = dashSrc.indexOf('{globalView === "INTELLIGENCE" && (');
  assert.ok(startDash > 0 && endDash > startDash, "DASHBOARD view block must precede INTELLIGENCE");
  const dashBlock = dashSrc.slice(startDash, endDash);
  assert.match(dashBlock, /<MarketOverviewGrid/);
  assert.match(dashBlock, /My Portfolio/);
  assert.match(dashBlock, /Watchlist/);
  assert.match(dashBlock, /<StrategicGlobe/);
  assert.match(dashBlock, /<EconomicCalendar/);
  assert.doesNotMatch(dashBlock, /<MarketIntelligenceNews/);
  assert.doesNotMatch(dashBlock, /<SectorExplorer/);
  assert.doesNotMatch(dashBlock, /<DailyMarketPulse/);
  assert.doesNotMatch(dashBlock, /Review data coverage/);

  // Verify exact order of the 4 blocks in DASHBOARD
  const idxA = dashBlock.indexOf("<MarketOverviewGrid");
  const idxB = dashBlock.indexOf("My Portfolio");
  const idxC = dashBlock.indexOf("<StrategicGlobe");
  const idxD = dashBlock.indexOf("<EconomicCalendar");
  assert.ok(idxA < idxB && idxB < idxC && idxC < idxD, "4 blocks must appear in strict A -> B -> C -> D order");

  // Centered Strategic Dashboard title in market-grid.tsx without redundant "Markets" subtitle
  const gridSrc = readFileSync("frontend/features/global/market-grid.tsx", "utf8");
  assert.match(gridSrc, /Strategic Dashboard/);
  assert.doesNotMatch(gridSrc, /3×3 workspace/);
});

// ── 3. Perspective 3D Globe Zoom, Circularity, Occlusion & Ray Picking ────────
test("X5.3 Perspective 3D Globe math: 1.0x-5.0x zoom bounds, circularity, occlusion, poles/dateline & unproject", () => {
  assert.equal(GLOBE_ZOOM_MIN, 1.0);
  assert.equal(GLOBE_ZOOM_MAX, 5.0);
  assert.equal(clampGlobeZoom(-5), 1.0);
  assert.equal(clampGlobeZoom(99), 5.0);
  assert.equal(clampGlobeZoom(Number.NaN), 1.0);

  // Camera stays strictly outside sphere + elevated arcs at max zoom 5x (no clipping!)
  for (const [w, h] of [
    [360, 440],
    [390, 460],
    [768, 560],
    [1280, 680],
  ]) {
    const cam1 = globeCameraParams(1.0, w, h);
    const cam5 = globeCameraParams(5.0, w, h);
    assert.ok(cam5.cameraDist > 1.8, `cameraDist must remain well outside R=1 at 5x (${cam5.cameraDist})`);
    // Sphere radius at 1.0x fills ~86% of min(w, h) => ~43% radius
    const expectedFill = (cam1.silhouetteRadiusPx * 2) / Math.min(w, h);
    assert.ok(
      Math.abs(expectedFill - 0.86) < 0.01,
      `Expected ~86% fill on ${w}x${h}, got ${expectedFill}`,
    );

    // Circularity check: +10 deg east vs +10 deg north from (0,0) must have equal pixel offset
    const center = projectPerspective({ lat: 0, lon: 0 }, 0, 0, w, h, 2.5);
    const east = projectPerspective({ lat: 0, lon: 10 }, 0, 0, w, h, 2.5);
    const north = projectPerspective({ lat: 10, lon: 0 }, 0, 0, w, h, 2.5);
    const dx = Math.abs(east.x - center.x);
    const dy = Math.abs(north.y - center.y);
    assert.ok(
      Math.abs(dx - dy) < 1e-6,
      `Sphere must remain perfectly circular on ${w}x${h}: dx=${dx}, dy=${dy}`,
    );
  }

  // Every exchange centers cleanly at (w/2, h/2) across zoom 1x..5x, and antipode is occluded
  for (const z of [1.0, 2.0, 3.5, 5.0]) {
    for (const v of EXCHANGES) {
      const yaw = (-v.lon * Math.PI) / 180;
      const pitch = (v.lat * Math.PI) / 180;
      const p = projectPerspective(v, yaw, pitch, 800, 600, z);
      assert.ok(Math.abs(p.x - 400) < 1e-6 && Math.abs(p.y - 300) < 1e-6);
      assert.equal(p.visible, true);

      const antipode = {
        lat: -v.lat,
        lon: v.lon > 0 ? v.lon - 180 : v.lon + 180,
      };
      const antiP = projectPerspective(antipode, yaw, pitch, 800, 600, z);
      assert.equal(antiP.visible, false, "Antipode must be occluded behind horizon");
    }
  }

  // Poles and international dateline stay finite
  for (const pt of [
    { lat: 90, lon: 0 },
    { lat: -90, lon: 0 },
    { lat: 0, lon: 180 },
    { lat: 0, lon: -180 },
    { lat: 20, lon: 179.9 },
  ]) {
    const p = projectPerspective(pt, 0.3, 0.2, 600, 600, 3.0);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }

  // Inverse ray-sphere unprojection round-trips cleanly across zoom levels & rejects sky clicks
  for (const z of [1.0, 2.5, 4.5]) {
    const target = { lat: 19.076, lon: 72.8777 }; // Mumbai
    const yaw = -1.1;
    const pitch = 0.25;
    const proj = projectPerspective(target, yaw, pitch, 800, 600, z);
    assert.equal(proj.visible, true);
    const back = unprojectScreenToLatLon(proj.x, proj.y, yaw, pitch, 800, 600, z);
    assert.ok(back, "Front-facing projected point must unproject cleanly");
    assert.ok(Math.abs(back.lat - target.lat) < 0.05, `Lat mismatch: ${back.lat}`);
    assert.ok(Math.abs(back.lon - target.lon) < 0.05, `Lon mismatch: ${back.lon}`);
  }
  // Corner sky pixel at 1.0x must return null
  assert.equal(unprojectScreenToLatLon(2, 2, 0, 0, 800, 600, 1.0), null);
});

// ── 4. Evidence & Probability Statistics Math & Zero-Division Guards ──────────
test("X5.3 Evidence & Probability stats: Coverage%, Match%, Wilson 95% CI, Brier & zero-division N/A guards", () => {
  assert.equal(computeCoveragePct(8, 10), 80);
  assert.equal(computeCoveragePct(0, 0), null);
  assert.equal(formatStatPct(computeCoveragePct(0, 0)), "N/A");

  assert.equal(computeMatchPct(3, 12), 25);
  assert.equal(computeMatchPct(0, 0), null);
  assert.equal(formatStatPct(computeMatchPct(0, 0)), "N/A");

  assert.equal(computeEmpiricalProbability(6, 10), 0.6);
  assert.equal(computeEmpiricalProbability(0, 0), null);
  assert.equal(computeEmpiricalProbability(12, 10), null);
  assert.equal(computeEmpiricalProbability(-1, 10), null);

  // Wilson 95% CI analytical check for k=50, n=100, z=1.96
  const w = computeWilsonInterval95(50, 100, 1.96);
  assert.ok(w);
  assert.ok(Math.abs(w.center - 0.5) < 1e-9);
  assert.ok(w.low > 0.40 && w.low < 0.41, `Expected low ~0.4038, got ${w.low}`);
  assert.ok(w.high > 0.59 && w.high < 0.60, `Expected high ~0.5962, got ${w.high}`);
  assert.ok(w.low >= 0 && w.high <= 1);
  // Boundary: k=0, n=20 -> low strictly 0, high bounded in (0, 1)
  const wZero = computeWilsonInterval95(0, 20);
  assert.ok(wZero && wZero.low === 0 && wZero.high > 0 && wZero.high < 0.25);
  assert.equal(computeWilsonInterval95(0, 0), null);

  // Brier score exact check
  assert.equal(
    computeBrierScore([
      { predicted: 0.8, outcome: 1 },
      { predicted: 0.2, outcome: 0 },
    ]),
    0.04,
  );
  assert.equal(computeBrierScore([]), null);
  assert.equal(computeBrierScore([{ predicted: 1.5, outcome: 1 }]), null);
});

// ── 5. Date-Only Timestamp Precision & Marketaux Related Assets ───────────────
test("X5.3 Data fidelity: no synthetic T16:00:00Z on date-only quotes; Marketaux entity mapping without hallucination", () => {
  const nineCardSrc = readFileSync("backend/services/market-data/nine-card-markets.ts", "utf8");
  assert.doesNotMatch(
    nineCardSrc,
    /T16:00:00\.000Z/,
    "Date-only ECB/Treasury observations must never have synthetic T16:00:00.000Z appended",
  );
  assert.match(nineCardSrc, /sourceObservedPrecision/);

  const mapped = newsMod.extractRelatedAssetsFromEntities([
    { symbol: "HDFCBANK.NS" },
    { symbol: "USDINR" },
    { symbol: "FAKE_UNLISTED_TICKER_XYZ" },
  ]);
  assert.deepEqual([...mapped], ["NSE:HDFCBANK", "ECB:USDINR"]);
  assert.deepEqual([...newsMod.extractRelatedAssetsFromEntities(null)], []);
});

// ── 6. Strategy Compact Results, Bold GRAVEYARD & Redesigned Calendar Contracts
test("X5.3 UI contracts: Strategy matches collapsed by default, bold GRAVEYARD, Evidence charts, Calendar clean", () => {
  const stratSrc = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  assert.doesNotMatch(
    stratSrc,
    /<details key=\{r\.instrumentId\} open>/,
    "Matching stocks in Strategy Results must be collapsed by default",
  );
  assert.match(stratSrc, /Scan Results/);
  assert.match(stratSrc, /x53-graveyard-shell/);
  assert.match(stratSrc, /GRAVEYARD/);
  assert.doesNotMatch(stratSrc, />Replay<|>Backtest<|>Probability</);

  const controlsSrc = readFileSync("frontend/features/strategy/controls.tsx", "utf8");
  assert.match(controlsSrc, /<EmpiricalProbabilityChart/);

  const chartSrc = readFileSync("frontend/features/strategy/evidence-charts.tsx", "utf8");
  assert.match(chartSrc, /Insufficient verified observations/);

  const calSrc = readFileSync("frontend/features/global/economic-calendar.tsx", "utf8");
  assert.match(calSrc, /Time not announced/);
  assert.doesNotMatch(calSrc, /HIGH|MEDIUM|LOW/);
});
