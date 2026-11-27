/**
 * Strategic Souls X 3.0 — Reproducible Research Metadata & Rerun Lineage (Contract B).
 *
 * Extends immutable `x1_scans` snapshots with versioned provenance, canonical digesting,
 * honest reproducibility classification (distinguishing full snapshot retention vs derived-only
 * checksum limitation), and rerun-as-new linkage (`ORIGINAL` | `RERUN_LATEST` | `REPRODUCE_ORIGINAL`).
 */
import { database } from "../../../database/queries/repository";
import { digest } from "../../engines/engine";
import type { Interval } from "../market-data/data-types";
import { historyWindowForInterval } from "../market-data/timeframes";

export const REPRODUCIBLE_ENGINE_VERSION = "ss-x3-scan-engine-3.0";

export type RerunMode = "ORIGINAL" | "RERUN_LATEST" | "REPRODUCE_ORIGINAL";
export type ReproducibilityStatus =
  | "FULL_SNAPSHOT"
  | "DERIVED_CHECKSUM_ONLY"
  | "LIMITED_BY_DATA_RIGHTS";

export type ReproducibilityRecord = {
  scanId: string;
  rerunOfScanId: string | null;
  rerunMode: RerunMode;
  formulaVersion: string;
  engineVersion: string;
  universeVersion: string;
  universeHash: string;
  timeframe: Interval;
  historyStartIso: string;
  historyCutoffIso: string;
  dataFreshness: string;
  rightsMode: string;
  soulMemoryDay: string | null;
  soulMemoryVersion: number;
  reproducibilityStatus: ReproducibilityStatus;
  reproducibilityNote: string;
  canonicalDigest: string;
  createdAt: string;
};

/**
 * Canonical deterministic hash of unordered universe members (sorted lexicographically)
 * so universe drift is always detectable between original runs and reruns.
 */
export async function computeUniverseHash(memberIds: readonly string[]): Promise<string> {
  const sorted = [...new Set(memberIds.map((m) => m.trim().toUpperCase()))].sort();
  return digest({ count: sorted.length, members: sorted });
}

export async function buildReproducibilityRecord(input: {
  scanId: string;
  rerunOfScanId?: string | null;
  rerunMode?: RerunMode;
  formulaVersion: string;
  formula: string;
  universeVersion: string;
  memberIds: readonly string[];
  timeframe: Interval;
  cutoffIso: string;
  dataFreshness: string;
  rightsMode: "DISPLAY_AND_DERIVED" | "DERIVED_ONLY" | "OFFICIAL_REFERENCE" | "PRIVATE_OWNER_FEED" | "CUSTOM_CSV";
  rawCandlesRetained: boolean;
  soulMemoryDay?: string | null;
  soulMemoryVersion?: number;
  createdAt?: string;
}): Promise<ReproducibilityRecord> {
  const cutoffMs = Date.parse(input.cutoffIso) || Date.now();
  const win = historyWindowForInterval(input.timeframe, cutoffMs);
  const universeHash = await computeUniverseHash(input.memberIds);
  const rerunMode: RerunMode = input.rerunMode ?? "ORIGINAL";

  let reproducibilityStatus: ReproducibilityStatus;
  let reproducibilityNote: string;
  if (input.rawCandlesRetained && input.rightsMode !== "DERIVED_ONLY") {
    reproducibilityStatus = "FULL_SNAPSHOT";
    reproducibilityNote =
      "Completed input bars, formula AST, universe membership, and cutoff are retained for exact reproduction under current access rights.";
  } else if (input.rightsMode === "DERIVED_ONLY") {
    reproducibilityStatus = "DERIVED_CHECKSUM_ONLY";
    reproducibilityNote =
      "Source licence permits derived outcomes only; raw exchange candles are not persisted in personal archives. Reproducibility is anchored by canonical digest, universe hash, and cutoff metadata.";
  } else {
    reproducibilityStatus = "LIMITED_BY_DATA_RIGHTS";
    reproducibilityNote =
      "Original source candles cannot be redistributed or permanently retained under current provider terms; rerun uses current eligible universe/data and records any version drift.";
  }

  const canonicalDigest = await digest({
    formulaVersion: input.formulaVersion,
    engineVersion: REPRODUCIBLE_ENGINE_VERSION,
    formula: input.formula.replace(/\s+/g, " ").trim(),
    universeVersion: input.universeVersion,
    universeHash,
    timeframe: input.timeframe,
    historyStartIso: win.startIso,
    historyCutoffIso: win.cutoffIso,
    rightsMode: input.rightsMode,
  });

  return {
    scanId: input.scanId,
    rerunOfScanId: input.rerunOfScanId ?? null,
    rerunMode,
    formulaVersion: input.formulaVersion,
    engineVersion: REPRODUCIBLE_ENGINE_VERSION,
    universeVersion: input.universeVersion,
    universeHash,
    timeframe: input.timeframe,
    historyStartIso: win.startIso,
    historyCutoffIso: win.cutoffIso,
    dataFreshness: input.dataFreshness,
    rightsMode: input.rightsMode,
    soulMemoryDay: input.soulMemoryDay ?? null,
    soulMemoryVersion: input.soulMemoryVersion ?? 0,
    reproducibilityStatus,
    reproducibilityNote,
    canonicalDigest,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export async function persistScanLineage(
  subject: string,
  record: ReproducibilityRecord,
): Promise<void> {
  try {
    await database()
      .prepare(
        `INSERT OR IGNORE INTO x9_scan_lineage (
           scan_id, subject, rerun_of_scan_id, rerun_mode, formula_version, engine_version,
           universe_version, universe_hash, timeframe, history_start_iso, history_cutoff_iso,
           data_freshness, rights_mode, soul_memory_day, soul_memory_version,
           reproducibility_status, reproducibility_note, canonical_digest, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.scanId,
        subject,
        record.rerunOfScanId,
        record.rerunMode,
        record.formulaVersion,
        record.engineVersion,
        record.universeVersion,
        record.universeHash,
        record.timeframe,
        record.historyStartIso,
        record.historyCutoffIso,
        record.dataFreshness,
        record.rightsMode,
        record.soulMemoryDay,
        record.soulMemoryVersion,
        record.reproducibilityStatus,
        record.reproducibilityNote,
        record.canonicalDigest,
        record.createdAt,
      )
      .run();
  } catch {
    // Graceful no-op if migration 0021 is not applied in an isolated legacy test fixture.
  }
}

export async function getScanLineage(
  subject: string,
  scanId: string,
): Promise<{
  record: ReproducibilityRecord | null;
  reruns: { scanId: string; rerunMode: RerunMode; createdAt: string }[];
}> {
  try {
    const db = database();
    const [row, children] = await Promise.all([
      db
        .prepare(`SELECT * FROM x9_scan_lineage WHERE scan_id=? AND subject=?`)
        .bind(scanId, subject)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT scan_id, rerun_mode, created_at
           FROM x9_scan_lineage
           WHERE rerun_of_scan_id=? AND subject=?
           ORDER BY created_at DESC
           LIMIT 20`,
        )
        .bind(scanId, subject)
        .all<{ scan_id: string; rerun_mode: RerunMode; created_at: string }>(),
    ]);
    const record: ReproducibilityRecord | null = row
      ? {
          scanId: String(row.scan_id),
          rerunOfScanId: row.rerun_of_scan_id ? String(row.rerun_of_scan_id) : null,
          rerunMode: row.rerun_mode as RerunMode,
          formulaVersion: String(row.formula_version),
          engineVersion: String(row.engine_version),
          universeVersion: String(row.universe_version),
          universeHash: String(row.universe_hash),
          timeframe: row.timeframe as Interval,
          historyStartIso: String(row.history_start_iso),
          historyCutoffIso: String(row.history_cutoff_iso),
          dataFreshness: String(row.data_freshness),
          rightsMode: String(row.rights_mode),
          soulMemoryDay: row.soul_memory_day ? String(row.soul_memory_day) : null,
          soulMemoryVersion: Number(row.soul_memory_version ?? 0),
          reproducibilityStatus: row.reproducibility_status as ReproducibilityStatus,
          reproducibilityNote: String(row.reproducibility_note),
          canonicalDigest: String(row.canonical_digest),
          createdAt: String(row.created_at),
        }
      : null;
    return {
      record,
      reruns: (children.results ?? []).map((c) => ({
        scanId: c.scan_id,
        rerunMode: c.rerun_mode,
        createdAt: c.created_at,
      })),
    };
  } catch {
    return { record: null, reruns: [] };
  }
}

export function diffReproducibility(
  original: Pick<
    ReproducibilityRecord,
    "universeVersion" | "universeHash" | "timeframe" | "formulaVersion" | "engineVersion" | "historyCutoffIso"
  >,
  latest: Pick<
    ReproducibilityRecord,
    "universeVersion" | "universeHash" | "timeframe" | "formulaVersion" | "engineVersion" | "historyCutoffIso"
  >,
): string[] {
  const diffs: string[] = [];
  if (original.universeVersion !== latest.universeVersion || original.universeHash !== latest.universeHash) {
    diffs.push(`Universe changed (${original.universeVersion} -> ${latest.universeVersion})`);
  }
  if (original.historyCutoffIso !== latest.historyCutoffIso) {
    diffs.push(`Cutoff advanced (${original.historyCutoffIso} -> ${latest.historyCutoffIso})`);
  }
  if (original.formulaVersion !== latest.formulaVersion) {
    diffs.push(`Formula version changed (${original.formulaVersion} -> ${latest.formulaVersion})`);
  }
  if (original.engineVersion !== latest.engineVersion) {
    diffs.push(`Engine version changed (${original.engineVersion} -> ${latest.engineVersion})`);
  }
  if (original.timeframe !== latest.timeframe) {
    diffs.push(`Timeframe changed (${original.timeframe} -> ${latest.timeframe})`);
  }
  return diffs;
}
