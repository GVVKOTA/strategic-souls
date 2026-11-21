import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { gatewaySearchInstruments } from "../../../../backend/services/market-data/angelone/gateway";
import type { ExchangeCode, SegmentType } from "../../../../backend/services/market-data/angelone/types";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
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
    const result =
      exchRaw === "GLOBAL"
        ? { source: "IDENTITY_SEED" as const, instruments: [] }
        : await gatewaySearchInstruments({
            isOwner: owner,
            q,
            exchange: brokerExch as ExchangeCode | "ALL",
            segment: segRaw as SegmentType | "ALL",
            limit,
            requestUrl: request.url,
          });

    // Combine broker master / seed matches with public X2_INSTRUMENTS identity catalogue, ranked deterministically
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
