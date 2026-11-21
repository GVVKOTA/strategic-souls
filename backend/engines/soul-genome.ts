/**
 * Strategic Souls X5.1 — Soul Genome Research Evidence Modules:
 * - Historical Twins: Causal, non-overlapping past matches strictly before current cutoff.
 * - Future Paths: Empirical quantile distribution over explicit horizons (1/5/10/20 bars),
 *   strictly gated by minimum resolved sample size (INSUFFICIENT EVIDENCE when n < 15).
 * - Anti-Scan Skepticism: Transaction-cost stress (+25/+50 bps), split-half stability,
 *   sample adequacy, and survivorship/multiple-testing caveats.
 */
import type { ScanDataset } from "./scan";
import { boundedDtwDistance, pearsonCorrelation, zNormalize } from "./pattern-draw";
import { wilson } from "../services/research/research";

export const MIN_GENOME_SAMPLE = 15;

export type HistoricalTwin = {
  instrumentId: string;
  windowStartAt: string;
  windowEndAt: string;
  patternFit: number;
  horizonBars: number;
  subsequentReturnPct: number;
  maxAdverseExcursionPct: number;
};

export type FuturePathsSummary = {
  status: "CALIBRATED_EMPIRICAL" | "INSUFFICIENT EVIDENCE";
  horizonBars: number;
  sampleSize: number;
  minRequiredSample: number;
  positiveOutcomeRatePct: number | null;
  wilson95IntervalPct: [number, number] | null;
  quantilesPct: {
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
  } | null;
  medianMaxAdverseExcursionPct: number | null;
  disclosure: string;
};

export type AntiScanCheck = {
  id: string;
  title: string;
  status: "PASS" | "CAUTION" | "INSUFFICIENT_DATA";
  detail: string;
};

export type SoulGenomeReport = {
  engineVersion: "x51-soul-genome-1";
  historicalTwins: HistoricalTwin[];
  futurePaths: FuturePathsSummary;
  antiScan: AntiScanCheck[];
  gatedModules: {
    name: string;
    status: "GATED";
    reason: string;
  }[];
};

function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const frac = pos - lo;
  return Math.round((sorted[lo] * (1 - frac) + sorted[hi] * frac) * 100) / 100;
}

/**
 * Evaluates causal non-overlapping Historical Twins, Future Paths distribution, and Anti-Scan
 * skepticism checks across genuinely supplied datasets. Never fabricates odds when n < 15.
 */
export function runSoulGenomeEvidence(
  datasets: readonly ScanDataset[],
  options: {
    windowBars?: number;
    horizonBars?: number;
    minTwinFit?: number;
    asOf?: string;
    querySeries?: readonly number[];
  } = {},
): SoulGenomeReport {
  const windowBars = Math.max(8, Math.min(60, Math.round(options.windowBars ?? 15)));
  const horizonBars = Math.max(1, Math.min(60, Math.round(options.horizonBars ?? 10)));
  const minTwinFit = Math.max(50, Math.min(95, options.minTwinFit ?? 68));
  const cutoffMs = options.asOf ? Date.parse(options.asOf) : Date.now();

  const twins: HistoricalTwin[] = [];

  for (const ds of datasets) {
    if (ds.permitted !== true) continue;
    const obs = ds.observations.filter((o) => {
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

    // Need at least current window + horizon + one earlier disjoint window
    if (obs.length < windowBars * 2 + horizonBars) continue;

    const currentSlice = obs.slice(-windowBars).map((o) => o.close as number);
    const targetZ = zNormalize(
      options.querySeries && options.querySeries.length === windowBars
        ? options.querySeries
        : currentSlice,
    );

    // Scan strictly earlier non-overlapping windows whose entire outcome horizon finished BEFORE current window start
    const lastEligibleEnd = obs.length - windowBars - horizonBars - 1;
    let i = 0;
    while (i + windowBars - 1 <= lastEligibleEnd) {
      const win = obs.slice(i, i + windowBars);
      const winCloses = win.map((o) => o.close as number);
      const zWin = zNormalize(winCloses);
      const corr = pearsonCorrelation(targetZ, zWin);
      const dtw = boundedDtwDistance(targetZ, zWin, 0.2);
      const fit =
        Math.round(
          (0.55 * Math.max(0, (corr + 1) / 2) + 0.45 * Math.exp(-0.65 * dtw)) *
            1000,
        ) / 10;

      if (fit >= minTwinFit) {
        const entryClose = win[win.length - 1].close as number;
        const futureBars = obs.slice(i + windowBars, i + windowBars + horizonBars);
        const exitClose = futureBars[futureBars.length - 1].close as number;
        const retPct = ((exitClose - entryClose) / entryClose) * 100;
        let worstPct = 0;
        for (const fb of futureBars) {
          const lowVal =
            typeof fb.low === "number" && fb.low > 0 ? fb.low : (fb.close as number);
          const dd = ((lowVal - entryClose) / entryClose) * 100;
          if (dd < worstPct) worstPct = dd;
        }
        twins.push({
          instrumentId: ds.instrumentId,
          windowStartAt: win[0].eventAt,
          windowEndAt: win[win.length - 1].eventAt,
          patternFit: fit,
          horizonBars,
          subsequentReturnPct: Math.round(retPct * 100) / 100,
          maxAdverseExcursionPct: Math.round(worstPct * 100) / 100,
        });
        // Purge/embargo step: advance past window + horizon so samples never overlap
        i += windowBars + horizonBars;
      } else {
        i += 1;
      }
    }
  }

  twins.sort((a, b) => b.patternFit - a.patternFit || b.windowEndAt.localeCompare(a.windowEndAt));

  const n = twins.length;
  const returnsSorted = twins.map((t) => t.subsequentReturnPct).sort((a, b) => a - b);
  const maeSorted = twins.map((t) => t.maxAdverseExcursionPct).sort((a, b) => a - b);
  const positives = twins.filter((t) => t.subsequentReturnPct > 0).length;

  const sufficient = n >= MIN_GENOME_SAMPLE;
  const ci = sufficient ? wilson(positives, n) : null;

  const futurePaths: FuturePathsSummary = sufficient
    ? {
        status: "CALIBRATED_EMPIRICAL",
        horizonBars,
        sampleSize: n,
        minRequiredSample: MIN_GENOME_SAMPLE,
        positiveOutcomeRatePct: Math.round((positives / n) * 1000) / 10,
        wilson95IntervalPct: ci
          ? [Math.round(ci[0] * 1000) / 10, Math.round(ci[1] * 1000) / 10]
          : null,
        quantilesPct: {
          p10: quantile(returnsSorted, 0.1),
          p25: quantile(returnsSorted, 0.25),
          median: quantile(returnsSorted, 0.5),
          p75: quantile(returnsSorted, 0.75),
          p90: quantile(returnsSorted, 0.9),
        },
        medianMaxAdverseExcursionPct: quantile(maeSorted, 0.5),
        disclosure: `Empirical distribution across ${n} disjoint non-overlapping historical windows (${horizonBars}-bar horizon). Historical frequency is descriptive and does not guarantee future returns.`,
      }
    : {
        status: "INSUFFICIENT EVIDENCE",
        horizonBars,
        sampleSize: n,
        minRequiredSample: MIN_GENOME_SAMPLE,
        positiveOutcomeRatePct: null,
        wilson95IntervalPct: null,
        quantilesPct: null,
        medianMaxAdverseExcursionPct: null,
        disclosure: `Found ${n} non-overlapping historical twin(s); at least ${MIN_GENOME_SAMPLE} disjoint historical cases are required before displaying outcome percentages or path quantiles.`,
      };

  // Anti-Scan Skepticism Battery
  const antiScan: AntiScanCheck[] = [];

  // 1. Sample size check
  antiScan.push({
    id: "sample-size",
    title: "Disjoint Sample Adequacy",
    status: sufficient ? "PASS" : "INSUFFICIENT_DATA",
    detail: sufficient
      ? `${n} purged non-overlapping historical cases evaluated (minimum ${MIN_GENOME_SAMPLE}).`
      : `Only ${n} purged historical cases found (need >= ${MIN_GENOME_SAMPLE}). Outcome odds suppressed.`,
  });

  // 2. Transaction cost & slippage stress (+25 bps and +50 bps round-trip)
  if (sufficient) {
    const net25Pos = twins.filter((t) => t.subsequentReturnPct - 0.25 > 0).length;
    const net50Pos = twins.filter((t) => t.subsequentReturnPct - 0.5 > 0).length;
    const rawRate = (positives / n) * 100;
    const rate50 = (net50Pos / n) * 100;
    const drop = rawRate - rate50;
    antiScan.push({
      id: "cost-stress",
      title: "Fee & Slippage Sensitivity (+25 / +50 bps)",
      status: drop > 12 ? "CAUTION" : "PASS",
      detail: `Positive rate shifts from ${rawRate.toFixed(1)}% (gross) to ${((net25Pos / n) * 100).toFixed(1)}% (-25 bps) and ${rate50.toFixed(1)}% (-50 bps).`,
    });

    // 3. Chronological split-half stability (early half vs late half)
    const chrono = [...twins].sort((a, b) => a.windowEndAt.localeCompare(b.windowEndAt));
    const mid = Math.floor(chrono.length / 2);
    const earlyRate =
      (chrono.slice(0, mid).filter((t) => t.subsequentReturnPct > 0).length /
        Math.max(1, mid)) *
      100;
    const lateRate =
      (chrono.slice(mid).filter((t) => t.subsequentReturnPct > 0).length /
        Math.max(1, chrono.length - mid)) *
      100;
    const drift = Math.abs(earlyRate - lateRate);
    antiScan.push({
      id: "split-half",
      title: "Chronological Subperiod Stability",
      status: drift > 20 ? "CAUTION" : "PASS",
      detail: `Earlier half positive rate ${earlyRate.toFixed(1)}% vs later half ${lateRate.toFixed(1)}% (divergence ${drift.toFixed(1)} pp).`,
    });
  } else {
    antiScan.push({
      id: "cost-stress",
      title: "Fee & Slippage Sensitivity (+25 / +50 bps)",
      status: "INSUFFICIENT_DATA",
      detail:
        "Cannot run meaningful transaction-cost stress without >=15 non-overlapping historical cases.",
    });
    antiScan.push({
      id: "split-half",
      title: "Chronological Subperiod Stability",
      status: "INSUFFICIENT_DATA",
      detail:
        "Subperiod regime stability requires >=15 non-overlapping cases across multiple market periods.",
    });
  }

  // 4. Survivorship & Multiple-Testing Caveat (always disclosed honestly)
  antiScan.push({
    id: "survivorship-multiple-testing",
    title: "Survivorship & Multiple-Hypothesis Caveat",
    status: "CAUTION",
    detail:
      "Current datasets do not include delisted historical exchange constituents. Testing many rules on the same dataset increases false-discovery risk; treat results as hypotheses for out-of-sample auditing.",
  });

  return {
    engineVersion: "x51-soul-genome-1",
    historicalTwins: twins.slice(0, 25),
    futurePaths,
    antiScan,
    gatedModules: [
      {
        name: "Automated Multi-Exchange Motif Discovery",
        status: "GATED",
        reason:
          "Requires licensed point-in-time multi-exchange historical OHLCV database and dedicated async compute worker.",
      },
      {
        name: "Cross-Market Regime ML Forecasting",
        status: "GATED",
        reason:
          "Requires verified macro/sector licensing and out-of-sample walk-forward calibration pipeline.",
      },
    ],
  };
}
