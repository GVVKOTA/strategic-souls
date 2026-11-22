/**
 * Strategic Souls Post-X5.1 — Pure Quantitative & Analytical Engines (Client-Safe).
 * Zero cloudflare:workers / network / DB dependencies.
 * Every public engine returns an immutable structured envelope with explicit status,
 * units, inputs, source, assumptions, warnings, and sampleSize.
 *
 * Covers:
 * - [12] Portfolio Allocation (cost-basis breakdown with explicit negative-cash handling)
 * - [13] Asset Comparison (exact shared-date alignment, rebase 100, exact pct return)
 * - [14] Economic Event -> Chart Window Return (observed non-causal before/after window)
 * - [27] Correlation Lab (two-pass stable Pearson rho, rolling 20/60/120, minPairs=30 guard)
 */

export type QuantitativeStatus =
  | "OK"
  | "INSUFFICIENT_COVERAGE"
  | "UNDEFINED_CONSTANT_SERIES"
  | "UNAVAILABLE"
  | "INVALID_INPUT";

export type QuantitativeEnvelope<T> = Readonly<{
  status: QuantitativeStatus;
  value: T | null;
  units: string;
  inputs: Record<string, unknown>;
  source: string;
  assumptions: readonly string[];
  warnings: readonly string[];
  sampleSize: number;
}>;

export type PriceObservation = {
  date: string; // YYYY-MM-DD
  close: number;
};

// ──────────────────────────────────────────────────────────────────────────────
// [12] PORTFOLIO ALLOCATION ENGINE — Time O(H), Space O(H)
// ──────────────────────────────────────────────────────────────────────────────

export type AllocationHoldingInput = {
  symbol: string;
  quantity: number;
  basis: number;
  assetClass?: string;
  sector?: string;
};

export type AllocationSlice = {
  key: string;
  label: string;
  amount: number;
  weightPct: number | null;
  holdingCount: number;
};

export type PortfolioAllocationResult = {
  valuationMethod: "COST_BASIS_ONLY";
  currency: string;
  investedCostTotal: number;
  positiveCashIncluded: number;
  cashBalance: number;
  cashIsNegative: boolean;
  cashNote: string | null;
  allocationDenominator: number;
  byAssetClass: AllocationSlice[];
  bySector: AllocationSlice[];
  byPosition: AllocationSlice[];
};

const KNOWN_SYMBOL_CLASS: Record<string, { assetClass: string; sector: string }> = {
  "NSE:HDFCBANK": { assetClass: "Indian Equity", sector: "Banking & Finance" },
  "NSE:ICICIBANK": { assetClass: "Indian Equity", sector: "Banking & Finance" },
  "NSE:SBIN": { assetClass: "Indian Equity", sector: "Banking & Finance" },
  "NSE:KOTAKBANK": { assetClass: "Indian Equity", sector: "Banking & Finance" },
  "NSE:AXISBANK": { assetClass: "Indian Equity", sector: "Banking & Finance" },
  "NSE:BAJFINANCE": { assetClass: "Indian Equity", sector: "Banking & Finance" },
  "NSE:TCS": { assetClass: "Indian Equity", sector: "Information Technology" },
  "NSE:INFY": { assetClass: "Indian Equity", sector: "Information Technology" },
  "NSE:WIPRO": { assetClass: "Indian Equity", sector: "Information Technology" },
  "NSE:HCLTECH": { assetClass: "Indian Equity", sector: "Information Technology" },
  "NSE:TECHM": { assetClass: "Indian Equity", sector: "Information Technology" },
  "NSE:RELIANCE": { assetClass: "Indian Equity", sector: "Energy & Materials" },
  "NSE:ONGC": { assetClass: "Indian Equity", sector: "Energy & Materials" },
  "NSE:NTPC": { assetClass: "Indian Equity", sector: "Energy & Materials" },
  "NSE:POWERGRID": { assetClass: "Indian Equity", sector: "Energy & Materials" },
  "NSE:SUNPHARMA": { assetClass: "Indian Equity", sector: "Pharma & Healthcare" },
  "NSE:DRREDDY": { assetClass: "Indian Equity", sector: "Pharma & Healthcare" },
  "NSE:CIPLA": { assetClass: "Indian Equity", sector: "Pharma & Healthcare" },
  "NSE:DIVISLAB": { assetClass: "Indian Equity", sector: "Pharma & Healthcare" },
  "NSE:TATAMOTORS": { assetClass: "Indian Equity", sector: "Automobiles" },
  "NSE:MARUTI": { assetClass: "Indian Equity", sector: "Automobiles" },
  "NSE:M&M": { assetClass: "Indian Equity", sector: "Automobiles" },
  "NSE:BAJAJ-AUTO": { assetClass: "Indian Equity", sector: "Automobiles" },
  "NSE:TATASTEEL": { assetClass: "Indian Equity", sector: "Metals & Mining" },
  "NSE:HINDALCO": { assetClass: "Indian Equity", sector: "Metals & Mining" },
  "NSE:JSWSTEEL": { assetClass: "Indian Equity", sector: "Metals & Mining" },
  "NSE:ITC": { assetClass: "Indian Equity", sector: "FMCG & Consumer" },
  "NSE:HINDUNILVR": { assetClass: "Indian Equity", sector: "FMCG & Consumer" },
  "NSE:NESTLEIND": { assetClass: "Indian Equity", sector: "FMCG & Consumer" },
  "NSE:BHARTIARTL": { assetClass: "Indian Equity", sector: "Telecom & Digital" },
  "NSE:LT": { assetClass: "Indian Equity", sector: "Industrials & Infra" },
  "NSE:DLF": { assetClass: "Indian Equity", sector: "Real Estate" },
  "NSE:NIFTY": { assetClass: "Index", sector: "Broad Market Index" },
  "NSE:BANKNIFTY": { assetClass: "Index", sector: "Banking & Finance" },
  "BSE:SENSEX": { assetClass: "Index", sector: "Broad Market Index" },
  "GLOBAL:XAUUSD": { assetClass: "Commodities", sector: "Precious Metals" },
  "GLOBAL:XAGUSD": { assetClass: "Commodities", sector: "Precious Metals" },
  "GLOBAL:BRENT": { assetClass: "Commodities", sector: "Energy & Materials" },
  "MCX:GOLD": { assetClass: "Commodities", sector: "Precious Metals" },
  "MCX:SILVER": { assetClass: "Commodities", sector: "Precious Metals" },
  "MCX:CRUDEOIL": { assetClass: "Commodities", sector: "Energy & Materials" },
};

export function inferHoldingTaxonomy(symbol: string): {
  assetClass: string;
  sector: string;
} {
  const key = symbol.trim().toUpperCase();
  if (KNOWN_SYMBOL_CLASS[key]) return KNOWN_SYMBOL_CLASS[key];
  if (key.startsWith("ECB:")) return { assetClass: "FX Reference", sector: "Foreign Exchange" };
  if (key.startsWith("UST:")) return { assetClass: "Government Yield", sector: "Fixed Income" };
  if (key.startsWith("MCX:")) return { assetClass: "Commodities", sector: "Commodities Futures" };
  if (key.startsWith("NSE:") || key.startsWith("BSE:"))
    return { assetClass: "Indian Equity", sector: "Unclassified Equity" };
  if (key.startsWith("GLOBAL:")) return { assetClass: "Global Benchmark", sector: "Global Macro" };
  return { assetClass: "Other Holding", sector: "Unclassified" };
}

function finalizeSlices(
  buckets: Map<string, { amount: number; count: number }>,
  denominator: number,
): AllocationSlice[] {
  const entries = [...buckets.entries()]
    .filter(([, v]) => v.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0]));

  return entries.map(([label, v]) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    amount: Math.round(v.amount * 100) / 100,
    weightPct:
      denominator > 0
        ? Math.round((v.amount / denominator) * 10000) / 100
        : null,
    holdingCount: v.count,
  }));
}

/**
 * Computes exact cost-basis allocation across Asset Class, Sector, and Individual Positions.
 * Handles zero-denominator cleanly (returns UNAVAILABLE / null weightPct, never NaN)
 * and handles negative manual-ledger cash truthfully (does NOT invent funding or render negative %).
 * Complexity: O(H log H) where H is number of holdings.
 */
export function computePortfolioAllocation(input: {
  holdings: readonly AllocationHoldingInput[];
  cash: number;
  currency: string;
}): QuantitativeEnvelope<PortfolioAllocationResult> {
  const warnings: string[] = [];
  const validHoldings = input.holdings.filter(
    (h) => Number.isFinite(h.basis) && h.basis > 0 && Number.isFinite(h.quantity) && h.quantity > 0,
  );
  const cashBalance = Number.isFinite(input.cash) ? Math.round(input.cash * 100) / 100 : 0;
  const cashIsNegative = cashBalance < 0;
  const positiveCashIncluded = cashBalance > 0 ? cashBalance : 0;

  let investedCostTotal = 0;
  const classBuckets = new Map<string, { amount: number; count: number }>();
  const sectorBuckets = new Map<string, { amount: number; count: number }>();
  const positionBuckets = new Map<string, { amount: number; count: number }>();

  for (const h of validHoldings) {
    investedCostTotal += h.basis;
    const tax = inferHoldingTaxonomy(h.symbol);
    const assetClass = h.assetClass?.trim() || tax.assetClass;
    const sector = h.sector?.trim() || tax.sector;

    const cPrev = classBuckets.get(assetClass) ?? { amount: 0, count: 0 };
    classBuckets.set(assetClass, { amount: cPrev.amount + h.basis, count: cPrev.count + 1 });

    const sPrev = sectorBuckets.get(sector) ?? { amount: 0, count: 0 };
    sectorBuckets.set(sector, { amount: sPrev.amount + h.basis, count: sPrev.count + 1 });

    const pPrev = positionBuckets.get(h.symbol) ?? { amount: 0, count: 0 };
    positionBuckets.set(h.symbol, { amount: pPrev.amount + h.basis, count: pPrev.count + 1 });
  }

  let cashNote: string | null = null;
  if (positiveCashIncluded > 0) {
    classBuckets.set("Cash", { amount: positiveCashIncluded, count: 1 });
    sectorBuckets.set("Cash & Liquidity", { amount: positiveCashIncluded, count: 1 });
  } else if (cashIsNegative) {
    cashNote =
      "Manual cash is negative because buy transactions were recorded without a matching cash deposit. Allocation percentages below represent gross invested cost basis (100% across holdings); record a funding deposit if you want net cash tracked.";
    warnings.push(cashNote);
  }

  investedCostTotal = Math.round(investedCostTotal * 100) / 100;
  const allocationDenominator =
    Math.round((investedCostTotal + positiveCashIncluded) * 100) / 100;

  if (allocationDenominator <= 0) {
    return Object.freeze({
      status: "UNAVAILABLE",
      value: {
        valuationMethod: "COST_BASIS_ONLY" as const,
        currency: input.currency,
        investedCostTotal: 0,
        positiveCashIncluded: 0,
        cashBalance,
        cashIsNegative,
        cashNote,
        allocationDenominator: 0,
        byAssetClass: [],
        bySector: [],
        byPosition: [],
      },
      units: "% of cost basis",
      inputs: { holdingCount: input.holdings.length, cashBalance, currency: input.currency },
      source: "Private manual transaction ledger",
      assumptions: [
        "Allocation reflects recorded cost basis only — not live mark-to-market valuation.",
      ],
      warnings: ["No positive cost basis or positive cash recorded (allocation denominator is zero)."],
      sampleSize: 0,
    });
  }

  return Object.freeze({
    status: "OK",
    value: {
      valuationMethod: "COST_BASIS_ONLY" as const,
      currency: input.currency,
      investedCostTotal,
      positiveCashIncluded,
      cashBalance,
      cashIsNegative,
      cashNote,
      allocationDenominator,
      byAssetClass: finalizeSlices(classBuckets, allocationDenominator),
      bySector: finalizeSlices(sectorBuckets, allocationDenominator),
      byPosition: finalizeSlices(positionBuckets, allocationDenominator),
    },
    units: "% of cost basis",
    inputs: {
      holdingCount: validHoldings.length,
      cashBalance,
      currency: input.currency,
    },
    source: "Private manual transaction ledger",
    assumptions: [
      "Cost-basis weighting only; mark-to-market valuation requires entitled live quotes.",
      "Negative manual cash is excluded from positive donut weights and disclosed separately.",
    ],
    warnings,
    sampleSize: validHoldings.length,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// SHARED DATE ALIGNMENT HELPER — Time O(N + M), Space O(min(N, M))
// ──────────────────────────────────────────────────────────────────────────────

export type AlignedObservation = {
  date: string;
  a: number;
  b: number;
};

export function alignPriceSeriesByDate(
  seriesA: readonly PriceObservation[],
  seriesB: readonly PriceObservation[],
): AlignedObservation[] {
  const mapA = new Map<string, number>();
  for (const pt of seriesA) {
    if (
      typeof pt.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(pt.date) &&
      Number.isFinite(pt.close) &&
      pt.close > 0
    ) {
      mapA.set(pt.date, pt.close);
    }
  }
  const mapB = new Map<string, number>();
  for (const pt of seriesB) {
    if (
      typeof pt.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(pt.date) &&
      Number.isFinite(pt.close) &&
      pt.close > 0
    ) {
      mapB.set(pt.date, pt.close);
    }
  }
  const aligned: AlignedObservation[] = [];
  for (const [date, a] of mapA) {
    const b = mapB.get(date);
    if (b !== undefined) {
      aligned.push({ date, a, b });
    }
  }
  aligned.sort((x, y) => x.date.localeCompare(y.date));
  return aligned;
}

// ──────────────────────────────────────────────────────────────────────────────
// [13] ASSET COMPARISON ENGINE — Time O(N + M), Space O(K)
// ──────────────────────────────────────────────────────────────────────────────

export type AssetComparisonPoint = {
  date: string;
  rawA: number;
  rawB: number;
  rebasedA: number; // Base 100 at aligned[0]
  rebasedB: number; // Base 100 at aligned[0]
  pctReturnA: number; // 100 * (P_t / P_0 - 1)
  pctReturnB: number; // 100 * (P_t / P_0 - 1)
  spreadPct: number; // pctReturnA - pctReturnB
};

export type AssetComparisonResult = {
  assetA: { id: string; label: string; currency: string; source: string };
  assetB: { id: string; label: string; currency: string; source: string };
  startDate: string;
  endDate: string;
  totalReturnPctA: number;
  totalReturnPctB: number;
  spreadPct: number;
  maxDrawdownPctA: number;
  maxDrawdownPctB: number;
  currencyMismatch: boolean;
  points: AssetComparisonPoint[];
};

function computeMaxDrawdownPct(closes: readonly number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = ((c - peak) / peak) * 100;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return Math.round(maxDd * 100) / 100;
}

/**
 * Compares 2 assets on exact shared observation dates, normalized to 100 at P_0.
 * Exact return formula: 100 * (P_t / P_0 - 1).
 * Fails closed with INSUFFICIENT_COVERAGE when fewer than 2 shared dates exist.
 */
export function computeAssetComparison(input: {
  assetA: { id: string; label: string; currency: string; source: string; series: readonly PriceObservation[] };
  assetB: { id: string; label: string; currency: string; source: string; series: readonly PriceObservation[] };
}): QuantitativeEnvelope<AssetComparisonResult> {
  const aligned = alignPriceSeriesByDate(input.assetA.series, input.assetB.series);
  const warnings: string[] = [];
  const currencyMismatch =
    Boolean(input.assetA.currency && input.assetB.currency) &&
    input.assetA.currency.toUpperCase() !== input.assetB.currency.toUpperCase();

  if (currencyMismatch) {
    warnings.push(
      `Currency difference: ${input.assetA.label} is denominated in ${input.assetA.currency} while ${input.assetB.label} is in ${input.assetB.currency}. Normalized % returns are in local units without FX hedging.`,
    );
  }

  if (aligned.length < 2) {
    return Object.freeze({
      status: "INSUFFICIENT_COVERAGE",
      value: null,
      units: "rebased index (base = 100) & % return",
      inputs: {
        assetA: input.assetA.id,
        assetB: input.assetB.id,
        obsA: input.assetA.series.length,
        obsB: input.assetB.series.length,
      },
      source: `${input.assetA.source} vs ${input.assetB.source}`,
      assumptions: ["Requires at least 2 shared observation dates with strictly positive finite values."],
      warnings: [
        ...warnings,
        `Only ${aligned.length} shared observation date(s) found between ${input.assetA.label} and ${input.assetB.label}.`,
      ],
      sampleSize: aligned.length,
    });
  }

  const baseA = aligned[0].a;
  const baseB = aligned[0].b;
  const points: AssetComparisonPoint[] = aligned.map((pt) => {
    const pctA = 100 * (pt.a / baseA - 1);
    const pctB = 100 * (pt.b / baseB - 1);
    return {
      date: pt.date,
      rawA: pt.a,
      rawB: pt.b,
      rebasedA: Math.round((100 + pctA) * 10000) / 10000,
      rebasedB: Math.round((100 + pctB) * 10000) / 10000,
      pctReturnA: Math.round(pctA * 10000) / 10000,
      pctReturnB: Math.round(pctB * 10000) / 10000,
      spreadPct: Math.round((pctA - pctB) * 10000) / 10000,
    };
  });

  const last = points[points.length - 1];
  return Object.freeze({
    status: "OK",
    value: {
      assetA: {
        id: input.assetA.id,
        label: input.assetA.label,
        currency: input.assetA.currency,
        source: input.assetA.source,
      },
      assetB: {
        id: input.assetB.id,
        label: input.assetB.label,
        currency: input.assetB.currency,
        source: input.assetB.source,
      },
      startDate: aligned[0].date,
      endDate: aligned[aligned.length - 1].date,
      totalReturnPctA: Math.round(last.pctReturnA * 100) / 100,
      totalReturnPctB: Math.round(last.pctReturnB * 100) / 100,
      spreadPct: Math.round(last.spreadPct * 100) / 100,
      maxDrawdownPctA: computeMaxDrawdownPct(aligned.map((p) => p.a)),
      maxDrawdownPctB: computeMaxDrawdownPct(aligned.map((p) => p.b)),
      currencyMismatch,
      points,
    },
    units: "rebased index (base = 100) & % return",
    inputs: {
      assetA: input.assetA.id,
      assetB: input.assetB.id,
      startDate: aligned[0].date,
      endDate: aligned[aligned.length - 1].date,
    },
    source: `${input.assetA.source} vs ${input.assetB.source}`,
    assumptions: [
      "Exact shared-date inner join only; missing holidays are dropped, never forward-filled.",
      "Rebased index = 100 * (P_t / P_0); percentage return = 100 * (P_t / P_0 - 1).",
    ],
    warnings,
    sampleSize: aligned.length,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// [27] CORRELATION LAB ENGINE — Two-Pass Numerically Stable Pearson + Rolling
// Time: O(N * W) for rolling window W <= 120, Space: O(N)
// ──────────────────────────────────────────────────────────────────────────────

export type ReturnMethod = "simple" | "log";

export type RollingCorrelationPoint = {
  date: string;
  rho: number | null;
};

export type CorrelationLabResult = {
  assetA: { id: string; label: string; source: string };
  assetB: { id: string; label: string; source: string };
  returnMethod: ReturnMethod;
  startDate: string;
  endDate: string;
  pairedReturnCount: number;
  pearsonRho: number; // Strictly in [-1, 1]
  rSquared: number; // rho^2 in [0, 1]
  meanReturnPctA: number;
  meanReturnPctB: number;
  sampleVolPctA: number;
  sampleVolPctB: number;
  outlierLeverageDetected: boolean;
  rollingWindow: number;
  rollingSeries: RollingCorrelationPoint[];
};

/**
 * Exact two-pass numerically stable Pearson correlation on paired numeric arrays.
 * Returns null if fewer than 2 points or either series has zero variance (constant).
 */
export function pearsonTwoPass(
  xs: readonly number[],
  ys: readonly number[],
): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  // Zero-variance guard (epsilon relative to machine precision)
  if (varX <= 1e-18 || varY <= 1e-18) return null;

  const denom = Math.sqrt(varX * varY);
  if (!Number.isFinite(denom) || denom <= 0) return null;
  const raw = cov / denom;
  return Math.max(-1, Math.min(1, raw));
}

function sampleStd(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (const v of values) {
    const d = v - mean;
    ss += d * d;
  }
  return Math.sqrt(ss / (n - 1));
}

/**
 * Computes aligned paired returns, exact two-pass Pearson rho, rolling correlation
 * for supported windows (20 / 60 / 120), zero-variance guard, minPairs=30 guard,
 * and extreme single-day outlier leverage warning.
 */
export function computeCorrelationLab(input: {
  assetA: { id: string; label: string; source: string; series: readonly PriceObservation[] };
  assetB: { id: string; label: string; source: string; series: readonly PriceObservation[] };
  returnMethod?: ReturnMethod;
  rollingWindow?: 20 | 60 | 120;
  minPairs?: number;
}): QuantitativeEnvelope<CorrelationLabResult> {
  const method: ReturnMethod = input.returnMethod === "log" ? "log" : "simple";
  const rollingWindow =
    input.rollingWindow === 60 || input.rollingWindow === 120
      ? input.rollingWindow
      : 20;
  const minPairs = Math.max(2, input.minPairs ?? 30);

  const aligned = alignPriceSeriesByDate(input.assetA.series, input.assetB.series);
  const dates: string[] = [];
  const retA: number[] = [];
  const retB: number[] = [];

  for (let i = 1; i < aligned.length; i++) {
    const prev = aligned[i - 1];
    const curr = aligned[i];
    const rA =
      method === "log" ? Math.log(curr.a / prev.a) : curr.a / prev.a - 1;
    const rB =
      method === "log" ? Math.log(curr.b / prev.b) : curr.b / prev.b - 1;
    if (Number.isFinite(rA) && Number.isFinite(rB)) {
      dates.push(curr.date);
      retA.push(rA);
      retB.push(rB);
    }
  }

  if (retA.length < minPairs) {
    return Object.freeze({
      status: "INSUFFICIENT_COVERAGE",
      value: null,
      units: "dimensionless Pearson correlation [-1, +1]",
      inputs: {
        assetA: input.assetA.id,
        assetB: input.assetB.id,
        returnMethod: method,
        rollingWindow,
        minPairs,
      },
      source: `${input.assetA.source} & ${input.assetB.source}`,
      assumptions: [
        `Requires at least ${minPairs} aligned paired return observations (${minPairs + 1} shared price dates).`,
        "Never returns a silent 0 when sample coverage is insufficient.",
      ],
      warnings: [
        `Insufficient aligned return pairs: found ${retA.length}, minimum required is ${minPairs}.`,
      ],
      sampleSize: retA.length,
    });
  }

  const rho = pearsonTwoPass(retA, retB);
  if (rho === null) {
    return Object.freeze({
      status: "UNDEFINED_CONSTANT_SERIES",
      value: null,
      units: "dimensionless Pearson correlation [-1, +1]",
      inputs: {
        assetA: input.assetA.id,
        assetB: input.assetB.id,
        returnMethod: method,
        rollingWindow,
        minPairs,
      },
      source: `${input.assetA.source} & ${input.assetB.source}`,
      assumptions: [
        "Pearson correlation is undefined when either asset return series has zero variance (constant price).",
      ],
      warnings: [
        "At least one asset exhibits zero return variance over the aligned window; correlation is mathematically undefined.",
      ],
      sampleSize: retA.length,
    });
  }

  const warnings: string[] = [];
  // Check for > 5 sigma outlier return leverage
  const stdA = sampleStd(retA);
  const stdB = sampleStd(retB);
  const meanA = retA.reduce((a, b) => a + b, 0) / retA.length;
  const meanB = retB.reduce((a, b) => a + b, 0) / retB.length;
  let outlierLeverageDetected = false;
  for (let i = 0; i < retA.length; i++) {
    const zA = stdA > 0 ? Math.abs((retA[i] - meanA) / stdA) : 0;
    const zB = stdB > 0 ? Math.abs((retB[i] - meanB) / stdB) : 0;
    if (zA > 5 || zB > 5) {
      outlierLeverageDetected = true;
      break;
    }
  }
  if (outlierLeverageDetected) {
    warnings.push(
      "Extreme return outlier (> 5σ) detected in sample window; Pearson correlation is sensitive to tail observations.",
    );
  }
  if (retA.length < rollingWindow) {
    warnings.push(
      `Rolling ${rollingWindow}-period series requires at least ${rollingWindow} return pairs; sample has ${retA.length}.`,
    );
  }

  const rollingSeries: RollingCorrelationPoint[] = [];
  if (retA.length >= rollingWindow) {
    for (let end = rollingWindow; end <= retA.length; end++) {
      const subA = retA.slice(end - rollingWindow, end);
      const subB = retB.slice(end - rollingWindow, end);
      const rWin = pearsonTwoPass(subA, subB);
      rollingSeries.push({
        date: dates[end - 1],
        rho: rWin === null ? null : Math.round(rWin * 10000) / 10000,
      });
    }
  }

  const roundedRho = Math.round(rho * 10000) / 10000;
  return Object.freeze({
    status: "OK",
    value: {
      assetA: {
        id: input.assetA.id,
        label: input.assetA.label,
        source: input.assetA.source,
      },
      assetB: {
        id: input.assetB.id,
        label: input.assetB.label,
        source: input.assetB.source,
      },
      returnMethod: method,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      pairedReturnCount: retA.length,
      pearsonRho: roundedRho,
      rSquared: Math.round(rho * rho * 10000) / 10000,
      meanReturnPctA: Math.round(meanA * 10000) / 100,
      meanReturnPctB: Math.round(meanB * 10000) / 100,
      sampleVolPctA: Math.round(stdA * 10000) / 100,
      sampleVolPctB: Math.round(stdB * 10000) / 100,
      outlierLeverageDetected,
      rollingWindow,
      rollingSeries,
    },
    units: "dimensionless Pearson correlation [-1, +1]",
    inputs: {
      assetA: input.assetA.id,
      assetB: input.assetB.id,
      returnMethod: method,
      rollingWindow,
      minPairs,
    },
    source: `${input.assetA.source} & ${input.assetB.source}`,
    assumptions: [
      method === "log"
        ? "Paired log returns: r_t = ln(P_t / P_{t-1}) on exact shared observation dates."
        : "Paired simple returns: r_t = P_t / P_{t-1} - 1 on exact shared observation dates.",
      "Two-pass mean-centered Pearson estimator; correlation is descriptive co-movement, not causation.",
    ],
    warnings,
    sampleSize: retA.length,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// [14] ECONOMIC EVENT -> CHART WINDOW RETURN (OBSERVED, NON-CAUSAL)
// ──────────────────────────────────────────────────────────────────────────────

export type EventWindowResult = {
  eventDate: string;
  announcedDateOnly: boolean;
  anchorBeforeDate: string | null;
  anchorBeforeClose: number | null;
  anchorAfterDate: string | null;
  anchorAfterClose: number | null;
  observedWindowReturnPct: number | null;
  framingLabel: "Observed after event (not causal)";
  statusNote: string;
};

export function computeEventWindowReturn(input: {
  eventDate: string; // YYYY-MM-DD
  announcedDateOnly: boolean;
  series: readonly PriceObservation[];
  windowDaysAfter?: number;
}): QuantitativeEnvelope<EventWindowResult> {
  const sorted = [...input.series]
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const afterSteps = Math.max(1, input.windowDaysAfter ?? 1);

  if (sorted.length < 2) {
    return Object.freeze({
      status: "UNAVAILABLE",
      value: {
        eventDate: input.eventDate,
        announcedDateOnly: input.announcedDateOnly,
        anchorBeforeDate: null,
        anchorBeforeClose: null,
        anchorAfterDate: null,
        anchorAfterClose: null,
        observedWindowReturnPct: null,
        framingLabel: "Observed after event (not causal)" as const,
        statusNote: "Connected daily observations are unavailable for this instrument.",
      },
      units: "% observed change",
      inputs: { eventDate: input.eventDate, afterSteps },
      source: "Connected instrument daily observations",
      assumptions: ["Observed return only — never implies causal attribution to the scheduled release."],
      warnings: ["No sufficient connected price history available around this event date."],
      sampleSize: sorted.length,
    });
  }

  // Find latest observation strictly on or before eventDate, and observation after eventDate
  let beforeIdx = -1;
  let afterIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].date <= input.eventDate) {
      beforeIdx = i;
    } else if (afterIdx === -1) {
      afterIdx = Math.min(sorted.length - 1, i + (afterSteps - 1));
    }
  }

  if (beforeIdx < 0 || afterIdx < 0) {
    const isFuture = input.eventDate > sorted[sorted.length - 1].date;
    return Object.freeze({
      status: "INSUFFICIENT_COVERAGE",
      value: {
        eventDate: input.eventDate,
        announcedDateOnly: input.announcedDateOnly,
        anchorBeforeDate: beforeIdx >= 0 ? sorted[beforeIdx].date : null,
        anchorBeforeClose: beforeIdx >= 0 ? sorted[beforeIdx].close : null,
        anchorAfterDate: null,
        anchorAfterClose: null,
        observedWindowReturnPct: null,
        framingLabel: "Observed after event (not causal)" as const,
        statusNote: isFuture
          ? `Scheduled future release (${input.eventDate}). Post-event observations are not yet available.`
          : `Event date (${input.eventDate}) falls outside the available daily series window (${sorted[0].date} – ${sorted[sorted.length - 1].date}).`,
      },
      units: "% observed change",
      inputs: { eventDate: input.eventDate, afterSteps },
      source: "Connected instrument daily observations",
      assumptions: ["Daily close observations; date-only precision when intraday bars are unavailable."],
      warnings: [isFuture ? "Event has not occurred yet." : "Event date outside series bounds."],
      sampleSize: sorted.length,
    });
  }

  const b = sorted[beforeIdx];
  const a = sorted[afterIdx];
  const pct = Math.round(100 * (a.close / b.close - 1) * 100) / 100;

  return Object.freeze({
    status: "OK",
    value: {
      eventDate: input.eventDate,
      announcedDateOnly: input.announcedDateOnly,
      anchorBeforeDate: b.date,
      anchorBeforeClose: b.close,
      anchorAfterDate: a.date,
      anchorAfterClose: a.close,
      observedWindowReturnPct: pct,
      framingLabel: "Observed after event (not causal)" as const,
      statusNote: input.announcedDateOnly
        ? `Date-only release window (${b.date} → ${a.date}). Daily close change observed after event (not causal).`
        : `Daily window around scheduled release (${b.date} → ${a.date}). Observed after event (not causal).`,
    },
    units: "% observed change",
    inputs: { eventDate: input.eventDate, beforeDate: b.date, afterDate: a.date },
    source: "Connected instrument daily observations",
    assumptions: [
      "Compares closest observation on/before event date against subsequent trading observation.",
      "Descriptive observation only; does not establish macroeconomic causation.",
    ],
    warnings: input.announcedDateOnly
      ? ["Event timestamp is date-only; sub-day reaction timing cannot be resolved from daily data."]
      : [],
    sampleSize: sorted.length,
  });
}
