/** Versioned data contracts. Missing observations never become zero or synthetic candles. */
export const SHARED_HISTORY_LABEL = "Licensed exchange history";
export type Interval = "30m" | "1h" | "1d" | "1wk" | "1mo";
export type ProviderId = "EODHD" | "TRUEDATA" | "INDIANAPI" | "BHARATSTOCK";
export type Market = "NSE" | "BSE" | "MCX" | "GLOBAL";
export type Instrument = {
  id: string;
  name: string;
  symbol: string;
  providerSymbol: string;
  market: Market;
  mic: string;
  type: "EQUITY" | "INDEX" | "FUTURE" | "FX" | "YIELD";
  currency: string;
  unit: string;
  timezone: string;
  expiry?: string;
  lotSize?: number;
  tickSize?: number;
};
export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number | null;
  volume: number | null;
  openInterest: number | null;
  knownAt: string;
  adjustment: "RAW_OHLC_ADJUSTED_CLOSE" | "RAW" | "REFERENCE_ONLY";
  provider: string;
};
export type Reference = { date: string; close: number; knownAt: string };
export type Fundamental = {
  metric: string;
  value: number | null;
  unit: string;
  period: string;
  knownAt: string | null;
  basis: string;
};
export type Statement = {
  kind: "Income" | "Balance sheet" | "Cash flow";
  period: string;
  currency: string;
  basis: "Unspecified provider basis";
  qualityNotes?: string[];
  knownAt: string | null;
  values: Record<string, number | null>;
};
export type ResearchEvent = {
  title: string;
  date: string;
  sourceUrl: string;
  type: string;
};
export type OptionObservation = {
  expiry: string;
  strike: number;
  side: "CALL" | "PUT";
  openInterest: number | null;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  sourceAt: string;
};
export type Rights = {
  display: boolean;
  analysis: boolean;
  storage: boolean;
  redistribution: boolean;
  derivedDisplay?: boolean;
  cacheSeconds: number;
  verified: boolean;
  contractReference: string;
  expiresAt: string;
};
export type ProviderCreditWindow = {
  startsAt: string;
  endsAt: string;
  availableCredits: number;
  callsPerMinute: number;
};

export type SharedHistoryGrant = {
  creditWindow?: ProviderCreditWindow;
  intervals: ("1d" | "30m" | "1h")[];
  lagMinutes: number;
  retentionHours: number;
  dailyLookbackDays: number;
  dailyRefreshMinutes: number;
  intradayRefreshMinutes: number;
  attribution: string;
  attributionUrl: string;
};
export type ProviderConfig = {
  provider: ProviderId;
  constituentGrant?: { version: string; expiresAt: string };
  enabled: boolean;
  priority: number;
  version: number;
  rights: Rights;
  instruments: Instrument[];
  datasets: ("candles" | "fundamentals" | "news" | "prices")[];
  dailyCallLimit: number;
  lastWrite: string;
  sharedHistory?: SharedHistoryGrant;
};
export type ProviderHealth = {
  state:
    | "NOT_CONFIGURED"
    | "ENTITLEMENT_NOT_VERIFIED"
    | "CONNECTED"
    | "PARTIAL_COVERAGE"
    | "AUTH_FAILED"
    | "RATE_LIMITED"
    | "PROVIDER_DOWN"
    | "DISABLED";
  checkedAt: string | null;
  lastEventAt: string | null;
  message: string;
  accepted: string[];
  rejected: string[];
  callsToday: number;
  quotaRemaining: number;
  latencyMs: number | null;
};
export type AssetResearch = {
  schemaVersion: "x2-data-1";
  id: string;
  name: string;
  instrument: Instrument | null;
  provider: string;
  sourceUrl: string;
  state: string;
  asOf: string;
  retrievedAt: string | null;
  unit: string;
  currency: string;
  interval: Interval;
  pointInTime: false;
  references: Reference[];
  candles: Candle[];
  fundamentals: Fundamental[];
  statements: Statement[];
  events: ResearchEvent[];
  options: OptionObservation[];
  capabilities: {
    chart: boolean;
    candles: boolean;
    volume: boolean;
    fundamentals: boolean;
    events: boolean;
    options: boolean;
    analysis: boolean;
    derivedDisplay?: boolean;
    storage: boolean;
  };
  limitations: string[];
  attribution?: { label: string; url: string };
  coverage?: { firstDate: string; lastDate: string; bars: number };
};
export type Drawing = {
  id: string;
  type: "level" | "trend" | "ray" | "fibonacci";
  date1: string;
  value1: number;
  date2?: string;
  value2?: number;
};
export type ChartLayout = {
  version: number;
  payload: {
    mode: "line" | "candles" | "ohlc";
    interval: Interval;
    indicators: string[];
    drawings: Drawing[];
  };
  updatedAt: string | null;
};
