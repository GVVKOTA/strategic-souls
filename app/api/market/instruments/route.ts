import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { gatewaySearchInstruments } from "../../../../backend/services/market-data/angelone/gateway";
import type { ExchangeCode, SegmentType } from "../../../../backend/services/market-data/angelone/types";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
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
    const limitRaw = Number(params.get("limit") ?? "15");

    if (!["NSE", "BSE", "MCX", "ALL"].includes(exchRaw)) {
      return Response.json(
        { error: "Invalid exchange filter. Use NSE, BSE, MCX, or ALL." },
        { status: 400, headers: HEADERS },
      );
    }
    if (!["EQUITY", "INDEX", "FUTURE", "ALL"].includes(segRaw)) {
      return Response.json(
        { error: "Invalid segment filter. Use EQUITY, INDEX, FUTURE, or ALL." },
        { status: 400, headers: HEADERS },
      );
    }

    const result = await gatewaySearchInstruments({
      isOwner: owner,
      q,
      exchange: exchRaw as ExchangeCode | "ALL",
      segment: segRaw as SegmentType | "ALL",
      limit: Number.isFinite(limitRaw) ? Math.max(1, Math.min(25, Math.round(limitRaw))) : 15,
      requestUrl: request.url,
    });
    return Response.json(
      {
        ...result,
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
