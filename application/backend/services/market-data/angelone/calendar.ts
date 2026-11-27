/**
 * Unified exchange calendar bridge for the private broker gateway.
 * Re-exports the single authoritative session engine from `../exchange-calendar`
 * so dashboard, quotes, globe, and scanner never disagree on session states.
 */
import type {
  DataQualityState,
  ExchangeSessionInfo,
  ExchangeSessionState,
} from "./types";

export {
  EXCHANGE_CALENDAR_METADATA,
  formatIstTimestamp,
  getAllIndianExchangeSessions,
  getExchangeSessionWindowMinutes,
  getIndianExchangeSession,
  getIstDateAndMinutes,
  getNymexGlobexSession,
  isVerifiedCalendarYear,
  previousExchangeSession,
} from "../exchange-calendar";

export function qualityDisplayLabel(quality: DataQualityState): string {
  switch (quality) {
    case "VERIFIED_REAL_LIVE":
      return "VERIFIED LIVE";
    case "VERIFIED_REAL_DELAYED":
      return "DELAYED REAL";
    case "VERIFIED_LAST_AVAILABLE":
      return "LAST AVAILABLE";
    case "REAL_BUT_STALE":
      return "STALE REAL";
    case "MARKET_CLOSED_LAST":
      return "MARKET CLOSED · LAST";
    case "DEMO":
      return "DEMO / SYNTHETIC";
    case "NO_DATA":
    default:
      return "NO DATA";
  }
}

export function formatDataQualityBadge(quality: DataQualityState): string {
  switch (quality) {
    case "VERIFIED_REAL_LIVE":
      return "LIVE";
    case "VERIFIED_REAL_DELAYED":
      return "DELAYED";
    case "VERIFIED_LAST_AVAILABLE":
      return "LAST AVAILABLE";
    case "MARKET_CLOSED_LAST":
      return "MARKET CLOSED";
    case "REAL_BUT_STALE":
      return "STALE";
    case "DEMO":
      return "DEMO";
    default:
      return "NO DATA";
  }
}

export function classifyQuoteQuality(input: {
  ltp: number | null;
  observationTimeMs: number | null;
  retrievalTimeMs: number;
  nowMs: number;
  session: ExchangeSessionInfo;
  isDemo?: boolean;
}): { quality: DataQualityState; isLive: boolean; reason: string } {
  if (input.isDemo) {
    return {
      quality: "DEMO",
      isLive: false,
      reason: "Explicit DEMO / SYNTHETIC development mode. Not real exchange market data.",
    };
  }

  if (input.ltp === null || !Number.isFinite(input.ltp) || input.ltp <= 0) {
    return {
      quality: "NO_DATA",
      isLive: false,
      reason: "No valid last traded price returned by provider.",
    };
  }

  const sessionState: ExchangeSessionState = input.session.state;
  if (sessionState === "CLOSED" || sessionState === "HOLIDAY") {
    return {
      quality: "MARKET_CLOSED_LAST",
      isLive: false,
      reason: `${input.session.label}. Price reflects the prior trading session, not a live tick.`,
    };
  }

  if (sessionState === "SCHEDULE_UNKNOWN") {
    return {
      quality: "VERIFIED_LAST_AVAILABLE",
      isLive: false,
      reason: `${input.session.reason} Quote is shown as last available rather than LIVE.`,
    };
  }

  if (input.observationTimeMs === null || !Number.isFinite(input.observationTimeMs)) {
    return {
      quality: "REAL_BUT_STALE",
      isLive: false,
      reason: "Provider returned a price without a verified observation timestamp; cannot confirm live freshness.",
    };
  }

  const ageMs = input.nowMs - input.observationTimeMs;
  if (ageMs < -120_000) {
    return {
      quality: "REAL_BUT_STALE",
      isLive: false,
      reason: "Observation timestamp is significantly ahead of server clock (clock skew detected).",
    };
  }

  if (sessionState === "PRE_OPEN") {
    return {
      quality: "VERIFIED_LAST_AVAILABLE",
      isLive: false,
      reason: "Exchange is in pre-open session; quote reflects pre-open/prior close indication.",
    };
  }

  // Exchange is scheduled OPEN:
  if (ageMs <= 60_000) {
    return {
      quality: "VERIFIED_REAL_LIVE",
      isLive: true,
      reason: "Verified broker quote observed within 60 seconds during scheduled open session.",
    };
  }
  if (ageMs <= 15 * 60_000) {
    return {
      quality: "VERIFIED_REAL_DELAYED",
      isLive: false,
      reason: `Verified broker quote delayed by ${Math.round(ageMs / 60_000)} min relative to server time.`,
    };
  }
  return {
    quality: "REAL_BUT_STALE",
    isLive: false,
    reason: "Exchange is open, but latest broker observation is older than 15 minutes (illiquid or stale feed).",
  };
}
