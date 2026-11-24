import { database } from "../../../database/queries/repository";
import { digest } from "../../engines/engine";
import { compileFormula, computeScanMetrics, evaluateScan, requiredScanBars,
  type ScanReport, type ScanResult } from "../../engines/scan";
import { matchDrawnPattern, validateStrokePoints, type DrawPoint, type DrawScanReport } from "../../engines/pattern-draw";
import { HttpError } from "../../middleware/security";
import { canScanExchange, researchUniverse, type ResearchUniverse } from "../market-data/data-service";
import { NIFTY_500_COUNT, niftyUniverse } from "../market-data/nifty-500";
import { validateResearch, validateScanRequestScope, type ResearchDefinition } from "./research";
import { reserveScanSlot, releaseScanReservation, type ScanQuotaTier } from "./scan-quota";

const BATCH_SIZE = 5;
const JOB_MS = 4 * 60 * 60_000;
const WORKER_LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;

type Input = {
  definition: ResearchDefinition;
  origin: "CLASSIC" | "BUILD" | "DISCOVER" | "DRAW";
  draw?: { points: DrawPoint[]; windowBars: number; minPatternFit: number };
};
type State = "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "CANCELLED";
type Job = {
  id: string; subject: string; request_key: string; reservation_id: string; request_digest: string;
  universe_version: string; input: string; cutoff: string; deadline: string; state: State;
  cursor: number; evaluated: number; lease: string | null; attempts: number; scan_id: string | null;
};
type Outcome = ScanResult & { patternFit?: number };
type Batch = { rows: Outcome[]; lineage: ResearchUniverse["lineage"]; drawReport?: DrawScanReport };

const jobStatus = (job: Job) => ({
  jobId: job.id, state: job.state, progress: Math.round(job.cursor * 100 / NIFTY_500_COUNT),
  ...(job.scan_id ? { id: job.scan_id } : {}),
});

function parseInput(raw: Record<string, unknown>): Input {
  const definitionInput = {
    ...raw, instrumentIds: [], universe: "CONNECTED_MARKETS", universePreset: "MARKET",
    watchlistId: undefined, customCsv: undefined, partialPolicy: "ALLOW_UNKNOWN",
  };
  try {
    validateScanRequestScope(definitionInput);
    if (raw.action === "run-draw-scan") {
      if (!Array.isArray(raw.strokePoints) || raw.strokePoints.length > 400)
        throw new Error("Draw a shape or choose a pattern template.");
      const points = validateStrokePoints(raw.strokePoints as DrawPoint[]);
      const windowBars = Number(raw.windowBars ?? 20);
      const minPatternFit = Number(raw.minPatternFit ?? 75);
      if (!Number.isInteger(windowBars) || windowBars < 8 || windowBars > 60 ||
          !Number.isFinite(minPatternFit) || minPatternFit < 35 || minPatternFit > 95)
        throw new Error("Use an 8–60 bar lookback and 35–95% similarity.");
      const definition = validateResearch({
        ...definitionInput, mode: "ADVANCED", formula: "close > 0",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
      });
      matchDrawnPattern(points, [], { windowBars, minPatternFit });
      return { definition, origin: "DRAW", draw: { points, windowBars, minPatternFit } };
    }
    const definition = validateResearch(definitionInput);
    compileFormula(definition.formula);
    const origin = definition.mode === "SIMPLE" ? "CLASSIC" : raw.origin === "DISCOVER" ? "DISCOVER" : "BUILD";
    return { definition, origin };
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

export async function submitMarketScan(subject: string, raw: Record<string, unknown>) {
  const requestKey = raw.requestId;
  if (typeof requestKey !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey))
    throw new HttpError(400, "Stable request ID required.");
  const input = parseInput(raw);
  const signature = await digest(input);
  const db = database();
  const prior = () => db.prepare("SELECT * FROM x78_market_scan_jobs WHERE subject=? AND request_key=?")
    .bind(subject, requestKey).first<Job>();
  const confirm = (job: Job) => {
    if (job.request_digest !== signature) throw new HttpError(409, "This request ID belongs to a different scan.");
    return jobStatus(job);
  };
  const existing = await prior();
  if (existing) return confirm(existing);
  const universe = await niftyUniverse();
  if (!universe) throw new HttpError(503, "The market constituent snapshot is unavailable. No scan was charged.");
  if (!await canScanExchange(subject, input.definition.interval))
    throw new HttpError(503, "Market history is unavailable for this account and timeframe. No scan was charged.");
  const cutoff = new Date().toISOString();
  const deadline = new Date(Date.parse(cutoff) + JOB_MS).toISOString();
  const tier: ScanQuotaTier = input.origin === "CLASSIC" ? "CLASSIC" : "ADVANCED";
  try {
    const reservation = await reserveScanSlot(db, subject, tier, requestKey, Date.parse(cutoff), JOB_MS);
    if (reservation.reusedCompletedScanId)
      throw new HttpError(409, "This request ID belongs to a previous scan.");
    try {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO x78_market_scan_jobs
         (id,subject,request_key,request_digest,reservation_id,universe_version,input,cutoff,deadline,state)
         VALUES (?,?,?,?,?,?,?,?,?,'QUEUED')`,
      ).bind(id, subject, requestKey, signature, reservation.id, universe.version,
        JSON.stringify(input), cutoff, deadline).run();
      return { jobId: id, state: "QUEUED" as const, progress: 0 };
    } catch (err) {
      // A network failure can occur after D1 commits. Confirm ownership before releasing the reservation.
      const committed = await prior();
      if (committed) return confirm(committed);
      await releaseScanReservation(db, reservation.id, subject);
      throw err;
    }
  } catch (err) {
    const winner = await prior();
    if (winner) return confirm(winner);
    throw err;
  }
}

export async function marketScanStatus(subject: string, id: unknown) {
  return jobStatus(await ownedJob(subject, id));
}

export async function listActiveMarketScans(subject: string) {
  const rows = await database().prepare(
    "SELECT * FROM x78_market_scan_jobs WHERE subject=? AND state IN ('QUEUED','RUNNING') ORDER BY cutoff",
  ).bind(subject).all<Job>();
  return rows.results.map((job) => ({
    ...jobStatus(job), name: (JSON.parse(job.input) as Input).definition.name,
  }));
}

async function ownedJob(subject: string, id: unknown) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
    throw new HttpError(404, "Scan job not found.");
  const job = await database().prepare("SELECT * FROM x78_market_scan_jobs WHERE id=? AND subject=?")
    .bind(id, subject).first<Job>();
  if (!job) throw new HttpError(404, "Scan job not found.");
  return job;
}

export async function cancelMarketScan(subject: string, id: unknown) {
  const job = await ownedJob(subject, id);
  const db = database();
  await db.batch([
    db.prepare(
      `UPDATE x78_market_scan_jobs SET state='CANCELLED',lease=NULL,lease_until=NULL,input='{}'
       WHERE id=? AND subject=? AND state IN ('QUEUED','RUNNING')`,
    ).bind(job.id, subject),
    db.prepare(
      `UPDATE x51_scan_reservations
       SET state=CASE WHEN (SELECT evaluated FROM x78_market_scan_jobs WHERE id=?)>0 THEN 'COMPLETED' ELSE 'CANCELLED' END,
           completed_at=?
       WHERE id=? AND subject=? AND state IN ('RESERVED','RUNNING')
         AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state='CANCELLED')`,
    ).bind(job.id, new Date().toISOString(), job.reservation_id, subject, job.id),
    db.prepare(
      "DELETE FROM x78_market_scan_batches WHERE job_id=? AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state='CANCELLED')",
    ).bind(job.id, job.id),
  ]);
  return marketScanStatus(subject, job.id);
}

export function evaluateMarketBatch(ids: string[], input: Input, data: ResearchUniverse, cutoff: string): Batch {
  const members = new Set(ids);
  const datasets = data.datasets.filter((d) => members.has(d.instrumentId)).map((d) => ({
    ...d, observations: d.observations.filter((bar) => Date.parse(bar.eventAt) <= Date.parse(cutoff)),
  }));
  const bySource = new Map(data.excluded.map((item) => [item.id, item.reason]));
  const rows = new Map<string, Outcome>();
  let drawReport: DrawScanReport | undefined;
  if (input.draw) {
    const { points, windowBars, minPatternFit } = input.draw;
    drawReport = matchDrawnPattern(points, datasets, { windowBars, minPatternFit, asOf: data.asOf });
    const matches = new Map(drawReport.matches.map((row) => [row.instrumentId, row]));
    const excluded = new Map(drawReport.excluded.map((row) => [row.instrumentId, row.reason]));
    for (const dataset of datasets) {
      const id = dataset.instrumentId;
      const match = matches.get(id);
      const reason = excluded.get(id);
      rows.set(id, {
        instrumentId: id, status: reason ? "UNKNOWN" : match ? "PASS" : "FAIL",
        reasons: [reason ?? match?.explanation ?? "The completed window is below the similarity threshold."],
        latestEventAt: dataset.observations.at(-1)?.eventAt ?? null,
        source: dataset.source, ...(match && { patternFit: match.patternFit, metrics: computeScanMetrics(dataset.observations) }),
      });
    }
  } else {
    const result = evaluateScan(compileFormula(input.definition.formula), datasets, data.asOf);
    for (const row of result.results) rows.set(row.instrumentId, row);
  }
  return {
    rows: ids.map((id) => rows.get(id) ?? {
      instrumentId: id, status: "UNKNOWN", reasons: [bySource.get(id) ?? "Completed market history was unavailable."],
      latestEventAt: null, source: data.source,
    }),
    lineage: data.lineage.filter((row) => members.has(row.instrumentId)).map((row) => ({
      ...row, eventAt: rows.get(row.instrumentId)?.latestEventAt ?? null,
    })),
    ...(drawReport && { drawReport }),
  };
}

function summarize(rows: Outcome[], formula: string, asOf: string): ScanReport {
  const matches = rows.filter((row) => row.status === "PASS").length;
  const failed = rows.filter((row) => row.status === "FAIL").length;
  return {
    version: "x1-rule-1", formula, asOf, total: rows.length, results: rows,
    matches, failed, eligible: matches + failed, unknown: rows.length - matches - failed,
  };
}

async function finalize(job: Job, input: Input, ids: string[], now: string) {
  const db = database();
  const { results: prior } = await db.prepare("SELECT payload FROM x78_market_scan_batches WHERE job_id=? ORDER BY cursor")
    .bind(job.id).all<{ payload: string }>();
  const batches = prior.map((row) => JSON.parse(row.payload) as Batch);
  const outcomes = new Map(batches.flatMap((batch) => batch.rows.map((row) => [row.instrumentId, row] as const)));
  const definition = input.definition;
  const formula = input.draw
    ? `drawPattern(window=${input.draw.windowBars}, minFit=${input.draw.minPatternFit})`
    : definition.formula;
  const results = summarize(ids.map((id) => outcomes.get(id) ?? {
    instrumentId: id, status: "UNKNOWN", reasons: ["The scan could not reach this instrument before its processing deadline."],
    latestEventAt: null, source: "Unavailable",
  }), formula, job.cutoff);
  const state: State = results.eligible === 0 ? "FAILED" : results.unknown ? "PARTIAL" : "COMPLETE";
  const id = state === "FAILED" ? null : job.id;
  const reports = batches.flatMap((batch) => batch.drawReport ? [batch.drawReport] : []);
  const drawReport = reports[0] && {
    ...reports[0],
    evaluated: results.eligible, insufficientBarsCount: results.unknown,
    matches: reports.flatMap((report) => report.matches).sort((a, b) => b.patternFit - a.patternFit).slice(0, 12),
    excluded: [],
  };
  const payload = {
    scanTier: input.origin === "CLASSIC" ? "CLASSIC" : "ADVANCED", origin: input.origin,
    research: definition, rule: { version: results.version, formula }, description: definition.description,
    universeVersion: job.universe_version, runState: state, completedAt: now, results,
    sourceSnapshot: job.cutoff, source: "Market history",
    sourceLineage: batches.flatMap((batch) => batch.lineage),
    knownAtPolicy: "Completed candles observed by retrieval, with market events bounded by the acceptance cutoff.",
    ...(input.draw && { patternRecipe: input.draw }),
    ...(drawReport && { drawReport }),
    requestDigest: job.request_digest, billing: { charged: id ? 1 : 0 },
  };
  await db.batch([
    db.prepare(
      `INSERT INTO x1_scans (id,subject,request_key,mode,name,payload,digest,created_at)
       SELECT ?,?,?,?,?,?,?,? WHERE ? IS NOT NULL AND EXISTS
       (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING')`,
    ).bind(id, job.subject, job.request_key, definition.mode, definition.name, JSON.stringify(payload),
      await digest(payload), now, id, job.id, job.lease),
    db.prepare(
      `UPDATE x51_scan_reservations SET state=?,completed_at=?,scan_id=?
       WHERE id=? AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING')`,
    ).bind(id ? "COMPLETED" : "FAILED", id ? now : null, id, job.reservation_id, job.id, job.lease),
    db.prepare(
      `UPDATE x78_market_scan_jobs SET state=?,scan_id=?,cursor=?,evaluated=?,lease=NULL,lease_until=NULL,input='{}'
       WHERE id=? AND lease=? AND state='RUNNING'`,
    ).bind(state, id, ids.length, results.eligible, job.id, job.lease),
    db.prepare(
      `DELETE FROM x78_market_scan_batches WHERE job_id=? AND EXISTS
         (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state IN ('COMPLETE','PARTIAL','FAILED'))`,
    ).bind(job.id, job.id),
  ]);
  console.info({ event: "market_scan_finished", jobId: job.id, state, total: ids.length,
    evaluated: results.eligible, matched: results.matches, unavailable: results.unknown,
    elapsedMs: Date.parse(now) - Date.parse(job.cutoff), universeVersion: job.universe_version });
}

/** Take one global worker lease so market provider traffic is bounded across accounts. */
export async function processMarketScanBatch(loadHistory = researchUniverse) {
  const db = database();
  const now = new Date().toISOString();
  const lease = crypto.randomUUID();
  const job = await db.prepare(
    `UPDATE x78_market_scan_jobs SET state='RUNNING',lease=?,lease_until=?
       WHERE id=(SELECT id FROM x78_market_scan_jobs WHERE state IN ('QUEUED','RUNNING')
         AND (lease_until IS NULL OR lease_until<=?) ORDER BY cutoff LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE state='RUNNING' AND lease_until>?)
       RETURNING *`,
  ).bind(lease, new Date(Date.now() + WORKER_LEASE_MS).toISOString(), now, now).first<Job>();
  if (!job) return false;
  const input = JSON.parse(job.input) as Input;
  try {
    const universe = await niftyUniverse(job.universe_version);
    if (!universe) throw new Error("Pinned universe unavailable");
    const ids = universe.constituents.map((row) => row.id);
    if (job.cursor >= ids.length || job.deadline <= now) {
      await finalize(job, input, ids, now);
      return true;
    }
    const batchIds = ids.slice(job.cursor, job.cursor + BATCH_SIZE);
    const minimumBars = input.draw?.windowBars ?? requiredScanBars(compileFormula(input.definition.formula).ast);
    let batch: Batch;
    try {
      const data = await loadHistory(job.subject, {
        provider: "CONNECTED_MARKETS", universePreset: "INDIAN_EQUITIES", instrumentIds: batchIds,
        limit: batchIds.length, interval: input.definition.interval, minimumBars, traceId: job.id, eventCutoff: job.cutoff,
      });
      if (!data.datasets.length && data.diagnostics?.failureCategory === "UPSTREAM_UNAVAILABLE" &&
          job.attempts < MAX_ATTEMPTS - 1) throw new Error("Market upstream unavailable");
      batch = evaluateMarketBatch(batchIds, input, data, job.cutoff);
    } catch (err) {
      if (job.attempts < MAX_ATTEMPTS - 1) throw err;
      batch = { rows: batchIds.map((id) => ({
        instrumentId: id, status: "UNKNOWN", reasons: ["The market provider failed after retries."],
        latestEventAt: null, source: "Unavailable",
      })), lineage: [] };
    }
    const next = job.cursor + batchIds.length;
    const evaluated = job.evaluated + batch.rows.filter((row) => row.status !== "UNKNOWN").length;
    const [stored] = await db.batch([
      db.prepare(
        `INSERT INTO x78_market_scan_batches (job_id,cursor,payload) SELECT ?,?,?
         WHERE EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING' AND lease_until>?)`,
      ).bind(job.id, job.cursor, JSON.stringify(batch), job.id, lease, new Date().toISOString()),
      db.prepare(
        `UPDATE x78_market_scan_jobs SET cursor=?,evaluated=?,attempts=0,lease=NULL,lease_until=NULL
         WHERE id=? AND lease=? AND EXISTS (SELECT 1 FROM x78_market_scan_batches WHERE job_id=? AND cursor=?)`,
      ).bind(next, evaluated, job.id, lease, job.id, job.cursor),
    ]);
    return stored.meta.changes > 0;
  } catch (err) {
    console.warn({ event: "market_scan_batch_retry", jobId: job.id, cursor: job.cursor,
      attempt: job.attempts + 1, error: err instanceof Error ? err.name : "UnknownError" });
    await db.prepare(
      "UPDATE x78_market_scan_jobs SET attempts=attempts+1,lease=NULL WHERE id=? AND lease=?",
    ).bind(job.id, lease).run();
    return false;
  }
}
