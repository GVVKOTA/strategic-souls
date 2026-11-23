/**
 * Strategic Souls X5.1 — Atomic, Race-Safe Scan Quota State Machine.
 * - Classic: 8 SUCCESSFULLY COMPLETED scans per account per Asia/Kolkata civil day (resets 00:00 IST).
 * - Advanced: 1 SUCCESSFULLY COMPLETED scan per rolling 60 minutes (no midnight reset).
 * - Failed/blocked runs release reservation and NEVER deduct user allowance.
 * - Valid completed scans with zero matching stocks DO count toward allowance.
 */
import type { database } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";

export type QuotaDb = ReturnType<typeof database>;

export const CLASSIC_DAILY_LIMIT = 8;
export const ADVANCED_ROLLING_LIMIT = 1;
export const ADVANCED_ROLLING_WINDOW_MS = 60 * 60 * 1000;
export const RESERVATION_LEASE_MS = 90 * 1000;

export type ScanQuotaTier = "CLASSIC" | "ADVANCED";

export type ScanQuotaSummary = {
  classic: {
    limit: number;
    used: number;
    remaining: number;
    istDay: string;
    resetsAtUTC: string;
  };
  advanced: {
    limit: number;
    usedInWindow: number;
    remaining: number;
    rollingWindowMinutes: number;
    lastCompletedAtUTC: string | null;
    nextEligibleAtUTC: string | null;
  };
  serverTimeUTC: string;
};

const IST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns YYYY-MM-DD in IANA Asia/Kolkata civil calendar day. */
export function istCalendarDay(nowMs: number): string {
  return IST_DATE_FMT.format(new Date(nowMs));
}

/** Returns exact UTC ISO timestamp for the next 00:00:00 Asia/Kolkata reset. */
export function nextIstMidnightUtc(nowMs: number): string {
  const istDay = istCalendarDay(nowMs);
  const [y, m, d] = istDay.split("-").map(Number);
  // IST is UTC+05:30 with no DST; next civil midnight IST = (y, m-1, d+1) 00:00 IST = (y, m-1, d) 18:30:00Z
  const nextMidnightUtcMs = Date.UTC(y, m - 1, d, 18, 30, 0, 0);
  if (nextMidnightUtcMs <= nowMs) {
    return new Date(nextMidnightUtcMs + 86_400_000).toISOString();
  }
  return new Date(nextMidnightUtcMs).toISOString();
}

async function expireStaleReservations(db: QuotaDb, nowIso: string): Promise<void> {
  try {
    await db
      .prepare(
        "UPDATE x51_scan_reservations SET state='EXPIRED' WHERE state IN ('RESERVED','RUNNING') AND lease_expires_at < ?",
      )
      .bind(nowIso)
      .run();
  } catch {
    // Graceful no-op if migration 0008 hasn't been applied in an isolated legacy test fixture
  }
}

export async function getScanQuotaSummary(
  db: QuotaDb,
  subject: string,
  nowMs = Date.now(),
): Promise<ScanQuotaSummary> {
  const nowIso = new Date(nowMs).toISOString();
  const istDay = istCalendarDay(nowMs);
  const resetsAtUTC = nextIstMidnightUtc(nowMs);
  const windowStartIso = new Date(
    nowMs - ADVANCED_ROLLING_WINDOW_MS,
  ).toISOString();

  await expireStaleReservations(db, nowIso);

  let classicUsed = 0;
  let advCompletedAt: string | null = null;
  let advActiveCount = 0;

  try {
    const [classicRow, advRow] = await Promise.all([
      db
        .prepare(
          `SELECT count(*) AS n FROM x51_scan_reservations
           WHERE subject=? AND tier='CLASSIC' AND ist_day=?
             AND (state='COMPLETED' OR (state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?))`,
        )
        .bind(subject, istDay, nowIso)
        .first<{ n: number }>(),
      db
        .prepare(
          `SELECT
             MAX(CASE WHEN state='COMPLETED' AND completed_at > ? THEN completed_at END) AS last_completed,
             SUM(CASE WHEN (state='COMPLETED' AND completed_at > ?) OR (state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?) THEN 1 ELSE 0 END) AS active_count
           FROM x51_scan_reservations
           WHERE subject=? AND tier='ADVANCED'`,
        )
        .bind(windowStartIso, windowStartIso, nowIso, subject)
        .first<{ last_completed: string | null; active_count: number | null }>(),
    ]);

    classicUsed = Number(classicRow?.n ?? 0);
    advCompletedAt = advRow?.last_completed ?? null;
    advActiveCount = Number(advRow?.active_count ?? 0);
  } catch {
    // Fallback if table does not exist yet
  }

  const nextEligibleAtUTC =
    advCompletedAt !== null
      ? new Date(
          Date.parse(advCompletedAt) + ADVANCED_ROLLING_WINDOW_MS,
        ).toISOString()
      : advActiveCount > 0
        ? new Date(nowMs + RESERVATION_LEASE_MS).toISOString()
        : null;

  return {
    classic: {
      limit: CLASSIC_DAILY_LIMIT,
      used: classicUsed,
      remaining: Math.max(0, CLASSIC_DAILY_LIMIT - classicUsed),
      istDay,
      resetsAtUTC,
    },
    advanced: {
      limit: ADVANCED_ROLLING_LIMIT,
      usedInWindow: Math.min(ADVANCED_ROLLING_LIMIT, advActiveCount),
      remaining: Math.max(0, ADVANCED_ROLLING_LIMIT - advActiveCount),
      rollingWindowMinutes: 60,
      lastCompletedAtUTC: advCompletedAt,
      nextEligibleAtUTC,
    },
    serverTimeUTC: nowIso,
  };
}

export type ReservationHandle = {
  id: string;
  tier: ScanQuotaTier;
  reusedCompletedScanId: string | null;
};

/**
 * Atomically reserves one scan slot using conditional SQL INSERT ... SELECT ... WHERE.
 * Prevents concurrent multi-device requests from both consuming the final slot.
 */
export async function reserveScanSlot(
  db: QuotaDb,
  subject: string,
  tier: ScanQuotaTier,
  idempotencyKey: string,
  nowMs = Date.now(),
): Promise<ReservationHandle> {
  const nowIso = new Date(nowMs).toISOString();
  const leaseExpiresAt = new Date(nowMs + RESERVATION_LEASE_MS).toISOString();
  const istDay = istCalendarDay(nowMs);
  const windowStartIso = new Date(
    nowMs - ADVANCED_ROLLING_WINDOW_MS,
  ).toISOString();

  await expireStaleReservations(db, nowIso);

  // Check if this exact idempotencyKey already has a reservation row
  const existing = await db
    .prepare(
      "SELECT id, tier, state, scan_id FROM x51_scan_reservations WHERE subject=? AND idempotency_key=?",
    )
    .bind(subject, idempotencyKey)
    .first<{
      id: string;
      tier: string;
      state: string;
      scan_id: string | null;
    }>()
    .catch(() => null);

  if (existing) {
    if (existing.state === "COMPLETED" && existing.scan_id) {
      return {
        id: existing.id,
        tier,
        reusedCompletedScanId: existing.scan_id,
      };
    }
    if (existing.state === "RESERVED" || existing.state === "RUNNING") {
      throw new HttpError(
        409,
        "This scan request is already running. Wait for it to finish.",
      );
    }
    // Previous attempt failed or expired; remove stale failed row so clean retry can reserve
    await db
      .prepare(
        "DELETE FROM x51_scan_reservations WHERE id=? AND subject=? AND state IN ('FAILED','CANCELLED','EXPIRED')",
      )
      .bind(existing.id, subject)
      .run();
  }

  const reservationId = crypto.randomUUID();

  if (tier === "CLASSIC") {
    const res = await db
      .prepare(
        `INSERT OR IGNORE INTO x51_scan_reservations
           (id, subject, tier, idempotency_key, ist_day, state, lease_expires_at, completed_at, scan_id, created_at)
         SELECT ?, ?, 'CLASSIC', ?, ?, 'RESERVED', ?, NULL, NULL, ?
         WHERE (
           SELECT count(*) FROM x51_scan_reservations
           WHERE subject=? AND tier='CLASSIC' AND ist_day=?
             AND (state='COMPLETED' OR (state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?))
         ) < ?`,
      )
      .bind(
        reservationId,
        subject,
        idempotencyKey,
        istDay,
        leaseExpiresAt,
        nowIso,
        subject,
        istDay,
        nowIso,
        CLASSIC_DAILY_LIMIT,
      )
      .run();

    if (!res.meta.changes) {
      const nextReset = nextIstMidnightUtc(nowMs);
      throw new HttpError(
        429,
        `Classic scan allowance reached (${CLASSIC_DAILY_LIMIT}/${CLASSIC_DAILY_LIMIT} completed scans for ${istDay} IST). Resets at ${nextReset} (00:00 IST).`,
      );
    }
  } else {
    const res = await db
      .prepare(
        `INSERT OR IGNORE INTO x51_scan_reservations
           (id, subject, tier, idempotency_key, ist_day, state, lease_expires_at, completed_at, scan_id, created_at)
         SELECT ?, ?, 'ADVANCED', ?, ?, 'RESERVED', ?, NULL, NULL, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM x51_scan_reservations
           WHERE subject=? AND tier='ADVANCED'
             AND (
               (state='COMPLETED' AND completed_at > ?)
               OR (state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?)
             )
         )`,
      )
      .bind(
        reservationId,
        subject,
        idempotencyKey,
        istDay,
        leaseExpiresAt,
        nowIso,
        subject,
        windowStartIso,
        nowIso,
      )
      .run();

    if (!res.meta.changes) {
      const summary = await getScanQuotaSummary(db, subject, nowMs);
      const nextText = summary.advanced.nextEligibleAtUTC
        ? ` Next eligible at ${summary.advanced.nextEligibleAtUTC}.`
        : " Another Advanced scan is currently active.";
      throw new HttpError(
        429,
        `Advanced scan limit is 1 completed scan per rolling 60 minutes.${nextText}`,
      );
    }
  }

  return { id: reservationId, tier, reusedCompletedScanId: null };
}

export async function persistReservedScan(
  db: QuotaDb,
  scan: {
    reservationId: string;
    subject: string;
    id: string;
    requestKey: string;
    mode: string;
    name: string;
    payload: string;
    digest: string;
    completedAt: string;
  },
): Promise<void> {
  if (new TextEncoder().encode(scan.payload).byteLength > 1_500_000)
    throw new HttpError(413, "This scan snapshot is too large. Narrow the instrument selection and retry.");
  // A Worker/DB failure cannot leave a saved result and an uncharged reservation.
  const [stored, completed] = await db.batch([
    db.prepare(`
      INSERT INTO x1_scans (id,subject,request_key,mode,name,payload,digest,created_at)
      SELECT ?,?,?,?,?,?,?,?
      WHERE EXISTS (
        SELECT 1 FROM x51_scan_reservations WHERE id=? AND subject=? AND idempotency_key=?
          AND state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?
      )
    `).bind(scan.id, scan.subject, scan.requestKey, scan.mode, scan.name, scan.payload,
      scan.digest, scan.completedAt, scan.reservationId, scan.subject, scan.requestKey, scan.completedAt),
    db.prepare(`
      UPDATE x51_scan_reservations SET state='COMPLETED', completed_at=?, scan_id=?
      WHERE id=? AND subject=? AND idempotency_key=? AND state IN ('RESERVED','RUNNING')
        AND EXISTS (SELECT 1 FROM x1_scans WHERE id=? AND subject=? AND request_key=?)
    `).bind(scan.completedAt, scan.id, scan.reservationId, scan.subject, scan.requestKey,
      scan.id, scan.subject, scan.requestKey),
  ]);
  if (stored.meta.changes !== 1 || completed.meta.changes !== 1)
    throw new HttpError(409, "The scan reservation expired before the result could be saved. Retry the scan.");
}

export async function releaseScanReservation(
  db: QuotaDb,
  reservationId: string,
  subject: string,
  state: "FAILED" | "CANCELLED" = "FAILED",
): Promise<void> {
  await db
    .prepare(
      "UPDATE x51_scan_reservations SET state=? WHERE id=? AND subject=? AND state IN ('RESERVED','RUNNING')",
    )
    .bind(state, reservationId, subject)
    .run()
    .catch(() => {
      /* Release is best-effort; lease expiry guarantees cleanup. */
    });
}
