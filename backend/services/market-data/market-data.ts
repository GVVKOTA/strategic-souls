/** Official published daily observations. No exchange-price scrape or tick-feed claim. */
export const ECB_DAILY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_HISTORY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
export const ECB_SOURCE_URL =
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
export const ECB_RIGHTS_URL =
  "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html";
export const TREASURY_SOURCE_URL =
  "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics";
export const TREASURY_FEED_DOCUMENTATION =
  "https://home.treasury.gov/treasury-daily-interest-rate-xml-feed";
export const TREASURY_RIGHTS_URL =
  "https://www.copyright.gov/title17/92chap1.html#105";
const DAY_MS = 86_400_000;
const MAX_AGE_MS = 5 * DAY_MS;
const CACHE_MS = 15 * 60_000;
const FAILURE_BACKOFF_MS = 60_000;
const MAX_BYTES = 500_000;

export type DataState =
  "PUBLISHED_EOD" | "HISTORICAL" | "STALE" | "UNAVAILABLE" | "ERROR";
export type DataPoint = {
  id: string;
  label: string;
  assetClass: "FX" | "BOND_YIELD" | "EQUITY" | "INDEX" | "FUTURE";
  value: number | null;
  unit: string;
  currency: string;
  provider: string;
  sourceUrl: string;
  rightsUrl: string;
  eventAt: string | null;
  sourceDate: string | null;
  eventTimePrecision: "DATE";
  retrievedAt: string | null;
  state: DataState;
  frequency: "DAILY_REFERENCE" | "DAILY_YIELD" | "DAILY_OHLC" | "DAILY_CLOSE";
  reason: string;
  derivation: string | null;
  change: number | null;
  previousSessionClose?: number | null;
  changeUnit: "%" | "bp";
  canAnalyze: boolean;
};
export type FXHistory = {
  id: string;
  label: string;
  currency: string;
  unit: string;
  provider: "ECB";
  sourceUrl: string;
  asOfDate: string;
  retrievedAt: string;
  canAnalyze: boolean;
  derivation: string | null;
  points: { date: string; close: number; knownAt: string }[];
};
export type ProviderStatus = {
  id: string;
  label: string;
  state: "CONNECTED" | "ERROR" | "NOT_CONFIGURED";
  sourceUrl: string;
  rightsUrl: string;
  lastDataDate: string | null;
  lastSuccessAt: string | null;
  reason: string;
  frequency: string;
  apiFeeUsd: number | null;
  retryAfter: string | null;
};
export type MarketSnapshot = {
  asOf: string;
  providers: ProviderStatus[];
  quotes: DataPoint[];
  yields: DataPoint[];
  fxHistory: FXHistory[];
  disclosure: string;
  nextRefreshAfter: string;
};
export type EcbDay = { date: string; rates: Record<string, number> };
export type TreasuryDay = {
  date: string;
  rates: Record<string, number | null>;
};
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Cached = {
  text: string;
  retrievedAt: string;
  expiresAt: number;
  lastFailure: string | null;
  retryAt: number;
};
export type OfficialReferenceCache = {
  read: (url: string) => Promise<{ text: string; retrievedAt: string } | null>;
  write: (url: string, entry: { text: string; retrievedAt: string }) => Promise<void>;
};
const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<Cached>>();

function validDate(date: string, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const stamp = Date.parse(date + "T00:00:00Z");
  return (
    Number.isFinite(stamp) &&
    new Date(stamp).toISOString().slice(0, 10) === date &&
    date <= new Date(now).toISOString().slice(0, 10)
  );
}
function checkXml(text: string): void {
  if (text.length > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("Oversized or unsupported XML rejected.");
}
function attribute(text: string, name: string): string | null {
  return (
    new RegExp("(?:^|\\s)" + name + "\\s*=\\s*['\"]([^'\"]+)['\"]").exec(
      text,
    )?.[1] ?? null
  );
}
/** Small parser for the provider's fixed scalar XML schema. DTD/entities are rejected. */
export function parseEcb(text: string, now: number): EcbDay[] {
  checkXml(text);
  if (
    !text.includes("European Central Bank") ||
    !text.includes("eurofxref") ||
    !/<\/gesmes:Envelope>\s*$/.test(text)
  )
    throw new Error("Unexpected ECB document.");
  const days: EcbDay[] = [];
  for (const match of text.matchAll(
    /<Cube\s+([^>]*\btime\s*=\s*['"][^'"]+['"][^>]*)>([\s\S]*?)<\/Cube>/g,
  )) {
    const date = attribute(match[1], "time");
    if (!date || !validDate(date, now))
      throw new Error("Invalid or future ECB observation date.");
    const rates: Record<string, number> = { EUR: 1 };
    for (const rate of match[2].matchAll(/<Cube\s+([^>]+)\/>/g)) {
      const currency = attribute(rate[1], "currency"),
        raw = attribute(rate[1], "rate");
      if (!currency || !/^[A-Z]{3}$/.test(currency) || raw === null)
        throw new Error("Invalid ECB currency field.");
      const value = Number(raw);
      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 1e9 ||
        currency in rates
      )
        throw new Error("Invalid or duplicate ECB rate.");
      rates[currency] = value;
    }
    if (!rates.USD || Object.keys(rates).length < 2)
      throw new Error("ECB base USD rate missing.");
    days.push({ date, rates });
  }
  if (
    !days.length ||
    days.length > 100 ||
    new Set(days.map((d) => d.date)).size !== days.length
  )
    throw new Error("Missing, duplicate or excessive ECB observations.");
  return days.sort((a, b) => a.date.localeCompare(b.date));
}
const TENORS = [
  ["3M", "BC_3MONTH"],
  ["2Y", "BC_2YEAR"],
  ["5Y", "BC_5YEAR"],
  ["10Y", "BC_10YEAR"],
  ["30Y", "BC_30YEAR"],
] as const;
export function parseTreasury(text: string, now: number): TreasuryDay[] {
  checkXml(text);
  if (
    !text.includes("schemas.microsoft.com/ado") ||
    !text.includes("BC_10YEAR") ||
    !/<\/feed>\s*$/.test(text)
  )
    throw new Error("Unexpected Treasury document.");
  const rows: TreasuryDay[] = [];
  for (const match of text.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const raw = /<d:NEW_DATE\b[^>]*>([^<]+)<\/d:NEW_DATE>/.exec(match[1])?.[1],
      date = raw?.slice(0, 10);
    if (!date || !validDate(date, now))
      throw new Error("Invalid or future Treasury observation date.");
    const rates: Record<string, number | null> = {};
    for (const [tenor, key] of TENORS) {
      const token = new RegExp(
        "<d:" + key + "\\b([^>]*)>([^<]*)<\\/d:" + key + ">",
      ).exec(match[1]);
      if (
        !token ||
        /m:null\s*=\s*['"]true['"]/.test(token[1]) ||
        token[2].trim() === ""
      ) {
        rates[tenor] = null;
        continue;
      }
      const value = Number(token[2]);
      if (!Number.isFinite(value) || value < -10 || value > 100)
        throw new Error("Invalid Treasury yield.");
      rates[tenor] = value;
    }
    rows.push({ date, rates });
  }
  if (
    !rows.length ||
    rows.length > 40 ||
    new Set(rows.map((d) => d.date)).size !== rows.length
  )
    throw new Error("Missing, duplicate or excessive Treasury observations.");
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchText(
  url: string,
  fetcher: Fetcher,
  now: number,
  shared?: OfficialReferenceCache,
): Promise<Cached> {
  const local = cache.get(url);
  if (local && (local.expiresAt > now || local.retryAt > now)) return local;
  const running = inFlight.get(url);
  if (running) return running;
  const task = (async () => {
    let prior = local;
    if (shared) {
      try {
        const entry = await shared.read(url);
        const readAt = Date.parse(entry?.retrievedAt ?? "");
        if (entry && readAt <= now && now - readAt <= 7 * DAY_MS &&
            readAt > Date.parse(prior?.retrievedAt ?? "1970-01-01")) {
          if (url === ECB_HISTORY_URL) parseEcb(entry.text, now);
          else parseTreasury(entry.text, now);
          prior = { ...entry, expiresAt: readAt + CACHE_MS, lastFailure: null, retryAt: 0 };
          cache.set(url, prior);
          if (prior.expiresAt > now) return prior;
        }
      } catch {
        // Keep the upstream path available if the shared store cannot be read.
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let failureReason =
      "Provider connection unavailable. Please try again later.";
    try {
      // Workers supports manual/follow, not the Node-supported error mode.
      // Manual mode keeps the destination fixed; explicitly reject every redirect.
      const response = await Promise.resolve().then(() =>
        fetcher(url, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            Accept: "application/xml,text/xml;q=0.9",
            "User-Agent":
              "StrategicSouls-X1/1.0 (official daily data; 15 minute cache)",
          },
        }),
      );
      if (
        (response.status >= 300 && response.status < 400) ||
        response.redirected ||
        (response.url && new URL(response.url).href !== new URL(url).href)
      ) {
        failureReason =
          "Official source address changed. Awaiting verification.";
        await response.body?.cancel();
        throw new Error("Unexpected provider redirect rejected.");
      }
      if (!response.ok) {
        failureReason =
          "Official source temporarily unavailable. Please try again later.";
        throw new Error("Provider request was not successful.");
      }
      failureReason =
        "Official source data could not be verified. Please try again later.";
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > MAX_BYTES)
        throw new Error("Provider document exceeds size budget.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Provider returned no body.");
      const parts: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("Provider document exceeds size budget.");
        }
        parts.push(value);
      }
      const all = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        all.set(part, offset);
        offset += part.length;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(all);
      checkXml(text);
      const result: Cached = {
        text,
        retrievedAt: new Date(
          fetcher === fetch ? Date.now() : now,
        ).toISOString(),
        expiresAt: now + CACHE_MS,
        lastFailure: null,
        retryAt: 0,
      };
      // Cache only schema-valid observations; a malformed response cannot replace a last good value.
      if (url.includes("ecb.europa.eu")) parseEcb(text, now);
      else parseTreasury(text, now);
      cache.set(url, result);
      if (shared) await shared.write(url, result).catch(() => {});
      return result;
    } catch (error) {
      // Network/runtime/parser exception text is never copied into the product API.
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Provider request timed out. Please try again later."
          : failureReason;
      if (prior) {
        const result = {
          ...prior,
          lastFailure: message,
          retryAt: now + FAILURE_BACKOFF_MS,
          expiresAt: 0,
        };
        cache.set(url, result);
        return result;
      }
      const result: Cached = {
        text: "",
        retrievedAt: new Date(now).toISOString(),
        expiresAt: 0,
        lastFailure: message,
        retryAt: now + FAILURE_BACKOFF_MS,
      };
      cache.set(url, result);
      return result;
    } finally {
      clearTimeout(timeout);
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, task);
  return task;
}
type FxPair = { id: string; base: string; quote: string; derived: boolean };
export const OFFICIAL_FX_PAIRS: readonly FxPair[] = [
  ...["USD", "INR", "GBP", "JPY", "CHF", "CNY", "AUD", "CAD", "SGD", "HKD"].map(
    (quote) => ({ id: "ECB:EUR" + quote, base: "EUR", quote, derived: false }),
  ),
  { id: "ECB:USDINR", base: "USD", quote: "INR", derived: true },
  { id: "ECB:USDJPY", base: "USD", quote: "JPY", derived: true },
  { id: "ECB:GBPUSD", base: "GBP", quote: "USD", derived: true },
];
const fxValue = (day: EcbDay, pair: FxPair): number | null => {
  const a = day.rates[pair.base],
    b = day.rates[pair.quote],
    value = a && b ? b / a : null;
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
};
const percentChange = (
  value: number | null,
  prior: number | null,
): number | null => {
  if (value === null || prior === null) return null;
  const change = (value / prior - 1) * 100;
  return Number.isFinite(change) ? change : null;
};
function freshness(
  date: string | null,
  now: number,
  failure: string | null,
): DataState {
  if (!date) return "UNAVAILABLE";
  if (failure || now - Date.parse(date + "T00:00:00Z") > MAX_AGE_MS)
    return "STALE";
  return "PUBLISHED_EOD";
}
function ecbPoints(
  days: EcbDay[],
  retrievedAt: string | null,
  now: number,
  failure: string | null,
): { quotes: DataPoint[]; fxHistory: FXHistory[] } {
  const latest = days.at(-1),
    previous = days.at(-2),
    quotes: DataPoint[] = [],
    fxHistory: FXHistory[] = [];
  for (const pair of OFFICIAL_FX_PAIRS) {
    const value = latest ? fxValue(latest, pair) : null,
      prior = previous ? fxValue(previous, pair) : null;
    const state =
      value === null
        ? "UNAVAILABLE"
        : freshness(latest?.date ?? null, now, failure);
    const derivation = pair.derived
      ? `${pair.quote} per EUR divided by ${pair.base} per EUR; derived by Strategic Souls from same-date ECB reference rates.`
      : null;
    quotes.push({
      id: pair.id,
      label: `${pair.base} / ${pair.quote}`,
      assetClass: "FX",
      value,
      unit: `${pair.quote} per ${pair.base}`,
      currency: pair.quote,
      provider: "ECB",
      sourceUrl: ECB_SOURCE_URL,
      rightsUrl: ECB_RIGHTS_URL,
      eventAt: latest?.date ?? null,
      sourceDate: latest?.date ?? null,
      eventTimePrecision: "DATE",
      retrievedAt,
      state,
      frequency: "DAILY_REFERENCE",
      reason:
        failure ??
        (state === "STALE"
          ? "Observation exceeds the 5-calendar-day freshness budget."
          : "Published daily reference for information, not a live or executable FX quote."),
      derivation,
      change: percentChange(value, prior),
      changeUnit: "%",
      canAnalyze: value !== null && state === "PUBLISHED_EOD",
    });
    if (latest && retrievedAt) {
      const points = days
        .map((day) => ({
          date: day.date,
          close: fxValue(day, pair),
          knownAt: retrievedAt,
        }))
        .filter(
          (p): p is { date: string; close: number; knownAt: string } =>
            p.close !== null,
        );
      fxHistory.push({
        id: pair.id,
        label: `${pair.base} / ${pair.quote}`,
        currency: pair.quote,
        unit: `${pair.quote} per ${pair.base}`,
        provider: "ECB",
        sourceUrl: ECB_SOURCE_URL,
        asOfDate: latest.date,
        retrievedAt,
        canAnalyze: state === "PUBLISHED_EOD",
        derivation,
        points,
      });
    }
  }
  return { quotes, fxHistory };
}
function treasuryPoints(
  days: TreasuryDay[],
  retrievedAt: string | null,
  now: number,
  failure: string | null,
): DataPoint[] {
  const latest = days.at(-1),
    previous = days.at(-2);
  return TENORS.map(([tenor]) => {
    const value = latest?.rates[tenor] ?? null,
      prior = previous?.rates[tenor] ?? null,
      state =
        value === null
          ? "UNAVAILABLE"
          : freshness(latest?.date ?? null, now, failure);
    return {
      id: "UST:" + tenor,
      label: "US Treasury " + tenor,
      assetClass: "BOND_YIELD",
      value,
      unit: "% annual par yield",
      currency: "USD",
      provider: "US Treasury",
      sourceUrl: TREASURY_SOURCE_URL,
      rightsUrl: TREASURY_RIGHTS_URL,
      eventAt: latest?.date ?? null,
      sourceDate: latest?.date ?? null,
      eventTimePrecision: "DATE",
      retrievedAt,
      state,
      frequency: "DAILY_YIELD",
      reason:
        failure ??
        (state === "STALE"
          ? "Observation exceeds the 5-calendar-day freshness budget."
          : "Published daily par yield, not an executable bond quote."),
      derivation: null,
      change: value !== null && prior !== null ? (value - prior) * 100 : null,
      changeUnit: "bp",
      canAnalyze: value !== null && state === "PUBLISHED_EOD",
    };
  });
}
/** Provider failures are independent. The clock comes from the server, not a browser. */
export async function marketSnapshot(
  fetcher: Fetcher = fetch,
  now = Date.now(),
  shared?: OfficialReferenceCache,
): Promise<MarketSnapshot> {
  if (!Number.isFinite(now)) throw new Error("Valid server time required.");
  const asOf = new Date(now).toISOString(),
    month = asOf.slice(0, 7).replace("-", "");
  const treasuryUrl = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${month}`;
  const [ecb, treasury] = await Promise.all([
    fetchText(ECB_HISTORY_URL, fetcher, now, shared),
    fetchText(treasuryUrl, fetcher, now, shared),
  ]);
  let fxDays: EcbDay[] = [],
    yieldDays: TreasuryDay[] = [];
  try {
    if (ecb.text) fxDays = parseEcb(ecb.text, now);
  } catch {
    ecb.lastFailure =
      "Official ECB data could not be verified. Please try again later.";
  }
  try {
    if (treasury.text) yieldDays = parseTreasury(treasury.text, now);
  } catch {
    treasury.lastFailure =
      "Official Treasury data could not be verified. Please try again later.";
  }
  const { quotes, fxHistory } = ecbPoints(
    fxDays,
    fxDays.length ? ecb.retrievedAt : null,
    now,
    ecb.lastFailure,
  );
  const yields = treasuryPoints(
    yieldDays,
    yieldDays.length ? treasury.retrievedAt : null,
    now,
    treasury.lastFailure,
  );
  const providers: ProviderStatus[] = [
    {
      id: "ECB",
      label: "European Central Bank",
      state: fxDays.length && !ecb.lastFailure ? "CONNECTED" : "ERROR",
      sourceUrl: ECB_SOURCE_URL,
      rightsUrl: ECB_RIGHTS_URL,
      lastDataDate: fxDays.at(-1)?.date ?? null,
      lastSuccessAt: fxDays.length ? ecb.retrievedAt : null,
      reason:
        ecb.lastFailure ??
        "Official reference FX; free reuse with source attribution. Derived cross rates are disclosed.",
      frequency:
        "Usually around 16:00 CET on ECB working days; no transaction quotes.",
      apiFeeUsd: 0,
      retryAfter: ecb.lastFailure ? new Date(ecb.retryAt).toISOString() : null,
    },
    {
      id: "US Treasury",
      label: "US Treasury",
      state: yieldDays.length && !treasury.lastFailure ? "CONNECTED" : "ERROR",
      sourceUrl: TREASURY_SOURCE_URL,
      rightsUrl: TREASURY_RIGHTS_URL,
      lastDataDate: yieldDays.at(-1)?.date ?? null,
      lastSuccessAt: yieldDays.length ? treasury.retrievedAt : null,
      reason:
        treasury.lastFailure ??
        "Official daily par yield XML; US government factual data. No intraday bond feed.",
      frequency: "Daily publication; date-only observation precision.",
      apiFeeUsd: 0,
      retryAfter: treasury.lastFailure
        ? new Date(treasury.retryAt).toISOString()
        : null,
    },
    {
      id: "LICENSED_EXCHANGES",
      label:
        "Equities, indices, sectors, capital, India flows and commodity feeds",
      state: "NOT_CONFIGURED",
      sourceUrl: "https://www.nseindia.com/static/market-data/nse-data-policy",
      rightsUrl: "https://www.nseindia.com/static/market-data/non-display-data",
      lastDataDate: null,
      lastSuccessAt: null,
      reason:
        "No approved data key or display/non-display entitlement configured. Index values remain unavailable.",
      frequency: "Provider-specific; no universal real-time coverage.",
      apiFeeUsd: null,
      retryAfter: null,
    },
  ];
  return {
    asOf: new Date(fetcher === fetch ? Date.now() : now).toISOString(),
    providers,
    quotes,
    yields,
    fxHistory,
    disclosure:
      "ECB daily reference rates and US Treasury daily par yields are published observations, never verified live ticks. Source event dates and retrieval timestamps are separate. Historical release times are not supplied: knownAt is conservatively the current retrieval time, so these histories do not establish point-in-time backtest eligibility. ECB data can be obtained free from its source.",
    nextRefreshAfter: new Date(now + CACHE_MS).toISOString(),
  };
}

export const loadMarketData = marketSnapshot;

/** Used by isolated contract tests; never exposed by the HTTP API. */
export function clearMarketCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
