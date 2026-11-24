/**
 * Canonical Instrument Identity & Deterministic Discovery Registry.
 * - Separates instrument IDENTITY/DISCOVERY from quote/candle ENTITLEMENT.
 * - Discovering an instrument (e.g., NSE:HDFCBANK via "HDFC", "HDFC Bank", "HDFCBANK")
 *   never implies live quote availability or public redistribution rights.
 */

export type InstrumentAvailabilityState =
  | "DATA_CONNECTED"
  | "IDENTIFIED_ONLY"
  | "ENTITLEMENT_REQUIRED"
  | "ADAPTER_OFFLINE"
  | "SESSION_EXPIRED"
  | "EXPIRED_CONTRACT"
  | "CONTRACT_SELECTION_REQUIRED"
  | "UNMAPPED"
  | "STALE"
  | "UNSUPPORTED";

export type CanonicalRegistryEntry = {
  id: string;
  label: string;
  name: string;
  market: string;
  assetClass: "EQUITY" | "INDEX" | "FUTURE" | "FX" | "BOND_YIELD" | string;
  currency?: string;
  sector?: string;
  aliases?: readonly string[];
  expiry?: string | null;
  lotSize?: number | null;
  tickSize?: number | null;
  sourceUrl: string;
  mappingStatus: string;
  availabilityState?: InstrumentAvailabilityState;
};

/** Well-known Indian & global search aliases mapped to canonical symbol/name tokens. */
export const COMMON_INSTRUMENT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "NSE:HDFCBANK": ["HDFC", "HDFC BANK", "HDFCBANK", "HDFCBANK-EQ", "HDFC LTD", "1333"],
  "BSE:HDFCBANK": ["HDFC BSE", "HDFC BANK BSE", "500180"],
  "NSE:SBIN": ["SBI", "SBIN", "STATE BANK", "STATE BANK OF INDIA", "SBIN-EQ", "3045"],
  "BSE:SBIN": ["SBI BSE", "STATE BANK BSE", "500112"],
  "NSE:RELIANCE": ["RIL", "RELIANCE", "RELIANCE INDUSTRIES", "RELIANCE-EQ", "2885"],
  "BSE:RELIANCE": ["RIL BSE", "RELIANCE BSE", "500325"],
  "NSE:TCS": ["TCS", "TATA CONSULTANCY", "TATA CONSULTANCY SERVICES", "TCS-EQ", "11536"],
  "BSE:TCS": ["TCS BSE", "532540"],
  "NSE:INFY": ["INFY", "INFOSYS", "INFY-EQ", "1594"],
  "BSE:INFY": ["INFY BSE", "INFOSYS BSE", "500209"],
  "NSE:ICICIBANK": ["ICICI", "ICICI BANK", "ICICIBANK", "ICICIBANK-EQ", "4963"],
  "NSE:BHARTIARTL": ["AIRTEL", "BHARTI", "BHARTI AIRTEL", "BHARTIARTL", "10604"],
  "NSE:ITC": ["ITC", "ITC LTD", "ITC LIMITED", "1660"],
  "NSE:KOTAKBANK": ["KOTAK", "KOTAK BANK", "KOTAK MAHINDRA", "KOTAKBANK", "1922"],
  "NSE:LT": ["L&T", "LT", "LARSEN", "LARSEN & TOUBRO", "LARSEN AND TOUBRO", "11483"],
  "NSE:AXISBANK": ["AXIS", "AXIS BANK", "AXISBANK", "5900"],
  "NSE:BAJFINANCE": ["BAJAJ FINANCE", "BAJFINANCE", "BAJAJ"],
  "NSE:MARUTI": ["MARUTI", "MARUTI SUZUKI", "MSIL"],
  "NSE:SUNPHARMA": ["SUN PHARMA", "SUNPHARMA", "SUN PHARMACEUTICAL"],
  "NSE:TITAN": ["TITAN", "TITAN COMPANY"],
  "NSE:TATAMOTORS": ["TATA MOTORS", "TATAMOTORS", "TAMO"],
  "NSE:ADANIENT": ["ADANI", "ADANI ENTERPRISES", "ADANIENT"],
  "NSE:WIPRO": ["WIPRO"],
  "NSE:HCLTECH": ["HCL", "HCL TECH", "HCLTECH", "HCL TECHNOLOGIES"],
  "NSE:ULTRACEMCO": ["ULTRATECH", "ULTRATECH CEMENT", "ULTRACEMCO"],
  "NSE:NTPC": ["NTPC"],
  "NSE:POWERGRID": ["POWERGRID", "POWER GRID"],
  "NSE:ONGC": ["ONGC", "OIL AND NATURAL GAS"],
  "NSE:TATASTEEL": ["TATA STEEL", "TATASTEEL"],
  "NSE:HINDUNILVR": ["HUL", "HINDUSTAN UNILEVER", "HINDUNILVR"],
  "NSE:NIFTY": ["NIFTY", "NIFTY 50", "NIFTY50", "CNX NIFTY", "99926000"],
  "NSE:BANKNIFTY": ["BANKNIFTY", "BANK NIFTY", "NIFTY BANK", "99926009"],
  "NSE:NIFTYMIDCAP100": ["NIFTY MIDCAP", "NIFTY MIDCAP 100", "MIDCAP 100", "MIDCAP", "NIFTYMIDCAP100"],
  "NSE:INDIAVIX": ["INDIAVIX", "INDIA VIX", "VIX INDIA"],
  "BSE:SENSEX": ["SENSEX", "BSE SENSEX", "BSE 30", "99919000"],
  "MCX:GOLD04DEC26FUT": ["GOLD", "MCX GOLD", "GOLD FUTURES", "GOLD04DEC26FUT", "495213"],
  "MCX:CRUDEOIL18DEC26FUT": ["CRUDE", "CRUDEOIL", "CRUDE OIL", "MCX CRUDE", "CRUDEOIL18DEC26FUT", "576264"],
  "MCX:GOLD": ["GOLD", "GOLD CONTRACT", "MCX GOLD", "MCX GOLD ROOT"],
  "MCX:SILVER": ["SILVER", "SILVER MCX", "MCX SILVER", "SILVER FUTURES"],
  "MCX:CRUDEOIL": ["CRUDE OIL CONTRACT", "MCX CRUDEOIL ROOT"],
  "GLOBAL:CL": ["CL", "WTI", "WTI CRUDE", "NYMEX CL", "CRUDE OIL FUTURES", "CL1!"],
  "GLOBAL:XAUUSD": ["GOLD SPOT", "SPOT GOLD", "XAUUSD", "XAU/USD", "LBMA GOLD"],
  "GLOBAL:XAGUSD": ["SILVER SPOT", "SPOT SILVER", "XAGUSD", "XAG/USD", "LBMA SILVER"],
  "GLOBAL:BRENT": ["BRENT", "BRENT CRUDE", "BRENT OIL", "ICE BRENT"],
  "ECB:USDINR": ["USD/INR", "USDINR", "DOLLAR RUPEE", "INR USD"],
  "ECB:EURUSD": ["EUR/USD", "EURUSD", "EURO DOLLAR"],
  "ECB:EURINR": ["EUR/INR", "EURINR", "EURO RUPEE"],
  "ECB:GBPUSD": ["GBP/USD", "GBPUSD", "POUND DOLLAR"],
  "ECB:USDJPY": ["USD/JPY", "USDJPY", "DOLLAR YEN"],
  "UST:10Y": ["US 10Y", "10Y YIELD", "TREASURY 10Y", "US10Y"],
  "UST:2Y": ["US 2Y", "2Y YIELD", "TREASURY 2Y", "US2Y"],
});

export const X2_INSTRUMENTS: readonly CanonicalRegistryEntry[] = [
  {
    id: "NSE:NIFTY",
    label: "NIFTY 50",
    name: "NIFTY 50 Index (NSE)",
    market: "NSE",
    assetClass: "INDEX",
    currency: "INR",
    sector: "Broad Market Index",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:NIFTY"],
    sourceUrl: "https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY-50",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:BANKNIFTY",
    label: "BANK NIFTY",
    name: "NIFTY Bank Index (NSE)",
    market: "NSE",
    assetClass: "INDEX",
    currency: "INR",
    sector: "Sectoral Index · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:BANKNIFTY"],
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:NIFTYMIDCAP100",
    label: "NIFTY MIDCAP",
    name: "NIFTY Midcap 100 Index (NSE)",
    market: "NSE",
    assetClass: "INDEX",
    currency: "INR",
    sector: "Broad Market Index · Midcap",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:NIFTYMIDCAP100"],
    sourceUrl: "https://www.niftyindices.com/indices/equity/broad-based-indices/nifty-midcap-100",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "BSE:SENSEX",
    label: "SENSEX",
    name: "BSE SENSEX Index",
    market: "BSE",
    assetClass: "INDEX",
    currency: "INR",
    sector: "Broad Market Index",
    aliases: COMMON_INSTRUMENT_ALIASES["BSE:SENSEX"],
    sourceUrl: "https://www.bseindia.com/sensex/Index_Overview.html",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:HDFCBANK",
    label: "HDFCBANK",
    name: "HDFC Bank (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:HDFCBANK"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/HDFCBANK/HDFC-Bank-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:SBIN",
    label: "SBIN",
    name: "State Bank of India (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:SBIN"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/SBIN/State-Bank-of-India",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:RELIANCE",
    label: "RELIANCE",
    name: "Reliance Industries (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Energy & Conglomerate",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:RELIANCE"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/RELIANCE/Reliance-Industries-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:TCS",
    label: "TCS",
    name: "Tata Consultancy Services (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Information Technology",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:TCS"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/TCS/Tata-Consultancy-Services-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:INFY",
    label: "INFY",
    name: "Infosys (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Information Technology",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:INFY"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/INFY/Infosys-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:ICICIBANK",
    label: "ICICIBANK",
    name: "ICICI Bank (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:ICICIBANK"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/ICICIBANK/ICICI-Bank-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:BHARTIARTL",
    label: "BHARTIARTL",
    name: "Bharti Airtel (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Telecommunications",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:BHARTIARTL"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/BHARTIARTL/Bharti-Airtel-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:ITC",
    label: "ITC",
    name: "ITC Limited (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Consumer Staples",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:ITC"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/ITC/ITC-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:KOTAKBANK",
    label: "KOTAKBANK",
    name: "Kotak Mahindra Bank (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:KOTAKBANK"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/KOTAKBANK/Kotak-Mahindra-Bank-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:LT",
    label: "LT",
    name: "Larsen & Toubro (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Capital Goods & Engineering",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:LT"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/LT/Larsen-&-Toubro-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:AXISBANK",
    label: "AXISBANK",
    name: "Axis Bank (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:AXISBANK"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/AXISBANK/Axis-Bank-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:BAJFINANCE",
    label: "BAJFINANCE",
    name: "Bajaj Finance (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · NBFC",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:BAJFINANCE"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/BAJFINANCE/Bajaj-Finance-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:MARUTI",
    label: "MARUTI",
    name: "Maruti Suzuki India (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Automobiles",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:MARUTI"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/MARUTI/Maruti-Suzuki-India-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:SUNPHARMA",
    label: "SUNPHARMA",
    name: "Sun Pharmaceutical Industries (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Healthcare · Pharmaceuticals",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:SUNPHARMA"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/SUNPHARMA/Sun-Pharmaceutical-Industries-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:TITAN",
    label: "TITAN",
    name: "Titan Company (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Consumer Discretionary",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:TITAN"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/TITAN/Titan-Company-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:TATAMOTORS",
    label: "TATAMOTORS",
    name: "Tata Motors (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Automobiles",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:TATAMOTORS"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/TATAMOTORS/Tata-Motors-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:ADANIENT",
    label: "ADANIENT",
    name: "Adani Enterprises (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Infrastructure & Incubator",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:ADANIENT"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/ADANIENT/Adani-Enterprises-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:WIPRO",
    label: "WIPRO",
    name: "Wipro Limited (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Information Technology",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:WIPRO"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/WIPRO/Wipro-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:HCLTECH",
    label: "HCLTECH",
    name: "HCL Technologies (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Information Technology",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:HCLTECH"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/HCLTECH/HCL-Technologies-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:ULTRACEMCO",
    label: "ULTRACEMCO",
    name: "UltraTech Cement (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Materials · Cement",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:ULTRACEMCO"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/ULTRACEMCO/UltraTech-Cement-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:NTPC",
    label: "NTPC",
    name: "NTPC Limited (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Utilities · Power",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:NTPC"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/NTPC/NTPC-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:POWERGRID",
    label: "POWERGRID",
    name: "Power Grid Corporation of India (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Utilities · Power Transmission",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:POWERGRID"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/POWERGRID/Power-Grid-Corporation-of-India-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:ONGC",
    label: "ONGC",
    name: "Oil & Natural Gas Corporation (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Energy · Exploration",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:ONGC"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/ONGC/Oil-&-Natural-Gas-Corporation-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:TATASTEEL",
    label: "TATASTEEL",
    name: "Tata Steel (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Materials · Metals & Steel",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:TATASTEEL"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/TATASTEEL/Tata-Steel-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:HINDUNILVR",
    label: "HINDUNILVR",
    name: "Hindustan Unilever (NSE)",
    market: "NSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Consumer Staples",
    aliases: COMMON_INSTRUMENT_ALIASES["NSE:HINDUNILVR"],
    sourceUrl: "https://www.nseindia.com/get-quote/equity/HINDUNILVR/Hindustan-Unilever-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "BSE:HDFCBANK",
    label: "HDFCBANK",
    name: "HDFC Bank (BSE)",
    market: "BSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["BSE:HDFCBANK"],
    sourceUrl: "https://www.bseindia.com/stock-share-price/hdfc-bank-ltd/hdfcbank/500180/",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "BSE:SBIN",
    label: "SBIN",
    name: "State Bank of India (BSE)",
    market: "BSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Financial Services · Banking",
    aliases: COMMON_INSTRUMENT_ALIASES["BSE:SBIN"],
    sourceUrl: "https://www.bseindia.com/stock-share-price/state-bank-of-india/sbin/500112/",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "BSE:RELIANCE",
    label: "RELIANCE",
    name: "Reliance Industries (BSE)",
    market: "BSE",
    assetClass: "EQUITY",
    currency: "INR",
    sector: "Energy & Conglomerate",
    aliases: COMMON_INSTRUMENT_ALIASES["BSE:RELIANCE"],
    sourceUrl: "https://www.bseindia.com/stock-share-price/reliance-industries-ltd/reliance/500325/",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "MCX:GOLD04DEC26FUT",
    label: "GOLD04DEC26FUT",
    name: "MCX Gold Futures (04 Dec 2026)",
    market: "MCX",
    assetClass: "FUTURE",
    currency: "INR",
    sector: "Precious Metals Futures",
    expiry: "2026-12-04",
    lotSize: 1,
    tickSize: 1,
    aliases: COMMON_INSTRUMENT_ALIASES["MCX:GOLD04DEC26FUT"],
    sourceUrl: "https://www.mcxindia.com/market-data/contract-specifications",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "MCX:CRUDEOIL18DEC26FUT",
    label: "CRUDEOIL18DEC26FUT",
    name: "MCX Crude Oil Futures (18 Dec 2026)",
    market: "MCX",
    assetClass: "FUTURE",
    currency: "INR",
    sector: "Energy Futures",
    expiry: "2026-12-18",
    lotSize: 100,
    tickSize: 1,
    aliases: COMMON_INSTRUMENT_ALIASES["MCX:CRUDEOIL18DEC26FUT"],
    sourceUrl: "https://www.mcxindia.com/market-data/contract-specifications",
    mappingStatus: "IDENTITY_ONLY",
  },
  ...[
    ["GOLD", "GOLD", "MCX Gold Futures"],
    ["SILVER", "SILVER MCX", "MCX Silver Futures"],
    ["CRUDEOIL", "CRUDEOIL", "MCX Crude Oil Futures"],
  ].map(([code, label, fullName]) => ({
    id: "MCX:" + code,
    label,
    name: fullName,
    market: "MCX",
    assetClass: "FUTURE",
    currency: "INR",
    aliases: COMMON_INSTRUMENT_ALIASES["MCX:" + code] ?? [code, "MCX " + code],
    sourceUrl: "https://www.mcxindia.com/market-data/contract-specifications",
    mappingStatus: "CONTRACT_SELECTION_REQUIRED",
  })),
  {
    id: "GLOBAL:CL",
    label: "CL",
    name: "WTI Crude Oil Futures (NYMEX CL)",
    market: "NYMEX",
    assetClass: "FUTURE",
    currency: "USD",
    sector: "Energy Futures",
    aliases: COMMON_INSTRUMENT_ALIASES["GLOBAL:CL"],
    sourceUrl: "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html",
    mappingStatus: "IDENTITY_ONLY",
  },
  ...[
    ["SPX", "S&P 500", "https://www.spglobal.com/spdji/en/indices/equity/sp-500/"],
    ["NDX", "Nasdaq-100", "https://www.nasdaq.com/market-activity/index/ndx"],
    ["IXIC", "Nasdaq Composite", "https://www.nasdaq.com/market-activity/index/comp"],
    [
      "DJI",
      "Dow Jones Industrial Average",
      "https://www.spglobal.com/spdji/en/indices/equity/dow-jones-industrial-average/",
    ],
    ["FTSE", "FTSE 100", "https://www.lseg.com/en/ftse-russell/indices/uk"],
    ["DAX", "DAX", "https://www.stoxx.com/index-details?symbol=DAX"],
    ["N225", "Nikkei 225", "https://indexes.nikkei.co.jp/en/nkave"],
    ["HSI", "Hang Seng", "https://www.hsi.com.hk/eng/indexes/all-indexes/hsi"],
    ["SSE", "Shanghai Composite", "https://english.sse.com.cn/markets/indices/overview/"],
  ].map(([label, name, sourceUrl]) => ({
    id: "GLOBAL:" + label,
    label,
    name,
    market: "GLOBAL",
    assetClass: "INDEX",
    aliases: [label, name.toUpperCase()],
    sourceUrl,
    mappingStatus: "IDENTITY_ONLY",
  })),
  {
    id: "GLOBAL:XAUUSD",
    label: "Gold Spot",
    name: "Gold Spot (XAU/USD)",
    market: "GLOBAL",
    assetClass: "COMMODITY_SPOT",
    currency: "USD",
    sector: "Precious Metals Spot",
    aliases: COMMON_INSTRUMENT_ALIASES["GLOBAL:XAUUSD"],
    sourceUrl: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "GLOBAL:XAGUSD",
    label: "Silver Spot",
    name: "Silver Spot (XAG/USD)",
    market: "GLOBAL",
    assetClass: "COMMODITY_SPOT",
    currency: "USD",
    sector: "Precious Metals Spot",
    aliases: COMMON_INSTRUMENT_ALIASES["GLOBAL:XAGUSD"],
    sourceUrl: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "GLOBAL:BRENT",
    label: "Brent Crude",
    name: "Brent Crude Benchmark (USD/bbl)",
    market: "GLOBAL",
    assetClass: "COMMODITY_BENCHMARK",
    currency: "USD",
    sector: "Energy Benchmark",
    aliases: COMMON_INSTRUMENT_ALIASES["GLOBAL:BRENT"],
    sourceUrl: "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "FX:USDINR",
    label: "USD/INR",
    name: "US Dollar / Indian Rupee",
    market: "FX",
    assetClass: "FX",
    currency: "INR",
    aliases: ["USD INR", "DOLLAR RUPEE"],
    sourceUrl: "",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "ECB:USDINR",
    label: "USD/INR",
    name: "USD / INR (ECB Daily Reference)",
    market: "ECB",
    assetClass: "FX",
    currency: "INR",
    sector: "Official Reference FX",
    aliases: COMMON_INSTRUMENT_ALIASES["ECB:USDINR"],
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
  {
    id: "ECB:EURUSD",
    label: "EUR/USD",
    name: "EUR / USD (ECB Daily Reference)",
    market: "ECB",
    assetClass: "FX",
    currency: "USD",
    sector: "Official Reference FX",
    aliases: COMMON_INSTRUMENT_ALIASES["ECB:EURUSD"],
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
  {
    id: "ECB:EURINR",
    label: "EUR/INR",
    name: "EUR / INR (ECB Daily Reference)",
    market: "ECB",
    assetClass: "FX",
    currency: "INR",
    sector: "Official Reference FX",
    aliases: COMMON_INSTRUMENT_ALIASES["ECB:EURINR"],
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
  {
    id: "ECB:GBPUSD",
    label: "GBP/USD",
    name: "GBP / USD (ECB Daily Reference)",
    market: "ECB",
    assetClass: "FX",
    currency: "USD",
    sector: "Official Reference FX",
    aliases: COMMON_INSTRUMENT_ALIASES["ECB:GBPUSD"],
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
  {
    id: "ECB:USDJPY",
    label: "USD/JPY",
    name: "USD / JPY (ECB Daily Reference)",
    market: "ECB",
    assetClass: "FX",
    currency: "JPY",
    sector: "Official Reference FX",
    aliases: COMMON_INSTRUMENT_ALIASES["ECB:USDJPY"],
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
  {
    id: "UST:10Y",
    label: "US 10Y",
    name: "US Treasury 10Y Par Yield",
    market: "UST",
    assetClass: "BOND_YIELD",
    currency: "USD",
    sector: "Sovereign Yield",
    aliases: COMMON_INSTRUMENT_ALIASES["UST:10Y"],
    sourceUrl: "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
  {
    id: "UST:2Y",
    label: "US 2Y",
    name: "US Treasury 2Y Par Yield",
    market: "UST",
    assetClass: "BOND_YIELD",
    currency: "USD",
    sector: "Sovereign Yield",
    aliases: COMMON_INSTRUMENT_ALIASES["UST:2Y"],
    sourceUrl: "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics",
    mappingStatus: "OFFICIAL_REFERENCE",
  },
] as const;

export const registryInstrument = (id: string) =>
  X2_INSTRUMENTS.find((i) => i.id.toUpperCase() === id.trim().toUpperCase());

function cleanToken(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function stripTickerSuffix(symbol: string): string {
  return symbol.replace(/-(EQ|BE|BZ|BL)$/i, "");
}

export type SearchableInstrument = {
  id: string;
  label?: string;
  symbol?: string;
  tradingSymbol?: string;
  name: string;
  market?: string;
  exchange?: string;
  assetClass?: string;
  segment?: string;
  currency?: string;
  sector?: string;
  token?: string;
  aliases?: readonly string[];
  expiry?: string | null;
  mappingStatus?: string;
  availabilityState?: InstrumentAvailabilityState;
};

/**
 * Deterministic canonical instrument scorer & ranker.
 * Tiers:
 *  100: Exact canonical ID (e.g. "NSE:HDFCBANK")
 *   96: Exact ticker/symbol (e.g. "HDFCBANK")
 *   92: Exact common alias (e.g. "HDFC" -> NSE:HDFCBANK, "SBI" -> NSE:SBIN, "RIL" -> NSE:RELIANCE)
 *   88: Exact display name (e.g. "HDFC BANK")
 *   78: Symbol or alias prefix (e.g. "HDFC...")
 *   68: Word-boundary name prefix (e.g. "STATE BANK...")
 *   55: All query tokens matched across id/symbol/name/aliases
 */
export function scoreCanonicalInstrument(
  rawQuery: string,
  item: SearchableInstrument,
): number {
  const q = cleanToken(rawQuery);
  if (!q) return 1;

  const id = cleanToken(item.id);
  const exch = cleanToken(item.market ?? item.exchange ?? id.split(":")[0] ?? "");
  const rawSym = cleanToken(
    item.symbol ?? item.label ?? id.split(":")[1] ?? item.id,
  );
  const sym = stripTickerSuffix(rawSym);
  const tradingSym = cleanToken(item.tradingSymbol ?? rawSym);
  const name = cleanToken(item.name);
  const baseName = cleanToken(item.name.replace(/\((NSE|BSE|MCX)[^)]*\)/gi, ""));
  const token = cleanToken(item.token ?? "");
  const aliases = [
    ...(item.aliases ?? []),
    ...(COMMON_INSTRUMENT_ALIASES[id] ?? []),
  ].map(cleanToken);

  const hasExplicitExch = q.includes(":");
  const qNorm = stripTickerSuffix(q);
  // Slight preference (+1) for primary NSE listing or dated MCX contract when no exchange prefix was typed
  const venueBonus =
    !hasExplicitExch && exch === "NSE"
      ? 1
      : !hasExplicitExch && item.mappingStatus !== "CONTRACT_SELECTION_REQUIRED"
        ? 0.5
        : 0;

  if (id === q || id === qNorm) return 100 + venueBonus;
  if (
    !hasExplicitExch &&
    (sym === qNorm || rawSym === q || tradingSym === q || (token && token === q))
  ) {
    return 96 + venueBonus;
  }
  if (aliases.some((a) => a === q || a === qNorm)) {
    return 92 + venueBonus;
  }
  if (baseName === q || name === q) {
    return 88 + venueBonus;
  }
  if (
    sym.startsWith(qNorm) ||
    rawSym.startsWith(q) ||
    tradingSym.startsWith(q) ||
    aliases.some((a) => a.startsWith(q))
  ) {
    return 78 + venueBonus;
  }
  const words = baseName.split(/[\s·()/-]+/).filter(Boolean);
  if (baseName.startsWith(q) || words.some((w) => w.startsWith(q))) {
    return 68 + venueBonus;
  }

  const haystack = `${id} ${sym} ${tradingSym} ${name} ${token} ${item.sector ?? ""} ${aliases.join(" ")}`.toUpperCase();
  const qTokens = q.split(/[\s:,-]+/).filter(Boolean);
  if (qTokens.length > 0 && qTokens.every((t) => haystack.includes(t))) {
    return 55 + venueBonus;
  }

  return 0;
}

export function searchCanonicalInstruments<T extends SearchableInstrument>(
  query: string,
  items: readonly T[],
  options: {
    limit?: number;
    market?: string;
    assetClass?: string;
  } = {},
): T[] {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const marketFilter =
    options.market && options.market !== "ALL"
      ? options.market.toUpperCase()
      : null;
  const classFilter =
    options.assetClass && options.assetClass !== "ALL"
      ? options.assetClass.toUpperCase()
      : null;

  const deduped = new Map<string, { item: T; score: number; index: number }>();
  items.forEach((item, index) => {
    const id = item.id.toUpperCase();
    const itemMarket = (
      item.market ??
      item.exchange ??
      id.split(":")[0] ??
      ""
    ).toUpperCase();
    const itemClass = (item.assetClass ?? item.segment ?? "").toUpperCase();

    if (marketFilter && itemMarket !== marketFilter) return;
    if (classFilter && itemClass !== classFilter) return;

    const score = scoreCanonicalInstrument(query, item);
    if (score <= 0) return;

    const existing = deduped.get(id);
    if (!existing || score > existing.score) {
      deduped.set(id, { item, score, index });
    }
  });

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
