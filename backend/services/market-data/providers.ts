import type {
  Candle,
  Fundamental,
  Instrument,
  ProviderConfig,
  ProviderHealth,
  ProviderId,
  Rights,
  Statement,
  ResearchEvent,
} from "./data-types";
export const PROVIDERS = {
  EODHD: {
    label: "EODHD · EOD & fundamentals",
    secret: "X2_EODHD_API_TOKEN",
    docs: "https://eodhd.com/financial-apis/api-for-historical-data-and-volumes",
    rightsUrl:
      "https://eodhd.com/financial-apis/commercial-vs-personal-license-use",
    markets: ["NSE", "BSE", "GLOBAL"],
    datasets: ["candles", "fundamentals", "news"],
    status: "Implemented, contract/key required",
  },
  TRUEDATA: {
    label: "TrueData · India history",
    secret: "X2_TRUEDATA_BEARER_TOKEN",
    docs: "https://truedataapi.readme.io/reference/getbardata",
    rightsUrl: "https://www.truedata.in/",
    markets: ["NSE", "BSE", "MCX"],
    datasets: ["candles"],
    status: "Implemented EOD history, contract/token required",
  },
} as const;
export const EMPTY_HEALTH: ProviderHealth = {
  state: "NOT_CONFIGURED",
  checkedAt: null,
  lastEventAt: null,
  message: "Configure an approved server secret and verified dataset rights.",
  accepted: [],
  rejected: [],
  callsToday: 0,
  quotaRemaining: 0,
  latencyMs: null,
};
const string = (v: unknown, min: number, max: number) => {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
    throw new Error(`Enter ${min}–${max} characters.`);
  return v.trim();
};
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
export function providerId(v: unknown): ProviderId {
  if (v !== "EODHD" && v !== "TRUEDATA")
    throw new Error("Choose an implemented provider.");
  return v;
}
export function validateInstrument(
  value: unknown,
  provider: ProviderId,
): Instrument {
  const v = value as Instrument;
  if (!v || typeof v !== "object")
    throw new Error("Instrument mapping required.");
  const id = string(v.id, 3, 80),
    symbol = string(v.providerSymbol, 1, 60);
  if (!/^[A-Z0-9^._:-]+$/.test(id) || !/^[A-Z0-9^._-]+$/.test(symbol))
    throw new Error("Use exact source identifiers, not a URL or expression.");
  if (!(PROVIDERS[provider].markets as readonly string[]).includes(v.market))
    throw new Error("This adapter does not support the selected market.");
  if (
    !["EQUITY", "INDEX", "FUTURE"].includes(v.type) ||
    !id.startsWith(v.market + ":") ||
    !/^[A-Z0-9]{4}$/.test(v.mic) ||
    !/^[A-Z]{3}$/.test(v.currency)
  )
    throw new Error("Verify instrument market, MIC, type and currency.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: v.timezone }).format();
  } catch {
    throw new Error("Use a valid IANA timezone.");
  }
  if (
    v.type === "FUTURE" &&
    (!v.expiry ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v.expiry) ||
      !finite(v.lotSize) ||
      v.lotSize! <= 0 ||
      !finite(v.tickSize) ||
      v.tickSize! <= 0)
  )
    throw new Error(
      "Futures need the exact expiry, lot and tick size; continuous contracts are not execution contracts.",
    );
  return {
    id,
    name: string(v.name, 1, 120),
    symbol: string(v.symbol, 1, 60),
    providerSymbol: symbol,
    market: v.market,
    mic: v.mic,
    type: v.type,
    currency: v.currency,
    unit: string(v.unit, 1, 80),
    timezone: v.timezone,
    ...(v.type === "FUTURE"
      ? { expiry: v.expiry, lotSize: v.lotSize, tickSize: v.tickSize }
      : {}),
  };
}
export function validateConfig(value: unknown): ProviderConfig {
  const v = value as ProviderConfig;
  if (!v || typeof v !== "object")
    throw new Error("Provider configuration required.");
  const p = providerId(v.provider);
  const r = v.rights as Rights;
  if (
    !r ||
    typeof r !== "object" ||
    ["display", "analysis", "storage", "redistribution", "verified"].some(
      (k) => typeof r[k as keyof Rights] !== "boolean",
    ) ||
    !Number.isInteger(r.cacheSeconds) ||
    (r.derivedDisplay !== undefined && typeof r.derivedDisplay !== "boolean") ||
    r.cacheSeconds < 0 ||
    r.cacheSeconds > 900 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(r.expiresAt) ||
    !Number.isFinite(Date.parse(r.expiresAt))
  )
    throw new Error(
      "Record explicit rights, expiry and a 0–900 second cache allowance.",
    );
  const contractReference = string(r.contractReference, 3, 200);
  if (
    !Array.isArray(v.instruments) ||
    v.instruments.length < 1 ||
    v.instruments.length > 800
  )
    throw new Error("Map 1–800 exact licensed instruments.");
  const instruments = v.instruments.map((i) => validateInstrument(i, p));
  if (new Set(instruments.map((i) => i.id)).size !== instruments.length)
    throw new Error("Duplicate instrument mapping.");
  if (
    !Array.isArray(v.datasets) ||
    !v.datasets.length ||
    v.datasets.some(
      (d) => !(PROVIDERS[p].datasets as readonly string[]).includes(d),
    )
  )
    throw new Error("Dataset unsupported by this adapter.");
  if (
    !Number.isInteger(v.dailyCallLimit) ||
    v.dailyCallLimit < 1 ||
    v.dailyCallLimit > 1000 ||
    !Number.isInteger(v.priority) ||
    v.priority < 1 ||
    v.priority > 10 ||
    typeof v.enabled !== "boolean"
  )
    throw new Error("Use a 1–1000 daily call cap and priority 1–10.");
  return {
    provider: p,
    enabled: v.enabled,
    priority: v.priority,
    version: Number.isInteger(v.version) && v.version >= 0 ? v.version : 0,
    rights: {
      display: r.display,
      analysis: r.analysis,
      storage: r.storage,
      redistribution: r.redistribution,
      derivedDisplay: r.derivedDisplay === true,
      verified: r.verified,
      cacheSeconds: r.cacheSeconds,
      expiresAt: r.expiresAt,
      contractReference,
    },
    instruments,
    datasets: [...new Set(v.datasets)],
    dailyCallLimit: v.dailyCallLimit,
    lastWrite: string(v.lastWrite, 16, 80),
  };
}
export function rightsActive(
  config: ProviderConfig,
  need: "display" | "analysis" | "storage",
  now = Date.now(),
) {
  return (
    config.enabled &&
    config.rights.verified &&
    config.rights[need] &&
    Date.parse(config.rights.expiresAt) > now
  );
}
export function secretFrom(
  provider: ProviderId,
  environment: Record<string, unknown>,
): string | null {
  const value = environment[PROVIDERS[provider].secret];
  return typeof value === "string" &&
    value !== "demo" &&
    /^\S{8,2048}$/.test(value)
    ? value
    : null;
}
export class ProviderFailure extends Error {
  constructor(
    public code:
      "AUTH_FAILED" | "RATE_LIMITED" | "PROVIDER_DOWN" | "INVALID_DATA",
    message: string,
  ) {
    super(message);
  }
}
export async function fetchProviderJson(
  url: URL,
  headers: Record<string, string>,
  fetcher: typeof fetch = fetch,
) {
  if (
    !["eodhd.com", "history.truedata.in"].includes(url.hostname) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new ProviderFailure(
      "INVALID_DATA",
      "Provider address is not permitted.",
    );
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url.toString(), {
      headers: { Accept: "application/json", ...headers },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new ProviderFailure(
        "AUTH_FAILED",
        "Provider rejected authentication or the dataset entitlement.",
      );
    if (response.status === 429)
      throw new ProviderFailure(
        "RATE_LIMITED",
        "Provider request quota reached.",
      );
    if (
      !response.ok ||
      response.redirected ||
      response.status >= 300 ||
      (response.url && new URL(response.url).href !== url.href)
    )
      throw new ProviderFailure(
        "PROVIDER_DOWN",
        "Provider is unavailable or changed its address.",
      );
    if (Number(response.headers.get("content-length") || 0) > 800000)
      throw new ProviderFailure(
        "INVALID_DATA",
        "Provider response exceeds the data budget.",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 800000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(all));
  } catch (e) {
    if (e instanceof ProviderFailure) throw e;
    throw new ProviderFailure(
      "PROVIDER_DOWN",
      "Provider response could not be verified. Retry later.",
    );
  } finally {
    clearTimeout(timer);
  }
}
function date(v: unknown, now: number): string {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v ||
    Date.parse(v) > now
  )
    throw new ProviderFailure("INVALID_DATA", "Invalid or future source date.");
  return v;
}
export function normalizeEod(value: unknown, now = Date.now()): Candle[] {
  if (!Array.isArray(value) || value.length > 1500)
    throw new ProviderFailure("INVALID_DATA", "Invalid EOD history response.");
  const rows = value
    .map((v) => {
      if (
        !v ||
        !["open", "high", "low", "close"].every(
          (k) => finite(v[k]) && v[k] > 0,
        ) ||
        v.high < Math.max(v.open, v.close) ||
        v.low > Math.min(v.open, v.close) ||
        v.low > v.high ||
        (v.volume != null && (!finite(v.volume) || v.volume < 0)) ||
        (v.adjusted_close != null &&
          (!finite(v.adjusted_close) || v.adjusted_close <= 0))
      )
        throw new ProviderFailure(
          "INVALID_DATA",
          "Invalid OHLC, volume or adjustment.",
        );
      return {
        date: date(v.date, now),
        open: v.open,
        high: v.high,
        low: v.low,
        close: v.close,
        volume: v.volume ?? null,
        adjustedClose: v.adjusted_close ?? null,
        openInterest: null,
        knownAt: new Date(now).toISOString(),
        adjustment: "RAW_OHLC_ADJUSTED_CLOSE" as const,
        provider: "EODHD",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(rows.map((r) => r.date)).size !== rows.length)
    throw new ProviderFailure("INVALID_DATA", "Duplicate source date.");
  return rows;
}
export function normalizeTrueData(value: unknown, now = Date.now()): Candle[] {
  const v = value as { status?: unknown; records?: unknown[][] };
  if (
    !v ||
    v.status !== "Success" ||
    !Array.isArray(v.records) ||
    v.records.length > 1501
  )
    throw new ProviderFailure(
      "INVALID_DATA",
      "TrueData did not return a successful bounded history.",
    );
  const rows = v.records.slice(1).map((r) => {
    if (!Array.isArray(r) || r.length < 6 || typeof r[0] !== "string")
      throw new ProviderFailure("INVALID_DATA", "Invalid TrueData record.");
    return {
      date: r[0].slice(0, 10),
      open: r[1],
      high: r[2],
      low: r[3],
      close: r[4],
      volume: r[5],
      oi: r[6],
    };
  });
  const out = normalizeEod(rows, now);
  return out.map((r) => {
    const oi = rows.find((v) => v.date === r.date)?.oi;
    if (
      oi != null &&
      (typeof oi !== "number" || !Number.isFinite(oi) || oi < 0)
    )
      throw new ProviderFailure("INVALID_DATA", "Invalid open interest.");
    return {
      ...r,
      adjustment: "RAW",
      openInterest: typeof oi === "number" ? oi : null,
      provider: "TrueData",
    };
  });
}
export async function providerCandles(
  config: ProviderConfig,
  instrument: Instrument,
  secret: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  if (instrument.expiry && Date.parse(instrument.expiry + "T23:59:59Z") < now)
    throw new ProviderFailure(
      "INVALID_DATA",
      "Expired contract; select a verified current contract.",
    );
  const to = new Date(now).toISOString().slice(0, 10),
    from = new Date(now - 370 * 86400000).toISOString().slice(0, 10);
  let url: URL,
    headers: Record<string, string> = {};
  if (config.provider === "EODHD") {
    url = new URL(
      "https://eodhd.com/api/eod/" +
        encodeURIComponent(instrument.providerSymbol),
    );
    url.search = new URLSearchParams({
      api_token: secret,
      fmt: "json",
      period: "d",
      order: "a",
      from,
      to,
    }).toString();
  } else {
    url = new URL("https://history.truedata.in/getbars");
    const td = (v: string, end: boolean) =>
      v.replaceAll("-", "").slice(2) + (end ? "T23:59:59" : "T00:00:00");
    url.search = new URLSearchParams({
      symbol: instrument.providerSymbol,
      from: td(from, false),
      to: td(to, true),
      interval: "eod",
      response: "json",
    }).toString();
    headers = { Authorization: "Bearer " + secret };
  }
  const data = await fetchProviderJson(url, headers, fetcher);
  return config.provider === "EODHD"
    ? normalizeEod(data, now)
    : normalizeTrueData(data, now);
}

function parseIntradayIso(raw: unknown, now: number, assumeIst = false): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ProviderFailure("INVALID_DATA", "Missing intraday timestamp.");
  }
  const s = raw.trim();
  let candidate = s;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(s)) {
    const normalized = s.replace(" ", "T");
    const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
    candidate = assumeIst ? `${withSeconds}+05:30` : `${withSeconds}Z`;
  }
  const ms = Date.parse(candidate);
  if (!Number.isFinite(ms) || ms > now) {
    throw new ProviderFailure("INVALID_DATA", "Invalid or future intraday timestamp.");
  }
  return new Date(ms).toISOString();
}

export function normalizeTrueDataIntraday(value: unknown, now = Date.now()): Candle[] {
  const v = value as { status?: unknown; records?: unknown[][] };
  if (
    !v ||
    v.status !== "Success" ||
    !Array.isArray(v.records) ||
    v.records.length > 2501
  ) {
    throw new ProviderFailure(
      "INVALID_DATA",
      "TrueData did not return a successful bounded intraday history.",
    );
  }
  const rows: Candle[] = [];
  const seen = new Set<string>();
  for (const r of v.records.slice(1)) {
    if (!Array.isArray(r) || r.length < 6 || typeof r[0] !== "string") {
      throw new ProviderFailure("INVALID_DATA", "Invalid TrueData intraday record.");
    }
    const open = r[1] as number;
    const high = r[2] as number;
    const low = r[3] as number;
    const close = r[4] as number;
    const volume = r[5] as number | null | undefined;
    const oi = r[6] as number | null | undefined;
    if (
      ![open, high, low, close].every((n) => finite(n) && n > 0) ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high ||
      (volume != null && (!finite(volume) || volume < 0)) ||
      (oi != null && (!finite(oi) || oi < 0))
    ) {
      throw new ProviderFailure("INVALID_DATA", "Invalid intraday OHLCV values.");
    }
    const iso = parseIntradayIso(r[0], now, true);
    if (seen.has(iso)) {
      throw new ProviderFailure("INVALID_DATA", "Duplicate intraday timestamp.");
    }
    seen.add(iso);
    rows.push({
      date: iso,
      open,
      high,
      low,
      close,
      adjustedClose: null,
      volume: typeof volume === "number" ? volume : null,
      openInterest: typeof oi === "number" ? oi : null,
      knownAt: new Date(now).toISOString(),
      adjustment: "RAW",
      provider: "TrueData",
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeEodIntraday(value: unknown, now = Date.now()): Candle[] {
  if (!Array.isArray(value) || value.length > 2500) {
    throw new ProviderFailure("INVALID_DATA", "Invalid intraday history response.");
  }
  const rows: Candle[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (
      !v ||
      typeof v !== "object" ||
      !["open", "high", "low", "close"].every(
        (k) => finite((v as Record<string, unknown>)[k]) && ((v as Record<string, number>)[k] > 0),
      )
    ) {
      throw new ProviderFailure("INVALID_DATA", "Invalid intraday OHLC values.");
    }
    const rec = v as Record<string, unknown>;
    const open = rec.open as number;
    const high = rec.high as number;
    const low = rec.low as number;
    const close = rec.close as number;
    const volume = rec.volume as number | null | undefined;
    if (
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high ||
      (volume != null && (!finite(volume) || volume < 0))
    ) {
      throw new ProviderFailure("INVALID_DATA", "Invalid intraday OHLCV bounds.");
    }
    const iso =
      typeof rec.timestamp === "number" && Number.isFinite(rec.timestamp)
        ? parseIntradayIso(new Date(rec.timestamp * 1000).toISOString(), now, false)
        : parseIntradayIso(rec.datetime ?? rec.date, now, false);
    if (seen.has(iso)) {
      throw new ProviderFailure("INVALID_DATA", "Duplicate intraday timestamp.");
    }
    seen.add(iso);
    rows.push({
      date: iso,
      open,
      high,
      low,
      close,
      adjustedClose: null,
      volume: typeof volume === "number" ? volume : null,
      openInterest: null,
      knownAt: new Date(now).toISOString(),
      adjustment: "RAW",
      provider: "EODHD",
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function providerIntradayCandles(
  config: ProviderConfig,
  instrument: Instrument,
  secret: string,
  interval: "30m" | "1h" = "1h",
  days = 45,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<Candle[]> {
  if (instrument.expiry && Date.parse(instrument.expiry + "T23:59:59Z") < now) {
    throw new ProviderFailure(
      "INVALID_DATA",
      "Expired contract; select a verified current contract.",
    );
  }
  const boundedDays = Math.max(7, Math.min(60, Math.round(days)));
  const fromMs = now - boundedDays * 86_400_000;
  let url: URL;
  let headers: Record<string, string> = {};
  if (config.provider === "EODHD") {
    if (interval === "30m") {
      throw new ProviderFailure(
        "INVALID_DATA",
        "EODHD does not publish native 30-minute bars; 30m bars are never synthesized from other intervals.",
      );
    }
    url = new URL(
      "https://eodhd.com/api/intraday/" +
        encodeURIComponent(instrument.providerSymbol),
    );
    url.search = new URLSearchParams({
      api_token: secret,
      fmt: "json",
      interval,
      from: String(Math.floor(fromMs / 1000)),
      to: String(Math.floor(now / 1000)),
    }).toString();
  } else {
    url = new URL("https://history.truedata.in/getbars");
    const toDate = new Date(now).toISOString().slice(0, 10);
    const fromDate = new Date(fromMs).toISOString().slice(0, 10);
    const td = (v: string, end: boolean) =>
      v.replaceAll("-", "").slice(2) + (end ? "T23:59:59" : "T00:00:00");
    url.search = new URLSearchParams({
      symbol: instrument.providerSymbol,
      from: td(fromDate, false),
      to: td(toDate, true),
      interval: interval === "30m" ? "30min" : "60min",
      response: "json",
    }).toString();
    headers = { Authorization: "Bearer " + secret };
  }
  const data = await fetchProviderJson(url, headers, fetcher);
  return config.provider === "EODHD"
    ? normalizeEodIntraday(data, now)
    : normalizeTrueDataIntraday(data, now);
}
export async function providerFundamentals(
  instrument: Instrument,
  secret: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(
    "https://eodhd.com/api/v1.1/fundamentals/" +
      encodeURIComponent(instrument.providerSymbol),
  );
  url.search = new URLSearchParams({
    api_token: secret,
    fmt: "json",
    filter: "Financials",
  }).toString();
  const value = (await fetchProviderJson(url, {}, fetcher)) as Record<
    string,
    unknown
  >;
  return normalizeStatements(value, instrument.currency);
}
export function normalizeStatements(
  value: unknown,
  currency: string,
): Statement[] {
  if (!value || typeof value !== "object")
    throw new ProviderFailure("INVALID_DATA", "Invalid financial statements.");
  const v = value as Record<string, unknown>,
    root = (v.Financials ?? v) as Record<string, unknown>;
  const out: Statement[] = [];
  for (const [key, kind] of [
    ["Income_Statement", "Income"],
    ["Balance_Sheet", "Balance sheet"],
    ["Cash_Flow", "Cash flow"],
  ] as const) {
    const section = root[key] as Record<string, unknown> | undefined;
    if (!section) continue;
    for (const frequency of ["quarterly", "yearly"]) {
      const periods = section[frequency];
      if (!periods || typeof periods !== "object") continue;
      for (const [period, raw] of Object.entries(periods).slice(0, 12)) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(period) ||
          !Number.isFinite(Date.parse(period)) ||
          new Date(period).toISOString().slice(0, 10) !== period ||
          Date.parse(period) > Date.now() ||
          !raw ||
          typeof raw !== "object"
        )
          continue;
        const r = raw as Record<string, unknown>,
          values: Record<string, number | null> = {};
        for (const field of [
          "totalRevenue",
          "netIncome",
          "grossProfit",
          "operatingIncome",
          "totalAssets",
          "totalLiab",
          "totalStockholderEquity",
          "shortLongTermDebtTotal",
          "totalCashFromOperatingActivities",
          "capitalExpenditures",
          "freeCashFlow",
        ]) {
          const n = r[field];
          if (n !== undefined)
            values[field] =
              (typeof n === "number" ||
                (typeof n === "string" && n.trim() !== "")) &&
              Number.isFinite(Number(n))
                ? Number(n)
                : null;
        }
        out.push({
          kind,
          period: period + " · " + frequency,
          currency:
            typeof r.currency_symbol === "string" &&
            /^[A-Z]{3}$/.test(r.currency_symbol)
              ? r.currency_symbol
              : "UNKNOWN",
          basis: "Unspecified provider basis",
          qualityNotes: [
            "Standalone/consolidated basis not supplied; do not infer comparability.",
            "Filing date may be unavailable; missing/invalid/future publication dates are null and cannot support point-in-time use.",
          ],
          knownAt:
            typeof r.filing_date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(r.filing_date) &&
            Number.isFinite(Date.parse(r.filing_date)) &&
            new Date(r.filing_date).toISOString().slice(0, 10) ===
              r.filing_date &&
            Date.parse(r.filing_date) <= Date.now() &&
            r.filing_date >= period
              ? r.filing_date
              : null,
          values,
        });
      }
    }
  }
  void currency;
  return out.sort((a, b) => b.period.localeCompare(a.period));
}
export function statementMetrics(statements: Statement[]): Fundamental[] {
  const income = statements.find((s) => s.kind === "Income");
  return income
    ? Object.entries(income.values).map(([metric, value]) => ({
        metric,
        value,
        unit: income.currency,
        period: income.period,
        knownAt: income.knownAt,
        basis: income.basis,
      }))
    : [];
}
export async function providerNews(
  instrument: Instrument,
  secret: string,
  fetcher: typeof fetch = fetch,
): Promise<ResearchEvent[]> {
  const url = new URL("https://eodhd.com/api/news");
  url.search = new URLSearchParams({
    api_token: secret,
    fmt: "json",
    s: instrument.providerSymbol,
    limit: "20",
  }).toString();
  const value = await fetchProviderJson(url, {}, fetcher);
  if (!Array.isArray(value) || value.length > 20)
    throw new ProviderFailure("INVALID_DATA", "Invalid news response.");
  return value.flatMap((v) => {
    try {
      const link = new URL(v.link);
      if (
        link.protocol !== "https:" ||
        typeof v.title !== "string" ||
        !Number.isFinite(Date.parse(v.date))
      )
        return [];
      return [
        {
          title: v.title.slice(0, 240),
          date: v.date,
          sourceUrl: link.href,
          type: "Provider news · publisher link",
        },
      ];
    } catch {
      return [];
    }
  });
}

// ── X5.5 Unified Market-Data-Ready Validation & Entitlement Contract ─────────
// Extends existing EODHD / TrueData / Angel One adapters without adding keys or
// duplicating provider clients. Ready for plug-and-play licensed market feeds.

export type FeedGranularity = "30m" | "1h" | "1d" | "1wk" | "1mo";

export type FeedEntitlementAction =
  | "display"
  | "derivedDisplay"
  | "analysis"
  | "storage"
  | "publicRedistribution";

export type FeedQuotaEnvelope = {
  maxConcurrency: number;
  dailyCallLimit: number;
  callsUsed: number;
};

export type NormalizedFeedBatch = {
  providerId: string;
  sourceAttribution: string;
  instrument: Instrument;
  granularity: FeedGranularity;
  retrievedAt: string;
  maxStaleMs: number;
  rights: Rights;
  quota?: FeedQuotaEnvelope;
  candles: Candle[];
};

export type FeedEntitlementDecision = {
  allowed: boolean;
  cacheSeconds: number;
  reason: string | null;
};

export type FeedContractValidation = {
  valid: boolean;
  stale: boolean;
  ageMs: number | null;
  errors: string[];
  warnings: string[];
  entitlements: Record<FeedEntitlementAction, FeedEntitlementDecision>;
  normalizedCount: number;
};

const VALID_GRANULARITIES = new Set<FeedGranularity>([
  "30m",
  "1h",
  "1d",
  "1wk",
  "1mo",
]);
const VALID_ADJUSTMENTS = new Set<Candle["adjustment"]>([
  "RAW_OHLC_ADJUSTED_CLOSE",
  "RAW",
  "REFERENCE_ONLY",
]);

function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Evaluates license entitlements separately from transport success.
 * HTTP 200 from an upstream provider NEVER grants display, storage, or redistribution rights.
 * Retail broker feeds (e.g. Angel One SmartAPI) ALWAYS fail closed for public redistribution.
 */
export function evaluateFeedEntitlement(
  providerId: string,
  rights: Rights,
  action: FeedEntitlementAction,
  now = Date.now(),
): FeedEntitlementDecision {
  if (!rights || rights.verified !== true) {
    return {
      allowed: false,
      cacheSeconds: 0,
      reason: "Provider license entitlement is not verified; fail-closed.",
    };
  }
  const expMs = Date.parse(rights.expiresAt);
  if (!Number.isFinite(expMs) || expMs <= now) {
    return {
      allowed: false,
      cacheSeconds: 0,
      reason: "Provider license entitlement has expired or has an invalid expiry.",
    };
  }
  if (
    action === "publicRedistribution" &&
    /angel\s*one|angelone|smartapi/i.test(providerId)
  ) {
    return {
      allowed: false,
      cacheSeconds: 0,
      reason:
        "Retail broker feed (Angel One SmartAPI) is strictly owner-only and cannot be redistributed publicly.",
    };
  }
  const cacheSeconds =
    Number.isFinite(rights.cacheSeconds) && rights.cacheSeconds > 0
      ? Math.floor(rights.cacheSeconds)
      : 0;
  if (action === "display") {
    return rights.display
      ? { allowed: true, cacheSeconds, reason: null }
      : { allowed: false, cacheSeconds: 0, reason: "Display right not granted." };
  }
  if (action === "derivedDisplay") {
    return rights.derivedDisplay === true
      ? { allowed: true, cacheSeconds, reason: null }
      : {
          allowed: false,
          cacheSeconds: 0,
          reason: "Derived-display right not explicitly granted.",
        };
  }
  if (action === "analysis") {
    return rights.analysis
      ? { allowed: true, cacheSeconds, reason: null }
      : { allowed: false, cacheSeconds: 0, reason: "Analysis right not granted." };
  }
  if (action === "storage") {
    return rights.storage
      ? { allowed: true, cacheSeconds, reason: null }
      : { allowed: false, cacheSeconds: 0, reason: "Storage right not granted." };
  }
  return rights.redistribution
    ? { allowed: true, cacheSeconds, reason: null }
    : {
        allowed: false,
        cacheSeconds: 0,
        reason: "Public redistribution right not granted.",
      };
}

/**
 * Validates a normalized market-data batch across canonical identity, timezone, currency/unit,
 * futures metadata, OHLCV bounds, corporate-action tagging, duplicate/staleness checks,
 * quota/concurrency caps, and fail-closed license entitlements.
 */
export function validateFeedBatchContract(
  batch: NormalizedFeedBatch,
  now = Date.now(),
): FeedContractValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!batch.providerId?.trim()) errors.push("Missing providerId.");
  if (!batch.sourceAttribution?.trim()) {
    errors.push("Missing sourceAttribution.");
  }

  const inst = batch.instrument;
  if (!inst) {
    errors.push("Missing canonical instrument descriptor.");
  } else {
    if (!/^[A-Z0-9_-]+:[A-Z0-9._-]+$/.test(inst.id)) {
      errors.push(`Invalid canonical instrument ID: ${String(inst.id)}`);
    }
    if (!/^[A-Z]{4}$/.test(inst.mic)) {
      errors.push(`Invalid ISO-10383 MIC: ${String(inst.mic)}`);
    }
    if (!isValidIanaTimeZone(inst.timezone)) {
      errors.push(`Invalid IANA timezone: ${String(inst.timezone)}`);
    }
    if (!/^[A-Z]{3}$/.test(inst.currency)) {
      errors.push(`Invalid ISO currency code: ${String(inst.currency)}`);
    }
    if (!inst.unit?.trim()) {
      errors.push("Missing instrument price unit.");
    }
    if (inst.type === "FUTURE") {
      if (!inst.expiry || !/^\d{4}-\d{2}-\d{2}$/.test(inst.expiry)) {
        errors.push("Futures instrument requires YYYY-MM-DD expiry.");
      } else if (Date.parse(inst.expiry + "T23:59:59Z") < now) {
        errors.push(`Futures contract expired on ${inst.expiry}.`);
      }
      if (
        typeof inst.lotSize !== "number" ||
        !finite(inst.lotSize) ||
        inst.lotSize <= 0
      ) {
        errors.push("Futures instrument requires positive lotSize.");
      }
      if (
        typeof inst.tickSize !== "number" ||
        !finite(inst.tickSize) ||
        inst.tickSize <= 0
      ) {
        errors.push("Futures instrument requires positive tickSize.");
      }
    }
  }

  if (!VALID_GRANULARITIES.has(batch.granularity)) {
    errors.push(`Unsupported granularity: ${String(batch.granularity)}`);
  }

  const retrievedMs = Date.parse(batch.retrievedAt);
  if (!Number.isFinite(retrievedMs)) {
    errors.push("Invalid retrievedAt ISO timestamp.");
  } else if (retrievedMs > now + 60_000) {
    errors.push("retrievedAt cannot be in the future.");
  }

  if (batch.quota) {
    if (!Number.isInteger(batch.quota.maxConcurrency) || batch.quota.maxConcurrency < 1) {
      errors.push("Quota maxConcurrency must be >= 1.");
    }
    if (!Number.isInteger(batch.quota.dailyCallLimit) || batch.quota.dailyCallLimit < 1) {
      errors.push("Quota dailyCallLimit must be >= 1.");
    }
    if (
      !Number.isInteger(batch.quota.callsUsed) ||
      batch.quota.callsUsed < 0 ||
      batch.quota.callsUsed > batch.quota.dailyCallLimit
    ) {
      errors.push("Quota callsUsed exceeds dailyCallLimit or is invalid.");
    }
  }

  const seenDates = new Set<string>();
  let latestBarMs = -Infinity;
  let prevDate = "";

  if (!Array.isArray(batch.candles)) {
    errors.push("candles must be an array.");
  } else {
    for (let i = 0; i < batch.candles.length; i++) {
      const c = batch.candles[i];
      if (!c) {
        errors.push(`Candle[${i}] is null/undefined.`);
        continue;
      }
      const barMs = Date.parse(c.date);
      if (!Number.isFinite(barMs)) {
        errors.push(`Candle[${i}] has invalid date/timestamp.`);
      } else {
        if (barMs > now + 60_000) {
          errors.push(`Candle[${i}] date ${c.date} is in the future.`);
        }
        if (barMs > latestBarMs) latestBarMs = barMs;
      }
      if (seenDates.has(c.date)) {
        errors.push(`Duplicate candle timestamp: ${c.date}`);
      }
      seenDates.add(c.date);
      if (prevDate && c.date < prevDate) {
        errors.push(`Candles not chronologically sorted at ${c.date}.`);
      }
      prevDate = c.date;

      if (
        !finite(c.open) ||
        !finite(c.high) ||
        !finite(c.low) ||
        !finite(c.close) ||
        c.open <= 0 ||
        c.high <= 0 ||
        c.low <= 0 ||
        c.close <= 0
      ) {
        errors.push(`Candle[${i}] has non-finite or non-positive OHLC.`);
      } else if (
        c.high < Math.max(c.open, c.close) ||
        c.low > Math.min(c.open, c.close) ||
        c.low > c.high
      ) {
        errors.push(`Candle[${i}] violates OHLC high/low envelope.`);
      }
      if (c.volume !== null && (!finite(c.volume) || c.volume < 0)) {
        errors.push(`Candle[${i}] has invalid volume (use null when missing).`);
      }
      if (c.openInterest !== null && (!finite(c.openInterest) || c.openInterest < 0)) {
        errors.push(`Candle[${i}] has invalid openInterest.`);
      }
      if (c.adjustedClose !== null && (!finite(c.adjustedClose) || c.adjustedClose <= 0)) {
        errors.push(`Candle[${i}] has invalid adjustedClose.`);
      }
      if (!VALID_ADJUSTMENTS.has(c.adjustment)) {
        errors.push(`Candle[${i}] has invalid adjustment tag.`);
      }
      const knownMs = Date.parse(c.knownAt);
      if (!Number.isFinite(knownMs) || knownMs > now + 60_000) {
        errors.push(`Candle[${i}] has invalid or future knownAt timestamp.`);
      }
    }
    if (batch.candles.length === 0) {
      warnings.push("Feed batch returned zero candles (fail-closed: never fabricate prices).");
    }
  }

  const ageMs =
    Number.isFinite(retrievedMs) && latestBarMs > -Infinity
      ? Math.max(0, now - Math.max(retrievedMs, latestBarMs))
      : null;
  const stale =
    ageMs !== null &&
    Number.isFinite(batch.maxStaleMs) &&
    batch.maxStaleMs > 0 &&
    ageMs > batch.maxStaleMs;
  if (stale) {
    warnings.push(
      `Feed batch is stale (${Math.round((ageMs ?? 0) / 1000)}s > max ${Math.round(batch.maxStaleMs / 1000)}s).`,
    );
  }

  const entitlements: Record<FeedEntitlementAction, FeedEntitlementDecision> = {
    display: evaluateFeedEntitlement(batch.providerId, batch.rights, "display", now),
    derivedDisplay: evaluateFeedEntitlement(
      batch.providerId,
      batch.rights,
      "derivedDisplay",
      now,
    ),
    analysis: evaluateFeedEntitlement(batch.providerId, batch.rights, "analysis", now),
    storage: evaluateFeedEntitlement(batch.providerId, batch.rights, "storage", now),
    publicRedistribution: evaluateFeedEntitlement(
      batch.providerId,
      batch.rights,
      "publicRedistribution",
      now,
    ),
  };

  return {
    valid: errors.length === 0,
    stale,
    ageMs,
    errors,
    warnings,
    entitlements,
    normalizedCount: Array.isArray(batch.candles) ? batch.candles.length : 0,
  };
}
