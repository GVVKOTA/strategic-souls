/** Identity/discovery registry, never a quote or entitlement assertion. Exact contracts come from owner-verified source mapping. */
export const X2_INSTRUMENTS = [
  {
    id: "NSE:NIFTY",
    label: "NIFTY 50",
    name: "NIFTY 50",
    market: "NSE",
    assetClass: "INDEX",
    sourceUrl:
      "https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY-50",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:BANKNIFTY",
    label: "NIFTY Bank",
    name: "NIFTY Bank",
    market: "NSE",
    assetClass: "INDEX",
    sourceUrl:
      "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "BSE:SENSEX",
    label: "SENSEX",
    name: "BSE SENSEX",
    market: "BSE",
    assetClass: "INDEX",
    sourceUrl: "https://www.bseindia.com/sensex/Index_Overview.html",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:SBIN",
    label: "SBIN",
    name: "State Bank of India",
    market: "NSE",
    assetClass: "EQUITY",
    sourceUrl:
      "https://www.nseindia.com/get-quote/equity/SBIN/State-Bank-of-India",
    mappingStatus: "IDENTITY_ONLY",
  },
  {
    id: "NSE:RELIANCE",
    label: "RELIANCE",
    name: "Reliance Industries",
    market: "NSE",
    assetClass: "EQUITY",
    sourceUrl:
      "https://www.nseindia.com/get-quote/equity/RELIANCE/Reliance-Industries-Limited",
    mappingStatus: "IDENTITY_ONLY",
  },
  ...[
    ["GOLD", "Gold"],
    ["SILVER", "Silver"],
    ["CRUDEOIL", "Crude oil"],
  ].map(([label, name]) => ({
    id: "MCX:" + label,
    label,
    name: "MCX " + name + " · select contract",
    market: "MCX",
    assetClass: "FUTURE",
    sourceUrl: "https://www.mcxindia.com/market-data/contract-specifications",
    mappingStatus: "CONTRACT_SELECTION_REQUIRED",
  })),
  ...[
    [
      "SPX",
      "S&P 500",
      "https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
    ],
    ["NDX", "Nasdaq-100", "https://www.nasdaq.com/market-activity/index/ndx"],
    [
      "IXIC",
      "Nasdaq Composite",
      "https://www.nasdaq.com/market-activity/index/comp",
    ],
    [
      "DJI",
      "Dow Jones Industrial Average",
      "https://www.spglobal.com/spdji/en/indices/equity/dow-jones-industrial-average/",
    ],
    ["FTSE", "FTSE 100", "https://www.lseg.com/en/ftse-russell/indices/uk"],
    ["DAX", "DAX", "https://www.stoxx.com/index-details?symbol=DAX"],
    ["N225", "Nikkei 225", "https://indexes.nikkei.co.jp/en/nkave"],
    ["HSI", "Hang Seng", "https://www.hsi.com.hk/eng/indexes/all-indexes/hsi"],
    [
      "SSE",
      "Shanghai Composite",
      "https://english.sse.com.cn/markets/indices/overview/",
    ],
  ].map(([label, name, sourceUrl]) => ({
    id: "GLOBAL:" + label,
    label,
    name,
    market: "GLOBAL",
    assetClass: "INDEX",
    sourceUrl,
    mappingStatus: "IDENTITY_ONLY",
  })),
] as const;
export const registryInstrument = (id: string) =>
  X2_INSTRUMENTS.find((i) => i.id === id);
