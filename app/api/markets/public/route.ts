import { aggregateReferences } from "../../../../backend/engines/chart-analytics";
import type {
  AssetResearch,
  Interval,
} from "../../../../backend/services/market-data/data-types";
import { registryInstrument } from "../../../../backend/services/market-data/instrument-registry";
import { loadOfficialReferences } from "../../../../backend/services/market-data/official-references";

export const dynamic = "force-dynamic";

const PUBLIC_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
  "X-Content-Type-Options": "nosniff",
};

function isPublicOfficialId(id: string): boolean {
  return (
    id.startsWith("ECB:") ||
    id.startsWith("UST:") ||
    id.startsWith("TREASURY:")
  );
}

/** Public, read-only official reference data (ECB daily FX and US Treasury daily yields).
 * Never reads private D1 user tables, layouts, watchlists, or commercial provider secrets.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");

    if (!id) {
      return Response.json(await loadOfficialReferences(), { headers: PUBLIC_HEADERS });
    }

    if (id.length > 80) {
      return Response.json(
        { error: "Invalid instrument identifier." },
        { status: 400, headers: PUBLIC_HEADERS },
      );
    }

    const rawInterval = params.get("interval") ?? "1d";
    if (!["1d", "1wk", "1mo"].includes(rawInterval)) {
      return Response.json(
        { error: "Unsupported chart interval." },
        { status: 400, headers: PUBLIC_HEADERS },
      );
    }
    const interval = rawInterval as Interval;

    if (!isPublicOfficialId(id)) {
      const info = registryInstrument(id);
      const asset: AssetResearch = {
        schemaVersion: "x2-data-1",
        id,
        name: info?.name ?? id,
        instrument: null,
        provider: "Sign in required",
        sourceUrl: info?.sourceUrl ?? "",
        state: "UNAVAILABLE",
        asOf: new Date().toISOString(),
        retrievedAt: null,
        unit: "Unavailable",
        currency: "",
        interval,
        pointInTime: false,
        references: [],
        candles: [],
        fundamentals: [],
        statements: [],
        events: [],
        options: [],
        capabilities: {
          chart: false,
          candles: false,
          volume: false,
          fundamentals: false,
          events: false,
          options: false,
          analysis: false,
          storage: false,
        },
        limitations: [
          "Sign in to inspect workspace instrument mappings or save chart layouts.",
          "Commercial NSE/BSE/MCX and global equity feeds require configured provider credentials and entitlements.",
        ],
      };
      return Response.json(
        {
          asset,
          layout: {
            version: 0,
            payload: { mode: "line", interval, indicators: [], drawings: [] },
            updatedAt: null,
          },
          publicOnly: true,
        },
        { headers: PUBLIC_HEADERS },
      );
    }

    const m = await loadOfficialReferences();
    const q = [...m.quotes, ...m.yields].find((p) => p.id === id);
    const h = m.fxHistory.find((p) => p.id === id);
    if (!q) {
      return Response.json(
        { error: "Official reference instrument not found." },
        { status: 404, headers: PUBLIC_HEADERS },
      );
    }

    const asset: AssetResearch = {
      schemaVersion: "x2-data-1",
      id,
      name: q.label,
      instrument: null,
      provider: q.provider,
      sourceUrl: q.sourceUrl,
      state: q.state,
      asOf: m.asOf,
      retrievedAt: q.retrievedAt,
      unit: q.unit,
      currency: q.currency,
      interval,
      pointInTime: false,
      references: h
        ? aggregateReferences(h.points, interval)
        : q.value === null
          ? []
          : [{ date: q.sourceDate!, close: q.value, knownAt: q.retrievedAt! }],
      candles: [],
      fundamentals: [],
      statements: [],
      events: [],
      options: [],
      capabilities: {
        chart: !!h,
        candles: false,
        volume: false,
        fundamentals: false,
        events: false,
        options: false,
        analysis: !!h && h.canAnalyze,
        derivedDisplay: !!h && h.canAnalyze,
        storage: false,
      },
      limitations: [
        "Daily references, not executable quotes.",
        ...(interval === "1d"
          ? []
          : [
              "Calendar groups use the last available source reference; the latest group may be partial, not a completed period.",
            ]),
        "Sign in to save private chart layouts and run stored Soul Scans.",
      ],
    };

    return Response.json(
      {
        asset,
        layout: {
          version: 0,
          payload: { mode: "line", interval, indicators: [], drawings: [] },
          updatedAt: null,
        },
        publicOnly: true,
      },
      { headers: PUBLIC_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Official market sources are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
