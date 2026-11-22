/**
 * Strategic Souls Post-X5.1 — Private Owner-Scoped D1 Persistence for:
 * - [11] Smart Search History (x52_search_history: recents, favorites, opt-out)
 * - [24] My Watch Regions (x52_watch_regions: followed region IDs, categories, last_seen_at)
 */

import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { COUNTRY_PROFILES } from "../intelligence/news-and-disasters";

export type SearchHistoryEntry = {
  id: string;
  label: string;
  kind: "ASSET" | "BODY" | "GROUP" | "SOUL" | "QUERY";
  target: string;
  savedAt: string;
};

export type SearchHistoryState = {
  recents: SearchHistoryEntry[];
  favorites: SearchHistoryEntry[];
  optedOut: boolean;
  updatedAt: string | null;
};

const VALID_KINDS = new Set(["ASSET", "BODY", "GROUP", "SOUL", "QUERY"]);

function sanitizeEntry(raw: unknown, nowIso: string): SearchHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const target = typeof o.target === "string" ? o.target.trim().slice(0, 120) : "";
  const label = typeof o.label === "string" ? o.label.trim().slice(0, 120) : target;
  const kind = typeof o.kind === "string" && VALID_KINDS.has(o.kind.toUpperCase())
    ? (o.kind.toUpperCase() as SearchHistoryEntry["kind"])
    : "QUERY";
  if (!target) return null;
  return {
    id: `${kind}:${target.toLowerCase()}`,
    label: label || target,
    kind,
    target,
    savedAt: typeof o.savedAt === "string" ? o.savedAt : nowIso,
  };
}

function parseEntryList(json: string | null | undefined): SearchHistoryEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => sanitizeEntry(x, ""))
      .filter((x): x is SearchHistoryEntry => x !== null)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export async function getSearchHistory(subject: string): Promise<SearchHistoryState> {
  try {
    const row = await database()
      .prepare(
        "SELECT recents_json, favorites_json, opted_out, updated_at FROM x52_search_history WHERE subject=?",
      )
      .bind(subject)
      .first<{
        recents_json: string;
        favorites_json: string;
        opted_out: number;
        updated_at: string;
      }>();
    if (!row) {
      return { recents: [], favorites: [], optedOut: false, updatedAt: null };
    }
    return {
      recents: parseEntryList(row.recents_json),
      favorites: parseEntryList(row.favorites_json),
      optedOut: !!row.opted_out,
      updatedAt: row.updated_at,
    };
  } catch {
    return { recents: [], favorites: [], optedOut: false, updatedAt: null };
  }
}

export async function mutateSearchHistory(
  subject: string,
  input: Record<string, unknown>,
): Promise<SearchHistoryState> {
  await rate(subject + ":x52-search-history", 60, 60_000);
  const acc = await account(subject);
  if (!acc) {
    throw new HttpError(403, "Complete account setup before saving search history.");
  }

  const action = String(input.action ?? "");
  const current = await getSearchHistory(subject);
  const nowIso = new Date().toISOString();

  let recents = [...current.recents];
  let favorites = [...current.favorites];
  let optedOut = current.optedOut;

  if (action === "record") {
    if (!optedOut) {
      const entry = sanitizeEntry(input.entry ?? input, nowIso);
      if (!entry) throw new HttpError(400, "Valid search entry is required.");
      recents = [entry, ...recents.filter((r) => r.id !== entry.id)].slice(0, 12);
    }
  } else if (action === "toggle-favorite") {
    const entry = sanitizeEntry(input.entry ?? input, nowIso);
    if (!entry) throw new HttpError(400, "Valid favorite search entry is required.");
    if (favorites.some((f) => f.id === entry.id)) {
      favorites = favorites.filter((f) => f.id !== entry.id);
    } else {
      favorites = [entry, ...favorites].slice(0, 12);
    }
  } else if (action === "remove") {
    const entryId = typeof input.id === "string" ? input.id.trim() : "";
    recents = recents.filter((r) => r.id !== entryId);
    favorites = favorites.filter((f) => f.id !== entryId);
  } else if (action === "clear") {
    recents = [];
  } else if (action === "set-opt-out") {
    optedOut = Boolean(input.optedOut);
    if (optedOut) {
      recents = [];
    }
  } else {
    throw new HttpError(400, "Unsupported search history action.");
  }

  await database()
    .prepare(
      `INSERT INTO x52_search_history (subject, recents_json, favorites_json, opted_out, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(subject) DO UPDATE SET
         recents_json = excluded.recents_json,
         favorites_json = excluded.favorites_json,
         opted_out = excluded.opted_out,
         updated_at = excluded.updated_at`,
    )
    .bind(
      subject,
      JSON.stringify(recents),
      JSON.stringify(favorites),
      optedOut ? 1 : 0,
      nowIso,
    )
    .run();

  return { recents, favorites, optedOut, updatedAt: nowIso };
}

// ──────────────────────────────────────────────────────────────────────────────
// [24] MY WATCH REGIONS (x52_watch_regions)
// ──────────────────────────────────────────────────────────────────────────────

export type WatchRegionCategory =
  | "EARTHQUAKE"
  | "DISASTER"
  | "CONFLICT"
  | "MACRO"
  | "ENERGY";

export type WatchRegionsState = {
  regions: string[];
  categories: WatchRegionCategory[];
  lastSeenAt: string;
  updatedAt: string | null;
};

const VALID_REGION_IDS = new Set([
  ...COUNTRY_PROFILES.map((c) => c.regionId),
  "global",
]);
const VALID_CATEGORIES = new Set<WatchRegionCategory>([
  "EARTHQUAKE",
  "DISASTER",
  "CONFLICT",
  "MACRO",
  "ENERGY",
]);

const DEFAULT_WATCH_CATEGORIES: WatchRegionCategory[] = [
  "EARTHQUAKE",
  "DISASTER",
  "MACRO",
  "ENERGY",
];

export async function getWatchRegions(subject: string): Promise<WatchRegionsState> {
  const fallbackNow = new Date().toISOString();
  try {
    const row = await database()
      .prepare(
        "SELECT regions_json, categories_json, last_seen_at, updated_at FROM x52_watch_regions WHERE subject=?",
      )
      .bind(subject)
      .first<{
        regions_json: string;
        categories_json: string;
        last_seen_at: string;
        updated_at: string;
      }>();
    if (!row) {
      return {
        regions: [],
        categories: [...DEFAULT_WATCH_CATEGORIES],
        lastSeenAt: fallbackNow,
        updatedAt: null,
      };
    }
    const regions = (JSON.parse(row.regions_json) as unknown[])
      .filter((x): x is string => typeof x === "string" && VALID_REGION_IDS.has(x))
      .slice(0, 12);
    const categories = (JSON.parse(row.categories_json) as unknown[])
      .filter(
        (x): x is WatchRegionCategory =>
          typeof x === "string" && VALID_CATEGORIES.has(x as WatchRegionCategory),
      );
    return {
      regions,
      categories: categories.length ? categories : [...DEFAULT_WATCH_CATEGORIES],
      lastSeenAt: row.last_seen_at || fallbackNow,
      updatedAt: row.updated_at,
    };
  } catch {
    return {
      regions: [],
      categories: [...DEFAULT_WATCH_CATEGORIES],
      lastSeenAt: fallbackNow,
      updatedAt: null,
    };
  }
}

export async function mutateWatchRegions(
  subject: string,
  input: Record<string, unknown>,
): Promise<WatchRegionsState> {
  await rate(subject + ":x52-watch-regions", 45, 60_000);
  const acc = await account(subject);
  if (!acc) {
    throw new HttpError(403, "Complete account setup before saving Watch Regions.");
  }

  const current = await getWatchRegions(subject);
  const nowIso = new Date().toISOString();
  const action = String(input.action ?? "save");

  let regions = [...current.regions];
  let categories = [...current.categories];
  let lastSeenAt = current.lastSeenAt;

  if (action === "toggle-region") {
    const regionId = typeof input.regionId === "string" ? input.regionId.trim().toLowerCase() : "";
    if (!VALID_REGION_IDS.has(regionId)) {
      throw new HttpError(400, "Unsupported region identifier.");
    }
    if (regions.includes(regionId)) {
      regions = regions.filter((r) => r !== regionId);
    } else {
      regions = [...regions, regionId].slice(0, 12);
    }
  } else if (action === "save") {
    if (Array.isArray(input.regions)) {
      regions = [
        ...new Set(
          input.regions
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim().toLowerCase())
            .filter((x) => VALID_REGION_IDS.has(x)),
        ),
      ].slice(0, 12);
    }
    if (Array.isArray(input.categories)) {
      const nextCats = [
        ...new Set(
          input.categories
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim().toUpperCase())
            .filter((x): x is WatchRegionCategory =>
              VALID_CATEGORIES.has(x as WatchRegionCategory),
            ),
        ),
      ];
      if (nextCats.length > 0) categories = nextCats;
    }
  } else if (action === "mark-seen") {
    lastSeenAt = nowIso;
  } else {
    throw new HttpError(400, "Unsupported Watch Regions action.");
  }

  await database()
    .prepare(
      `INSERT INTO x52_watch_regions (subject, regions_json, categories_json, last_seen_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(subject) DO UPDATE SET
         regions_json = excluded.regions_json,
         categories_json = excluded.categories_json,
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      subject,
      JSON.stringify(regions),
      JSON.stringify(categories),
      lastSeenAt,
      nowIso,
    )
    .run();

  return { regions, categories, lastSeenAt, updatedAt: nowIso };
}
