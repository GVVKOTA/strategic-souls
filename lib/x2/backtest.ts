/** Single-instrument, unlevered, next-open research simulation. No broker execution. */
import { compileFormula, evaluateScan, type ScanDataset } from "../x1/scan";
import {
  labelOutcome,
  type ResearchDefinition,
  type ResearchBar,
} from "./research";

export function backtestResearch(
  definition: ResearchDefinition,
  dataset: ScanDataset,
  asOf: string,
  options: {
    pointInTime: boolean;
    adjusted: boolean;
    storagePermitted: boolean;
    slippageBps?: number;
    benchmark?: { dataset: ScanDataset; verified: boolean; adjusted: boolean };
  },
) {
  const unavailable = (reason: string) => ({
    status: "DATA UNAVAILABLE" as const,
    reasons: [reason],
    trades: [] as {
      signalAt: string;
      entryAt: string;
      exitAt: string;
      entry: number;
      returnPct: number;
      label: string;
    }[],
    curve: [] as { at: string; equity: number; drawdown: number }[],
    summary: null as null | {
      trades: number;
      totalReturnPct: number;
      maxDrawdownPct: number;
      hitRatio: number | null;
      ambiguous: number;
      unresolved: number;
      turnover: number;
      benchmarkReturnPct: number | null;
      slippageBps: number;
      costBps: number;
    },
  });
  if (
    !options.pointInTime ||
    !options.adjusted ||
    !options.storagePermitted ||
    !dataset.permitted
  )
    return unavailable(
      "A research backtest requires entitled point-in-time adjusted OHLC and retention rights; retrospective current history is not eligible.",
    );
  if (dataset.observations.length > 1000)
    return unavailable(
      "Bounded simulation supports at most 1,000 observations per instrument; choose a shorter licensed window.",
    );
  const slippageBps = options.slippageBps ?? 0;
  if (
    !Number.isFinite(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 1000 ||
    !Number.isFinite(Date.parse(asOf))
  )
    throw new Error("Invalid simulation time or slippage assumption.");
  const rule = compileFormula(definition.formula),
    observations = dataset.observations;
  if (
    observations.some((o) =>
      [o.open, o.high, o.low, o.close].some(
        (v) => typeof v !== "number" || !Number.isFinite(v) || v <= 0,
      ),
    )
  )
    return unavailable(
      "Complete valid adjusted OHLC is required; missing bars are not imputed.",
    );
  const curve: { at: string; equity: number; drawdown: number }[] = [],
    trades: {
      signalAt: string;
      entryAt: string;
      exitAt: string;
      entry: number;
      returnPct: number;
      label: string;
    }[] = [];
  let equity = 1,
    peak = 1,
    maxDrawdown = 0,
    ambiguous = 0,
    unresolved = 0;
  const record = (at: string, value: number) => {
    peak = Math.max(peak, value);
    const drawdown = (value / peak - 1) * 100;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    curve.push({ at, equity: value, drawdown });
  };
  for (let i = 0; i < observations.length - 1; i++) {
    const signal = observations[i];
    if (Date.parse(signal.eventAt) > Date.parse(asOf)) break;
    if (
      evaluateScan(rule, [dataset], signal.eventAt).results[0]?.status !==
      "PASS"
    )
      continue;
    const entryIndex = i + 1,
      entryBar = observations[entryIndex];
    if (Date.parse(entryBar.eventAt) > Date.parse(asOf)) break;
    const forward = observations.slice(
      entryIndex,
      entryIndex + definition.outcome.horizon,
    );
    const labelled = labelOutcome(
      entryBar.open!,
      forward.map(
        (o) =>
          ({
            at: o.eventAt,
            knownAt: o.knownAt,
            open: o.open!,
            high: o.high!,
            low: o.low!,
            close: o.close!,
          }) as ResearchBar,
      ),
      definition.outcome,
      asOf,
    );
    if (labelled.label === "UNRESOLVED") {
      unresolved++;
      break;
    }
    if (!labelled.endAt) continue;
    const exitIndex = observations.findIndex(
      (o) => o.eventAt === labelled.endAt,
    );
    let returnPct = labelled.returnPct;
    if (labelled.label === "AMBIGUOUS") {
      ambiguous++;
      returnPct = -definition.outcome.stop - definition.outcome.costBps / 100;
    }
    if (returnPct === null) continue;
    returnPct -= slippageBps / 100;
    if (returnPct <= -100)
      return unavailable(
        "Costs/slippage and the observed gap imply insolvency for this unlevered model. Reduce position sizing/cost assumptions; no negative-capital curve is fabricated.",
      );
    const capital = equity;
    record(
      entryBar.eventAt,
      capital * (1 - (definition.outcome.costBps + slippageBps) / 20000),
    );
    for (let j = entryIndex; j < exitIndex; j++)
      record(
        observations[j].eventAt,
        capital *
          (observations[j].close! / entryBar.open! -
            (definition.outcome.costBps + slippageBps) / 20000),
      );
    equity = capital * (1 + returnPct / 100);
    record(labelled.endAt, equity);
    trades.push({
      signalAt: signal.eventAt,
      entryAt: entryBar.eventAt,
      exitAt: labelled.endAt,
      entry: entryBar.open!,
      returnPct,
      label: labelled.label,
    });
    i = exitIndex;
  }
  let benchmarkReturnPct: number | null = null;
  const benchmark = options.benchmark;
  if (
    benchmark?.verified &&
    benchmark.adjusted &&
    benchmark.dataset.permitted &&
    benchmark.dataset.currency === dataset.currency &&
    trades.length
  ) {
    const first = benchmark.dataset.observations.find(
        (o) => o.eventAt === trades[0].entryAt && o.knownAt <= asOf,
      ),
      last = benchmark.dataset.observations.find(
        (o) => o.eventAt === trades.at(-1)!.exitAt && o.knownAt <= asOf,
      );
    if (first?.open && last?.close)
      benchmarkReturnPct = (last.close / first.open - 1) * 100;
  }
  return {
    status: "RESEARCH BACKTEST" as const,
    reasons: [
      "Hypothetical unlevered long-only next-observation-open entry after a known signal. No overlapping positions. Complete adjusted OHLC and point-in-time features are required.",
      "When both barriers touch one bar, the curve uses a labelled conservative stop-first scenario; ambiguous events remain excluded from probability evidence.",
      "Drawdown uses available closes and modelled exits, not unknown intrabar paths. Costs/slippage are user assumptions, never observed fills. Survivorship/corporate-action quality still depends on the licensed universe.",
    ],
    trades,
    curve,
    summary: {
      trades: trades.length,
      totalReturnPct: (equity - 1) * 100,
      maxDrawdownPct: maxDrawdown,
      hitRatio: trades.length
        ? trades.filter((t) => t.returnPct > 0).length / trades.length
        : null,
      ambiguous,
      unresolved,
      turnover: trades.length * 2,
      benchmarkReturnPct,
      slippageBps,
      costBps: definition.outcome.costBps,
    },
  };
}
