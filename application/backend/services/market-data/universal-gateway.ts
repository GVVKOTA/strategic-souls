/**
 * Strategic Souls X 3.0 — Universal Provider-Neutral Market Data Gateway (Contract C).
 *
 * Consolidates shared market-data contracts behind one typed provider-neutral facade:
 *   - Canonical secret resolution: when MARKET_DATA_PROVIDER targets a provider and canonical
 *     MARKET_DATA_API_KEY is set, it takes precedence for one-key rotation; legacy provider-specific
 *     secrets (BHARATSTOCK_API_KEY, INDIA_API_KEY, X2_EODHD_API_TOKEN, X2_TRUEDATA_BEARER_TOKEN)
 *     remain supported fallbacks. Provider identity is never guessed from key format.
 *   - Strict entitlement boundaries: separates DISPLAY_AND_DERIVED, DERIVED_ONLY, PRIVATE_OWNER_FEED,
 *     OFFICIAL_REFERENCE, and NONE (fail-closed). Never exposes raw prices/candles to unauthorized viewers.
 *   - In-flight request coalescing & immutable cache keying by provider/version/instrument/interval/rights/cutoff.
 */
import { env } from "cloudflare:workers";
import type {
  Candle,
  Instrument,
  Interval,
  ProviderConfig,
  ProviderId,
  SharedRightsMode,
} from "./data-types";
import { registryInstrument } from "./instrument-registry";
import { loadOfficialReferences } from "./official-references";
import { PROVIDERS } from "./providers";
import {
  readSharedDailyQuotes,
  readSharedHistoryBatch,
  sharedHistoryGrants,
  sharedRightsMode,
  sharedUniverseReadiness,
} from "./shared-history";
import {
  ACTIVE_SCAN_INTERVALS,
  historyWindowForInterval,
  resolveNativeInterval,
} from "./timeframes";
import { providerConfigs } from "./data-service";

export type GatewayFreshness =
  | "REAL_TIME"
  | "DELAYED"
  | "PUBLISHED_EOD"
  | "REFERENCE"
  | "STALE"
  | "UNAVAILABLE";

export type GatewayQuote = {
  canonicalId: string;
  symbol: string;
  exchange: string;
  assetClass: string;
  currency: string;
  unit: string;
  contractLabel: string | null;
  value: number | null;
  percentChange: number | null;
  eventAt: string | null;
  receivedAt: string;
  freshness: GatewayFreshness;
  rightsMode: SharedRightsMode | "OFFICIAL_REFERENCE";
  providerLabel: string;
  attributionUrl: string;
};

export type ProviderCapabilityProfile = {
  provider: ProviderId;
  label: string;
  markets: readonly string[];
  nativeIntervals: readonly ("30m" | "1h" | "1d")[];
  supportedScanIntervals: readonly Interval[];
  supportsIntraday: boolean;
  legacySecretEnvVar: string;
  canonicalSecretEnvVar: "MARKET_DATA_API_KEY";
  canonicalProviderEnvVar: "MARKET_DATA_PROVIDER";
  docsUrl: string;
};

export const PROVIDER_CAPABILITY_PROFILES: Readonly<Record<ProviderId, ProviderCapabilityProfile>> = Object.freeze({
  BHARATSTOCK: {
    provider: "BHARATSTOCK",
    label: PROVIDERS.BHARATSTOCK.label,
    markets: PROVIDERS.BHARATSTOCK.markets,
    nativeIntervals: ["1d"],
    supportedScanIntervals: ["1d"],
    supportsIntraday: false,
    legacySecretEnvVar: PROVIDERS.BHARATSTOCK.secret,
    canonicalSecretEnvVar: "MARKET_DATA_API_KEY",
    canonicalProviderEnvVar: "MARKET_DATA_PROVIDER",
    docsUrl: PROVIDERS.BHARATSTOCK.docs,
  },
  INDIANAPI: {
    provider: "INDIANAPI",
    label: PROVIDERS.INDIANAPI.label,
    markets: PROVIDERS.INDIANAPI.markets,
    nativeIntervals: ["1d"],
    supportedScanIntervals: ["1d"],
    supportsIntraday: false,
    legacySecretEnvVar: PROVIDERS.INDIANAPI.secret,
    canonicalSecretEnvVar: "MARKET_DATA_API_KEY",
    canonicalProviderEnvVar: "MARKET_DATA_PROVIDER",
    docsUrl: PROVIDERS.INDIANAPI.docs,
  },
  EODHD: {
    provider: "EODHD",
    label: PROVIDERS.EODHD.label,
    markets: PROVIDERS.EODHD.markets,
    nativeIntervals: ["1h", "1d"],
    supportedScanIntervals: ["1h", "3h", "6h", "1d"],
    supportsIntraday: true,
    legacySecretEnvVar: PROVIDERS.EODHD.secret,
    canonicalSecretEnvVar: "MARKET_DATA_API_KEY",
    canonicalProviderEnvVar: "MARKET_DATA_PROVIDER",
    docsUrl: PROVIDERS.EODHD.docs,
  },
  TRUEDATA: {
    provider: "TRUEDATA",
    label: PROVIDERS.TRUEDATA.label,
    markets: PROVIDERS.TRUEDATA.markets,
    nativeIntervals: ["30m", "1h", "1d"],
    supportedScanIntervals: ["30m", "1h", "3h", "6h", "1d"],
    supportsIntraday: true,
    legacySecretEnvVar: PROVIDERS.TRUEDATA.secret,
    canonicalSecretEnvVar: "MARKET_DATA_API_KEY",
    canonicalProviderEnvVar: "MARKET_DATA_PROVIDER",
    docsUrl: PROVIDERS.TRUEDATA.docs,
  },
});

export type CanonicalActivationReadiness = {
  targetProvider: ProviderId | null;
  canonicalSecretSet: boolean;
  providerConfigPresent: boolean;
  rightsActive: boolean;
  missingInputs: string[];
  ready: boolean;
};

export type GatewayCapabilities = {
  configuredProviders: {
    provider: ProviderId;
    enabled: boolean;
    secretConfigured: boolean;
    secretSource: "PROVIDER_SECRET" | "MARKET_DATA_API_KEY" | "MISSING";
    rightsMode: SharedRightsMode;
    intervals: Interval[];
    expiresAt: string | null;
  }[];
  activeScanIntervals: readonly Interval[];
  officialReferenceActive: boolean;
  canonicalSecretSet: boolean;
  canonicalProviderTarget: ProviderId | null;
  activationReadiness: CanonicalActivationReadiness;
};

export type GatewayHealth = {
  status: "READY" | "PARTIAL" | "UNCONFIGURED" | "DEGRADED";
  checkedAtUtc: string;
  officialReferencesOk: boolean;
  sharedUniverseStatus: string;
  activeProviderCount: number;
  detail: string;
};

const runtimeEnv = () => {
  try {
    return (env as unknown as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
};

/** Bounded in-flight coalescing map to avoid duplicate upstream/D1 fetches under burst concurrency. */
const inflightRequests = new Map<string, Promise<unknown>>();

function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, p);
  return p;
}

function parseCanonicalTargetProvider(environment: Record<string, unknown>): ProviderId | null {
  const raw = typeof environment.MARKET_DATA_PROVIDER === "string"
    ? environment.MARKET_DATA_PROVIDER.trim().toUpperCase()
    : "";
  return raw === "BHARATSTOCK" || raw === "INDIANAPI" || raw === "EODHD" || raw === "TRUEDATA"
    ? raw
    : null;
}

/**
 * Resolves the canonical secret source without ever returning or logging the secret value.
 * Canonical MARKET_DATA_API_KEY takes precedence when MARKET_DATA_PROVIDER targets `provider`.
 */
export function inspectProviderSecretStatus(
  provider: ProviderId,
  environment: Record<string, unknown> = runtimeEnv(),
): { configured: boolean; source: "PROVIDER_SECRET" | "MARKET_DATA_API_KEY" | "MISSING"; envVar: string } {
  const targetProvider = parseCanonicalTargetProvider(environment);
  const canonicalVal = environment.MARKET_DATA_API_KEY;
  if (
    targetProvider === provider &&
    typeof canonicalVal === "string" &&
    canonicalVal !== "demo" &&
    /^\S{8,2048}$/.test(canonicalVal)
  ) {
    return { configured: true, source: "MARKET_DATA_API_KEY", envVar: "MARKET_DATA_API_KEY" };
  }
  const specificKey = PROVIDERS[provider].secret;
  const specificVal = environment[specificKey];
  if (typeof specificVal === "string" && specificVal !== "demo" && /^\S{8,2048}$/.test(specificVal)) {
    return { configured: true, source: "PROVIDER_SECRET", envVar: specificKey };
  }
  return { configured: false, source: "MISSING", envVar: targetProvider === provider ? "MARKET_DATA_API_KEY" : specificKey };
}

export function inspectCanonicalActivationReadiness(
  configs: readonly ProviderConfig[],
  now = Date.now(),
  environment: Record<string, unknown> = runtimeEnv(),
): CanonicalActivationReadiness {
  const targetProvider = parseCanonicalTargetProvider(environment);
  const canonicalRaw = environment.MARKET_DATA_API_KEY;
  const canonicalSecretSet =
    typeof canonicalRaw === "string" && canonicalRaw !== "demo" && /^\S{8,2048}$/.test(canonicalRaw);
  const matchingConfig = targetProvider ? configs.find((c) => c.provider === targetProvider) ?? null : null;
  const rightsOk = matchingConfig ? sharedRightsMode(matchingConfig, now) !== "NONE" : false;
  const missingInputs: string[] = [];
  if (!targetProvider) {
    missingInputs.push("Set Worker variable MARKET_DATA_PROVIDER to BHARATSTOCK, TRUEDATA, EODHD, or INDIANAPI.");
  }
  if (!canonicalSecretSet) {
    missingInputs.push("Set Worker secret MARKET_DATA_API_KEY (or the provider-specific secret).");
  }
  if (targetProvider && !matchingConfig) {
    missingInputs.push(`Save verified license metadata and instrument mappings for ${targetProvider} in Data Connections.`);
  } else if (targetProvider && matchingConfig && !rightsOk) {
    missingInputs.push(`Verify active, unexpired commercial analysis/storage/derived-display rights for ${targetProvider}.`);
  }
  return {
    targetProvider,
    canonicalSecretSet,
    providerConfigPresent: !!matchingConfig,
    rightsActive: rightsOk,
    missingInputs,
    ready: Boolean(targetProvider && canonicalSecretSet && matchingConfig && rightsOk),
  };
}

export async function getGatewayCapabilities(
  now = Date.now(),
  environment: Record<string, unknown> = runtimeEnv(),
): Promise<GatewayCapabilities> {
  const configs: ProviderConfig[] = await providerConfigs();
  const activationReadiness = inspectCanonicalActivationReadiness(configs, now, environment);
  const canonicalSecretSet = activationReadiness.canonicalSecretSet;

  const configuredProviders = configs.map((cfg) => {
    const sec = inspectProviderSecretStatus(cfg.provider, environment);
    const mode = sharedRightsMode(cfg, now);
    const intervals = new Set<Interval>();
    if (cfg.sharedHistory?.intervals.includes("1d")) {
      intervals.add("1d");
      intervals.add("1wk");
      intervals.add("1mo");
    }
    if (cfg.sharedHistory?.intervals.includes("30m")) intervals.add("30m");
    if (cfg.sharedHistory?.intervals.includes("1h")) {
      intervals.add("1h");
      intervals.add("3h");
      intervals.add("6h");
    }
    return {
      provider: cfg.provider,
      enabled: cfg.enabled,
      secretConfigured: sec.configured,
      secretSource: sec.source,
      rightsMode: mode,
      intervals: [...intervals],
      expiresAt: cfg.rights.expiresAt ?? null,
    };
  });

  return {
    configuredProviders,
    activeScanIntervals: ACTIVE_SCAN_INTERVALS,
    officialReferenceActive: true,
    canonicalSecretSet,
    canonicalProviderTarget: activationReadiness.targetProvider,
    activationReadiness,
  };
}

export async function getGatewayQuotes(
  ids: readonly string[],
  options: { now?: number; requireDisplay?: boolean } = {},
): Promise<GatewayQuote[]> {
  const now = options.now ?? Date.now();
  const normalizedIds = [...new Set(ids.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (!normalizedIds.length) return [];

  const cacheKey = `quotes:${options.requireDisplay !== false ? "disp" : "der"}:${normalizedIds.join(",")}:${Math.floor(now / 15_000)}`;
  return coalesce(cacheKey, async () => {
    const [official, grants] = await Promise.all([
      loadOfficialReferences().catch(() => null),
      sharedHistoryGrants(now, options.requireDisplay === false ? "research" : "display"),
    ]);
    const officialMap = new Map(
      [...(official?.quotes ?? []), ...(official?.yields ?? [])].map((p) => [p.id.toUpperCase(), p]),
    );
    const nonOfficial = normalizedIds.filter((id) => !officialMap.has(id));
    const shared =
      nonOfficial.length && grants.length
        ? await readSharedDailyQuotes(nonOfficial, grants, now)
        : new Map();

    const out: GatewayQuote[] = [];
    for (const id of normalizedIds) {
      const off = officialMap.get(id);
      if (off) {
        out.push({
          canonicalId: off.id,
          symbol: off.label,
          exchange: id.startsWith("ECB:") ? "ECB" : "UST",
          assetClass: off.assetClass,
          currency: off.currency,
          unit: off.unit,
          contractLabel: null,
          value: off.value,
          percentChange: off.change,
          eventAt: off.sourceDate,
          receivedAt: off.retrievedAt ?? new Date(now).toISOString(),
          freshness: off.value === null ? "UNAVAILABLE" : off.state === "STALE" ? "STALE" : "REFERENCE",
          rightsMode: "OFFICIAL_REFERENCE",
          providerLabel: off.provider,
          attributionUrl: off.sourceUrl,
        });
        continue;
      }
      const sh = shared.get(id);
      if (sh) {
        out.push({
          canonicalId: sh.id,
          symbol: sh.instrument.symbol,
          exchange: sh.instrument.market,
          assetClass: sh.instrument.type,
          currency: sh.instrument.currency,
          unit: sh.instrument.unit,
          contractLabel: sh.instrument.expiry ?? null,
          value: sh.value,
          percentChange: sh.quality === "STALE" ? null : sh.pctChange,
          eventAt: sh.latestDate,
          receivedAt: new Date(now).toISOString(),
          freshness: sh.quality === "STALE" ? "STALE" : "PUBLISHED_EOD",
          rightsMode: "DISPLAY_AND_DERIVED",
          providerLabel: sh.attribution.label,
          attributionUrl: sh.attribution.url,
        });
        continue;
      }
      const reg = registryInstrument(id);
      out.push({
        canonicalId: id,
        symbol: reg?.label ?? id.split(":")[1] ?? id,
        exchange: reg?.market ?? id.split(":")[0] ?? "UNKNOWN",
        assetClass: reg?.assetClass ?? "UNKNOWN",
        currency: reg?.currency ?? "",
        unit: reg?.currency ?? "",
        contractLabel: null,
        value: null,
        percentChange: null,
        eventAt: null,
        receivedAt: new Date(now).toISOString(),
        freshness: "UNAVAILABLE",
        rightsMode: "NONE",
        providerLabel: "Unavailable",
        attributionUrl: reg?.sourceUrl ?? "",
      });
    }
    return out;
  });
}

export async function getGatewayHistoricalCandles(
  ids: readonly string[],
  interval: Interval,
  options: { cutoffMs?: number; purpose?: "display" | "research" } = {},
): Promise<
  Map<
    string,
    {
      instrument: Instrument;
      candles: Candle[];
      freshness: GatewayFreshness;
      rightsMode: SharedRightsMode;
      windowStartIso: string;
      windowEndIso: string;
      nativeInterval: string;
    }
  >
> {
  const cutoffMs = options.cutoffMs ?? Date.now();
  const purpose = options.purpose ?? "display";
  const native = resolveNativeInterval(interval);
  const bounds = historyWindowForInterval(interval, cutoffMs);
  const normalizedIds = [...new Set(ids.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  const key = `hist:${purpose}:${interval}:${Math.floor(cutoffMs / 15_000)}:${normalizedIds.join(",")}`;

  return coalesce(key, async () => {
    const grants = await sharedHistoryGrants(cutoffMs, purpose);
    const batch = await readSharedHistoryBatch(normalizedIds, interval, grants, {
      cutoff: cutoffMs,
      now: cutoffMs,
      requireDisplay: purpose === "display",
    });
    const out = new Map<
      string,
      {
        instrument: Instrument;
        candles: Candle[];
        freshness: GatewayFreshness;
        rightsMode: SharedRightsMode;
        windowStartIso: string;
        windowEndIso: string;
        nativeInterval: string;
      }
    >();
    for (const [id, entry] of batch.entries()) {
      const mode = sharedRightsMode(entry.config, cutoffMs);
      if (purpose === "display" && mode !== "DISPLAY_AND_DERIVED") continue;
      out.set(id, {
        instrument: entry.instrument,
        candles: entry.candles,
        freshness: entry.state,
        rightsMode: mode,
        windowStartIso: bounds.startIso,
        windowEndIso: bounds.cutoffIso,
        nativeInterval: native,
      });
    }
    return out;
  });
}

export async function getGatewayHealth(now = Date.now()): Promise<GatewayHealth> {
  const [official, readiness] = await Promise.all([
    loadOfficialReferences().then(() => true).catch(() => false),
    sharedUniverseReadiness(now).catch(() => null),
  ]);
  const activeProviders = readiness?.providers.filter((p) => p.active).length ?? 0;
  const status: GatewayHealth["status"] =
    readiness?.status === "READY" && official
      ? "READY"
      : official
        ? activeProviders > 0
          ? "PARTIAL"
          : "UNCONFIGURED"
        : "DEGRADED";
  return {
    status,
    checkedAtUtc: new Date(now).toISOString(),
    officialReferencesOk: official,
    sharedUniverseStatus: readiness?.status ?? "UNAVAILABLE",
    activeProviderCount: activeProviders,
    detail:
      readiness?.reason ??
      (official
        ? "Official ECB/Treasury reference feeds active; commercial exchange feed awaits owner configuration."
        : "Market-data reference sources are temporarily degraded."),
  };
}
