/**
 * Strategic Souls X5.1 — Curated Obsidian Banner & Portfolio Backdrop Presets.
 * Used when Cloudflare R2 object storage is not configured (and always available as zero-latency defaults).
 */

export type BannerPreset = {
  readonly id: string;
  readonly name: string;
  readonly category: "Obsidian" | "Celestial" | "Quant Grid";
  readonly gradient: string;
  readonly accentLine: string;
};

export const DEFAULT_BANNER_ID = "b01";

export const BANNER_PRESETS: readonly BannerPreset[] = Object.freeze([
  {
    id: "b01",
    name: "Obsidian Horizon",
    category: "Obsidian",
    gradient:
      "radial-gradient(120% 90% at 15% 15%, #1d2633 0%, #101215 52%, #070809 100%)",
    accentLine: "rgba(118, 192, 255, 0.28)",
  },
  {
    id: "b02",
    name: "Emerald Terminal",
    category: "Quant Grid",
    gradient:
      "radial-gradient(110% 85% at 85% 20%, #10261e 0%, #0d1412 50%, #070809 100%)",
    accentLine: "rgba(110, 231, 183, 0.26)",
  },
  {
    id: "b03",
    name: "Eclipse Corona",
    category: "Celestial",
    gradient:
      "radial-gradient(circle at 50% 110%, #263140 0%, #12161c 46%, #070809 86%)",
    accentLine: "rgba(202, 211, 220, 0.28)",
  },
  {
    id: "b04",
    name: "Slate Strata",
    category: "Obsidian",
    gradient:
      "linear-gradient(135deg, #1b2028 0%, #111418 48%, #070809 100%)",
    accentLine: "rgba(148, 208, 255, 0.24)",
  },
  {
    id: "b05",
    name: "Deep Ocean Orbit",
    category: "Celestial",
    gradient:
      "radial-gradient(100% 120% at 80% 95%, #12283d 0%, #0d1520 50%, #070809 100%)",
    accentLine: "rgba(118, 192, 255, 0.32)",
  },
  {
    id: "b06",
    name: "Graphite Matrix",
    category: "Quant Grid",
    gradient:
      "linear-gradient(160deg, #171c22 0%, #101215 55%, #14221d 100%)",
    accentLine: "rgba(110, 231, 183, 0.22)",
  },
  {
    id: "b07",
    name: "Lunar Ridge",
    category: "Celestial",
    gradient:
      "radial-gradient(130% 80% at 25% 100%, #23272d 0%, #121519 52%, #070809 100%)",
    accentLine: "rgba(232, 237, 242, 0.22)",
  },
  {
    id: "b08",
    name: "Midnight Vector",
    category: "Obsidian",
    gradient:
      "linear-gradient(120deg, #070809 0%, #151c26 50%, #0f1f1a 100%)",
    accentLine: "rgba(110, 231, 183, 0.28)",
  },
]);

export const BANNER_IDS = new Set(BANNER_PRESETS.map((b) => b.id));

export function isValidBannerPresetId(value: unknown): value is string {
  return typeof value === "string" && BANNER_IDS.has(value.trim().toLowerCase());
}

export function resolveBannerPreset(id?: string | null): BannerPreset {
  const key = typeof id === "string" ? id.trim().toLowerCase() : DEFAULT_BANNER_ID;
  return BANNER_PRESETS.find((b) => b.id === key) ?? BANNER_PRESETS[0];
}
