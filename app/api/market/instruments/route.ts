import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { gatewaySearchInstruments } from "../../../../backend/services/market-data/angelone/gateway";
import type { ExchangeCode, SegmentType } from "../../../../backend/services/market-data/angelone/types";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import { niftyUniverse } from "../../../../backend/services/market-data/nifty-500";
import {
  X2_INSTRUMENTS,
  searchCanonicalInstruments,
} from "../../../../backend/services/market-data/instrument-registry";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    const owner = user ? isDataOwner(user.userId) : false;
    if (user) {
      await rate(`${user.userId}:market-inst`, 120, 60_000);
    }

    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 60);
    const exchRaw = (params.get("exchange") ?? "ALL").toUpperCase();
    const segRaw = (params.get("segment") ?? "ALL").toUpperCase();
    const limitRaw = Number(params.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(50, Math.round(limitRaw)))
      : 20;

    if (!["NSE", "BSE", "MCX", "GLOBAL", "ALL"].includes(exchRaw)) {
      return Response.json(
        { error: "Invalid exchange filter. Use NSE, BSE, MCX, GLOBAL, or ALL." },
        { status: 400, headers: HEADERS },
      );
    }
    if (!["EQUITY", "INDEX", "FUTURE", "ALL"].includes(segRaw)) {
      return Response.json(
        { error: "Invalid segment filter. Use EQUITY, INDEX, FUTURE, or ALL." },
        { status: 400, headers: HEADERS },
      );
    }

    const brokerExch =
      exchRaw === "NSE" || exchRaw === "BSE" || exchRaw === "MCX" ? exchRaw : "ALL";
    const [result, activeNifty] = await Promise.all([
      exchRaw === "GLOBAL"
        ? Promise.resolve({ source: "IDENTITY_SEED" as const, instruments: [] })
        : gatewaySearchInstruments({
            isOwner: owner,
            q,
            exchange: brokerExch as ExchangeCode | "ALL",
            segment: segRaw as SegmentType | "ALL",
            limit,
            requestUrl: request.url,
          }),
      exchRaw === "ALL" || exchRaw === "NSE"
        ? niftyUniverse().catch(() => null)
        : Promise.resolve(null),
    ]);

    // Combine broker master / seed matches with authorized Nifty 500 constituents and public X2_INSTRUMENTS identity catalogue
    const merged = searchCanonicalInstruments(
      q,
      [
        ...result.instruments.map((inst) => ({
          ...inst,
          label: inst.symbol,
          market: inst.exchange,
          assetClass: inst.segment,
          availabilityState:
            owner && result.source === "LIVE_MASTER"
              ? ("DATA_CONNECTED" as const)
              : ("IDENTIFIED_ONLY" as const),
        })),
        ...(activeNifty?.constituents.map((entry) => ({
          id: entry.id,
          exchange: "NSE" as ExchangeCode,
          segment: "EQUITY" as SegmentType,
          tradingSymbol: entry.id.slice(4),
          symbol: entry.id.slice(4),
          token: "",
          name: entry.name,
          mic: "XNSE",
          currency: "INR",
          unit: "INR per share",
          timezone: "Asia/Kolkata",
          expiry: null,
          lotSize: 1,
          tickSize: null,
          instrumentType: "EQUITY",
          label: entry.id.slice(4),
          market: "NSE",
          assetClass: "EQUITY",
          sector: entry.industry,
          aliases: [entry.id.slice(4), entry.name, entry.isin],
          mappingStatus: "OFFICIAL_CONSTITUENT",
          availabilityState: "IDENTIFIED_ONLY" as const,
        })) ?? []),
        ...X2_INSTRUMENTS.map((entry) => ({
          id: entry.id,
          exchange: entry.market as ExchangeCode,
          segment: entry.assetClass as SegmentType,
          tradingSymbol: entry.label,
          symbol: entry.label,
          token: "",
          name: entry.name,
          mic: entry.market === "NSE" ? "XNSE" : entry.market === "BSE" ? "XBOM" : entry.market === "MCX" ? "XMCX" : "GLOBAL",
          currency: entry.currency ?? "INR",
          unit: entry.assetClass === "INDEX" ? "index points" : "INR per unit",
          timezone: "Asia/Kolkata",
          expiry: entry.expiry ?? null,
          lotSize: entry.lotSize ?? 1,
          tickSize: entry.tickSize ?? null,
          instrumentType: entry.assetClass,
          label: entry.label,
          market: entry.market,
          assetClass: entry.assetClass,
          sector: entry.sector,
          aliases: entry.aliases,
          mappingStatus: entry.mappingStatus,
          availabilityState:
            entry.mappingStatus === "CONTRACT_SELECTION_REQUIRED"
              ? ("CONTRACT_SELECTION_REQUIRED" as const)
              : ("IDENTIFIED_ONLY" as const),
        })),
      ],
      {
        limit,
        market: exchRaw,
        assetClass: segRaw,
      },
    );

    return Response.json(
      {
        source: result.source,
        instruments: merged,
        totalReturned: merged.length,
        accessScope: owner ? "OWNER_PRIVATE" : "PUBLIC_IDENTITY_ONLY",
      },
      { status: 200, headers: HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Instrument search unavailable." },
      { status: 503, headers: HEADERS },
    );
  }
}
