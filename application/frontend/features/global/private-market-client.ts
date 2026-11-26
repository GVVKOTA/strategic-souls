"use client";
/**
 * Single typed client for Strategic Souls read-only /api/market/* endpoints.
 * Never holds broker secrets or calls Angel One directly from the browser.
 */

import type {
  CandleInterval,
  ExchangeCode,
  InstrumentMasterEntry,
  MarketErrorResponse,
  MarketHealthResponse,
  MarketQuoteResponse,
  MarketSessionResponse,
  NormalizedCandleSeries,
  SegmentType,
} from "../../../backend/services/market-data/angelone/types";

export class MarketClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly actionHint: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

async function fetchMarketJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new MarketClientError(
        res.status,
        "UPSTREAM_ERROR",
        "Market-data endpoint returned an unreadable response.",
        "Retry shortly.",
      );
    }
    if (!res.ok) {
      const err = payload as Partial<MarketErrorResponse>;
      throw new MarketClientError(
        res.status,
        err.errorCode ?? "UPSTREAM_ERROR",
        err.error ?? "Market data temporarily unavailable.",
        err.actionHint ?? "Check source status and retry.",
        err.retryAfterMs,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof MarketClientError) throw error;
    if (controller.signal.aborted) {
      throw new MarketClientError(
        504,
        "TIMEOUT",
        "Market-data request timed out.",
        "Wait a moment and retry.",
      );
    }
    throw new MarketClientError(
      0,
      "OFFLINE",
      "Network connection interrupted while checking market data.",
      "Check your internet connection and retry.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export function fetchMarketHealth(): Promise<MarketHealthResponse> {
  return fetchMarketJson<MarketHealthResponse>("/api/market/health", undefined, 10_000);
}

export function fetchMarketSessions(): Promise<MarketSessionResponse> {
  return fetchMarketJson<MarketSessionResponse>("/api/market/session", undefined, 8_000);
}

export function fetchMarketInstruments(params: {
  q?: string;
  exchange?: ExchangeCode | "ALL";
  segment?: SegmentType | "ALL";
  limit?: number;
} = {}): Promise<{
  source: "LIVE_MASTER" | "IDENTITY_SEED";
  accessScope: string;
  instruments: InstrumentMasterEntry[];
}> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.exchange) qs.set("exchange", params.exchange);
  if (params.segment) qs.set("segment", params.segment);
  if (params.limit) qs.set("limit", String(params.limit));
  return fetchMarketJson(`/api/market/instruments?${qs.toString()}`);
}

export function fetchMarketQuotes(ids?: readonly string[]): Promise<MarketQuoteResponse> {
  const qs = ids && ids.length > 0 ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
  return fetchMarketJson<MarketQuoteResponse>(`/api/market/quote${qs}`, undefined, 15_000);
}

export function fetchMarketCandles(
  id: string,
  interval: CandleInterval = "1d",
  days = 90,
): Promise<NormalizedCandleSeries> {
  const qs = new URLSearchParams({ id, interval, days: String(days) });
  return fetchMarketJson<NormalizedCandleSeries>(`/api/market/candles?${qs.toString()}`, undefined, 16_000);
}

export function submitManualTotpUnlock(totp: string): Promise<{
  ok: boolean;
  authenticated: boolean;
  enabledExchanges: ExchangeCode[];
  expiresAtUTC: string;
  message: string;
}> {
  return fetchMarketJson("/api/market/auth", {
    method: "POST",
    body: JSON.stringify({ totp }),
  });
}
