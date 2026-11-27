import type { ScanObservation } from "../../engines/scan";
import type { Candle, Interval } from "./data-types";
import { getExchangeSessionWindowMinutes, getIstDateAndMinutes, type ExchangeCode } from "./exchange-calendar";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const HALF_HOUR_MS = 1_800_000;
const MINUTE_MS = 60_000;
const PERIOD_DAYS: Record<Interval, number> = {
  "30m": 1,
  "1h": 1,
  "3h": 1,
  "6h": 1,
  "1d": 1,
  "1wk": 7,
  "1mo": 31,
};

function validOhlcv(c: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}): boolean {
  if (
    !Number.isFinite(c.open) ||
    !Number.isFinite(c.high) ||
    !Number.isFinite(c.low) ||
    !Number.isFinite(c.close) ||
    c.open <= 0 ||
    c.high <= 0 ||
    c.low <= 0 ||
    c.close <= 0
  ) {
    return false;
  }
  if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.low > c.high) {
    return false;
  }
  if (c.volume !== null && c.volume !== undefined && (!Number.isFinite(c.volume) || c.volume < 0)) {
    return false;
  }
  return true;
}

/**
 * Computes the completion instant (UTC ms) for a genuine intraday bar (`30m` or `1h`) starting at `startMs`
 * on an Indian exchange (`NSE`, `BSE`, or `MCX`).
 * - NSE / BSE regular session: 09:15–15:30 IST. Terminal 15:15 IST bar completes cleanly at 15:30 IST (15 minutes).
 * - MCX regular session: 09:00–23:30/23:55 IST (DST & partial-holiday aware via the exchange calendar).
 *   The terminal bar completes cleanly at the scheduled session close.
 * Returns null if the bar falls outside regular scheduled trading hours (e.g., weekend/holiday/stray tick).
 */
export function intradayBarCloseMs(
  exchange: ExchangeCode,
  startMs: number,
  interval: "30m" | "1h",
): number | null {
  const { dateIST, minutesIST } = getIstDateAndMinutes(startMs);
  const window = getExchangeSessionWindowMinutes(exchange, dateIST);
  if (!window) return null;
  if (minutesIST < window.openMinutes || minutesIST >= window.closeMinutes) {
    return null;
  }
  const remainingMinutes = window.closeMinutes - minutesIST;
  const maxBarMs = interval === "30m" ? HALF_HOUR_MS : HOUR_MS;
  const barDurationMs = Math.min(maxBarMs, remainingMinutes * MINUTE_MS);
  return startMs + barDurationMs;
}

export function hourlyBarCloseMs(
  exchange: ExchangeCode,
  startMs: number,
): number | null {
  return intradayBarCloseMs(exchange, startMs, "1h");
}

export function thirtyMinBarCloseMs(
  exchange: ExchangeCode,
  startMs: number,
): number | null {
  return intradayBarCloseMs(exchange, startMs, "30m");
}

/**
 * Filters and validates genuine intraday (`30m` or `1h`) candles from a commercial shared feed
 * without ever synthesizing intraday bars from daily candles or forward-filling gaps.
 */
export function completedCommercialIntradayObservations(
  candles: readonly Candle[],
  exchange: ExchangeCode | "GLOBAL",
  retrievalIso: string,
  interval: "30m" | "1h" = "1h",
): ScanObservation[] {
  const retrievalMs = Date.parse(retrievalIso);
  if (!Number.isFinite(retrievalMs)) return [];
  const stepMs = interval === "30m" ? HALF_HOUR_MS : HOUR_MS;
  const byTs = new Map<number, Candle>();
  const duplicates = new Set<number>();
  for (const c of candles) {
    // Reject date-only strings strictly: genuine intraday bars must carry an explicit timestamp.
    if (!c.date.includes("T") || !validOhlcv(c)) continue;
    const startMs = Date.parse(c.date);
    if (!Number.isFinite(startMs) || startMs > retrievalMs) continue;
    let closeMs: number;
    if (exchange === "NSE" || exchange === "BSE" || exchange === "MCX") {
      const computed = intradayBarCloseMs(exchange, startMs, interval);
      if (computed === null) continue;
      closeMs = computed;
    } else {
      closeMs = startMs + stepMs;
    }
    // Never include developing/in-progress intraday candle.
    if (closeMs > retrievalMs) continue;
    if (byTs.has(startMs)) duplicates.add(startMs);
    byTs.set(startMs, c);
  }
  for (const ts of duplicates) byTs.delete(ts);
  return [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMs, c]) => ({
      eventAt: new Date(startMs).toISOString(),
      knownAt: c.knownAt || retrievalIso,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      fields: { openinterest: c.openInterest },
    }));
}

// Grouped observations retain their last constituent's timestamp.
export const scanFreshnessMs = (interval: Interval) =>
  (PERIOD_DAYS[interval] + 4) * DAY_MS;
