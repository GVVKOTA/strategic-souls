import {
  getConflictIntelligence,
  type ConflictPeriod,
} from "../../../../backend/services/earth/conflicts";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
  "X-Content-Type-Options": "nosniff",
};

const VALID_PERIODS = new Set<ConflictPeriod>(["7d", "30d", "90d", "365d"]);

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const rawPeriod = (params.get("period") ?? "30d") as ConflictPeriod;
    if (!VALID_PERIODS.has(rawPeriod)) {
      return Response.json(
        { error: "Invalid period. Use 7d, 30d, 90d, or 365d." },
        { status: 400, headers: HEADERS },
      );
    }
    const country = (params.get("country") ?? "").trim().slice(0, 60);
    const category = (params.get("category") ?? "ALL").trim().slice(0, 40);
    const search = (params.get("q") ?? "").trim().slice(0, 80);

    const payload = await getConflictIntelligence({
      period: rawPeriod,
      country,
      category,
      search,
    });
    return Response.json(payload, { status: 200, headers: HEADERS });
  } catch {
    return Response.json(
      {
        status: "PROVIDER_ERROR",
        provider: null,
        events: [],
        hotspots: [],
        error: "Unable to load conflict intelligence right now.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
