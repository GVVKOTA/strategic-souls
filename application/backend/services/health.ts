export type HealthMode = "live" | "ready";

export type HeartbeatTaskStatus = {
  taskName: string;
  lastStatus: string;
  lastRunAt: string;
  lastOkAt: string | null;
  ageMinutes: number | null;
  maxAgeMinutes: number;
  stale: boolean;
};

export type HealthCheckPayload = {
  status: "ok" | "degraded";
  service: "strategic-souls";
  mode: HealthMode;
  checkedAtUtc: string;
  buildCommit: string | null;
  workerVersionId: string | null;
  provenance: "IDENTIFIED" | "UNAVAILABLE";
  checks: {
    worker: { ok: true };
    database: { checked: boolean; ok: boolean; latencyMs: number | null };
    heartbeats?: {
      checked: boolean;
      ok: boolean;
      staleCount: number;
      tasks: HeartbeatTaskStatus[];
    };
  };
};

type MinimalD1Statement = {
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all?: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
};

type MinimalD1Like = {
  prepare: (sql: string) => MinimalD1Statement;
};

const HEARTBEAT_MAX_AGE_MINUTES: Record<string, number> = {
  soul_memory_ist_midnight_reset: 26 * 60, // Daily at 00:00 IST with 2h grace
  shared_history_refresh: 26 * 60, // Daily market history refresh with 2h grace
  market_scan_worker: 45, // Periodic scan worker / reaper
};

const DEFAULT_HEARTBEAT_MAX_AGE_MINUTES = 120;

async function inspectHeartbeats(
  db: MinimalD1Like,
  nowMs: number,
): Promise<NonNullable<HealthCheckPayload["checks"]["heartbeats"]>> {
  try {
    const stmt = db.prepare(
      "SELECT job_key, last_started_at, last_succeeded_at, last_status FROM x9_system_heartbeats ORDER BY job_key ASC",
    );
    if (typeof stmt.all !== "function") {
      return { checked: false, ok: true, staleCount: 0, tasks: [] };
    }
    const res = await stmt.all<{
      job_key: string;
      last_started_at: string;
      last_succeeded_at: string | null;
      last_status: string;
    }>();
    const rows = Array.isArray(res?.results) ? res.results : [];
    const tasks: HeartbeatTaskStatus[] = rows.map((row) => {
      const taskName = String(row.job_key ?? "unknown");
      const maxAgeMinutes =
        HEARTBEAT_MAX_AGE_MINUTES[taskName] ?? DEFAULT_HEARTBEAT_MAX_AGE_MINUTES;
      const lastOkMs = row.last_succeeded_at
        ? Date.parse(row.last_succeeded_at)
        : NaN;
      const ageMinutes = Number.isFinite(lastOkMs)
        ? Math.max(0, Math.round((nowMs - lastOkMs) / 60_000))
        : null;
      const stale =
        row.last_status !== "OK" ||
        ageMinutes === null ||
        ageMinutes > maxAgeMinutes;
      return {
        taskName,
        lastStatus: String(row.last_status ?? "UNKNOWN"),
        lastRunAt: String(row.last_started_at ?? ""),
        lastOkAt: row.last_succeeded_at ? String(row.last_succeeded_at) : null,
        ageMinutes,
        maxAgeMinutes,
        stale,
      };
    });
    const staleCount = tasks.filter((t) => t.stale).length;
    return {
      checked: true,
      ok: staleCount === 0,
      staleCount,
      tasks,
    };
  } catch {
    // Graceful fallback if x9_system_heartbeats migration (0021) is not yet applied
    return { checked: false, ok: true, staleCount: 0, tasks: [] };
  }
}

/**
 * Evaluates sanitized Worker liveness, D1 readiness, and optional scheduled cron heartbeats
 * without triggering external market-data quotas or exposing credentials, stack traces, or user data.
 */
export async function evaluateHealthReadiness(input: {
  mode: HealthMode;
  db?: MinimalD1Like | null;
  buildCommit: string | null;
  workerVersionId: string | null;
  includeHeartbeats?: boolean;
  now?: Date;
}): Promise<{ statusCode: 200 | 503; body: HealthCheckPayload }> {
  const nowDate = input.now ?? new Date();
  const checkedAtUtc = nowDate.toISOString();
  const provenance =
    input.buildCommit && input.workerVersionId ? "IDENTIFIED" : "UNAVAILABLE";

  if (input.mode === "live") {
    return {
      statusCode: 200,
      body: {
        status: "ok",
        service: "strategic-souls",
        mode: "live",
        checkedAtUtc,
        buildCommit: input.buildCommit,
        workerVersionId: input.workerVersionId,
        provenance,
        checks: {
          worker: { ok: true },
          database: { checked: false, ok: true, latencyMs: null },
        },
      },
    };
  }

  let dbOk = false;
  let latencyMs: number | null = null;
  if (input.db) {
    const started = performance.now();
    try {
      const row = await input.db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      latencyMs = Math.max(0, Math.round(performance.now() - started));
      dbOk = row?.ok === 1;
    } catch {
      latencyMs = Math.max(0, Math.round(performance.now() - started));
      dbOk = false;
    }
  }

  const heartbeats =
    dbOk && input.db && input.includeHeartbeats === true
      ? await inspectHeartbeats(input.db, nowDate.getTime())
      : undefined;

  return {
    statusCode: dbOk ? 200 : 503,
    body: {
      status: dbOk ? "ok" : "degraded",
      service: "strategic-souls",
      mode: "ready",
      checkedAtUtc,
      buildCommit: input.buildCommit,
      workerVersionId: input.workerVersionId,
      provenance,
      checks: {
        worker: { ok: true },
        database: { checked: true, ok: dbOk, latencyMs },
        ...(heartbeats ? { heartbeats } : {}),
      },
    },
  };
}
