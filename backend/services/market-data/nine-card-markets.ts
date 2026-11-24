import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { getIndianExchangeSession, previousExchangeSession } from "./exchange-calendar";
import { registryInstrument } from "./instrument-registry";
import { BHARATSTOCK_INDEX_SYMBOLS, PROVIDERS } from "./providers";
import { readSharedHistoryBatch, sharedHistoryGrants, type SharedHistory } from "./shared-history";
import {
  ALLOWED_GLOBAL_MARKET_IDS,
  DASHBOARD_LABELS,
  DEFAULT_EIGHT_CARD_IDS,
  DEFAULT_NINE_CARD_IDS,
  reconcileGlobalMarketIds,
  type MarketLayoutRecord,
  type MarketOverviewCard,
  type MarketSessionState,
} from "./nine-card-types";

export { DEFAULT_EIGHT_CARD_IDS, DEFAULT_NINE_CARD_IDS };
export const MARKET_LAYOUT_RECORD_KIND = "market-layout";

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
    const insert = await db
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
    if (!insert.meta.changes) {
      throw new HttpError(409, "Market layout was created concurrently. Refresh and retry.");
    }
    return {
      ids,
      version: 1,
      updatedAt: now,
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


const units: Record<string, string> = {
  "MCX:GOLD": "INR / 10 g",
  "MCX:SILVER": "INR / kg",
  "MCX:CRUDEOIL": "INR / bbl",
  "FX:USDINR": "INR / USD",
};
const sessionStates: Record<string, MarketSessionState> = {
  OPEN: "OPEN", CLOSED: "CLOSED", HOLIDAY: "CLOSED", PRE_OPEN: "PREMARKET",
};
const allowedCatalog = DEFAULT_EIGHT_CARD_IDS.map((id) => {
  const entry = registryInstrument(id);
  if (!entry) throw new Error("Missing dashboard instrument identity: " + id);
  return entry;
});

export function buildMarketOverviewCards(
  ids: readonly string[],
  observations: ReadonlyMap<string, SharedHistory>,
  checkedAt: number,
  eligible: boolean,
): MarketOverviewCard[] {
  return reconcileGlobalMarketIds(ids).map((canonicalId) => {
    const entry = registryInstrument(canonicalId)!;
    const market = entry.market;
    const session = market === "NSE" || market === "BSE" || market === "MCX"
      ? getIndianExchangeSession(market, checkedAt) : null;
    const supported = BHARATSTOCK_INDEX_SYMBOLS.has(canonicalId);
    const candidate = observations.get(canonicalId);
    const snapshot = supported && eligible && candidate?.config.provider === "BHARATSTOCK" ? candidate : null;
    const bars = snapshot?.candles.slice(-30) ?? [];
    const newest = bars.at(-1);
    const prior = bars.at(-2);
    const previous = newest && prior && previousExchangeSession("NSE", newest.date) === prior.date ? prior : null;
    const first = bars[0];
    const change = newest && previous ? newest.close - previous.close : null;
    return {
      canonicalId,
      shortLabel: DASHBOARD_LABELS[canonicalId] ?? entry.label,
      name: entry.name,
      venue: market,
      assetClass: entry.assetClass,
      currency: entry.currency ?? "INR",
      quoteUnit: units[canonicalId] ?? "index points",
      value: newest?.close ?? null,
      absoluteChange: change,
      percentChange: change !== null && previous ? change / previous.close * 100 : null,
      previousClose: previous?.close ?? null,
      changeUnit: "%",
      sparkline: bars.length > 1 ? bars.map(({close}) => close) : null,
      sparklinePeriodLabel: bars.length > 1 ? `${bars.length} closes` : null,
      sparklineReturnPct: newest && first && bars.length > 1 ? (newest.close / first.close - 1) * 100 : null,
      contractLabel: null,
      marketTimezone: "Asia/Kolkata",
      isLive: false,
      provider: "BharatStock",
      sourceUrl: snapshot?.config.sharedHistory.attributionUrl ?? PROVIDERS.BHARATSTOCK.docs,
      sourceObservedAtUTC: newest?.date ?? null,
      sourceObservedPrecision: newest ? "DATE_ONLY" : "UNAVAILABLE",
      ingestedAtUTC: snapshot ? new Date(snapshot.row.received_at).toISOString() : null,
      quality: newest ? (snapshot?.state === "STALE" ? "STALE" : "PUBLISHED_EOD")
        : supported && !eligible ? "RESTRICTED" : "UNAVAILABLE",
      marketSession: session ? sessionStates[session.state] ?? "UNKNOWN" : "UNKNOWN",
      sessionLabel: session?.state === "HOLIDAY" ? "Holiday" : session?.label ?? "Market hours",
      reasonCode: !supported ? "BharatStock coverage is unconfirmed for this instrument."
        : !eligible ? "Sign in and accept the research terms to view licensed market data."
        : !newest ? "An eligible BharatStock close is unavailable."
        : "Completed exchange close.",
      redistributable: Boolean(newest),
    };
  });
}

export async function getMarketOverviewPayload(subject: string | null) {
  const [layout, identity] = await Promise.all([
    getUserMarketLayout(subject),
    subject ? account(subject) : null,
  ]);
  const eligible = identity?.adult_confirmed === 1 && identity.consent_version === "2026-11-14-v4";
  const now = Date.now();
  let stored = new Map<string, SharedHistory>();
  if (eligible) {
    try {
      const grants = await sharedHistoryGrants(now, "dashboard");
      stored = await readSharedHistoryBatch(layout.ids, "1d", grants, { provider: "BHARATSTOCK", now });
    } catch {
      // Display the fixed roster even during an ingestion or storage outage.
    }
  }
  return {
    asOf: new Date(now).toISOString(),
    layout,
    cards: buildMarketOverviewCards(layout.ids, stored, now, eligible),
    catalog: allowedCatalog,
    disclosure: "Dashboard observations come from the licensed BharatStock feed. Times shown on prices identify the exchange observation.",
  };
}
