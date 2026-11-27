import { aggregateCandles, aggregateReferences } from "../../../../backend/engines/chart-analytics";
import {
  SHARED_HISTORY_LABEL,
  type AssetResearch,
  type Interval,
} from "../../../../backend/services/market-data/data-types";
import { registryInstrument } from "../../../../backend/services/market-data/instrument-registry";
import { loadOfficialReferences } from "../../../../backend/services/market-data/official-references";
import {
  eligibleSharedPeriods,
  hasSharedDerivedRights,
  hasSharedDisplayRights,
  readSharedHistory,
  sharedHistoryGrants,
} from "../../../../backend/services/market-data/shared-history";

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
      if (!/^[A-Z0-9^._:&-]{3,80}$/i.test(id)) {
        return Response.json(
          { error: "Invalid instrument identifier." },
          { status: 400, headers: PUBLIC_HEADERS },
        );
      }
      const nowMs = Date.now();
      const grants = await sharedHistoryGrants(nowMs, "display").catch(() => []);
      const stored = grants.length
        ? await readSharedHistory(id, interval, grants, { now: nowMs, requireDisplay: true }).catch(() => null)
        : null;
      if (stored) {
        const priceOnly = stored.prices;
        const retained = eligibleSharedPeriods(stored.candles, stored.instrument, interval, nowMs);
        const grouped = interval === "1wk" || interval === "1mo";
        const references = grouped ? aggregateReferences(retained, interval) : retained;
        const candles = grouped
          ? aggregateCandles(retained, interval).map((bar, index) => ({ ...bar, date: references[index].date }))
          : retained;
        const receivedAt = new Date(stored.row.received_at).toISOString();
        const dailyPrices = priceOnly
          ? eligibleSharedPeriods(priceOnly, stored.instrument, interval, nowMs).map(({ date, close }) => ({
              date,
              close,
              knownAt: receivedAt,
            }))
          : null;
        const priceReferences = dailyPrices && (grouped ? aggregateReferences(dailyPrices, interval) : dailyPrices);
        const attribution = {
          label: stored.config.sharedHistory.attribution,
          url: stored.config.sharedHistory.attributionUrl,
        };
        const { providerSymbol: internalMapping, ...publicMapping } = stored.instrument;
        void internalMapping;
        const displayPermitted = hasSharedDisplayRights(stored.config, nowMs);
        const cacheSeconds = stored.config.rights.cacheSeconds;
        const responseHeaders =
          cacheSeconds > 0
            ? {
                "Cache-Control": `public, max-age=${Math.min(60, cacheSeconds)}, stale-while-revalidate=${Math.min(120, cacheSeconds * 2)}`,
                "X-Content-Type-Options": "nosniff",
              }
            : {
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
              };
        const asset: AssetResearch = {
          schemaVersion: "x2-data-1",
          id,
          name: stored.instrument.name,
          instrument: { ...publicMapping, providerSymbol: stored.instrument.symbol },
          provider: attribution.label || SHARED_HISTORY_LABEL,
          sourceUrl: attribution.url,
          attribution,
          state: stored.state,
          asOf: receivedAt,
          retrievedAt: receivedAt,
          unit: stored.instrument.unit,
          currency: stored.instrument.currency,
          interval,
          pointInTime: false,
          references: priceReferences ?? candles.map(({ date, close, knownAt }) => ({ date, close, knownAt })),
          candles,
          fundamentals: [],
          statements: [],
          events: [],
          options: [],
          coverage: { firstDate: stored.row.first_event, lastDate: stored.row.last_event, bars: stored.row.bar_count },
          capabilities: {
            chart: displayPermitted && Boolean(priceReferences?.length || candles.length),
            candles: candles.length > 0,
            volume: candles.some((bar) => bar.volume !== null),
            fundamentals: false,
            events: false,
            options: false,
            analysis: hasSharedDerivedRights(stored.config, nowMs),
            derivedDisplay: hasSharedDerivedRights(stored.config, nowMs),
            storage: true,
          },
          limitations: [
            "Completed exchange observations from shared server cache. Source timestamps are retained.",
            ...(priceOnly ? ["Daily closing price and volume only; open/high/low candles are not fabricated."] : []),
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
          { headers: responseHeaders },
        );
      }

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
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "markets_public_unavailable",
        route: "/api/markets/public",
        errorClass: err instanceof Error ? err.name : "UnexpectedError",
      }),
    );
    return Response.json(
      { error: "Official market sources are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }
}
