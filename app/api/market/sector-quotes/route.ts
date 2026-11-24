import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError } from "../../../../backend/middleware/security";
import { account, rate } from "../../../../database/queries/repository";
import { completedResearchPrices } from "../../../../backend/services/market-data/history-prices";
import { readSharedDailyQuotes, sharedHistoryGrants } from "../../../../backend/services/market-data/shared-history";
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
      if (period !== "1W" && period !== "1M" && period !== "YTD")
        throw new HttpError(400, "Choose a sector and a historical period.");
      if (sectorId?.startsWith("INDUSTRY:")) {
        const industry = (await approvedIndustryGroups()).find((entry) => entry.id === sectorId);
        if (!industry) throw new HttpError(404, "This constituent group is unavailable.");
        const grants = (await sharedHistoryGrants()).filter((grant) => grant.provider === "INDIANAPI");
        const shared = await readSharedDailyQuotes(industry.constituents.map((stock) => stock.id), grants, Date.now(), period);
        const quotes = [...shared.values()].filter((quote) => quote.quality !== "STALE" && quote.pctChange !== null)
          .map(({ instrument, expiresAt, ...quote }) => { void instrument; void expiresAt; return quote; });
        return Response.json({ quotes, status: quotes.length ? null : "Comparable completed history is unavailable." }, { headers });
      }
      const sector = NSE_SECTOR_INDICES.find((row) => row.id === sectorId);
      if (!sector)
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
    const quotes = ids.flatMap((id) => {
      const sharedQuote = shared.get(id);
      if (!sharedQuote) return [];
      const { instrument: internal, expiresAt, ...details } = sharedQuote;
      void internal;
      void expiresAt;
      return [{ ...details, pctChange: sharedQuote.quality === "STALE" ? null : sharedQuote.pctChange }];
    });
    const industryQuotes = [...shared.values()].filter((value) => value.providerId === "INDIANAPI").map(({ instrument: internal, expiresAt, ...quote }) => {
      void internal;
      void expiresAt;
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
