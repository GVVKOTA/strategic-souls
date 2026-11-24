import { marketAccess } from "../../../../backend/services/market-data/market-access";
import { hasReadySharedHistory, sharedHistoryGrants } from "../../../../backend/services/market-data/shared-history";
import { niftyUniverse } from "../../../../backend/services/market-data/nifty-500";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const serverTimestampUTC = new Date().toISOString();
  try {
    const subject = await marketAccess(request);
    if (!subject)
      return Response.json({ availability: "SIGN_IN_REQUIRED", intervals: [], serverTimestampUTC }, { headers });
    const [membership, grants] = await Promise.all([niftyUniverse(), sharedHistoryGrants()]);
    const configured = grants.filter(({ provider }) => provider === "INDIANAPI");
    const hasSource = configured.length > 0;
    const current = Boolean(membership && hasSource &&
      await hasReadySharedHistory(configured, "1d", membership.constituents.map(({id}) => id)));
    return Response.json({
      availability: current ? "OBSERVATIONS_AVAILABLE" : !membership ? "CONSTITUENTS_UNAVAILABLE"
        : hasSource ? "HISTORY_PENDING" : "ENTITLEMENT_REQUIRED",
      constituentCount: membership?.constituents.length ?? null,
      effectiveDate: membership?.effectiveDate ?? null,
      intervals: current ? ["1d", "1wk", "1mo"] : [],
      serverTimestampUTC,
    }, { headers });
  } catch {
    return Response.json({ availability: "TEMPORARILY_UNAVAILABLE", intervals: [], serverTimestampUTC }, { status: 503, headers });
  }
}
