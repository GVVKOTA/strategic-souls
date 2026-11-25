import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError, body, protectMutation } from "../../../../backend/middleware/security";
import { requireDataOwner } from "../../../../backend/services/market-data/data-service";
import { importNiftyUniverse, niftyUniverse } from "../../../../backend/services/market-data/nifty-500";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const active = await niftyUniverse();
    return Response.json({
      universe: "NIFTY_500",
      membership: active ? {
        version: active.version,
        effectiveDate: active.effectiveDate,
        count: active.constituents.length,
      } : null,
      scanReadiness: { owner: false, signedIn: false },
      eligibleHistory: null,
      eligibleTimeframes: [],
      status: active ? "BLOCKED_BY_DATA_RIGHTS" : "BLOCKED_BY_UNIVERSE",
    }, { headers });
  } catch {
    return Response.json({ universe: "NIFTY_500", status: "STATUS_UNAVAILABLE" }, { status: 503, headers });
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
    return Response.json({
      error: error instanceof HttpError ? error.message : "The universe snapshot could not be saved.",
    }, { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
