import { HttpError } from "../../../../backend/middleware/security";
import { requireMarketAccess } from "../../../../backend/services/market-data/market-access";
import { assetResearch } from "../../../../backend/services/market-data/data-service";
import type { Interval } from "../../../../backend/services/market-data/data-types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const intervals = new Set(["1d", "1wk", "1mo", "30m", "1h"]);

export async function GET(request: Request) {
  try {
    const subject = await requireMarketAccess(request, "market-candles", 30);
    const params = new URL(request.url).searchParams;
    const id = (params.get("id") ?? "").trim().toUpperCase();
    const interval = params.get("interval") ?? "1d";
    if (!/^[A-Z0-9]+:[A-Z0-9._&^-]{1,60}$/.test(id) || !intervals.has(interval))
      throw new HttpError(400, "Choose a valid instrument and history interval.");
    return Response.json(await assetResearch(id, subject, interval as Interval, false), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Market history is temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
