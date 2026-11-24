/**
 * Strictly typed QuoteNormalizer & CandleNormalizer for Angel One SmartAPI REST payloads.
 * - REST quote/candle prices are empirically verified to be in INR rupees (NOT paise).
 * - ScripMaster tick_size and SmartWebSocketV2 binary ticks are in paise; paiseToRupees converts explicitly.
 * - Never fabricates prices, volumes, OI, or timestamps. Invalid denominators yield null %change.
 */

import {
  classifyQuoteQuality,
  formatIstTimestamp,
  getIndianExchangeSession,
  qualityDisplayLabel,
} from "./calendar";
import type {
  CandleInterval,
  InstrumentMasterEntry,
  NormalizedCandle,
  NormalizedCandleSeries,
  NormalizedMarketQuote,
} from "./types";

const MONTHS: Readonly<Record<string, string>> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

const EPOCH_ZERO_MIN_MS = Date.parse("2000-01-01T00:00:00Z");

export const ANGEL_ONE_SOURCE_URL = "https://smartapi.angelone.in/docs/MarketData";

/** Converts documented paise fields (e.g. ScripMaster tick_size or WebSocket binary prices) to INR rupees. */
export function paiseToRupees(paiseValue: number | string | null | undefined): number | null {
  if (paiseValue === null || paiseValue === undefined || paiseValue === "") return null;
  const n = typeof paiseValue === "number" ? paiseValue : Number(paiseValue);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n) / 100;
}

/**
 * Parses Angel One IST timestamp strings such as "20-Nov-2026 15:59:46" into canonical UTC ISO-8601.
 * Rejects epoch-zero placeholders ("01-Jan-1970 05:30:00") returned for index exchTradeTime.
 */
export function parseAngelOneIstTimestamp(raw: unknown): { utcIso: string; ms: number } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Format 1: ISO-8601 with offset, e.g. "2026-11-20T00:00:00+05:30"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms) || ms < EPOCH_ZERO_MIN_MS) return null;
    return { utcIso: new Date(ms).toISOString(), ms };
  }

  // Format 2: Angel One quote format "DD-MMM-YYYY HH:MM:SS" in IST (+05:30)
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = MONTHS[m[2].toUpperCase()];
  if (!month) return null;
  const isoIst = `${m[3]}-${month}-${day}T${m[4]}:${m[5]}:${m[6]}+05:30`;
  const ms = Date.parse(isoIst);
  if (!Number.isFinite(ms) || ms < EPOCH_ZERO_MIN_MS) return null;
  return { utcIso: new Date(ms).toISOString(), ms };
}

/** Parses Angel One ScripMaster expiry string "04DEC2026" -> "2026-12-04". */
export function parseAngelOneExpiry(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(trimmed);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (!month) return null;
  const iso = `${m[3]}-${month}-${m[1]}`;
  return Number.isFinite(Date.parse(iso + "T00:00:00Z")) ? iso : null;
}

function positivePrice(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

function nonNegativeInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

export type RawAngelOneQuoteItem = {
  exchange?: unknown;
  tradingSymbol?: unknown;
  symbolToken?: unknown;
  ltp?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  netChange?: unknown;
  percentChange?: unknown;
  tradeVolume?: unknown;
  opnInterest?: unknown;
  exchFeedTime?: unknown;
  exchTradeTime?: unknown;
};

export function normalizeAngelOneQuote(
  instrument: InstrumentMasterEntry,
  raw: RawAngelOneQuoteItem | null,
  nowMs = Date.now(),
): NormalizedMarketQuote {
  const retrievalTimestampUTC = new Date(nowMs).toISOString();
  const retrievalTimestampIST = formatIstTimestamp(nowMs) ?? retrievalTimestampUTC;
  const session = getIndianExchangeSession(instrument.exchange, nowMs);

  if (!raw || typeof raw !== "object") {
    return {
      id: instrument.id,
      exchange: instrument.exchange,
      segment: instrument.segment,
      symbol: instrument.symbol,
      tradingSymbol: instrument.tradingSymbol,
      token: instrument.token,
      name: instrument.name,
      expiry: instrument.expiry,
      lotSize: instrument.lotSize,
      tickSize: instrument.tickSize,
      currency: "INR",
      unit: instrument.unit,
      ltp: null,
      open: null,
      high: null,
      low: null,
      prevClose: null,
      change: null,
      changePct: null,
      volume: null,
      openInterest: null,
      exchangeTimestampUTC: null,
      exchangeTimestampIST: null,
      feedTimestampUTC: null,
      retrievalTimestampUTC,
      retrievalTimestampIST,
      quality: "NO_DATA",
      qualityLabel: qualityDisplayLabel("NO_DATA"),
      marketState: session.state,
      isLive: false,
      freshnessReason: "Provider did not return a quote object for this instrument.",
      provider: "Angel One SmartAPI",
      sourceMode: "PRIVATE_OWNER_FEED",
      sourceUrl: ANGEL_ONE_SOURCE_URL,
      errorCode: "UPSTREAM_ERROR",
      errorMessage: "No quote payload returned.",
    };
  }

  const ltp = positivePrice(raw.ltp);
  const open = positivePrice(raw.open);
  const high = positivePrice(raw.high);
  const low = positivePrice(raw.low);
  const prevClose = positivePrice(raw.close);

  // Compute change & %change ONLY from valid finite ltp and prevClose > 0. Never divide by zero.
  const change =
    ltp !== null && prevClose !== null
      ? Number((ltp - prevClose).toFixed(4))
      : null;
  const changePct =
    ltp !== null && prevClose !== null && prevClose > 0
      ? Number((((ltp - prevClose) / prevClose) * 100).toFixed(4))
      : null;

  // Indices report tradeVolume=0; keep null for indices so zero isn't mistaken for real index volume.
  const rawVol = nonNegativeInt(raw.tradeVolume);
  const volume =
    instrument.segment === "INDEX" && (rawVol === null || rawVol === 0)
      ? null
      : rawVol;

  // Open interest is only meaningful for derivatives/futures; explicitly null for cash equities & indices.
  const openInterest =
    instrument.segment === "FUTURE" ? nonNegativeInt(raw.opnInterest) : null;

  // Prefer genuine trade time over morning BOD feed broadcast time; fall back to feed time for indices (epoch-zero tradeTime).
  const tradeTs = parseAngelOneIstTimestamp(raw.exchTradeTime);
  const feedTs = parseAngelOneIstTimestamp(raw.exchFeedTime);
  const primaryTs = tradeTs ?? feedTs;

  const qualityResult = classifyQuoteQuality({
    ltp,
    observationTimeMs: primaryTs?.ms ?? null,
    retrievalTimeMs: nowMs,
    nowMs,
    session,
  });

  return {
    id: instrument.id,
    exchange: instrument.exchange,
    segment: instrument.segment,
    symbol: instrument.symbol,
    tradingSymbol: instrument.tradingSymbol,
    token: instrument.token,
    name: instrument.name,
    expiry: instrument.expiry,
    lotSize: instrument.lotSize,
    tickSize: instrument.tickSize,
    currency: "INR",
    unit: instrument.unit,
    ltp,
    open,
    high,
    low,
    prevClose,
    change,
    changePct,
    volume,
    openInterest,
    exchangeTimestampUTC: primaryTs?.utcIso ?? null,
    exchangeTimestampIST: primaryTs ? formatIstTimestamp(primaryTs.ms) : null,
    feedTimestampUTC: feedTs?.utcIso ?? null,
    retrievalTimestampUTC,
    retrievalTimestampIST,
    quality: qualityResult.quality,
    qualityLabel: qualityDisplayLabel(qualityResult.quality),
    marketState: session.state,
    isLive: qualityResult.isLive,
    freshnessReason: qualityResult.reason,
    provider: "Angel One SmartAPI",
    sourceMode: "PRIVATE_OWNER_FEED",
    sourceUrl: ANGEL_ONE_SOURCE_URL,
    errorCode: ltp === null ? "UPSTREAM_ERROR" : null,
    errorMessage: ltp === null ? "Missing or invalid LTP in provider quote." : null,
  };
}

export function normalizeAngelOneCandles(
  instrument: InstrumentMasterEntry,
  interval: CandleInterval,
  rawRows: unknown,
  nowMs = Date.now(),
): NormalizedCandleSeries {
  const retrievalTimestampUTC = new Date(nowMs).toISOString();
  const retrievalTimestampIST = formatIstTimestamp(nowMs) ?? retrievalTimestampUTC;
  const session = getIndianExchangeSession(instrument.exchange, nowMs);

  const candles: NormalizedCandle[] = [];
  const seen = new Set<string>();

  if (Array.isArray(rawRows)) {
    for (const row of rawRows) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const ts = parseAngelOneIstTimestamp(row[0]);
      const open = positivePrice(row[1]);
      const high = positivePrice(row[2]);
      const low = positivePrice(row[3]);
      const close = positivePrice(row[4]);
      const vol = row.length >= 6 ? nonNegativeInt(row[5]) : null;
      if (!ts || open === null || high === null || low === null || close === null) continue;
      if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) continue;
      if (ts.ms > nowMs + 86_400_000) continue; // reject future bars
      if (seen.has(ts.utcIso)) continue;
      seen.add(ts.utcIso);

      const dateIST = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ts.ms));

      candles.push({
        timestampUTC: ts.utcIso,
        dateIST,
        open,
        high,
        low,
        close,
        volume: instrument.segment === "INDEX" && vol === 0 ? null : vol,
        openInterest: null,
        provider: "Angel One SmartAPI",
        adjustment: "RAW",
      });
    }
  }

  candles.sort((a, b) => a.timestampUTC.localeCompare(b.timestampUTC));

  const latest = candles.at(-1);
  const latestMs = latest ? Date.parse(latest.timestampUTC) : null;
  const quality =
    candles.length === 0
      ? "NO_DATA"
      : session.state === "CLOSED" || session.state === "HOLIDAY"
        ? "MARKET_CLOSED_LAST"
        : latestMs !== null && nowMs - latestMs <= 5 * 86_400_000
          ? "VERIFIED_LAST_AVAILABLE"
          : "REAL_BUT_STALE";

  return {
    instrument,
    interval,
    candles,
    retrievalTimestampUTC,
    retrievalTimestampIST,
    quality,
    qualityLabel: qualityDisplayLabel(quality),
    marketState: session.state,
    provider: "Angel One SmartAPI",
    sourceMode: "PRIVATE_OWNER_FEED",
    limitations: [
      "Private owner broker historical OHLCV (RAW unadjusted bars); never redistributed to public visitors.",
      "Historical candles are fetched independently of live quotes and do not include corporate-action point-in-time vintages.",
      ...(instrument.segment === "FUTURE"
        ? [
            `Dated MCX futures contract (${instrument.tradingSymbol}, expiry ${instrument.expiry ?? "unknown"}, lot size ${instrument.lotSize}). Not a continuous spot price.`,
          ]
        : []),
    ],
    errorCode: candles.length === 0 ? "UPSTREAM_ERROR" : null,
    errorMessage: candles.length === 0 ? "No valid OHLCV candles returned for requested range." : null,
  };
}
