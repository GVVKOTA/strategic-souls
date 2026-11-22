/**
 * Client-safe types and default 9-card layout constants for the 3x3 Markets Overview Grid.
 * Contains zero server/database imports so browser bundles stay clean.
 */

export const DEFAULT_NINE_CARD_IDS: readonly string[] = Object.freeze([
  "NSE:NIFTY",
  "BSE:SENSEX",
  "GLOBAL:SPX",
  "GLOBAL:NDX",
  "GLOBAL:N225",
  "GLOBAL:XAUUSD",
  "GLOBAL:XAGUSD",
  "GLOBAL:BRENT",
  "ECB:USDINR",
]);

export type QuoteQuality =
  | "REAL_TIME"
  | "DELAYED"
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
  provider: string;
  sourceUrl: string;
  sourceObservedAtUTC: string | null;
  sourceObservedPrecision?: "DATE_ONLY" | "TIMESTAMP" | "UNAVAILABLE";
  ingestedAtUTC: string;
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
