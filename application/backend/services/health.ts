export type HealthMode = "live" | "ready";

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
  };
};

type MinimalD1Like = {
  prepare: (sql: string) => {
    first: <T = Record<string, unknown>>() => Promise<T | null>;
  };
};

/**
 * Evaluates sanitized Worker liveness and optional D1 readiness without triggering
 * external market-data quotas or exposing credentials, stack traces, or user data.
 */
export async function evaluateHealthReadiness(input: {
  mode: HealthMode;
  db?: MinimalD1Like | null;
  buildCommit: string | null;
  workerVersionId: string | null;
  now?: Date;
}): Promise<{ statusCode: 200 | 503; body: HealthCheckPayload }> {
  const checkedAtUtc = (input.now ?? new Date()).toISOString();
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
      },
    },
  };
}
