import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError, body, protectMutation } from "../../../../backend/middleware/security";
import { isDataOwner, requireDataOwner } from "../../../../backend/services/market-data/data-service";
import { resolveGatewayConfig } from "../../../../backend/services/market-data/angelone/gateway";
import { importNiftyUniverse } from "../../../../backend/services/market-data/nifty-500";
import { sharedUniverseReadiness } from "../../../../backend/services/market-data/shared-history";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const owner = user ? isDataOwner(user.userId) : false;
    const readiness = await sharedUniverseReadiness();
    const gw = resolveGatewayConfig(undefined, request.url);
    const ownerBrokerReady = owner && gw.flags.enablePrivateBrokerData;
    const signedInReady = readiness.status === "READY";

    return Response.json(
      {
        universe: "NIFTY_500",
        name: "Nifty 500",
        membership: readiness.membership
          ? {
              version: readiness.membership.version,
              effectiveDate: readiness.membership.effectiveDate,
              expectedCount: readiness.membership.expectedCount,
              distinctCount: readiness.membership.distinctCount,
              count: readiness.membership.count,
              ...(owner
                ? {
                    validatedAt: readiness.membership.validatedAt,
                    rightsExpiresAt: readiness.membership.rightsExpiresAt,
                  }
                : {}),
            }
          : null,
        scanReadiness: {
          owner: signedInReady || ownerBrokerReady,
          signedIn: signedInReady,
        },
        coverage: readiness.coverage,
        eligibleHistory: readiness.coverage.ready > 0
          ? {
              readyCount: readiness.coverage.ready,
              staleCount: readiness.coverage.stale,
              unavailableCount: readiness.coverage.unavailable,
              latestEventDate: readiness.latestEventDate,
              sourceQuality: readiness.sourceQuality,
            }
          : null,
        eligibleTimeframes: readiness.eligibleIntervals,
        rightsMode: readiness.rightsMode,
        sourceQuality: readiness.sourceQuality,
        warming: readiness.warming,
        lastRefreshAt: readiness.lastRefreshAt,
        nextRefreshAt: readiness.nextRefreshAt,
        pausedUntil: readiness.pausedUntil,
        attribution: readiness.attribution,
        status: readiness.status,
        reasonCode: readiness.reasonCode,
        reason: readiness.reason,
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        universe: "NIFTY_500",
        name: "Nifty 500",
        status: "STATUS_UNAVAILABLE",
        reasonCode: "TRANSIENT_FAILURE",
      },
      { status: 503, headers },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new HttpError(401, "Sign in to manage snapshots.");
    requireDataOwner(user.userId);
    await rate(user.userId + ":nifty-universe", 10, 60_000);
    protectMutation(request, 200_000);
    return Response.json(await importNiftyUniverse(await body(request, 200_000)), { headers });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof HttpError ? error.message : "The universe snapshot could not be saved.",
      },
      { status: error instanceof HttpError ? error.status : 503, headers },
    );
  }
}
