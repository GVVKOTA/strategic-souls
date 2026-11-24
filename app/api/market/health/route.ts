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
    const ids = membership?.constituents.map(({ id }) => id);
    const intervals = await Promise.all((["1d", "1wk", "1mo"] as const).map(async (interval) =>
      ids && hasSource && await hasReadySharedHistory(configured, interval, ids) ? interval : null));
    const current = intervals[0] !== null;
    return Response.json({
      availability: current ? "OBSERVATIONS_AVAILABLE" : !membership ? "CONSTITUENTS_UNAVAILABLE"
        : hasSource ? "HISTORY_PENDING" : "ENTITLEMENT_REQUIRED",
      constituentCount: membership?.constituents.length ?? null,
      effectiveDate: membership?.effectiveDate ?? null,
      intervals: intervals.filter(Boolean),
      fullDailyCoverage: !!ids && hasSource && await hasReadySharedHistory(configured, "1d", ids, "all"),
      serverTimestampUTC,
    }, { headers });
  } catch {
    return Response.json({ availability: "TEMPORARILY_UNAVAILABLE", intervals: [], serverTimestampUTC }, { status: 503, headers });
  }
}
