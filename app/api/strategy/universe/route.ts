import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { requireDataOwner } from "../../../../backend/services/market-data/data-service";
import { importNiftyUniverse, niftyUniverse } from "../../../../backend/services/market-data/nifty-500";
import { body, HttpError, protectMutation } from "../../../../backend/middleware/security";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(request);
}
export async function PUT(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getAuthenticatedUser(request);
    requireDataOwner(user?.userId ?? "");
    await rate(user!.userId + ":nifty-universe", 10, 60_000);
    if (request.method === "PUT") {
      protectMutation(request, 200_000);
      return Response.json(await importNiftyUniverse(await body(request, 200_000)), { headers });
    }
    const active = await niftyUniverse();
    return Response.json({ active: active && {
      version: active.version, effectiveDate: active.effectiveDate, validatedAt: active.validatedAt,
      provenance: active.provenance, rightsExpiresAt: active.rightsExpiresAt, count: active.constituents.length,
    } }, { headers });
  } catch (err) {
    return Response.json(
      { error: err instanceof HttpError ? err.message : "The universe snapshot is unavailable." },
      { status: err instanceof HttpError ? err.status : 503, headers },
    );
  }
}
