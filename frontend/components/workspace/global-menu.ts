/**
 * Strategic Souls X5.3 — Canonical Global Workspace Navigation Contract.
 * Single source of truth for the exact 4-item three-dot Global menu and focused views.
 */

export type GlobalPrimaryMenuId =
  | "DASHBOARD"
  | "INTELLIGENCE"
  | "HEATMAP"
  | "GLOBE_FOCUS";

export type GlobalView =
  | GlobalPrimaryMenuId
  | "PORTFOLIO"
  | "WATCHLISTS"
  | "MARKET_EXPLORER";

export type IntelligenceSubView = "HEADLINES" | "CALENDAR" | "MARKET_VOX";

export type GlobalMenuItem = {
  readonly id: GlobalPrimaryMenuId;
  readonly label: string;
  readonly description: string;
};

/**
 * Exact 4-entry Global three-dot menu contract (X5.3 Section 03).
 * Preserve the destination IDs for deep links.
 */
export const GLOBAL_MENU_ITEMS: readonly GlobalMenuItem[] = Object.freeze([
  {
    id: "DASHBOARD",
    label: "Dashboard",
    description: "Markets & portfolio",
  },
  {
    id: "INTELLIGENCE",
    label: "Market Intelligence",
    description: "News & economic calendar",
  },
  {
    id: "HEATMAP",
    label: "Sector Heatmaps",
    description: "Sector performance & compare",
  },
  {
    id: "GLOBE_FOCUS",
    label: "Strategic Globe",
    description: "Events & world markets",
  },
]);

export function parseGlobalViewParam(raw: string | null | undefined): GlobalView {
  if (!raw) return "DASHBOARD";
  const norm = raw.trim().toLowerCase();
  if (norm === "intelligence" || norm === "news" || norm === "calendar" || norm === "market-vox") {
    return "INTELLIGENCE";
  }
  if (norm === "heatmap" || norm === "sectors") return "HEATMAP";
  if (norm === "globe" || norm === "globe_focus" || norm === "strategic-globe") {
    return "GLOBE_FOCUS";
  }
  if (norm === "portfolio") return "PORTFOLIO";
  if (norm === "watchlists" || norm === "watchlist") return "WATCHLISTS";
  if (norm === "market-explorer" || norm === "market explorer" || norm === "coverage") {
    return "MARKET_EXPLORER";
  }
  return "DASHBOARD";
}

export function parseIntelligenceSubViewParam(
  raw: string | null | undefined,
): IntelligenceSubView {
  if (!raw) return "HEADLINES";
  const norm = raw.trim().toLowerCase();
  if (norm === "calendar") return "CALENDAR";
  if (norm === "market-vox" || norm === "market_vox" || norm === "vox" || norm === "polls") {
    return "MARKET_VOX";
  }
  return "HEADLINES";
}
