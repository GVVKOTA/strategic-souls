export type GlobalView = "DASHBOARD" | "INTELLIGENCE" | "HEATMAP" | "GLOBE_FOCUS" |
  "PORTFOLIO" | "WATCHLISTS" | "MARKET_EXPLORER" | "COMPARE" | "MOVERS" | "PRICE_ALERTS";
export type IntelligenceSubView = "HEADLINES" | "CALENDAR" | "MARKET_VOX";

type MenuItem = { id: GlobalView; label: string; sub?: IntelligenceSubView };

export const GLOBAL_MENU_ITEMS: readonly { label: string; items: readonly MenuItem[] }[] = [
  { label: "Market Overview", items: [
    { id: "DASHBOARD", label: "Strategic Dashboard" },
    { id: "MARKET_EXPLORER", label: "Market Explorer" },
    { id: "HEATMAP", label: "Sector Heatmap" },
    { id: "COMPARE", label: "Asset Comparison" },
    { id: "MOVERS", label: "Market Movers & Breadth" },
  ] },
  { label: "Global Intelligence", items: [
    { id: "GLOBE_FOCUS", label: "Strategic Globe" },
    { id: "INTELLIGENCE", sub: "HEADLINES", label: "Market Intelligence" },
    { id: "INTELLIGENCE", sub: "CALENDAR", label: "Economic Calendar" },
    { id: "INTELLIGENCE", sub: "MARKET_VOX", label: "Market Vox" },
  ] },
  { label: "Personal Workspace", items: [
    { id: "PORTFOLIO", label: "My Portfolio" },
    { id: "WATCHLISTS", label: "Watchlist" },
    { id: "PRICE_ALERTS", label: "Price Alerts" },
  ] },
];

export function parseGlobalViewParam(raw: string | null | undefined): GlobalView {
  switch (raw?.trim().toLowerCase().replaceAll("_", "-")) {
    case "intelligence": case "news": case "calendar": case "market-vox": return "INTELLIGENCE";
    case "heatmap": case "sectors": return "HEATMAP";
    case "globe": case "globe-focus": case "strategic-globe": return "GLOBE_FOCUS";
    case "watchlist": case "watchlists": return "WATCHLISTS";
    case "portfolio": return "PORTFOLIO";
    case "market-explorer": case "market explorer": case "coverage": return "MARKET_EXPLORER";
    case "compare": case "asset-comparison": return "COMPARE";
    case "movers": case "breadth": return "MOVERS";
    case "price-alerts": return "PRICE_ALERTS";
    default: return "DASHBOARD";
  }
}

export function parseIntelligenceSubViewParam(raw: string | null | undefined): IntelligenceSubView {
  const tab = raw?.trim().toLowerCase().replaceAll("_", "-");
  if (tab === "calendar") return "CALENDAR";
  if (tab === "market-vox" || tab === "vox" || tab === "polls") return "MARKET_VOX";
  return "HEADLINES";
}

export function globalViewUrl(view: GlobalView, sub?: IntelligenceSubView) {
  const search = new URLSearchParams({ view: "global" });
  if (view !== "DASHBOARD") search.set("section", view.toLowerCase().replaceAll("_", "-"));
  if (view === "INTELLIGENCE" && sub) search.set("tab", sub.toLowerCase().replaceAll("_", "-"));
  return "/?" + search;
}
