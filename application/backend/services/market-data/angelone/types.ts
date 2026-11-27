/**
 * Provider-neutral and Angel One SmartAPI read-only market-data contracts.
 * Strictly read-only: no order placement, GTT, position mutation, or funds endpoints.
 */

export type ExchangeCode = "NSE" | "BSE" | "MCX";
export type SegmentType = "EQUITY" | "INDEX" | "FUTURE";

export type DataQualityState =
  | "VERIFIED_REAL_LIVE"
  | "VERIFIED_REAL_DELAYED"
  | "VERIFIED_LAST_AVAILABLE"
  | "REAL_BUT_STALE"
  | "MARKET_CLOSED_LAST"
  | "NO_DATA"
  | "DEMO";

export type ExchangeSessionState =
  | "OPEN"
  | "PRE_OPEN"
  | "CLOSED"
  | "HOLIDAY"
  | "SCHEDULE_UNKNOWN";

export type MarketDataMode = "private" | "public_licensed" | "disabled";

export type MarketDataRuntimeFlags = {
  provider: "angelone" | "none";
  mode: MarketDataMode;
  enablePrivateBrokerData: boolean;
  enablePublicExchangeQuotes: boolean;
  demoMode: boolean;
};

export type MarketErrorCode =
  | "UNAUTHENTICATED"
  | "PUBLIC_LICENSE_REQUIRED"
  | "PRIVATE_DATA_DISABLED"
  | "ADAPTER_NOT_CONFIGURED"
  | "ADAPTER_OFFLINE"
  | "ADAPTER_AUTH_FAILED"
  | "BROKER_AUTH_FAILED"
  | "BROKER_SESSION_EXPIRED"
  | "BROKER_TOTP_REQUIRED"
  | "BROKER_STATIC_IP_BLOCKED"
  | "SEGMENT_NOT_ENTITLED"
  | "RATE_LIMITED"
  | "CIRCUIT_OPEN"
  | "INVALID_SYMBOL"
  | "TIMEOUT"
  | "UPSTREAM_ERROR";

export type InstrumentMasterEntry = {
  /** Canonical compound identity, e.g. NSE:SBIN, BSE:SBIN, MCX:GOLD04DEC26FUT */
  id: string;
  exchange: ExchangeCode;
  segment: SegmentType;
  /** Exchange trading symbol, e.g. SBIN-EQ, SBIN, GOLD04DEC26FUT */
  tradingSymbol: string;
  /** Human root symbol, e.g. SBIN, RELIANCE, GOLD */
  symbol: string;
  /** Exchange-specific Angel One numeric token (never reused across exchanges!) */
  token: string;
  name: string;
  mic: "XNSE" | "XBOM" | "XMCX";
  currency: "INR";
  unit: string;
  timezone: "Asia/Kolkata";
  /** ISO YYYY-MM-DD for dated futures contracts, null for equities/indices */
  expiry: string | null;
  lotSize: number;
  /** Tick size normalized to INR rupees (converted from Angel One ScripMaster paise / 100) */
  tickSize: number | null;
  instrumentType: string;
};

export type ExchangeSessionInfo = {
  exchange: ExchangeCode;
  mic: "XNSE" | "XBOM" | "XMCX";
  state: ExchangeSessionState;
  label: string;
  reason: string;
  timezone: "Asia/Kolkata";
  localDateIST: string;
  localTimeIST: string;
  serverTimestampUTC: string;
  regularHoursIST: string;
  holidayName: string | null;
  specialSessionNote: string | null;
  verifiedThrough: string;
  calendarStatus: "VERIFIED_2026" | "VERIFIED_2027" | "UNVERIFIED_YEAR";
  calendarVersion?: string;
  calendarSource?: string;
};

export type NormalizedMarketQuote = {
  id: string;
  exchange: ExchangeCode;
  segment: SegmentType;
  symbol: string;
  tradingSymbol: string;
  token: string;
  name: string;
  expiry: string | null;
  lotSize: number;
  tickSize: number | null;
  currency: "INR";
  unit: string;
  ltp: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  /** Preserved for derivatives/futures; explicitly null for cash equities & indices */
  openInterest: number | null;
  /** Canonical UTC ISO-8601 observation instant from exchange (trade time or feed time) */
  exchangeTimestampUTC: string | null;
  /** Human-readable IST display string corresponding to exchangeTimestampUTC */
  exchangeTimestampIST: string | null;
  /** Separate exchange feed broadcast instant when distinct from trade time */
  feedTimestampUTC: string | null;
  /** Separate instant when the adapter retrieved this payload */
  retrievalTimestampUTC: string;
  /** Human-readable IST display string for retrieval time */
  retrievalTimestampIST: string;
  quality: DataQualityState;
  qualityLabel: string;
  marketState: ExchangeSessionState;
  isLive: boolean;
  freshnessReason: string;
  provider: string;
  sourceMode: "PRIVATE_OWNER_FEED" | "DEMO_SYNTHETIC";
  sourceUrl: string;
  errorCode: MarketErrorCode | null;
  errorMessage: string | null;
};

export type NormalizedCandle = {
  timestampUTC: string;
  dateIST: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  openInterest: number | null;
  provider: string;
  adjustment: "RAW";
};

export type NormalizedCandleSeries = {
  instrument: InstrumentMasterEntry;
  interval: CandleInterval;
  candles: NormalizedCandle[];
  retrievalTimestampUTC: string;
  retrievalTimestampIST: string;
  quality: DataQualityState;
  qualityLabel: string;
  marketState: ExchangeSessionState;
  provider: string;
  sourceMode: "PRIVATE_OWNER_FEED" | "DEMO_SYNTHETIC";
  limitations: string[];
  errorCode: MarketErrorCode | null;
  errorMessage: string | null;
};

export type CandleInterval = "1d" | "1h" | "30m" | "15m" | "5m";
export const MAX_DAILY_CANDLE_DAYS = 2_000;
export const MAX_HOURLY_CANDLE_DAYS = 60;
export const MAX_30M_CANDLE_DAYS = 60;

export type BrokerAuthState =
  | "AUTHENTICATED"
  | "EXPIRED"
  | "TOTP_REQUIRED"
  | "NOT_CONFIGURED"
  | "STATIC_IP_BLOCKED"
  | "AUTH_FAILED"
  | "RATE_LIMITED";

export type MarketHealthResponse = {
  ok: boolean;
  provider: string;
  mode: MarketDataMode;
  flags: {
    privateBrokerEnabled: boolean;
    publicExchangeQuotesEnabled: boolean;
    demoMode: boolean;
  };
  accessScope: "OWNER_PRIVATE" | "PUBLIC_RESTRICTED";
  adapterReachable: boolean;
  authState: BrokerAuthState | "HIDDEN";
  enabledExchanges: ExchangeCode[];
  scripMasterCount: number | null;
  scripMasterUpdatedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN" | "UNKNOWN";
  serverTimestampUTC: string;
  serverTimestampIST: string;
  errorCode: MarketErrorCode | null;
  message: string;
};

export type MarketSessionResponse = {
  serverTimestampUTC: string;
  serverTimestampIST: string;
  timezone: "Asia/Kolkata";
  sessions: Record<ExchangeCode, ExchangeSessionInfo>;
};

export type MarketQuoteResponse = {
  provider: string;
  sourceMode: "PRIVATE_OWNER_FEED" | "DEMO_SYNTHETIC";
  serverTimestampUTC: string;
  serverTimestampIST: string;
  quotes: NormalizedMarketQuote[];
  unfetched: { id: string; reason: string; errorCode: MarketErrorCode }[];
  sessions: Record<ExchangeCode, ExchangeSessionInfo>;
};

export type MarketErrorResponse = {
  error: string;
  errorCode: MarketErrorCode;
  actionHint: string;
  retryAfterMs?: number;
  serverTimestampUTC: string;
};
