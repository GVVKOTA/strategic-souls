/**
 * Strategic Souls X5.1 — Interactive Draw Pattern Engine (Normalized Pearson + Bounded Sakoe-Chiba DTW).
 * Matches a user-drawn shape against genuine historical OHLCV/close sequences.
 * Pattern Fit is strictly a descriptive geometric similarity (0-100), NEVER a future probability.
 */
import type { ScanDataset } from "./scan";

export type DrawPoint = { x: number; y: number };

export type PatternTemplateId =
  | "double_bottom"
  | "double_top"
  | "ascending_triangle"
  | "bull_flag"
  | "cup_and_handle"
  | "head_and_shoulders"
  | "falling_wedge"
  | "resistance_breakout";

export type PatternTemplate = {
  id: PatternTemplateId;
  label: string;
  description: string;
  /** Normalized coordinates where x in [0, 1] left-to-right and y in [0, 1] bottom-to-top (price-up). */
  points: readonly DrawPoint[];
};

export const PATTERN_TEMPLATES: readonly PatternTemplate[] = Object.freeze([
  {
    id: "double_bottom",
    label: "Double Bottom",
    description: "W-shaped twin support test followed by neckline recovery.",
    points: [
      { x: 0.0, y: 0.82 },
      { x: 0.14, y: 0.45 },
      { x: 0.26, y: 0.14 },
      { x: 0.38, y: 0.42 },
      { x: 0.5, y: 0.6 },
      { x: 0.62, y: 0.38 },
      { x: 0.72, y: 0.16 },
      { x: 0.86, y: 0.58 },
      { x: 1.0, y: 0.9 },
    ],
  },
  {
    id: "double_top",
    label: "Double Top",
    description: "M-shaped twin resistance test followed by breakdown.",
    points: [
      { x: 0.0, y: 0.18 },
      { x: 0.14, y: 0.56 },
      { x: 0.26, y: 0.86 },
      { x: 0.38, y: 0.56 },
      { x: 0.5, y: 0.4 },
      { x: 0.62, y: 0.64 },
      { x: 0.74, y: 0.85 },
      { x: 0.88, y: 0.42 },
      { x: 1.0, y: 0.12 },
    ],
  },
  {
    id: "ascending_triangle",
    label: "Triangle",
    description: "Higher lows compressing against flat overhead resistance into breakout.",
    points: [
      { x: 0.0, y: 0.2 },
      { x: 0.18, y: 0.72 },
      { x: 0.32, y: 0.34 },
      { x: 0.48, y: 0.73 },
      { x: 0.62, y: 0.48 },
      { x: 0.76, y: 0.74 },
      { x: 0.86, y: 0.6 },
      { x: 1.0, y: 0.94 },
    ],
  },
  {
    id: "bull_flag",
    label: "Flag",
    description: "Sharp upward impulse followed by compact downward channel and continuation.",
    points: [
      { x: 0.0, y: 0.12 },
      { x: 0.16, y: 0.46 },
      { x: 0.3, y: 0.8 },
      { x: 0.44, y: 0.64 },
      { x: 0.56, y: 0.72 },
      { x: 0.68, y: 0.58 },
      { x: 0.8, y: 0.66 },
      { x: 1.0, y: 0.95 },
    ],
  },
  {
    id: "cup_and_handle",
    label: "Cup & Handle",
    description: "Rounded U-base accumulation with brief shallow pullback handle.",
    points: [
      { x: 0.0, y: 0.78 },
      { x: 0.12, y: 0.48 },
      { x: 0.25, y: 0.24 },
      { x: 0.38, y: 0.16 },
      { x: 0.52, y: 0.24 },
      { x: 0.64, y: 0.5 },
      { x: 0.74, y: 0.78 },
      { x: 0.84, y: 0.64 },
      { x: 0.92, y: 0.72 },
      { x: 1.0, y: 0.94 },
    ],
  },
  {
    id: "head_and_shoulders",
    label: "Head & Shoulders",
    description: "Three-peak reversal with central peak exceeding flanking shoulders.",
    points: [
      { x: 0.0, y: 0.26 },
      { x: 0.16, y: 0.68 },
      { x: 0.28, y: 0.4 },
      { x: 0.46, y: 0.92 },
      { x: 0.62, y: 0.4 },
      { x: 0.76, y: 0.66 },
      { x: 0.88, y: 0.38 },
      { x: 1.0, y: 0.14 },
    ],
  },
  {
    id: "falling_wedge",
    label: "Wedge",
    description: "Converging downward swings narrowing before upward expansion.",
    points: [
      { x: 0.0, y: 0.86 },
      { x: 0.16, y: 0.32 },
      { x: 0.32, y: 0.72 },
      { x: 0.48, y: 0.26 },
      { x: 0.64, y: 0.56 },
      { x: 0.78, y: 0.28 },
      { x: 0.88, y: 0.48 },
      { x: 1.0, y: 0.82 },
    ],
  },
  {
    id: "resistance_breakout",
    label: "Breakout",
    description: "Horizontal range consolidation resolving above prior ceiling.",
    points: [
      { x: 0.0, y: 0.38 },
      { x: 0.15, y: 0.5 },
      { x: 0.3, y: 0.36 },
      { x: 0.45, y: 0.52 },
      { x: 0.6, y: 0.4 },
      { x: 0.74, y: 0.53 },
      { x: 0.86, y: 0.74 },
      { x: 1.0, y: 0.95 },
    ],
  },
]);

/** Resamples an ordered polyline of (x, y) points into `length` evenly spaced y values along x. */
export function resampleStroke(
  points: readonly DrawPoint[],
  length: number,
): number[] {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("Draw at least 2 points or choose a pattern template.");
  }
  const n = Math.max(8, Math.min(120, Math.round(length)));
  const clean = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => a.x - b.x);
  if (clean.length < 2) {
    throw new Error("Valid finite stroke points are required.");
  }
  const minX = clean[0].x;
  const maxX = clean[clean.length - 1].x;
  const spanX = maxX - minX;
  if (spanX <= 1e-9) {
    // Fallback: index-based resampling if user drew a vertical stroke
    return Array.from({ length: n }, (_, i) => {
      const pos = (i / (n - 1)) * (clean.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.min(clean.length - 1, lo + 1);
      const t = pos - lo;
      return clean[lo].y * (1 - t) + clean[hi].y * t;
    });
  }

  const out: number[] = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const targetX = minX + (i / (n - 1)) * spanX;
    while (seg < clean.length - 2 && clean[seg + 1].x < targetX) {
      seg++;
    }
    const p0 = clean[seg];
    const p1 = clean[seg + 1];
    const dx = p1.x - p0.x;
    const t = dx <= 1e-12 ? 0 : Math.max(0, Math.min(1, (targetX - p0.x) / dx));
    out.push(p0.y * (1 - t) + p1.y * t);
  }
  return out;
}

/** Z-score normalizes a numeric series (zero mean, unit standard deviation). Flat series returns zeros. */
export function zNormalize(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd <= 1e-12) return new Array(n).fill(0);
  return values.map((v) => (v - mean) / sd);
}

/** Standard Pearson correlation in [-1, 1] between two equal-length series. */
export function pearsonCorrelation(
  a: readonly number[],
  b: readonly number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const za = zNormalize(a.slice(0, n));
  const zb = zNormalize(b.slice(0, n));
  const dot = za.reduce((s, v, i) => s + v * zb[i], 0);
  const normA = Math.sqrt(za.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(zb.reduce((s, v) => s + v * v, 0));
  if (normA <= 1e-12 || normB <= 1e-12) return 0;
  return Math.max(-1, Math.min(1, dot / (normA * normB)));
}

/** Bounded Sakoe-Chiba Dynamic Time Warping RMS distance between two Z-normalized equal-length series. */
export function boundedDtwDistance(
  a: readonly number[],
  b: readonly number[],
  bandRatio = 0.2,
): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;
  const band = Math.max(2, Math.ceil(Math.max(n, m) * bandRatio));
  const INF = 1e18;
  const dp = new Float64Array((n + 1) * (m + 1)).fill(INF);
  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    const jStart = Math.max(1, i - band);
    const jEnd = Math.min(m, i + band);
    for (let j = jStart; j <= jEnd; j++) {
      const diff = a[i - 1] - b[j - 1];
      const cost = diff * diff;
      const idx = i * (m + 1) + j;
      const bestPrev = Math.min(
        dp[(i - 1) * (m + 1) + j],
        dp[i * (m + 1) + (j - 1)],
        dp[(i - 1) * (m + 1) + (j - 1)],
      );
      dp[idx] = cost + bestPrev;
    }
  }
  const total = dp[n * (m + 1) + m];
  return Number.isFinite(total) ? Math.sqrt(total / n) : Infinity;
}

export type DrawMatchResult = {
  instrumentId: string;
  source: string;
  patternFit: number; // 0-100 descriptive geometric similarity (NOT probability)
  correlation: number; // [-1, 1]
  dtwDistance: number;
  windowStartAt: string;
  windowEndAt: string;
  windowBars: number;
  normalizedQuery: number[];
  normalizedSeries: number[];
  explanation: string;
};

export type DrawScanReport = {
  method: "Normalized Close (Z-score Pearson + Sakoe-Chiba DTW)";
  windowBars: number;
  minPatternFit: number;
  evaluated: number;
  insufficientBarsCount: number;
  matches: DrawMatchResult[];
  excluded: { instrumentId: string; reason: string }[];
  caveat: string;
};

/**
 * Matches a drawn normalized shape against the latest trailing `windowBars` closed prices
 * of each eligible dataset. Strictly descriptive; never fabricates matches when bars are missing.
 */
export function matchDrawnPattern(
  strokePoints: readonly DrawPoint[],
  datasets: readonly ScanDataset[],
  options: {
    windowBars?: number;
    minPatternFit?: number;
    asOf?: string;
  } = {},
): DrawScanReport {
  const windowBars = Math.max(8, Math.min(80, Math.round(options.windowBars ?? 20)));
  const minPatternFit = Math.max(
    30,
    Math.min(98, Math.round(options.minPatternFit ?? 62)),
  );
  const cutoffMs = options.asOf ? Date.parse(options.asOf) : Date.now();
  const resampledQuery = resampleStroke(strokePoints, windowBars);
  const zQuery = zNormalize(resampledQuery);

  const matches: DrawMatchResult[] = [];
  const excluded: { instrumentId: string; reason: string }[] = [];
  let evaluated = 0;
  let insufficientBarsCount = 0;

  for (const ds of datasets) {
    if (ds.permitted !== true) {
      excluded.push({
        instrumentId: ds.instrumentId,
        reason: "Analysis rights not confirmed.",
      });
      continue;
    }
    const eligibleObs = ds.observations.filter((o) => {
      const t = Date.parse(o.eventAt);
      const k = Date.parse(o.knownAt);
      return (
        Number.isFinite(t) &&
        Number.isFinite(k) &&
        t <= cutoffMs &&
        k <= cutoffMs &&
        typeof o.close === "number" &&
        Number.isFinite(o.close) &&
        o.close > 0
      );
    });

    if (eligibleObs.length < windowBars) {
      insufficientBarsCount++;
      excluded.push({
        instrumentId: ds.instrumentId,
        reason: `Requires ${windowBars} closed bars (only ${eligibleObs.length} available).`,
      });
      continue;
    }

    evaluated++;
    const slice = eligibleObs.slice(-windowBars);
    const closes = slice.map((o) => o.close as number);
    const zSeries = zNormalize(closes);
    const corr = pearsonCorrelation(zQuery, zSeries);
    const dtw = boundedDtwDistance(zQuery, zSeries, 0.2);

    // Combine correlation (in [0, 1] for positive correlation) and DTW proximity exp(-0.65 * dtw)
    const corrScore = Math.max(0, (corr + 1) / 2);
    const dtwScore = Math.exp(-0.65 * dtw);
    const fit = Math.round((0.55 * corrScore + 0.45 * dtwScore) * 1000) / 10;

    if (fit >= minPatternFit) {
      matches.push({
        instrumentId: ds.instrumentId,
        source: ds.source,
        patternFit: fit,
        correlation: Math.round(corr * 1000) / 1000,
        dtwDistance: Math.round(dtw * 1000) / 1000,
        windowStartAt: slice[0].eventAt,
        windowEndAt: slice[slice.length - 1].eventAt,
        windowBars,
        normalizedQuery: zQuery.map((v) => Math.round(v * 1000) / 1000),
        normalizedSeries: zSeries.map((v) => Math.round(v * 1000) / 1000),
        explanation: `Trailing ${windowBars}-bar normalized close matches drawn shape with Pattern Fit ${fit.toFixed(1)}/100 (Pearson r=${corr.toFixed(2)}, DTW=${dtw.toFixed(2)}). Descriptive geometry only.`,
      });
    }
  }

  matches.sort((a, b) => b.patternFit - a.patternFit || a.instrumentId.localeCompare(b.instrumentId));

  return {
    method: "Normalized Close (Z-score Pearson + Sakoe-Chiba DTW)",
    windowBars,
    minPatternFit,
    evaluated,
    insufficientBarsCount,
    matches,
    excluded,
    caveat:
      "Pattern Fit measures descriptive geometric similarity on Z-normalized closed prices. It is NOT a forward probability or investment recommendation.",
  };
}
