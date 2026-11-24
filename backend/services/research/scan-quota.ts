/** Shared atomic allowance across all user-initiated scans, reset at midnight IST. */
import type { database } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";

export type QuotaDb = ReturnType<typeof database>;

export const SCAN_DAILY_LIMIT = 20;
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
  await expireStaleReservations(db, nowIso);
  const row = await db.prepare(
    `SELECT count(*) AS n FROM x51_scan_reservations
     WHERE subject=? AND ist_day=?
       AND (state='COMPLETED' OR (state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?))`,
  ).bind(subject, istDay, nowIso).first<{ n: number }>();
  const used = Number(row?.n ?? 0);
  return {
    classic: { limit: SCAN_DAILY_LIMIT, used, remaining: Math.max(0, SCAN_DAILY_LIMIT - used), istDay, resetsAtUTC },
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

  const res = await db.prepare(
    `INSERT OR IGNORE INTO x51_scan_reservations
       (id, subject, tier, idempotency_key, ist_day, state, lease_expires_at, completed_at, scan_id, created_at)
     SELECT ?, ?, ?, ?, ?, 'RESERVED', ?, NULL, NULL, ?
     WHERE (
       SELECT count(*) FROM x51_scan_reservations
       WHERE subject=? AND ist_day=?
         AND (state='COMPLETED' OR (state IN ('RESERVED','RUNNING') AND lease_expires_at >= ?))
     ) < ?`,
  ).bind(reservationId, subject, tier, idempotencyKey, istDay, leaseExpiresAt,
    nowIso, subject, istDay, nowIso, SCAN_DAILY_LIMIT).run();

  if (!res.meta.changes) {
    const winner = await db.prepare(
      "SELECT id, state, scan_id FROM x51_scan_reservations WHERE subject=? AND idempotency_key=?",
    ).bind(subject, idempotencyKey).first<{ id: string; state: string; scan_id: string | null }>();
    if (winner?.state === "COMPLETED" && winner.scan_id)
      return { id: winner.id, tier, reusedCompletedScanId: winner.scan_id };
    if (winner) throw new HttpError(409, "This scan request is already running.");
    throw new HttpError(429, "Daily scan allowance reached. Your 20 scans reset at midnight IST.");
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
