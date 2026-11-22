import {
  computeAssetComparison,
  computeCorrelationLab,
  type PriceObservation,
  type ReturnMethod,
} from "../../../backend/engines/analytics";
import { registryInstrument } from "../../../backend/services/market-data/instrument-registry";
import { marketSnapshot } from "../../../backend/services/market-data/market-data";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const idA = (url.searchParams.get("a") ?? "ECB:USDINR").trim().toUpperCase();
    const idB = (url.searchParams.get("b") ?? "ECB:EURUSD").trim().toUpperCase();
    const rawMethod = (url.searchParams.get("method") ?? "simple").toLowerCase();
    const method: ReturnMethod = rawMethod === "log" ? "log" : "simple";
    const rawWin = Number(url.searchParams.get("window") ?? 20);
    const rollingWindow: 20 | 60 | 120 =
      rawWin === 60 || rawWin === 120 ? rawWin : 20;

    const snapshot = await marketSnapshot();
    const available = snapshot.fxHistory.map((h) => ({
      id: h.id,
      label: h.label,
      currency: h.currency,
      source: h.provider,
      observations: h.points.length,
    }));

    const findSeries = (
      id: string,
    ): {
      id: string;
      label: string;
      currency: string;
      source: string;
      series: PriceObservation[];
    } => {
      const fx = snapshot.fxHistory.find((h) => h.id.toUpperCase() === id);
      if (fx) {
        return {
          id: fx.id,
          label: fx.label,
          currency: fx.currency,
          source: "European Central Bank (Daily Reference)",
          series: fx.points.map((p) => ({ date: p.date, close: p.close })),
        };
      }
      const reg = registryInstrument(id);
      return {
        id: reg?.id ?? id,
        label: reg?.name ?? id,
        currency: reg?.currency ?? "",
        source: "Licensed historical feed not connected",
        series: [],
      };
    };

    const assetA = findSeries(idA);
    const assetB = findSeries(idB);

    const comparison = computeAssetComparison({ assetA, assetB });
    const correlation = computeCorrelationLab({
      assetA,
      assetB,
      returnMethod: method,
      rollingWindow,
      minPairs: 30,
    });

    return json({
      asOfUTC: snapshot.asOf,
      availableSeries: available,
      comparison,
      correlation,
    });
  } catch {
    return json(
      { error: "Comparison and Correlation Lab data is temporarily unavailable." },
      503,
    );
  }
}
