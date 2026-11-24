/**
 * Calendar-based Indian exchange session & freshness classifier (Asia/Kolkata).
 * Never relies on naive weekday-only assumptions or marks weekend/holiday quotes as LIVE.
 */

import type {
  DataQualityState,
  ExchangeCode,
  ExchangeSessionInfo,
  ExchangeSessionState,
} from "./types";

const IST_TZ = "Asia/Kolkata" as const;

/**
 * 2026 Indian Equity (NSE/BSE) scheduled full trading holidays (YYYY-MM-DD in IST).
 * Source reference: official NSE/BSE 2026 holiday circulars.
 * Special Muhurat trading session (Diwali) is tracked separately so it is not misclassified as normal full day.
 */
const NSE_BSE_HOLIDAYS_2026: Readonly<Record<string, string>> = {
  "2026-01-26": "Republic Day",
  "2026-03-03": "Holi",
  "2026-03-26": "Shri Ram Navami",
  "2026-03-31": "Shri Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
  "2026-05-01": "Maharashtra Day",
  "2026-05-28": "Bakri Id",
  "2026-06-26": "Muharram",
  "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-10": "Diwali Balipratipada",
  "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
  "2026-12-25": "Christmas",
};

/**
 * 2026 MCX full-day holidays (morning + evening both closed).
 * Note: On several Indian public holidays MCX closes morning (09:00-17:00) and opens evening (17:00-23:30/23:55).
 */
const MCX_FULL_HOLIDAYS_2026: Readonly<Record<string, string>> = {
  "2026-01-26": "Republic Day",
  "2026-04-03": "Good Friday",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-12-25": "Christmas",
};

const MCX_MORNING_CLOSED_EVENING_OPEN_2026: Readonly<Record<string, string>> = {
  "2026-01-01": "New Year's Day (MCX evening closed; morning open 09:00-17:00)",
  "2026-03-03": "Holi (MCX morning closed; evening 17:00-23:55 IST)",
  "2026-03-26": "Ram Navami (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-03-31": "Mahavir Jayanti (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-04-14": "Ambedkar Jayanti (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-05-01": "Maharashtra Day (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-05-28": "Bakri Id (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-06-26": "Muharram (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-09-14": "Ganesh Chaturthi (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-10-20": "Dussehra (MCX morning closed; evening 17:00-23:30 IST)",
  "2026-11-10": "Diwali Balipratipada (MCX morning closed; evening 17:00-23:55 IST)",
  "2026-11-24": "Guru Nanak Jayanti (MCX morning closed; evening 17:00-23:55 IST)",
};

const SPECIAL_SESSIONS_2026: Readonly<Record<string, string>> = {
  "2026-11-08": "Diwali Laxmi Pujan (Sunday special Muhurat trading session only)",
};

function istParts(nowMs: number) {
  const d = new Date(nowMs);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  return {
    year,
    dateIST: `${year}-${month}-${day}`,
    timeIST: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
    weekday,
    minutes: hour * 60 + minute,
    monthNum: Number(month),
  };
}

export function formatIstTimestamp(utcIsoOrMs: string | number | null): string | null {
  if (utcIsoOrMs === null) return null;
  const ms = typeof utcIsoOrMs === "number" ? utcIsoOrMs : Date.parse(utcIsoOrMs);
  if (!Number.isFinite(ms)) return null;
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  return `${formatted} IST`;
}

function isUsWinterDstForMcx(dateIST: string): boolean {
  // US Standard Time runs from 1st Sunday in November through 2nd Sunday in March (MCX closes 23:55 IST vs 23:30 IST).
  const [y, m, d] = dateIST.split("-").map(Number);
  if (m >= 12 || m <= 2) return true;
  if (m >= 4 && m <= 10) return false;
  if (m === 11) return d >= 2;
  if (m === 3) return d < 9;
  void y;
  return false;
}

/**
 * Returns IST session open/close windows (minutes since 00:00 IST) for a given exchange and IST calendar date.
 * Returns null on full holidays and regular weekends so out-of-session bars are cleanly excluded.
 */
export function getExchangeSessionWindowMinutes(
  exchange: ExchangeCode,
  dateIST: string,
): { openMinutes: number; closeMinutes: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIST)) return null;
  const day = new Date(`${dateIST}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return null;
  if (exchange === "NSE" || exchange === "BSE") {
    if (NSE_BSE_HOLIDAYS_2026[dateIST]) return null;
    return { openMinutes: 9 * 60 + 15, closeMinutes: 15 * 60 + 30 };
  }
  if (MCX_FULL_HOLIDAYS_2026[dateIST]) return null;
  const closeMinutes = isUsWinterDstForMcx(dateIST) ? 23 * 60 + 55 : 23 * 60 + 30;
  if (MCX_MORNING_CLOSED_EVENING_OPEN_2026[dateIST]) {
    if (dateIST === "2026-01-01") {
      return { openMinutes: 9 * 60, closeMinutes: 17 * 60 };
    }
    return { openMinutes: 17 * 60, closeMinutes };
  }
  return { openMinutes: 9 * 60, closeMinutes };
}

export function getIstDateAndMinutes(utcMs: number): {
  dateIST: string;
  minutesIST: number;
} {
  const p = istParts(utcMs);
  return { dateIST: p.dateIST, minutesIST: p.minutes };
}

export function getIndianExchangeSession(
  exchange: ExchangeCode,
  nowMs = Date.now(),
): ExchangeSessionInfo {
  const mic = exchange === "NSE" ? "XNSE" : exchange === "BSE" ? "XBOM" : "XMCX";
  const serverTimestampUTC = new Date(nowMs).toISOString();
  const p = istParts(nowMs);
  const mcxCloseMinutes = isUsWinterDstForMcx(p.dateIST) ? 23 * 60 + 55 : 23 * 60 + 30;
  const mcxHours = isUsWinterDstForMcx(p.dateIST)
    ? "09:00–23:55 IST (Mon–Fri)"
    : "09:00–23:30 IST (Mon–Fri)";
  const regularHoursIST =
    exchange === "MCX" ? mcxHours : "09:15–15:30 IST (Mon–Fri; Pre-open 09:00–09:15)";

  if (p.year !== "2026") {
    return {
      exchange,
      mic,
      state: "SCHEDULE_UNKNOWN",
      label: "Schedule unverified",
      reason: `Verified holiday calendar covers 2026 only (observed ${p.year}); live status is never assumed.`,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: null,
      specialSessionNote: null,
      verifiedThrough: "2026-12-31",
      calendarStatus: "UNVERIFIED_YEAR",
    };
  }

  const specialNote = SPECIAL_SESSIONS_2026[p.dateIST] ?? null;

  if (p.weekday === "Sat" || p.weekday === "Sun") {
    return {
      exchange,
      mic,
      state: "CLOSED",
      label: "Market closed (weekend)",
      reason: specialNote
        ? `${specialNote}. Regular session closed on ${p.weekday}; quotes reflect last trading session.`
        : `${exchange} regular market is closed on ${p.weekday}. Any returned quote reflects a prior session.`,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: null,
      specialSessionNote: specialNote,
      verifiedThrough: "2026-12-31",
      calendarStatus: "VERIFIED_2026",
    };
  }

  if (exchange === "NSE" || exchange === "BSE") {
    const holiday = NSE_BSE_HOLIDAYS_2026[p.dateIST];
    if (holiday) {
      return {
        exchange,
        mic,
        state: "HOLIDAY",
        label: `Exchange holiday (${holiday})`,
        reason: `${exchange} is closed for ${holiday}. Returned quotes are from the prior session, never live.`,
        timezone: IST_TZ,
        localDateIST: p.dateIST,
        localTimeIST: p.timeIST,
        serverTimestampUTC,
        regularHoursIST,
        holidayName: holiday,
        specialSessionNote: specialNote,
        verifiedThrough: "2026-12-31",
        calendarStatus: "VERIFIED_2026",
      };
    }

    if (p.minutes >= 9 * 60 && p.minutes < 9 * 60 + 15) {
      return {
        exchange,
        mic,
        state: "PRE_OPEN",
        label: "Pre-open session",
        reason: `${exchange} equity pre-open window (09:00–09:15 IST). Continuous trading starts at 09:15 IST.`,
        timezone: IST_TZ,
        localDateIST: p.dateIST,
        localTimeIST: p.timeIST,
        serverTimestampUTC,
        regularHoursIST,
        holidayName: null,
        specialSessionNote: specialNote,
        verifiedThrough: "2026-12-31",
        calendarStatus: "VERIFIED_2026",
      };
    }

    const open = p.minutes >= 9 * 60 + 15 && p.minutes < 15 * 60 + 30;
    return {
      exchange,
      mic,
      state: open ? "OPEN" : "CLOSED",
      label: open ? "Session open (scheduled)" : "After market hours",
      reason: open
        ? `${exchange} scheduled regular cash session is open (09:15–15:30 IST). Exchange halts are not independently monitored.`
        : `${exchange} regular cash session is closed (hours 09:15–15:30 IST). Quotes reflect last available session prices.`,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: null,
      specialSessionNote: specialNote,
      verifiedThrough: "2026-12-31",
      calendarStatus: "VERIFIED_2026",
    };
  }

  // MCX commodity futures calendar
  const mcxFullHoliday = MCX_FULL_HOLIDAYS_2026[p.dateIST];
  if (mcxFullHoliday) {
    return {
      exchange: "MCX",
      mic: "XMCX",
      state: "HOLIDAY",
      label: `MCX holiday (${mcxFullHoliday})`,
      reason: `MCX is closed all day for ${mcxFullHoliday}. Returned quotes reflect the prior session.`,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: mcxFullHoliday,
      specialSessionNote: specialNote,
      verifiedThrough: "2026-12-31",
      calendarStatus: "VERIFIED_2026",
    };
  }

  const mcxPartial = MCX_MORNING_CLOSED_EVENING_OPEN_2026[p.dateIST];
  if (mcxPartial) {
    if (p.dateIST === "2026-01-01") {
      const open = p.minutes >= 9 * 60 && p.minutes < 17 * 60;
      return {
        exchange: "MCX",
        mic: "XMCX",
        state: open ? "OPEN" : "HOLIDAY",
        label: open ? "MCX morning open (evening holiday)" : "MCX evening holiday",
        reason: mcxPartial,
        timezone: IST_TZ,
        localDateIST: p.dateIST,
        localTimeIST: p.timeIST,
        serverTimestampUTC,
        regularHoursIST,
        holidayName: open ? null : "New Year's Day (Evening)",
        specialSessionNote: mcxPartial,
        verifiedThrough: "2026-12-31",
        calendarStatus: "VERIFIED_2026",
      };
    }
    const eveningOpen = p.minutes >= 17 * 60 && p.minutes < mcxCloseMinutes;
    return {
      exchange: "MCX",
      mic: "XMCX",
      state: eveningOpen ? "OPEN" : "HOLIDAY",
      label: eveningOpen ? "MCX evening session open" : "MCX morning holiday",
      reason: mcxPartial,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: eveningOpen ? null : mcxPartial,
      specialSessionNote: mcxPartial,
      verifiedThrough: "2026-12-31",
      calendarStatus: "VERIFIED_2026",
    };
  }

  const mcxOpen = p.minutes >= 9 * 60 && p.minutes < mcxCloseMinutes;
  return {
    exchange: "MCX",
    mic: "XMCX",
    state: mcxOpen ? "OPEN" : "CLOSED",
    label: mcxOpen ? "MCX session open (scheduled)" : "MCX closed",
    reason: mcxOpen
      ? `MCX scheduled commodity futures session is open (${mcxHours}). Individual agricultural contract hours may close earlier.`
      : `MCX commodity futures session is closed (${mcxHours}). Quotes reflect last traded session prices.`,
    timezone: IST_TZ,
    localDateIST: p.dateIST,
    localTimeIST: p.timeIST,
    serverTimestampUTC,
    regularHoursIST,
    holidayName: null,
    specialSessionNote: specialNote,
    verifiedThrough: "2026-12-31",
    calendarStatus: "VERIFIED_2026",
  };
}

export function getAllIndianExchangeSessions(
  nowMs = Date.now(),
): Record<ExchangeCode, ExchangeSessionInfo> {
  return {
    NSE: getIndianExchangeSession("NSE", nowMs),
    BSE: getIndianExchangeSession("BSE", nowMs),
    MCX: getIndianExchangeSession("MCX", nowMs),
  };
}

/** 2026 CME Globex NYMEX Energy full-day holidays (YYYY-MM-DD in America/New_York). */
const NYMEX_FULL_HOLIDAYS_2026: Readonly<Record<string, string>> = {
  "2026-01-01": "New Year's Day",
  "2026-04-03": "Good Friday",
  "2026-12-25": "Christmas Day",
};

/**
 * Computes schedule-based session status for NYMEX WTI Crude (CME Globex energy hours)
 * using IANA America/New_York DST rules:
 * - Opens Sunday 18:00 ET, closes Friday 17:00 ET
 * - Daily maintenance break 17:00–18:00 ET Mon–Thu
 * Never uses NYSE cash-equity hours or Indian equity hours.
 */
export function getNymexGlobexSession(nowMs = Date.now()): {
  state: ExchangeSessionState;
  label: string;
  timezone: string;
  reason: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const dateEt = `${year}-${get("month")}-${get("day")}`;
  const weekday = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));

  if (year !== "2026") {
    return {
      state: "SCHEDULE_UNKNOWN",
      label: "Schedule unverified",
      timezone: "America/New_York",
      reason: "Verified NYMEX Globex holiday schedule covers 2026 only.",
    };
  }
  const holiday = NYMEX_FULL_HOLIDAYS_2026[dateEt];
  if (holiday) {
    return {
      state: "HOLIDAY",
      label: `Closed (${holiday})`,
      timezone: "America/New_York",
      reason: `NYMEX Globex is closed for ${holiday}.`,
    };
  }
  if (weekday === "Sat") {
    return {
      state: "CLOSED",
      label: "Closed (weekend)",
      timezone: "America/New_York",
      reason: "NYMEX Globex WTI Crude is closed on Saturday.",
    };
  }
  if (weekday === "Sun") {
    const open = minutes >= 18 * 60;
    return {
      state: open ? "OPEN" : "CLOSED",
      label: open ? "Globex open" : "Closed (weekend)",
      timezone: "America/New_York",
      reason: open
        ? "NYMEX Globex electronic energy session open (Sun 18:00–Fri 17:00 ET)."
        : "NYMEX Globex opens Sunday at 18:00 ET.",
    };
  }
  if (weekday === "Fri") {
    const open = minutes < 17 * 60;
    return {
      state: open ? "OPEN" : "CLOSED",
      label: open ? "Globex open" : "Market closed",
      timezone: "America/New_York",
      reason: open
        ? "NYMEX Globex electronic energy session open until 17:00 ET."
        : "NYMEX Globex closed for the weekend at 17:00 ET.",
    };
  }
  // Mon–Thu: open except daily 17:00–18:00 ET maintenance window
  const maintenance = minutes >= 17 * 60 && minutes < 18 * 60;
  return {
    state: maintenance ? "CLOSED" : "OPEN",
    label: maintenance ? "Daily break" : "Globex open",
    timezone: "America/New_York",
    reason: maintenance
      ? "NYMEX Globex daily 60-minute maintenance break (17:00–18:00 ET)."
      : "NYMEX Globex electronic energy session open (Mon–Fri, 17:00–18:00 ET daily break).",
  };
}

export function qualityDisplayLabel(quality: DataQualityState): string {
  switch (quality) {
    case "VERIFIED_REAL_LIVE":
      return "VERIFIED LIVE";
    case "VERIFIED_REAL_DELAYED":
      return "DELAYED REAL";
    case "VERIFIED_LAST_AVAILABLE":
      return "LAST AVAILABLE";
    case "REAL_BUT_STALE":
      return "STALE REAL";
    case "MARKET_CLOSED_LAST":
      return "MARKET CLOSED · LAST";
    case "DEMO":
      return "DEMO / SYNTHETIC";
    case "NO_DATA":
    default:
      return "NO DATA";
  }
}

export function classifyQuoteQuality(input: {
  ltp: number | null;
  observationTimeMs: number | null;
  retrievalTimeMs: number;
  nowMs: number;
  session: ExchangeSessionInfo;
  isDemo?: boolean;
}): { quality: DataQualityState; isLive: boolean; reason: string } {
  if (input.isDemo) {
    return {
      quality: "DEMO",
      isLive: false,
      reason: "Explicit DEMO / SYNTHETIC development mode. Not real exchange market data.",
    };
  }

  if (input.ltp === null || !Number.isFinite(input.ltp) || input.ltp <= 0) {
    return {
      quality: "NO_DATA",
      isLive: false,
      reason: "No valid last traded price returned by provider.",
    };
  }

  const sessionState: ExchangeSessionState = input.session.state;
  if (sessionState === "CLOSED" || sessionState === "HOLIDAY") {
    return {
      quality: "MARKET_CLOSED_LAST",
      isLive: false,
      reason: `${input.session.label}. Price reflects the prior trading session, not a live tick.`,
    };
  }

  if (sessionState === "SCHEDULE_UNKNOWN") {
    return {
      quality: "VERIFIED_LAST_AVAILABLE",
      isLive: false,
      reason: `${input.session.reason} Quote is shown as last available rather than LIVE.`,
    };
  }

  if (input.observationTimeMs === null || !Number.isFinite(input.observationTimeMs)) {
    return {
      quality: "REAL_BUT_STALE",
      isLive: false,
      reason: "Provider returned a price without a verified observation timestamp; cannot confirm live freshness.",
    };
  }

  const ageMs = input.nowMs - input.observationTimeMs;
  if (ageMs < -120_000) {
    return {
      quality: "REAL_BUT_STALE",
      isLive: false,
      reason: "Observation timestamp is significantly ahead of server clock (clock skew detected).",
    };
  }

  if (sessionState === "PRE_OPEN") {
    return {
      quality: "VERIFIED_LAST_AVAILABLE",
      isLive: false,
      reason: "Exchange is in pre-open session; quote reflects pre-open/prior close indication.",
    };
  }

  // Exchange is scheduled OPEN:
  if (ageMs <= 60_000) {
    return {
      quality: "VERIFIED_REAL_LIVE",
      isLive: true,
      reason: "Verified broker quote observed within 60 seconds during scheduled open session.",
    };
  }
  if (ageMs <= 15 * 60_000) {
    return {
      quality: "VERIFIED_REAL_DELAYED",
      isLive: false,
      reason: `Verified broker quote delayed by ${Math.round(ageMs / 60_000)} min relative to server time.`,
    };
  }
  return {
    quality: "REAL_BUT_STALE",
    isLive: false,
    reason: "Exchange is open, but latest broker observation is older than 15 minutes (illiquid or stale feed).",
  };
}
