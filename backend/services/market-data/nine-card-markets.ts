/**
 * Strategic Souls X5.1 — Nine-Card 3x3 Market Overview & D1 Layout Persistence.
 * Separates quote-data quality (REAL_TIME | DELAYED | PUBLISHED_EOD | REFERENCE | STALE | NOT_CONNECTED | RESTRICTED | UNAVAILABLE)
 * from exchange market session (OPEN | CLOSED | PREMARKET | POSTMARKET | UNKNOWN).
 */
import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { EXCHANGES, exchangeSession } from "./exchanges";
import { X2_INSTRUMENTS, registryInstrument } from "./instrument-registry";
import { marketSnapshot, type MarketSnapshot } from "./market-data";
import {
  DEFAULT_NINE_CARD_IDS,
  type MarketLayoutRecord,
  type MarketOverviewCard,
  type MarketSessionState,
  type QuoteQuality,
} from "./nine-card-types";

export {
  DEFAULT_NINE_CARD_IDS,
  type MarketLayoutRecord,
  type MarketOverviewCard,
  type MarketSessionState,
  type QuoteQuality,
};

export const MARKET_LAYOUT_RECORD_KIND = "market-layout";

const VENUE_EXCHANGE_MAP: Record<string, string> = {
  NSE: "XNSE",
  BSE: "XBOM",
  MCX: "XNSE",
  "GLOBAL:SPX": "XNYS",
  "GLOBAL:NDX": "XNAS",
  "GLOBAL:IXIC": "XNAS",
  "GLOBAL:DJI": "XNYS",
  "GLOBAL:FTSE": "XLON",
  "GLOBAL:DAX": "XETR",
  "GLOBAL:N225": "XTKS",
  "GLOBAL:HSI": "XHKG",
  "GLOBAL:SSE": "XSHG",
  UST: "XNYS",
  ECB: "XETR",
};

function resolveSession(
  canonicalId: string,
  market: string,
  asOfIso: string,
): { state: MarketSessionState; label: string } {
  const exId = VENUE_EXCHANGE_MAP[canonicalId] ?? VENUE_EXCHANGE_MAP[market];
  if (!exId) {
    return { state: "UNKNOWN", label: "24h / OTC" };
  }
  const ex = EXCHANGES.find((e) => e.id === exId);
  if (!ex) return { state: "UNKNOWN", label: "Schedule unknown" };
  const s = exchangeSession(ex, asOfIso);
  if (s.state === "OPEN") return { state: "OPEN", label: "Session open" };
  if (s.state === "CLOSED") return { state: "CLOSED", label: "Market closed" };
  return { state: "UNKNOWN", label: s.label };
}

function layoutRecordId(subject: string): string {
  return "market-layout:" + subject;
}

export function validateNineCardIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length !== 9) {
    throw new HttpError(
      400,
      "Market grid must contain exactly 9 unique canonical instruments.",
    );
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new HttpError(400, "Each market slot must be a canonical instrument ID.");
    }
    const entry = registryInstrument(item);
    if (!entry) {
      throw new HttpError(
        400,
        `Unsupported instrument "${item}". Choose from the authorized canonical catalog.`,
      );
    }
    if (seen.has(entry.id)) {
      throw new HttpError(
        400,
        `Duplicate instrument "${entry.id}". All 9 slots must be unique.`,
      );
    }
    seen.add(entry.id);
    normalized.push(entry.id);
  }
  return normalized;
}

export async function getUserMarketLayout(
  subject: string | null,
): Promise<MarketLayoutRecord> {
  if (!subject) {
    return {
      ids: [...DEFAULT_NINE_CARD_IDS],
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
        ids: [...DEFAULT_NINE_CARD_IDS],
        version: 0,
        updatedAt: null,
        isDefault: true,
      };
    }
    const parsed = JSON.parse(row.payload) as { ids?: unknown };
    const ids = validateNineCardIds(parsed.ids);
    return {
      ids,
      version: row.version,
      updatedAt: row.updated_at,
      isDefault: ids.every((id, i) => id === DEFAULT_NINE_CARD_IDS[i]),
    };
  } catch {
    return {
      ids: [...DEFAULT_NINE_CARD_IDS],
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
         VALUES (?, ?, ?, 'Nine-Card Market Grid', ?, 1, 0, ?, ?, ?)`,
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
      isDefault: ids.every((x, i) => x === DEFAULT_NINE_CARD_IDS[i]),
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
    isDefault: ids.every((x, i) => x === DEFAULT_NINE_CARD_IDS[i]),
  };
}

export function buildMarketOverviewCards(
  ids: readonly string[],
  snapshot: MarketSnapshot,
): MarketOverviewCard[] {
  const allPoints = [...snapshot.quotes, ...snapshot.yields];
  const pointMap = new Map(allPoints.map((p) => [p.id.toUpperCase(), p]));
  const histMap = new Map(snapshot.fxHistory.map((h) => [h.id.toUpperCase(), h]));

  return ids.map((canonicalId) => {
    const entry = registryInstrument(canonicalId);
    const point = pointMap.get(canonicalId.toUpperCase());
    const hist = histMap.get(canonicalId.toUpperCase());
    const market = entry?.market ?? canonicalId.split(":")[0] ?? "GLOBAL";
    const session = resolveSession(canonicalId, market, snapshot.asOf);

    if (point && point.value !== null) {
      const pts = hist?.points.map((p) => p.close) ?? null;
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
        sparkline: pts && pts.length >= 10 ? pts.slice(-30) : null,
        provider: point.provider,
        sourceUrl: point.sourceUrl,
        sourceObservedAtUTC: point.sourceDate
          ? `${point.sourceDate}T16:00:00.000Z`
          : null,
        ingestedAtUTC: point.retrievedAt ?? snapshot.asOf,
        quality,
        marketSession: session.state,
        sessionLabel: session.label,
        reasonCode: point.reason,
        redistributable: true,
      };
    }

    const isRestrictedExchange = ["NSE", "BSE", "MCX"].includes(market);
    const resolvedUnit = (() => {
      const upper = (entry?.id ?? canonicalId).toUpperCase();
      if (entry?.assetClass === "INDEX") return "pts";
      if (upper === "GLOBAL:XAUUSD" || upper === "GLOBAL:XAGUSD") return "USD/oz";
      if (upper === "GLOBAL:BRENT") return "USD/bbl";
      if (entry?.assetClass === "BOND_YIELD") return "% yield";
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
      provider: isRestrictedExchange
        ? "Licensed Exchange Feed Required"
        : "Commercial Feed Not Connected",
      sourceUrl: entry?.sourceUrl ?? "",
      sourceObservedAtUTC: null,
      ingestedAtUTC: snapshot.asOf,
      quality: isRestrictedExchange ? "RESTRICTED" : "NOT_CONNECTED",
      marketSession: session.state,
      sessionLabel: session.label,
      reasonCode: isRestrictedExchange
        ? "Public exchange redistribution requires commercial licence; no simulated quote shown."
        : "Reference feed not connected on this deployment; no simulated price shown.",
      redistributable: false,
    };
  });
}

export async function getMarketOverviewPayload(
  subject: string | null,
  overrideSnapshot?: MarketSnapshot,
) {
  const [layout, snapshot] = await Promise.all([
    getUserMarketLayout(subject),
    overrideSnapshot ? Promise.resolve(overrideSnapshot) : marketSnapshot(),
  ]);
  return {
    asOf: snapshot.asOf,
    layout,
    cards: buildMarketOverviewCards(layout.ids, snapshot),
    catalog: X2_INSTRUMENTS.map((i) => ({
      id: i.id,
      label: i.label,
      name: i.name,
      market: i.market,
      assetClass: i.assetClass,
      currency: i.currency ?? "",
      mappingStatus: i.mappingStatus,
    })),
    disclosure:
      "Market session status and quote-feed quality are tracked independently. Unavailable or restricted exchange feeds render em-dashes with explicit provenance — never simulated prices or sparklines.",
  };
}
