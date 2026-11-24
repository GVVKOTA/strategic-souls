/**
 * Cloudflare Worker Market-Data Gateway Client (100% Web-Standard, Workers-compatible).
 * - Runs inside Cloudflare Workers without Node-only imports or broker MPIN/TOTP secrets.
 * - Enforces owner-only access gate while ENABLE_PUBLIC_EXCHANGE_QUOTES=false.
 * - Communicates with the private broker adapter via X-SS-Adapter-Token + optional Cloudflare Access service headers.
 * - Provides explicit dev-only DEMO mode ONLY when MARKET_DATA_DEMO_MODE=true (never silent fallback in production).
 */

import { env } from "cloudflare:workers";
import { formatIstTimestamp, getAllIndianExchangeSessions, qualityDisplayLabel } from "./calendar";
import { InstrumentMaster, VERIFIED_SEED_INSTRUMENTS } from "./instrument-master";
import { parseGatewayConfig, redactText, type WorkerGatewayConfig } from "./redact";
import { MAX_DAILY_CANDLE_DAYS } from "./types";
import type {
  CandleInterval,
  ExchangeCode,
  InstrumentMasterEntry,
  MarketErrorCode,
  MarketErrorResponse,
  MarketHealthResponse,
  MarketQuoteResponse,
  MarketSessionResponse,
  NormalizedCandleSeries,
  NormalizedMarketQuote,
  SegmentType,
} from "./types";

export class MarketGatewayError extends Error {
  readonly status: number;
  readonly code: MarketErrorCode;
  readonly actionHint: string;
  readonly retryAfterMs?: number;

  constructor(
    status: number,
    code: MarketErrorCode,
    message: string,
    actionHint: string,
    retryAfterMs?: number,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.actionHint = actionHint;
    this.retryAfterMs = retryAfterMs;
  }

  toResponseBody(nowMs = Date.now()): MarketErrorResponse {
    return {
      error: this.message,
      errorCode: this.code,
      actionHint: this.actionHint,
      ...(this.retryAfterMs ? { retryAfterMs: this.retryAfterMs } : {}),
      serverTimestampUTC: new Date(nowMs).toISOString(),
    };
  }
}

const seedMaster = new InstrumentMaster(VERIFIED_SEED_INSTRUMENTS);

export function getWorkerEnv(): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

export function isLocalRequestUrl(requestUrl?: string): boolean {
  if (!requestUrl) return false;
  try {
    const h = new URL(requestUrl).hostname;
    return h === "127.0.0.1" || h === "localhost";
  } catch {
    return false;
  }
}

export function resolveGatewayConfig(
  runtimeEnv: Record<string, unknown> = getWorkerEnv(),
  requestUrl?: string,
): WorkerGatewayConfig {
  return parseGatewayConfig(runtimeEnv, isLocalRequestUrl(requestUrl));
}

export function assertMarketDataAccess(input: {
  authenticated: boolean;
  isOwner: boolean;
  config: WorkerGatewayConfig;
}): void {
  if (input.config.flags.mode === "disabled" || input.config.flags.provider === "none") {
    throw new MarketGatewayError(
      503,
      "PRIVATE_DATA_DISABLED",
      "Broker market-data gateway is currently disabled by runtime configuration.",
      "Enable MARKET_DATA_MODE=private and ENABLE_PRIVATE_BROKER_DATA=true for owner access.",
    );
  }

  if (!input.authenticated) {
    throw new MarketGatewayError(
      401,
      "UNAUTHENTICATED",
      "Sign in to access private market-data features.",
      "Sign in with your Strategic Souls account.",
    );
  }

  // Hard compliance gate: public visitors / non-owner members cannot access personal broker quotes
  // unless documented redistribution rights exist (ENABLE_PUBLIC_EXCHANGE_QUOTES=true + mode=public_licensed).
  if (!input.isOwner && !input.config.flags.enablePublicExchangeQuotes) {
    throw new MarketGatewayError(
      403,
      "PUBLIC_LICENSE_REQUIRED",
      "NSE, BSE, and MCX broker quotes are restricted to the private workspace owner until exchange redistribution licences are in place.",
      "Continue using official ECB daily FX, US Treasury yields, 3D Earth, Soul Scan, Formula Lab, and Community.",
    );
  }

  if (input.isOwner && !input.config.flags.enablePrivateBrokerData && !input.config.flags.demoMode) {
    throw new MarketGatewayError(
      503,
      "PRIVATE_DATA_DISABLED",
      "Private broker market data is disabled (ENABLE_PRIVATE_BROKER_DATA=false).",
      "Set ENABLE_PRIVATE_BROKER_DATA=true in your local .dev.vars or Cloudflare Worker runtime variables after testing.",
    );
  }
}

function buildDemoQuotes(ids: readonly string[], nowMs: number): MarketQuoteResponse {
  const utc = new Date(nowMs).toISOString();
  const ist = formatIstTimestamp(nowMs) ?? utc;
  const sessions = getAllIndianExchangeSessions(nowMs);
  const targets = (ids.length > 0 ? ids : ["NSE:SBIN", "BSE:SBIN", "MCX:GOLD04DEC26FUT"])
    .map((id) => seedMaster.resolve(id, nowMs))
    .filter((x): x is InstrumentMasterEntry => x !== null)
    .slice(0, 20);

  const quotes: NormalizedMarketQuote[] = targets.map((inst, idx) => {
    const base = inst.exchange === "MCX" ? 75000 + idx * 100 : 1000 + idx * 50;
    const prev = base - 10;
    return {
      id: inst.id,
      exchange: inst.exchange,
      segment: inst.segment,
      symbol: inst.symbol,
      tradingSymbol: inst.tradingSymbol,
      token: inst.token,
      name: `${inst.name} [DEMO / SYNTHETIC]`,
      expiry: inst.expiry,
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      currency: "INR",
      unit: inst.unit,
      ltp: base,
      open: prev + 2,
      high: base + 5,
      low: prev - 3,
      prevClose: prev,
      change: 10,
      changePct: Number(((10 / prev) * 100).toFixed(4)),
      volume: inst.segment === "INDEX" ? null : 100000,
      openInterest: inst.segment === "FUTURE" ? 5000 : null,
      exchangeTimestampUTC: utc,
      exchangeTimestampIST: ist,
      feedTimestampUTC: utc,
      retrievalTimestampUTC: utc,
      retrievalTimestampIST: ist,
      quality: "DEMO",
      qualityLabel: qualityDisplayLabel("DEMO"),
      marketState: sessions[inst.exchange].state,
      isLive: false,
      freshnessReason: "DEMO / SYNTHETIC mode explicitly enabled. Not real NSE/BSE/MCX market data.",
      provider: "DEMO / SYNTHETIC (NOT REAL BROKER DATA)",
      sourceMode: "DEMO_SYNTHETIC",
      sourceUrl: "https://strategic-souls.vishnukota20071005.workers.dev/",
      errorCode: null,
      errorMessage: null,
    };
  });

  return {
    provider: "DEMO / SYNTHETIC (NOT REAL BROKER DATA)",
    sourceMode: "DEMO_SYNTHETIC",
    serverTimestampUTC: utc,
    serverTimestampIST: ist,
    quotes,
    unfetched: [],
    sessions,
  };
}

async function callPrivateAdapter<T>(
  config: WorkerGatewayConfig,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    timeoutMs?: number;
    traceId?: string;
    fetcher?: typeof fetch;
  } = {},
): Promise<T> {
  if (!config.adapterUrl || !config.adapterAuthToken) {
    throw new MarketGatewayError(
      503,
      "ADAPTER_NOT_CONFIGURED",
      "Private broker adapter URL or service token is not configured on this runtime.",
      "Configure the private adapter connection and MARKET_ADAPTER_AUTH_TOKEN (see operations/docs/MARKET_DATA_SETUP.md).",
    );
  }

  const knownSecrets = [
    config.adapterAuthToken,
    config.cfAccessClientSecret ?? "",
  ].filter(Boolean);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-SS-Adapter-Token": config.adapterAuthToken,
  };
  if (!config.adapterBinding && config.cfAccessClientId && config.cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = config.cfAccessClientId;
    headers["CF-Access-Client-Secret"] = config.cfAccessClientSecret;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options.traceId) headers["X-SS-Scan-Trace"] = options.traceId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const fetcher = config.adapterBinding
      ? config.adapterBinding.fetch.bind(config.adapterBinding)
      : options.fetcher ?? fetch;
    const res = await fetcher(`${config.adapterUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
      signal: controller.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      throw new MarketGatewayError(
        502,
        "ADAPTER_AUTH_FAILED",
        "Private broker adapter gateway redirected (check Cloudflare Access service token).",
        "Verify Cloudflare Access service token headers and Named Tunnel hostname.",
      );
    }

    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const code = (typeof json?.errorCode === "string"
        ? json.errorCode
        : res.status === 401 || res.status === 403
          ? "ADAPTER_AUTH_FAILED"
          : res.status === 429
            ? "RATE_LIMITED"
            : res.status === 502 || res.status === 503
              ? "ADAPTER_OFFLINE"
              : "UPSTREAM_ERROR") as MarketErrorCode;
      const msg = redactText(
        typeof json?.error === "string"
          ? json.error
          : res.status === 502 || res.status === 503
            ? "Private broker adapter is offline (owner host may be sleeping or tunnel disconnected)."
            : `Private broker adapter returned HTTP ${res.status}.`,
        knownSecrets,
      );
      const hint =
        typeof json?.actionHint === "string"
          ? redactText(json.actionHint, knownSecrets)
          : "Verify the private broker adapter is running on the owner host.";
      const retryAfterMs =
        typeof json?.retryAfterMs === "number" ? json.retryAfterMs : undefined;
      throw new MarketGatewayError(res.status, code, msg, hint, retryAfterMs);
    }

    if (!json) {
      throw new MarketGatewayError(
        502,
        "UPSTREAM_ERROR",
        "Private broker adapter returned non-JSON payload.",
        "Check local adapter logs.",
      );
    }
    return json as T;
  } catch (error) {
    if (error instanceof MarketGatewayError) throw error;
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new MarketGatewayError(
      isAbort ? 504 : 503,
      isAbort ? "TIMEOUT" : "ADAPTER_OFFLINE",
      isAbort
        ? "Private broker adapter timed out."
        : "Private broker adapter is unreachable (owner laptop may be asleep or adapter not started).",
      "Start the private local broker adapter (`npm run broker:adapter`) or check your Named Cloudflare Tunnel.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function gatewayHealth(options: {
  isOwner: boolean;
  runtimeEnv?: Record<string, unknown>;
  requestUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: number;
}): Promise<MarketHealthResponse> {
  const nowMs = options.nowMs ?? Date.now();
  const utc = new Date(nowMs).toISOString();
  const ist = formatIstTimestamp(nowMs) ?? utc;
  const config = resolveGatewayConfig(options.runtimeEnv, options.requestUrl);

  // Public / non-owner visitors receive strictly sanitized public status — never private broker details!
  if (!options.isOwner && !config.flags.enablePublicExchangeQuotes) {
    return {
      ok: true,
      provider: "Official public references (ECB / US Treasury)",
      mode: config.flags.mode,
      flags: {
        privateBrokerEnabled: config.flags.enablePrivateBrokerData,
        publicExchangeQuotesEnabled: false,
        demoMode: false,
      },
      accessScope: "PUBLIC_RESTRICTED",
      adapterReachable: false,
      authState: "HIDDEN",
      enabledExchanges: [],
      scripMasterCount: null,
      scripMasterUpdatedAt: null,
      lastSuccessfulFetchAt: null,
      circuitBreakerState: "UNKNOWN",
      serverTimestampUTC: utc,
      serverTimestampIST: ist,
      errorCode: "PUBLIC_LICENSE_REQUIRED",
      message:
        "Indian exchange quotes (NSE/BSE/MCX) are restricted to the private workspace owner until exchange display and redistribution licences are active.",
    };
  }

  if (config.flags.demoMode) {
    return {
      ok: true,
      provider: "DEMO / SYNTHETIC (NOT REAL BROKER DATA)",
      mode: config.flags.mode,
      flags: {
        privateBrokerEnabled: config.flags.enablePrivateBrokerData,
        publicExchangeQuotesEnabled: config.flags.enablePublicExchangeQuotes,
        demoMode: true,
      },
      accessScope: "OWNER_PRIVATE",
      adapterReachable: true,
      authState: "AUTHENTICATED",
      enabledExchanges: ["NSE", "BSE", "MCX"],
      scripMasterCount: VERIFIED_SEED_INSTRUMENTS.length,
      scripMasterUpdatedAt: utc,
      lastSuccessfulFetchAt: utc,
      circuitBreakerState: "CLOSED",
      serverTimestampUTC: utc,
      serverTimestampIST: ist,
      errorCode: null,
      message: "Explicit DEMO / SYNTHETIC development mode active. Do not treat as real exchange data.",
    };
  }

  if (!config.flags.enablePrivateBrokerData) {
    return {
      ok: false,
      provider: "Exchange Market Feed (Read-Only)",
      mode: config.flags.mode,
      flags: {
        privateBrokerEnabled: false,
        publicExchangeQuotesEnabled: config.flags.enablePublicExchangeQuotes,
        demoMode: false,
      },
      accessScope: "OWNER_PRIVATE",
      adapterReachable: false,
      authState: "NOT_CONFIGURED",
      enabledExchanges: [],
      scripMasterCount: null,
      scripMasterUpdatedAt: null,
      lastSuccessfulFetchAt: null,
      circuitBreakerState: "UNKNOWN",
      serverTimestampUTC: utc,
      serverTimestampIST: ist,
      errorCode: "PRIVATE_DATA_DISABLED",
      message: "Private broker data flag (ENABLE_PRIVATE_BROKER_DATA) is currently false.",
    };
  }

  try {
    const adapterHealth = await callPrivateAdapter<MarketHealthResponse>(
      config,
      "/internal/health",
      { fetcher: options.fetcher, timeoutMs: 6000 },
    );
    return {
      ...adapterHealth,
      provider: "Exchange Market Feed (Read-Only)",
      mode: config.flags.mode,
      flags: {
        privateBrokerEnabled: config.flags.enablePrivateBrokerData,
        publicExchangeQuotesEnabled: config.flags.enablePublicExchangeQuotes,
        demoMode: false,
      },
      accessScope: "OWNER_PRIVATE",
    };
  } catch (error) {
    const gwErr =
      error instanceof MarketGatewayError
        ? error
        : new MarketGatewayError(
            503,
            "ADAPTER_OFFLINE",
            "Private market feed adapter unavailable.",
            "Ensure the configured market feed adapter is reachable.",
          );
    return {
      ok: false,
      provider: "Exchange Market Feed (Read-Only)",
      mode: config.flags.mode,
      flags: {
        privateBrokerEnabled: config.flags.enablePrivateBrokerData,
        publicExchangeQuotesEnabled: config.flags.enablePublicExchangeQuotes,
        demoMode: false,
      },
      accessScope: "OWNER_PRIVATE",
      adapterReachable: false,
      authState: gwErr.code === "ADAPTER_NOT_CONFIGURED" ? "NOT_CONFIGURED" : "EXPIRED",
      enabledExchanges: [],
      scripMasterCount: null,
      scripMasterUpdatedAt: null,
      lastSuccessfulFetchAt: null,
      circuitBreakerState: "UNKNOWN",
      serverTimestampUTC: utc,
      serverTimestampIST: ist,
      errorCode: gwErr.code,
      message: gwErr.message,
    };
  }
}

export function gatewaySessionStatus(nowMs = Date.now()): MarketSessionResponse {
  const utc = new Date(nowMs).toISOString();
  return {
    serverTimestampUTC: utc,
    serverTimestampIST: formatIstTimestamp(nowMs) ?? utc,
    timezone: "Asia/Kolkata",
    sessions: getAllIndianExchangeSessions(nowMs),
  };
}

export async function gatewaySearchInstruments(options: {
  isOwner: boolean;
  q?: string;
  exchange?: ExchangeCode | "ALL";
  segment?: SegmentType | "ALL";
  limit?: number;
  runtimeEnv?: Record<string, unknown>;
  requestUrl?: string;
  fetcher?: typeof fetch;
}): Promise<{ source: "LIVE_MASTER" | "IDENTITY_SEED"; instruments: InstrumentMasterEntry[] }> {
  const config = resolveGatewayConfig(options.runtimeEnv, options.requestUrl);
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));

  if (options.isOwner && config.flags.enablePrivateBrokerData && config.adapterUrl && config.adapterAuthToken) {
    try {
      const qs = new URLSearchParams({
        q: (options.q ?? "").slice(0, 60),
        exchange: options.exchange ?? "ALL",
        segment: options.segment ?? "ALL",
        limit: String(limit),
      });
      const res = await callPrivateAdapter<{ instruments: InstrumentMasterEntry[] }>(
        config,
        `/internal/instruments?${qs.toString()}`,
        { fetcher: options.fetcher, timeoutMs: 8000 },
      );
      if (Array.isArray(res.instruments)) {
        return { source: "LIVE_MASTER", instruments: res.instruments.slice(0, limit) };
      }
    } catch {
      // Fall back safely to verified identity seeds (no prices fabricated)
    }
  }

  return {
    source: "IDENTITY_SEED",
    instruments: seedMaster.search({
      q: options.q,
      exchange: options.exchange,
      segment: options.segment,
      limit,
    }),
  };
}

export async function gatewayQuotes(options: {
  authenticated: boolean;
  isOwner: boolean;
  ids?: readonly string[];
  runtimeEnv?: Record<string, unknown>;
  requestUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: number;
}): Promise<MarketQuoteResponse> {
  const config = resolveGatewayConfig(options.runtimeEnv, options.requestUrl);
  assertMarketDataAccess({
    authenticated: options.authenticated,
    isOwner: options.isOwner,
    config,
  });

  const cleanIds = (options.ids ?? [])
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9:._&-]{3,50}$/.test(s))
    .slice(0, 20);

  if (config.flags.demoMode) {
    return buildDemoQuotes(cleanIds, options.nowMs ?? Date.now());
  }

  const qs = cleanIds.length > 0 ? `?ids=${encodeURIComponent(cleanIds.join(","))}` : "";
  return callPrivateAdapter<MarketQuoteResponse>(config, `/internal/quote${qs}`, {
    fetcher: options.fetcher,
    timeoutMs: 12_000,
  });
}

export async function gatewayCandles(options: {
  authenticated: boolean;
  isOwner: boolean;
  id: string;
  interval?: CandleInterval;
  days?: number;
  traceId?: string;
  runtimeEnv?: Record<string, unknown>;
  requestUrl?: string;
  fetcher?: typeof fetch;
}): Promise<NormalizedCandleSeries> {
  const config = resolveGatewayConfig(options.runtimeEnv, options.requestUrl);
  assertMarketDataAccess({
    authenticated: options.authenticated,
    isOwner: options.isOwner,
    config,
  });

  const id = options.id.trim();
  if (!/^[A-Za-z0-9:._&-]{3,50}$/.test(id)) {
    throw new MarketGatewayError(
      400,
      "INVALID_SYMBOL",
      "Invalid instrument identifier format.",
      "Use canonical exchange:symbol IDs such as NSE:SBIN, BSE:SBIN, or MCX:GOLD04DEC26FUT.",
    );
  }
  const interval: CandleInterval =
    options.interval && ["1d", "1h", "30m", "15m", "5m"].includes(options.interval)
      ? options.interval
      : "1d";
  const days = Math.max(1, Math.min(
    interval === "1d" ? MAX_DAILY_CANDLE_DAYS : 365,
    Math.round(options.days ?? 90),
  ));

  const qs = new URLSearchParams({ id, interval, days: String(days) });
  return callPrivateAdapter<NormalizedCandleSeries>(
    config,
    `/internal/candles?${qs.toString()}`,
    { fetcher: options.fetcher, timeoutMs: 14_000, traceId: options.traceId },
  );
}

export async function gatewayAuthenticateTotp(options: {
  authenticated: boolean;
  isOwner: boolean;
  totp: string;
  runtimeEnv?: Record<string, unknown>;
  requestUrl?: string;
  fetcher?: typeof fetch;
}): Promise<{ ok: boolean; authenticated: boolean; enabledExchanges: ExchangeCode[]; expiresAtUTC: string; message: string }> {
  const config = resolveGatewayConfig(options.runtimeEnv, options.requestUrl);
  assertMarketDataAccess({
    authenticated: options.authenticated,
    isOwner: options.isOwner,
    config,
  });
  if (!options.isOwner) {
    throw new MarketGatewayError(
      403,
      "PUBLIC_LICENSE_REQUIRED",
      "Only the private workspace owner can authenticate the broker adapter session.",
      "Sign in as the workspace owner.",
    );
  }
  if (!/^\d{6}$/.test(options.totp.trim())) {
    throw new MarketGatewayError(
      400,
      "BROKER_TOTP_REQUIRED",
      "Enter a valid 6-digit TOTP code.",
      "Read the current 6-digit code from your authenticator app.",
    );
  }
  return callPrivateAdapter(config, "/internal/auth/totp", {
    method: "POST",
    body: { totp: options.totp.trim() },
    fetcher: options.fetcher,
    timeoutMs: 12_000,
  });
}
