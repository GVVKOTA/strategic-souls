/**
 * Single authoritative calendar-based exchange session & freshness classifier.
 * Covers NSE, BSE, MCX (Asia/Kolkata) and NYMEX Globex (America/New_York) with
 * official 2026–2027 schedules, verified special sessions (including NSE/BSE Union Budget
 * Sunday 1 Feb 2026), and fail-closed SCHEDULE_UNKNOWN outside verified calendar years.
 */

export type ExchangeCode = "NSE" | "BSE" | "MCX";
export type ExchangeSessionState =
  | "OPEN"
  | "PRE_OPEN"
  | "CLOSED"
  | "HOLIDAY"
  | "SCHEDULE_UNKNOWN";

export type ExchangeCalendarStatus =
  | "VERIFIED_2026"
  | "VERIFIED_2027"
  | "UNVERIFIED_YEAR";

export type ExchangeSessionInfo = {
  exchange: ExchangeCode;
  mic: "XNSE" | "XBOM" | "XMCX";
  state: ExchangeSessionState;
  label: string;
  reason: string;
  timezone: "Asia/Kolkata";
  localDateIST: string;
  localTimeIST: string;
  serverTimestampUTC: string;
  regularHoursIST: string;
  holidayName: string | null;
  specialSessionNote: string | null;
  verifiedThrough: string;
  calendarStatus: ExchangeCalendarStatus;
  calendarVersion?: string;
  calendarSource?: string;
};

export const EXCHANGE_CALENDAR_METADATA = Object.freeze({
  version: "ss-x3-calendar-2026-2027.1",
  verifiedThrough: "2027-12-31",
  verifiedYears: ["2026", "2027"] as readonly string[],
  source:
    "Official NSE/BSE/MCX holiday & special session circulars (incl. NSE/CMTR/72349) and CME Globex holiday schedule",
  updatedAt: "2026-11-28",
});

const IST_TZ = "Asia/Kolkata" as const;

type SpecialSessionSpec = {
  exchanges: readonly ExchangeCode[];
  preOpenMinutes?: number;
  openMinutes: number;
  closeMinutes: number;
  label: string;
  note: string;
  circular: string;
};

/**
 * 2026 Indian Equity (NSE/BSE) scheduled full trading holidays (YYYY-MM-DD in IST).
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
 * 2027 Indian Equity (NSE/BSE) weekday scheduled trading holidays (YYYY-MM-DD in IST).
 * Weekend holidays (e.g. Mahashivratri Sat, Independence Day Sun, Ganesh Chaturthi Sat,
 * Gandhi Jayanti Sat, Dussehra Sun, Guru Nanak Jayanti Sun, Christmas Sat) fall on weekends.
 */
const NSE_BSE_HOLIDAYS_2027: Readonly<Record<string, string>> = {
  "2027-01-26": "Republic Day",
  "2027-03-22": "Holi",
  "2027-03-26": "Good Friday",
  "2027-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
  "2027-04-15": "Shri Ram Navami",
  "2027-04-19": "Shri Mahavir Jayanti",
  "2027-05-17": "Bakri Id",
  "2027-06-16": "Muharram",
  "2027-10-28": "Diwali Laxmi Pujan (Muhurat session only)",
  "2027-10-29": "Diwali Balipratipada",
};

const NSE_BSE_HOLIDAYS_BY_YEAR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "2026": NSE_BSE_HOLIDAYS_2026,
  "2027": NSE_BSE_HOLIDAYS_2027,
};

/** 2026–2027 MCX full-day holidays (morning + evening both closed). */
const MCX_FULL_HOLIDAYS_BY_YEAR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "2026": {
    "2026-01-26": "Republic Day",
    "2026-04-03": "Good Friday",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-12-25": "Christmas",
  },
  "2027": {
    "2027-01-26": "Republic Day",
    "2027-03-26": "Good Friday",
  },
};

const MCX_PARTIAL_HOLIDAYS_BY_YEAR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "2026": {
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
  },
  "2027": {
    "2027-01-01": "New Year's Day (MCX evening closed; morning open 09:00-17:00)",
    "2027-03-22": "Holi (MCX morning closed; evening 17:00-23:30 IST)",
    "2027-04-14": "Ambedkar Jayanti (MCX morning closed; evening 17:00-23:30 IST)",
    "2027-04-15": "Ram Navami (MCX morning closed; evening 17:00-23:30 IST)",
    "2027-04-19": "Mahavir Jayanti (MCX morning closed; evening 17:00-23:30 IST)",
    "2027-05-17": "Bakri Id (MCX morning closed; evening 17:00-23:30 IST)",
    "2027-06-16": "Muharram (MCX morning closed; evening 17:00-23:30 IST)",
    "2027-10-29": "Diwali Balipratipada (MCX morning closed; evening 17:00-23:30 IST)",
  },
};

/**
 * Verified special live trading sessions that override weekend closure (evaluated BEFORE Sat/Sun check).
 */
const SPECIAL_TRADING_SESSIONS: Readonly<Record<string, SpecialSessionSpec>> = {
  "2026-02-01": {
    exchanges: ["NSE", "BSE"],
    preOpenMinutes: 9 * 60,
    openMinutes: 9 * 60 + 15,
    closeMinutes: 15 * 60 + 30,
    label: "Special session open (Union Budget)",
    note: "Union Budget 2026 Special Trading Session (Sunday 09:15–15:30 IST; circular NSE/CMTR/72349)",
    circular: "NSE/CMTR/72349",
  },
};

const SPECIAL_SESSION_NOTES: Readonly<Record<string, string>> = {
  "2026-02-01": "Union Budget 2026 Special Trading Session (Sunday 09:15–15:30 IST; NSE/CMTR/72349)",
  "2026-11-08": "Diwali Laxmi Pujan (Sunday special Muhurat trading session only)",
};

export function isVerifiedCalendarYear(year: string): year is "2026" | "2027" {
  return year === "2026" || year === "2027";
}

function calendarStatusForYear(year: string): ExchangeCalendarStatus {
  if (year === "2026") return "VERIFIED_2026";
  if (year === "2027") return "VERIFIED_2027";
  return "UNVERIFIED_YEAR";
}

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
  const [year, month, day] = dateIST.split("-").map(Number);
  if (month < 3 || month >= 12) return true;
  if (month > 3 && month < 11) return false;
  const firstSunday = 1 + ((7 - new Date(Date.UTC(year, month - 1, 1)).getUTCDay()) % 7);
  return month === 11 ? day >= firstSunday : day < firstSunday + 7;
}

/**
 * Returns IST session open/close windows (minutes since 00:00 IST) for a given exchange and IST calendar date.
 * Evaluates verified special weekend sessions BEFORE regular weekend exclusion.
 * Returns null on full holidays and non-special weekends.
 */
export function getExchangeSessionWindowMinutes(
  exchange: ExchangeCode,
  dateIST: string,
): { openMinutes: number; closeMinutes: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIST)) return null;
  const special = SPECIAL_TRADING_SESSIONS[dateIST];
  if (special && special.exchanges.includes(exchange)) {
    return { openMinutes: special.openMinutes, closeMinutes: special.closeMinutes };
  }
  const day = new Date(`${dateIST}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return null;
  const year = dateIST.slice(0, 4);
  if (exchange === "NSE" || exchange === "BSE") {
    const yearHolidays = NSE_BSE_HOLIDAYS_BY_YEAR[year];
    if (yearHolidays?.[dateIST]) return null;
    return { openMinutes: 9 * 60 + 15, closeMinutes: 15 * 60 + 30 };
  }
  const mcxFull = MCX_FULL_HOLIDAYS_BY_YEAR[year];
  if (mcxFull?.[dateIST]) return null;
  const closeMinutes = isUsWinterDstForMcx(dateIST) ? 23 * 60 + 55 : 23 * 60 + 30;
  const mcxPartial = MCX_PARTIAL_HOLIDAYS_BY_YEAR[year];
  if (mcxPartial?.[dateIST]) {
    if (dateIST.endsWith("-01-01")) {
      return { openMinutes: 9 * 60, closeMinutes: 17 * 60 };
    }
    return { openMinutes: 17 * 60, closeMinutes };
  }
  return { openMinutes: 9 * 60, closeMinutes };
}

export function previousExchangeSession(exchange: ExchangeCode, date: string) {
  const day = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(day)) return null;
  for (let offset = 1; offset <= 10; offset++) {
    const previous = new Date(day - offset * 86_400_000).toISOString().slice(0, 10);
    if (getExchangeSessionWindowMinutes(exchange, previous)) return previous;
  }
  return null;
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
  const calStatus = calendarStatusForYear(p.year);
  const meta = {
    verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
    calendarStatus: calStatus,
    calendarVersion: EXCHANGE_CALENDAR_METADATA.version,
    calendarSource: EXCHANGE_CALENDAR_METADATA.source,
  };

  if (!isVerifiedCalendarYear(p.year)) {
    return {
      exchange,
      mic,
      state: "SCHEDULE_UNKNOWN",
      label: "Schedule unverified",
      reason: `Verified holiday calendar covers 2026–2027 only (observed ${p.year}); live status is never assumed.`,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: null,
      specialSessionNote: null,
      ...meta,
    };
  }

  const specialNote = SPECIAL_SESSION_NOTES[p.dateIST] ?? null;

  // Evaluate verified special trading sessions BEFORE weekend exclusion (e.g. NSE/BSE 1 Feb 2026 Union Budget Sunday).
  const specialSession = SPECIAL_TRADING_SESSIONS[p.dateIST];
  if (specialSession && specialSession.exchanges.includes(exchange)) {
    if (
      specialSession.preOpenMinutes !== undefined &&
      p.minutes >= specialSession.preOpenMinutes &&
      p.minutes < specialSession.openMinutes
    ) {
      return {
        exchange,
        mic,
        state: "PRE_OPEN",
        label: "Pre-open (special session)",
        reason: `${specialSession.note}. Pre-open window active.`,
        timezone: IST_TZ,
        localDateIST: p.dateIST,
        localTimeIST: p.timeIST,
        serverTimestampUTC,
        regularHoursIST,
        holidayName: null,
        specialSessionNote: specialSession.note,
        ...meta,
      };
    }
    const open =
      p.minutes >= specialSession.openMinutes && p.minutes < specialSession.closeMinutes;
    return {
      exchange,
      mic,
      state: open ? "OPEN" : "CLOSED",
      label: open ? specialSession.label : "Special session closed",
      reason: open
        ? `${specialSession.note}. Exchange halts are not independently monitored.`
        : `${specialSession.note}. Outside special session hours; quotes reflect prior session prices.`,
      timezone: IST_TZ,
      localDateIST: p.dateIST,
      localTimeIST: p.timeIST,
      serverTimestampUTC,
      regularHoursIST,
      holidayName: null,
      specialSessionNote: specialSession.note,
      ...meta,
    };
  }

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
      ...meta,
    };
  }

  if (exchange === "NSE" || exchange === "BSE") {
    const holiday = NSE_BSE_HOLIDAYS_BY_YEAR[p.year]?.[p.dateIST];
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
        ...meta,
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
        ...meta,
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
      ...meta,
    };
  }

  // MCX commodity futures calendar
  const mcxFullHoliday = MCX_FULL_HOLIDAYS_BY_YEAR[p.year]?.[p.dateIST];
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
      ...meta,
    };
  }

  const mcxPartial = MCX_PARTIAL_HOLIDAYS_BY_YEAR[p.year]?.[p.dateIST];
  if (mcxPartial) {
    if (p.dateIST.endsWith("-01-01")) {
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
        ...meta,
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
      ...meta,
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
    ...meta,
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

/** 2026–2027 CME Globex NYMEX Energy full-day holidays (YYYY-MM-DD in America/New_York). */
const NYMEX_FULL_HOLIDAYS_BY_YEAR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "2026": {
    "2026-01-01": "New Year's Day",
    "2026-04-03": "Good Friday",
    "2026-12-25": "Christmas Day",
  },
  "2027": {
    "2027-01-01": "New Year's Day",
    "2027-03-26": "Good Friday",
    "2027-12-24": "Christmas Day (Observed)",
  },
};

export function getNymexGlobexSession(nowMs = Date.now()): {
  state: ExchangeSessionState;
  label: string;
  timezone: string;
  reason: string;
  verifiedThrough: string;
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

  if (!isVerifiedCalendarYear(year)) {
    return {
      state: "SCHEDULE_UNKNOWN",
      label: "Schedule unverified",
      timezone: "America/New_York",
      reason: `Verified NYMEX Globex holiday schedule covers 2026–2027 only (observed ${year}).`,
      verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
    };
  }
  const holiday = NYMEX_FULL_HOLIDAYS_BY_YEAR[year]?.[dateEt];
  if (holiday) {
    return {
      state: "HOLIDAY",
      label: `Closed (${holiday})`,
      timezone: "America/New_York",
      reason: `NYMEX Globex is closed for ${holiday}.`,
      verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
    };
  }
  if (weekday === "Sat") {
    return {
      state: "CLOSED",
      label: "Closed (weekend)",
      timezone: "America/New_York",
      reason: "NYMEX Globex WTI Crude is closed on Saturday.",
      verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
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
      verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
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
      verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
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
    verifiedThrough: EXCHANGE_CALENDAR_METADATA.verifiedThrough,
  };
}
