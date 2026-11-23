import { aggregateCandles, calendarPeriodKey } from "../../../engines/chart-analytics";
import type { ScanObservation } from "../../../engines/scan";
import type { Interval } from "../data-types";
import { getIndianExchangeSession } from "./calendar";
import { MAX_DAILY_CANDLE_DAYS, type NormalizedCandleSeries } from "./types";

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<Interval, number> = { "1d": 1, "1wk": 7, "1mo": 31 };

export function brokerScanLookbackDays(interval: Interval, minimumBars?: number) {
  if (minimumBars === undefined) return 180;
  // Allow indicator warm-up and fewer than five sessions per week around holidays.
  const targetBars = minimumBars + Math.max(5, Math.ceil(minimumBars * 0.1));
  const days =
    interval === "1d"
      ? Math.ceil(targetBars * 1.55)
      : (targetBars + 2) * PERIOD_DAYS[interval];
  return Math.min(MAX_DAILY_CANDLE_DAYS, Math.max(45, days));
}

export function completedBrokerObservations(
  series: NormalizedCandleSeries,
  interval: Interval,
): ScanObservation[] {
  const retrievedAt = series.retrievalTimestampUTC;
  const retrievalMs = Date.parse(retrievedAt);
  if (!Number.isFinite(retrievalMs) || series.interval !== "1d") return [];
  const exchange = series.instrument.exchange;
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
