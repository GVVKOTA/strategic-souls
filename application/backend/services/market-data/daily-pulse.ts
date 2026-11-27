/**
 * Strategic Souls X5.3 — MARKET VOX (NIFTY 50 & Gold Community Vote).
 *
 * Non-negotiable integrity & timing rules:
 * - Server-time-gated only (never trusts client clock).
 * - Strict BOTH-bound window enforcement on GET and POST:
 *     opensAtUtc <= authoritative_server_now < closesAtUtc
 * - NIFTY 50 (NSE Cash Equity — verified 2026 NSE Holiday Calendar):
 *     Opens at 15:30 IST (10:00 UTC) on the prior NSE trading day AFTER market close.
 *     Closes at 09:15 IST (03:45 UTC) BEFORE the target NSE trading session opens (never at session close!).
 *     During regular NSE market hours (09:15–15:30 IST), voting is CLOSED (upcoming next-session poll opens at 15:30 IST).
 * - Gold (GLOBAL:XAUUSD International OTC Spot Benchmark — explicitly NOT MCX Gold futures):
 *     Opens at 21:00 UTC on the prior weekday (after NY OTC daily close).
 *     Closes at 07:00 UTC on the target weekday (before London active session).
 * - Exact 4 choices with transparent percentage cutoffs:
 *     STRONG_RISE  (> +1.0%)
 *     SLIGHT_RISE  (0.0% to +1.0%)
 *     SLIGHT_FALL  (-1.0% to 0.0%)
 *     STRONG_FALL  (< -1.0%)
 * - 1 effective vote per authenticated account per poll (PK (poll_id, subject) in x52_market_poll_votes).
 * - Public aggregate counts & percentages (0 votes -> 0%, never NaN).
 * - STRICT EXCLUSION: NO personal win rates, NO prediction scorecards, NO leaderboards.
 */

import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { getExchangeSessionWindowMinutes } from "./exchange-calendar";

export type PollUnderlying = "NIFTY50" | "GOLD";
export type PollChoice =
  | "STRONG_RISE"
  | "SLIGHT_RISE"
  | "SLIGHT_FALL"
  | "STRONG_FALL";

export const POLL_CHOICES: readonly {
  id: PollChoice;
  label: string;
  cutoff: string;
}[] = Object.freeze([
  { id: "STRONG_RISE", label: "Strong Rise", cutoff: "> +1.0%" },
  { id: "SLIGHT_RISE", label: "Slight Rise", cutoff: "0% to +1.0%" },
  { id: "SLIGHT_FALL", label: "Slight Fall", cutoff: "-1.0% to 0%" },
  { id: "STRONG_FALL", label: "Strong Fall", cutoff: "< -1.0%" },
]);

const VALID_CHOICES = new Set<string>(POLL_CHOICES.map((c) => c.id));

// Official 2026 NSE Cash Equity Holidays (source: NSE circular)
export const NSE_HOLIDAYS_2026 = new Set([
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-05-28",
  "2026-06-26",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24",
  "2026-12-25",
]);

function istDateParts(ms: number): {
  ymd: string;
  weekday: string;
  minutesSinceMidnight: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutesSinceMidnight: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function isNseTradingDay(ymd: string): boolean {
  return getExchangeSessionWindowMinutes("NSE", ymd) !== null;
}

function isWeekdayYmd(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
  return d !== 0 && d !== 6;
}

function addDaysYmd(ymd: string, delta: number): string {
  const ms = Date.parse(`${ymd}T00:00:00.000Z`) + delta * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function nextTradingDay(ymd: string, check: (d: string) => boolean): string {
  let probe = addDaysYmd(ymd, 1);
  for (let i = 0; i < 14; i++) {
    if (check(probe)) return probe;
    probe = addDaysYmd(probe, 1);
  }
  return probe;
}

function prevTradingDay(ymd: string, check: (d: string) => boolean): string {
  let probe = addDaysYmd(ymd, -1);
  for (let i = 0; i < 14; i++) {
    if (check(probe)) return probe;
    probe = addDaysYmd(probe, -1);
  }
  return probe;
}

export type PollWindowState = "UPCOMING" | "OPEN" | "CLOSED";

export function evaluatePollWindow(
  opensAtUtc: string,
  closesAtUtc: string,
  nowMs: number,
  storedStatus?: string,
): { isOpen: boolean; windowState: PollWindowState } {
  const openMs = Date.parse(opensAtUtc);
  const closeMs = Date.parse(closesAtUtc);
  if (
    !Number.isFinite(openMs) ||
    !Number.isFinite(closeMs) ||
    storedStatus === "CLOSED"
  ) {
    return { isOpen: false, windowState: "CLOSED" };
  }
  if (nowMs < openMs) {
    return { isOpen: false, windowState: "UPCOMING" };
  }
  if (nowMs >= closeMs) {
    return { isOpen: false, windowState: "CLOSED" };
  }
  return { isOpen: true, windowState: "OPEN" };
}

/**
 * Resolves the active Market Vox poll spec for NIFTY 50 or Gold at server timestamp `nowMs`.
 *
 * NIFTY 50 (NSE Cash Equity, UTC+05:30, no DST):
 * - Regular session: 09:15 IST (03:45 UTC) to 15:30 IST (10:00 UTC).
 * - Next-session poll for trading day T opens AFTER prior trading day T_prev closes (15:30 IST)
 *   and closes BEFORE session T opens (09:15 IST).
 * - During live market hours on T (09:15 IST <= now < 15:30 IST), returns the upcoming poll for T_next
 *   with opensAtUtc = T 15:30 IST (so status is strictly CLOSED/UPCOMING until 15:30 IST!).
 *
 * Gold (GLOBAL:XAUUSD OTC Spot Benchmark — explicitly NOT MCX Gold futures):
 * - Post-close vote window: prior weekday 21:00 UTC (NY OTC close) to target weekday 07:00 UTC
 *   (before London active session).
 * - During 07:00 UTC <= now < 21:00 UTC on a weekday, returns upcoming T_next poll with
 *   opensAtUtc = T 21:00 UTC (status strictly CLOSED/UPCOMING until 21:00 UTC).
 */
export function resolveActivePollSpec(
  underlying: PollUnderlying,
  nowMs = Date.now(),
): {
  pollId: string;
  underlying: PollUnderlying;
  sessionDate: string;
  opensAtUtc: string;
  closesAtUtc: string;
  referenceLabel: string;
  cutoffNote: string;
} {
  if (underlying === "NIFTY50") {
    const ist = istDateParts(nowMs);
    const todayTrading = isNseTradingDay(ist.ymd);
    const OPEN_MINS = 9 * 60 + 15; // 09:15 IST (03:45 UTC)

    let targetDay: string;
    if (todayTrading && ist.minutesSinceMidnight < OPEN_MINS) {
      // Pre-market on a trading day: today's poll is still open until 09:15 IST
      targetDay = ist.ymd;
    } else {
      // Either live market hours (09:15..15:30 IST -> upcoming next-session poll, closed until 15:30 IST),
      // post-close (>= 15:30 IST -> open for next session), or weekend/holiday (-> open since prior close)
      targetDay = nextTradingDay(ist.ymd, isNseTradingDay);
    }

    const priorSession = prevTradingDay(targetDay, isNseTradingDay);
    // 15:30 IST == 10:00 UTC; 09:15 IST == 03:45 UTC (IST has no DST)
    const opensAtUtc = `${priorSession}T10:00:00.000Z`;
    const closesAtUtc = `${targetDay}T03:45:00.000Z`;

    return {
      pollId: `poll:NIFTY50:${targetDay}`,
      underlying: "NIFTY50",
      sessionDate: targetDay,
      opensAtUtc,
      closesAtUtc,
      referenceLabel: "NIFTY 50 (NSE Cash · Post-Close 15:30 IST to Pre-Open 09:15 IST)",
      cutoffNote:
        "Opens after prior NSE close (15:30 IST) and closes strictly at 09:15 IST before the next session opens (uses 2026 NSE holiday calendar). Community vote only — not a market probability.",
    };
  }

  // GOLD: International OTC XAU/USD daily reference benchmark (NOT MCX Gold futures)
  const utc = new Date(nowMs);
  const utcYmd = utc.toISOString().slice(0, 10);
  const utcMins = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  const GOLD_CUTOFF_MINS = 7 * 60; // 07:00 UTC (before London active session)

  let targetDay: string;
  if (isWeekdayYmd(utcYmd) && utcMins < GOLD_CUTOFF_MINS) {
    targetDay = utcYmd;
  } else {
    targetDay = nextTradingDay(utcYmd, isWeekdayYmd);
  }

  const priorWeekday = prevTradingDay(targetDay, isWeekdayYmd);
  const opensAtUtc = `${priorWeekday}T21:00:00.000Z`;
  const closesAtUtc = `${targetDay}T07:00:00.000Z`;

  return {
    pollId: `poll:GOLD:${targetDay}`,
    underlying: "GOLD",
    sessionDate: targetDay,
    opensAtUtc,
    closesAtUtc,
    referenceLabel: "Gold Spot GLOBAL:XAUUSD OTC (21:00 UTC Close · Not MCX Futures)",
    cutoffNote:
      "Benchmark: international OTC XAU/USD (not MCX Gold futures). Opens at 21:00 UTC after NY close and closes at 07:00 UTC before London session. Community vote only — not a forecast.",
  };
}

export type MarketPulsePollSnapshot = {
  pollId: string;
  underlying: PollUnderlying;
  title: string;
  sessionDate: string;
  opensAtUtc: string;
  closesAtUtc: string;
  status: "OPEN" | "CLOSED";
  windowState: PollWindowState;
  referenceLabel: string;
  cutoffNote: string;
  totalVotes: number;
  myVote: PollChoice | null;
  tallies: {
    choice: PollChoice;
    label: string;
    cutoff: string;
    count: number;
    pct: number; // Strictly 0 when totalVotes === 0 (never NaN)
  }[];
};

async function ensurePollRow(
  spec: ReturnType<typeof resolveActivePollSpec>,
  nowIso: string,
): Promise<void> {
  // Upsert schedule metadata so any legacy X5.2 row inherits exact X5.3 open/close bounds without losing votes
  await database()
    .prepare(
      `INSERT INTO x52_market_polls
         (poll_id, underlying, session_date, opens_at_utc, closes_at_utc, status, reference_label, cutoff_note, created_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
       ON CONFLICT(poll_id) DO UPDATE SET
         opens_at_utc = excluded.opens_at_utc,
         closes_at_utc = excluded.closes_at_utc,
         reference_label = excluded.reference_label,
         cutoff_note = excluded.cutoff_note`,
    )
    .bind(
      spec.pollId,
      spec.underlying,
      spec.sessionDate,
      spec.opensAtUtc,
      spec.closesAtUtc,
      spec.referenceLabel,
      spec.cutoffNote,
      nowIso,
    )
    .run();
}

export async function getDailyPulsePolls(
  viewerSubject: string | null,
  nowMs = Date.now(),
): Promise<{
  asOfUTC: string;
  polls: MarketPulsePollSnapshot[];
  disclosure: string;
}> {
  const nowIso = new Date(nowMs).toISOString();
  const specs = [
    resolveActivePollSpec("NIFTY50", nowMs),
    resolveActivePollSpec("GOLD", nowMs),
  ];
  const db = database();

  await Promise.all(specs.map((s) => ensurePollRow(s, nowIso)));

  const polls: MarketPulsePollSnapshot[] = await Promise.all(
    specs.map(async (spec) => {
      const [tallyRes, myRow] = await Promise.all([
        db
          .prepare(
            "SELECT choice, count(*) AS cnt FROM x52_market_poll_votes WHERE poll_id=? GROUP BY choice",
          )
          .bind(spec.pollId)
          .all<{ choice: string; cnt: number }>(),
        viewerSubject
          ? db
              .prepare(
                "SELECT choice FROM x52_market_poll_votes WHERE poll_id=? AND subject=?",
              )
              .bind(spec.pollId, viewerSubject)
              .first<{ choice: string }>()
          : Promise.resolve(null),
      ]);

      const counts = new Map<string, number>();
      let totalVotes = 0;
      for (const r of tallyRes.results ?? []) {
        const n = Number(r.cnt ?? 0);
        counts.set(r.choice, n);
        totalVotes += n;
      }

      const win = evaluatePollWindow(spec.opensAtUtc, spec.closesAtUtc, nowMs);
      const tallies = POLL_CHOICES.map((c) => {
        const count = counts.get(c.id) ?? 0;
        const pct =
          totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
        return {
          choice: c.id,
          label: c.label,
          cutoff: c.cutoff,
          count,
          pct,
        };
      });

      return {
        pollId: spec.pollId,
        underlying: spec.underlying,
        title:
          spec.underlying === "NIFTY50"
            ? "NIFTY 50 · Next Session Vote"
            : "Gold (XAU/USD OTC) · Next Session Vote",
        sessionDate: spec.sessionDate,
        opensAtUtc: spec.opensAtUtc,
        closesAtUtc: spec.closesAtUtc,
        status: win.isOpen ? "OPEN" : "CLOSED",
        windowState: win.windowState,
        referenceLabel: spec.referenceLabel,
        cutoffNote: spec.cutoffNote,
        totalVotes,
        myVote:
          myRow && VALID_CHOICES.has(myRow.choice)
            ? (myRow.choice as PollChoice)
            : null,
        tallies,
      };
    }),
  );

  return {
    asOfUTC: nowIso,
    polls,
    disclosure:
      "Market Vox displays aggregate community votes only (1 vote per signed-in account per session; zero individual win rates or leaderboards). Vote shares are NOT market probabilities or investment advice.",
  };
}

export async function castDailyPulseVote(
  subject: string,
  input: { pollId?: unknown; choice?: unknown },
  nowMs = Date.now(),
): Promise<MarketPulsePollSnapshot> {
  await rate(subject + ":x52-pulse-vote", 30, 60_000);

  const pollId = typeof input.pollId === "string" ? input.pollId.trim() : "";
  const choice =
    typeof input.choice === "string" ? input.choice.trim().toUpperCase() : "";
  if (!/^poll:(NIFTY50|GOLD):\d{4}-\d{2}-\d{2}$/.test(pollId)) {
    throw new HttpError(400, "Invalid Market Vox poll identifier.");
  }
  if (!VALID_CHOICES.has(choice)) {
    throw new HttpError(
      400,
      "Choose Strong Rise, Slight Rise, Slight Fall, or Strong Fall.",
    );
  }

  const db = database();
  const nowIso = new Date(nowMs).toISOString();

  // Ensure account row exists (satisfies FK to accounts(subject) for authenticated users)
  const acc = await account(subject);
  if (!acc) {
    throw new HttpError(
      403,
      "Complete account onboarding before voting in Market Vox.",
    );
  }

  // Ensure active poll rows exist before reading requested poll
  const underlying = pollId.split(":")[1] as PollUnderlying;
  const activeSpec = resolveActivePollSpec(underlying, nowMs);
  await ensurePollRow(activeSpec, nowIso);

  const pollRow = await db
    .prepare(
      "SELECT poll_id, underlying, session_date, opens_at_utc, closes_at_utc, status, reference_label, cutoff_note FROM x52_market_polls WHERE poll_id=?",
    )
    .bind(pollId)
    .first<{
      poll_id: string;
      underlying: PollUnderlying;
      session_date: string;
      opens_at_utc: string;
      closes_at_utc: string;
      status: string;
      reference_label: string;
      cutoff_note: string;
    }>();

  if (!pollRow) {
    throw new HttpError(404, "Market Vox poll not found.");
  }

  // Strict server-time BOTH-bound enforcement: opensAtUtc <= nowMs < closesAtUtc
  const win = evaluatePollWindow(
    pollRow.opens_at_utc,
    pollRow.closes_at_utc,
    nowMs,
    pollRow.status,
  );
  if (win.windowState === "UPCOMING") {
    throw new HttpError(
      409,
      `Voting for ${pollRow.reference_label} (${pollRow.session_date}) has not opened yet. Opens at ${pollRow.opens_at_utc}.`,
    );
  }
  if (!win.isOpen) {
    throw new HttpError(
      409,
      `Voting for ${pollRow.reference_label} (${pollRow.session_date}) closed at ${pollRow.closes_at_utc}.`,
    );
  }

  // Atomic 1-vote-per-account-per-poll upsert via PRIMARY KEY(poll_id, subject)
  await db
    .prepare(
      `INSERT INTO x52_market_poll_votes (poll_id, subject, choice, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(poll_id, subject) DO UPDATE SET
         choice = excluded.choice,
         updated_at = excluded.updated_at`,
    )
    .bind(pollId, subject, choice, nowIso, nowIso)
    .run();

  const fresh = await getDailyPulsePolls(subject, nowMs);
  const matched = fresh.polls.find((p) => p.pollId === pollId);
  if (!matched) {
    throw new HttpError(
      409,
      "Poll session rolled over; refresh to vote on the active session.",
    );
  }
  return matched;
}
