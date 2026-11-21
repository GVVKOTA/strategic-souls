import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { gatewayHealth } from "../../../../backend/services/market-data/angelone/gateway";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    const owner = user ? isDataOwner(user.userId) : false;
    const health = await gatewayHealth({
      isOwner: owner,
      requestUrl: request.url,
    });
    return Response.json(health, { status: 200, headers: HEADERS });
  } catch {
    return Response.json(
      {
        ok: false,
        provider: "Angel One SmartAPI (Read-Only)",
        errorCode: "UPSTREAM_ERROR",
        message: "Market-data health check unavailable.",
        serverTimestampUTC: new Date().toISOString(),
      },
      { status: 503, headers: HEADERS },
    );
  }
}
