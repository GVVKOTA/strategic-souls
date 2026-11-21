/**
 * Authoritative Angel One Instrument Master resolver.
 * Compound identity: exchange + segment + symbol + token.
 * - Never reuses NSE tokens for BSE or vice versa.
 * - Resolves unexpired dated MCX futures contracts with real expiry, lot size, and INR tick size.
 * - Caches OpenAPIScripMaster.json in memory (and optional local disk cache in Node adapter).
 */

import { COMMON_INSTRUMENT_ALIASES, scoreCanonicalInstrument } from "../instrument-registry";
import { paiseToRupees, parseAngelOneExpiry } from "./normalizer";
import type { ExchangeCode, InstrumentMasterEntry, SegmentType } from "./types";

export const SCRIP_MASTER_URL =
  "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";

export type RawScripMasterRow = {
  token?: string;
  symbol?: string;
  name?: string;
  expiry?: string;
  strike?: string;
  lotsize?: string;
  instrumenttype?: string;
  exch_seg?: string;
  tick_size?: string;
};

/**
 * Verified 2026-11-21 baseline tokens from official Angel One OpenAPIScripMaster.json.
 * Used as fast initial lookup & offline test fixture; refreshed automatically from live ScripMaster.
 */
export const VERIFIED_SEED_INSTRUMENTS: readonly InstrumentMasterEntry[] = Object.freeze([
  {
    id: "NSE:SBIN",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "SBIN-EQ",
    symbol: "SBIN",
    token: "3045",
    name: "State Bank of India (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "NSE:RELIANCE",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "RELIANCE-EQ",
    symbol: "RELIANCE",
    token: "2885",
    name: "Reliance Industries (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.1,
    instrumentType: "EQ",
  },
  {
    id: "NSE:TCS",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "TCS-EQ",
    symbol: "TCS",
    token: "11536",
    name: "Tata Consultancy Services (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.1,
    instrumentType: "EQ",
  },
  {
    id: "NSE:HDFCBANK",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "HDFCBANK-EQ",
    symbol: "HDFCBANK",
    token: "1333",
    name: "HDFC Bank (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.1,
    instrumentType: "EQ",
  },
  {
    id: "NSE:INFY",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "INFY-EQ",
    symbol: "INFY",
    token: "1594",
    name: "Infosys (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.1,
    instrumentType: "EQ",
  },
  {
    id: "NSE:ICICIBANK",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "ICICIBANK-EQ",
    symbol: "ICICIBANK",
    token: "4963",
    name: "ICICI Bank (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "NSE:BHARTIARTL",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "BHARTIARTL-EQ",
    symbol: "BHARTIARTL",
    token: "10604",
    name: "Bharti Airtel (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "NSE:ITC",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "ITC-EQ",
    symbol: "ITC",
    token: "1660",
    name: "ITC Limited (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "NSE:KOTAKBANK",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "KOTAKBANK-EQ",
    symbol: "KOTAKBANK",
    token: "1922",
    name: "Kotak Mahindra Bank (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "NSE:LT",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "LT-EQ",
    symbol: "LT",
    token: "11483",
    name: "Larsen & Toubro (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.1,
    instrumentType: "EQ",
  },
  {
    id: "NSE:AXISBANK",
    exchange: "NSE",
    segment: "EQUITY",
    tradingSymbol: "AXISBANK-EQ",
    symbol: "AXISBANK",
    token: "5900",
    name: "Axis Bank (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "NSE:NIFTY",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "Nifty 50",
    symbol: "NIFTY",
    token: "99926000",
    name: "NIFTY 50 Index (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "index points",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: null,
    instrumentType: "AMXIDX",
  },
  {
    id: "NSE:BANKNIFTY",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "Nifty Bank",
    symbol: "BANKNIFTY",
    token: "99926009",
    name: "NIFTY Bank Index (NSE)",
    mic: "XNSE",
    currency: "INR",
    unit: "index points",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: null,
    instrumentType: "AMXIDX",
  },
  {
    id: "BSE:HDFCBANK",
    exchange: "BSE",
    segment: "EQUITY",
    tradingSymbol: "HDFCBANK",
    symbol: "HDFCBANK",
    token: "500180",
    name: "HDFC Bank (BSE)",
    mic: "XBOM",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "BSE:SBIN",
    exchange: "BSE",
    segment: "EQUITY",
    tradingSymbol: "SBIN",
    symbol: "SBIN",
    token: "500112",
    name: "State Bank of India (BSE)",
    mic: "XBOM",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "BSE:RELIANCE",
    exchange: "BSE",
    segment: "EQUITY",
    tradingSymbol: "RELIANCE",
    symbol: "RELIANCE",
    token: "500325",
    name: "Reliance Industries (BSE)",
    mic: "XBOM",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: 0.05,
    instrumentType: "EQ",
  },
  {
    id: "BSE:SENSEX",
    exchange: "BSE",
    segment: "INDEX",
    tradingSymbol: "SENSEX",
    symbol: "SENSEX",
    token: "99919000",
    name: "BSE SENSEX Index",
    mic: "XBOM",
    currency: "INR",
    unit: "index points",
    timezone: "Asia/Kolkata",
    expiry: null,
    lotSize: 1,
    tickSize: null,
    instrumentType: "AMXIDX",
  },
  {
    id: "MCX:GOLD04DEC26FUT",
    exchange: "MCX",
    segment: "FUTURE",
    tradingSymbol: "GOLD04DEC26FUT",
    symbol: "GOLD",
    token: "495213",
    name: "MCX Gold Futures (04 Dec 2026)",
    mic: "XMCX",
    currency: "INR",
    unit: "INR per 10g (1 kg contract lot)",
    timezone: "Asia/Kolkata",
    expiry: "2026-12-04",
    lotSize: 1,
    tickSize: 1,
    instrumentType: "FUTCOM",
  },
  {
    id: "MCX:CRUDEOIL18DEC26FUT",
    exchange: "MCX",
    segment: "FUTURE",
    tradingSymbol: "CRUDEOIL18DEC26FUT",
    symbol: "CRUDEOIL",
    token: "576264",
    name: "MCX Crude Oil Futures (18 Dec 2026)",
    mic: "XMCX",
    currency: "INR",
    unit: "INR per barrel (100 bbl lot)",
    timezone: "Asia/Kolkata",
    expiry: "2026-12-18",
    lotSize: 100,
    tickSize: 1,
    instrumentType: "FUTCOM",
  },
]);

export const DEFAULT_OWNER_WATCH_IDS = [
  "NSE:NIFTY",
  "BSE:SENSEX",
  "NSE:HDFCBANK",
  "NSE:SBIN",
  "NSE:RELIANCE",
  "NSE:TCS",
  "NSE:INFY",
  "BSE:SBIN",
  "BSE:RELIANCE",
  "MCX:GOLD04DEC26FUT",
  "MCX:CRUDEOIL18DEC26FUT",
] as const;

function mcxContractUnit(rootSymbol: string, lotSize: number): string {
  const s = rootSymbol.toUpperCase();
  if (s === "GOLD" || s === "GOLDM" || s === "GOLDPETAL") {
    return `INR per 10g (lot ${lotSize})`;
  }
  if (s === "SILVER" || s === "SILVERM" || s === "SILVERMIC") {
    return `INR per kg (lot ${lotSize})`;
  }
  if (s === "CRUDEOIL" || s === "CRUDEOILM") {
    return `INR per barrel (lot ${lotSize})`;
  }
  if (s === "NATURALGAS" || s === "NATGASMINI") {
    return `INR per mmBtu (lot ${lotSize})`;
  }
  return `INR per MCX quote unit (lot ${lotSize})`;
}

export function normalizeScripMasterRow(
  row: RawScripMasterRow,
  nowMs = Date.now(),
): InstrumentMasterEntry | null {
  const exch = row.exch_seg?.trim().toUpperCase();
  if (exch !== "NSE" && exch !== "BSE" && exch !== "MCX") return null;

  const token = row.token?.trim() ?? "";
  const tradingSymbol = row.symbol?.trim() ?? "";
  const rootName = row.name?.trim().toUpperCase() ?? "";
  const instType = (row.instrumenttype ?? "").trim().toUpperCase();
  if (!token || !tradingSymbol || !rootName) return null;

  const lotRaw = Number(row.lotsize ?? "1");
  const lotSize = Number.isFinite(lotRaw) && lotRaw > 0 ? Math.round(lotRaw) : 1;
  const tickSize = paiseToRupees(row.tick_size);

  if (exch === "NSE") {
    if (instType === "AMXIDX") {
      const canonical =
        rootName === "NIFTY" && tradingSymbol === "Nifty 50"
          ? "NSE:NIFTY"
          : rootName === "BANKNIFTY" && tradingSymbol === "Nifty Bank"
            ? "NSE:BANKNIFTY"
            : `NSE:${rootName}`;
      return {
        id: canonical,
        exchange: "NSE",
        segment: "INDEX",
        tradingSymbol,
        symbol: rootName,
        token,
        name: `${tradingSymbol} Index (NSE)`,
        mic: "XNSE",
        currency: "INR",
        unit: "index points",
        timezone: "Asia/Kolkata",
        expiry: null,
        lotSize: 1,
        tickSize: null,
        instrumentType: instType,
      };
    }
    if (tradingSymbol.endsWith("-EQ") && !row.expiry) {
      return {
        id: `NSE:${rootName}`,
        exchange: "NSE",
        segment: "EQUITY",
        tradingSymbol,
        symbol: rootName,
        token,
        name: `${rootName} (NSE Equity)`,
        mic: "XNSE",
        currency: "INR",
        unit: "INR per share",
        timezone: "Asia/Kolkata",
        expiry: null,
        lotSize,
        tickSize,
        instrumentType: "EQ",
      };
    }
    return null;
  }

  if (exch === "BSE") {
    if (instType === "AMXIDX") {
      return {
        id: `BSE:${rootName}`,
        exchange: "BSE",
        segment: "INDEX",
        tradingSymbol,
        symbol: rootName,
        token,
        name: `${tradingSymbol} Index (BSE)`,
        mic: "XBOM",
        currency: "INR",
        unit: "index points",
        timezone: "Asia/Kolkata",
        expiry: null,
        lotSize: 1,
        tickSize: null,
        instrumentType: instType,
      };
    }
    if (!row.expiry && !instType && /^[A-Z0-9&.-]{1,24}$/i.test(tradingSymbol) && /^\d{6}$/.test(token)) {
      return {
        id: `BSE:${rootName}`,
        exchange: "BSE",
        segment: "EQUITY",
        tradingSymbol,
        symbol: rootName,
        token,
        name: `${rootName} (BSE Equity)`,
        mic: "XBOM",
        currency: "INR",
        unit: "INR per share",
        timezone: "Asia/Kolkata",
        expiry: null,
        lotSize,
        tickSize,
        instrumentType: "EQ",
      };
    }
    return null;
  }

  // MCX dated commodity futures ONLY (FUTCOM); never continuous/invented spot!
  if (exch === "MCX" && instType === "FUTCOM") {
    const expiry = parseAngelOneExpiry(row.expiry);
    if (!expiry) return null;
    if (Date.parse(`${expiry}T23:59:59+05:30`) < nowMs) return null; // skip expired contracts
    return {
      id: `MCX:${tradingSymbol.toUpperCase()}`,
      exchange: "MCX",
      segment: "FUTURE",
      tradingSymbol,
      symbol: rootName,
      token,
      name: `MCX ${rootName} Futures (${expiry})`,
      mic: "XMCX",
      currency: "INR",
      unit: mcxContractUnit(rootName, lotSize),
      timezone: "Asia/Kolkata",
      expiry,
      lotSize,
      tickSize,
      instrumentType: instType,
    };
  }

  return null;
}

export class InstrumentMaster {
  private byId = new Map<string, InstrumentMasterEntry>();
  private byExchangeToken = new Map<string, InstrumentMasterEntry>();
  private entries: InstrumentMasterEntry[] = [];
  private loadedAt: string | null = null;
  private rawRowCount = 0;

  constructor(seedEntries: readonly InstrumentMasterEntry[] = VERIFIED_SEED_INSTRUMENTS) {
    this.loadEntries(seedEntries, null, seedEntries.length);
  }

  private loadEntries(
    entries: readonly InstrumentMasterEntry[],
    loadedAt: string | null,
    rawRowCount: number,
  ): void {
    const nextById = new Map<string, InstrumentMasterEntry>();
    const nextByToken = new Map<string, InstrumentMasterEntry>();
    for (const entry of entries) {
      if (!nextById.has(entry.id)) {
        nextById.set(entry.id, entry);
      }
      nextByToken.set(`${entry.exchange}:${entry.token}`, entry);
    }
    // Always preserve verified seed identities if not overridden by newer ScripMaster
    for (const seed of VERIFIED_SEED_INSTRUMENTS) {
      if (!nextById.has(seed.id)) {
        nextById.set(seed.id, seed);
        nextByToken.set(`${seed.exchange}:${seed.token}`, seed);
      }
    }
    this.byId = nextById;
    this.byExchangeToken = nextByToken;
    this.entries = [...nextById.values()];
    this.loadedAt = loadedAt;
    this.rawRowCount = rawRowCount;
  }

  ingestRawRows(rows: readonly RawScripMasterRow[], nowMs = Date.now()): number {
    const normalized: InstrumentMasterEntry[] = [];
    for (const row of rows) {
      const entry = normalizeScripMasterRow(row, nowMs);
      if (entry) normalized.push(entry);
    }
    this.loadEntries(normalized, new Date(nowMs).toISOString(), rows.length);
    return normalized.length;
  }

  stats(): { totalIndexed: number; rawRowCount: number; loadedAt: string | null } {
    return {
      totalIndexed: this.entries.length,
      rawRowCount: this.rawRowCount,
      loadedAt: this.loadedAt,
    };
  }

  /**
   * Resolves a canonical ID (e.g. NSE:SBIN, BSE:SBIN, MCX:GOLD04DEC26FUT, MCX:GOLD -> nearest active dated contract).
   * Explicitly distinguishes NSE vs BSE tokens — never silently maps NSE token to BSE!
   */
  resolve(idOrQuery: string, nowMs = Date.now()): InstrumentMasterEntry | null {
    const clean = idOrQuery.trim().toUpperCase();
    if (!clean) return null;

    const exact = this.byId.get(clean);
    if (exact) return exact;

    const byToken = this.byExchangeToken.get(clean);
    if (byToken) return byToken;

    // Support MCX generic root lookup (e.g., MCX:GOLD, MCX:SILVER, MCX:CRUDEOIL) -> nearest active unexpired dated futures contract
    if (clean.startsWith("MCX:")) {
      const root = clean.slice(4);
      const candidates = this.entries
        .filter(
          (e) =>
            e.exchange === "MCX" &&
            e.segment === "FUTURE" &&
            e.symbol === root &&
            e.expiry !== null &&
            Date.parse(`${e.expiry}T23:59:59+05:30`) >= nowMs,
        )
        .sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));
      if (candidates.length > 0) return candidates[0];
    }

    // Support bare symbol or common alias lookup (e.g., "HDFCBANK", "HDFC", "SBI", "NSE:HDFC") when unambiguous
    if (!clean.includes(":")) {
      const nseDirect = this.byId.get(`NSE:${clean.replace(/-(EQ|BE)$/i, "")}`);
      if (nseDirect) return nseDirect;
      for (const [canonicalId, aliases] of Object.entries(COMMON_INSTRUMENT_ALIASES)) {
        if (aliases.some((a) => a.toUpperCase() === clean)) {
          const hit = this.byId.get(canonicalId);
          if (hit) return hit;
        }
      }
    } else if (clean === "NSE:HDFC") {
      return this.byId.get("NSE:HDFCBANK") ?? null;
    } else if (clean === "BSE:HDFC") {
      return this.byId.get("BSE:HDFCBANK") ?? null;
    }

    return null;
  }

  search(options: {
    q?: string;
    exchange?: ExchangeCode | "ALL";
    segment?: SegmentType | "ALL";
    limit?: number;
  }): InstrumentMasterEntry[] {
    const q = (options.q ?? "").trim();
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const exchange = options.exchange && options.exchange !== "ALL" ? options.exchange : null;
    const segment = options.segment && options.segment !== "ALL" ? options.segment : null;

    // Prioritize verified seed entries first when query is empty, otherwise score deterministically
    const ordered = [
      ...VERIFIED_SEED_INSTRUMENTS.map((s) => this.byId.get(s.id) ?? s),
      ...this.entries,
    ];
    const seen = new Set<string>();

    if (!q) {
      const matches: InstrumentMasterEntry[] = [];
      for (const item of ordered) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (exchange && item.exchange !== exchange) continue;
        if (segment && item.segment !== segment) continue;
        matches.push(item);
        if (matches.length >= limit) break;
      }
      return matches;
    }

    const scored: { item: InstrumentMasterEntry; score: number; index: number }[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (exchange && item.exchange !== exchange) continue;
      if (segment && item.segment !== segment) continue;
      const score = scoreCanonicalInstrument(q, item);
      if (score > 0) {
        scored.push({ item, score, index: i });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.slice(0, limit).map((s) => s.item);
  }
}
