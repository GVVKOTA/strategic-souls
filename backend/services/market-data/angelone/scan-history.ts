import { aggregateCandles, calendarPeriodKey } from "../../../engines/chart-analytics";
import type { ScanObservation } from "../../../engines/scan";
import type { Candle, Interval } from "../data-types";
import {
  getExchangeSessionWindowMinutes,
  getIndianExchangeSession,
  getIstDateAndMinutes,
} from "./calendar";
import {
  MAX_DAILY_CANDLE_DAYS,
  MAX_HOURLY_CANDLE_DAYS,
  type ExchangeCode,
  type NormalizedCandleSeries,
} from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const PERIOD_DAYS: Record<Interval, number> = {
  "1h": 1,
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

export function brokerScanLookbackDays(interval: Interval, minimumBars?: number) {
  if (interval === "1h") {
    const reqBars = minimumBars === undefined ? 120 : minimumBars;
    // NSE/BSE produces 7 hourly bars per trading day (6 full 60m + 15m terminal 15:15-15:30 IST).
    // Reserve buffer for indicator warm-up, weekends, and Indian exchange holidays, capped by provider 1h limit.
    const targetBars = reqBars + Math.max(12, Math.ceil(reqBars * 0.15));
    const tradingDays = Math.ceil(targetBars / 6);
    const calendarDays = Math.ceil(tradingDays * 1.65) + 4;
    return Math.min(MAX_HOURLY_CANDLE_DAYS, Math.max(14, calendarDays));
  }
  if (minimumBars === undefined) return 180;
  // Allow indicator warm-up and fewer than five sessions per week around holidays.
  const targetBars = minimumBars + Math.max(5, Math.ceil(minimumBars * 0.1));
  const days =
    interval === "1d"
      ? Math.ceil(targetBars * 1.55)
      : (targetBars + 2) * PERIOD_DAYS[interval];
  return Math.min(MAX_DAILY_CANDLE_DAYS, Math.max(45, days));
}

/**
 * Computes the completion instant (UTC ms) for a genuine 1-hour bar starting at `startMs`
 * on an Indian exchange (`NSE`, `BSE`, or `MCX`).
 * - NSE / BSE regular session: 09:15–15:30 IST. Bars starting 09:15..14:15 last 60 minutes;
 *   the terminal 15:15 IST bar completes cleanly at 15:30 IST (15 minutes).
 * - MCX regular session: 09:00–23:30/23:55 IST (DST & partial-holiday aware via calendar.ts).
 *   The terminal bar completes cleanly at the scheduled session close.
 * Returns null if the bar falls outside regular scheduled trading hours (e.g., weekend/holiday/stray tick).
 */
export function hourlyBarCloseMs(
  exchange: ExchangeCode,
  startMs: number,
): number | null {
  const { dateIST, minutesIST } = getIstDateAndMinutes(startMs);
  const window = getExchangeSessionWindowMinutes(exchange, dateIST);
  if (!window) return null;
  if (minutesIST < window.openMinutes || minutesIST >= window.closeMinutes) {
    return null;
  }
  const remainingMinutes = window.closeMinutes - minutesIST;
  const barDurationMs = Math.min(HOUR_MS, remainingMinutes * MINUTE_MS);
  return startMs + barDurationMs;
}

/**
 * Filters and validates genuine 1-hour candles from a commercial shared feed (`TrueData` / `EODHD`)
 * without ever synthesizing 1h bars from daily candles or forward-filling gaps.
 */
export function completedCommercialIntradayObservations(
  candles: readonly Candle[],
  exchange: ExchangeCode | "GLOBAL",
  retrievalIso: string,
): ScanObservation[] {
  const retrievalMs = Date.parse(retrievalIso);
  if (!Number.isFinite(retrievalMs)) return [];
  const byTs = new Map<number, Candle>();
  const duplicates = new Set<number>();
  for (const c of candles) {
    // Reject date-only strings strictly: genuine 1h bars must carry an explicit intraday timestamp.
    if (!c.date.includes("T") || !validOhlcv(c)) continue;
    const startMs = Date.parse(c.date);
    if (!Number.isFinite(startMs) || startMs > retrievalMs) continue;
    let closeMs: number;
    if (exchange === "NSE" || exchange === "BSE" || exchange === "MCX") {
      const computed = hourlyBarCloseMs(exchange, startMs);
      if (computed === null) continue;
      closeMs = computed;
    } else {
      closeMs = startMs + HOUR_MS;
    }
    // Never include developing/in-progress hourly candle.
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

export function completedBrokerObservations(
  series: NormalizedCandleSeries,
  interval: Interval,
): ScanObservation[] {
  const retrievedAt = series.retrievalTimestampUTC;
  const retrievalMs = Date.parse(retrievedAt);
  if (!Number.isFinite(retrievalMs)) return [];
  const exchange = series.instrument.exchange;

  // Genuine 1 Hour (60-minute) candles — NEVER synthesized from daily bars.
  if (interval === "1h") {
    if (series.interval !== "1h") return [];
    const byTs = new Map<number, (typeof series.candles)[number]>();
    const duplicates = new Set<number>();
    for (const candle of series.candles) {
      if (!validOhlcv(candle)) continue;
      const startMs = Date.parse(candle.timestampUTC);
      if (!Number.isFinite(startMs) || startMs > retrievalMs) continue;
      const closeMs = hourlyBarCloseMs(exchange, startMs);
      // Exclude out-of-session stray bars and developing current hourly bar.
      if (closeMs === null || closeMs > retrievalMs) continue;
      if (byTs.has(startMs)) duplicates.add(startMs);
      byTs.set(startMs, candle);
    }
    for (const ts of duplicates) byTs.delete(ts);
    return [...byTs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => ({
        eventAt: c.timestampUTC,
        knownAt: retrievedAt,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        fields: { openinterest: c.openInterest },
      }));
  }

  if (series.interval !== "1d") return [];
  const session = getIndianExchangeSession(exchange, retrievalMs);
  const today = session.localDateIST;
  const weekday = new Date(today).getUTCDay();
  // For shortened MCX sessions, wait until the latest possible close.
  const close = exchange === "MCX" ? "23:55:00" : "15:30:00";
  const todayClosed =
    session.state === "CLOSED" &&
    !session.specialSessionNote &&
    weekday > 0 &&
    weekday < 6 &&
    session.localTimeIST >= close;
  const periodKey = (date: string) =>
    interval === "1d" ? date : calendarPeriodKey(date, interval);
  const latestPeriod = periodKey(today);
  const byDate = new Map<string, (typeof series.candles)[number]>();
  const duplicates = new Set<string>();
  for (const candle of series.candles) {
    if (!validOhlcv(candle)) continue;
    const timestamp = Date.parse(candle.timestampUTC);
    if (
      !Number.isFinite(timestamp) ||
      timestamp > retrievalMs ||
      candle.dateIST > today ||
      (candle.dateIST === today && !todayClosed) ||
      (interval !== "1d" && periodKey(candle.dateIST) === latestPeriod)
    ) {
      continue;
    }
    if (byDate.has(candle.dateIST)) duplicates.add(candle.dateIST);
    byDate.set(candle.dateIST, candle);
  }
  for (const date of duplicates) byDate.delete(date);
  const rows = [...byDate.values()].sort((a, b) => a.dateIST.localeCompare(b.dateIST));
  const first = rows[0];
  if (!first) return [];
  // The left edge of the response may begin partway through a week or month.
  const initialPeriod = periodKey(first.dateIST);
  const daily = interval === "1d"
    ? rows
    : rows.filter((row) => periodKey(row.dateIST) !== initialPeriod);
  const lastTimestampByPeriod = new Map(
    daily.map((row) => [periodKey(row.dateIST), row.timestampUTC]),
  );
  const aggregated = aggregateCandles(
    daily.map((c) => ({
      ...c,
      date: c.dateIST,
      knownAt: retrievedAt,
      adjustedClose: null,
    })),
    interval,
  );
  return aggregated.map((c) => ({
    eventAt: lastTimestampByPeriod.get(periodKey(c.date))!,
    knownAt: retrievedAt,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    fields: { openinterest: c.openInterest },
  }));
}

// Grouped observations retain their last constituent's timestamp.
export const brokerScanFreshnessMs = (interval: Interval) =>
  (PERIOD_DAYS[interval] + 4) * DAY_MS;
