/**
 * AngelOneReadOnlyProvider: Strictly READ-ONLY market-data provider for NSE, BSE, and MCX.
 * - Composes BrokerAuthSession, InstrumentMaster, QuoteNormalizer, DataQuality, RateLimiter, CircuitBreaker.
 * - Zero order/trading/GTT/position/funds methods or endpoints.
 * - Quotes and historical candles are completely independent so candle failures never break quotes.
 */

import { ANGEL_ONE_BASE_URL, BrokerAuthError, BrokerAuthSession } from "./auth-session";
import { formatIstTimestamp, getAllIndianExchangeSessions } from "./calendar";
import {
  DEFAULT_OWNER_WATCH_IDS,
  InstrumentMaster,
  SCRIP_MASTER_URL,
  type RawScripMasterRow,
} from "./instrument-master";
import {
  normalizeAngelOneCandles,
  normalizeAngelOneQuote,
  type RawAngelOneQuoteItem,
} from "./normalizer";
import { BoundedRateLimiter, CircuitBreaker, retryTransient, SingleFlightCache } from "./rate-limiter";
import { redactText } from "./redact";
import { MAX_DAILY_CANDLE_DAYS } from "./types";
import type {
  CandleInterval,
  ExchangeCode,
  InstrumentMasterEntry,
  MarketErrorCode,
  MarketHealthResponse,
  MarketQuoteResponse,
  NormalizedCandleSeries,
  NormalizedMarketQuote,
  SegmentType,
} from "./types";

const QUOTE_PATH = "/rest/secure/angelbroking/market/v1/quote/";
const CANDLE_PATH = "/rest/secure/angelbroking/historical/v1/getCandleData";

const INTERVAL_MAP: Readonly<Record<CandleInterval, string>> = {
  "1d": "ONE_DAY",
  "1h": "ONE_HOUR",
  "30m": "THIRTY_MINUTE",
  "15m": "FIFTEEN_MINUTE",
  "5m": "FIVE_MINUTE",
};

const MAX_DAYS_BY_INTERVAL: Readonly<Record<CandleInterval, number>> = {
  "1d": MAX_DAILY_CANDLE_DAYS,
  "1h": 60,
  "30m": 60,
  "15m": 30,
  "5m": 15,
};

export class ProviderRequestError extends Error {
  readonly code: MarketErrorCode;
  readonly httpStatus: number;
  readonly retryAfterMs?: number;
  readonly transient: boolean;

  constructor(
    code: MarketErrorCode,
    message: string,
    httpStatus = 502,
    retryAfterMs?: number,
    transient = false,
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
    this.transient = transient;
  }
}

function formatAngelDateTimeIst(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export class AngelOneReadOnlyProvider {
  private readonly rateLimiter = new BoundedRateLimiter();
  private readonly circuitBreaker = new CircuitBreaker(4, 30_000);
  private readonly quoteCache = new SingleFlightCache<MarketQuoteResponse>(100);
  private readonly candleCache = new SingleFlightCache<NormalizedCandleSeries>(100);
  private lastSuccessfulFetchAt: string | null = null;

  private readonly auth: BrokerAuthSession;
  private readonly instruments: InstrumentMaster;
  private readonly fetcher: typeof fetch;
  private readonly knownSecrets: readonly string[];

  constructor(
    auth: BrokerAuthSession,
    instruments: InstrumentMaster,
    fetcher: typeof fetch = fetch,
    knownSecrets: readonly string[] = [],
  ) {
    this.auth = auth;
    this.instruments = instruments;
    this.fetcher = fetcher;
    this.knownSecrets = knownSecrets;
  }

  async refreshScripMasterFromRemote(nowMs = Date.now()): Promise<number> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await this.fetcher(SCRIP_MASTER_URL, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ProviderRequestError(
          "UPSTREAM_ERROR",
          `ScripMaster download failed (HTTP ${res.status}).`,
          502,
        );
      }
      const rows = (await res.json()) as RawScripMasterRow[];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ProviderRequestError("UPSTREAM_ERROR", "ScripMaster returned empty payload.", 502);
      }
      return this.instruments.ingestRawRows(rows, nowMs);
    } finally {
      clearTimeout(timer);
    }
  }

  ingestScripMasterRows(rows: readonly RawScripMasterRow[], nowMs = Date.now()): number {
    return this.instruments.ingestRawRows(rows, nowMs);
  }

  async authenticateWithManualTotp(totpCode: string, nowMs = Date.now()) {
    const session = await this.auth.login(totpCode, nowMs);
    this.quoteCache.clear();
    this.candleCache.clear();
    return {
      authenticated: true,
      enabledExchanges: session.enabledExchanges,
      expiresAtUTC: new Date(session.expiresAtMs).toISOString(),
    };
  }

  getHealth(nowMs = Date.now()): MarketHealthResponse {
    const authStatus = this.auth.getStatus(nowMs);
    const scripStats = this.instruments.stats();
    const cbState = this.circuitBreaker.currentState(nowMs);
    const utc = new Date(nowMs).toISOString();
    const ist = formatIstTimestamp(nowMs) ?? utc;

    let errorCode: MarketErrorCode | null = null;
    let message = "Private Angel One read-only adapter is ready.";
    if (cbState === "OPEN") {
      errorCode = "CIRCUIT_OPEN";
      message = "Circuit breaker open after repeated upstream failures; cooling down.";
    } else if (authStatus.state === "STATIC_IP_BLOCKED") {
      errorCode = "BROKER_STATIC_IP_BLOCKED";
      message = authStatus.lastError ?? "Outbound IPv4 rejected by Angel One.";
    } else if (authStatus.state === "TOTP_REQUIRED") {
      errorCode = "BROKER_TOTP_REQUIRED";
      message = "Manual 6-digit TOTP required to start read-only broker session.";
    } else if (authStatus.state === "AUTH_FAILED") {
      errorCode = "BROKER_AUTH_FAILED";
      message = authStatus.lastError ?? "Broker authentication failed.";
    } else if (authStatus.state === "RATE_LIMITED") {
      errorCode = "RATE_LIMITED";
      message = authStatus.lastError ?? "Broker rate limit reached.";
    } else if (!authStatus.authenticated) {
      message = "Adapter ready; broker session will initialize on first authorized read.";
    }

    return {
      ok: cbState !== "OPEN" && authStatus.state !== "STATIC_IP_BLOCKED" && authStatus.state !== "AUTH_FAILED",
      provider: "Angel One SmartAPI (Read-Only)",
      mode: "private",
      flags: {
        privateBrokerEnabled: true,
        publicExchangeQuotesEnabled: false,
        demoMode: false,
      },
      accessScope: "OWNER_PRIVATE",
      adapterReachable: true,
      authState: authStatus.state,
      enabledExchanges: authStatus.enabledExchanges,
      scripMasterCount: scripStats.rawRowCount || scripStats.totalIndexed,
      scripMasterUpdatedAt: scripStats.loadedAt,
      lastSuccessfulFetchAt: this.lastSuccessfulFetchAt,
      circuitBreakerState: cbState,
      serverTimestampUTC: utc,
      serverTimestampIST: ist,
      errorCode,
      message,
    };
  }

  searchInstruments(options: {
    q?: string;
    exchange?: ExchangeCode | "ALL";
    segment?: SegmentType | "ALL";
    limit?: number;
  }): InstrumentMasterEntry[] {
    return this.instruments.search(options);
  }

  private async paceRead(bucket: "quote" | "candle", nowMs: number) {
    // Respect documented Angel One per-second and per-minute quotas strictly.
    // Pace short bursts with bounded waiting. Every upstream retry passes through this guard.
    let effectiveNowMs = nowMs;
    const perSecMax = bucket === "quote" ? 1 : 2;
    let perSec = this.rateLimiter.consume(
      `angelone:${bucket}:sec`,
      perSecMax,
      1050,
      effectiveNowMs,
    );
    let waitCycles = 0;
    while (!perSec.allowed && perSec.retryAfterMs <= 1200 && waitCycles < 3) {
      waitCycles += 1;
      const waitMs = perSec.retryAfterMs + 25;
      await new Promise((r) => setTimeout(r, waitMs));
      effectiveNowMs = Date.now();
      perSec = this.rateLimiter.consume(
        `angelone:${bucket}:sec`,
        perSecMax,
        1050,
        effectiveNowMs,
      );
    }
    if (!perSec.allowed) {
      throw new ProviderRequestError(
        "RATE_LIMITED",
        "Local provider rate-limit guard active. Retry shortly.",
        429,
        perSec.retryAfterMs,
        false,
      );
    }
    const perMin = this.rateLimiter.consume(
      `angelone:${bucket}:min`,
      bucket === "quote" ? 45 : 90,
      60_000,
      effectiveNowMs,
    );
    if (!perMin.allowed) {
      throw new ProviderRequestError(
        "RATE_LIMITED",
        "Local minute quota reached for Angel One read-only endpoint.",
        429,
        perMin.retryAfterMs,
        false,
      );
    }
  }

  private async postAuthorizedJson(
    path: string,
    payload: Record<string, unknown>,
    bucket: "quote" | "candle",
    nowMs = Date.now(),
  ): Promise<Record<string, unknown>> {
    const cb = this.circuitBreaker.canAttempt(nowMs);
    if (!cb.allowed) {
      throw new ProviderRequestError(
        "CIRCUIT_OPEN",
        "Upstream broker circuit breaker is open. Retry after cooldown.",
        503,
        cb.retryAfterMs,
        false,
      );
    }

    let attempts = 0;
    const executeOnce = async (allowRefreshRetry: boolean): Promise<Record<string, unknown>> => {
      try {
        await this.auth.ensureSession(nowMs);
      } catch (err) {
        if (err instanceof BrokerAuthError) {
          throw new ProviderRequestError(err.code, err.message, err.httpStatus, undefined, false);
        }
        throw err;
      }

      await this.paceRead(bucket, attempts++ === 0 ? nowMs : Date.now());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await this.fetcher(`${ANGEL_ONE_BASE_URL}${path}`, {
          method: "POST",
          headers: this.auth.baseHeaders(true),
          body: JSON.stringify(payload),
          redirect: "manual",
          signal: controller.signal,
        });

        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel();
          throw new ProviderRequestError(
            "UPSTREAM_ERROR",
            "Angel One API returned an unexpected redirect.",
            502,
            undefined,
            false,
          );
        }

        const text = await res.text();
        let json: Record<string, unknown> | null = null;
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          json = null;
        }

        const errorcode = String(json?.errorcode ?? "").trim().toUpperCase();
        const message = redactText(String(json?.message ?? ""), this.knownSecrets);
        const lower = `${errorcode} ${message}`.toLowerCase();

        // Session expired -> attempt ONE official refreshToken renewal before failing cleanly
        if (
          allowRefreshRetry &&
          (res.status === 401 ||
            errorcode === "AG8001" ||
            errorcode === "AG8002" ||
            errorcode === "AB1010" ||
            lower.includes("invalid token"))
        ) {
          const refreshed = await this.auth.refreshSession(nowMs);
          if (refreshed) {
            return executeOnce(false);
          }
          this.auth.invalidate("Broker session expired; re-authenticate with fresh TOTP.");
          throw new ProviderRequestError(
            "BROKER_SESSION_EXPIRED",
            "Angel One session expired. Enter a fresh 6-digit TOTP to reconnect.",
            401,
            undefined,
            false,
          );
        }

        if (res.status === 403) {
          const isStaticIp = lower.includes("ip") || lower.includes("static") || lower.includes("whitelist");
          const isRate = lower.includes("rate") || lower.includes("exceed") || lower.includes("throttl");
          const isWafBurst =
            !isStaticIp &&
            !errorcode &&
            this.auth.getStatus(nowMs).authenticated &&
            this.lastSuccessfulFetchAt !== null &&
            (!json || lower.includes("access denied") || lower.trim() === "");
          if (isRate || isWafBurst) {
            throw new ProviderRequestError(
              "RATE_LIMITED",
              "Angel One rate limit enforced (HTTP 403). Back off before retrying.",
              429,
              1500,
              true,
            );
          }
          throw new ProviderRequestError(
            isStaticIp ? "BROKER_STATIC_IP_BLOCKED" : "BROKER_AUTH_FAILED",
            isStaticIp
              ? "Angel One rejected outbound IPv4 (HTTP 403). Verify static IP registration on SmartAPI."
              : "Angel One denied access (HTTP 403). Check SmartAPI app status, static IP, and entitlements.",
            403,
            undefined,
            false,
          );
        }

        if (res.status === 429 || lower.includes("access rate") || errorcode === "AB1004" && lower.includes("rate")) {
          throw new ProviderRequestError(
            "RATE_LIMITED",
            "Angel One rate limit reached. Wait a moment and retry.",
            429,
            5000,
            false,
          );
        }

        if (res.status >= 500) {
          this.circuitBreaker.recordTransientFailure(nowMs);
          throw new ProviderRequestError(
            "UPSTREAM_ERROR",
            `Angel One server error (HTTP ${res.status}).`,
            502,
            2000,
            true,
          );
        }

        if (!json) {
          this.circuitBreaker.recordTransientFailure(nowMs);
          throw new ProviderRequestError(
            "UPSTREAM_ERROR",
            "Angel One returned malformed non-JSON response.",
            502,
            undefined,
            false,
          );
        }

        if (json.status !== true) {
          if (lower.includes("segment") || lower.includes("not enabled") || lower.includes("not activated")) {
            throw new ProviderRequestError(
              "SEGMENT_NOT_ENTITLED",
              `Requested exchange segment is not active on this Angel One account${errorcode ? ` (${errorcode})` : ""}.`,
              403,
              undefined,
              false,
            );
          }
          throw new ProviderRequestError(
            "UPSTREAM_ERROR",
            `Angel One returned error${errorcode ? ` ${errorcode}` : ""}: ${message || "request unsuccessful"}.`,
            502,
            undefined,
            false,
          );
        }

        this.circuitBreaker.recordSuccess();
        this.lastSuccessfulFetchAt = new Date(nowMs).toISOString();
        return json;
      } catch (error) {
        if (error instanceof ProviderRequestError) throw error;
        const isAbort = error instanceof Error && error.name === "AbortError";
        this.circuitBreaker.recordTransientFailure(nowMs);
        throw new ProviderRequestError(
          isAbort ? "TIMEOUT" : "UPSTREAM_ERROR",
          isAbort
            ? "Angel One market-data request timed out."
            : "Network failure communicating with Angel One.",
          504,
          1500,
          true,
        );
      } finally {
        clearTimeout(timer);
      }
    };

    return retryTransient(
      () => executeOnce(true),
      (err) => err instanceof ProviderRequestError && err.transient,
      { maxAttempts: 2, baseDelayMs: 400 },
    );
  }

  async getQuotes(rawIds?: readonly string[], nowMs = Date.now()): Promise<MarketQuoteResponse> {
    const requested = (rawIds && rawIds.length > 0 ? rawIds : DEFAULT_OWNER_WATCH_IDS)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const cacheKey = `quotes:${[...new Set(requested)].sort().join(",")}`;
    return this.quoteCache.run(
      cacheKey,
      5_000,
      async () => {
        const resolved: InstrumentMasterEntry[] = [];
        const unfetched: MarketQuoteResponse["unfetched"] = [];

        for (const id of requested) {
          const entry = this.instruments.resolve(id, nowMs);
          if (!entry) {
            unfetched.push({
              id,
              reason: "Unknown or expired instrument identifier; verify exchange and contract symbol.",
              errorCode: "INVALID_SYMBOL",
            });
          } else {
            resolved.push(entry);
          }
        }

        const quotes: NormalizedMarketQuote[] = [];
        if (resolved.length > 0) {
          // Group tokens strictly by exchange (NSE/BSE/MCX) in one batched read-only quote call
          const exchangeTokens: Record<string, string[]> = {};
          const lookup = new Map<string, InstrumentMasterEntry>();
          for (const inst of resolved) {
            exchangeTokens[inst.exchange] ??= [];
            if (!exchangeTokens[inst.exchange].includes(inst.token)) {
              exchangeTokens[inst.exchange].push(inst.token);
            }
            lookup.set(`${inst.exchange}:${inst.token}`, inst);
          }

          const json = await this.postAuthorizedJson(
            QUOTE_PATH,
            { mode: "FULL", exchangeTokens },
            "quote",
            nowMs,
          );

          const data = (json.data ?? {}) as {
            fetched?: RawAngelOneQuoteItem[];
            unfetched?: Array<{ exchange?: string; symbolToken?: string; message?: string }>;
          };

          const fetchedMap = new Map<string, RawAngelOneQuoteItem>();
          for (const item of data.fetched ?? []) {
            const exch = String(item.exchange ?? "").toUpperCase();
            const tok = String(item.symbolToken ?? "").trim();
            if (exch && tok) fetchedMap.set(`${exch}:${tok}`, item);
          }

          for (const inst of resolved) {
            const raw = fetchedMap.get(`${inst.exchange}:${inst.token}`) ?? null;
            if (raw) {
              quotes.push(normalizeAngelOneQuote(inst, raw, nowMs));
            } else {
              const failInfo = (data.unfetched ?? []).find(
                (u) =>
                  String(u.exchange ?? "").toUpperCase() === inst.exchange &&
                  String(u.symbolToken ?? "").trim() === inst.token,
              );
              unfetched.push({
                id: inst.id,
                reason: redactText(
                  failInfo?.message ?? "Instrument returned in unfetched list by Angel One.",
                  this.knownSecrets,
                ),
                errorCode: "UPSTREAM_ERROR",
              });
            }
          }
        }

        const utc = new Date(nowMs).toISOString();
        return {
          provider: "Angel One SmartAPI",
          sourceMode: "PRIVATE_OWNER_FEED",
          serverTimestampUTC: utc,
          serverTimestampIST: formatIstTimestamp(nowMs) ?? utc,
          quotes,
          unfetched,
          sessions: getAllIndianExchangeSessions(nowMs),
        };
      },
      nowMs,
    );
  }

  /**
   * Independent historical OHLCV fetch. Failures here are isolated and never affect quote status.
   */
  async getCandles(
    id: string,
    interval: CandleInterval = "1d",
    days = 90,
    nowMs = Date.now(),
  ): Promise<NormalizedCandleSeries> {
    const inst = this.instruments.resolve(id, nowMs);
    if (!inst) {
      throw new ProviderRequestError(
        "INVALID_SYMBOL",
        "Instrument not found in active NSE/BSE/MCX master.",
        404,
      );
    }
    const maxDays = MAX_DAYS_BY_INTERVAL[interval];
    const boundedDays = Math.max(1, Math.min(maxDays, Math.round(days)));

    const cacheKey = `candles:${inst.id}:${interval}:${boundedDays}`;
    return this.candleCache.run(
      cacheKey,
      60_000,
      async () => {
        const fromMs = nowMs - boundedDays * 86_400_000;
        const json = await this.postAuthorizedJson(
          CANDLE_PATH,
          {
            exchange: inst.exchange,
            symboltoken: inst.token,
            interval: INTERVAL_MAP[interval],
            fromdate: formatAngelDateTimeIst(fromMs),
            todate: formatAngelDateTimeIst(nowMs),
          },
          "candle",
          nowMs,
        );
        return normalizeAngelOneCandles(inst, interval, json.data, nowMs);
      },
      nowMs,
    );
  }
}
