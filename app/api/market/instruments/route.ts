import { instrumentRegistry } from "../../../../backend/services/market-data/data-service";
import { searchCanonicalInstruments } from "../../../../backend/services/market-data/instrument-registry";
import { marketAccess } from "../../../../backend/services/market-data/market-access";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const subject = await marketAccess(request);
    if (subject) await rate(subject + ":market-inst", 120, 60_000);
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 60);
    const market = (params.get("exchange") ?? "ALL").toUpperCase();
    const assetClass = (params.get("segment") ?? "ALL").toUpperCase();
    if (!["NSE", "BSE", "MCX", "GLOBAL", "ALL"].includes(market) ||
        !["EQUITY", "INDEX", "FUTURE", "ALL"].includes(assetClass))
      return Response.json({ error: "Choose a supported exchange and instrument type." }, { status: 400, headers });
    const requested = Number(params.get("limit") ?? "20");
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.round(requested))) : 20;
    const registry = await instrumentRegistry(subject ?? undefined);
    const instruments = searchCanonicalInstruments(q, registry, { limit, market, assetClass })
      .map((entry) => ({ ...entry, exchange: entry.market, segment: entry.assetClass,
        symbol: entry.label, tradingSymbol: entry.label }));
    return Response.json({ source: "INSTRUMENT_REGISTRY", accessScope: subject ? "LICENSED_RESEARCH" : "PUBLIC_IDENTITY_ONLY",
      instruments, totalReturned: instruments.length }, { headers });
  } catch {
    return Response.json({ error: "Instrument search unavailable." }, { status: 503, headers });
  }
}
