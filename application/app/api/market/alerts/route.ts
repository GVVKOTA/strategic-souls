import { requireMarketAccess } from "../../../../backend/services/market-data/market-access";
import { listPriceAlerts, mutatePriceAlert } from "../../../../backend/services/market-data/price-alerts";
import { body, HttpError, protectMutation } from "../../../../backend/middleware/security";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const write = request.method === "POST";
    if (write) protectMutation(request, 4096);
    const subject = await requireMarketAccess(request, write ? "price-alert-write" : "price-alert-read", write ? 20 : 60);
    const value = write ? await mutatePriceAlert(subject, await body(request, 4096)) : await listPriceAlerts(subject);
    return Response.json(value, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Price alerts are temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
export const GET = handle;
export const POST = handle;
