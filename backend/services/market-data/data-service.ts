import { env } from "cloudflare:workers";
import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { OFFICIAL_FX_PAIRS, loadMarketData, type DataPoint } from "./market-data";
import type { ScanDataset } from "../../engines/scan";
import { matchesScanMarketPreset, type ScanSourceExclusion, type ScanUniversePreset } from "../research/research";
import type {
  AssetResearch,
  ChartLayout,
  Drawing,
  Interval,
  ProviderConfig,
  ProviderHealth,
  ProviderId,
} from "./data-types";
import { aggregateCandles, aggregateReferences, calendarPeriodKey } from "../../engines/chart-analytics";
import {
  indianDailyPrices,
  EMPTY_HEALTH,
  PROVIDERS,
  ProviderFailure,
  providerCandles,
  providerIntradayCandles,
  providerFundamentals,
  providerNews,
  providerId,
  rightsActive,
  secretFrom,
  statementMetrics,
  validateConfig,
} from "./providers";
import { recordProviderBackoff, reserveProviderCall } from "./provider-budget";
import { niftyUniverse } from "./nifty-500";
import { X2_INSTRUMENTS, registryInstrument } from "./instrument-registry";
import { completedCommercialIntradayObservations, scanFreshnessMs } from "./candle-sessions";
import { getIndianExchangeSession } from "./exchange-calendar";
import { activeContract, eligibleSharedPeriods, hasReadySharedHistory, hasSharedRights, nativeInterval, readSharedHistory, readSharedHistoryBatch, sharedDailyEventAt, SHARED_HISTORY_LABEL,
  readSharedDailyQuotes, sharedHistoryGrants, sharedIngestionHealth } from "./shared-history";

type ConfigRow = {
  provider: ProviderId;
  version: number;
  payload: string;
  health: string;
  updated_at: string;
  last_write: string;
};

export const PRIVATE_EXCHANGE_FEED_LABEL = "Configured Exchange Feed (Private)";

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
export async function instrumentRegistry(subject?: string) {
  const [configs, membership] = await Promise.all([
    providerConfigs(),
    subject ? niftyUniverse().catch(() => null) : null,
  ]);
  const constituents = new Map(membership?.constituents.map((row) => [row.id, row]));
  const ids = new Set<string>();
  return [
    ...configs
      .filter((c) => c.provider !== "BHARATSTOCK" && subject && (isDataOwner(subject) ? rightsActive(c, "display") : hasSharedRights(c) && !!secretFrom(c.provider, environment())))
      .flatMap((c) =>
        c.instruments.map((i) => ({
          id: i.id,
          label: i.symbol,
          name: i.name,
          market: i.market,
          assetClass: i.type,
          currency: i.currency,
          sourceUrl: PROVIDERS[c.provider].docs,
          sector: constituents.get(i.id)?.industry,
          mappingStatus: constituents.has(i.id) ? "OFFICIAL_CONSTITUENT" : "OWNER_VERIFIED_SOURCE_MAPPING",
          availabilityState: "DATA_CONNECTED" as const,
        })),
      ),
    ...(membership?.constituents.map((entry) => ({
      id: entry.id, label: entry.id.slice(4), name: entry.name,
      market: "NSE", assetClass: "EQUITY", currency: "INR", sector: entry.industry,
      sourceUrl: "https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY-500",
      mappingStatus: "OFFICIAL_CONSTITUENT",
      availabilityState: "IDENTIFIED_ONLY" as const,
    })) ?? []),
    ...X2_INSTRUMENTS.map((entry) => ({
      ...entry,
      availabilityState:
        entry.mappingStatus === "CONTRACT_SELECTION_REQUIRED"
          ? ("CONTRACT_SELECTION_REQUIRED" as const)
          : ("IDENTIFIED_ONLY" as const),
    })),
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
    sharedIngestion: await sharedIngestionHealth().catch(() => []),
    secretSetup:
      "Configure server-only secrets in Cloudflare Workers runtime settings (wrangler secret put). This page never receives or installs keys.",
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
    const config = input.config as Record<string, unknown> | undefined;
    if (config?.provider === "INDIANAPI" && input.useNiftyUniverse === true) {
      const snapshot = await niftyUniverse();
      if (!snapshot) throw new HttpError(409, "Import the licensed Nifty 500 snapshot before mapping it.");
      next = validateConfig({ ...config, instruments: snapshot.constituents.map((row) => ({
        id: row.id, name: row.name, symbol: row.id.slice(4), providerSymbol: row.id.slice(4),
        market: "NSE", mic: "XNSE", type: "EQUITY", currency: "INR", unit: "INR per share", timezone: "Asia/Kolkata",
      })) });
      next.constituentGrant = { version: snapshot.version, expiresAt: snapshot.rightsExpiresAt };
    } else {
      next = validateConfig(config);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, (e as Error).message);
  }
  requestKey(next.lastWrite);
  await rate(subject + ":x2providerwrite", 30, 60000);
  const db = database(),
    row = await db
      .prepare("SELECT * FROM x2_providers WHERE provider=?")
      .bind(next.provider)
      .first<ConfigRow>();
  const previousConfig = row ? JSON.parse(row.payload) as ProviderConfig : null;
  if (previousConfig?.constituentGrant && !next.constituentGrant) {
    if (JSON.stringify(next.instruments) !== JSON.stringify(previousConfig.instruments))
      throw new HttpError(409, "Refresh the licensed constituent snapshot before editing its imported mappings.");
    next.constituentGrant = previousConfig.constituentGrant;
  }
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
  // Shared rows are ephemeral and bound to the grant version. Erase superseded retained data.
  if (row && JSON.parse(row.payload).sharedHistory) {
    await db.batch([
      db.prepare("DELETE FROM x8_shared_history_snapshot WHERE provider=? AND config_version<>? AND EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?)")
        .bind(next.provider, next.version, next.provider, next.version),
      db.prepare("DELETE FROM x8_shared_history_task WHERE provider=? AND config_version<>? AND EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?)")
        .bind(next.provider, next.version, next.provider, next.version),
    ]);
  }
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
        if (c.sharedHistory) {
          const backoff = await database().prepare(`SELECT paused_until,last_error FROM x8_shared_history_plan
            WHERE provider=? AND config_version=? AND paused_until>?`).bind(id, c.version, Date.now())
            .first<{ paused_until: number; last_error: string | null }>();
          if (backoff && backoff.last_error !== "AUTH_FAILED")
            throw new ProviderFailure("RATE_LIMITED", "Wait for the provider backoff to finish.");
        }
        await reserveProviderCall(c);
        const bars = c.provider === "INDIANAPI" ? await indianDailyPrices(instrument.providerSymbol, secret, environment().INDIA_API_HOST) : c.datasets.includes("candles")
          ? await providerCandles(c, instrument, secret)
          : [];
        if (c.provider !== "INDIANAPI" && !c.datasets.includes("candles")) {
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
        await recordProviderBackoff(c, e);
        health.rejected.push(instrument.id);
        health.state =
          e instanceof ProviderFailure
            ? e.code === "INVALID_DATA"
              ? "PROVIDER_DOWN"
              : e.code === "LOCAL_RATE_BUDGET" ? "RATE_LIMITED" : e.code
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
  if (c.sharedHistory && health.accepted.length) {
    await database().prepare("UPDATE x8_shared_history_plan SET paused_until=0,failures=0,last_error=NULL WHERE provider=? AND config_version=?")
      .bind(id, c.version).run();
  }
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
  shared?: {
    cutoff?: number; grants?: Awaited<ReturnType<typeof sharedHistoryGrants>>;
    stored?: Awaited<ReturnType<typeof readSharedHistoryBatch>>;
  },
): Promise<AssetResearch> {
  if (
    !["30m", "1h", "1d", "1wk", "1mo"].includes(interval) ||
    typeof id !== "string" ||
    id.length > 80
  )
    throw new HttpError(400, "Invalid instrument or interval.");
  const result = emptyAsset(id, interval);
  if (
    id.startsWith("ECB:") ||
    id.startsWith("TREASURY:") ||
    id.startsWith("UST:")
  ) {
    if (interval === "30m" || interval === "1h") {
      return {
        ...result,
        limitations: [
          `Official daily reference feed does not publish ${interval === "30m" ? "30-minute" : "1-hour"} intraday bars. Never synthesized from daily closes.`,
        ],
      };
    }
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
  const owner = isDataOwner(subject);
  const stored = shared?.stored ? shared.stored.get(id)
    : subject ? await readSharedHistory(id, interval, shared?.grants ?? await sharedHistoryGrants(), {
      cutoff: shared?.cutoff, provider: pinnedProvider,
    }) : null;
  if (stored) {
    const now = shared?.cutoff ?? Date.now();
    const priceOnly = stored.prices;
    const retained = eligibleSharedPeriods(stored.candles, stored.instrument, interval, now);
    const grouped = interval === "1wk" || interval === "1mo";
    const references = grouped ? aggregateReferences(retained, interval) : retained;
    const candles = grouped ? aggregateCandles(retained, interval).map((bar, index) => ({ ...bar, date: references[index].date })) : retained;
    const receivedAt = new Date(stored.row.received_at).toISOString();
    const dailyPrices = priceOnly ? eligibleSharedPeriods(priceOnly, stored.instrument, interval, now)
      .map(({ date, close }) => ({ date, close, knownAt: receivedAt })) : null;
    const priceReferences = dailyPrices && (grouped ? aggregateReferences(dailyPrices, interval) : dailyPrices);
    const attribution = { label: stored.config.sharedHistory.attribution, url: stored.config.sharedHistory.attributionUrl };
    const { providerSymbol: internalMapping, ...publicMapping } = stored.instrument;
    void internalMapping;
    return {
      ...result, name: stored.instrument.name,
      instrument: { ...publicMapping, providerSymbol: stored.instrument.symbol },
      provider: SHARED_HISTORY_LABEL, sourceUrl: attribution.url, attribution,
      currency: stored.instrument.currency, unit: stored.instrument.unit,
      state: stored.state, asOf: receivedAt, retrievedAt: receivedAt, candles,
      references: priceReferences ?? candles.map(({ date, close, knownAt }) => ({ date, close, knownAt })),
      coverage: { firstDate: stored.row.first_event, lastDate: stored.row.last_event, bars: stored.row.bar_count },
      capabilities: {
        ...result.capabilities, chart: Boolean(priceReferences?.length || candles.length), candles: candles.length > 0,
        volume: candles.some((bar) => bar.volume !== null), analysis: true, derivedDisplay: true, storage: true,
      },
      limitations: ["Completed exchange observations. Source timestamps are retained."],
    };
  }
  if (!owner) return result;

  const configs = (await providerConfigs()).filter(
    (c) => c.provider !== "BHARATSTOCK" &&
      (purpose === "display"
        ? rightsActive(c, "display")
        : rightsActive(c, "analysis") && rightsActive(c, "storage")) &&
      !c.sharedHistory && (!pinnedProvider || c.provider === pinnedProvider) &&
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
        const isIntraday = interval === "30m" || interval === "1h";
        if (c.datasets.includes("candles")) {
          await reserveProviderCall(c);
          raw = isIntraday
            ? await providerIntradayCandles(
                c,
                instrument,
                secret,
                interval,
                interval === "30m" ? 30 : 45,
              )
            : await providerCandles(c, instrument, secret);
        }
        out.candles = isIntraday ? raw : aggregateCandles(raw, interval);
        out.references = out.candles.map((b) => ({
          date: b.date,
          close: b.close,
          knownAt: b.knownAt,
        }));
        const latest = raw.at(-1);
        out.state =
          latest && Date.now() - Date.parse(latest.date) < 5 * 86400000
            ? isIntraday
              ? "PUBLISHED_INTRADAY"
              : "PUBLISHED_EOD"
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
            await reserveProviderCall(c);
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
            await reserveProviderCall(c);
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
  configuration?: Map<string, Promise<ProviderConfig[]>>,
  version?: number,
) {
  if (provider === "ECB" && instrumentId.startsWith("ECB:"))
    return {
      displayAllowed: true,
      derivedDisplayAllowed: true,
      rightsExpiresAt: null,
    };
  if (!["TRUEDATA", "EODHD", "INDIANAPI"].includes(provider)) {
    return { displayAllowed: false, derivedDisplayAllowed: false, rightsExpiresAt: null };
  }
  let configured = configuration?.get("provider-configs");
  if (!configured) {
    configured = providerConfigs();
    configuration?.set("provider-configs", configured);
  }
  const c = (await configured).find(
    (c) =>
      c.provider === provider && (version === undefined || c.version === version) &&
      c.instruments.some((i) => i.id === instrumentId),
  );
  const eligible = !!c && (c.sharedHistory ? hasSharedRights(c) && !!secretFrom(c.provider, environment()) : true);
  return {
    displayAllowed: eligible && rightsActive(c, "display"),
    derivedDisplayAllowed:
      eligible && rightsActive(c, "analysis") && c.rights.derivedDisplay === true,
    rightsExpiresAt: c?.rights.expiresAt ?? null,
  };
}
export type ResearchUniverseDiagnostics = {
  traceId: string | null;
  preset: ScanUniversePreset | null;
  interval: Interval;
  catalogCount: number;
  authorizedCount: number;
  historyFetchedCount: number;
  excludedCount: number;
  failureCategory:
    | "OK"
    | "SHARED_MARKET_DATA_UNCONFIGURED"
    | "INTRADAY_UNSUPPORTED_FOR_SOURCE"
    | "UPSTREAM_UNAVAILABLE"
    | "NO_ELIGIBLE_HISTORY";
};
export type ResearchUniverse = {
  datasets: ScanDataset[];
  excluded: ScanSourceExclusion[];
  discoveredCount?: number;
  authorizedCount?: number;
  source: string;
  pointInTime: boolean;
  adjusted: boolean;
  rights: { analysis: boolean; storage: boolean };
  asOf: string;
  diagnostics?: ResearchUniverseDiagnostics;
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
    attribution?: {label: string; url: string};
    interval?: Interval;
    periodPolicy?: string;
  }[];
};

function completedPublishedPeriods<T extends { date: string }>(
  rows: T[],
  interval: Interval,
  currentDate: string,
) {
  if (interval === "1d" || interval === "1h" || interval === "30m" || !rows.length) return rows;
  const first = calendarPeriodKey(rows[0].date, interval);
  const current = calendarPeriodKey(currentDate, interval);
  return rows.filter(({ date }) => {
    const period = calendarPeriodKey(date, interval);
    return period !== first && period < current;
  });
}

function dateInZone(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export async function canScanExchange(
  interval: Interval,
  instrumentIds?: readonly string[],
  provider?: ProviderId,
) {
  const grants = await sharedHistoryGrants();
  return hasReadySharedHistory(provider ? grants.filter((grant) => grant.provider === provider) : grants, interval, instrumentIds);
}

export async function scanScopeInstruments(preset: ScanUniversePreset, interval: Interval) {
  if (preset === "ECB_DAILY") return OFFICIAL_FX_PAIRS.map(({ id }) => id).sort();
  const now = Date.now();
  const ids = (await sharedHistoryGrants())
    .filter((grant) => grant.sharedHistory.intervals.includes(nativeInterval(interval)))
    .flatMap((grant) => grant.instruments)
    .filter((instrument) => activeContract(instrument, now) &&
      matchesScanMarketPreset(preset, instrument.market, instrument.type, instrument.expiry))
    .map(({ id }) => id);
  return [...new Set(ids)].sort();
}

export async function researchUniverse(
  subject: string,
  options: {
    provider?: string;
    instrumentIds?: string[];
    interval?: Interval;
    limit?: number;
    minimumBars?: number;
    universePreset?: ScanUniversePreset;
    traceId?: string;
    eventCutoff?: string;
  } = {},
): Promise<ResearchUniverse> {
  if (options.interval && !["30m", "1h", "1d", "1wk", "1mo"].includes(options.interval))
    throw new HttpError(400, "Use a supported scan interval.");
  const maxLimit = Math.max(1, Math.min(24, options.limit ?? 24));
  const interval = options.interval ?? "1d";
  const isIntraday = interval === "30m" || interval === "1h";
  const out: ResearchUniverse = {
    datasets: [],
    excluded: [],
    discoveredCount: 0,
    authorizedCount: 0,
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
    const matchedHistory = m.fxHistory.filter(
      (h) =>
        !options.instrumentIds?.length || options.instrumentIds.includes(h.id),
    );
    out.discoveredCount = matchedHistory.length;
    out.authorizedCount = isIntraday ? 0 : matchedHistory.length;
    if (isIntraday) {
      for (const h of matchedHistory) {
        out.excluded.push({
          id: h.id,
          kind: "scope",
          reason:
            `Daily reference FX does not publish genuine ${interval === "30m" ? "30-minute (30m)" : "1-hour (1h)"} candles; daily bars are never fabricated into intraday bars.`,
        });
      }
      out.rights = { analysis: false, storage: false };
      out.diagnostics = {
        traceId: options.traceId ?? null,
        preset: options.universePreset ?? null,
        interval,
        catalogCount: matchedHistory.length,
        authorizedCount: 0,
        historyFetchedCount: 0,
        excludedCount: out.excluded.length,
        failureCategory: "INTRADAY_UNSUPPORTED_FOR_SOURCE",
      };
      return out;
    }
    for (const h of matchedHistory) {
      const history = aggregateReferences(
        completedPublishedPeriods(h.points, interval, dateInZone("Europe/Brussels")),
        interval,
      );
      if (!h.canAnalyze || !history.length) {
        out.excluded.push({
          id: h.id,
          reason: "Completed reference history is unavailable or stale for this timeframe.",
        });
        continue;
      }
      out.datasets.push({
        instrumentId: h.id,
        currency: h.currency,
        source: h.provider,
        permitted: true,
        frequency: "DAILY_REFERENCE",
        maxAgeMs: scanFreshnessMs(interval),
        observations: history.map((p) => ({
          eventAt: p.date + "T00:00:00.000Z",
          knownAt: p.knownAt,
          close: p.close,
        })),
      });
      out.lineage.push({
        instrumentId: h.id,
        provider: h.provider,
        eventAt: history.at(-1)?.date ?? null,
        retrievedAt: h.retrievedAt,
        adjustment: "REFERENCE_ONLY",
        displayAllowed: true,
        derivedDisplayAllowed: true,
        rightsExpiresAt: null,
        interval: options.interval ?? "1d",
        periodPolicy:
          options.interval && options.interval !== "1d"
            ? "LAST_REFERENCE_IN_COMPLETED_CALENDAR_PERIOD"
            : "DAILY_SOURCE_OBSERVATIONS",
      });
    }
    for (const id of options.instrumentIds ?? []) {
      if (!matchedHistory.some((history) => history.id === id))
        out.excluded.push({ id, reason: "No eligible ECB daily reference history for this instrument." });
    }
    return out;
  }
  const preset = options.universePreset;
  const grants = await sharedHistoryGrants();
  const owner = isDataOwner(subject);
  const configs = [
    ...grants.filter((grant) => grant.sharedHistory.intervals.includes(nativeInterval(interval))),
    ...(owner ? (await providerConfigs()).filter((config) => config.provider !== "BHARATSTOCK" && !config.sharedHistory &&
      rightsActive(config, "analysis") && rightsActive(config, "storage")) : []),
  ].filter((config) => options.provider === "CONNECTED_MARKETS" || options.provider === config.provider);
  const allCommercialIds = [
    ...new Set(configs.flatMap((c) => c.instruments
      .filter((i) => activeContract(i, options.eventCutoff ? Date.parse(options.eventCutoff) : Date.now()) &&
        matchesScanMarketPreset(preset, i.market, i.type, i.expiry))
      .map((i) => i.id))),
  ].filter(
    (id) =>
      !options.instrumentIds?.length || options.instrumentIds.includes(id),
  );
  const ids = allCommercialIds.slice(0, maxLimit);
  for (const deferredId of allCommercialIds.slice(maxLimit)) {
    out.excluded.push({
      id: deferredId,
      kind: "deferred",
      reason: `Deferred beyond single-batch scan cap (${maxLimit} instruments).`,
    });
  }
  const loadedIds = new Set<string>();
  const stored = await readSharedHistoryBatch(ids, interval, grants, {
    cutoff: options.eventCutoff ? Date.parse(options.eventCutoff) : undefined,
    provider: options.provider === "INDIANAPI" || options.provider === "TRUEDATA" || options.provider === "EODHD" ? options.provider : undefined,
  });
  for (const id of ids) {
    const selected = stored.get(id)?.config ?? configs.find((c) =>
      c.instruments.some((i) => i.id === id &&
        matchesScanMarketPreset(preset, i.market, i.type, i.expiry)),
    )!;
    const mappedInst = selected.instruments.find((i) => i.id === id);
    if (selected.provider === "INDIANAPI") {
      const snapshot = stored.get(id);
      if (isIntraday || !snapshot?.prices?.length || snapshot.state === "STALE" || !mappedInst || !selected.sharedHistory) {
        out.excluded.push({ id, reason: "Fresh licensed daily NSE price history is unavailable for this interval." });
        continue;
      }
      const received = new Date(snapshot.row.received_at).toISOString();
      const cutoff = Date.parse(options.eventCutoff ?? out.asOf);
      const retained = eligibleSharedPeriods(snapshot.prices, mappedInst, interval, cutoff);
      const periods = new Map<string, typeof retained[number]>();
      for (const price of retained) periods.set(interval === "1d" ? price.date : calendarPeriodKey(price.date, interval), price);
      if (!periods.size) {
        out.excluded.push({ id, reason: "No complete exchange period in the available price history." });
        continue;
      }
      const observations = Array.from(periods.values(), (price) => ({
        eventAt: sharedDailyEventAt(mappedInst, price.date), knownAt: received, close: price.close,
        ...(interval === "1d" && price.volume !== null && { volume: price.volume }),
      }));
      out.datasets.push({ instrumentId: id, currency: "INR", source: SHARED_HISTORY_LABEL,
        frequency: "PUBLISHED_EOD", permitted: true, observations, maxAgeMs: scanFreshnessMs(interval) });
      out.lineage.push({ instrumentId: id, provider: selected.provider, configVersion: selected.version,
        eventAt: observations.at(-1)!.eventAt, retrievedAt: received, adjustment: "UNSPECIFIED",
        displayAllowed: true, derivedDisplayAllowed: true, rightsExpiresAt: selected.rights.expiresAt,
        attribution: { label: selected.sharedHistory.attribution, url: selected.sharedHistory.attributionUrl }, interval });
      loadedIds.add(id);
      continue;
    }
    const a = await sourceResearch(
      id,
      subject,
      isIntraday ? interval : "1d",
      false,
      "analysis",
      selected.provider,
      { cutoff: options.eventCutoff ? Date.parse(options.eventCutoff) : undefined, grants, stored },
    );
    if (isIntraday) {
      const observations = completedCommercialIntradayObservations(
        a.candles,
        mappedInst?.market ?? "GLOBAL",
        options.eventCutoff ?? a.retrievedAt ?? out.asOf,
        interval,
      );
      const latest = observations.at(-1);
      if (
        !a.capabilities.analysis ||
        !a.capabilities.storage ||
        a.state === "STALE" ||
        !latest
      ) {
        out.excluded.push({
          id,
          reason:
            `Genuine completed ${interval === "30m" ? "30-minute (30m)" : "1-hour"} candles or analysis rights are unavailable for this instrument.`,
        });
        continue;
      }
      loadedIds.add(id);
      out.datasets.push({
        instrumentId: id,
        currency: a.currency,
        source: a.provider,
        permitted: true,
        frequency: interval === "30m" ? "INTRADAY_30M" : "INTRADAY_1H",
        maxAgeMs: scanFreshnessMs(interval),
        observations,
      });
      out.lineage.push({
        instrumentId: id,
        provider: selected.provider,
        eventAt: latest.eventAt,
        retrievedAt: a.retrievedAt ?? out.asOf,
        adjustment: "RAW",
        displayAllowed: rightsActive(selected, "display"),
        derivedDisplayAllowed:
          rightsActive(selected, "analysis") &&
          selected.rights.derivedDisplay === true,
        rightsExpiresAt: selected.rights.expiresAt,
        configVersion: selected.version,
        ...(a.attribution && { attribution: a.attribution }),
        interval,
        periodPolicy:
          interval === "30m"
            ? "COMPLETED_30M_SESSION_BARS_WITH_TERMINAL_CLOSE"
            : "COMPLETED_1H_SESSION_BARS_WITH_TERMINAL_CLOSE",
      });
      continue;
    }
    const cutoff = options.eventCutoff ? new Date(options.eventCutoff) : new Date();
    const currentDate = dateInZone(a.instrument?.timezone ?? "UTC", cutoff);
    const exchange = mappedInst?.market;
    const session = exchange === "NSE" || exchange === "BSE" || exchange === "MCX"
      ? getIndianExchangeSession(exchange, cutoff.getTime()) : null;
    const includeToday = session?.state === "CLOSED" && !session.specialSessionNote &&
      session.localTimeIST >= (exchange === "MCX" ? "23:55:00" : "15:30:00");
    const sharedInstrument = stored.get(id)?.instrument;
    const closed = options.eventCutoff && !sharedInstrument
      ? a.candles.filter((bar) => bar.date < currentDate || (bar.date === currentDate && includeToday))
      : a.candles;
    const rows = sharedInstrument ? eligibleSharedPeriods(closed, sharedInstrument, interval, cutoff.getTime())
      : completedPublishedPeriods(closed, interval, currentDate);
    const closes = aggregateReferences(rows, interval);
    const candles = aggregateCandles(rows, interval);
    if (
      !a.capabilities.analysis ||
      !a.capabilities.storage ||
      a.state === "STALE" ||
      !candles.length
    ) {
      out.excluded.push({
        id,
        reason:
          "Analysis/storage rights or fresh eligible candles are missing.",
      });
      continue;
    }
    loadedIds.add(id);
    out.datasets.push({
      instrumentId: id,
      currency: a.currency,
      source: a.provider,
      permitted: true,
      frequency: "PUBLISHED_EOD",
      maxAgeMs: scanFreshnessMs(interval),
      observations: candles.map((c, index) => ({
        eventAt: sharedInstrument ? sharedDailyEventAt(sharedInstrument, closes[index].date) : closes[index].date + "T00:00:00.000Z",
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
      provider: selected.provider,
      eventAt: sharedInstrument ? sharedDailyEventAt(sharedInstrument, closes.at(-1)!.date) : closes.at(-1)?.date ?? null,
      retrievedAt: a.retrievedAt!,
      adjustment: "RAW",
      displayAllowed: rightsActive(selected, "display"),
      derivedDisplayAllowed:
        rightsActive(selected, "analysis") &&
        selected.rights.derivedDisplay === true,
      rightsExpiresAt: selected.rights.expiresAt,
      configVersion: selected.version,
      ...(a.attribution && { attribution: a.attribution }),
      interval: options.interval ?? "1d",
      periodPolicy:
        options.interval && options.interval !== "1d"
          ? "GROUPED_DAILY_OHLC_IN_COMPLETED_CALENDAR_PERIOD"
          : "DAILY_SOURCE_OBSERVATIONS",
    });
  }
  out.asOf = new Date().toISOString();
  for (const id of options.instrumentIds ?? []) {
    if (!loadedIds.has(id) && !out.excluded.some((entry) => entry.id === id))
      out.excluded.push({
        id,
        kind: "unavailable",
        reason: "Historical market data is not active for this instrument yet.",
      });
  }
  out.excluded = [...new Map(out.excluded
    .filter(({ id }) => !loadedIds.has(id))
    .map((entry) => [entry.id, entry])).values()];
  out.discoveredCount = out.datasets.length + out.excluded.length;
  out.authorizedCount = out.datasets.length;
  const failureCategory: ResearchUniverseDiagnostics["failureCategory"] =
    out.datasets.length > 0
      ? "OK"
      : configs.length === 0
        ? "SHARED_MARKET_DATA_UNCONFIGURED"
        : out.excluded.some((e) => e.kind === "error")
          ? "UPSTREAM_UNAVAILABLE"
          : "NO_ELIGIBLE_HISTORY";
  out.diagnostics = {
    traceId: options.traceId ?? null,
    preset: preset ?? null,
    interval,
    catalogCount: out.discoveredCount,
    authorizedCount: out.authorizedCount,
    historyFetchedCount: out.datasets.length,
    excludedCount: out.excluded.length,
    failureCategory,
  };
  if (failureCategory !== "OK") {
    console.info(
      JSON.stringify({
        event: "soulscan_universe_diagnostic",
        traceId: options.traceId ?? null,
        preset: preset ?? null,
        interval,
        isOwner: isDataOwner(subject),
        sharedCommercialConfigs: configs.length,
        catalogCount: out.discoveredCount,
        authorizedCount: out.authorizedCount,
        excludedCount: out.excluded.length,
        failureCategory,
      }),
    );
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
  frequency: "DAILY_OHLC" | "DAILY_CLOSE";
};
/** Completed observations from the same licensed snapshots as research and alerts. */
export async function loadExtendedMarketData(subject: string, ids?: string[]) {
  if (ids && (ids.length > 160 || ids.some((id) => !/^[A-Z0-9]+:[A-Z0-9._&^-]{1,60}$/.test(id))))
    throw new HttpError(400, "Choose at most 160 canonical instruments.");
  const [reference, grants] = await Promise.all([loadMarketData(), sharedHistoryGrants()]);
  const wanted = ids ?? [...new Set(grants.flatMap(({ instruments }) => instruments.map(({ id }) => id)))].slice(0, 8);
  const stored = await readSharedDailyQuotes(wanted, grants);
  const marketQuotes: MarketQuote[] = [...stored.values()].map((quote) => ({
    id: quote.id,
    label: quote.instrument.name,
    assetClass: quote.instrument.type as MarketQuote["assetClass"],
    value: quote.value,
    unit: quote.unit,
    currency: quote.instrument.currency,
    provider: quote.attribution.label,
    sourceUrl: quote.attribution.url,
    rightsUrl: quote.attribution.url,
    eventAt: quote.latestDate,
    sourceDate: quote.latestDate,
    eventTimePrecision: "DATE",
    retrievedAt: quote.receivedAt,
    state: quote.quality,
    frequency: "DAILY_CLOSE",
    reason: "Completed session close.",
    derivation: null,
    change: quote.quality === "PUBLISHED_EOD" ? quote.pctChange : null,
    changeUnit: "%",
    canAnalyze: quote.quality === "PUBLISHED_EOD",
  }));
  // An existing individually entitled display feed may still cover an exact research instrument.
  // The shared dashboard uses a different entry point and never reads this fallback.
  if (isDataOwner(subject)) {
    const available = (await providerConfigs()).filter((c) => !c.sharedHistory &&
      (c.provider === "EODHD" || c.provider === "TRUEDATA") && rightsActive(c, "display"));
    const requested = [...new Set(available.flatMap(({ instruments }) => instruments.map(({ id }) => id)))]
      .filter((id) => !stored.has(id) && (!ids || ids.includes(id))).slice(0, 8);
    for (const asset of await Promise.all(requested.map((id) => assetResearch(id, subject, "1d", false)))) {
      const latest = asset.candles.at(-1);
      if (!latest || !asset.instrument) continue;
      marketQuotes.push({
        id: asset.id, label: asset.name, currency: asset.currency, unit: asset.unit,
        assetClass: asset.instrument.type as MarketQuote["assetClass"], value: latest.close,
        provider: asset.provider, sourceUrl: asset.sourceUrl, rightsUrl: asset.sourceUrl,
        eventAt: latest.date, sourceDate: latest.date, eventTimePrecision: "DATE", retrievedAt: asset.retrievedAt,
        frequency: "DAILY_OHLC", state: asset.state === "PUBLISHED_EOD" ? "PUBLISHED_EOD" : "STALE",
        reason: "Completed session close.", derivation: null, change: null, changeUnit: "%",
        canAnalyze: asset.capabilities.analysis && asset.state === "PUBLISHED_EOD",
      });
    }
  }
  return { ...reference, quotes: [...reference.quotes, ...marketQuotes], marketQuotes };
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
    !["30m", "1h", "1d", "1wk", "1mo"].includes(payload.interval) ||
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
