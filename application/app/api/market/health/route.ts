import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { gatewayHealth } from "../../../../backend/services/market-data/angelone/gateway";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import { sharedUniverseReadiness } from "../../../../backend/services/market-data/shared-history";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    const owner = user ? isDataOwner(user.userId) : false;
    const [health, shared] = await Promise.all([
      gatewayHealth({
        isOwner: owner,
        requestUrl: request.url,
      }),
      sharedUniverseReadiness().catch(() => null),
    ]);
    const accountType = !user ? "GUEST" : owner ? "OWNER" : "STANDARD_MEMBER";
    return Response.json(
      {
        ...health,
        accountType,
        sharedMarketData: shared
          ? {
              status: shared.status,
              reasonCode: shared.reasonCode,
              reason: shared.reason,
              rightsMode: shared.rightsMode,
              warming: shared.warming,
              sourceQuality: shared.sourceQuality,
              eligibleIntervals: shared.eligibleIntervals,
              latestEventDate: shared.latestEventDate,
              lastRefreshAt: shared.lastRefreshAt,
              nextRefreshAt: shared.nextRefreshAt,
              pausedUntil: shared.pausedUntil,
              attribution: shared.attribution,
              universe: shared.membership
                ? {
                    version: shared.membership.version,
                    effectiveDate: shared.membership.effectiveDate,
                    expectedCount: shared.membership.expectedCount,
                    distinctCount: shared.membership.distinctCount,
                  }
                : null,
              coverage: shared.coverage,
              ...(owner ? { providers: shared.providers } : {}),
            }
          : null,
      },
      { status: 200, headers: HEADERS },
    );
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
