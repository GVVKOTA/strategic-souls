/**
 * Strategic Souls X 3.0 — SOUL MEMORY Daily Adaptive GRAVEYARD Intelligence (Contract D).
 *
 * Design invariants:
 * - Deterministic, bounded quantitative processing (zero external LLM calls per scan).
 * - Per-subject private learning boundary scoped strictly to the current Asia/Kolkata civil day.
 * - Point-in-time safe: state frozen at scan submission cutoff T; never reads observations
 *   or outcomes from timestamp > T; current scan NEVER feeds itself.
 * - Non-destructive: NEVER modifies user formula or alters PASS/FAIL match membership.
 *   Produces an optional separate adaptive ranking index (0–100) and advisory insights only.
 * - Resets ONLY daily active learning state at 00:00 IST (18:30 UTC); NEVER deletes GRAVEYARD archive.
 */
import { database } from "../../../database/queries/repository";
import { digest } from "../../engines/engine";
import type { ScanResult } from "../../engines/scan";
import { istCalendarDay, nextIstMidnightUtc } from "./scan-quota";

export const SOUL_MEMORY_VERSION = "sm-x3-v1";
export const SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES = 3;
export const SOUL_MEMORY_WEIGHTS = Object.freeze({
  signalConfirmation: 0.30,
  momentum: 0.25,
  volumeConfirmation: 0.20,
  sectorConfirmation: 0.15,
  comparableReliability: 0.10,
});

export type SoulMemoryStatus =
  | "BASELINE"
  | "LEARNING"
  | "ACTIVE"
  | "INSUFFICIENT"
  | "UNAVAILABLE";

export type SignalDirection = "LONG" | "SHORT" | "NEUTRAL";
export type ResearchOrigin = "CLASSIC" | "BUILD" | "DISCOVER" | "DRAW";

export type GroupAggregate = {
  ruleSignature: string;
  timeframe: string;
  direction: SignalDirection;
  distinctSignals: number;
  evaluatedOutcomes: number;
  confirmedOutcomes: number;
  unconfirmedOutcomes: number;
  falseBreakouts: number;
  avgSignedReturnPct: number | null;
  lastUpdatedAt: string;
};

export type SectorAggregate = {
  sector: string;
  signals: number;
  confirmed: number;
  evaluated: number;
};

export type DailySoulMemoryAggregates = {
  groups: Record<string, GroupAggregate>;
  sectors: Record<string, SectorAggregate>;
  seenRequestInstrumentKeys: string[];
};

export type FrozenSoulMemorySnapshot = {
  subject: string;
  istDay: string;
  stateVersion: number;
  scansAnalyzed: number;
  distinctSignals: number;
  evaluatedOutcomes: number;
  asOfCutoff: string;
  resetsAtUtc: string;
  status: SoulMemoryStatus;
  aggregates: DailySoulMemoryAggregates;
  scoreVersion: string;
};

export type AdaptiveComponentBreakdown = {
  signalConfirmation: number | null;
  momentum: number | null;
  volumeConfirmation: number | null;
  sectorConfirmation: number | null;
  comparableReliability: number | null;
};

export type AdaptiveMatchRank = {
  instrumentId: string;
  originalRank: number;
  adaptiveRank: number;
  researchRankingIndex: number; // Bounded 0..100 research ranking index (NOT win probability)
  confidence: "ACTIVE" | "LOW_SAMPLE" | "BASELINE";
  components: AdaptiveComponentBreakdown;
  activeWeightSum: number;
  rationale: string;
};

export type SoulMemoryScanAttachment = {
  version: string;
  istDay: string;
  stateVersion: number;
  status: SoulMemoryStatus;
  label: string;
  scansAnalyzed: number;
  distinctSignals: number;
  evaluatedOutcomes: number;
  minSampleRequired: number;
  asOfCutoff: string;
  resetsAtUtc: string;
  coveragePct: number;
  rankings: AdaptiveMatchRank[];
  advisoryNotes: string[];
};

const EMPTY_AGGREGATES = (): DailySoulMemoryAggregates => ({
  groups: {},
  sectors: {},
  seenRequestInstrumentKeys: [],
});

export function inferSignalDirection(formula: string): SignalDirection {
  const f = formula.toLowerCase();
  const shortHints =
    /\bclose\s*<\s*(sma|ema|bblower|lowest)|\brsi\([^)]*\)\s*>\s*7\d|\bchange\([^)]*\)\s*<\s*-/.test(
      f,
    );
  const longHints =
    /\bclose\s*>\s*(sma|ema|bbupper|highest)|\brsi\([^)]*\)\s*<\s*[234]\d|\bchange\([^)]*\)\s*>\s*/.test(
      f,
    );
  if (shortHints && !longHints) return "SHORT";
  if (longHints && !shortHints) return "LONG";
  return "NEUTRAL";
}

export async function computeRuleSignature(
  formula: string,
  origin: ResearchOrigin,
  timeframe: string,
  direction: SignalDirection,
): Promise<string> {
  const canonical = formula.replace(/\s+/g, " ").trim().toLowerCase();
  const h = await digest({ canonical, origin, timeframe, direction });
  return h.slice(0, 24);
}

export function groupKey(
  ruleSignature: string,
  timeframe: string,
  direction: SignalDirection,
): string {
  return `${ruleSignature}|${timeframe}|${direction}`;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes a deterministic, bounded 0–100 research ranking index using ONLY valid available components.
 * - Missing features (e.g. volume on FX or derived-only feeds) are omitted and weights renormalized,
 *   NEVER filled with 0.
 * - Confirmation & reliability use Bayesian shrinkage toward 0.50 prior so 1–2 observations never
 *   produce extreme scores.
 * - Complexity: O(M log M) where M = number of valid matched instruments.
 */
export function rankMatchesWithSoulMemory(input: {
  matches: readonly ScanResult[];
  frozen: FrozenSoulMemorySnapshot;
  ruleSignature: string;
  timeframe: string;
  direction: SignalDirection;
  sectorByInstrument?: ReadonlyMap<string, string>;
}): SoulMemoryScanAttachment {
  const { matches, frozen, ruleSignature, timeframe, direction, sectorByInstrument } = input;
  const gKey = groupKey(ruleSignature, timeframe, direction);
  const group = frozen.aggregates.groups[gKey] ?? null;
  const groupSamples = group?.evaluatedOutcomes ?? 0;
  const hasSufficientEvidence =
    frozen.status === "ACTIVE" || groupSamples >= SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES;

  const scored: {
    instrumentId: string;
    originalRank: number;
    score: number;
    confidence: AdaptiveMatchRank["confidence"];
    components: AdaptiveComponentBreakdown;
    activeWeightSum: number;
    rationale: string;
  }[] = matches.map((row, idx) => {
    const m = row.metrics;
    const sector = sectorByInstrument?.get(row.instrumentId) ?? null;
    const sectorAgg = sector ? frozen.aggregates.sectors[sector] ?? null : null;

    // 1. Observed same-day signal confirmation (Bayesian shrunk toward 0.50 prior, k0=2, n0=4)
    const signalConfirmation: number | null =
      group && group.evaluatedOutcomes > 0
        ? clamp01((group.confirmedOutcomes + 2) / (group.evaluatedOutcomes + 4))
        : null;

    // 2. Direction-aligned momentum component from completed-bar metrics (if available)
    let momentum: number | null = null;
    if (m && typeof m.changePct === "number" && Number.isFinite(m.changePct)) {
      const signed =
        direction === "SHORT" ? -m.changePct : direction === "LONG" ? m.changePct : Math.abs(m.changePct);
      // Smooth bounded mapping [-5%, +5%] -> [0, 1] centered at 0.5
      momentum = clamp01(0.5 + signed / 10);
    } else if (m && typeof m.rsi14 === "number" && Number.isFinite(m.rsi14)) {
      momentum =
        direction === "SHORT"
          ? clamp01((100 - m.rsi14) / 100)
          : clamp01(m.rsi14 / 100);
    }

    // 3. Volume confirmation (omitted when volume ratio unavailable — NEVER zero-filled)
    let volumeConfirmation: number | null = null;
    if (m && typeof m.volRatio === "number" && Number.isFinite(m.volRatio) && m.volRatio > 0) {
      // 1.0x -> 0.50, 2.0x -> 0.85, 3.0x+ -> 1.0
      volumeConfirmation = clamp01(0.15 + Math.min(m.volRatio, 2.5) * 0.34);
    }

    // 4. Sector same-day confirmation (shrunk toward 0.50 prior)
    const sectorConfirmation: number | null =
      sectorAgg && sectorAgg.evaluated > 0
        ? clamp01((sectorAgg.confirmed + 1.5) / (sectorAgg.evaluated + 3))
        : null;

    // 5. Comparable same-day rule reliability (penalizing observed false breakouts with shrinkage)
    let comparableReliability: number | null = null;
    if (group && group.evaluatedOutcomes >= SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES) {
      const nonFalse = Math.max(0, group.evaluatedOutcomes - group.falseBreakouts);
      comparableReliability = clamp01((nonFalse + 2) / (group.evaluatedOutcomes + 4));
    }

    const activePairs: [number, number][] = [];
    if (signalConfirmation !== null) activePairs.push([SOUL_MEMORY_WEIGHTS.signalConfirmation, signalConfirmation]);
    if (momentum !== null) activePairs.push([SOUL_MEMORY_WEIGHTS.momentum, momentum]);
    if (volumeConfirmation !== null) activePairs.push([SOUL_MEMORY_WEIGHTS.volumeConfirmation, volumeConfirmation]);
    if (sectorConfirmation !== null) activePairs.push([SOUL_MEMORY_WEIGHTS.sectorConfirmation, sectorConfirmation]);
    if (comparableReliability !== null) activePairs.push([SOUL_MEMORY_WEIGHTS.comparableReliability, comparableReliability]);

    const activeWeightSum = activePairs.reduce((s, [w]) => s + w, 0);
    const normalized =
      activeWeightSum > 0
        ? activePairs.reduce((s, [w, x]) => s + w * x, 0) / activeWeightSum
        : 0.5;
    const researchRankingIndex = Math.round(clamp01(normalized) * 1000) / 10; // 0.0–100.0

    const confidence: AdaptiveMatchRank["confidence"] =
      hasSufficientEvidence && signalConfirmation !== null
        ? "ACTIVE"
        : activeWeightSum > 0
          ? "LOW_SAMPLE"
          : "BASELINE";

    const parts: string[] = [];
    if (signalConfirmation !== null && group) {
      parts.push(
        `same-day rule confirmation ${group.confirmedOutcomes}/${group.evaluatedOutcomes}`,
      );
    }
    if (momentum !== null) parts.push(`momentum ${(momentum * 100).toFixed(0)}/100`);
    if (volumeConfirmation !== null) parts.push(`volume ${(volumeConfirmation * 100).toFixed(0)}/100`);
    if (sectorConfirmation !== null && sector) parts.push(`sector ${sector} aligned`);
    if (!parts.length) parts.push("baseline order (insufficient same-day observations)");

    return {
      instrumentId: row.instrumentId,
      originalRank: idx + 1,
      score: researchRankingIndex,
      confidence,
      components: {
        signalConfirmation: signalConfirmation === null ? null : Math.round(signalConfirmation * 1000) / 1000,
        momentum: momentum === null ? null : Math.round(momentum * 1000) / 1000,
        volumeConfirmation: volumeConfirmation === null ? null : Math.round(volumeConfirmation * 1000) / 1000,
        sectorConfirmation: sectorConfirmation === null ? null : Math.round(sectorConfirmation * 1000) / 1000,
        comparableReliability: comparableReliability === null ? null : Math.round(comparableReliability * 1000) / 1000,
      },
      activeWeightSum: Math.round(activeWeightSum * 100) / 100,
      rationale: parts.join(" · "),
    };
  });

  // Deterministic tie-break: higher researchRankingIndex -> lower originalRank -> instrumentId lexicographical
  const sorted = [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      a.originalRank - b.originalRank ||
      a.instrumentId.localeCompare(b.instrumentId),
  );

  const rankings: AdaptiveMatchRank[] = sorted.map((item, rankIdx) => ({
    instrumentId: item.instrumentId,
    originalRank: item.originalRank,
    adaptiveRank: rankIdx + 1,
    researchRankingIndex: item.score,
    confidence: item.confidence,
    components: item.components,
    activeWeightSum: item.activeWeightSum,
    rationale: item.rationale,
  }));

  const coveredCount = rankings.filter((r) => r.activeWeightSum > 0).length;
  const coveragePct =
    matches.length > 0 ? Math.round((coveredCount / matches.length) * 100) : 0;

  const advisoryNotes: string[] = [];
  if (group && group.evaluatedOutcomes >= SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES) {
    const falseRate = group.falseBreakouts / group.evaluatedOutcomes;
    if (falseRate >= 0.5) {
      advisoryNotes.push(
        `Advisory: ${group.falseBreakouts} of ${group.evaluatedOutcomes} evaluated same-day signals for this rule reverted after initial match. Consider inspecting volume or confirmation filters before rerunning.`,
      );
    }
  }
  if (!hasSufficientEvidence) {
    advisoryNotes.push(
      `Same-day SOUL MEMORY needs at least ${SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES} matured same-day observations before activating adaptive weighting; original formula matches are shown unchanged.`,
    );
  }

  return {
    version: SOUL_MEMORY_VERSION,
    istDay: frozen.istDay,
    stateVersion: frozen.stateVersion,
    status:
      frozen.status === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : hasSufficientEvidence
          ? "ACTIVE"
          : frozen.scansAnalyzed > 0
            ? "LEARNING"
            : "BASELINE",
    label: "Research ranking index (same-day experimental · resets 00:00 IST)",
    scansAnalyzed: frozen.scansAnalyzed,
    distinctSignals: frozen.distinctSignals,
    evaluatedOutcomes: frozen.evaluatedOutcomes,
    minSampleRequired: SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES,
    asOfCutoff: frozen.asOfCutoff,
    resetsAtUtc: frozen.resetsAtUtc,
    coveragePct,
    rankings,
    advisoryNotes,
  };
}

/**
 * Captures the point-in-time frozen daily SOUL MEMORY state for `subject` at `cutoffMs`.
 * Enforces strict IST day-key matching (`ist_day = istCalendarDay(cutoffMs)`) AND
 * `as_of_cutoff <= cutoffIso` so midnight rollover and point-in-time guarantees never depend on cron timing.
 */
export async function captureFrozenSoulMemory(
  subject: string,
  cutoffMs = Date.now(),
): Promise<FrozenSoulMemorySnapshot> {
  const istDay = istCalendarDay(cutoffMs);
  const cutoffIso = new Date(cutoffMs).toISOString();
  const resetsAtUtc = nextIstMidnightUtc(cutoffMs);
  const baseline: FrozenSoulMemorySnapshot = {
    subject,
    istDay,
    stateVersion: 0,
    scansAnalyzed: 0,
    distinctSignals: 0,
    evaluatedOutcomes: 0,
    asOfCutoff: cutoffIso,
    resetsAtUtc,
    status: "BASELINE",
    aggregates: EMPTY_AGGREGATES(),
    scoreVersion: SOUL_MEMORY_VERSION,
  };
  try {
    const row = await database()
      .prepare(
        `SELECT state_version, scans_analyzed, distinct_signals, evaluated_outcomes, aggregates_json, as_of_cutoff
         FROM x9_soul_memory_daily_state
         WHERE subject=? AND ist_day=?`,
      )
      .bind(subject, istDay)
      .first<{
        state_version: number;
        scans_analyzed: number;
        distinct_signals: number;
        evaluated_outcomes: number;
        aggregates_json: string;
        as_of_cutoff: string;
      }>();
    if (!row) return baseline;
    // Point-in-time guard: never use state updated after this scan's pinned cutoff.
    if (Date.parse(row.as_of_cutoff) > cutoffMs) {
      return baseline;
    }
    const aggregates = JSON.parse(row.aggregates_json) as DailySoulMemoryAggregates;
    const status: SoulMemoryStatus =
      row.evaluated_outcomes >= SOUL_MEMORY_MIN_EFFECTIVE_SAMPLES
        ? "ACTIVE"
        : row.scans_analyzed > 0
          ? "LEARNING"
          : "BASELINE";
    return {
      subject,
      istDay,
      stateVersion: row.state_version,
      scansAnalyzed: row.scans_analyzed,
      distinctSignals: row.distinct_signals,
      evaluatedOutcomes: row.evaluated_outcomes,
      asOfCutoff: row.as_of_cutoff,
      resetsAtUtc,
      status,
      aggregates: {
        groups: aggregates.groups ?? {},
        sectors: aggregates.sectors ?? {},
        seenRequestInstrumentKeys: Array.isArray(aggregates.seenRequestInstrumentKeys)
          ? aggregates.seenRequestInstrumentKeys
          : [],
      },
      scoreVersion: SOUL_MEMORY_VERSION,
    };
  } catch {
    return { ...baseline, status: "UNAVAILABLE" };
  }
}

/**
 * Records idempotent observations from a completed scan AFTER finalization.
 * Deduplicates repeat scans of identical `(request_digest, instrument_id)` within the same IST day
 * so repeated submissions cannot inflate signal counts or double-count learning.
 * Bounded to at most 100 matched instruments per scan for D1 write safety.
 */
export async function recordCompletedScanObservations(input: {
  subject: string;
  scanId: string;
  requestDigest: string;
  formula: string;
  origin: ResearchOrigin;
  timeframe: string;
  cutoffIso: string;
  dataVersion: string;
  matches: readonly ScanResult[];
  sectorByInstrument?: ReadonlyMap<string, string>;
}): Promise<{ recorded: number; skippedDuplicates: number; istDay: string }> {
  const cutoffMs = Date.parse(input.cutoffIso);
  if (!Number.isFinite(cutoffMs)) {
    return { recorded: 0, skippedDuplicates: 0, istDay: istCalendarDay(Date.now()) };
  }
  const istDay = istCalendarDay(cutoffMs);
  const currentIstDay = istCalendarDay(Date.now());
  // Late-finishing job from a previous IST day archives normally in x1_scans but NEVER contaminates today's active memory.
  if (istDay !== currentIstDay) {
    return { recorded: 0, skippedDuplicates: 0, istDay };
  }

  const direction = inferSignalDirection(input.formula);
  const ruleSignature = await computeRuleSignature(
    input.formula,
    input.origin,
    input.timeframe,
    direction,
  );
  const db = database();
  const nowIso = new Date().toISOString();

  // Load existing daily state so we can update compact incremental aggregates atomically.
  const existingState = await db
    .prepare(
      `SELECT state_version, scans_analyzed, distinct_signals, evaluated_outcomes, aggregates_json
       FROM x9_soul_memory_daily_state
       WHERE subject=? AND ist_day=?`,
    )
    .bind(input.subject, istDay)
    .first<{
      state_version: number;
      scans_analyzed: number;
      distinct_signals: number;
      evaluated_outcomes: number;
      aggregates_json: string;
    }>()
    .catch(() => null);

  const aggregates: DailySoulMemoryAggregates = existingState
    ? (JSON.parse(existingState.aggregates_json) as DailySoulMemoryAggregates)
    : EMPTY_AGGREGATES();
  const seenKeys = new Set<string>(aggregates.seenRequestInstrumentKeys ?? []);

  const boundedMatches = input.matches.filter((m) => m.status === "PASS").slice(0, 100);
  const insertStmts = [];
  let recorded = 0;
  let skippedDuplicates = 0;

  for (const row of boundedMatches) {
    const dedupKey = `${input.requestDigest.slice(0, 16)}:${row.instrumentId}`;
    if (seenKeys.has(dedupKey)) {
      skippedDuplicates++;
      continue;
    }
    seenKeys.add(dedupKey);
    recorded++;
    const sector = input.sectorByInstrument?.get(row.instrumentId) ?? null;
    // Store only derived-safe metrics (no raw prices) so derived-only rights remain respected.
    const safeMetrics = {
      changePct: row.metrics?.changePct ?? null,
      volRatio: row.metrics?.volRatio ?? null,
      rsi14: row.metrics?.rsi14 ?? null,
      rangePosPct: row.metrics?.rangePosPct ?? null,
    };
    insertStmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO x9_soul_memory_observations
             (id, subject, ist_day, scan_id, request_digest, rule_signature, research_type, direction,
              timeframe, instrument_id, sector_group, signal_cutoff, data_version, metrics_json,
              outcome_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.subject,
          istDay,
          input.scanId,
          input.requestDigest,
          ruleSignature,
          input.origin,
          direction,
          input.timeframe,
          row.instrumentId,
          sector,
          input.cutoffIso,
          input.dataVersion,
          JSON.stringify(safeMetrics),
          nowIso,
        ),
    );
    if (sector) {
      const sAgg = aggregates.sectors[sector] ?? { sector, signals: 0, confirmed: 0, evaluated: 0 };
      sAgg.signals++;
      aggregates.sectors[sector] = sAgg;
    }
  }

  const gKey = groupKey(ruleSignature, input.timeframe, direction);
  const prevGroup = aggregates.groups[gKey] ?? {
    ruleSignature,
    timeframe: input.timeframe,
    direction,
    distinctSignals: 0,
    evaluatedOutcomes: 0,
    confirmedOutcomes: 0,
    unconfirmedOutcomes: 0,
    falseBreakouts: 0,
    avgSignedReturnPct: null,
    lastUpdatedAt: nowIso,
  };
  prevGroup.distinctSignals += recorded;
  prevGroup.lastUpdatedAt = nowIso;
  aggregates.groups[gKey] = prevGroup;
  aggregates.seenRequestInstrumentKeys = [...seenKeys].slice(-500);

  const nextScans = (existingState?.scans_analyzed ?? 0) + (recorded > 0 || skippedDuplicates === 0 ? 1 : 0);
  const nextDistinct = (existingState?.distinct_signals ?? 0) + recorded;
  const nextEvaluated = existingState?.evaluated_outcomes ?? 0;

  try {
    await db.batch([
      ...insertStmts,
      db
        .prepare(
          `INSERT INTO x9_soul_memory_daily_state
             (subject, ist_day, state_version, scans_analyzed, distinct_signals, evaluated_outcomes, aggregates_json, as_of_cutoff, updated_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(subject, ist_day) DO UPDATE SET
             state_version = x9_soul_memory_daily_state.state_version + 1,
             scans_analyzed = excluded.scans_analyzed,
             distinct_signals = excluded.distinct_signals,
             aggregates_json = excluded.aggregates_json,
             as_of_cutoff = MAX(x9_soul_memory_daily_state.as_of_cutoff, excluded.as_of_cutoff),
             updated_at = excluded.updated_at`,
        )
        .bind(
          input.subject,
          istDay,
          nextScans,
          nextDistinct,
          nextEvaluated,
          JSON.stringify(aggregates),
          input.cutoffIso,
          nowIso,
        ),
    ]);
  } catch {
    // Non-blocking: failure in SOUL MEMORY must never fail or corrupt the underlying scan archive.
  }

  return { recorded, skippedDuplicates, istDay };
}

export type MaturedBarObservation = {
  eventAt: string;
  closeAt: string;
  close: number;
};

/**
 * Evaluates PENDING same-day observations strictly against completed bars observed
 * AFTER `signal_cutoff` and AT OR BEFORE `evaluationCutoffMs` (zero look-ahead leakage).
 */
export async function evaluatePendingSoulMemoryOutcomes(input: {
  subject: string;
  evaluationCutoffMs: number;
  getSignalAndForwardBars: (
    instrumentId: string,
    signalCutoffIso: string,
    evalCutoffIso: string,
  ) => Promise<{ entryClose: number; forwardBar: MaturedBarObservation | null } | null>;
}): Promise<{ evaluated: number; confirmed: number; pendingRemaining: number }> {
  const istDay = istCalendarDay(input.evaluationCutoffMs);
  const evalCutoffIso = new Date(input.evaluationCutoffMs).toISOString();
  const db = database();

  const pending = await db
    .prepare(
      `SELECT id, rule_signature, direction, timeframe, instrument_id, sector_group, signal_cutoff
       FROM x9_soul_memory_observations
       WHERE subject=? AND ist_day=? AND outcome_status='PENDING' AND signal_cutoff < ?
       ORDER BY signal_cutoff ASC
       LIMIT 60`,
    )
    .bind(input.subject, istDay, evalCutoffIso)
    .all<{
      id: string;
      rule_signature: string;
      direction: SignalDirection;
      timeframe: string;
      instrument_id: string;
      sector_group: string | null;
      signal_cutoff: string;
    }>();

  const rows = pending.results ?? [];
  if (!rows.length) {
    return { evaluated: 0, confirmed: 0, pendingRemaining: 0 };
  }

  const stateRow = await db
    .prepare(
      `SELECT state_version, scans_analyzed, distinct_signals, evaluated_outcomes, aggregates_json
       FROM x9_soul_memory_daily_state
       WHERE subject=? AND ist_day=?`,
    )
    .bind(input.subject, istDay)
    .first<{
      state_version: number;
      scans_analyzed: number;
      distinct_signals: number;
      evaluated_outcomes: number;
      aggregates_json: string;
    }>();
  const aggregates: DailySoulMemoryAggregates = stateRow
    ? (JSON.parse(stateRow.aggregates_json) as DailySoulMemoryAggregates)
    : EMPTY_AGGREGATES();

  const updateStmts = [];
  let evaluated = 0;
  let confirmed = 0;
  let pendingRemaining = 0;
  const nowIso = new Date().toISOString();

  for (const obs of rows) {
    const bars = await input
      .getSignalAndForwardBars(obs.instrument_id, obs.signal_cutoff, evalCutoffIso)
      .catch(() => null);
    if (!bars || !bars.forwardBar || !Number.isFinite(bars.entryClose) || bars.entryClose <= 0) {
      pendingRemaining++;
      continue;
    }
    const forwardCloseMs = Date.parse(bars.forwardBar.closeAt);
    const signalMs = Date.parse(obs.signal_cutoff);
    // Strict anti-lookahead guard: forward bar MUST complete after signal and at/before evaluation cutoff.
    if (
      !Number.isFinite(forwardCloseMs) ||
      forwardCloseMs <= signalMs ||
      forwardCloseMs > input.evaluationCutoffMs
    ) {
      pendingRemaining++;
      continue;
    }
    const rawRetPct = ((bars.forwardBar.close - bars.entryClose) / bars.entryClose) * 100;
    const signedRetPct =
      obs.direction === "SHORT" ? -rawRetPct : rawRetPct;
    const isConfirmed =
      obs.direction === "NEUTRAL" ? Math.abs(rawRetPct) >= 0.25 : signedRetPct > 0;
    const isFalseBreakout = !isConfirmed && signedRetPct <= -0.5;
    const status = isConfirmed ? "CONFIRMED" : "UNCONFIRMED";
    const roundedRet = Math.round(signedRetPct * 1000) / 1000;

    updateStmts.push(
      db
        .prepare(
          `UPDATE x9_soul_memory_observations
           SET outcome_status=?, outcome_return_pct=?, outcome_evaluated_at=?
           WHERE id=? AND outcome_status='PENDING'`,
        )
        .bind(status, roundedRet, evalCutoffIso, obs.id),
    );

    const gKey = groupKey(obs.rule_signature, obs.timeframe, obs.direction);
    const grp = aggregates.groups[gKey] ?? {
      ruleSignature: obs.rule_signature,
      timeframe: obs.timeframe,
      direction: obs.direction,
      distinctSignals: 1,
      evaluatedOutcomes: 0,
      confirmedOutcomes: 0,
      unconfirmedOutcomes: 0,
      falseBreakouts: 0,
      avgSignedReturnPct: null,
      lastUpdatedAt: nowIso,
    };
    const prevN = grp.evaluatedOutcomes;
    grp.evaluatedOutcomes = prevN + 1;
    if (isConfirmed) grp.confirmedOutcomes++;
    else grp.unconfirmedOutcomes++;
    if (isFalseBreakout) grp.falseBreakouts++;
    grp.avgSignedReturnPct =
      grp.avgSignedReturnPct === null
        ? roundedRet
        : Math.round(((grp.avgSignedReturnPct * prevN + roundedRet) / (prevN + 1)) * 1000) / 1000;
    grp.lastUpdatedAt = nowIso;
    aggregates.groups[gKey] = grp;

    if (obs.sector_group) {
      const sAgg = aggregates.sectors[obs.sector_group] ?? {
        sector: obs.sector_group,
        signals: 1,
        confirmed: 0,
        evaluated: 0,
      };
      sAgg.evaluated++;
      if (isConfirmed) sAgg.confirmed++;
      aggregates.sectors[obs.sector_group] = sAgg;
    }

    evaluated++;
    if (isConfirmed) confirmed++;
  }

  if (updateStmts.length > 0) {
    await db.batch([
      ...updateStmts,
      db
        .prepare(
          `INSERT INTO x9_soul_memory_daily_state
             (subject, ist_day, state_version, scans_analyzed, distinct_signals, evaluated_outcomes, aggregates_json, as_of_cutoff, updated_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(subject, ist_day) DO UPDATE SET
             state_version = x9_soul_memory_daily_state.state_version + 1,
             evaluated_outcomes = x9_soul_memory_daily_state.evaluated_outcomes + ?,
             aggregates_json = excluded.aggregates_json,
             as_of_cutoff = MAX(x9_soul_memory_daily_state.as_of_cutoff, excluded.as_of_cutoff),
             updated_at = excluded.updated_at`,
        )
        .bind(
          input.subject,
          istDay,
          stateRow?.scans_analyzed ?? 1,
          stateRow?.distinct_signals ?? evaluated,
          evaluated,
          JSON.stringify(aggregates),
          evalCutoffIso,
          nowIso,
          evaluated,
        ),
    ]);
  }

  return { evaluated, confirmed, pendingRemaining };
}

/**
 * Daily IST Midnight Reset (Contract D5 — cron `30 18 * * *` = 00:00 IST).
 * Idempotently prunes ONLY prior-day active learning state (`ist_day < currentIstDay`)
 * in bounded batches, records a heartbeat, and NEVER touches immutable `x1_scans` / `x9_scan_lineage`.
 */
export async function resetExpiredSoulMemoryDailyState(
  nowMs = Date.now(),
): Promise<{ currentIstDay: string; prunedStates: number; prunedObservations: number }> {
  const currentIstDay = istCalendarDay(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const db = database();
  let prunedStates = 0;
  let prunedObservations = 0;
  try {
    const [obsRes, stateRes] = await db.batch([
      db
        .prepare(
          `DELETE FROM x9_soul_memory_observations
           WHERE rowid IN (SELECT rowid FROM x9_soul_memory_observations WHERE ist_day < ? LIMIT 2000)`,
        )
        .bind(currentIstDay),
      db
        .prepare(
          `DELETE FROM x9_soul_memory_daily_state
           WHERE rowid IN (SELECT rowid FROM x9_soul_memory_daily_state WHERE ist_day < ? LIMIT 500)`,
        )
        .bind(currentIstDay),
    ]);
    prunedObservations = Number(obsRes.meta.changes ?? 0);
    prunedStates = Number(stateRes.meta.changes ?? 0);
    await recordSystemHeartbeat("soul_memory_ist_midnight_reset", {
      status: "OK",
      dayKey: currentIstDay,
      startedAt: nowIso,
      succeededAt: new Date().toISOString(),
      detail: { prunedStates, prunedObservations },
    });
  } catch (err) {
    await recordSystemHeartbeat("soul_memory_ist_midnight_reset", {
      status: "ERROR",
      dayKey: currentIstDay,
      startedAt: nowIso,
      succeededAt: null,
      detail: { error: err instanceof Error ? err.name : "UnknownError" },
    });
  }
  return { currentIstDay, prunedStates, prunedObservations };
}

export async function recordSystemHeartbeat(
  jobKey: string,
  info: {
    status: "OK" | "ERROR";
    dayKey?: string | null;
    startedAt: string;
    succeededAt: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    await database()
      .prepare(
        `INSERT INTO x9_system_heartbeats
           (job_key, last_started_at, last_succeeded_at, last_day_key, last_status, detail_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_key) DO UPDATE SET
           last_started_at = excluded.last_started_at,
           last_succeeded_at = COALESCE(excluded.last_succeeded_at, x9_system_heartbeats.last_succeeded_at),
           last_day_key = COALESCE(excluded.last_day_key, x9_system_heartbeats.last_day_key),
           last_status = excluded.last_status,
           detail_json = excluded.detail_json,
           updated_at = excluded.updated_at`,
      )
      .bind(
        jobKey,
        info.startedAt,
        info.succeededAt,
        info.dayKey ?? null,
        info.status,
        JSON.stringify(info.detail ?? {}),
        nowIso,
      )
      .run();
  } catch {
    // Graceful no-op if migration 0021 is absent in a legacy isolated test fixture.
  }
}
