/**
 * Client-safe types and strict 8-instrument allowlist for the Global Markets Overview Grid.
 * Contains zero server/database imports so browser bundles stay clean.
 */

export const DEFAULT_EIGHT_CARD_IDS: readonly string[] = Object.freeze([
  "NSE:NIFTY",
  "BSE:SENSEX",
  "NSE:BANKNIFTY",
  "MCX:GOLD",
  "MCX:SILVER",
  "MCX:CRUDEOIL",
  "NSE:NIFTYMIDCAP100",
  "FX:USDINR",
]);

export const DASHBOARD_LABELS: Readonly<Record<string, string>> = {
  "MCX:GOLD": "GOLD MCX",
  "MCX:CRUDEOIL": "CRUDE OIL MCX",
};

export const ALLOWED_GLOBAL_MARKET_IDS: ReadonlySet<string> = new Set(
  DEFAULT_EIGHT_CARD_IDS,
);

/** Backward-compatible alias pointing strictly to the 8 allowed Global dashboard instruments. */
export const DEFAULT_NINE_CARD_IDS: readonly string[] = DEFAULT_EIGHT_CARD_IDS;

/** Reconciles any legacy 9-card or custom layout strictly onto the 8 allowed Global dashboard tiles. */
export function reconcileGlobalMarketIds(raw: unknown): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const upper = item.trim().toUpperCase();
      // Map dated MCX Gold/Silver contracts back to canonical Global tile IDs if stored previously.
      const normalized = upper === "GLOBAL:CL" ? "MCX:CRUDEOIL"
        : upper === "ECB:USDINR" ? "FX:USDINR"
        : upper.replace(/^(MCX:(?:GOLD|SILVER|CRUDEOIL))\d.*$/, "$1");
      if (ALLOWED_GLOBAL_MARKET_IDS.has(normalized) && !seen.has(normalized)) {
        seen.add(normalized);
        kept.push(normalized);
      }
    }
  }
  for (const id of DEFAULT_EIGHT_CARD_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      kept.push(id);
    }
  }
  return kept.slice(0, DEFAULT_EIGHT_CARD_IDS.length);
}

export type QuoteQuality =
  | "REAL_TIME"
  | "DELAYED"
  | "LAST_AVAILABLE"
  | "PUBLISHED_EOD"
  | "REFERENCE"
  | "STALE"
  | "NOT_CONNECTED"
  | "RESTRICTED"
  | "UNAVAILABLE";

export type MarketSessionState =
  | "OPEN"
  | "CLOSED"
  | "PREMARKET"
  | "POSTMARKET"
  | "UNKNOWN";

export type MarketOverviewCard = {
  canonicalId: string;
  shortLabel: string;
  name: string;
  venue: string;
  assetClass: string;
  currency: string;
  quoteUnit: string;
  value: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  previousClose: number | null;
  changeUnit: "%" | "bp";
  sparkline: number[] | null;
  sparklinePeriodLabel?: string | null;
  sparklineReturnPct?: number | null;
  contractLabel?: string | null;
  marketTimezone?: string;
  isLive?: boolean;
  provider: string;
  sourceUrl: string;
  sourceObservedAtUTC: string | null;
  sourceObservedPrecision?: "DATE_ONLY" | "TIMESTAMP" | "UNAVAILABLE";
  ingestedAtUTC: string | null;
  quality: QuoteQuality;
  marketSession: MarketSessionState;
  sessionLabel: string;
  reasonCode: string;
  redistributable: boolean;
};

export type MarketLayoutRecord = {
  ids: string[];
  version: number;
  updatedAt: string | null;
  isDefault: boolean;
};
