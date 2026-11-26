import { HttpError } from "../../../../backend/middleware/security";
import { requireMarketAccess } from "../../../../backend/services/market-data/market-access";
import { companyReports } from "../../../../backend/services/market-data/company-reports";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireMarketAccess(request, "company-reports", 12);
    const instrument = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^NSE:[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(instrument)) throw new HttpError(400, "Choose an NSE equity.");
    return Response.json(await companyReports(instrument), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Company reports are temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
