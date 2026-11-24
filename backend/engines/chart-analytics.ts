import type {
  Candle,
  Reference,
  Interval,
  Fundamental,
  AssetResearch,
} from "../services/market-data/data-types";
export function canShowDerived(asset: AssetResearch | null) {
  return (
    asset?.capabilities.analysis === true &&
    asset.capabilities.derivedDisplay === true
  );
}
/** Shared client gate: display-only permissions do not execute or reveal calculations. */
export function assetAnalytics(asset: AssetResearch | null) {
  const empty = {
    SMA20: [] as (number | null)[],
    EMA20: [] as (number | null)[],
    RSI14: [] as (number | null)[],
    MACD: [] as (number | null)[],
    BB20: [] as (number | null)[],
    BBUP: [] as (number | null)[],
    BBLOW: [] as (number | null)[],
    ATR14: [] as (number | null)[],
    DRAWDOWN: [] as (number | null)[],
  };
  if (!canShowDerived(asset) || !asset) return empty;
  const closes = asset.references.map((p) => p.close),
    bb = bollinger(closes),
    mc = macd(closes);
  return {
    SMA20: sma(closes, 20),
    EMA20: ema(closes, 20),
    RSI14: rsi(closes),
    MACD: mc.line,
    BB20: bb.middle,
    BBUP: bb.upper,
    BBLOW: bb.lower,
    ATR14: atr(asset.candles),
    DRAWDOWN: drawdown(closes),
  };
}
type Values = (number | null)[];
const valid = (x: number | null): x is number =>
  x !== null && Number.isFinite(x);
export function sma(values: Values, n: number): Values {
  if (!Number.isInteger(n) || n < 1)
    throw new Error("Positive integer period required.");
  return values.map((_, i) => {
    const a = values.slice(i - n + 1, i + 1);
    return i < n - 1 || a.length !== n || !a.every(valid)
      ? null
      : a.reduce((s, v) => s + v, 0) / n;
  });
}
export function ema(values: Values, n: number): Values {
  const seed = sma(values, n);
  let previous: number | null = null;
  return values.map((v, i) => {
    if (!valid(v)) {
      previous = null;
      return null;
    }
    if (previous === null) {
      previous = seed[i];
      return previous;
    }
    previous = (v * 2) / (n + 1) + previous * (1 - 2 / (n + 1));
    return previous;
  });
}
export function rsi(values: Values, n = 14): Values {
  const out: Values = values.map(() => null);
  let gain = 0,
    loss = 0;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1],
      b = values[i];
    if (!valid(a) || !valid(b)) return out;
    const change = b - a;
    if (i <= n) {
      gain += Math.max(change, 0) / n;
      loss += Math.max(-change, 0) / n;
    } else {
      gain = (gain * (n - 1) + Math.max(change, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-change, 0)) / n;
    }
    if (i >= n)
      out[i] =
        gain === 0 && loss === 0
          ? 50
          : loss === 0
            ? 100
            : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
export function bollinger(values: Values, n = 20, k = 2) {
  const middle = sma(values, n);
  return {
    middle,
    upper: middle.map((m, i) =>
      m === null
        ? null
        : m +
          k *
            Math.sqrt(
              values
                .slice(i - n + 1, i + 1)
                .reduce<number>((s, v) => s + ((v as number) - m) ** 2, 0) / n,
            ),
    ),
    lower: middle.map((m, i) =>
      m === null
        ? null
        : m -
          k *
            Math.sqrt(
              values
                .slice(i - n + 1, i + 1)
                .reduce<number>((s, v) => s + ((v as number) - m) ** 2, 0) / n,
            ),
    ),
  };
}
export function macd(values: Values) {
  const a = ema(values, 12),
    b = ema(values, 26),
    line = a.map((v, i) => (v === null || b[i] === null ? null : v - b[i]!));
  const signal = ema(line, 9);
  return {
    line,
    signal,
    histogram: line.map((v, i) =>
      v === null || signal[i] === null ? null : v - signal[i]!,
    ),
  };
}
export function atr(candles: Candle[], n = 14): Values {
  const trueRange = candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(
          c.high - c.low,
          Math.abs(c.high - candles[i - 1].close),
          Math.abs(c.low - candles[i - 1].close),
        ),
  );
  let prev: number | null = null;
  return trueRange.map((v, i) => {
    if (i < n - 1) return null;
    if (prev === null)
      prev = trueRange.slice(0, n).reduce((s, x) => s + x, 0) / n;
    else prev = (prev * (n - 1) + v) / n;
    return prev;
  });
}
/** Session VWAP requires actual intraday OHLCV and an explicit timezone/session date. */
export function vwap(candles: Candle[], intraday = false): Values {
  if (!intraday) return candles.map(() => null);
  let date = "",
    pv = 0,
    volume = 0;
  return candles.map((c) => {
    const day = c.date.slice(0, 10);
    if (day !== date) {
      date = day;
      pv = 0;
      volume = 0;
    }
    if (c.volume === null || c.volume < 0) return null;
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    volume += c.volume;
    return volume > 0 ? pv / volume : null;
  });
}
export function drawdown(values: Values): Values {
  let peak = -Infinity;
  return values.map((v) => {
    if (!valid(v) || v <= 0) return null;
    peak = Math.max(peak, v);
    return (v / peak - 1) * 100;
  });
}
export function relativeStrength(a: Reference[], b: Reference[]): Reference[] {
  const map = new Map(b.map((x) => [x.date, x.close]));
  return a.flatMap((x) => {
    const v = map.get(x.date);
    return v && v > 0 ? [{ ...x, close: x.close / v }] : [];
  });
}
/** Same-date normalized price context; this neither FX-converts nor invents total-return adjustments. */
export function normalizedComparison(a: Reference[], b: Reference[]) {
  const peer = new Map(b.map((p) => [p.date, p.close]));
  const matched = a.flatMap((p) => {
    const q = peer.get(p.date);
    return q !== undefined && Number.isFinite(q) && p.close > 0 && q > 0
      ? [{ date: p.date, left: p.close, right: q }]
      : [];
  });
  const first = matched[0];
  return first
    ? matched.map((p) => ({
        date: p.date,
        left: (p.left / first.left) * 100,
        right: (p.right / first.right) * 100,
      }))
    : [];
}
export function calendarPeriodKey(
  date: string,
  interval: Exclude<Interval, "1d" | "1h" | "30m">,
) {
  if (interval === "1mo") return date.slice(0, 7);
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function aggregateReferences(
  rows: Reference[],
  interval: Interval,
): Reference[] {
  if (interval === "1d" || interval === "1h" || interval === "30m") return rows;
  const groups = new Map<string, Reference>();
  for (const row of rows) groups.set(calendarPeriodKey(row.date, interval), row);
  return [...groups.values()];
}
export function aggregateCandles(rows: Candle[], interval: Interval): Candle[] {
  if (interval === "1d" || interval === "1h" || interval === "30m") return rows;
  const groups = new Map<string, Candle[]>();
  for (const row of rows) {
    const key = calendarPeriodKey(row.date, interval);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map((g) => ({
    ...g[0],
    high: Math.max(...g.map((c) => c.high)),
    low: Math.min(...g.map((c) => c.low)),
    close: g.at(-1)!.close,
    adjustedClose: g.at(-1)!.adjustedClose,
    volume: g.every((c) => c.volume !== null)
      ? g.reduce((s, c) => s + c.volume!, 0)
      : null,
    openInterest: g.at(-1)!.openInterest,
    knownAt: g
      .map((c) => c.knownAt)
      .sort()
      .at(-1)!,
  }));
}
/** Same-currency matched-period ratios only. Negative earnings do not imply meaningful P/E. */
export function financialRatios(x: {
  price: number;
  eps: number | null;
  bookValue: number | null;
  netIncome: number | null;
  equity: number | null;
  debt: number | null;
  revenue: number | null;
  operatingCash: number | null;
  capex: number | null;
}) {
  const ratio = (a: number | null, b: number | null, positive = false) =>
    a === null ||
    b === null ||
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    b === 0 ||
    (positive && b <= 0)
      ? null
      : a / b;
  return {
    pe: ratio(x.price, x.eps, true),
    pb: ratio(x.price, x.bookValue, true),
    roe:
      ratio(x.netIncome, x.equity, true) === null
        ? null
        : ratio(x.netIncome, x.equity, true)! * 100,
    debtEquity: ratio(x.debt, x.equity, true),
    netMargin:
      ratio(x.netIncome, x.revenue, true) === null
        ? null
        : ratio(x.netIncome, x.revenue, true)! * 100,
    freeCashFlow:
      x.operatingCash === null || x.capex === null
        ? null
        : x.operatingCash - Math.abs(x.capex),
  };
}
export function comparableMetrics(a: Fundamental[], b: Fundamental[]) {
  return a.map((x) => {
    const y = b.find((v) => v.metric === x.metric);
    return {
      metric: x.metric,
      left: x.value,
      right: y?.value ?? null,
      comparable:
        !!y &&
        x.unit === y.unit &&
        x.unit !== "UNKNOWN" &&
        !x.basis.includes("Unspecified") &&
        x.period === y.period &&
        x.basis === y.basis,
      reason: !y
        ? "Missing peer metric"
        : x.unit === "UNKNOWN" ||
            y.unit === "UNKNOWN" ||
            x.basis.includes("Unspecified") ||
            y.basis.includes("Unspecified")
          ? "Source currency or reporting basis unverified"
          : x.unit !== y.unit
            ? "Units differ"
            : x.period !== y.period
              ? "Fiscal periods differ"
              : x.basis !== y.basis
                ? "Reporting basis differs"
                : "Same period and basis",
    };
  });
}
