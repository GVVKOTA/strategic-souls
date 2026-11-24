import { projectResearchSnapshot } from "./scan-projection";
import { archivalScanRows } from "./scan-retention";
import { database } from "../../../database/queries/repository";
import { digest } from "../../engines/engine";
import { compileFormula, computeScanMetrics, evaluateScan, requiredScanBars,
  type ScanReport, type ScanResult } from "../../engines/scan";
import { matchDrawnPattern, validateStrokePoints, type DrawPoint, type DrawScanReport } from "../../engines/pattern-draw";
import { HttpError } from "../../middleware/security";
import { canScanExchange, researchUniverse, scanScopeInstruments, type ResearchUniverse } from "../market-data/data-service";
import { EXPLICIT_SCOPE_VERSION, niftyUniverse } from "../market-data/nifty-500";
import { isScanUniversePreset, scanUniverseForPreset, validateResearch, validateScanRequestScope, type ResearchDefinition } from "./research";
import { istCalendarDay, reserveScanSlot, releaseScanReservation, type ScanQuotaTier } from "./scan-quota";

const BATCH_SIZE = 5;
const JOB_MS = 4 * 60 * 60_000;
const WORKER_LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;

type Input = {
  definition: ResearchDefinition;
  origin: "CLASSIC" | "BUILD" | "DISCOVER" | "DRAW";
  draw?: { points: DrawPoint[]; windowBars: number; minPatternFit: number };
  referenceSnapshot?: ResearchUniverse;
};
type State = "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "CANCELLED";
type Job = {
  id: string; subject: string; request_key: string; reservation_id: string; request_digest: string;
  universe_version: string; input: string; cutoff: string; deadline: string; state: State;
  cursor: number; evaluated: number; selected_count: number; scope_members: string | null;
  coverage: string | null; lease: string | null; attempts: number; scan_id: string | null;
};
type Classification = "matched" | "unmatched" | "insufficient" | "deniedOrFailed" | "deferred";
type Coverage = Record<Classification, number> & { selected: number; evaluated: number };
type Outcome = ScanResult & { patternFit?: number; classification?: Classification };
type Batch = { rows: Outcome[]; lineage: ResearchUniverse["lineage"]; drawReport?: DrawScanReport };

const startingCoverage = (selected: number): Coverage => ({
  selected, evaluated: 0, matched: 0, unmatched: 0, insufficient: 0, deniedOrFailed: 0, deferred: selected,
});
function recordCoverage(coverage: Coverage, rows: Outcome[]): Coverage {
  const next = { ...coverage };
  for (const row of rows) {
    const group = row.classification ?? (row.status === "PASS" ? "matched" : row.status === "FAIL" ? "unmatched" : "insufficient");
    if (group !== "deferred") next[group]++;
  }
  next.evaluated = next.matched + next.unmatched;
  next.deferred = next.selected - next.evaluated - next.insufficient - next.deniedOrFailed;
  return next;
}
async function jobStatus(job: Job) {
  const coverage: Coverage = job.coverage ? JSON.parse(job.coverage) : startingCoverage(job.selected_count);
  const { matched, unmatched, ...counts } = coverage;
  let visible = false;
  if (job.scan_id) {
    const record = await database().prepare("SELECT payload FROM x1_scans WHERE id=? AND subject=?")
      .bind(job.scan_id, job.subject).first<{ payload: string }>();
    if (record) {
      const view = await projectResearchSnapshot(JSON.parse(record.payload), false);
      visible = !view.redaction.applied;
    }
  }
  return {
    jobId: job.id, state: job.state,
    progress: Math.round((coverage.selected - coverage.deferred) * 100 / coverage.selected),
    coverage: { ...counts, ...(visible && { matched, unmatched }) },
    ...(job.scan_id ? { id: job.scan_id } : {}),
  };
}

function parseInput(raw: Record<string, unknown>): Input {
  const chosen = raw.scopeIntent === "EXPLICIT" ? raw.universePreset : "MARKET";
  if (!isScanUniversePreset(chosen)) throw new HttpError(400, "Choose a supported scan scope.");
  const definitionInput = {
    ...raw, universe: scanUniverseForPreset(chosen), universePreset: chosen,
    instrumentIds: chosen === "INDIVIDUAL" ? raw.instrumentIds : [],
    watchlistId: chosen === "MY_WATCHLIST" ? raw.watchlistId : undefined,
    customCsv: undefined, partialPolicy: "ALLOW_UNKNOWN",
  };
  try {
    if (chosen === "CUSTOM_CSV") throw new Error("Use the private CSV research workflow.");
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
      if (chosen === "INDIVIDUAL" && definition.instrumentIds.length !== 1)
        throw new Error("Choose a single instrument from Asset Research.");
      matchDrawnPattern(points, [], { windowBars, minPatternFit });
      return { definition, origin: "DRAW", draw: { points, windowBars, minPatternFit } };
    }
    const definition = validateResearch(definitionInput);
    if (chosen === "INDIVIDUAL" && definition.instrumentIds.length !== 1)
      throw new Error("Choose a single instrument from Asset Research.");
    compileFormula(definition.formula);
    const origin = definition.mode === "SIMPLE" ? "CLASSIC" : raw.origin === "DISCOVER" ? "DISCOVER" : "BUILD";
    return { definition, origin };
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

async function resolveScope(subject: string, definition: ResearchDefinition) {
  const preset = definition.universePreset ?? "MARKET";
  if (preset === "MARKET") {
    const universe = await niftyUniverse();
    if (!universe) throw new HttpError(503, "The Nifty 500 constituent snapshot is unavailable. No scan was charged.");
    return { version: universe.version, members: universe.constituents.map((row) => row.id), defaultMarket: true };
  }
  let members: string[];
  if (preset === "MY_WATCHLIST") {
    const list = await database().prepare(
      "SELECT payload FROM x1_records WHERE subject=? AND kind='watchlist' AND archived=0 AND (? IS NULL OR id=?) ORDER BY created_at,id LIMIT 1",
    ).bind(subject, definition.watchlistId ?? null, definition.watchlistId ?? null).first<{ payload: string }>();
    if (!list && definition.watchlistId) throw new HttpError(404, "Watchlist not found.");
    const items = list ? JSON.parse(list.payload).items : [];
    members = Array.isArray(items) ? items.filter((id: unknown): id is string =>
      typeof id === "string" && /^[A-Z0-9]+:[A-Z0-9._&^-]{1,60}$/.test(id)) : [];
  } else if (preset === "INDIVIDUAL") {
    members = definition.instrumentIds;
  } else {
    members = await scanScopeInstruments(preset, definition.interval);
  }
  members = [...new Set(members)].sort();
  if (!members.length) throw new HttpError(422, "No eligible instruments are mapped to this scope. No scan was charged.");
  if (members.length > 1000) throw new HttpError(422, "This scope exceeds the supported 1,000-instrument budget.");
  return { version: EXPLICIT_SCOPE_VERSION, members, defaultMarket: false };
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
  const scope = await resolveScope(subject, input.definition);
  if (scope.defaultMarket && (input.definition.interval === "30m" || input.definition.interval === "1h"))
    throw new HttpError(422, "The configured Nifty 500 price feed provides daily prices. Choose daily, weekly or monthly. No scan was charged.");
  const refInterval = input.definition.interval !== "30m" && input.definition.interval !== "1h";
  const referenceIds = refInterval ? scope.members.filter((id) => id.startsWith("ECB:")) : [];
  const allowsReference = referenceIds.length > 0;
  const hasExchange = scope.members.some((id) => !id.startsWith("ECB:"));
  if (!allowsReference && !(hasExchange && await canScanExchange(input.definition.interval, scope.members, scope.defaultMarket ? "INDIANAPI" : undefined)))
    throw new HttpError(503, "Market history is unavailable for this account and timeframe. No scan was charged.");
  const tier: ScanQuotaTier = input.origin === "CLASSIC" ? "CLASSIC" : "ADVANCED";
  try {
    const reservation = await reserveScanSlot(db, subject, tier, requestKey);
    if (reservation.reusedCompletedScanId)
      throw new HttpError(409, "This request ID belongs to a previous scan.");
    try {
      if (allowsReference) {
        const source = await researchUniverse(subject, { provider: "ECB", instrumentIds: referenceIds,
          limit: referenceIds.length, interval: input.definition.interval });
        input.referenceSnapshot = source;
        if (!hasExchange && !source.datasets.length)
          throw new HttpError(503, "Completed ECB history is unavailable. No scan was charged.");
      }
      const acceptedInput = JSON.stringify(input);
      if (new TextEncoder().encode(acceptedInput).byteLength > 1_300_000)
        throw new HttpError(413, "The reference snapshot exceeds the scan storage limit. Choose fewer assets.");
      const cutoff = new Date().toISOString();
      const deadline = new Date(Date.parse(cutoff) + JOB_MS).toISOString();
      const id = crypto.randomUUID();
      const holdUntil = new Date(Date.parse(deadline) + 86_400_000).toISOString();
      const [queued] = await db.batch([
        db.prepare(
          `INSERT INTO x78_market_scan_jobs
           (id,subject,request_key,request_digest,reservation_id,universe_version,input,cutoff,deadline,scope_members,selected_count,state)
           SELECT ?,?,?,?,?,?,?,?,?,?,?,'QUEUED' WHERE EXISTS
             (SELECT 1 FROM x51_scan_reservations WHERE id=? AND state='RESERVED' AND lease_expires_at>=?)`,
        ).bind(id, subject, requestKey, signature, reservation.id, scope.version,
          acceptedInput, cutoff, deadline, scope.defaultMarket ? null : JSON.stringify(scope.members),
          scope.members.length, reservation.id, new Date().toISOString()),
        db.prepare(
          `UPDATE x51_scan_reservations SET lease_expires_at=?
           WHERE id=? AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=?)`,
        ).bind(holdUntil, reservation.id, id),
      ]);
      if (!queued.meta.changes) throw new HttpError(409, "The scan reservation expired. Retry the request.");
      return { jobId: id, state: "QUEUED" as const, progress: 0, coverage: startingCoverage(scope.members.length) };
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
  return Promise.all(rows.results.map(async (job) => ({
    ...await jobStatus(job), name: (JSON.parse(job.input) as Input).definition.name,
  })));
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
       SET state='CANCELLED', completed_at=NULL
       WHERE id=? AND subject=? AND state IN ('RESERVED','RUNNING')
         AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state='CANCELLED')`,
    ).bind(job.reservation_id, subject, job.id),
    db.prepare(
      "DELETE FROM x78_market_scan_batches WHERE job_id=? AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state='CANCELLED')",
    ).bind(job.id, job.id),
  ]);
  return marketScanStatus(subject, job.id);
}

export function evaluateMarketBatch(ids: string[], input: Input, data: ResearchUniverse, cutoff: string): Batch {
  const members = new Set(ids);
  const cut = Date.parse(cutoff);
  const datasets = data.datasets.filter((d) => members.has(d.instrumentId)).map((d) => ({
    ...d, observations: d.observations.filter((bar) => Date.parse(bar.eventAt) <= cut && Date.parse(bar.knownAt) <= cut),
  }));
  const bySource = new Map(data.excluded.map((item) => [item.id, item]));
  const rows = new Map<string, Outcome>();
  let drawReport: DrawScanReport | undefined;
  if (input.draw) {
    const { points, windowBars, minPatternFit } = input.draw;
    drawReport = matchDrawnPattern(points, datasets, { windowBars, minPatternFit, asOf: cutoff });
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
    const result = evaluateScan(compileFormula(input.definition.formula), datasets, cutoff);
    for (const row of result.results) rows.set(row.instrumentId, row);
  }
  return {
    rows: ids.map((id) => rows.get(id) ?? {
      instrumentId: id, status: "UNKNOWN", reasons: [bySource.get(id)?.reason ?? "Completed market history was unavailable."],
      classification: bySource.get(id)?.kind === "denied" || bySource.get(id)?.kind === "error" ? "deniedOrFailed" : "insufficient",
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
    latestEventAt: null, source: "Unavailable", classification: "deferred",
  }), formula, job.cutoff);
  const coverage = recordCoverage(startingCoverage(ids.length), results.results);
  const state: State = results.eligible === 0 ? "FAILED" : results.unknown ? "PARTIAL" : "COMPLETE";
  const id = state === "FAILED" ? null : job.id;
  const chargeQuota = state === "COMPLETE";
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
    universeVersion: job.universe_version, runState: state, completedAt: now, results: { ...results, results: archivalScanRows(results.results) }, coverage,
    sourceSnapshot: job.cutoff, source: "Market history",
    sourceLineage: batches.flatMap((batch) => batch.lineage),
    knownAtPolicy: "Completed observations whose event and availability times are at or before scan acceptance.",
    ...(input.draw && { patternRecipe: input.draw }),
    ...(drawReport && { drawReport }),
    requestDigest: job.request_digest, billing: { charged: chargeQuota ? 1 : 0 },
  };
  await db.batch([
    db.prepare(
      `INSERT INTO x1_scans (id,subject,request_key,mode,name,payload,digest,created_at)
       SELECT ?,?,?,?,?,?,?,? WHERE ? IS NOT NULL AND EXISTS
       (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING')`,
    ).bind(id, job.subject, job.request_key, definition.mode, definition.name, JSON.stringify(payload),
      await digest(payload), now, id, job.id, job.lease),
    db.prepare(
      `UPDATE x51_scan_reservations SET state=?,completed_at=?,scan_id=?,ist_day=COALESCE(?,ist_day)
       WHERE id=? AND EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING')`,
    ).bind(chargeQuota ? "COMPLETED" : "FAILED", chargeQuota ? now : null, chargeQuota ? id : null, chargeQuota ? istCalendarDay(Date.parse(now)) : null, job.reservation_id, job.id, job.lease),
    db.prepare(
      `UPDATE x78_market_scan_jobs SET state=?,scan_id=?,cursor=?,evaluated=?,coverage=?,lease=NULL,lease_until=NULL,input='{}'
       WHERE id=? AND lease=? AND state='RUNNING'`,
    ).bind(state, id, ids.length, results.eligible, JSON.stringify(coverage), job.id, job.lease),
    db.prepare(
      `DELETE FROM x78_market_scan_batches WHERE job_id=? AND EXISTS
         (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state IN ('COMPLETE','PARTIAL','FAILED'))`,
    ).bind(job.id, job.id),
  ]);
  console.info({ event: "market_scan_finished", jobId: job.id, state, total: ids.length,
    evaluated: results.eligible, matched: results.matches, unavailable: results.unknown,
    elapsedMs: Date.parse(now) - Date.parse(job.cutoff), universeVersion: job.universe_version });
}

async function failUnusableJob(job: Job) {
  const db = database();
  const coverage = { ...startingCoverage(job.selected_count), deniedOrFailed: job.selected_count, deferred: 0 };
  await db.batch([
    db.prepare(`UPDATE x51_scan_reservations SET state='FAILED',completed_at=NULL,scan_id=NULL
      WHERE id=? AND state IN ('RESERVED','RUNNING') AND EXISTS
        (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING')`)
      .bind(job.reservation_id, job.id, job.lease),
    db.prepare(`UPDATE x78_market_scan_jobs SET state='FAILED',evaluated=0,coverage=?,lease=NULL,lease_until=NULL,input='{}'
      WHERE id=? AND lease=? AND state='RUNNING'`).bind(JSON.stringify(coverage), job.id, job.lease),
    db.prepare(`DELETE FROM x78_market_scan_batches WHERE job_id=? AND EXISTS
      (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND state='FAILED')`).bind(job.id, job.id),
  ]);
}

/** Take one global worker lease so market provider traffic is bounded across accounts. */
export async function processMarketScanBatch(loadHistory = researchUniverse, batchSize = BATCH_SIZE) {
  const db = database();
  const now = new Date().toISOString();
  const lease = crypto.randomUUID();
  const job = await db.prepare(
    `UPDATE x78_market_scan_jobs SET state='RUNNING',lease=?,lease_until=?
       WHERE id=(SELECT id FROM x78_market_scan_jobs WHERE state IN ('QUEUED','RUNNING')
         AND (lease_until IS NULL OR lease_until<=?) ORDER BY COALESCE(last_batch_at,cutoff), cutoff LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE state='RUNNING' AND lease_until>?)
       RETURNING *`,
  ).bind(lease, new Date(Date.now() + WORKER_LEASE_MS).toISOString(), now, now).first<Job>();
  if (!job) return false;
  try {
    const input = JSON.parse(job.input) as Input;
    const ids: string[] | undefined = job.scope_members ? JSON.parse(job.scope_members)
      : (await niftyUniverse(job.universe_version))?.constituents.map((row) => row.id);
    if (!Array.isArray(ids) || ids.length !== job.selected_count || !input.definition) {
      await failUnusableJob(job);
      return true;
    }
    if (job.cursor >= ids.length || job.deadline <= now) {
      await finalize(job, input, ids, now);
      return true;
    }
    const budget = Math.max(BATCH_SIZE, Math.min(15, batchSize));
    const batchIds = ids.slice(job.cursor, job.cursor + budget);
    const minimumBars = input.draw?.windowBars ?? requiredScanBars(compileFormula(input.definition.formula).ast);
    let batch: Batch;
    try {
      const options = { limit: batchIds.length, interval: input.definition.interval, minimumBars, traceId: job.id, eventCutoff: job.cutoff };
      const reference = batchIds.filter((id) => id.startsWith("ECB:"));
      const exchange = batchIds.filter((id) => !id.startsWith("ECB:"));
      const sources = await Promise.all([
        ...(exchange.length ? [loadHistory(job.subject, { ...options, provider: input.definition.universePreset === "MARKET" ? "INDIANAPI" : "CONNECTED_MARKETS",
          universePreset: input.definition.universePreset === "MARKET" ? "INDIAN_EQUITIES" : input.definition.universePreset,
          instrumentIds: exchange })] : []),
        ...(reference.length && input.referenceSnapshot ? [Promise.resolve(input.referenceSnapshot)] : []),
      ]);
      const data: ResearchUniverse = {
        ...sources[0],
        datasets: sources.flatMap((source) => source.datasets),
        excluded: sources.flatMap((source) => source.excluded),
        lineage: sources.flatMap((source) => source.lineage),
      };
      if (!sources.length) throw new Error("The reference snapshot is unavailable.");
      if (!data.datasets.length && data.diagnostics?.failureCategory === "UPSTREAM_UNAVAILABLE" &&
          job.attempts < MAX_ATTEMPTS - 1) throw new Error("Market upstream unavailable");
      const evaluated = evaluateMarketBatch(batchIds, input, data, job.cutoff);
      batch = { ...evaluated, rows: archivalScanRows(evaluated.rows) };
    } catch (err) {
      if (job.attempts < MAX_ATTEMPTS - 1) throw err;
      batch = { rows: batchIds.map((id) => ({
        instrumentId: id, status: "UNKNOWN", reasons: ["The market provider failed after retries."],
        latestEventAt: null, source: "Unavailable", classification: "deniedOrFailed",
      })), lineage: [] };
    }
    const next = job.cursor + batchIds.length;
    const coverage = recordCoverage(job.coverage ? JSON.parse(job.coverage) as Coverage
      : startingCoverage(job.selected_count), batch.rows);
    const [stored] = await db.batch([
      db.prepare(
        `INSERT INTO x78_market_scan_batches (job_id,cursor,payload) SELECT ?,?,?
         WHERE EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE id=? AND lease=? AND state='RUNNING' AND lease_until>?)`,
      ).bind(job.id, job.cursor, JSON.stringify(batch), job.id, lease, new Date().toISOString()),
      db.prepare(
        `UPDATE x78_market_scan_jobs SET cursor=?,evaluated=?,coverage=?,attempts=0,lease=NULL,lease_until=NULL,last_batch_at=?
         WHERE id=? AND lease=? AND EXISTS (SELECT 1 FROM x78_market_scan_batches WHERE job_id=? AND cursor=?)`,
      ).bind(next, coverage.evaluated, JSON.stringify(coverage), new Date().toISOString(), job.id, lease, job.id, job.cursor),
    ]);
    return stored.meta.changes > 0;
  } catch (err) {
    console.warn({ event: "market_scan_batch_retry", jobId: job.id, cursor: job.cursor,
      attempt: job.attempts + 1, error: err instanceof Error ? err.name : "UnknownError" });
    if (err instanceof SyntaxError || job.attempts >= MAX_ATTEMPTS - 1 || job.deadline <= now) {
      await failUnusableJob(job);
      return true;
    }
    await db.prepare(`UPDATE x78_market_scan_jobs SET attempts=attempts+1,lease=NULL,last_batch_at=?
      WHERE id=? AND lease=?`).bind(now, job.id, lease).run();
    return true;
  }
}
