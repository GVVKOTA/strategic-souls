import { env } from "cloudflare:workers";
import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { OFFICIAL_FX_PAIRS, type DataPoint } from "./market-data";
import { loadOfficialReferences as loadMarketData } from "./official-references";
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
  EMPTY_HEALTH,
  PROVIDERS,
  ProviderFailure,
  indianDailyPrices,
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
import {
  SHARED_HISTORY_LABEL,
  activeContract,
  eligibleSharedPeriods,
  hasReadySharedHistory,
  hasSharedDerivedRights,
  hasSharedDisplayRights,
  nativeInterval,
  readSharedDailyQuotes,
  readSharedHistory,
  readSharedHistoryBatch,
  sharedDailyEventAt,
  sharedHistoryGrants,
  sharedIngestionHealth,
  type SharedGrant,
  type SharedHistory,
} from "./shared-history";
import { getIndianExchangeSession } from "./exchange-calendar";
import { X2_INSTRUMENTS, registryInstrument } from "./instrument-registry";
import {
  gatewayCandles,
  gatewaySearchInstruments,
  MarketGatewayError,
  resolveGatewayConfig,
} from "./angelone/gateway";
import {
  brokerScanFreshnessMs,
  brokerScanLookbackDays,
  completedBrokerObservations,
  completedCommercialIntradayObservations,
} from "./angelone/scan-history";
import { VERIFIED_SEED_INSTRUMENTS } from "./angelone/instrument-master";
import type {
  CandleInterval,
  InstrumentMasterEntry,
  NormalizedCandleSeries,
} from "./angelone/types";

export const PRIVATE_EXCHANGE_FEED_LABEL = "Configured Exchange Feed (Private)";
export const SHARED_EXCHANGE_FEED_LABEL = "Licensed Exchange Feed";
const CORE_MCX_SCAN_ROOTS = [
  "GOLD",
  "SILVER",
  "CRUDEOIL",
  "NATURALGAS",
  "COPPER",
] as const;
const EXTENDED_MCX_SCAN_ROOTS = [
  ...CORE_MCX_SCAN_ROOTS,
  "ZINC",
  "ALUMINIUM",
  "LEAD",
] as const;
const DEFAULT_MARKET_INDEX_IDS = new Set([
  "NSE:NIFTY",
  "NSE:BANKNIFTY",
  "BSE:SENSEX",
]);

const ownerBrokerCandleCache = new Map<
  string,
  { until: number; series: NormalizedCandleSeries }
>();

export function clearBrokerCandleCache(): void {
  ownerBrokerCandleCache.clear();
}

function brokerAdapterCacheScope(
  gw: ReturnType<typeof resolveGatewayConfig>,
): string {
  const tokenTag = gw.adapterAuthToken ? gw.adapterAuthToken.slice(0, 8) : "notok";
  const bindingTag = gw.adapterBinding ? "vpc" : (gw.adapterUrl ?? "none");
  return `${bindingTag}|${tokenTag}|${gw.flags.demoMode ? "demo" : "live"}`;
}

function isLocalAdapterUrl(gw: ReturnType<typeof resolveGatewayConfig>): boolean {
  return (
    !gw.adapterBinding &&
    typeof gw.adapterUrl === "string" &&
    /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(gw.adapterUrl)
  );
}

function pickNearestActiveMcxByRoot(
  entries: readonly InstrumentMasterEntry[],
  roots: readonly string[],
  nowMs = Date.now(),
): InstrumentMasterEntry[] {
  const active = entries.filter(
    (i) =>
      i.exchange === "MCX" &&
      i.segment === "FUTURE" &&
      (!i.expiry || Date.parse(`${i.expiry}T23:59:59+05:30`) >= nowMs),
  );
  const picked: InstrumentMasterEntry[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const best = active
      .filter((i) => i.symbol.toUpperCase() === root)
      .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"))[0];
    if (best && !seen.has(best.id)) {
      seen.add(best.id);
      picked.push(best);
    }
  }
  return picked;
}

async function resolveMcxRootAliasId(
  id: string,
  subject: string,
): Promise<string> {
  if (!/^MCX:(GOLD|SILVER|CRUDEOIL|NATURALGAS|COPPER)$/i.test(id)) return id;
  const root = id.split(":")[1].toUpperCase();
  const nowMs = Date.now();
  let matched = pickNearestActiveMcxByRoot(VERIFIED_SEED_INSTRUMENTS, [root], nowMs)[0];
  try {
    const found = await gatewaySearchInstruments({
      isOwner: isDataOwner(subject),
      exchange: "MCX",
      segment: "FUTURE",
      q: root,
      limit: 40,
      runtimeEnv: environment(),
    });
    const livePick = pickNearestActiveMcxByRoot(found.instruments, [root], nowMs)[0];
    if (livePick) matched = livePick;
  } catch {
    /* Fall back cleanly to verified unexpired seed contract */
  }
  return matched ? matched.id : id;
}

function isUnsupportedIntervalError(error: unknown): boolean {
  return (
    error instanceof MarketGatewayError &&
    error.status === 400 &&
    /unsupported candle interval/i.test(error.message)
  );
}

function isRetryableBrokerCandleError(
  error: unknown,
  consecutiveAuthFailures: number,
): boolean {
  if (!(error instanceof MarketGatewayError)) return false;
  if (
    error.code === "RATE_LIMITED" ||
    error.code === "TIMEOUT" ||
    error.code === "UPSTREAM_ERROR"
  ) {
    return !isUnsupportedIntervalError(error);
  }
  // Exchange WAF burst throttling can return HTTP 403 mapped to BROKER_AUTH_FAILED;
  // allow 1 paced retry unless consecutive auth failures indicate an expired session.
  if (error.code === "BROKER_AUTH_FAILED" && consecutiveAuthFailures < 3) {
    return true;
  }
  return false;
}

function selectBrokerScanCandidates(
  preset: ScanUniversePreset | undefined,
  mcxFound: readonly InstrumentMasterEntry[],
  nowMs = Date.now(),
): string[] {
  const nseEquities = VERIFIED_SEED_INSTRUMENTS.filter(
    (i) => i.exchange === "NSE" && i.segment === "EQUITY",
  ).map((i) => i.id);
  const coreIndices = VERIFIED_SEED_INSTRUMENTS.filter(
    (i) => i.segment === "INDEX" && DEFAULT_MARKET_INDEX_IDS.has(i.id),
  ).map((i) => i.id);
  const mergedMcx = [
    ...mcxFound,
    ...VERIFIED_SEED_INSTRUMENTS.filter((i) => i.exchange === "MCX" && i.segment === "FUTURE"),
  ];

  if (preset === "INDIAN_EQUITIES") {
    return [...new Set(nseEquities)];
  }
  if (preset === "MCX_FUTURES") {
    const core = pickNearestActiveMcxByRoot(mergedMcx, EXTENDED_MCX_SCAN_ROOTS, nowMs);
    const seen = new Set(core.map((i) => i.id));
    const extra = mergedMcx
      .filter(
        (i) =>
          !seen.has(i.id) &&
          matchesScanMarketPreset("MCX_FUTURES", i.exchange, i.segment, i.expiry),
      )
      .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
    return [...core, ...extra].map((i) => i.id);
  }
  // Default MARKET / CONNECTED_MARKETS: 16 liquid NSE leaders + 3 flagship indices + 5 core active MCX futures = 24 instruments (0 deferrals).
  const coreMcx = pickNearestActiveMcxByRoot(mergedMcx, CORE_MCX_SCAN_ROOTS, nowMs).map(
    (i) => i.id,
  );
  const equitySlots = Math.max(12, 24 - coreIndices.length - coreMcx.length);
  return [...new Set([...nseEquities.slice(0, equitySlots), ...coreIndices, ...coreMcx])];
}
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

export async function exchangeScanAvailable(subject: string): Promise<boolean> {
  const { flags } = resolveGatewayConfig(environment());
  if (isDataOwner(subject) && flags.enablePrivateBrokerData) return true;
  if (flags.mode === "public_licensed" && flags.enablePublicExchangeQuotes) return true;
  const grants = await sharedHistoryGrants(Date.now(), "research");
  const marketIds = grants.flatMap(({ instruments }) =>
    instruments
      .filter((instrument) =>
        matchesScanMarketPreset("MARKET", instrument.market, instrument.type, instrument.expiry),
      )
      .map(({ id }) => id),
  );
  if (grants.length && marketIds.length && await hasReadySharedHistory(grants, "1d", marketIds)) {
    return true;
  }
  const owner = isDataOwner(subject);
  const configs = await providerConfigs();
  return configs.some((config) =>
    !config.sharedHistory &&
    config.provider !== "BHARATSTOCK" &&
    config.provider !== "INDIANAPI" &&
    (owner || config.rights.redistribution) &&
    rightsActive(config, "analysis") && rightsActive(config, "storage") &&
    config.datasets.includes("candles") && config.instruments.some((instrument) =>
      matchesScanMarketPreset("MARKET", instrument.market, instrument.type, instrument.expiry),
    ),
  );
}
export async function canScanExchange(
  interval: Interval,
  instrumentIds?: readonly string[],
  provider?: ProviderId,
) {
  const grants = await sharedHistoryGrants(Date.now(), "research");
  return hasReadySharedHistory(
    provider ? grants.filter((grant) => grant.provider === provider) : grants,
    interval,
    instrumentIds,
  );
}
export async function scanScopeInstruments(preset: ScanUniversePreset, interval: Interval) {
  if (preset === "ECB_DAILY") return OFFICIAL_FX_PAIRS.map(({ id }) => id).sort();
  if (preset === "NIFTY_500") {
    const active = await niftyUniverse().catch(() => null);
    return active ? active.constituents.map(({ id }) => id) : [];
  }
  const now = Date.now();
  const ids = (await sharedHistoryGrants(now, "research"))
    .filter((grant) => grant.sharedHistory.intervals.includes(nativeInterval(interval)))
    .flatMap((grant) => grant.instruments)
    .filter((instrument) => activeContract(instrument, now) &&
      matchesScanMarketPreset(preset, instrument.market, instrument.type, instrument.expiry))
    .map(({ id }) => id);
  return [...new Set(ids)].sort();
}
export async function instrumentRegistry(subject?: string) {
  const [configs, membership] = await Promise.all([
    providerConfigs(),
    subject ? niftyUniverse().catch(() => null) : Promise.resolve(null),
  ]);
  const constituents = new Map(membership?.constituents.map((row) => [row.id, row]));
  const ids = new Set<string>();
  const gw = resolveGatewayConfig(environment());
  const owner = !!subject && isDataOwner(subject);
  const ownerBrokerReady = owner && gw.flags.enablePrivateBrokerData;
  const ownerSeeds = ownerBrokerReady
    ? VERIFIED_SEED_INSTRUMENTS.map((i) => ({
        id: i.id,
        label: i.symbol,
        name: i.name,
        market: i.exchange,
        assetClass: i.segment,
        currency: i.currency,
        expiry: i.expiry,
        lotSize: i.lotSize,
        tickSize: i.tickSize,
        sourceUrl: registryInstrument(i.id)?.sourceUrl ?? "",
        mappingStatus: "PRIVATE_OWNER_BROKER_SEED",
        availabilityState: "DATA_CONNECTED" as const,
      }))
    : [];
  return [
    ...configs
      .filter((c) => {
        if (c.sharedHistory) {
          return !!subject && hasSharedDisplayRights(c) && !!secretFrom(c.provider, environment());
        }
        return rightsActive(c, "display") && (owner || c.rights.redistribution);
      })
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
          mappingStatus: constituents.has(i.id)
            ? "OFFICIAL_CONSTITUENT"
            : "OWNER_VERIFIED_SOURCE_MAPPING",
          availabilityState: "DATA_CONNECTED" as const,
        })),
      ),
    ...ownerSeeds,
    ...(membership?.constituents.map((entry) => ({
      id: entry.id,
      label: entry.id.slice(4),
      name: entry.name,
      market: "NSE" as const,
      assetClass: "EQUITY" as const,
      currency: "INR",
      sector: entry.industry,
      sourceUrl: "https://www.niftyindices.com/indices/equity/broad-based-indices/nifty-500",
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
  const [rows, sharedIngestion, activeUniverse] = await Promise.all([
    database().prepare("SELECT * FROM x2_providers ORDER BY provider").all<ConfigRow>(),
    sharedIngestionHealth().catch(() => []),
    niftyUniverse().catch(() => null),
  ]);
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
    sharedIngestion,
    universe: activeUniverse
      ? {
          version: activeUniverse.version,
          effectiveDate: activeUniverse.effectiveDate,
          validatedAt: activeUniverse.validatedAt,
          expectedCount: activeUniverse.expectedCount,
          distinctCount: activeUniverse.distinctCount,
          count: activeUniverse.constituents.length,
          rightsExpiresAt: activeUniverse.rightsExpiresAt,
          provenance: activeUniverse.provenance,
        }
      : null,
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
    if ((config?.provider === "INDIANAPI" || config?.provider === "BHARATSTOCK") && input.useNiftyUniverse === true) {
      const snapshot = await niftyUniverse();
      if (!snapshot) throw new HttpError(409, "Import the licensed Nifty 500 snapshot before mapping it.");
      next = validateConfig({
        ...config,
        instruments: snapshot.constituents.map((row) => ({
          id: row.id,
          name: row.name,
          symbol: row.id.slice(4),
          providerSymbol: row.id.slice(4),
          market: "NSE",
          mic: "XNSE",
          type: "EQUITY",
          currency: "INR",
          unit: "INR per share",
          timezone: "Asia/Kolkata",
        })),
      });
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
  const previousConfig = row ? (JSON.parse(row.payload) as ProviderConfig) : null;
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
  if (previousConfig?.sharedHistory) {
    try {
      await db.batch([
        db.prepare("DELETE FROM x8_shared_history_snapshot WHERE provider=? AND config_version<>? AND EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?)")
          .bind(next.provider, next.version, next.provider, next.version),
        db.prepare("DELETE FROM x8_shared_history_task WHERE provider=? AND config_version<>? AND EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?)")
          .bind(next.provider, next.version, next.provider, next.version),
      ]);
    } catch {
      /* Shared tables absent in legacy test harness */
    }
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
        if (c.sharedHistory) {
          const backoff = await database().prepare(`SELECT paused_until,last_error FROM x8_shared_history_plan
            WHERE provider=? AND config_version=? AND paused_until>?`).bind(id, c.version, Date.now())
            .first<{ paused_until: number; last_error: string | null }>().catch(() => null);
          if (backoff && backoff.last_error !== "AUTH_FAILED")
            throw new ProviderFailure("RATE_LIMITED", "Wait for the provider backoff to finish.");
        }
        if (c.sharedHistory) {
          await reserveProviderCall(c);
        } else {
          await quota(c);
        }
        const bars = c.provider === "INDIANAPI"
          ? await indianDailyPrices(instrument.providerSymbol, secret, environment().INDIA_API_HOST)
          : c.datasets.includes("candles")
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
        if (c.sharedHistory) await recordProviderBackoff(c, e).catch(() => {});
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
    await database()
      .prepare("UPDATE x8_shared_history_plan SET paused_until=0,failures=0,last_error=NULL WHERE provider=? AND config_version=?")
      .bind(id, c.version)
      .run()
      .catch(() => {});
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
    cutoff?: number;
    grants?: SharedGrant[];
    stored?: Map<string, SharedHistory>;
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
  const nowMs = shared?.cutoff ?? Date.now();
  const requireDisplay = purpose === "display";
  const sharedGrants =
    shared?.grants ??
    (subject
      ? await sharedHistoryGrants(nowMs, requireDisplay ? "display" : "research")
      : []);
  const stored = shared?.stored
    ? (() => {
        const hit = shared.stored.get(id);
        if (!hit) return null;
        return requireDisplay && !hasSharedDisplayRights(hit.config, nowMs) ? null : hit;
      })()
    : subject && sharedGrants.length
      ? await readSharedHistory(id, interval, sharedGrants, {
          cutoff: shared?.cutoff,
          provider: pinnedProvider,
          requireDisplay,
        })
      : null;
  if (stored) {
    const priceOnly = stored.prices;
    const retained = eligibleSharedPeriods(stored.candles, stored.instrument, interval, nowMs);
    const grouped = interval === "1wk" || interval === "1mo";
    const references = grouped ? aggregateReferences(retained, interval) : retained;
    const candles = grouped
      ? aggregateCandles(retained, interval).map((bar, index) => ({ ...bar, date: references[index].date }))
      : retained;
    const receivedAt = new Date(stored.row.received_at).toISOString();
    const dailyPrices = priceOnly
      ? eligibleSharedPeriods(priceOnly, stored.instrument, interval, nowMs).map(({ date, close }) => ({
          date,
          close,
          knownAt: receivedAt,
        }))
      : null;
    const priceReferences = dailyPrices && (grouped ? aggregateReferences(dailyPrices, interval) : dailyPrices);
    const attribution = {
      label: stored.config.sharedHistory.attribution,
      url: stored.config.sharedHistory.attributionUrl,
    };
    const { providerSymbol: internalMapping, ...publicMapping } = stored.instrument;
    void internalMapping;
    const displayPermitted = hasSharedDisplayRights(stored.config, nowMs);
    return {
      ...result,
      name: stored.instrument.name,
      instrument: { ...publicMapping, providerSymbol: stored.instrument.symbol },
      provider: SHARED_HISTORY_LABEL,
      sourceUrl: attribution.url,
      attribution,
      currency: stored.instrument.currency,
      unit: stored.instrument.unit,
      state: stored.state,
      asOf: receivedAt,
      retrievedAt: receivedAt,
      candles,
      references: priceReferences ?? candles.map(({ date, close, knownAt }) => ({ date, close, knownAt })),
      coverage: { firstDate: stored.row.first_event, lastDate: stored.row.last_event, bars: stored.row.bar_count },
      capabilities: {
        ...result.capabilities,
        chart: displayPermitted && Boolean(priceReferences?.length || candles.length),
        candles: candles.length > 0,
        volume: candles.some((bar) => bar.volume !== null),
        analysis: hasSharedDerivedRights(stored.config, nowMs),
        derivedDisplay: hasSharedDerivedRights(stored.config, nowMs),
        storage: true,
      },
      limitations: [
        "Completed exchange observations from shared server cache. Source timestamps are retained.",
        ...(priceOnly ? ["Daily closing price and volume only; open/high/low candles are not fabricated."] : []),
      ],
    };
  }
  const owner = isDataOwner(subject);
  const configs = (await providerConfigs()).filter(
    (c) =>
      !c.sharedHistory &&
      c.provider !== "BHARATSTOCK" &&
      c.provider !== "INDIANAPI" &&
      (owner || c.rights.redistribution) &&
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
        const isIntraday = interval === "30m" || interval === "1h";
        if (c.datasets.includes("candles")) {
          await quota(c);
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

  // Private owner-only read-only exchange feed (never accessible to non-owner/public readers unless explicitly licensed).
  const gwConfig = resolveGatewayConfig(environment());
  const gatewayFeedAllowed =
    (isDataOwner(subject) && gwConfig.flags.enablePrivateBrokerData) ||
    (gwConfig.flags.mode === "public_licensed" && gwConfig.flags.enablePublicExchangeQuotes);
  const feedLabel =
    gwConfig.flags.mode === "public_licensed" && gwConfig.flags.enablePublicExchangeQuotes && !isDataOwner(subject)
      ? SHARED_EXCHANGE_FEED_LABEL
      : PRIVATE_EXCHANGE_FEED_LABEL;
  if (
    !pinnedProvider &&
    gatewayFeedAllowed &&
    /^(NSE|BSE|MCX):/i.test(id)
  ) {
    try {
      const isIntraday = interval === "30m" || interval === "1h";
      const targetGatewayId = await resolveMcxRootAliasId(id, subject);
      const series = await gatewayCandles({
        authenticated: true,
        isOwner: isDataOwner(subject),
        id: targetGatewayId,
        interval: isIntraday ? interval : "1d",
        days: interval === "30m" ? 30 : interval === "1h" ? 45 : 180,
        runtimeEnv: environment(),
      });
      if (series.candles.length > 0) {
        const rawBars = series.candles.map((b) => ({
          date: isIntraday ? b.timestampUTC : b.dateIST,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          adjustedClose: null,
          volume: b.volume,
          openInterest: b.openInterest,
          knownAt: series.retrievalTimestampUTC,
          adjustment: "RAW" as const,
          provider: feedLabel,
        }));
        const aggregated = isIntraday ? rawBars : aggregateCandles(rawBars, interval);
        return {
          ...result,
          id,
          name: series.instrument.name,
          instrument: {
            id: series.instrument.id,
            name: series.instrument.name,
            symbol: series.instrument.symbol,
            providerSymbol: series.instrument.tradingSymbol,
            market: series.instrument.exchange,
            mic: series.instrument.mic,
            type: series.instrument.segment,
            currency: series.instrument.currency,
            unit: series.instrument.unit,
            timezone: series.instrument.timezone,
            ...(series.instrument.expiry
              ? {
                  expiry: series.instrument.expiry,
                  lotSize: series.instrument.lotSize,
                  tickSize: series.instrument.tickSize ?? 1,
                }
              : {}),
          },
          provider: feedLabel,
          sourceUrl: registryInstrument(series.instrument.id)?.sourceUrl ?? "",
          state: series.quality,
          asOf: series.retrievalTimestampUTC,
          retrievedAt: series.retrievalTimestampUTC,
          unit: series.instrument.unit,
          currency: series.instrument.currency,
          candles: aggregated,
          references: aggregated.map((b) => ({
            date: b.date,
            close: b.close,
            knownAt: b.knownAt,
          })),
          capabilities: {
            ...result.capabilities,
            chart: true,
            candles: true,
            volume: rawBars.some((b) => b.volume !== null),
            analysis: true,
            derivedDisplay: true,
            storage: true,
          },
          limitations: [
            ...series.limitations,
            ...(interval === "1d" || interval === "1h" || interval === "30m"
              ? []
              : [
                  "Aggregated daily bars may include a developing latest calendar group, not a completed period.",
                ]),
          ],
        };
      }
    } catch {
      return {
        ...result,
        provider: feedLabel,
        limitations: [
          "Exchange historical feed is currently unavailable for this symbol. Last-known values are never fabricated.",
        ],
      };
    }
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
  if (
    provider === PRIVATE_EXCHANGE_FEED_LABEL ||
    provider === SHARED_EXCHANGE_FEED_LABEL ||
    provider === "Angel One SmartAPI (Private Owner)"
  ) {
    const cfg = resolveGatewayConfig(environment());
    const active =
      cfg.flags.enablePrivateBrokerData ||
      (cfg.flags.mode === "public_licensed" && cfg.flags.enablePublicExchangeQuotes);
    return {
      displayAllowed: active,
      derivedDisplayAllowed: active,
      rightsExpiresAt: null,
    };
  }
  if (!["TRUEDATA", "EODHD", "INDIANAPI", "BHARATSTOCK"].includes(provider)) {
    return { displayAllowed: false, derivedDisplayAllowed: false, rightsExpiresAt: null };
  }
  let configured = configuration?.get("provider-configs");
  if (!configured) {
    configured = providerConfigs();
    configuration?.set("provider-configs", configured);
  }
  const c = (await configured).find(
    (cfg) =>
      cfg.provider === provider &&
      (version === undefined || cfg.version === version) &&
      cfg.instruments.some((i) => i.id === instrumentId),
  );
  if (!c) {
    return { displayAllowed: false, derivedDisplayAllowed: false, rightsExpiresAt: null };
  }
  if (c.sharedHistory) {
    const secretOk = !!secretFrom(c.provider, environment());
    return {
      displayAllowed: secretOk && hasSharedDisplayRights(c),
      derivedDisplayAllowed: secretOk && hasSharedDerivedRights(c),
      rightsExpiresAt: c.rights.expiresAt,
    };
  }
  return {
    displayAllowed: rightsActive(c, "display"),
    derivedDisplayAllowed:
      rightsActive(c, "analysis") && c.rights.derivedDisplay === true,
    rightsExpiresAt: c.rights.expiresAt,
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
    attribution?: { label: string; url: string };
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
  const brokerMaxLimit = Math.max(1, Math.min(24, options.limit ?? 24));
  const sharedMaxLimit = Math.max(1, Math.min(100, options.limit ?? 24));
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
        maxAgeMs: brokerScanFreshnessMs(interval),
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
  const cutoffMs = options.eventCutoff ? Date.parse(options.eventCutoff) : Date.now();
  const owner = isDataOwner(subject);
  const grants = await sharedHistoryGrants(Date.now(), "research");
  const eligibleGrants = grants.filter((grant) => grant.sharedHistory.intervals.includes(nativeInterval(interval)));
  const legacyConfigs = (await providerConfigs()).filter(
    (c) =>
      !c.sharedHistory &&
      c.provider !== "BHARATSTOCK" &&
      c.provider !== "INDIANAPI" &&
      (owner || c.rights.redistribution) &&
      rightsActive(c, "analysis") &&
      rightsActive(c, "storage"),
  );
  const configs = [...eligibleGrants, ...legacyConfigs].filter(
    (c) =>
      options.provider === "CONNECTED_MARKETS" ||
      options.provider === "SHARED" ||
      options.provider === c.provider,
  );
  const allCommercialIds = [
    ...new Set(configs.flatMap((c) => c.instruments
      .filter((i) => activeContract(i, cutoffMs) &&
        matchesScanMarketPreset(preset, i.market, i.type, i.expiry))
      .map((i) => i.id))),
  ].filter(
    (id) =>
      !options.instrumentIds?.length || options.instrumentIds.includes(id),
  );
  const maxLimit = eligibleGrants.length > 0 && configs.every((c) => !!c.sharedHistory) ? sharedMaxLimit : brokerMaxLimit;
  const ids = allCommercialIds.slice(0, maxLimit);
  for (const deferredId of allCommercialIds.slice(maxLimit)) {
    out.excluded.push({
      id: deferredId,
      kind: "deferred",
      reason: `Deferred beyond single-batch scan cap (${maxLimit} instruments).`,
    });
  }
  const loadedIds = new Set<string>();
  const pinnedSharedProvider: ProviderId | undefined =
    options.provider === "INDIANAPI" ||
    options.provider === "BHARATSTOCK" ||
    options.provider === "TRUEDATA" ||
    options.provider === "EODHD"
      ? options.provider
      : undefined;
  const stored = eligibleGrants.length && ids.length
    ? await readSharedHistoryBatch(ids, interval, eligibleGrants, {
        cutoff: options.eventCutoff ? cutoffMs : undefined,
        provider: pinnedSharedProvider,
        requireDisplay: false,
      })
    : new Map<string, SharedHistory>();
  for (const id of ids) {
    const selected = stored.get(id)?.config ?? configs.find((c) =>
      c.instruments.some((i) => i.id === id &&
        matchesScanMarketPreset(preset, i.market, i.type, i.expiry)),
    )!;
    const mappedInst = selected.instruments.find((i) => i.id === id);
    if (selected.provider === "INDIANAPI") {
      const snapshot = stored.get(id);
      if (isIntraday || !snapshot?.prices?.length || snapshot.state === "STALE" || !mappedInst || !selected.sharedHistory) {
        out.excluded.push({
          id,
          kind: "unavailable",
          reason: isIntraday
            ? "Indian API supplies daily closes only; intraday intervals are unsupported."
            : "Fresh licensed daily NSE price history is unavailable for this instrument.",
        });
        continue;
      }
      const received = new Date(snapshot.row.received_at).toISOString();
      const retained = eligibleSharedPeriods(snapshot.prices, mappedInst, interval, cutoffMs);
      const periods = new Map<string, typeof retained[number]>();
      for (const price of retained) {
        periods.set(interval === "1d" ? price.date : calendarPeriodKey(price.date, interval), price);
      }
      if (!periods.size) {
        out.excluded.push({ id, reason: "No complete exchange period in the available price history." });
        continue;
      }
      const observations = Array.from(periods.values(), (price) => ({
        eventAt: sharedDailyEventAt(mappedInst, price.date),
        knownAt: received,
        close: price.close,
        ...(interval === "1d" && price.volume !== null ? { volume: price.volume } : {}),
      }));
      out.datasets.push({
        instrumentId: id,
        currency: mappedInst.currency || "INR",
        source: selected.sharedHistory.attribution || SHARED_HISTORY_LABEL,
        frequency: "PUBLISHED_EOD",
        permitted: true,
        observations,
        maxAgeMs: brokerScanFreshnessMs(interval),
      });
      out.lineage.push({
        instrumentId: id,
        provider: selected.provider,
        configVersion: selected.version,
        eventAt: observations.at(-1)!.eventAt,
        retrievedAt: received,
        adjustment: "UNSPECIFIED",
        displayAllowed: hasSharedDisplayRights(selected),
        derivedDisplayAllowed: hasSharedDerivedRights(selected),
        rightsExpiresAt: selected.rights.expiresAt,
        attribution: {
          label: selected.sharedHistory.attribution,
          url: selected.sharedHistory.attributionUrl,
        },
        interval,
        periodPolicy:
          interval === "1d"
            ? "DAILY_CLOSE_ONLY_SOURCE_OBSERVATIONS"
            : "LAST_CLOSE_IN_COMPLETED_CALENDAR_PERIOD",
      });
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
      { cutoff: options.eventCutoff ? cutoffMs : undefined, grants: eligibleGrants, stored },
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
        maxAgeMs: brokerScanFreshnessMs(interval),
        observations,
      });
      out.lineage.push({
        instrumentId: id,
        provider: selected.sharedHistory ? selected.provider : a.provider,
        eventAt: latest.eventAt,
        retrievedAt: a.retrievedAt ?? out.asOf,
        adjustment: "RAW",
        displayAllowed: selected.sharedHistory
          ? hasSharedDisplayRights(selected)
          : rightsActive(selected, "display"),
        derivedDisplayAllowed: selected.sharedHistory
          ? hasSharedDerivedRights(selected)
          : rightsActive(selected, "analysis") && selected.rights.derivedDisplay === true,
        rightsExpiresAt: selected.rights.expiresAt,
        configVersion: selected.version,
        ...(a.attribution ? { attribution: a.attribution } : {}),
        interval,
        periodPolicy:
          interval === "30m"
            ? "COMPLETED_30M_SESSION_BARS_WITH_TERMINAL_CLOSE"
            : "COMPLETED_1H_SESSION_BARS_WITH_TERMINAL_CLOSE",
      });
      continue;
    }
    const cutoffDate = options.eventCutoff ? new Date(cutoffMs) : new Date();
    const currentDate = dateInZone(a.instrument?.timezone ?? "UTC", cutoffDate);
    const exchange = mappedInst?.market;
    const session = exchange === "NSE" || exchange === "BSE" || exchange === "MCX"
      ? getIndianExchangeSession(exchange, cutoffDate.getTime())
      : null;
    const includeToday = session?.state === "CLOSED" && !session.specialSessionNote &&
      session.localTimeIST >= (exchange === "MCX" ? "23:55:00" : "15:30:00");
    const sharedInstrument = stored.get(id)?.instrument;
    const closed = options.eventCutoff && !sharedInstrument
      ? a.candles.filter((bar) => bar.date < currentDate || (bar.date === currentDate && includeToday))
      : a.candles;
    const rows = sharedInstrument
      ? eligibleSharedPeriods(closed, sharedInstrument, interval, cutoffDate.getTime())
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
      maxAgeMs: brokerScanFreshnessMs(interval),
      observations: candles.map((c, index) => ({
        eventAt: sharedInstrument
          ? sharedDailyEventAt(sharedInstrument, closes[index].date)
          : closes[index].date + "T00:00:00.000Z",
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
      provider: selected.sharedHistory ? selected.provider : a.provider,
      eventAt: sharedInstrument
        ? sharedDailyEventAt(sharedInstrument, closes.at(-1)!.date)
        : closes.at(-1)?.date ?? null,
      retrievedAt: a.retrievedAt!,
      adjustment: "RAW",
      displayAllowed: selected.sharedHistory
        ? hasSharedDisplayRights(selected)
        : rightsActive(selected, "display"),
      derivedDisplayAllowed: selected.sharedHistory
        ? hasSharedDerivedRights(selected)
        : rightsActive(selected, "analysis") && selected.rights.derivedDisplay === true,
      rightsExpiresAt: selected.rights.expiresAt,
      configVersion: selected.version,
      ...(a.attribution ? { attribution: a.attribution } : {}),
      interval: options.interval ?? "1d",
      periodPolicy:
        options.interval && options.interval !== "1d"
          ? "GROUPED_DAILY_OHLC_IN_COMPLETED_CALENDAR_PERIOD"
          : "DAILY_SOURCE_OBSERVATIONS",
    });
  }
  // Prefer an eligible licensed series for the same identifier; add exchange gateway
  // series strictly when either owner-private OR explicitly licensed public redistribution is enabled.
  const gw = resolveGatewayConfig(environment());
  const ownerFeedAllowed = isDataOwner(subject) && gw.flags.enablePrivateBrokerData;
  const sharedLicensedGatewayAllowed =
    gw.flags.mode === "public_licensed" && gw.flags.enablePublicExchangeQuotes;
  if (
    (ownerFeedAllowed || sharedLicensedGatewayAllowed) &&
    (options.provider === "ANGELONE" || options.provider === "CONNECTED_MARKETS")
  ) {
    let mcxFound: InstrumentMasterEntry[] = [];
    if (!options.instrumentIds?.length && (preset === "MCX_FUTURES" || preset === "MARKET" || !preset)) {
      try {
        mcxFound = (await gatewaySearchInstruments({
          isOwner: isDataOwner(subject),
          exchange: "MCX",
          segment: "FUTURE",
          limit: preset === "MCX_FUTURES" ? 50 : 30,
          runtimeEnv: environment(),
        })).instruments;
      } catch {
        // Retain verified seed catalog when live search is unavailable.
      }
    }
    const explicitCandidates: string[] = [];
    if (options.instrumentIds?.length) {
      for (const rawId of options.instrumentIds) {
        if (preset === "INDIAN_EQUITIES" && !/^(NSE|BSE):/i.test(rawId)) continue;
        if (preset === "MCX_FUTURES" && !/^MCX:/i.test(rawId)) continue;
        if (!/^(NSE|BSE|MCX):/i.test(rawId)) continue;
        explicitCandidates.push(await resolveMcxRootAliasId(rawId, subject));
      }
    }
    const rawBrokerCandidates = [
      ...new Set(
        options.instrumentIds?.length
          ? explicitCandidates
          : selectBrokerScanCandidates(preset, mcxFound),
      ),
    ].filter((id) => !loadedIds.has(id));
    const targetBars = Math.min(1_500, Math.max(100, (options.minimumBars ?? 0) + 60));
    const remainingBudget = Math.min(
      Math.floor(7_500 / targetBars),
      Math.max(0, brokerMaxLimit - ids.length),
    );
    const candidateIds = rawBrokerCandidates.slice(0, remainingBudget);
    for (const deferredId of rawBrokerCandidates.slice(remainingBudget)) {
      out.excluded.push({
        id: deferredId,
        kind: "deferred",
        reason: `Deferred beyond this run's scan batch cap (${remainingBudget} instruments).`,
      });
    }
    const maxAgeMs = brokerScanFreshnessMs(interval);
    const rawDays = brokerScanLookbackDays(interval, options.minimumBars);
    // Use a unified 120-day (~80 trading bars) floor for daily broker scans so SMA(50) metrics
    // always populate and back-to-back Classic/Advanced formulas share the same owner cache key.
    const days = interval === "1d" ? Math.max(120, rawDays) : rawDays;
    const reqInterval: CandleInterval = isIntraday ? interval : "1d";
    const source =
      sharedLicensedGatewayAllowed && !ownerFeedAllowed
        ? SHARED_EXCHANGE_FEED_LABEL
        : PRIVATE_EXCHANGE_FEED_LABEL;
    const isLocalAdapter = isLocalAdapterUrl(gw);
    const minSpacingMs = isLocalAdapter ? 15 : 360;
    const retryBackoffMs = isLocalAdapter ? 35 : 950;
    const cacheTtlMs = isIntraday ? 45_000 : 300_000;
    const cacheScope = brokerAdapterCacheScope(gw);
    const ownerFlag = isDataOwner(subject);
    let lastNetworkCallAt = 0;
    let consecutiveAuthFailures = 0;
    let succeededCount = 0;
    let unsupportedIntervalMessage: string | null = null;

    const loadBrokerCandles = async (id: string): Promise<NormalizedCandleSeries> => {
      const cacheKey = `${subject}|${ownerFlag ? "1" : "0"}|${cacheScope}|${id}|${reqInterval}|${days}`;
      const cached = ownerBrokerCandleCache.get(cacheKey);
      if (cached && cached.until > Date.now()) {
        return cached.series;
      }

      const executeFetch = async (): Promise<NormalizedCandleSeries> => {
        const now = Date.now();
        const waitMs = minSpacingMs - (now - lastNetworkCallAt);
        if (lastNetworkCallAt > 0 && waitMs > 0) {
          await new Promise((r) => setTimeout(r, waitMs));
        }
        try {
          const res = await gatewayCandles({
            authenticated: true,
            isOwner: ownerFlag,
            id,
            interval: reqInterval,
            days,
            traceId: options.traceId,
            runtimeEnv: environment(),
          });
          lastNetworkCallAt = Date.now();
          return res;
        } catch (err) {
          // Local 404/400 validation errors never hit upstream exchange rate limits.
          if (
            !(
              err instanceof MarketGatewayError &&
              (err.code === "INVALID_SYMBOL" || err.status === 400)
            )
          ) {
            lastNetworkCallAt = Date.now();
          }
          throw err;
        }
      };

      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const series = await executeFetch();
          consecutiveAuthFailures = 0;
          succeededCount += 1;
          if (series.sourceMode === "PRIVATE_OWNER_FEED" && series.candles.length > 0) {
            if (ownerBrokerCandleCache.size >= 160) {
              const nowCleanup = Date.now();
              for (const [k, v] of ownerBrokerCandleCache) {
                if (v.until <= nowCleanup) ownerBrokerCandleCache.delete(k);
              }
              if (ownerBrokerCandleCache.size >= 160) {
                const oldest = ownerBrokerCandleCache.keys().next().value;
                if (oldest) ownerBrokerCandleCache.delete(oldest);
              }
            }
            ownerBrokerCandleCache.set(cacheKey, {
              until: Date.now() + cacheTtlMs,
              series,
            });
          }
          return series;
        } catch (err) {
          lastErr = err;
          if (
            err instanceof MarketGatewayError &&
            err.code === "BROKER_AUTH_FAILED"
          ) {
            consecutiveAuthFailures += 1;
          }
          if (
            attempt === 0 &&
            isRetryableBrokerCandleError(
              err,
              succeededCount > 0 ? Math.min(consecutiveAuthFailures, 2) : consecutiveAuthFailures,
            )
          ) {
            const delayMs =
              err instanceof MarketGatewayError && err.retryAfterMs
                ? Math.min(2_000, Math.max(retryBackoffMs, err.retryAfterMs))
                : retryBackoffMs;
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    };

    for (const id of candidateIds) {
      if (unsupportedIntervalMessage) {
        out.excluded.push({
          id,
          kind: "scope",
          reason: unsupportedIntervalMessage,
        });
        continue;
      }
      try {
        const series = await loadBrokerCandles(id);
        const instrument = series.instrument;
        if (!matchesScanMarketPreset(preset, instrument.exchange, instrument.segment, instrument.expiry)) {
          out.excluded.push({
            id,
            reason: "Instrument is outside the selected universe or its contract has expired.",
          });
          continue;
        }
        const workerReceivedMs = Date.now();
        const workerReceivedIso = new Date(workerReceivedMs).toISOString();
        const rawObservations =
          series.sourceMode === "PRIVATE_OWNER_FEED"
            ? completedBrokerObservations(series, interval).slice(-targetBars)
            : [];
        // Clamp minor adapter-vs-Worker clock-ahead skew on knownAt to Worker receipt time
        // (never shifts eventAt, and never moves knownAt forward) so the last fetched symbol is never dropped.
        const observations = rawObservations.map((obs) => {
          const kMs = Date.parse(obs.knownAt);
          return Number.isFinite(kMs) && kMs > workerReceivedMs
            ? { ...obs, knownAt: workerReceivedIso }
            : obs;
        });
        const latest = observations.at(-1);
        if (!latest) {
          out.excluded.push({
            id,
            reason: "No completed candles are available for the selected timeframe.",
          });
          continue;
        }
        if (Date.now() - Date.parse(latest.eventAt) > maxAgeMs) {
          out.excluded.push({
            id,
            reason: "Completed historical candles are stale for the selected timeframe.",
          });
          continue;
        }
        const canonicalId = instrument.id;
        const alreadyLoaded = loadedIds.has(canonicalId);
        loadedIds.add(id);
        loadedIds.add(canonicalId);
        if (alreadyLoaded) continue;
        out.datasets.push({
          instrumentId: canonicalId,
          currency: instrument.currency,
          source,
          permitted: true,
          frequency:
            interval === "30m"
              ? "INTRADAY_30M"
              : interval === "1h"
                ? "INTRADAY_1H"
                : "PUBLISHED_EOD",
          maxAgeMs,
          observations,
        });
        out.lineage.push({
          instrumentId: canonicalId,
          provider: source,
          eventAt: latest.eventAt,
          retrievedAt: series.retrievalTimestampUTC,
          adjustment: "RAW",
          displayAllowed: true,
          derivedDisplayAllowed: true,
          rightsExpiresAt: null,
          interval,
          periodPolicy:
            interval === "30m"
              ? "COMPLETED_30M_SESSION_BARS_WITH_TERMINAL_CLOSE"
              : interval === "1h"
                ? "COMPLETED_1H_SESSION_BARS_WITH_TERMINAL_CLOSE"
                : interval === "1d"
                  ? "PRIVATE_OWNER_COMPLETED_DAILY_CANDLES"
                  : "PRIVATE_OWNER_DAILY_CANDLES_IN_COMPLETED_CALENDAR_PERIODS",
        });
      } catch (error) {
        if (interval === "30m" && isUnsupportedIntervalError(error)) {
          unsupportedIntervalMessage =
            "30m intraday candles are not yet active on the connected exchange feed adapter. Use 1 Hour, Daily, Weekly, or Monthly now — 0 scan quota was charged.";
          out.excluded.push({
            id,
            kind: "scope",
            reason: unsupportedIntervalMessage,
          });
          continue;
        }
        out.excluded.push({
          id,
          kind:
            error instanceof MarketGatewayError &&
            (error.code === "SEGMENT_NOT_ENTITLED" || error.code === "PUBLIC_LICENSE_REQUIRED")
              ? "denied"
              : "error",
          reason:
            error instanceof MarketGatewayError
              ? `${error.code}: ${error.actionHint}`.replace(/angel\s*one|smartapi/gi, "exchange feed")
              : "Exchange historical candles could not be loaded. Retry shortly.",
        });
      }
    }
    if (options.provider === "ANGELONE" ||
      (out.datasets.length > 0 && out.datasets.every((d) => d.source === source)))
      out.source = source;
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
      : configs.length === 0 && !ownerFeedAllowed && !sharedLicensedGatewayAllowed
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
        gatewayMode: gw.flags.mode,
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
/** Bounded, same service as chart/scan. Maximum eight exact configured instruments. */
export async function loadExtendedMarketData(subject: string, ids?: string[]) {
  if (
    ids &&
    (ids.length > 8 ||
      ids.some((id) => typeof id !== "string" || id.length > 80))
  )
    throw new HttpError(400, "Choose at most eight exact market instruments.");
  const [reference, grants] = await Promise.all([
    loadMarketData(),
    sharedHistoryGrants(Date.now(), "display"),
  ]);
  const sharedWanted = ids ?? [...new Set(grants.flatMap((g) => g.instruments.map((i) => i.id)))].slice(0, 8);
  const stored = sharedWanted.length && grants.length
    ? await readSharedDailyQuotes(sharedWanted, grants)
    : new Map();
  const marketQuotes: MarketQuote[] = [...stored.values()].map((quote) => ({
    id: quote.id,
    label: quote.instrument.name,
    assetClass: quote.instrument.type as "EQUITY" | "INDEX" | "FUTURE",
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
    frequency: quote.providerId === "INDIANAPI" ? "DAILY_CLOSE" : "DAILY_OHLC",
    reason: "Published daily close, not a live or executable quote.",
    derivation: null,
    change: quote.quality === "PUBLISHED_EOD" ? quote.pctChange : null,
    changeUnit: "%",
    canAnalyze: quote.quality === "PUBLISHED_EOD",
  }));
  const owner = isDataOwner(subject);
  const configs = (await providerConfigs()).filter(
    (c) =>
      !c.sharedHistory &&
      c.provider !== "BHARATSTOCK" &&
      c.provider !== "INDIANAPI" &&
      (owner || c.rights.redistribution) &&
      rightsActive(c, "display") &&
      c.datasets.includes("candles"),
  );
  const wanted = [
    ...new Set(configs.flatMap((c) => c.instruments.map((i) => i.id))),
  ]
    .filter((id) => !stored.has(id) && (!ids || ids.includes(id)))
    .slice(0, Math.max(0, 8 - marketQuotes.length));
  const observations = await Promise.all(
    wanted.map((id) => assetResearch(id, subject, "1d", false)),
  );
  for (const a of observations) {
    const instrument = a.instrument,
      last = a.candles.at(-1),
      prior = a.candles.at(-2);
    if (!instrument || !last) continue;
    marketQuotes.push({
      id: a.id,
      label: a.name,
      assetClass: instrument.type as "EQUITY" | "INDEX" | "FUTURE",
      value: last.close,
      unit: a.unit,
      currency: a.currency,
      provider: a.provider,
      sourceUrl: a.sourceUrl,
      rightsUrl: PROVIDERS[a.provider as ProviderId]?.rightsUrl ?? a.sourceUrl,
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
    });
  }
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
