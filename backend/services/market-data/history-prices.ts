import type { PriceObservation } from "../../engines/analytics";
import { assetResearch } from "./data-service";
import { getIndianExchangeSession } from "./exchange-calendar";

export async function completedResearchPrices(id: string, subject: string) {
  const asset = await assetResearch(id, subject, "1d", false);
  const market = asset.instrument?.market;
  const exchange = market === "NSE" || market === "BSE" || market === "MCX" ? market : null;
  const now = Date.now();
  const session = exchange ? getIndianExchangeSession(exchange, now) : null;
  const today = session?.localDateIST ?? new Date(now).toISOString().slice(0, 10);
  const completed = asset.candles.filter((bar) => bar.date < today ||
    (bar.date === today && session?.state === "CLOSED" && !session.specialSessionNote &&
      session.localTimeIST >= (exchange === "MCX" ? "23:55:00" : "15:30:00")));
  const adjusted = asset.instrument?.type === "EQUITY" && completed.length > 0 &&
    completed.every((bar) => Number.isFinite(bar.adjustedClose) && (bar.adjustedClose ?? 0) > 0);
  const hasRights = asset.capabilities.chart && asset.capabilities.analysis && asset.capabilities.derivedDisplay;
  const observations: PriceObservation[] = !hasRights ? [] : asset.capabilities.candles
    ? completed.map((bar) => ({ date: bar.date, close: adjusted ? bar.adjustedClose! : bar.close }))
    : asset.references.map((row) => ({ date: row.date, close: row.close }));
  const basis = id.startsWith("ECB:") ? "Daily reference rates" : adjusted ? "Adjusted closes" : "Raw closes";
  return {
    id: asset.instrument?.id ?? asset.id, label: asset.name, currency: asset.currency,
    source: asset.provider, series: observations, basis, dataState: asset.state,
    retrievedAt: asset.retrievedAt, latestDate: observations.at(-1)?.date ?? null,
  };
}
