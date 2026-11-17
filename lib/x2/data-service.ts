import { env } from "cloudflare:workers";
import { database, rate } from "../repository";
import { HttpError } from "../security";
import { loadMarketData, type DataPoint } from "../x1/market-data";
import type { ScanDataset } from "../x1/scan";
import type {
  AssetResearch,
  ChartLayout,
  Drawing,
  Interval,
  ProviderConfig,
  ProviderHealth,
  ProviderId,
} from "./data-types";
import { aggregateCandles, aggregateReferences } from "./chart-analytics";
import {
  EMPTY_HEALTH,
  PROVIDERS,
  ProviderFailure,
  providerCandles,
  providerFundamentals,
  providerNews,
  providerId,
  rightsActive,
  secretFrom,
  statementMetrics,
  validateConfig,
} from "./providers";
import { X2_INSTRUMENTS, registryInstrument } from "./instrument-registry";
type ConfigRow = {
  provider: ProviderId;
  version: number;
  payload: string;
  health: string;
  updated_at: string;
  last_write: string;
};
const environment = () => env as unknown as Record<string, unknown>;
export function isDataOwner(subject: string) {
  const owner = environment().X2_OWNER_SUBJECT;
  return typeof owner === "string" && owner.length > 0 && owner === subject;
}
export function requireDataOwner(subject: string) {
  if (!isDataOwner(subject)) throw new HttpError(404, "Settings not found.");
}
export async function providerConfigs(): Promise<ProviderConfig[]> {
  const rows = await database()
    .prepare("SELECT payload FROM x2_providers ORDER BY provider")
    .all<{ payload: string }>();
  return rows.results
    .map((r) => JSON.parse(r.payload))
    .sort((a, b) => a.priority - b.priority);
}
export async function instrumentRegistry() {
  const configs = await providerConfigs();
  const ids = new Set<string>();
  return [
    ...configs
      .filter((c) => rightsActive(c, "display"))
      .flatMap((c) =>
        c.instruments.map((i) => ({
          id: i.id,
          label: i.symbol,
          name: i.name,
          market: i.market,
          assetClass: i.type,
          sourceUrl: PROVIDERS[c.provider].docs,
          mappingStatus: "OWNER_VERIFIED_SOURCE_MAPPING",
        })),
      ),
    ...X2_INSTRUMENTS,
  ].filter((i) => !ids.has(i.id) && !!ids.add(i.id));
}
export async function providerSettings(subject: string) {
  requireDataOwner(subject);
  const rows = await database()
    .prepare("SELECT * FROM x2_providers ORDER BY provider")
    .all<ConfigRow>();
  return {
    isOwner: true,
    providers: Object.entries(PROVIDERS).map(([id, meta]) => {
      const row = rows.results.find((r) => r.provider === id);
      return {
        id,
        ...meta,
        secretConfigured: !!secretFrom(id as ProviderId, environment()),
        config: row ? JSON.parse(row.payload) : null,
        health: row ? JSON.parse(row.health) : EMPTY_HEALTH,
      };
    }),
    secretSetup:
      "Insert server-only secrets in the existing Site runtime environment. This page never receives or installs keys.",
    priceBudget: {
      reserveInr: 3000,
      spendAuthorized: false,
      actualSpend: "Not metered",
    },
    audit: (
      await database()
        .prepare(
          "SELECT provider,action,version,created_at FROM x2_provider_audit ORDER BY created_at DESC LIMIT 25",
        )
        .all()
    ).results,
  };
}
function requestKey(v: unknown) {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(v))
    throw new HttpError(400, "A stable request ID is required.");
  return v;
}
function sameConfig(a: ProviderConfig, b: ProviderConfig) {
  return (
    JSON.stringify({ ...a, version: 0 }) ===
    JSON.stringify({ ...b, version: 0 })
  );
}
export async function configureProvider(
  subject: string,
  input: Record<string, unknown>,
) {
  requireDataOwner(subject);
  let next: ProviderConfig;
  try {
    next = validateConfig(input.config);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  requestKey(next.lastWrite);
  await rate(subject + ":x2providerwrite", 30, 60000);
  const db = database(),
    row = await db
      .prepare("SELECT * FROM x2_providers WHERE provider=?")
      .bind(next.provider)
      .first<ConfigRow>();
  if (row?.last_write === next.lastWrite) {
    if (!sameConfig(JSON.parse(row.payload), next))
      throw new HttpError(
        409,
        "Request ID already used for different configuration.",
      );
    return providerSettings(subject);
  }
  const expected = next.version;
  if (row ? row.version !== expected : expected !== 0)
    throw new HttpError(
      409,
      "Configuration changed. Reload and preserve your draft.",
    );
  next = { ...next, version: expected + 1 };
  const now = new Date().toISOString(),
    health = {
      ...EMPTY_HEALTH,
      state: next.enabled ? "ENTITLEMENT_NOT_VERIFIED" : "DISABLED",
      message:
        "Saved. Test the connection; an owner contract declaration is not a provider-verified licence.",
    };
  await db.batch([
    db
      .prepare(
        "INSERT INTO x2_providers (provider,version,payload,health,updated_by,updated_at,last_write) VALUES (?,?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET version=excluded.version,payload=excluded.payload,health=excluded.health,updated_by=excluded.updated_by,updated_at=excluded.updated_at,last_write=excluded.last_write WHERE x2_providers.version=?",
      )
      .bind(
        next.provider,
        next.version,
        JSON.stringify(next),
        JSON.stringify(health),
        subject,
        now,
        next.lastWrite,
        expected,
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO x2_provider_audit (id,provider,subject,request_key,created_at,action,version) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND last_write=?)",
      )
      .bind(
        crypto.randomUUID(),
        next.provider,
        subject,
        next.lastWrite,
        now,
        next.enabled ? "CONFIGURE" : "DISABLE",
        next.version,
        next.provider,
        next.lastWrite,
      ),
  ]);
  const saved = await db
    .prepare("SELECT last_write,payload FROM x2_providers WHERE provider=?")
    .bind(next.provider)
    .first<{ last_write: string; payload: string }>();
  if (
    saved?.last_write !== next.lastWrite ||
    !sameConfig(JSON.parse(saved.payload), next)
  )
    throw new HttpError(
      409,
      "Concurrent configuration won. Reload before retry.",
    );
  cache.clear();
  return providerSettings(subject);
}
const cache = new Map<
    string,
    { until: number; secret: string; value: AssetResearch }
  >(),
  inflight = new Map<string, Promise<AssetResearch>>();
async function quota(config: ProviderConfig) {
  await rate(
    "x2:provider-minute:" + config.provider,
    Math.min(config.dailyCallLimit, 30),
    60000,
  );
  await rate(
    "x2:provider:" +
      config.provider +
      ":" +
      new Date().toISOString().slice(0, 10),
    config.dailyCallLimit,
    86400000,
  );
}
async function calls(provider: ProviderId) {
  const r = await database()
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .bind(
      "x2:provider:" + provider + ":" + new Date().toISOString().slice(0, 10),
    )
    .first<{ count: number }>();
  return r?.count ?? 0;
}
export async function testProvider(
  subject: string,
  input: Record<string, unknown>,
) {
  requireDataOwner(subject);
  await rate(subject + ":x2providertest", 6, 60000);
  const id = providerId(input.provider),
    configs = await providerConfigs(),
    c = configs.find((x) => x.provider === id);
  if (!c) throw new HttpError(400, "Save the provider mapping first.");
  const secret = secretFrom(id, environment()),
    started = Date.now();
  const health: ProviderHealth = {
    ...EMPTY_HEALTH,
    accepted: [],
    rejected: [],
    checkedAt: new Date().toISOString(),
    state: !c.enabled
      ? "DISABLED"
      : !secret
        ? "NOT_CONFIGURED"
        : "ENTITLEMENT_NOT_VERIFIED",
  };
  if (
    c.enabled &&
    secret &&
    (rightsActive(c, "display") ||
      (rightsActive(c, "analysis") && rightsActive(c, "storage")))
  ) {
    const samples = [
      ...new Map(c.instruments.map((i) => [i.market, i])).values(),
    ].slice(0, 4);
    for (const instrument of samples) {
      try {
        await quota(c);
        const bars = c.datasets.includes("candles")
          ? await providerCandles(c, instrument, secret)
          : [];
        if (!c.datasets.includes("candles")) {
          if (c.provider === "EODHD" && c.datasets.includes("fundamentals")) {
            const statements = await providerFundamentals(instrument, secret);
            if (!statements.length)
              throw new ProviderFailure(
                "INVALID_DATA",
                "No entitled statements returned.",
              );
          } else if (c.provider === "EODHD" && c.datasets.includes("news"))
            await providerNews(instrument, secret);
        } else if (!bars.length)
          throw new ProviderFailure("INVALID_DATA", "No history returned.");
        health.accepted.push(instrument.id);
        health.lastEventAt = bars.at(-1)?.date ?? null;
      } catch (e) {
        health.rejected.push(instrument.id);
        health.state =
          e instanceof ProviderFailure
            ? e.code === "INVALID_DATA"
              ? "PROVIDER_DOWN"
              : e.code
            : e instanceof HttpError && e.status === 429
              ? "RATE_LIMITED"
              : "PROVIDER_DOWN";
      }
    }
    if (health.accepted.length)
      health.state = health.rejected.length ? "PARTIAL_COVERAGE" : "CONNECTED";
    health.message = health.accepted.length
      ? "Source schema accepted. Legal rights remain explicitly owner-attested; the provider API does not verify redistribution rights."
      : "No source observation accepted. Check secret, mapping, plan and entitlement.";
  }
  health.callsToday = await calls(id);
  health.quotaRemaining = Math.max(0, c.dailyCallLimit - health.callsToday);
  health.latencyMs = Date.now() - started;
  await database()
    .prepare(
      "UPDATE x2_providers SET health=?,updated_at=? WHERE provider=? AND version=?",
    )
    .bind(JSON.stringify(health), new Date().toISOString(), id, c.version)
    .run();
  cache.clear();
  return providerSettings(subject);
}
function emptyAsset(id: string, interval: Interval): AssetResearch {
  const info = registryInstrument(id);
  return {
    schemaVersion: "x2-data-1",
    id,
    name: info?.name ?? id,
    instrument: null,
    provider: "Not connected",
    sourceUrl: info?.sourceUrl ?? "",
    state: "UNAVAILABLE",
    asOf: new Date().toISOString(),
    retrievedAt: null,
    unit: "Unavailable",
    currency: "",
    interval,
    pointInTime: false,
    references: [],
    candles: [],
    fundamentals: [],
    statements: [],
    events: [],
    options: [],
    capabilities: {
      chart: false,
      candles: false,
      volume: false,
      fundamentals: false,
      events: false,
      options: false,
      analysis: false,
      storage: false,
    },
    limitations: [
      info?.mappingStatus === "CONTRACT_SELECTION_REQUIRED"
        ? "Select an exact licensed MCX contract, expiry, lot and unit in Data Connections."
        : "Connect a supported provider with verified display and dataset entitlements.",
      "No price, performance or live status is inferred from the instrument identity.",
    ],
  };
}
async function sourceResearch(
  id: string,
  subject: string,
  interval: Interval = "1d",
  includeDetails = true,
  purpose: "display" | "analysis" = "display",
  pinnedProvider?: ProviderId,
): Promise<AssetResearch> {
  if (
    !["1d", "1wk", "1mo"].includes(interval) ||
    typeof id !== "string" ||
    id.length > 80
  )
    throw new HttpError(400, "Invalid instrument or interval.");
  void subject;
  const result = emptyAsset(id, interval);
  if (
    id.startsWith("ECB:") ||
    id.startsWith("TREASURY:") ||
    id.startsWith("UST:")
  ) {
    const m = await loadMarketData(),
      q = [...m.quotes, ...m.yields].find((p) => p.id === id),
      h = m.fxHistory.find((p) => p.id === id);
    if (!q) return result;
    return {
      ...result,
      name: q.label,
      provider: q.provider,
      sourceUrl: q.sourceUrl,
      state: q.state,
      asOf: m.asOf,
      retrievedAt: q.retrievedAt,
      unit: q.unit,
      currency: q.currency,
      references: h
        ? aggregateReferences(h.points, interval)
        : q.value === null
          ? []
          : [{ date: q.sourceDate!, close: q.value, knownAt: q.retrievedAt! }],
      capabilities: {
        ...result.capabilities,
        chart: !!h,
        analysis: !!h && h.canAnalyze,
        derivedDisplay: !!h && h.canAnalyze,
        storage: true,
      },
      limitations: [
        "Daily references, not executable quotes.",
        ...(interval === "1d"
          ? []
          : [
              "Calendar groups use the last available source reference; the latest group may be partial, not a completed period.",
            ]),
        "No OHLC, volume or intraday data is supplied by this reference feed.",
        "Publication instants/revision vintages are unavailable; known-at is retrieval time, so point-in-time backtesting is blocked.",
      ],
    };
  }
  const configs = (await providerConfigs()).filter(
    (c) =>
      (purpose === "display"
        ? rightsActive(c, "display")
        : rightsActive(c, "analysis") && rightsActive(c, "storage")) &&
      (!pinnedProvider || c.provider === pinnedProvider) &&
      c.instruments.some((i) => i.id === id),
  );
  for (const c of configs) {
    if (
      purpose === "display" &&
      interval !== "1d" &&
      !(rightsActive(c, "analysis") && c.rights.derivedDisplay === true)
    )
      throw new HttpError(
        403,
        "Derived display rights are required for aggregated intervals.",
      );
    const secret = secretFrom(c.provider, environment());
    if (!secret) continue;
    const instrument = c.instruments.find((i) => i.id === id)!;
    const fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
      ),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const key =
        c.provider +
        ":" +
        c.version +
        ":" +
        id +
        ":" +
        interval +
        ":" +
        fingerprint +
        ":" +
        includeDetails,
      purposeKey = key + ":" + purpose,
      prior = cache.get(purposeKey);
    if (prior && prior.until > Date.now() && prior.secret === secret)
      return prior.value;
    const running = inflight.get(purposeKey);
    if (running) return running;
    const task = (async () => {
      const out = {
        ...result,
        name: instrument.name,
        instrument,
        provider: c.provider,
        sourceUrl: PROVIDERS[c.provider].docs,
        currency: instrument.currency,
        unit: instrument.unit,
        retrievedAt: new Date().toISOString(),
      };
      try {
        let raw: AssetResearch["candles"] = [];
        if (c.datasets.includes("candles")) {
          await quota(c);
          raw = await providerCandles(c, instrument, secret);
        }
        out.candles = aggregateCandles(raw, interval);
        out.references = out.candles.map((b) => ({
          date: b.date,
          close: b.close,
          knownAt: b.knownAt,
        }));
        const latest = raw.at(-1);
        out.state =
          latest && Date.now() - Date.parse(latest.date) < 5 * 86400000
            ? "PUBLISHED_EOD"
            : latest
              ? "STALE"
              : "UNAVAILABLE";
        out.capabilities = {
          ...out.capabilities,
          chart: raw.length > 0,
          candles: raw.length > 0,
          volume: raw.some((b) => b.volume !== null),
          analysis: rightsActive(c, "analysis"),
          derivedDisplay:
            rightsActive(c, "analysis") && c.rights.derivedDisplay === true,
          storage: rightsActive(c, "storage"),
        };
        out.limitations = [
          "Raw OHLC and adjusted close are separate. Do not mix their adjustment bases.",
          ...(interval === "1d"
            ? []
            : [
                "Aggregated daily bars may include a developing latest calendar group, not a completed period.",
              ]),
          "Historical release vintages are unavailable; current history cannot establish point-in-time backtest eligibility.",
          "A successful API read does not verify a commercial licence. Rights are owner-attested.",
        ];
        if (
          c.provider === "EODHD" &&
          includeDetails &&
          c.datasets.includes("fundamentals") &&
          instrument.type === "EQUITY"
        ) {
          try {
            await quota(c);
            out.statements = await providerFundamentals(instrument, secret);
            out.fundamentals = statementMetrics(out.statements);
            out.capabilities.fundamentals = out.statements.length > 0;
          } catch {
            out.limitations.push(
              "Fundamentals unavailable for this mapping/plan.",
            );
          }
        }
        if (
          includeDetails &&
          c.provider === "EODHD" &&
          c.datasets.includes("news")
        ) {
          try {
            await quota(c);
            out.events = await providerNews(instrument, secret);
            out.capabilities.events = out.events.length > 0;
          } catch {
            out.limitations.push("News unavailable for this mapping/plan.");
          }
        }
        const active = await database()
          .prepare("SELECT version,payload FROM x2_providers WHERE provider=?")
          .bind(c.provider)
          .first<{ version: number; payload: string }>();
        if (
          !active ||
          active.version !== c.version ||
          !(purpose === "display"
            ? rightsActive(JSON.parse(active.payload), "display")
            : rightsActive(JSON.parse(active.payload), "analysis") &&
              rightsActive(JSON.parse(active.payload), "storage")) ||
          secretFrom(c.provider, environment()) !== secret
        )
          return emptyAsset(id, interval);
        for (const [expiredKey, entry] of cache)
          if (entry.until <= Date.now()) cache.delete(expiredKey);
        if (c.rights.cacheSeconds > 0 && cache.size < 100)
          cache.set(purposeKey, {
            until: Math.min(
              Date.now() + c.rights.cacheSeconds * 1000,
              Date.parse(c.rights.expiresAt),
            ),
            secret,
            value: out,
          });
        return out;
      } catch {
        out.limitations = [
          "Source unavailable, quota reached, expired key or invalid source response. Last-known values are not fabricated.",
        ];
        return out;
      } finally {
        inflight.delete(purposeKey);
      }
    })();
    inflight.set(purposeKey, task);
    const value = await task;
    if (
      value.capabilities.chart ||
      value.capabilities.fundamentals ||
      value.capabilities.events
    )
      return value;
    // Retry only a complete independently entitled series; never splice histories.
  }
  return result;
}
/** Public display readers cannot select or obtain the private non-display ingestion purpose. */
export async function assetResearch(
  id: string,
  subject: string,
  interval: Interval = "1d",
  includeDetails = true,
) {
  return sourceResearch(id, subject, interval, includeDetails, "display");
}
export async function currentDisplayRights(
  instrumentId: string,
  provider: string,
) {
  if (provider === "ECB" && instrumentId.startsWith("ECB:"))
    return {
      displayAllowed: true,
      derivedDisplayAllowed: true,
      rightsExpiresAt: null,
    };
  const c = (await providerConfigs()).find(
    (c) =>
      c.provider === provider &&
      c.instruments.some((i) => i.id === instrumentId),
  );
  return {
    displayAllowed: !!c && rightsActive(c, "display"),
    derivedDisplayAllowed:
      !!c && rightsActive(c, "analysis") && c.rights.derivedDisplay === true,
    rightsExpiresAt: c?.rights.expiresAt ?? null,
  };
}
export type ResearchUniverse = {
  datasets: ScanDataset[];
  excluded: { id: string; reason: string }[];
  source: string;
  pointInTime: boolean;
  adjusted: boolean;
  rights: { analysis: boolean; storage: boolean };
  asOf: string;
  lineage: {
    instrumentId: string;
    provider: string;
    eventAt: string | null;
    retrievedAt: string;
    adjustment: string;
    displayAllowed: boolean;
    derivedDisplayAllowed: boolean;
    rightsExpiresAt: string | null;
    configVersion?: number;
    interval?: Interval;
    periodPolicy?: string;
  }[];
};
export async function researchUniverse(
  subject: string,
  options: {
    provider?: string;
    instrumentIds?: string[];
    interval?: Interval;
  } = {},
): Promise<ResearchUniverse> {
  if (options.interval && !["1d", "1wk", "1mo"].includes(options.interval))
    throw new HttpError(400, "Use a supported scan interval.");
  const out: ResearchUniverse = {
    datasets: [],
    excluded: [],
    source: options.provider ?? "ECB",
    pointInTime: false,
    adjusted: false,
    rights: { analysis: false, storage: false },
    asOf: new Date().toISOString(),
    lineage: [],
  };
  if (!options.provider || options.provider === "ECB") {
    const m = await loadMarketData();
    out.asOf = m.asOf;
    out.rights = { analysis: true, storage: true };
    for (const h of m.fxHistory.filter(
      (h) =>
        !options.instrumentIds?.length || options.instrumentIds.includes(h.id),
    )) {
      if (!h.canAnalyze) {
        out.excluded.push({
          id: h.id,
          reason: "Daily reference history is unavailable or stale.",
        });
        continue;
      }
      out.datasets.push({
        instrumentId: h.id,
        currency: h.currency,
        source: h.provider,
        permitted: true,
        frequency: "DAILY_REFERENCE",
        maxAgeMs: 5 * 86400000,
        observations: aggregateReferences(
          h.points,
          options.interval ?? "1d",
        ).map((p) => ({
          eventAt: p.date + "T00:00:00.000Z",
          knownAt: p.knownAt,
          close: p.close,
        })),
      });
      out.lineage.push({
        instrumentId: h.id,
        provider: h.provider,
        eventAt: h.points.at(-1)?.date ?? null,
        retrievedAt: h.retrievedAt,
        adjustment: "REFERENCE_ONLY",
        displayAllowed: true,
        derivedDisplayAllowed: true,
        rightsExpiresAt: null,
        interval: options.interval ?? "1d",
        periodPolicy:
          options.interval && options.interval !== "1d"
            ? "LAST_AVAILABLE_REFERENCE; LATEST_CALENDAR_GROUP_MAY_BE_PARTIAL"
            : "DAILY_SOURCE_OBSERVATIONS",
      });
    }
    return out;
  }
  const configs = (await providerConfigs()).filter(
    (c) =>
      rightsActive(c, "analysis") &&
      rightsActive(c, "storage") &&
      (options.provider === "CONNECTED_MARKETS" ||
        options.provider === c.provider),
  );
  const ids = [
    ...new Set(configs.flatMap((c) => c.instruments.map((i) => i.id))),
  ]
    .filter(
      (id) =>
        !options.instrumentIds?.length || options.instrumentIds.includes(id),
    )
    .slice(0, 20);
  for (const id of ids) {
    const selected = configs.find((c) =>
      c.instruments.some((i) => i.id === id),
    )!;
    const a = await sourceResearch(
      id,
      subject,
      options.interval ?? "1d",
      false,
      "analysis",
      selected.provider,
    );
    if (
      !a.capabilities.analysis ||
      !a.capabilities.storage ||
      a.state === "STALE" ||
      !a.candles.length
    ) {
      out.excluded.push({
        id,
        reason:
          "Analysis/storage rights or fresh eligible candles are missing.",
      });
      continue;
    }
    out.datasets.push({
      instrumentId: id,
      currency: a.currency,
      source: a.provider,
      permitted: true,
      frequency: "PUBLISHED_EOD",
      maxAgeMs: 5 * 86400000,
      observations: a.candles.map((c) => ({
        eventAt: c.date + "T00:00:00.000Z",
        knownAt: c.knownAt,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        fields: { openinterest: c.openInterest },
      })),
    });
    out.lineage.push({
      instrumentId: id,
      provider: a.provider,
      eventAt: a.candles.at(-1)?.date ?? null,
      retrievedAt: a.retrievedAt!,
      adjustment: "RAW",
      displayAllowed: rightsActive(selected, "display"),
      derivedDisplayAllowed:
        rightsActive(selected, "analysis") &&
        selected.rights.derivedDisplay === true,
      rightsExpiresAt: selected.rights.expiresAt,
      configVersion: selected.version,
      interval: options.interval ?? "1d",
      periodPolicy:
        options.interval && options.interval !== "1d"
          ? "GROUPED_DAILY_OHLC; LATEST_CALENDAR_GROUP_MAY_BE_PARTIAL"
          : "DAILY_SOURCE_OBSERVATIONS",
    });
  }
  out.rights = {
    analysis: out.datasets.length > 0,
    storage: out.datasets.length > 0,
  };
  return out;
}
export async function chartLayout(
  subject: string,
  id: string,
): Promise<ChartLayout> {
  const r = await database()
    .prepare(
      "SELECT version,payload,updated_at FROM x2_chart_layouts WHERE subject=? AND instrument_id=?",
    )
    .bind(subject, id)
    .first<{ version: number; payload: string; updated_at: string }>();
  return r
    ? {
        version: r.version,
        payload: JSON.parse(r.payload),
        updatedAt: r.updated_at,
      }
    : {
        version: 0,
        payload: { mode: "line", interval: "1d", indicators: [], drawings: [] },
        updatedAt: null,
      };
}

export type MarketQuote = Omit<
  DataPoint,
  "assetClass" | "provider" | "frequency"
> & {
  assetClass: "EQUITY" | "INDEX" | "FUTURE";
  provider: string;
  frequency: "DAILY_OHLC";
};
/** Bounded, same service as chart/scan. Maximum eight exact configured instruments, parallel source calls. */
export async function loadExtendedMarketData(subject: string, ids?: string[]) {
  if (
    ids &&
    (ids.length > 8 ||
      ids.some((id) => typeof id !== "string" || id.length > 80))
  )
    throw new HttpError(400, "Choose at most eight exact market instruments.");
  const reference = await loadMarketData();
  const configs = (await providerConfigs()).filter(
    (c) => rightsActive(c, "display") && c.datasets.includes("candles"),
  );
  const wanted = [
    ...new Set(configs.flatMap((c) => c.instruments.map((i) => i.id))),
  ]
    .filter((id) => !ids || ids.includes(id))
    .slice(0, 8);
  const observations = await Promise.all(
    wanted.map((id) => assetResearch(id, subject, "1d", false)),
  );
  const marketQuotes: MarketQuote[] = observations.flatMap((a) => {
    const instrument = a.instrument,
      last = a.candles.at(-1),
      prior = a.candles.at(-2);
    if (!instrument || !last) return [];
    return [
      {
        id: a.id,
        label: a.name,
        assetClass: instrument.type as "EQUITY" | "INDEX" | "FUTURE",
        value: last.close,
        unit: a.unit,
        currency: a.currency,
        provider: a.provider,
        sourceUrl: a.sourceUrl,
        rightsUrl: PROVIDERS[a.provider as ProviderId].rightsUrl,
        eventAt: last.date,
        sourceDate: last.date,
        eventTimePrecision: "DATE",
        retrievedAt: a.retrievedAt,
        state: a.state === "PUBLISHED_EOD" ? "PUBLISHED_EOD" : "STALE",
        frequency: "DAILY_OHLC",
        reason: "Published daily close, not a live or executable quote.",
        derivation: null,
        change:
          a.capabilities.analysis &&
          a.capabilities.derivedDisplay === true &&
          prior &&
          prior.close > 0
            ? (last.close / prior.close - 1) * 100
            : null,
        changeUnit: "%",
        canAnalyze: a.capabilities.analysis && a.state === "PUBLISHED_EOD",
      },
    ];
  });
  return {
    ...reference,
    quotes: [...reference.quotes, ...marketQuotes],
    marketQuotes,
  };
}
export function validateDrawing(v: unknown): Drawing {
  const d = v as Drawing;
  if (
    !d ||
    !["level", "trend", "ray", "fibonacci"].includes(d.type) ||
    typeof d.id !== "string" ||
    d.id.length > 80 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.date1) ||
    !Number.isFinite(d.value1)
  )
    throw new HttpError(400, "Use a price/date anchored drawing.");
  if (
    d.type !== "level" &&
    (!d.date2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.date2) ||
      !Number.isFinite(d.value2))
  )
    throw new HttpError(400, "Two anchors are required.");
  return {
    id: d.id,
    type: d.type,
    date1: d.date1,
    value1: d.value1,
    ...(d.type === "level" ? {} : { date2: d.date2, value2: d.value2 }),
  };
}
export async function saveChartLayout(
  subject: string,
  input: Record<string, unknown>,
) {
  const id = String(input.id ?? ""),
    key = requestKey(input.requestKey),
    expected = Number(input.version),
    payload = input.payload as ChartLayout["payload"];
  if (
    !/^[A-Za-z0-9:^._-]{3,80}$/.test(id) ||
    !Number.isInteger(expected) ||
    expected < 0 ||
    !payload ||
    !["line", "candles", "ohlc"].includes(payload.mode) ||
    !["1d", "1wk", "1mo"].includes(payload.interval) ||
    !Array.isArray(payload.indicators) ||
    payload.indicators.length > 10 ||
    payload.indicators.some(
      (x) =>
        ![
          "SMA20",
          "EMA20",
          "RSI14",
          "MACD",
          "BB20",
          "ATR14",
          "DRAWDOWN",
        ].includes(x),
    ) ||
    !Array.isArray(payload.drawings) ||
    payload.drawings.length > 20
  )
    throw new HttpError(400, "Invalid chart layout.");
  const clean = {
      mode: payload.mode,
      interval: payload.interval,
      indicators: [...new Set(payload.indicators)],
      drawings: payload.drawings.map(validateDrawing),
    },
    serialized = JSON.stringify(clean),
    db = database();
  await rate(subject + ":x2chart", 60, 60000);
  const prior = await db
    .prepare(
      "SELECT version,payload,last_write FROM x2_chart_layouts WHERE subject=? AND instrument_id=?",
    )
    .bind(subject, id)
    .first<{ version: number; payload: string; last_write: string }>();
  if (prior?.last_write === key) {
    if (prior.payload !== serialized)
      throw new HttpError(409, "Request ID reused with another layout.");
    return chartLayout(subject, id);
  }
  if (prior ? prior.version !== expected : expected !== 0)
    throw new HttpError(
      409,
      "Chart changed in another tab. Reload before saving.",
    );
  if (!prior) {
    const count = await db
      .prepare("SELECT count(*) n FROM x2_chart_layouts WHERE subject=?")
      .bind(subject)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 100)
      throw new HttpError(413, "Chart layout limit reached.");
  }
  await db
    .prepare(
      "INSERT INTO x2_chart_layouts (subject,instrument_id,version,payload,last_write,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM x2_chart_layouts WHERE subject=?)<100 OR EXISTS(SELECT 1 FROM x2_chart_layouts WHERE subject=? AND instrument_id=?) ON CONFLICT(subject,instrument_id) DO UPDATE SET version=excluded.version,payload=excluded.payload,last_write=excluded.last_write,updated_at=excluded.updated_at WHERE x2_chart_layouts.version=?",
    )
    .bind(
      subject,
      id,
      expected + 1,
      serialized,
      key,
      new Date().toISOString(),
      subject,
      subject,
      id,
      expected,
    )
    .run();
  const saved = await db
    .prepare(
      "SELECT last_write,payload FROM x2_chart_layouts WHERE subject=? AND instrument_id=?",
    )
    .bind(subject, id)
    .first<{ last_write: string; payload: string }>();
  if (saved?.last_write !== key || saved.payload !== serialized)
    throw new HttpError(409, "Another layout save won. Reload your chart.");
  return chartLayout(subject, id);
}
