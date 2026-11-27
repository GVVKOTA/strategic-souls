/**
 * Strategic Souls X 3.0 — Authoritative 5-Timeframe & History Window Engine (Contract E).
 *
 * New scan UI intervals:
 *   - 30m -> 7 calendar days (1 week)
 *   - 1h  -> 14 calendar days (2 weeks)
 *   - 3h  -> 1 calendar month (derived from completed 1h bars, session-anchored)
 *   - 6h  -> 2 calendar months (derived from completed 1h bars, session-anchored)
 *   - 1d (24H) -> 12 calendar months (completed daily sessions)
 *
 * Legacy intervals (`1wk`, `1mo`) remain supported for reading/replaying archived research
 * without being reinterpreted as daily or offered as new scan choices.
 */
import type { ScanObservation } from "../../engines/scan";
import type { Candle, Interval } from "./data-types";
import {
  getExchangeSessionWindowMinutes,
  getIstDateAndMinutes,
  type ExchangeCode,
} from "./exchange-calendar";

export type ActiveScanInterval = "30m" | "1h" | "3h" | "6h" | "1d";
export type NativeHistoryInterval = "30m" | "1h" | "1d";

export const ACTIVE_SCAN_INTERVALS: readonly ActiveScanInterval[] = Object.freeze([
  "30m",
  "1h",
  "3h",
  "6h",
  "1d",
]);

export const ALL_SUPPORTED_INTERVALS: readonly Interval[] = Object.freeze([
  "30m",
  "1h",
  "3h",
  "6h",
  "1d",
  "1wk",
  "1mo",
]);

export const SCAN_TIMEFRAME_SPEC: Readonly<
  Record<
    ActiveScanInterval,
    {
      id: ActiveScanInterval;
      displayLabel: string;
      shortLabel: string;
      windowLabel: string;
      nativeSource: NativeHistoryInterval;
      calendarDays?: number;
      calendarMonths?: number;
    }
  >
> = Object.freeze({
  "30m": {
    id: "30m",
    displayLabel: "30m",
    shortLabel: "30m",
    windowLabel: "1 week (7 calendar days)",
    nativeSource: "30m",
    calendarDays: 7,
  },
  "1h": {
    id: "1h",
    displayLabel: "1H",
    shortLabel: "1H",
    windowLabel: "2 weeks (14 calendar days)",
    nativeSource: "1h",
    calendarDays: 14,
  },
  "3h": {
    id: "3h",
    displayLabel: "3H",
    shortLabel: "3H",
    windowLabel: "1 calendar month",
    nativeSource: "1h",
    calendarMonths: 1,
  },
  "6h": {
    id: "6h",
    displayLabel: "6H",
    shortLabel: "6H",
    windowLabel: "2 calendar months",
    nativeSource: "1h",
    calendarMonths: 2,
  },
  "1d": {
    id: "1d",
    displayLabel: "24H",
    shortLabel: "24H",
    windowLabel: "12 calendar months",
    nativeSource: "1d",
    calendarMonths: 12,
  },
});

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/**
 * Normalizes user/API interval tokens cleanly (e.g. "24H"/"24h" -> "1d", "3H" -> "3h").
 * Returns null for unrecognized values so callers fail closed rather than silently defaulting to daily.
 */
export function normalizeIntervalInput(raw: unknown): Interval | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim().toLowerCase();
  switch (token) {
    case "30m":
      return "30m";
    case "1h":
      return "1h";
    case "3h":
      return "3h";
    case "6h":
      return "6h";
    case "1d":
    case "24h":
    case "daily":
      return "1d";
    case "1wk":
      return "1wk";
    case "1mo":
      return "1mo";
    default:
      return null;
  }
}

export function isIntradayInterval(interval: Interval): boolean {
  return interval === "30m" || interval === "1h" || interval === "3h" || interval === "6h";
}

/**
 * Exhaustive mapping from logical interval to native storage/fetch interval.
 * Never falls back silently to "1d" on unknown values.
 */
export function resolveNativeInterval(interval: Interval): NativeHistoryInterval {
  switch (interval) {
    case "30m":
      return "30m";
    case "1h":
    case "3h":
    case "6h":
      return "1h";
    case "1d":
    case "1wk":
    case "1mo":
      return "1d";
    default: {
      const exhaustive: never = interval;
      throw new Error(`Unsupported market-data interval: ${String(exhaustive)}`);
    }
  }
}

/**
 * Subtracts `months` calendar months in UTC with end-of-month clamping
 * (e.g., 2026-03-31 minus 1 month -> 2026-02-28; 2024-03-31 minus 1 month -> 2024-02-29).
 */
export function subtractCalendarMonthsClamped(utcMs: number, months: number): number {
  const d = new Date(utcMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const ss = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  const totalMonths = year * 12 + month - months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  // Day 0 of targetMonth + 1 gives last valid day of targetMonth
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return Date.UTC(targetYear, targetMonth, clampedDay, hh, mm, ss, ms);
}

export type HistoryWindowBounds = {
  interval: Interval;
  nativeInterval: NativeHistoryInterval;
  cutoffMs: number;
  cutoffIso: string;
  startMs: number;
  startIso: string;
  policyLabel: string;
  calendarDaysApprox: number;
};

/**
 * Computes deterministic history window boundaries anchored to a pinned scan cutoff.
 * Complexity: O(1).
 */
export function historyWindowForInterval(
  interval: Interval,
  cutoffMs: number,
): HistoryWindowBounds {
  const native = resolveNativeInterval(interval);
  let startMs: number;
  let policyLabel: string;

  switch (interval) {
    case "30m":
      startMs = cutoffMs - 7 * DAY_MS;
      policyLabel = "30m · 7 calendar days";
      break;
    case "1h":
      startMs = cutoffMs - 14 * DAY_MS;
      policyLabel = "1H · 14 calendar days";
      break;
    case "3h":
      startMs = subtractCalendarMonthsClamped(cutoffMs, 1);
      policyLabel = "3H · 1 calendar month";
      break;
    case "6h":
      startMs = subtractCalendarMonthsClamped(cutoffMs, 2);
      policyLabel = "6H · 2 calendar months";
      break;
    case "1d":
      startMs = subtractCalendarMonthsClamped(cutoffMs, 12);
      policyLabel = "24H (Daily) · 12 calendar months";
      break;
    case "1wk":
      startMs = subtractCalendarMonthsClamped(cutoffMs, 36);
      policyLabel = "Weekly (archived compatibility) · 36 calendar months";
      break;
    case "1mo":
      startMs = subtractCalendarMonthsClamped(cutoffMs, 120);
      policyLabel = "Monthly (archived compatibility) · 120 calendar months";
      break;
  }

  return {
    interval,
    nativeInterval: native,
    cutoffMs,
    cutoffIso: new Date(cutoffMs).toISOString(),
    startMs,
    startIso: new Date(startMs).toISOString(),
    policyLabel,
    calendarDaysApprox: Math.max(1, Math.round((cutoffMs - startMs) / DAY_MS)),
  };
}

function isValidOhlcvBar(bar: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}): boolean {
  if (
    !Number.isFinite(bar.open) ||
    !Number.isFinite(bar.high) ||
    !Number.isFinite(bar.low) ||
    !Number.isFinite(bar.close) ||
    bar.open <= 0 ||
    bar.high <= 0 ||
    bar.low <= 0 ||
    bar.close <= 0
  ) {
    return false;
  }
  if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) {
    return false;
  }
  if (bar.volume !== null && bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0)) {
    return false;
  }
  return true;
}

export type IntradayAggregationResult<T> = {
  bars: T[];
  excludedIncompleteBuckets: number;
  excludedOutOfSessionBars: number;
};

/**
 * Deterministically aggregates completed native 1h candles into session-anchored 3h or 6h candles.
 *
 * Policy (Contract E):
 * - Never aggregates across exchange trading sessions.
 * - Never pads gaps or includes an unfinished bucket at `cutoffMs`.
 * - Requires all `bucketHours` (3 for 3h, 6 for 6h) consecutive completed 1h bars within the
 *   session bucket; short end-of-session stubs (e.g., NSE 15:15–15:30 15-min bar) and buckets
 *   with missing source bars are omitted and counted in `excludedIncompleteBuckets`.
 * - Volume sums ONLY when every constituent bar provides a valid non-null volume; otherwise `null`.
 *
 * Complexity: O(N log N) due to timestamp sort where N = input 1h bars.
 */
export function aggregateIntradayCandles(
  hourlyBars: readonly Candle[],
  targetInterval: "3h" | "6h",
  exchange: ExchangeCode | "GLOBAL",
  cutoffMs: number,
): IntradayAggregationResult<Candle> {
  const bucketHours = targetInterval === "3h" ? 3 : 6;
  const bucketMinutes = bucketHours * 60;

  type ParsedHourly = {
    startMs: number;
    closeMs: number;
    bucketKey: string;
    slotIndex: number;
    bar: Candle;
  };

  const dedup = new Map<number, Candle>();
  const duplicates = new Set<number>();
  let excludedOutOfSessionBars = 0;

  for (const bar of hourlyBars) {
    if (!bar.date.includes("T") || !isValidOhlcvBar(bar)) {
      excludedOutOfSessionBars++;
      continue;
    }
    const startMs = Date.parse(bar.date);
    if (!Number.isFinite(startMs) || startMs >= cutoffMs) {
      excludedOutOfSessionBars++;
      continue;
    }
    if (dedup.has(startMs)) duplicates.add(startMs);
    dedup.set(startMs, bar);
  }
  for (const dup of duplicates) dedup.delete(dup);

  const buckets = new Map<string, ParsedHourly[]>();

  for (const [startMs, bar] of [...dedup.entries()].sort((a, b) => a[0] - b[0])) {
    let bucketKey: string;
    let slotIndex: number;
    let closeMs: number;

    if (exchange === "NSE" || exchange === "BSE" || exchange === "MCX") {
      const { dateIST, minutesIST } = getIstDateAndMinutes(startMs);
      const session = getExchangeSessionWindowMinutes(exchange, dateIST);
      if (!session || minutesIST < session.openMinutes || minutesIST >= session.closeMinutes) {
        excludedOutOfSessionBars++;
        continue;
      }
      const offsetMin = minutesIST - session.openMinutes;
      if (offsetMin % 60 !== 0) {
        excludedOutOfSessionBars++;
        continue;
      }
      const remainingMin = session.closeMinutes - minutesIST;
      if (remainingMin < 60) {
        // Short terminal bar (< 60m, e.g. NSE 15:15–15:30) is excluded from full 3h/6h buckets.
        excludedOutOfSessionBars++;
        continue;
      }
      const bucketIdx = Math.floor(offsetMin / bucketMinutes);
      // Ensure the full bucket fits within the scheduled trading session
      if (session.openMinutes + (bucketIdx + 1) * bucketMinutes > session.closeMinutes) {
        excludedOutOfSessionBars++;
        continue;
      }
      slotIndex = Math.floor((offsetMin % bucketMinutes) / 60);
      closeMs = startMs + HOUR_MS;
      if (closeMs > cutoffMs) continue;
      bucketKey = `${exchange}:${dateIST}:b${bucketIdx}`;
    } else {
      // Continuous / GLOBAL UTC session-aligned buckets (00, 03, 06... or 00, 06, 12, 18)
      const d = new Date(startMs);
      if (d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0) {
        excludedOutOfSessionBars++;
        continue;
      }
      const utcDay = d.toISOString().slice(0, 10);
      const hour = d.getUTCHours();
      const bucketIdx = Math.floor(hour / bucketHours);
      slotIndex = hour % bucketHours;
      closeMs = startMs + HOUR_MS;
      if (closeMs > cutoffMs) continue;
      bucketKey = `GLOBAL:${utcDay}:b${bucketIdx}`;
    }

    const list = buckets.get(bucketKey) ?? [];
    list.push({ startMs, closeMs, bucketKey, slotIndex, bar });
    buckets.set(bucketKey, list);
  }

  const out: Candle[] = [];
  let excludedIncompleteBuckets = 0;

  for (const entries of buckets.values()) {
    entries.sort((a, b) => a.startMs - b.startMs);
    // Verify exact contiguous slots 0..bucketHours-1 with zero missing bars
    const complete =
      entries.length === bucketHours &&
      entries.every((e, idx) => e.slotIndex === idx) &&
      entries[entries.length - 1].closeMs <= cutoffMs;
    if (!complete) {
      excludedIncompleteBuckets++;
      continue;
    }
    const first = entries[0].bar;
    const last = entries[entries.length - 1].bar;
    const allHaveVolume = entries.every((e) => e.bar.volume !== null);
    const knownAt = entries
      .map((e) => e.bar.knownAt)
      .sort()
      .at(-1)!;
    out.push({
      date: first.date,
      open: first.open,
      high: Math.max(...entries.map((e) => e.bar.high)),
      low: Math.min(...entries.map((e) => e.bar.low)),
      close: last.close,
      adjustedClose: last.adjustedClose,
      volume: allHaveVolume
        ? entries.reduce((sum, e) => sum + (e.bar.volume ?? 0), 0)
        : null,
      openInterest: last.openInterest,
      knownAt,
      adjustment: last.adjustment,
      provider: last.provider,
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return {
    bars: out,
    excludedIncompleteBuckets,
    excludedOutOfSessionBars,
  };
}

/**
 * Aggregates completed 1h ScanObservations into session-anchored 3h or 6h ScanObservations.
 */
export function aggregateIntradayObservations(
  hourlyObservations: readonly ScanObservation[],
  targetInterval: "3h" | "6h",
  exchange: ExchangeCode | "GLOBAL",
  cutoffMs: number,
): IntradayAggregationResult<ScanObservation> {
  const asCandles: Candle[] = [];
  for (const o of hourlyObservations) {
    if (typeof o.close !== "number" || !Number.isFinite(o.close)) continue;
    const close = o.close;
    asCandles.push({
      date: o.eventAt,
      open: typeof o.open === "number" && Number.isFinite(o.open) ? o.open : close,
      high: typeof o.high === "number" && Number.isFinite(o.high) ? o.high : close,
      low: typeof o.low === "number" && Number.isFinite(o.low) ? o.low : close,
      close,
      adjustedClose: null,
      volume: typeof o.volume === "number" && Number.isFinite(o.volume) ? o.volume : null,
      openInterest:
        typeof o.fields?.openinterest === "number" && Number.isFinite(o.fields.openinterest)
          ? o.fields.openinterest
          : null,
      knownAt: o.knownAt,
      adjustment: "RAW",
      provider: "AGGREGATED",
    });
  }
  const agg = aggregateIntradayCandles(asCandles, targetInterval, exchange, cutoffMs);
  return {
    bars: agg.bars.map((c) => ({
      eventAt: c.date,
      knownAt: c.knownAt,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      fields: { openinterest: c.openInterest },
    })),
    excludedIncompleteBuckets: agg.excludedIncompleteBuckets,
    excludedOutOfSessionBars: agg.excludedOutOfSessionBars,
  };
}

/**
 * Filters sorted observations to the documented history window `[startMs, cutoffMs]`.
 * Never silently extends the window beyond the policy bounds.
 */
export function sliceObservationsToHistoryWindow(
  observations: readonly ScanObservation[],
  interval: Interval,
  cutoffMs: number,
): {
  observations: ScanObservation[];
  window: HistoryWindowBounds;
  droppedBeforeWindow: number;
  droppedAfterCutoff: number;
} {
  const window = historyWindowForInterval(interval, cutoffMs);
  const kept: ScanObservation[] = [];
  let droppedBeforeWindow = 0;
  let droppedAfterCutoff = 0;

  for (const obs of observations) {
    const ts = Date.parse(obs.eventAt);
    if (!Number.isFinite(ts)) continue;
    if (ts > cutoffMs) {
      droppedAfterCutoff++;
      continue;
    }
    if (ts < window.startMs) {
      droppedBeforeWindow++;
      continue;
    }
    kept.push(obs);
  }
  return { observations: kept, window, droppedBeforeWindow, droppedAfterCutoff };
}

export function validateWarmupCoverage(
  availableBars: number,
  requiredBars: number,
  interval: Interval,
): {
  sufficient: boolean;
  availableBars: number;
  requiredBars: number;
  reason: string | null;
} {
  const sufficient = availableBars >= requiredBars;
  const spec =
    interval in SCAN_TIMEFRAME_SPEC
      ? SCAN_TIMEFRAME_SPEC[interval as ActiveScanInterval]
      : null;
  return {
    sufficient,
    availableBars,
    requiredBars,
    reason: sufficient
      ? null
      : `Formula requires ${requiredBars} completed ${spec?.displayLabel ?? interval} bars, but only ${availableBars} completed bars exist within the ${spec?.windowLabel ?? interval} history window.`,
  };
}

/** Returns intraday bar duration in minutes for NSE/BSE/MCX session calculations. */
export function intervalMinutes(interval: "30m" | "1h" | "3h" | "6h"): number {
  switch (interval) {
    case "30m":
      return 30;
    case "1h":
      return 60;
    case "3h":
      return 180;
    case "6h":
      return 360;
  }
}

export function isMinuteAligned(ms: number): boolean {
  return ms % MINUTE_MS === 0;
}
