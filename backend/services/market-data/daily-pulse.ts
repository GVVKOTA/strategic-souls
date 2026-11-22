/**
 * Strategic Souls Post-X5.1 — [19] NIFTY 50 & Gold Daily Market Pulse Polls.
 *
 * Non-negotiable integrity rules:
 * - Server-time-gated only (never trusts client clock).
 * - NIFTY 50 uses verified 2026 NSE equity session dates & 15:30 IST close cutoff.
 * - Gold uses clearly disclosed daily reference session (21:00 UTC close cutoff).
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
const NSE_HOLIDAYS_2026 = new Set([
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

function isNseTradingDay(ymd: string): boolean {
  const dt = new Date(`${ymd}T06:00:00.000Z`);
  const day = dt.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (NSE_HOLIDAYS_2026.has(ymd)) return false;
  return true;
}

function addDaysYmd(ymd: string, delta: number): string {
  const ms = Date.parse(`${ymd}T00:00:00.000Z`) + delta * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Resolves the active trading session poll window for NIFTY 50 or Gold at server timestamp `nowMs`.
 * - NIFTY 50: closes 15:30 IST (10:00:00.000Z) on the active/next NSE trading day.
 *   After 15:30 IST, opens the poll for the NEXT NSE trading day automatically!
 * - GOLD: closes 21:00 UTC on weekdays (Mon–Fri); rolls to next weekday after 21:00 UTC.
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
    let targetDay = ist.ymd;
    // If today is a trading day and past 15:30 IST (930 min), advance to next NSE trading day
    if (!isNseTradingDay(targetDay) || ist.minutesSinceMidnight >= 15 * 60 + 30) {
      let probe = addDaysYmd(targetDay, 1);
      for (let i = 0; i < 14; i++) {
        if (isNseTradingDay(probe)) {
          targetDay = probe;
          break;
        }
        probe = addDaysYmd(probe, 1);
      }
    }
    // 15:30 IST == 10:00 UTC (India has no DST, always UTC+05:30)
    const closesAtUtc = `${targetDay}T10:00:00.000Z`;
    const opensAtUtc = `${addDaysYmd(targetDay, -1)}T10:00:00.000Z`;
    return {
      pollId: `poll:NIFTY50:${targetDay}`,
      underlying: "NIFTY50",
      sessionDate: targetDay,
      opensAtUtc,
      closesAtUtc,
      referenceLabel: "NIFTY 50 (NSE Cash Close · 15:30 IST)",
      cutoffNote:
        "Votes close strictly at 15:30 IST (NSE close). Strong Rise > +1.0%, Slight Rise 0% to +1.0%, Slight Fall -1.0% to 0%, Strong Fall < -1.0%.",
    };
  }

  // GOLD (GLOBAL:XAUUSD OTC daily reference session, closes 21:00 UTC weekdays)
  const utc = new Date(nowMs);
  let targetDay = utc.toISOString().slice(0, 10);
  const utcMins = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  const isWeekday = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
    return d !== 0 && d !== 6;
  };
  if (!isWeekday(targetDay) || utcMins >= 21 * 60) {
    let probe = addDaysYmd(targetDay, 1);
    for (let i = 0; i < 7; i++) {
      if (isWeekday(probe)) {
        targetDay = probe;
        break;
      }
      probe = addDaysYmd(probe, 1);
    }
  }
  const closesAtUtc = `${targetDay}T21:00:00.000Z`;
  const opensAtUtc = `${addDaysYmd(targetDay, -1)}T21:00:00.000Z`;
  return {
    pollId: `poll:GOLD:${targetDay}`,
    underlying: "GOLD",
    sessionDate: targetDay,
    opensAtUtc,
    closesAtUtc,
    referenceLabel: "Gold Spot Reference (21:00 UTC Daily Close)",
    cutoffNote:
      "Votes close strictly at 21:00 UTC (02:30 IST next day). Cutoffs: Strong > ±1.0%, Slight within ±1.0%. Community sentiment only — not a forecast.",
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
  await database()
    .prepare(
      `INSERT OR IGNORE INTO x52_market_polls
         (poll_id, underlying, session_date, opens_at_utc, closes_at_utc, status, reference_label, cutoff_note, created_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
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

      const isClosed = nowMs >= Date.parse(spec.closesAtUtc);
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
            ? "NIFTY 50 Daily Pulse"
            : "Gold Daily Pulse",
        sessionDate: spec.sessionDate,
        opensAtUtc: spec.opensAtUtc,
        closesAtUtc: spec.closesAtUtc,
        status: isClosed ? "CLOSED" : "OPEN",
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
      "Aggregate community sentiment snapshot only (1 vote per signed-in account per session; zero individual win-rate scorecards or leaderboards). Not investment advice.",
  };
}

export async function castDailyPulseVote(
  subject: string,
  input: { pollId?: unknown; choice?: unknown },
  nowMs = Date.now(),
): Promise<MarketPulsePollSnapshot> {
  await rate(subject + ":x52-pulse-vote", 30, 60_000);

  const pollId = typeof input.pollId === "string" ? input.pollId.trim() : "";
  const choice = typeof input.choice === "string" ? input.choice.trim().toUpperCase() : "";
  if (!/^poll:(NIFTY50|GOLD):\d{4}-\d{2}-\d{2}$/.test(pollId)) {
    throw new HttpError(400, "Invalid market pulse poll identifier.");
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
      "Complete account onboarding before participating in Daily Market Pulse.",
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
    throw new HttpError(404, "Market pulse poll not found.");
  }

  // Strict server-time cutoff enforcement
  const closeMs = Date.parse(pollRow.closes_at_utc);
  if (!Number.isFinite(closeMs) || nowMs >= closeMs || pollRow.status === "CLOSED") {
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
    throw new HttpError(409, "Poll session rolled over; refresh to vote on the active session.");
  }
  return matched;
}
