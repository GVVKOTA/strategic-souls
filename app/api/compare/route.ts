import { getAuthenticatedUser } from "../../../backend/auth/session";
import { computeAssetComparison, computeCorrelationLab } from "../../../backend/engines/analytics";
import { instrumentRegistry } from "../../../backend/services/market-data/data-service";
import { OFFICIAL_FX_PAIRS } from "../../../backend/services/market-data/market-data";
import { completedResearchPrices as series } from "../../../backend/services/market-data/history-prices";
import { calendarPeriodKey } from "../../../backend/engines/chart-analytics";
import { COMMON_INSTRUMENT_ALIASES, type SearchableInstrument } from "../../../backend/services/market-data/instrument-registry";
import { niftyUniverse } from "../../../backend/services/market-data/nifty-500";
import { NSE_SECTOR_INDICES } from "../../../backend/services/market-data/sectors-and-ecosystem";
import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../../backend/middleware/security";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const periods: Record<string, number> = { "1W": 7, "1M": 31, "3M": 93, "6M": 186, "1Y": 366 };

async function catalog(subject: string) {
  const [registry, universe, watchlists] = await Promise.all([
    instrumentRegistry(subject || undefined),
    niftyUniverse(),
    subject ? database().prepare("SELECT payload FROM x1_records WHERE subject=? AND kind='watchlist' AND archived=0")
      .bind(subject).all<{ payload: string }>() : null,
  ]);
  const watchlist = new Set((watchlists?.results ?? []).flatMap((r) => {
    const items = (JSON.parse(r.payload) as { items?: string[] }).items;
    return Array.isArray(items) ? items : [];
  }));
  const rows = new Map<string, SearchableInstrument & { category: string; inWatchlist: boolean }>();
  const add = (row: SearchableInstrument, category: string) => rows.set(row.id, {
    ...row, category, inWatchlist: watchlist.has(row.id),
    aliases: COMMON_INSTRUMENT_ALIASES[row.id] ?? row.aliases,
  });
  for (const row of registry) {
    if (row.assetClass === "BOND_YIELD") continue; // Price-return tools require price series.
    if (rows.has(row.id)) continue;
    const category = row.assetClass === "FX" ? "Forex" : row.assetClass === "EQUITY" ? "Stocks"
      : row.assetClass === "INDEX" ? "Indices" : row.assetClass === "ETF" ? "ETFs" : "Commodities";
    add(row, category);
  }
  for (const pair of OFFICIAL_FX_PAIRS) {
    if (rows.has(pair.id)) continue;
    const label = pair.base + " / " + pair.quote;
    add({ id: pair.id, name: label, label, market: "FX", assetClass: "FX",
      currency: pair.quote, aliases: [pair.base + pair.quote] }, "Forex");
  }
  const broadIndices = [
    ["NSE:NIFTY100", "Nifty 100"], ["NSE:NIFTY200", "Nifty 200"], ["NSE:NIFTY500", "Nifty 500"],
    ["NSE:NIFTYMIDCAP150", "Nifty Midcap 150"], ["NSE:NIFTYSMALLCAP250", "Nifty Smallcap 250"],
  ] as const;
  for (const [id, name] of broadIndices) if (!rows.has(id)) add({
    id, name, label: name, market: "NSE", currency: "INR", assetClass: "INDEX",
    availabilityState: "ENTITLEMENT_REQUIRED",
  }, "Indices");
  for (const sector of NSE_SECTOR_INDICES) add({
    ...rows.get(sector.id), id: sector.id, market: "NSE", name: sector.name,
    label: sector.indexSymbol, currency: "INR", assetClass: "INDEX",
  }, "Sectors");
  for (const row of universe?.constituents ?? []) add({
    ...rows.get(row.id), id: row.id, label: row.id.slice(4), name: row.name,
    market: "NSE", currency: "INR", assetClass: "EQUITY", sector: row.industry,
  }, "Stocks");
  for (const id of watchlist) if (!rows.has(id)) add({
    id, name: id.split(":").at(-1) ?? id, market: id.split(":")[0],
  }, "Watchlist");
  return { instruments: [...rows.values()], universeVersion: universe?.version ?? null };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const user = await getAuthenticatedUser(request);
    const current = user ? await account(user.userId) : null;
    const subject = current?.adult_confirmed === 1 && current.consent_version === "2026-11-14-v4" ? user!.userId : "";
    if (subject) await rate(subject + ":cross-asset", 30, 60_000);
    if (params.get("catalog") === "1") return Response.json(await catalog(subject), { headers });

    const historyId = params.get("history")?.trim().toUpperCase();
    if (historyId) {
      if (!/^[A-Z0-9]+:[A-Z0-9&._-]{1,40}$/.test(historyId))
        throw new HttpError(400, "Choose a valid instrument.");
      if (!subject && !historyId.startsWith("ECB:"))
        throw new HttpError(401, "Sign in with workspace consent to use exchange history.");
      const asset = await series(historyId, subject);
      const from = params.get("from") ?? "";
      const to = params.get("to") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from >= to)
        throw new HttpError(400, "Enter a start date before the end date.");
      const observations = asset.series.filter((row) => row.date >= from && row.date <= to && row.close > 0);
      const first = observations.at(0), last = observations.at(-1);
      if (!first || !last || first.date === last.date)
        throw new HttpError(422, "At least two completed observations are required in this period.");
      return Response.json({
        label: asset.label, basis: asset.basis, source: asset.source, currency: asset.currency,
        from: first.date, to: last.date, startPrice: first.close, endPrice: last.close,
        returnPct: (last.close / first.close - 1) * 100,
      }, { headers });
    }

    const idA = (params.get("a") ?? "ECB:USDINR").trim().toUpperCase();
    const idB = (params.get("b") ?? "ECB:EURUSD").trim().toUpperCase();
    if (![idA, idB].every((id) => /^[A-Z0-9]+:[A-Z0-9&._-]{1,40}$/.test(id)))
      throw new HttpError(400, "Choose two valid instruments.");
    if (!subject && ![idA, idB].every((id) => id.startsWith("ECB:")))
      throw new HttpError(401, "Sign in with workspace consent to compare exchange instruments.");
    if ([idA, idB].some((id) => id.startsWith("UST:") || id.startsWith("TREASURY:")))
      throw new HttpError(400, "This price-return calculation requires two price series.");
    if (idA === idB) throw new HttpError(400, "Choose two different instruments.");
    const method = params.get("method") ?? "simple";
    const rollingWindow = Number(params.get("window") ?? 20);
    const period = params.get("period") ?? "3M";
    const frequency = params.get("frequency") ?? "1d";
    if ((method !== "simple" && method !== "log") || ![20, 60, 120].includes(rollingWindow) ||
      !(Object.hasOwn(periods, period) || period === "YTD") || !["1d", "1wk", "1mo"].includes(frequency))
      throw new HttpError(400, "Choose a supported period, observation frequency, and rolling window.");

    const [a, b] = await Promise.all([series(idA, subject), series(idB, subject)]);
    if (a.id === b.id) throw new HttpError(400, "Both selections resolve to the same instrument.");
    const end = [a.latestDate, b.latestDate].filter((date): date is string => date !== null).sort()[0]
      ?? new Date().toISOString().slice(0, 10);
    const start = period === "YTD" ? end.slice(0, 4) + "-01-01"
      : new Date(Date.parse(end) - periods[period] * 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const validDates = new Set(b.series.map((row) => row.date));
    const commonDates = a.series.filter((row) => row.date >= start && row.date <= end && validDates.has(row.date));
    const retained = new Set(frequency === "1d" ? commonDates.map((row) => row.date) : [
      ...new Map(commonDates.map((row) => [calendarPeriodKey(row.date, frequency as "1wk" | "1mo"), row.date])).entries(),
    ].filter(([key]) => key < calendarPeriodKey(today, frequency as "1wk" | "1mo")).map(([, date]) => date));
    const assetA = { ...a, series: a.series.filter((row) => retained.has(row.date)) };
    const assetB = { ...b, series: b.series.filter((row) => retained.has(row.date)) };
    const comparison = computeAssetComparison({ assetA, assetB });
    const correlation = computeCorrelationLab({
      assetA, assetB, returnMethod: method, rollingWindow: rollingWindow as 20 | 60 | 120, minPairs: 5,
    });
    const { series: _a, ...metadataA } = a;
    const { series: _b, ...metadataB } = b;
    void _a; void _b;
    return Response.json({
      asOfUTC: new Date().toISOString(), period, frequency, requestedStart: start,
      instruments: [metadataA, metadataB], comparison, correlation,
    }, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof HttpError ? error.message : "Comparison and Correlation Lab data is temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers },
    );
  }
}
