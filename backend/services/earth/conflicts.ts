import { env } from "cloudflare:workers";

export type ConflictProviderId = "UCDP_GED" | "ACLED";

export type ConflictCategory =
  | "BATTLES"
  | "VIOLENCE_AGAINST_CIVILIANS"
  | "EXPLOSIONS_REMOTE_VIOLENCE"
  | "ARMED_CONFLICT";

export type ConflictPeriod = "7d" | "30d" | "90d" | "365d";

export type ConflictEvent = {
  eventId: string;
  provider: ConflictProviderId;
  providerRecordId: string;
  canonicalSourceUrl: string;
  sourceAttribution: string;
  eventTitle: string;
  shortSummary: string;
  eventType: string;
  normalizedCategory: ConflictCategory;
  actors: string[];
  countryCode: string;
  countryName: string;
  adminRegion: string;
  placeName: string;
  latitude: number;
  longitude: number;
  geographicPrecision: string;
  geocodeConfidence: "HIGH" | "MEDIUM" | "COARSE";
  eventStartAt: string;
  eventEndAt: string | null;
  reportedAt: string | null;
  ingestedAt: string;
  providerUpdatedAt: string | null;
  fatalitiesEstimate: number | null;
  verificationState: "VERIFIED_DATASET" | "REPORTED_CANDIDATE";
  citations: string[];
  dataVersion: string;
};

export type ConflictHotspot = {
  regionKey: string;
  countryName: string;
  adminRegion: string;
  eventCount: number;
  latitude: number;
  longitude: number;
  latestEventAt: string;
  categories: ConflictCategory[];
};

export type ConflictFeedStatus =
  | "CONNECTED"
  | "HISTORICAL_DATASET"
  | "STALE"
  | "NOT_CONFIGURED"
  | "PROVIDER_ERROR";

export type ConflictFeedResponse = {
  status: ConflictFeedStatus;
  provider: ConflictProviderId | null;
  providerLabel: string | null;
  period: ConflictPeriod;
  asOf: string;
  providerUpdatedAt: string | null;
  events: ConflictEvent[];
  hotspots: ConflictHotspot[];
  summary: {
    totalEvents: number | null;
    regionsCount: number | null;
    countriesCount: number | null;
    coverageStart: string | null;
    coverageEnd: string | null;
    isLive: false;
  };
  attribution: string;
  licenseUrl: string;
  limitations: string[];
  message: string;
  setupHint: string | null;
};

const PERIOD_DAYS: Record<ConflictPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

const CACHE_TTL_MS = 15 * 60_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 9_000;

type CacheEntry = {
  expiresAt: number;
  provider: ConflictProviderId;
  providerUpdatedAt: string;
  events: ConflictEvent[];
};

const feedCache = new Map<string, CacheEntry>();

export function clearConflictCacheForTests(): void {
  feedCache.clear();
}

export function normalizeLongitude(lon: number): number {
  if (!Number.isFinite(lon)) return Number.NaN;
  let wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && lon > 0) wrapped = 180;
  return Math.round(wrapped * 1_000_000) / 1_000_000;
}

export function validateCoordinates(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } | null {
  const nLat = typeof lat === "number" ? lat : Number(lat);
  const nLon = typeof lon === "number" ? lon : Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return null;
  if (nLat < -90 || nLat > 90) return null;
  const normLon = normalizeLongitude(nLon);
  if (!Number.isFinite(normLon)) return null;
  return {
    lat: Math.round(nLat * 1_000_000) / 1_000_000,
    lon: normLon,
  };
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed,
  );
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parseFatalities(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function mapUcdpPrecision(wherePrec: unknown): {
  label: string;
  confidence: "HIGH" | "MEDIUM" | "COARSE";
} {
  const p = Number(wherePrec);
  if (p === 1) return { label: "Exact location (UCDP precision 1)", confidence: "HIGH" };
  if (p === 2) return { label: "Within ~25 km (UCDP precision 2)", confidence: "HIGH" };
  if (p === 3) return { label: "Second-order administrative area (UCDP precision 3)", confidence: "MEDIUM" };
  if (p === 4) return { label: "First-order administrative region (UCDP precision 4)", confidence: "MEDIUM" };
  return { label: "Coarse / country-level localization (UCDP precision 5–7)", confidence: "COARSE" };
}

function mapUcdpCategory(typeOfViolence: unknown): {
  category: ConflictCategory;
  label: string;
} {
  const t = Number(typeOfViolence);
  if (t === 1) return { category: "BATTLES", label: "State-based armed conflict" };
  if (t === 2) return { category: "ARMED_CONFLICT", label: "Non-state armed conflict" };
  if (t === 3) return { category: "VIOLENCE_AGAINST_CIVILIANS", label: "One-sided violence against civilians" };
  return { category: "ARMED_CONFLICT", label: "Armed conflict event" };
}

export function normalizeUcdpRecord(
  raw: Record<string, unknown>,
  ingestedAt: string,
  version = "25.1",
): ConflictEvent | null {
  const recordId = cleanText(String(raw.id ?? raw.relid ?? ""), 64);
  if (!recordId) return null;
  const coords = validateCoordinates(raw.latitude, raw.longitude);
  if (!coords) return null;
  const eventStartAt = isoDateOrNull(raw.date_start);
  if (!eventStartAt) return null;
  const eventEndAt = isoDateOrNull(raw.date_end);
  const { category, label } = mapUcdpCategory(raw.type_of_violence);
  const prec = mapUcdpPrecision(raw.where_prec);
  const countryName = cleanText(raw.country, 80) || "Unknown country";
  const adminRegion = cleanText(raw.adm_1, 80) || countryName;
  const placeName = cleanText(raw.where_coordinates || raw.where_description, 120) || adminRegion;
  const actors = [cleanText(raw.side_a, 100), cleanText(raw.side_b, 100)].filter(Boolean);
  const conflictName = cleanText(raw.conflict_name || raw.dyad_name, 140) || label;
  const headline = cleanText(raw.source_headline, 240);
  const citations = [
    cleanText(raw.source_article, 240),
    cleanText(raw.source_original, 160),
  ].filter(Boolean);

  return {
    eventId: `ucdp:${recordId}`,
    provider: "UCDP_GED",
    providerRecordId: recordId,
    canonicalSourceUrl: "https://ucdp.uu.se/encyclopedia",
    sourceAttribution: "Uppsala Conflict Data Program (UCDP GED, CC BY 4.0)",
    eventTitle: conflictName,
    shortSummary:
      headline ||
      `${label} recorded in ${placeName}, ${countryName} (${eventStartAt.slice(0, 10)}).`,
    eventType: label,
    normalizedCategory: category,
    actors,
    countryCode: cleanText(String(raw.country_id ?? ""), 16),
    countryName,
    adminRegion,
    placeName,
    latitude: coords.lat,
    longitude: coords.lon,
    geographicPrecision: prec.label,
    geocodeConfidence: prec.confidence,
    eventStartAt,
    eventEndAt,
    reportedAt: isoDateOrNull(raw.source_date),
    ingestedAt,
    providerUpdatedAt: ingestedAt,
    fatalitiesEstimate: parseFatalities(raw.best),
    verificationState: "VERIFIED_DATASET",
    citations,
    dataVersion: `UCDP-GED-${version}`,
  };
}

function mapAcledCategory(eventType: string): ConflictCategory {
  const lower = eventType.toLowerCase();
  if (lower.includes("battle")) return "BATTLES";
  if (lower.includes("civilian")) return "VIOLENCE_AGAINST_CIVILIANS";
  if (lower.includes("explosion") || lower.includes("remote")) {
    return "EXPLOSIONS_REMOTE_VIOLENCE";
  }
  return "ARMED_CONFLICT";
}

export function normalizeAcledRecord(
  raw: Record<string, unknown>,
  ingestedAt: string,
): ConflictEvent | null {
  const recordId = cleanText(String(raw.event_id_cnty ?? raw.data_id ?? ""), 64);
  if (!recordId) return null;
  const eventType = cleanText(raw.event_type, 80);
  // Strictly exclude peaceful protests / non-violent political disputes from red conflict markers.
  if (/protest|strategic development/i.test(eventType)) return null;
  const coords = validateCoordinates(raw.latitude, raw.longitude);
  if (!coords) return null;
  const eventStartAt = isoDateOrNull(raw.event_date);
  if (!eventStartAt) return null;
  const countryName = cleanText(raw.country, 80) || "Unknown country";
  const adminRegion = cleanText(raw.admin1, 80) || countryName;
  const placeName = cleanText(raw.location, 120) || adminRegion;
  const actors = [cleanText(raw.actor1, 100), cleanText(raw.actor2, 100)].filter(Boolean);
  const subType = cleanText(raw.sub_event_type, 80);
  const geoPrecNum = Number(raw.geo_precision);
  const geocodeConfidence =
    geoPrecNum === 1 ? "HIGH" : geoPrecNum === 2 ? "MEDIUM" : "COARSE";
  const geographicPrecision =
    geoPrecNum === 1
      ? "Town / exact locality (ACLED geo precision 1)"
      : geoPrecNum === 2
        ? "Near locality / sub-district (ACLED geo precision 2)"
        : "Provincial / coarse region (ACLED geo precision 3)";

  return {
    eventId: `acled:${recordId}`,
    provider: "ACLED",
    providerRecordId: recordId,
    canonicalSourceUrl: "https://acleddata.com/",
    sourceAttribution: "Armed Conflict Location & Event Data (ACLED)",
    eventTitle: subType ? `${eventType}: ${subType}` : eventType || "Armed conflict event",
    shortSummary:
      cleanText(raw.notes, 280) ||
      `${eventType} recorded in ${placeName}, ${countryName} (${eventStartAt.slice(0, 10)}).`,
    eventType: eventType || "Armed conflict",
    normalizedCategory: mapAcledCategory(eventType),
    actors,
    countryCode: cleanText(String(raw.iso ?? ""), 16),
    countryName,
    adminRegion,
    placeName,
    latitude: coords.lat,
    longitude: coords.lon,
    geographicPrecision,
    geocodeConfidence,
    eventStartAt,
    eventEndAt: null,
    reportedAt:
      typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
        ? new Date(raw.timestamp * 1000).toISOString()
        : null,
    ingestedAt,
    providerUpdatedAt: ingestedAt,
    fatalitiesEstimate: parseFatalities(raw.fatalities),
    verificationState: "VERIFIED_DATASET",
    citations: [cleanText(raw.source, 160)].filter(Boolean),
    dataVersion: "ACLED-API",
  };
}

export function dedupeAndFilterConflicts(
  events: readonly ConflictEvent[],
  options: {
    period: ConflictPeriod;
    country?: string;
    category?: string;
    search?: string;
    nowMs?: number;
  },
): {
  events: ConflictEvent[];
  hotspots: ConflictHotspot[];
  countriesCount: number;
  regionsCount: number;
  coverageStart: string | null;
  coverageEnd: string | null;
} {
  const deduped = new Map<string, ConflictEvent>();
  for (const ev of events) {
    const key = `${ev.provider}:${ev.providerRecordId}`;
    if (!deduped.has(key)) deduped.set(key, ev);
  }

  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs = nowMs - PERIOD_DAYS[options.period] * 86_400_000;
  const countryQ = (options.country ?? "").trim().toLowerCase();
  const categoryQ = (options.category ?? "ALL").trim().toUpperCase();
  const searchQ = (options.search ?? "").trim().toLowerCase();

  const filtered = [...deduped.values()]
    .filter((ev) => {
      const ts = Date.parse(ev.eventStartAt);
      if (!Number.isFinite(ts) || ts < cutoffMs) return false;
      if (
        countryQ &&
        countryQ !== "all" &&
        ev.countryName.toLowerCase() !== countryQ &&
        !ev.countryName.toLowerCase().includes(countryQ)
      ) {
        return false;
      }
      if (categoryQ && categoryQ !== "ALL" && ev.normalizedCategory !== categoryQ) {
        return false;
      }
      if (searchQ) {
        const hay =
          `${ev.eventTitle} ${ev.shortSummary} ${ev.countryName} ${ev.adminRegion} ${ev.placeName} ${ev.actors.join(" ")}`.toLowerCase();
        if (!hay.includes(searchQ)) return false;
      }
      return true;
    })
    .sort((a, b) => b.eventStartAt.localeCompare(a.eventStartAt) || a.eventId.localeCompare(b.eventId));

  const regionBuckets = new Map<
    string,
    {
      countryName: string;
      adminRegion: string;
      count: number;
      latSum: number;
      lonSum: number;
      latest: string;
      categories: Set<ConflictCategory>;
    }
  >();
  const countries = new Set<string>();
  let coverageStart: string | null = null;
  let coverageEnd: string | null = null;

  for (const ev of filtered) {
    countries.add(ev.countryName);
    if (!coverageStart || ev.eventStartAt < coverageStart) coverageStart = ev.eventStartAt;
    if (!coverageEnd || ev.eventStartAt > coverageEnd) coverageEnd = ev.eventStartAt;
    const key = `${ev.countryName}::${ev.adminRegion}`;
    const existing = regionBuckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.latSum += ev.latitude;
      existing.lonSum += ev.longitude;
      if (ev.eventStartAt > existing.latest) existing.latest = ev.eventStartAt;
      existing.categories.add(ev.normalizedCategory);
    } else {
      regionBuckets.set(key, {
        countryName: ev.countryName,
        adminRegion: ev.adminRegion,
        count: 1,
        latSum: ev.latitude,
        lonSum: ev.longitude,
        latest: ev.eventStartAt,
        categories: new Set([ev.normalizedCategory]),
      });
    }
  }

  const hotspots: ConflictHotspot[] = [...regionBuckets.entries()]
    .map(([regionKey, b]) => ({
      regionKey,
      countryName: b.countryName,
      adminRegion: b.adminRegion,
      eventCount: b.count,
      latitude: Math.round((b.latSum / b.count) * 10000) / 10000,
      longitude: normalizeLongitude(b.lonSum / b.count),
      latestEventAt: b.latest,
      categories: [...b.categories],
    }))
    .sort((a, b) => b.eventCount - a.eventCount || b.latestEventAt.localeCompare(a.latestEventAt))
    .slice(0, 20);

  return {
    events: filtered.slice(0, 400),
    hotspots,
    countriesCount: countries.size,
    regionsCount: regionBuckets.size,
    coverageStart,
    coverageEnd,
  };
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchJsonBounded(
  url: string,
  headers: Record<string, string>,
  fetcher: Fetcher,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetcher(url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: ctrl.signal,
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      throw new Error("Upstream redirect rejected.");
    }
    if (!res.ok) {
      throw new Error(`Provider HTTP ${res.status}`);
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Provider response exceeded size limit.");
    }
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid JSON envelope.");
    }
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getConflictIntelligence(
  options: {
    period?: ConflictPeriod;
    country?: string;
    category?: string;
    search?: string;
  } = {},
  runtimeEnv?: Record<string, unknown>,
  fetcher: Fetcher = fetch,
  nowMs = Date.now(),
): Promise<ConflictFeedResponse> {
  const period: ConflictPeriod =
    options.period && options.period in PERIOD_DAYS ? options.period : "30d";
  const e = runtimeEnv ?? (env as unknown as Record<string, unknown>);
  const ucdpToken =
    typeof e.UCDP_ACCESS_TOKEN === "string" ? e.UCDP_ACCESS_TOKEN.trim() : "";
  const acledKey =
    typeof e.ACLED_API_KEY === "string" ? e.ACLED_API_KEY.trim() : "";
  const acledEmail =
    typeof e.ACLED_EMAIL === "string" ? e.ACLED_EMAIL.trim() : "";
  const ucdpVersion =
    typeof e.UCDP_GED_VERSION === "string" && /^[0-9.]{2,12}$/.test(e.UCDP_GED_VERSION.trim())
      ? e.UCDP_GED_VERSION.trim()
      : "25.1";

  const asOf = new Date(nowMs).toISOString();

  // Fail closed honestly when no licensed/authenticated conflict dataset token is configured.
  if (!ucdpToken && !(acledKey && acledEmail)) {
    return {
      status: "NOT_CONFIGURED",
      provider: null,
      providerLabel: null,
      period,
      asOf,
      providerUpdatedAt: null,
      events: [],
      hotspots: [],
      summary: {
        totalEvents: null,
        regionsCount: null,
        countriesCount: null,
        coverageStart: null,
        coverageEnd: null,
        isLive: false,
      },
      attribution:
        "No verified conflict dataset token is active on this deployment. Satellite Earth & World Map imagery provided by NASA GIBS (public domain).",
      licenseUrl: "https://ucdp.uu.se/apidocs/",
      limitations: [
        "Red conflict markers appear ONLY when backed by a verified, licensed server-side event dataset.",
        "Blank map areas do NOT indicate absence of conflict — they reflect that no conflict provider secret is configured yet.",
        "Strategic Souls never fabricates illustrative conflict hotspots or labels historical datasets as live feeds.",
      ],
      message:
        "Verified conflict data feed is not configured on this deployment. The interactive satellite world map, exchange hubs, and globe sync remain fully operational.",
      setupHint:
        "Set Cloudflare Worker Secret UCDP_ACCESS_TOKEN (free CC BY 4.0 token via ucdp.uu.se/apidocs) or licensed ACLED_API_KEY + ACLED_EMAIL.",
    };
  }

  const provider: ConflictProviderId = ucdpToken ? "UCDP_GED" : "ACLED";
  const cacheKey = `${provider}:${period}:${ucdpVersion}`;
  let cached = feedCache.get(cacheKey);

  if (!cached || cached.expiresAt <= nowMs) {
    try {
      const startDate = new Date(nowMs - PERIOD_DAYS[period] * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const endDate = asOf.slice(0, 10);
      let normalized: ConflictEvent[] = [];

      if (provider === "UCDP_GED") {
        const url = `https://ucdpapi.pcr.uu.se/api/gedevents/${encodeURIComponent(ucdpVersion)}?pagesize=250&StartDate=${startDate}&EndDate=${endDate}`;
        const json = await fetchJsonBounded(
          url,
          {
            Accept: "application/json",
            "x-ucdp-access-token": ucdpToken,
          },
          fetcher,
        );
        const rows = Array.isArray(json.Result) ? json.Result : [];
        normalized = rows
          .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
          .map((r) => normalizeUcdpRecord(r, asOf, ucdpVersion))
          .filter((r): r is ConflictEvent => r !== null);
      } else {
        const url = `https://api.acleddata.com/acled/read?key=${encodeURIComponent(acledKey)}&email=${encodeURIComponent(acledEmail)}&event_date=${startDate}|${endDate}&event_date_where=BETWEEN&limit=250`;
        const json = await fetchJsonBounded(
          url,
          { Accept: "application/json" },
          fetcher,
        );
        const rows = Array.isArray(json.data) ? json.data : [];
        normalized = rows
          .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
          .map((r) => normalizeAcledRecord(r, asOf))
          .filter((r): r is ConflictEvent => r !== null);
      }

      cached = {
        expiresAt: nowMs + CACHE_TTL_MS,
        provider,
        providerUpdatedAt: asOf,
        events: normalized,
      };
      feedCache.set(cacheKey, cached);
    } catch {
      if (!cached) {
        return {
          status: "PROVIDER_ERROR",
          provider,
          providerLabel:
            provider === "UCDP_GED"
              ? "Uppsala Conflict Data Program (UCDP GED)"
              : "ACLED",
          period,
          asOf,
          providerUpdatedAt: null,
          events: [],
          hotspots: [],
          summary: {
            totalEvents: null,
            regionsCount: null,
            countriesCount: null,
            coverageStart: null,
            coverageEnd: null,
            isLive: false,
          },
          attribution:
            provider === "UCDP_GED"
              ? "Uppsala Conflict Data Program (UCDP, CC BY 4.0)"
              : "Armed Conflict Location & Event Data (ACLED)",
          licenseUrl:
            provider === "UCDP_GED"
              ? "https://ucdp.uu.se/apidocs/"
              : "https://acleddata.com/attributionpolicy",
          limitations: [
            "Unable to load verified conflict data from the configured provider. Map basemap and exchange markers remain available.",
            "Missing results do not indicate zero conflict.",
          ],
          message:
            "Unable to load current conflict data — map remains available. Retry safely in a moment.",
          setupHint: null,
        };
      }
    }
  }

  const filtered = dedupeAndFilterConflicts(cached.events, {
    period,
    country: options.country,
    category: options.category,
    search: options.search,
    nowMs,
  });

  const isStale = cached.expiresAt <= nowMs;

  return {
    status: isStale ? "STALE" : provider === "UCDP_GED" ? "HISTORICAL_DATASET" : "CONNECTED",
    provider,
    providerLabel:
      provider === "UCDP_GED"
        ? `Uppsala Conflict Data Program (UCDP GED v${ucdpVersion})`
        : "Armed Conflict Location & Event Data (ACLED)",
    period,
    asOf,
    providerUpdatedAt: cached.providerUpdatedAt,
    events: filtered.events,
    hotspots: filtered.hotspots,
    summary: {
      totalEvents: filtered.events.length,
      regionsCount: filtered.regionsCount,
      countriesCount: filtered.countriesCount,
      coverageStart: filtered.coverageStart,
      coverageEnd: filtered.coverageEnd,
      isLive: false,
    },
    attribution:
      provider === "UCDP_GED"
        ? "Uppsala Conflict Data Program (UCDP GED, CC BY 4.0). Publication lag applies; not a live battlefield feed."
        : "Armed Conflict Location & Event Data (ACLED). Geolocated event reports; not a real-time battlefield feed.",
    licenseUrl:
      provider === "UCDP_GED"
        ? "https://creativecommons.org/licenses/by/4.0/"
        : "https://acleddata.com/attributionpolicy",
    limitations: [
      "Event dates reflect dataset records and differ from news publication or ingestion timestamps.",
      "Fatalities estimates may be unknown (null) and are never treated as zero.",
      "Geographic coordinates follow provider precision levels and are not tactical locations.",
    ],
    message:
      filtered.events.length > 0
        ? `Showing ${filtered.events.length} verified geolocated records from ${provider === "UCDP_GED" ? "UCDP GED" : "ACLED"}.`
        : "No matching records in the selected dataset and period.",
    setupHint: null,
  };
}
