import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { gatewayHealth } from "../../../../backend/services/market-data/angelone/gateway";
import { account } from "../../../../database/queries/repository";
import { hasReadySharedHistory, sharedHistoryGrants } from "../../../../backend/services/market-data/shared-history";
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
    if (user && !owner) {
      const identity = await account(user.userId);
      const eligible = identity?.adult_confirmed === 1 && identity.consent_version === "2026-11-14-v4";
      const grants = eligible ? await sharedHistoryGrants() : [];
      const native = ["1d", "30m", "1h"] as const;
      const slots = await Promise.all(native.map(async (interval) => ({
        interval, available: await hasReadySharedHistory(grants, interval),
      })));
      const intervals = slots.filter(({ available }) => available).map(({ interval }) => interval);
      if (intervals.length) return Response.json({
        provider: "Market data", accessScope: "SHARED_LICENSED", availability: "READY",
        intervals, message: "Completed exchange history is available for this workspace.",
        serverTimestampUTC: health.serverTimestampUTC, serverTimestampIST: health.serverTimestampIST,
      }, { headers: HEADERS });
    }
    return Response.json(health, { status: 200, headers: HEADERS });
  } catch {
    return Response.json(
      {
        ok: false,
        provider: "Exchange Market Feed (Read-Only)",
        errorCode: "UPSTREAM_ERROR",
        message: "Market-data health check unavailable.",
        serverTimestampUTC: new Date().toISOString(),
      },
      { status: 503, headers: HEADERS },
    );
  }
}
