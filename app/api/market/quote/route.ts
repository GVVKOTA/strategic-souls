import { HttpError } from "../../../../backend/middleware/security";
import { requireMarketAccess } from "../../../../backend/services/market-data/market-access";
import { readSharedDailyQuotes, sharedHistoryGrants } from "../../../../backend/services/market-data/shared-history";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    await requireMarketAccess(request, "market-quote", 45);
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = [...new Set(raw.split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];
    if (!ids.length || ids.length > 20 || ids.some((id) => !/^[A-Z0-9]+:[A-Z0-9._&^-]{1,60}$/.test(id)))
      throw new HttpError(400, "Choose one to 20 canonical instruments.");
    const fields = await readSharedDailyQuotes(ids, await sharedHistoryGrants());
    const quotes = Array.from(fields.values(), ({ instrument, ...quote }) => ({ ...quote, currency: instrument.currency }));
    return Response.json({ quotes, unavailable: ids.filter((id) => !fields.has(id)) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Market observations are temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
