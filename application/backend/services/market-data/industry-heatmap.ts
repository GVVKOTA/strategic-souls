import { niftyUniverse } from "./nifty-500";
import type { NseSectorIndex } from "./sectors-and-ecosystem";

export async function approvedIndustryGroups() {
  const snapshot = await niftyUniverse();
  if (!snapshot) return [];
  const industries = new Map<string, NseSectorIndex["constituents"][number][]>();
  for (const row of snapshot.constituents) {
    const key = row.industry;
    const stocks = industries.get(key) ?? [];
    stocks.push({ id: row.id, symbol: row.id.slice(4), name: row.name, weightApproxNote: "Equal area" });
    industries.set(key, stocks);
  }
  return [...industries].sort(([a], [b]) => a.localeCompare(b)).map(([name, constituents], index): NseSectorIndex => ({
    groupType: "industry", id: "INDUSTRY:" + snapshot.version.slice(0, 10) + ":" + index, indexSymbol: name,
    name, shortName: name, description: "Equal-weighted change of constituents with matching completed sessions.",
    reviewDate: snapshot.effectiveDate, sourceName: "Nifty 500 constituent classifications",
    sourceUrl: "https://www.niftyindices.com/indices/equity/broad-based-indices/nifty-500",
    constituents, macroDrivers: [],
  }));
}
