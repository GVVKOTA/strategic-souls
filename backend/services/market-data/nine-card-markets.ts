/**
 * Strategic Souls V3 — Eight-Tile Global Market Overview & D1 Layout Persistence.
 * Enforces the strict 8-instrument Global allowlist:
 *   NIFTY 50, SENSEX, BANK NIFTY, NIFTY MIDCAP, GOLD, SILVER MCX, CL, USD/INR.
 * Reconciles legacy 9-card stored layouts without destroying user watchlists/holdings/history.
 */
import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { registryInstrument } from "./instrument-registry";
import { marketSnapshot, type MarketSnapshot } from "./market-data";
import { isDataOwner } from "./data-service";
import {
  getIndianExchangeSession,
  getNymexGlobexSession,
} from "./angelone/calendar";
import {
  gatewayCandles,
  gatewayQuotes,
  gatewaySearchInstruments,
  resolveGatewayConfig,
} from "./angelone/gateway";
import { VERIFIED_SEED_INSTRUMENTS } from "./angelone/instrument-master";
import type {
  DataQualityState,
  ExchangeSessionState,
  NormalizedMarketQuote,
} from "./angelone/types";
import {
  ALLOWED_GLOBAL_MARKET_IDS,
  DEFAULT_EIGHT_CARD_IDS,
  DEFAULT_NINE_CARD_IDS,
  reconcileGlobalMarketIds,
  type MarketLayoutRecord,
  type MarketOverviewCard,
  type MarketSessionState,
  type QuoteQuality,
} from "./nine-card-types";

export {
  ALLOWED_GLOBAL_MARKET_IDS,
  DEFAULT_EIGHT_CARD_IDS,
  DEFAULT_NINE_CARD_IDS,
  reconcileGlobalMarketIds,
  type MarketLayoutRecord,
  type MarketOverviewCard,
  type MarketSessionState,
  type QuoteQuality,
};

export const MARKET_LAYOUT_RECORD_KIND = "market-layout";

const BROKER_QUOTE_QUALITY: Record<DataQualityState, QuoteQuality | null> = {
  VERIFIED_REAL_LIVE: "REAL_TIME",
  VERIFIED_REAL_DELAYED: "DELAYED",
  VERIFIED_LAST_AVAILABLE: "LAST_AVAILABLE",
  MARKET_CLOSED_LAST: "LAST_AVAILABLE",
  REAL_BUT_STALE: "STALE",
  NO_DATA: null,
  DEMO: null,
};

const BROKER_SESSIONS: Record<
  ExchangeSessionState,
  { state: MarketSessionState; label: string }
> = {
  OPEN: { state: "OPEN", label: "Open" },
  CLOSED: { state: "CLOSED", label: "Closed" },
  HOLIDAY: { state: "CLOSED", label: "Holiday" },
  PRE_OPEN: { state: "PREMARKET", label: "Pre-open" },
  SCHEDULE_UNKNOWN: { state: "UNKNOWN", label: "Market hours" },
};

function resolveSession(
  canonicalId: string,
  market: string,
  asOfIso: string,
): { state: MarketSessionState; label: string; timezone: string } {
  const nowMs = Date.parse(asOfIso);
  const ts = Number.isFinite(nowMs) ? nowMs : Date.now();
  const upperMarket = market.toUpperCase();
  const upperId = canonicalId.toUpperCase();

  if (upperMarket === "NSE" || upperMarket === "BSE" || upperMarket === "MCX") {
    const info = getIndianExchangeSession(upperMarket, ts);
    const mapped = BROKER_SESSIONS[info.state];
    return {
      state: mapped.state,
      label: info.holidayName ? "Holiday" : mapped.label,
      timezone: "Asia/Kolkata",
    };
  }
  if (upperId === "GLOBAL:CL" || upperMarket === "NYMEX") {
    const info = getNymexGlobexSession(ts);
    const mapped = BROKER_SESSIONS[info.state];
    return {
      state: mapped.state,
      label: info.label,
      timezone: info.timezone,
    };
  }
  if (upperMarket === "ECB" || upperId.startsWith("ECB:")) {
    return {
      state: "UNKNOWN",
      label: "Daily reference",
      timezone: "Europe/Frankfurt",
    };
  }
  return { state: "UNKNOWN", label: "Market hours", timezone: "UTC" };
}

function sparklineReturn(points: readonly number[] | null): number | null {
  if (!points || points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
  return Math.round(((last - first) / first) * 10000) / 100;
}

function formatContractMonth(expiryIso: string | null | undefined): string | null {
  if (!expiryIso || !/^\d{4}-\d{2}-\d{2}$/.test(expiryIso)) return null;
  const ms = Date.parse(`${expiryIso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

function layoutRecordId(subject: string): string {
  return "market-layout:" + subject;
}

export function validateNineCardIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length !== DEFAULT_EIGHT_CARD_IDS.length) {
    throw new HttpError(
      400,
      `Market grid must contain all ${DEFAULT_EIGHT_CARD_IDS.length} unique Global dashboard instruments.`,
    );
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new HttpError(400, "Each market slot must be a canonical instrument ID.");
    }
    const entry = registryInstrument(item);
    if (!entry || !ALLOWED_GLOBAL_MARKET_IDS.has(entry.id)) {
      throw new HttpError(
        400,
        `Instrument "${item}" is not part of the Global dashboard allowlist.`,
      );
    }
    if (seen.has(entry.id)) {
      throw new HttpError(
        400,
        `Duplicate instrument "${entry.id}". All ${DEFAULT_EIGHT_CARD_IDS.length} tiles must be unique.`,
      );
    }
    seen.add(entry.id);
    normalized.push(entry.id);
  }
  return normalized;
}

export const validateMarketGridIds = validateNineCardIds;

export async function getUserMarketLayout(
  subject: string | null,
): Promise<MarketLayoutRecord> {
  if (!subject) {
    return {
      ids: [...DEFAULT_EIGHT_CARD_IDS],
      version: 0,
      updatedAt: null,
      isDefault: true,
    };
  }
  try {
    const row = await database()
      .prepare(
        "SELECT payload, version, updated_at FROM x1_records WHERE id=? AND subject=? AND kind=? AND archived=0",
      )
      .bind(layoutRecordId(subject), subject, MARKET_LAYOUT_RECORD_KIND)
      .first<{ payload: string; version: number; updated_at: string }>();
    if (!row) {
      return {
        ids: [...DEFAULT_EIGHT_CARD_IDS],
        version: 0,
        updatedAt: null,
        isDefault: true,
      };
    }
    const parsed = JSON.parse(row.payload) as { ids?: unknown };
    // Automatically reconcile legacy 9-card or superseded layouts onto the strict 8-tile allowlist.
    const ids = reconcileGlobalMarketIds(parsed.ids);
    return {
      ids,
      version: row.version,
      updatedAt: row.updated_at,
      isDefault: ids.every((id, i) => id === DEFAULT_EIGHT_CARD_IDS[i]),
    };
  } catch {
    return {
      ids: [...DEFAULT_EIGHT_CARD_IDS],
      version: 0,
      updatedAt: null,
      isDefault: true,
    };
  }
}

export async function saveUserMarketLayout(
  subject: string,
  expectedVersion: number,
  rawIds: unknown,
): Promise<MarketLayoutRecord> {
  await rate(subject + ":x51-market-layout", 60, 60_000);
  const ids = validateNineCardIds(rawIds);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new HttpError(400, "A valid expected layout version is required.");
  }

  const db = database();
  const id = layoutRecordId(subject);
  const now = new Date().toISOString();
  const payload = JSON.stringify({ ids, updatedAt: now });

  const existing = await db
    .prepare(
      "SELECT version FROM x1_records WHERE id=? AND subject=? AND kind=? AND archived=0",
    )
    .bind(id, subject, MARKET_LAYOUT_RECORD_KIND)
    .first<{ version: number }>();

  if (!existing) {
    if (expectedVersion !== 0) {
      throw new HttpError(
        409,
        "Market layout changed in another session. Refresh before saving.",
      );
    }
    await db
      .prepare(
        `INSERT OR IGNORE INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
         VALUES (?, ?, ?, 'Global Market Grid', ?, 1, 0, ?, ?, ?)`,
      )
      .bind(
        id,
        subject,
        MARKET_LAYOUT_RECORD_KIND,
        payload,
        crypto.randomUUID(),
        now,
        now,
      )
      .run();
    const inserted = await db
      .prepare("SELECT version, payload, updated_at FROM x1_records WHERE id=? AND subject=?")
      .bind(id, subject)
      .first<{ version: number; payload: string; updated_at: string }>();
    if (!inserted || inserted.version !== 1) {
      throw new HttpError(
        409,
        "Market layout was created concurrently in another tab. Refresh and retry.",
      );
    }
    return {
      ids,
      version: inserted.version,
      updatedAt: inserted.updated_at,
      isDefault: ids.every((x, i) => x === DEFAULT_EIGHT_CARD_IDS[i]),
    };
  }

  if (existing.version !== expectedVersion) {
    throw new HttpError(
      409,
      "Market layout was updated in another tab/device. Refresh to avoid overwriting changes.",
    );
  }

  const upd = await db
    .prepare(
      "UPDATE x1_records SET payload=?, version=version+1, last_write=?, updated_at=? WHERE id=? AND subject=? AND version=? AND archived=0",
    )
    .bind(payload, crypto.randomUUID(), now, id, subject, expectedVersion)
    .run();

  if (!upd.meta.changes) {
    throw new HttpError(
      409,
      "Concurrent layout edit detected. Reload and retry.",
    );
  }

  return {
    ids,
    version: expectedVersion + 1,
    updatedAt: now,
    isDefault: ids.every((x, i) => x === DEFAULT_EIGHT_CARD_IDS[i]),
  };
}

export function buildMarketOverviewCards(
  ids: readonly string[],
  snapshot: MarketSnapshot,
  privateQuotes: readonly NormalizedMarketQuote[] = [],
  mcxAliasMap: ReadonlyMap<string, string> = new Map(),
  privateSparklines: ReadonlyMap<string, number[]> = new Map(),
): MarketOverviewCard[] {
  const reconciled = reconcileGlobalMarketIds(ids);
  const allPoints = [...snapshot.quotes, ...snapshot.yields];
  const pointMap = new Map(allPoints.map((p) => [p.id.toUpperCase(), p]));
  const histMap = new Map(snapshot.fxHistory.map((h) => [h.id.toUpperCase(), h]));
  const privateQuoteMap = new Map(privateQuotes.map((quote) => [quote.id, quote]));

  return reconciled.map((canonicalId) => {
    const entry = registryInstrument(canonicalId);
    const resolvedQuoteId = mcxAliasMap.get(canonicalId) ?? canonicalId;
    const privateQuote =
      privateQuoteMap.get(canonicalId) ?? privateQuoteMap.get(resolvedQuoteId);
    if (privateQuote?.sourceMode === "PRIVATE_OWNER_FEED" && privateQuote.ltp !== null) {
      const quality = BROKER_QUOTE_QUALITY[privateQuote.quality];
      if (quality) {
        const session = BROKER_SESSIONS[privateQuote.marketState];
        const rawSpark =
          privateSparklines.get(canonicalId) ??
          privateSparklines.get(resolvedQuoteId) ??
          null;
        const spark = rawSpark && rawSpark.length >= 2 ? rawSpark.slice(-30) : null;
        return {
          canonicalId,
          shortLabel: entry?.label ?? privateQuote.symbol,
          name: entry?.name ?? privateQuote.name,
          venue: privateQuote.exchange,
          assetClass: entry?.assetClass ?? privateQuote.segment,
          currency: privateQuote.currency,
          quoteUnit: privateQuote.unit,
          value: privateQuote.ltp,
          absoluteChange: privateQuote.change,
          percentChange: privateQuote.changePct,
          previousClose: privateQuote.prevClose,
          changeUnit: "%",
          sparkline: spark,
          sparklinePeriodLabel: spark ? `${spark.length}D` : null,
          sparklineReturnPct: sparklineReturn(spark),
          contractLabel: formatContractMonth(privateQuote.expiry),
          marketTimezone: "Asia/Kolkata",
          isLive: privateQuote.isLive && quality === "REAL_TIME" && session.state === "OPEN",
          provider: "Exchange data",
          sourceUrl: entry?.sourceUrl ?? "",
          sourceObservedAtUTC: privateQuote.exchangeTimestampUTC,
          sourceObservedPrecision: privateQuote.exchangeTimestampUTC ? "TIMESTAMP" : "UNAVAILABLE",
          ingestedAtUTC: privateQuote.retrievalTimestampUTC,
          quality,
          marketSession: session.state,
          sessionLabel: session.label,
          reasonCode: privateQuote.freshnessReason.replace(/broker|angel\s*one|smartapi/gi, "exchange"),
          redistributable: false,
        };
      }
    }
    const point = pointMap.get(canonicalId.toUpperCase());
    const hist = histMap.get(canonicalId.toUpperCase());
    const market = entry?.market ?? canonicalId.split(":")[0] ?? "GLOBAL";
    const session = resolveSession(canonicalId, market, snapshot.asOf);

    if (point && point.value !== null) {
      const pts = hist?.points.map((p) => p.close) ?? null;
      const spark = pts && pts.length >= 10 ? pts.slice(-30) : null;
      const prevClose =
        pts && pts.length >= 2
          ? pts[pts.length - 2]
          : point.change !== null && point.changeUnit === "%"
            ? point.value / (1 + point.change / 100)
            : null;
      const absChange =
        prevClose !== null && Number.isFinite(prevClose)
          ? point.value - prevClose
          : null;

      const quality: QuoteQuality =
        point.state === "STALE"
          ? "STALE"
          : point.frequency === "DAILY_REFERENCE" || point.frequency === "DAILY_YIELD"
            ? "REFERENCE"
            : "PUBLISHED_EOD";

      return {
        canonicalId: entry?.id ?? point.id,
        shortLabel: entry?.label ?? point.label,
        name: entry?.name ?? point.label,
        venue: market,
        assetClass: entry?.assetClass ?? point.assetClass,
        currency: point.currency,
        quoteUnit: point.unit,
        value: point.value,
        absoluteChange:
          absChange !== null ? Math.round(absChange * 10000) / 10000 : null,
        percentChange:
          point.change !== null ? Math.round(point.change * 100) / 100 : null,
        previousClose:
          prevClose !== null ? Math.round(prevClose * 10000) / 10000 : null,
        changeUnit: point.changeUnit,
        sparkline: spark,
        sparklinePeriodLabel: spark ? `${spark.length}D` : null,
        sparklineReturnPct: sparklineReturn(spark),
        contractLabel: null,
        marketTimezone: session.timezone,
        isLive: false,
        provider: point.provider,
        sourceUrl: point.sourceUrl,
        sourceObservedAtUTC: point.sourceDate ? point.sourceDate : null,
        sourceObservedPrecision: !point.sourceDate
          ? "UNAVAILABLE"
          : point.sourceDate.includes("T")
            ? "TIMESTAMP"
            : "DATE_ONLY",
        ingestedAtUTC: point.retrievedAt ?? snapshot.asOf,
        quality,
        marketSession: session.state,
        sessionLabel: session.label,
        reasonCode: point.reason,
        redistributable: true,
      };
    }

    const resolvedUnit = (() => {
      const upper = (entry?.id ?? canonicalId).toUpperCase();
      if (entry?.assetClass === "INDEX") return "pts";
      if (upper === "GLOBAL:CL") return "USD/bbl";
      if (upper === "MCX:GOLD") return "INR / 10g";
      if (upper === "MCX:SILVER") return "INR / kg";
      return entry?.currency ?? "pts";
    })();
    return {
      canonicalId: entry?.id ?? canonicalId,
      shortLabel: entry?.label ?? canonicalId.split(":")[1] ?? canonicalId,
      name: entry?.name ?? canonicalId,
      venue: market,
      assetClass: entry?.assetClass ?? "INDEX",
      currency: entry?.currency ?? "USD",
      quoteUnit: resolvedUnit,
      value: null,
      absoluteChange: null,
      percentChange: null,
      previousClose: null,
      changeUnit: "%",
      sparkline: null,
      sparklinePeriodLabel: null,
      sparklineReturnPct: null,
      contractLabel: null,
      marketTimezone: session.timezone,
      isLive: false,
      provider: "Market data",
      sourceUrl: entry?.sourceUrl ?? "",
      sourceObservedAtUTC: null,
      sourceObservedPrecision: "UNAVAILABLE",
      ingestedAtUTC: snapshot.asOf,
      quality: "UNAVAILABLE",
      marketSession: session.state,
      sessionLabel: session.label,
      reasonCode: "Quote feed is currently unavailable for this instrument.",
      redistributable: false,
    };
  });
}

export async function getMarketOverviewPayload(
  subject: string | null,
  overrideSnapshot?: MarketSnapshot,
) {
  const layoutPromise = getUserMarketLayout(subject);
  const ownerQuotesPromise = layoutPromise.then(async ({ ids }) => {
    const gw = resolveGatewayConfig();
    const ownerAllowed = !!subject && isDataOwner(subject) && gw.flags.enablePrivateBrokerData;
    const publicAllowed = gw.flags.mode === "public_licensed" && gw.flags.enablePublicExchangeQuotes;
    const empty = {
      quotes: [] as NormalizedMarketQuote[],
      mcxAliasMap: new Map<string, string>(),
      sparklines: new Map<string, number[]>(),
    };
    if (!ownerAllowed && !publicAllowed) {
      return empty;
    }
    const nowMs = Date.now();
    const mcxAliasMap = new Map<string, string>();
    const fetchIds: string[] = [];
    for (const id of ids) {
      if (id === "MCX:GOLD" || id === "MCX:SILVER") {
        const root = id.slice(4);
        let mappedId: string | null = null;
        try {
          const found = await gatewaySearchInstruments({
            isOwner: !!subject && isDataOwner(subject),
            q: root,
            exchange: "MCX",
            segment: "FUTURE",
            limit: 12,
          });
          // Strictly match exact root symbol ("GOLD" / "SILVER"), NEVER mini/guinea/petal/micro variants or expired contracts
          const nearest = found.instruments
            .filter(
              (i) =>
                i.exchange === "MCX" &&
                i.segment === "FUTURE" &&
                i.symbol.toUpperCase() === root &&
                !!i.expiry &&
                Date.parse(`${i.expiry}T23:59:59+05:30`) >= nowMs,
            )
            .sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""))[0];
          if (nearest) mappedId = nearest.id;
        } catch {
          // Fall through to verified unexpired seed check below.
        }
        if (!mappedId) {
          const seedFallback = VERIFIED_SEED_INSTRUMENTS.filter(
            (i) =>
              i.exchange === "MCX" &&
              i.segment === "FUTURE" &&
              i.symbol.toUpperCase() === root &&
              !!i.expiry &&
              Date.parse(`${i.expiry}T23:59:59+05:30`) >= nowMs,
          ).sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""))[0];
          if (seedFallback) mappedId = seedFallback.id;
        }
        if (mappedId) {
          mcxAliasMap.set(id, mappedId);
          fetchIds.push(mappedId);
        }
      } else if (/^(NSE|BSE|MCX):/.test(id)) {
        fetchIds.push(id);
      }
    }
    if (fetchIds.length === 0) {
      return { quotes: [] as NormalizedMarketQuote[], mcxAliasMap, sparklines: new Map<string, number[]>() };
    }
    const uniqueFetchIds = [...new Set(fetchIds)];
    try {
      const res = await gatewayQuotes({
        authenticated: !!subject,
        isOwner: !!subject && isDataOwner(subject),
        ids: uniqueFetchIds,
      });
      // Fetch real bounded daily closes (last ~45 calendar days -> ~30 trading days) for sparklines without blocking quotes on failure
      const sparklines = new Map<string, number[]>();
      if (res.quotes.length > 0) {
        const candleResults = await Promise.allSettled(
          uniqueFetchIds.map(async (targetId) => {
            const series = await gatewayCandles({
              authenticated: !!subject,
              isOwner: !!subject && isDataOwner(subject),
              id: targetId,
              interval: "1d",
              days: 45,
            });
            const closes = series.candles
              .map((c) => c.close)
              .filter((v): v is number => Number.isFinite(v) && v > 0);
            return { targetId, closes };
          }),
        );
        for (const item of candleResults) {
          if (item.status === "fulfilled" && item.value.closes.length >= 2) {
            sparklines.set(item.value.targetId, item.value.closes.slice(-30));
          }
        }
      }
      return { quotes: res.quotes, mcxAliasMap, sparklines };
    } catch {
      return { quotes: [] as NormalizedMarketQuote[], mcxAliasMap, sparklines: new Map<string, number[]>() };
    }
  });
  const [layout, snapshot, ownerData] = await Promise.all([
    layoutPromise,
    overrideSnapshot ? Promise.resolve(overrideSnapshot) : marketSnapshot(),
    ownerQuotesPromise,
  ]);
  const allowedCatalog = DEFAULT_EIGHT_CARD_IDS.map((id) => registryInstrument(id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .map((i) => ({
      id: i.id,
      label: i.label,
      name: i.name,
      market: i.market,
      assetClass: i.assetClass,
      currency: i.currency ?? "",
      mappingStatus: i.mappingStatus,
    }));
  return {
    asOf: snapshot.asOf,
    layout,
    cards: buildMarketOverviewCards(
      layout.ids,
      snapshot,
      ownerData.quotes,
      ownerData.mcxAliasMap,
      ownerData.sparklines,
    ),
    catalog: allowedCatalog,
    disclosure:
      "Market session status and quote availability are shown independently. Unavailable instruments render em-dashes honestly — never simulated prices or sparklines.",
  };
}
