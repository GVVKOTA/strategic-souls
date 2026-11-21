/**
 * Strategic Souls X5.1 — Official Source-Grounded Economic Calendar Service.
 * All events carry canonical agency provenance, IANA source timezone, UTC scheduled instant,
 * explicit release status, and strict zero-fabrication rules:
 * - Consensus/Forecast is NEVER synthesized (stays null / em-dash unless licensed feed connected).
 * - Actual is NEVER invented prior to verified official agency release.
 * - Importance is editorial macro relevance, NOT a directional forecast.
 */

export type EconomicCountry = "IN" | "US" | "EU" | "GLOBAL";
export type EconomicCategory =
  | "CENTRAL_BANK"
  | "INFLATION"
  | "EMPLOYMENT"
  | "GDP"
  | "ENERGY"
  | "TRADE";
export type EconomicImportance = "HIGH" | "MEDIUM" | "LOW";
export type EconomicEventStatus =
  | "SCHEDULED"
  | "RELEASED"
  | "RESCHEDULED"
  | "CANCELLED"
  | "TIME_NOT_ANNOUNCED";

export type EconomicEvent = {
  eventId: string;
  canonicalSourceId: "RBI" | "MOSPI" | "FOMC" | "BLS" | "BEA" | "EIA" | "ECB";
  sourceAgency: string;
  primarySourceUrl: string;
  country: EconomicCountry;
  countryLabel: string;
  category: EconomicCategory;
  title: string;
  description: string;
  scheduledAtUTC: string | null;
  scheduledDate: string; // YYYY-MM-DD in source timezone
  sourceTimezone: string;
  announcedDateOnly: boolean;
  importance: EconomicImportance;
  status: EconomicEventStatus;
  actual: string | null;
  actualPublishedAtUTC: string | null;
  previous: string | null;
  consensus: string | null;
  consensusSource: string | null;
  revisionNote: string | null;
  lastVerifiedAtUTC: string;
  licenseScope: "PUBLIC_OFFICIAL_SCHEDULE";
};

export type CalendarSourceMeta = {
  id: EconomicEvent["canonicalSourceId"];
  agency: string;
  country: EconomicCountry;
  url: string;
  timezone: string;
  notes: string;
};

export const OFFICIAL_CALENDAR_SOURCES: readonly CalendarSourceMeta[] =
  Object.freeze([
    {
      id: "RBI",
      agency: "Reserve Bank of India (MPC)",
      country: "IN",
      url: "https://www.rbi.org.in/Scripts/AnnualPolicy.aspx",
      timezone: "Asia/Kolkata",
      notes: "Bi-monthly Monetary Policy Committee statements (typically 10:00 IST).",
    },
    {
      id: "MOSPI",
      agency: "Ministry of Statistics & Programme Implementation (MoSPI)",
      country: "IN",
      url: "https://www.mospi.gov.in/",
      timezone: "Asia/Kolkata",
      notes: "Official India CPI inflation & quarterly GDP advance release schedules (typically 16:00 IST).",
    },
    {
      id: "FOMC",
      agency: "Federal Reserve (FOMC)",
      country: "US",
      url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
      timezone: "America/New_York",
      notes: "Scheduled FOMC rate statements (14:00 America/New_York; DST-aware conversion to IST).",
    },
    {
      id: "BLS",
      agency: "U.S. Bureau of Labor Statistics (BLS)",
      country: "US",
      url: "https://www.bls.gov/schedule/",
      timezone: "America/New_York",
      notes: "U.S. CPI and Employment Situation releases (08:30 America/New_York; DST-aware).",
    },
    {
      id: "BEA",
      agency: "U.S. Bureau of Economic Analysis (BEA)",
      country: "US",
      url: "https://www.bea.gov/news/schedule",
      timezone: "America/New_York",
      notes: "U.S. GDP estimates and Personal Consumption Expenditures (PCE) releases (08:30 America/New_York).",
    },
    {
      id: "EIA",
      agency: "U.S. Energy Information Administration (EIA)",
      country: "GLOBAL",
      url: "https://www.eia.gov/petroleum/supply/weekly/",
      timezone: "America/New_York",
      notes: "Weekly Petroleum Status Report (10:30 America/New_York Wednesdays unless shifted by US federal holiday).",
    },
    {
      id: "ECB",
      agency: "European Central Bank (ECB)",
      country: "EU",
      url: "https://www.ecb.europa.eu/press/calendars/html/index.en.html",
      timezone: "Europe/Berlin",
      notes: "Governing Council monetary policy press statements (14:15 CET/CEST).",
    },
  ]);

const LAST_VERIFIED_UTC = "2026-11-21T19:00:00.000Z";

/**
 * Converts a wall-clock local date + HH:MM in an explicit IANA timezone into exact UTC ISO string.
 * Accurately handles US Daylight Saving Time (EDT UTC-4 vs EST UTC-5) and EU CET/CEST transitions.
 */
export function wallClockToUtcIso(
  dateYmd: string,
  hhmm: string,
  timeZone: string,
): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  // Start with a UTC guess and refine by comparing formatted local wall-clock parts (2 passes handle DST boundaries)
  let utcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let pass = 0; pass < 2; pass++) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
    );
    const seenMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      0,
      0,
    );
    const targetMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
    const diff = targetMs - seenMs;
    if (diff === 0) break;
    utcMs += diff;
  }
  return new Date(utcMs).toISOString();
}

type RawScheduleEntry = {
  id: string;
  source: EconomicEvent["canonicalSourceId"];
  country: EconomicCountry;
  category: EconomicCategory;
  title: string;
  description: string;
  date: string;
  localTime: string | null; // null => TIME_NOT_ANNOUNCED / announcedDateOnly
  importance: EconomicImportance;
  statusOverride?: EconomicEventStatus;
  previous?: string | null;
  revisionNote?: string | null;
};

/**
 * Official statutory macroeconomic release schedule covering Q4 2026 – Q1 2027.
 * Consensus & future Actuals remain strictly null until connected to a verified official release feed.
 */
const OFFICIAL_SCHEDULE_ENTRIES: readonly RawScheduleEntry[] = [
  // ── Late November 2026 ────────────────────────────────────────────────────
  {
    id: "bea-pce-2026-11-25",
    source: "BEA",
    country: "US",
    category: "INFLATION",
    title: "US Personal Income & Outlays (PCE Price Index)",
    description: "Monthly BEA Personal Consumption Expenditures inflation & income report.",
    date: "2026-11-25",
    localTime: "08:30",
    importance: "HIGH",
    previous: "See official BEA archive",
  },
  {
    id: "bea-gdp-2026-11-25",
    source: "BEA",
    country: "US",
    category: "GDP",
    title: "US Q3 2026 GDP (Second Estimate)",
    description: "Bureau of Economic Analysis second estimate of Q3 2026 real GDP.",
    date: "2026-11-25",
    localTime: "08:30",
    importance: "HIGH",
    previous: "See official BEA archive",
  },
  {
    id: "eia-petro-2026-11-25",
    source: "EIA",
    country: "GLOBAL",
    category: "ENERGY",
    title: "US EIA Weekly Petroleum Status Report",
    description: "Weekly crude oil inventories, refinery inputs, and distillate stocks.",
    date: "2026-11-25",
    localTime: "10:30",
    importance: "MEDIUM",
  },
  {
    id: "mospi-gdp-2026-11-30",
    source: "MOSPI",
    country: "IN",
    category: "GDP",
    title: "India Q2 FY2026-27 GDP Quarterly Estimates",
    description: "MoSPI official quarterly estimates of Gross Domestic Product (Jul-Sep).",
    date: "2026-11-30",
    localTime: "16:00",
    importance: "HIGH",
  },
  // ── December 2026 ─────────────────────────────────────────────────────────
  {
    id: "eia-petro-2026-12-02",
    source: "EIA",
    country: "GLOBAL",
    category: "ENERGY",
    title: "US EIA Weekly Petroleum Status Report",
    description: "Weekly U.S. commercial crude oil and petroleum inventory report.",
    date: "2026-12-02",
    localTime: "10:30",
    importance: "MEDIUM",
  },
  {
    id: "rbi-mpc-2026-12-04",
    source: "RBI",
    country: "IN",
    category: "CENTRAL_BANK",
    title: "RBI Monetary Policy Committee (MPC) Policy Statement",
    description: "Reserve Bank of India bi-monthly policy repo rate decision and Governor statement.",
    date: "2026-12-04",
    localTime: "10:00",
    importance: "HIGH",
  },
  {
    id: "bls-nfp-2026-12-04",
    source: "BLS",
    country: "US",
    category: "EMPLOYMENT",
    title: "US Employment Situation (Nonfarm Payrolls & Unemployment)",
    description: "Monthly U.S. Bureau of Labor Statistics labor force & payroll report (Nov 2026).",
    date: "2026-12-04",
    localTime: "08:30",
    importance: "HIGH",
  },
  {
    id: "eia-petro-2026-12-09",
    source: "EIA",
    country: "GLOBAL",
    category: "ENERGY",
    title: "US EIA Weekly Petroleum Status Report",
    description: "Weekly U.S. commercial crude oil and petroleum inventory report.",
    date: "2026-12-09",
    localTime: "10:30",
    importance: "MEDIUM",
  },
  {
    id: "fomc-rate-2026-12-09",
    source: "FOMC",
    country: "US",
    category: "CENTRAL_BANK",
    title: "Federal Reserve FOMC Policy Statement & SEP",
    description: "FOMC monetary policy rate decision and Summary of Economic Projections.",
    date: "2026-12-09",
    localTime: "14:00",
    importance: "HIGH",
  },
  {
    id: "bls-cpi-2026-12-10",
    source: "BLS",
    country: "US",
    category: "INFLATION",
    title: "US Consumer Price Index (CPI — November 2026)",
    description: "Monthly U.S. headline and core CPI inflation release.",
    date: "2026-12-10",
    localTime: "08:30",
    importance: "HIGH",
  },
  {
    id: "mospi-cpi-2026-12-14",
    source: "MOSPI",
    country: "IN",
    category: "INFLATION",
    title: "India CPI Retail Inflation (November 2026)",
    description: "MoSPI All-India Combined Consumer Price Index release (shifted from weekend 12 Dec to Monday).",
    date: "2026-12-14",
    localTime: "16:00",
    importance: "HIGH",
    revisionNote: "Standard weekday shift when the 12th falls on a Saturday.",
  },
  {
    id: "eia-petro-2026-12-16",
    source: "EIA",
    country: "GLOBAL",
    category: "ENERGY",
    title: "US EIA Weekly Petroleum Status Report",
    description: "Weekly U.S. crude oil and refinery balance report.",
    date: "2026-12-16",
    localTime: "10:30",
    importance: "MEDIUM",
  },
  {
    id: "ecb-rate-2026-12-17",
    source: "ECB",
    country: "EU",
    category: "CENTRAL_BANK",
    title: "ECB Governing Council Monetary Policy Decision",
    description: "European Central Bank key interest rate decision and macroeconomic projections.",
    date: "2026-12-17",
    localTime: "14:15",
    importance: "HIGH",
  },
  {
    id: "bea-gdp-final-2026-12-23",
    source: "BEA",
    country: "US",
    category: "GDP",
    title: "US Q3 2026 GDP (Third Estimate) & Corporate Profits",
    description: "Final scheduled BEA estimate for Q3 2026 U.S. real GDP.",
    date: "2026-12-23",
    localTime: "08:30",
    importance: "MEDIUM",
  },
  // ── January – February 2027 ───────────────────────────────────────────────
  {
    id: "bls-nfp-2027-01-08",
    source: "BLS",
    country: "US",
    category: "EMPLOYMENT",
    title: "US Employment Situation (December 2026)",
    description: "Monthly U.S. payrolls and household unemployment report.",
    date: "2027-01-08",
    localTime: "08:30",
    importance: "HIGH",
  },
  {
    id: "mospi-cpi-2027-01-12",
    source: "MOSPI",
    country: "IN",
    category: "INFLATION",
    title: "India CPI Retail Inflation (December 2026)",
    description: "MoSPI All-India Combined Consumer Price Index.",
    date: "2027-01-12",
    localTime: "16:00",
    importance: "HIGH",
  },
  {
    id: "bls-cpi-2027-01-13",
    source: "BLS",
    country: "US",
    category: "INFLATION",
    title: "US Consumer Price Index (CPI — December 2026)",
    description: "Monthly U.S. Consumer Price Index release.",
    date: "2027-01-13",
    localTime: "08:30",
    importance: "HIGH",
  },
  {
    id: "fomc-rate-2027-01-27",
    source: "FOMC",
    country: "US",
    category: "CENTRAL_BANK",
    title: "Federal Reserve FOMC Policy Statement",
    description: "Scheduled January FOMC interest rate policy decision.",
    date: "2027-01-27",
    localTime: "14:00",
    importance: "HIGH",
  },
  {
    id: "in-budget-2027-02-01",
    source: "MOSPI",
    country: "IN",
    category: "TRADE",
    title: "India Union Budget & Fiscal Macroeconomic Framework",
    description: "Annual fiscal budget presentation date (exact Parliament release timestamp announced by Ministry of Finance).",
    date: "2027-02-01",
    localTime: null,
    importance: "HIGH",
    statusOverride: "TIME_NOT_ANNOUNCED",
  },
  {
    id: "rbi-mpc-2027-02-05",
    source: "RBI",
    country: "IN",
    category: "CENTRAL_BANK",
    title: "RBI Monetary Policy Committee (MPC) Policy Statement",
    description: "Reserve Bank of India bi-monthly policy decision (February 2027 cycle).",
    date: "2027-02-05",
    localTime: "10:00",
    importance: "HIGH",
  },
];

const COUNTRY_LABELS: Record<EconomicCountry, string> = {
  IN: "India",
  US: "United States",
  EU: "Euro Area",
  GLOBAL: "Global",
};

export function getEconomicCalendarEvents(options: {
  range?: "today" | "week" | "upcoming" | "all";
  country?: string;
  importance?: string;
  category?: string;
  nowMs?: number;
} = {}): {
  asOfUTC: string;
  lastVerifiedAtUTC: string;
  defaultTimezone: "Asia/Kolkata";
  events: EconomicEvent[];
  sources: readonly CalendarSourceMeta[];
  disclosure: string;
} {
  const nowMs = options.nowMs ?? Date.now();
  const asOfUTC = new Date(nowMs).toISOString();
  const sourceMap = new Map(OFFICIAL_CALENDAR_SOURCES.map((s) => [s.id, s]));

  const allEvents: EconomicEvent[] = OFFICIAL_SCHEDULE_ENTRIES.map((raw) => {
    const src = sourceMap.get(raw.source)!;
    const scheduledAtUTC = raw.localTime
      ? wallClockToUtcIso(raw.date, raw.localTime, src.timezone)
      : null;
    const announcedDateOnly = raw.localTime === null;

    let status: EconomicEventStatus = raw.statusOverride ?? "SCHEDULED";
    if (!raw.statusOverride && scheduledAtUTC) {
      if (Date.parse(scheduledAtUTC) < nowMs) {
        status = "RELEASED";
      }
    }

    return {
      eventId: raw.id,
      canonicalSourceId: raw.source,
      sourceAgency: src.agency,
      primarySourceUrl: src.url,
      country: raw.country,
      countryLabel: COUNTRY_LABELS[raw.country],
      category: raw.category,
      title: raw.title,
      description: raw.description,
      scheduledAtUTC,
      scheduledDate: raw.date,
      sourceTimezone: src.timezone,
      announcedDateOnly,
      importance: raw.importance,
      status,
      actual: null, // Strictly never fabricated; users click primarySourceUrl for official release PDF/HTML
      actualPublishedAtUTC: null,
      previous: raw.previous ?? null,
      consensus: null, // Never fabricated without licensed consensus provider
      consensusSource: null,
      revisionNote: raw.revisionNote ?? null,
      lastVerifiedAtUTC: LAST_VERIFIED_UTC,
      licenseScope: "PUBLIC_OFFICIAL_SCHEDULE" as const,
    };
  }).sort((a, b) => {
    const ta = a.scheduledAtUTC ?? `${a.scheduledDate}T23:59:59.000Z`;
    const tb = b.scheduledAtUTC ?? `${b.scheduledDate}T23:59:59.000Z`;
    return ta.localeCompare(tb) || a.eventId.localeCompare(b.eventId);
  });

  const istToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
  const weekEndMs = nowMs + 7 * 86_400_000;

  const countryFilter = (options.country ?? "ALL").toUpperCase();
  const impFilter = (options.importance ?? "ALL").toUpperCase();
  const catFilter = (options.category ?? "ALL").toUpperCase();
  const range = options.range ?? "upcoming";

  const filtered = allEvents.filter((ev) => {
    if (countryFilter !== "ALL") {
      if (countryFilter === "GLOBAL") {
        if (ev.country !== "GLOBAL" && ev.country !== "EU") return false;
      } else if (ev.country !== countryFilter) {
        return false;
      }
    }
    if (impFilter !== "ALL" && ev.importance !== impFilter) return false;
    if (catFilter !== "ALL" && ev.category !== catFilter) return false;

    const evMs = ev.scheduledAtUTC
      ? Date.parse(ev.scheduledAtUTC)
      : Date.parse(`${ev.scheduledDate}T18:29:59.000Z`);

    if (range === "today") {
      const evIstDay = ev.scheduledAtUTC
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(evMs))
        : ev.scheduledDate;
      return evIstDay === istToday;
    }
    if (range === "week") {
      return evMs >= nowMs - 86_400_000 && evMs <= weekEndMs;
    }
    if (range === "upcoming") {
      return evMs >= nowMs - 86_400_000;
    }
    return true;
  });

  return {
    asOfUTC,
    lastVerifiedAtUTC: LAST_VERIFIED_UTC,
    defaultTimezone: "Asia/Kolkata",
    events: filtered,
    sources: OFFICIAL_CALENDAR_SOURCES,
    disclosure:
      "Official statutory release dates from RBI, MoSPI, Federal Reserve FOMC, BLS, BEA, EIA, and ECB. Importance reflects editorial relevance, not market direction. Consensus estimates and live actuals remain em-dash (unavailable) unless backed by a licensed feed — click the official agency link for published values.",
  };
}

/** Generates a standards-compliant RFC-5545 .ics calendar payload for one EconomicEvent. */
export function buildEventIcs(event: EconomicEvent): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Global Vertex Vectors//Strategic Souls X5.1//EN",
    "BEGIN:VEVENT",
    `UID:${event.eventId}@strategic-souls.gvv`,
    `DTSTAMP:${stamp}`,
  ];
  if (event.scheduledAtUTC && !event.announcedDateOnly) {
    const start = event.scheduledAtUTC.replace(/[-:]/g, "").slice(0, 15) + "Z";
    const endIso = new Date(Date.parse(event.scheduledAtUTC) + 30 * 60_000).toISOString();
    const end = endIso.replace(/[-:]/g, "").slice(0, 15) + "Z";
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    const ymd = event.scheduledDate.replace(/-/g, "");
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
  }
  lines.push(
    `SUMMARY:${esc(`[${event.country}] ${event.title}`)}`,
    `DESCRIPTION:${esc(`${event.description} Source: ${event.sourceAgency} (${event.primarySourceUrl})`)}`,
    `URL:${event.primarySourceUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.join("\r\n") + "\r\n";
}

export function isOfficialEconomicEventId(eventId: string): boolean {
  return OFFICIAL_SCHEDULE_ENTRIES.some((e) => e.id === eventId);
}
