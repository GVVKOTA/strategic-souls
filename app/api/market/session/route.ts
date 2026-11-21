import { gatewaySessionStatus } from "../../../../backend/services/market-data/angelone/gateway";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function GET(): Response {
  return Response.json(gatewaySessionStatus(), { status: 200, headers: HEADERS });
}
