import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError } from "../../../../backend/middleware/security";
import { account, rate } from "../../../../database/queries/repository";
import { gatewayQuotes, MarketGatewayError } from "../../../../backend/services/market-data/angelone/gateway";
import type { NormalizedMarketQuote } from "../../../../backend/services/market-data/angelone/types";
import { completedResearchPrices } from "../../../../backend/services/market-data/history-prices";
import { readSharedDailyQuotes, sharedHistoryGrants } from "../../../../backend/services/market-data/shared-history";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import { approvedIndustryGroups } from "../../../../backend/services/market-data/industry-heatmap";
import { NSE_SECTOR_INDICES } from "../../../../backend/services/market-data/sectors-and-ecosystem";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getAuthenticatedUser(request);
    const current = user ? await account(user.userId) : null;
    if (!user || current?.adult_confirmed !== 1 || current.consent_version !== "2026-11-14-v4")
      return Response.json({ quotes: [], status: "Sign in for available sector quotes." }, { headers });
    await rate(user.userId + ":sector-quotes", 12, 60_000);
    const params = new URL(request.url).searchParams;
    const period = params.get("period") ?? "1D";
    const sectorId = params.get("sector");
    if (period !== "1D") {
      const sector = NSE_SECTOR_INDICES.find((row) => row.id === sectorId);
      if (!sector || !["1W", "1M", "YTD"].includes(period))
        throw new HttpError(400, "Choose a sector and a historical period.");
      const quotes = [];
      for (const id of [sector.id, ...sector.constituents.map((stock) => stock.id)]) {
        const data = await completedResearchPrices(id, user.userId);
        const latest = data.series.at(-1);
        if (!latest) continue;
        const end = Date.parse(latest.date);
        const start = period === "YTD" ? latest.date.slice(0, 4) + "-01-01"
          : new Date(end - (period === "1W" ? 7 : 31) * 86_400_000).toISOString().slice(0, 10);
        const base = data.series.findLast((bar) => period === "YTD" ? bar.date < start : bar.date <= start);
        if (!base || base.close <= 0 || latest.close <= 0 ||
            Date.parse(start) - Date.parse(base.date) > 10 * 86_400_000) continue;
        quotes.push({
          id, value: latest.close, pctChange: (latest.close / base.close - 1) * 100,
          unit: data.currency, provider: data.source, timestamp: null, quality: data.basis,
          latestDate: latest.date, referenceDate: base.date, volume: null, change: latest.close - base.close,
        });
      }
      return Response.json({ quotes, status: quotes.length ? null : "Historical coverage unavailable for this sector and period." }, { headers });
    }
    const groups = await approvedIndustryGroups();
    const standardIds = [...new Set(NSE_SECTOR_INDICES.flatMap((sector) => [
      sector.id, ...sector.constituents.map((stock) => stock.id),
    ]))];
    const ids = [...new Set([...standardIds, ...groups.flatMap((group) => group.constituents.map((stock) => stock.id))])];
    const grants = await sharedHistoryGrants();
    const shared = await readSharedDailyQuotes(ids, grants);
    const result: NormalizedMarketQuote[] = [];
    for (let offset = 0; isDataOwner(user.userId) && offset < standardIds.length; offset += 20) {
      try {
        const batch = await gatewayQuotes({
          authenticated: true, isOwner: isDataOwner(user.userId), ids: standardIds.slice(offset, offset + 20),
          requestUrl: request.url,
        });
        if (batch.sourceMode === "DEMO_SYNTHETIC") break;
        result.push(...batch.quotes.filter((quote) => quote.sourceMode !== "DEMO_SYNTHETIC"));
      } catch (error) {
        if (error instanceof MarketGatewayError &&
            ["PUBLIC_LICENSE_REQUIRED", "BROKER_AUTH_FAILED", "RATE_LIMITED"].includes(error.code)) break;
        if (!result.length) break;
      }
    }
    const privateQuotes = new Map(result.filter((quote) => quote.ltp !== null).map((quote) => [quote.id, {
      id: quote.id, value: quote.ltp, pctChange: quote.changePct, unit: quote.unit,
      provider: "Private exchange data", timestamp: quote.exchangeTimestampUTC, quality: quote.qualityLabel,
      volume: quote.volume, change: quote.change,
    }]));
    const quotes = ids.flatMap((id) => {
      const privateQuote = privateQuotes.get(id);
      if (privateQuote) return [privateQuote];
      const sharedQuote = shared.get(id);
      if (!sharedQuote) return [];
      const { instrument: internal, ...details } = sharedQuote;
      void internal;
      return [{ ...details, pctChange: sharedQuote.quality === "STALE" ? null : sharedQuote.pctChange }];
    });
    const industryQuotes = [...shared.values()].map(({ instrument: internal, ...quote }) => {
      void internal;
      return { ...quote, pctChange: quote.quality === "STALE" ? null : quote.pctChange };
    });
    return Response.json({
      quotes, groups, industryQuotes,
      status: quotes.some((quote) => quote.pctChange !== null) ? null : "Sector quotes unavailable for this workspace.",
    }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Sector quotes unavailable." },
      { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
