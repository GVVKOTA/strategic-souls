import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { digest } from "../../../database/queries/notebook-repository";
import {
  CURRENCIES,
  validateTransaction,
  summarizePortfolio,
  type Transaction,
} from "../../engines/portfolio";
import { compileFormula, computeScanMetrics, requiredScanBars } from "../../engines/scan";
import { researchUniverse, type ResearchUniverse } from "../market-data/data-service";
import { backtestResearch } from "../../engines/backtest";
import {
  projectResearchSnapshot,
  snapshotDisplayRights,
  type DisplayRightsCache,
} from "./scan-projection";
import {
  validateResearch,
  validateScanRequestScope,
  isScanUniversePreset,
  preflightResearch,
  parsePrivateCsvDataset,
  assessEvidence,
  replayResearch,
  type ResearchDefinition,
  type EvidenceCase,
} from "./research";
import {
  persistReservedScan,
  getScanQuotaSummary,
  releaseScanReservation,
  reserveScanSlot,
  type ScanQuotaTier,
} from "./scan-quota";
import { parseDiscoverQuery } from "./discover-parser";
import { CLASSIC_50_PRESETS } from "./classic-presets";
import {
  matchDrawnPattern,
  validateStrokePoints,
  type DrawPoint,
} from "../../engines/pattern-draw";
import { runSoulGenomeEvidence } from "../../engines/soul-genome";

const VALID_CLASSIC_FORMULA_IDS = new Set(CLASSIC_50_PRESETS.map((p) => p.id));

async function listPinnedFormulaIds(
  db: ReturnType<typeof database>,
  subject: string,
): Promise<string[]> {
  try {
    const res = await db
      .prepare(
        "SELECT formula_id FROM v3_formula_pins WHERE subject=? ORDER BY created_at DESC, formula_id ASC LIMIT 50",
      )
      .bind(subject)
      .all<{ formula_id: string }>();
    return res.results
      .map((r) => r.formula_id)
      .filter((id) => VALID_CLASSIC_FORMULA_IDS.has(id));
  } catch {
    return [];
  }
}
type RawRecord = {
  id: string;
  subject: string;
  kind: string;
  name: string;
  payload: string;
  version: number;
  archived: number;
  created_at: string;
  updated_at: string;
};
type RawScan = {
  id: string;
  name: string;
  mode: string;
  payload: string;
  digest: string;
  created_at: string;
  review_state: string | null;
};
export type WorkspaceStateOptions = {
  includeSnapshots?: boolean;
  scanBefore?: string;
};
function scanCursor(value: unknown): { createdAt: string; id: string } {
  if (typeof value !== "string" || value.length > 120)
    throw new HttpError(400, "Use the returned scan history cursor.");
  const parts = value.split("|");
  const stamp = parts[0],
    id = parts[1],
    date = Date.parse(stamp);
  if (
    parts.length !== 2 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp) ||
    !Number.isFinite(date) ||
    new Date(date).toISOString() !== stamp ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(id)
  )
    throw new HttpError(400, "Use the returned scan history cursor.");
  return { createdAt: stamp, id };
}
const text = (v: unknown, max = 80) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new HttpError(400, "Enter 1–" + max + " characters.");
  return v.trim();
};
const retryKey = (v: unknown) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(v))
    throw new HttpError(400, "Stable request ID required.");
  return v;
};
const recordView = (r: RawRecord) => ({
  ...r,
  subject: undefined,
  payload: JSON.parse(r.payload),
});
async function owned(subject: string, id: unknown) {
  const row = await database()
    .prepare("SELECT * FROM x1_records WHERE subject=? AND id=? AND archived=0")
    .bind(subject, text(id))
    .first<RawRecord>();
  if (!row) throw new HttpError(404, "Record not found.");
  return row;
}
/** Digest always identifies the immutable server snapshot, including non-display source inputs. */
const scanView = async (
  scan: RawScan,
  snapshotRequested: boolean,
  rightsCache: DisplayRightsCache = new Map(),
) => {
  const { review_state, ...snapshot } = scan;
  const projection = await projectResearchSnapshot(
    JSON.parse(scan.payload),
    snapshotRequested,
    rightsCache,
  );
  return {
    ...snapshot,
    payload: projection.payload,
    reviewState: review_state ?? null,
    snapshotIncluded: snapshotRequested && !projection.redaction.applied,
    digestScope: "FULL_STORED_SNAPSHOT" as const,
    digestVerifiableFromResponse: projection.digestVerifiableFromResponse,
    redaction: projection.redaction,
  };
};
// Review state is current metadata, not a mutation of the creation-time scan snapshot.
const SCAN_REVIEW_STATE =
  "(SELECT e.kind FROM x1_scan_events e WHERE e.subject=s.subject AND e.scan_id=s.id ORDER BY e.created_at DESC,e.rowid DESC LIMIT 1) AS review_state";
async function ownedScanSnapshot(subject: string, scanId: unknown) {
  const scan = await database()
    .prepare(
      `SELECT s.id,s.name,s.mode,s.payload,s.digest,s.created_at,${SCAN_REVIEW_STATE} FROM x1_scans s WHERE s.subject=? AND s.id=?`,
    )
    .bind(subject, text(scanId))
    .first<RawScan>();
  if (!scan) throw new HttpError(404, "Scan not found.");
  return { ...scan, payload: JSON.parse(scan.payload) };
}
export async function workspaceScanSnapshot(subject: string, scanId: unknown) {
  const stored = await ownedScanSnapshot(subject, scanId);
  return scanView({ ...stored, payload: JSON.stringify(stored.payload) }, true);
}
/** Normal refreshes omit historical input datasets in SQL; exports explicitly request intact snapshots. */
export async function workspaceState(
  subject: string,
  options: WorkspaceStateOptions = {},
) {
  const db = database();
  const includeSnapshots = options.includeSnapshots === true;
  const cursor =
    options.scanBefore === undefined ? null : scanCursor(options.scanBefore);
  if (includeSnapshots && cursor)
    throw new HttpError(
      400,
      "A complete snapshot export cannot use a history cursor.",
    );
  const archivedLimit = includeSnapshots ? 1000 : 100;
  const [records, archived, ledger, scans, events, scanQuota, pinnedFormulaIds] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM x1_records WHERE subject=? AND archived=0 ORDER BY created_at,id LIMIT 101",
      )
      .bind(subject)
      .all<RawRecord>(),
    db
      .prepare(
        "SELECT * FROM x1_records WHERE subject=? AND archived=1 AND kind<>'scan-title' ORDER BY updated_at DESC,id DESC LIMIT ?",
      )
      .bind(subject, archivedLimit + 1)
      .all<RawRecord>(),
    db
      .prepare(
        `SELECT id,portfolio_id,payload,created_at FROM x1_effective_ledger WHERE subject=?
           ORDER BY json_extract(payload,'$.date'),CAST(json_extract(payload,'$.ledgerSequence') AS INTEGER),id LIMIT 2001`,
      )
      .bind(subject)
      .all<{
        id: string;
        portfolio_id: string;
        payload: string;
        created_at: string;
      }>(),
    db
      .prepare(
        `SELECT s.id,s.name,s.mode,${includeSnapshots ? "s.payload" : "json_remove(s.payload,'$.datasets') AS payload"},s.digest,s.created_at,${SCAN_REVIEW_STATE} FROM x1_scans s WHERE s.subject=? ${cursor ? "AND (s.created_at<? OR (s.created_at=? AND s.id<?))" : ""} ORDER BY s.created_at DESC,s.id DESC LIMIT 101`,
      )
      .bind(
        ...(cursor
          ? [subject, cursor.createdAt, cursor.createdAt, cursor.id]
          : [subject]),
      )
      .all<RawScan>(),
    db
      .prepare(
        "SELECT id,scan_id,kind,note,created_at FROM x1_scan_events WHERE subject=? ORDER BY created_at DESC,rowid DESC LIMIT 501",
      )
      .bind(subject)
      .all(),
    getScanQuotaSummary(db, subject),
    listPinnedFormulaIds(db, subject),
  ]);
  if (
    records.results.length > 100 ||
    ledger.results.length > 2000 ||
    (includeSnapshots && scans.results.length > 100) ||
    (includeSnapshots && events.results.length > 500) ||
    (includeSnapshots && archived.results.length > archivedLimit)
  )
    throw new HttpError(
      413,
      "Workspace exceeds this release limit. Request a complete operator export; no partial archive returned.",
    );
  const transactions = ledger.results.map((t) => ({
    ...t,
    payload: JSON.parse(t.payload) as Transaction,
  }));
  const historyPage = scans.results.slice(0, 100);
  const scanHistoryHasMore = scans.results.length > 100;
  const lastScan = historyPage[historyPage.length - 1];
  const rightsCache: DisplayRightsCache = new Map();
  const projectedScans = await Promise.all(
    historyPage.map((scan) => scanView(scan, includeSnapshots, rightsCache)),
  );
  return {
    records: records.results.map(recordView),
    researchDrafts: records.results
      .filter((r) => r.kind === "scan-draft")
      .map(recordView),
    savedPatterns: records.results
      .filter((r) => r.kind === "pattern-template")
      .map(recordView),
    researchPreferences: records.results.find(
      (r) => r.kind === "research-preferences",
    )
      ? JSON.parse(
          records.results.find((r) => r.kind === "research-preferences")!
            .payload,
        )
      : { reusePersonal: true, aggregate: false },
    archivedRecords: archived.results.slice(0, archivedLimit).map(recordView),
    archivedRecordsHasMore: archived.results.length > archivedLimit,
    transactions,
    scans: projectedScans,
    scanHistoryHasMore,
    scanHistoryNextBefore:
      scanHistoryHasMore && lastScan
        ? lastScan.created_at + "|" + lastScan.id
        : null,
    scanEvents: events.results.slice(0, 500).reverse(),
    scanEventsHasMore: events.results.length > 500,
    portfolios: records.results
      .filter((r) => r.kind === "portfolio")
      .map((r) => ({
        ...recordView(r),
        summary: summarizePortfolio(
          transactions
            .filter((t) => t.portfolio_id === r.id)
            .map((t) => t.payload),
          JSON.parse(r.payload).currency,
        ),
      })),
    advanced: {
      billingEnabled: false,
      allowance:
        "Classic: 20 completed scans / IST day · Advanced: 1 completed scan / rolling 60 min · Zero paid credits.",
    },
    scanQuota,
    pinnedFormulaIds,
  };
}
export async function researchEvidence(subject: string, scanId: unknown) {
  const scan = await ownedScanSnapshot(subject, scanId);
  const payload = scan.payload;
  const definition = payload.research as ResearchDefinition | undefined;
  const prefs = await database()
    .prepare(
      "SELECT payload FROM x1_records WHERE subject=? AND kind='research-preferences' AND archived=0 LIMIT 1",
    )
    .bind(subject)
    .first<{ payload: string }>();
  const reusePersonal = prefs
    ? JSON.parse(prefs.payload).reusePersonal === true
    : true;
  const rows = await database()
    .prepare(
      "SELECT s.id,s.name,s.created_at,json_extract(s.payload,'$.research') AS definition,json_extract(s.payload,'$.replay.cases') AS cases,json_extract(s.payload,'$.sourceLineage') AS lineage,(SELECT kind FROM x1_scan_events e WHERE e.scan_id=s.id AND e.subject=s.subject ORDER BY created_at DESC,rowid DESC LIMIT 1) AS review FROM x1_scans s WHERE s.subject=? AND s.created_at<=? ORDER BY s.created_at DESC,s.id DESC LIMIT 101",
    )
    .bind(subject, scan.created_at)
    .all<{
      id: string;
      name: string;
      created_at: string;
      definition: string | null;
      cases: string | null;
      lineage: string | null;
      review: string | null;
    }>();
  const rightsCache: DisplayRightsCache = new Map();
  const selectedRights = await snapshotDisplayRights(payload, rightsCache);
  let derivedWithheld = [...selectedRights.values()].some(
    (right) => !right.derivedDisplayAllowed,
  );
  const cases: EvidenceCase[] = [];
  for (const row of rows.results.slice(0, 100))
    if (row.cases) {
      const historicalRights = await snapshotDisplayRights(
        { sourceLineage: row.lineage ? JSON.parse(row.lineage) : [] },
        rightsCache,
      );
      const parsed = JSON.parse(row.cases) as EvidenceCase[];
      for (const item of parsed) {
        if (cases.length >= 20000) break;
        if (
          item.subject === subject &&
          !historicalRights.get(item.instrumentId)?.derivedDisplayAllowed
        )
          derivedWithheld = true;
        if (item.subject === subject)
          cases.push({
            ...item,
            retired: !!row.review && row.review !== "RESTORED",
          });
      }
    }
  const fallback = {
    family: "POSITIVE_RETURN",
    horizon: 10,
    threshold: 0,
    target: 5,
    stop: 3,
    costBps: 0,
  } as const;
  const internalScore = assessEvidence(cases, {
    subject,
    asOf: scan.created_at,
    formula: payload.rule.formula,
    outcome: definition?.outcome ?? fallback,
    reusePersonal,
  });
  const score = derivedWithheld
    ? assessEvidence([], {
        subject,
        asOf: scan.created_at,
        formula: payload.rule.formula,
        outcome: definition?.outcome ?? fallback,
        reusePersonal: false,
      })
    : internalScore;
  if (derivedWithheld)
    score.reasons = [
      "Evidence outputs are withheld by the current source licence. Permitted internal analysis is retained without displaying its values.",
    ];
  return {
    score,
    redaction: {
      applied: derivedWithheld,
      reason: derivedWithheld
        ? "Derived source outputs are not display-licensed."
        : null,
    },
    historyLimitReached: rows.results.length > 100,
    reusePersonal,
    aggregateEnabled: false,
    similar: reusePersonal
      ? rows.results
          .filter(
            (row) =>
              row.id !== scan.id &&
              row.definition &&
              JSON.parse(row.definition).formula === payload.rule.formula,
          )
          .slice(0, 12)
          .map((row) => ({
            id: row.id,
            name: row.name,
            created_at: row.created_at,
            compatibility:
              JSON.stringify(JSON.parse(row.definition!).outcome) ===
              JSON.stringify(definition?.outcome)
                ? "Same rule and outcome"
                : "Same rule; outcome differs (not scored)",
          }))
      : [],
    limitation:
      "Personal, authorized history only. Group sharing never grants model-training consent. A selected negative-only Graveyard cannot estimate success. No verified unconditional baseline is connected, so forward probability stays suppressed.",
  };
}
function researchDefinition(input: Record<string, unknown>) {
  try {
    return validateResearch(input);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}
async function replayOwnedScan(
  db: ReturnType<typeof database>,
  subject: string,
  requestId: string,
  signature: string,
) {
  const prior = await db
    .prepare("SELECT id,payload FROM x1_scans WHERE subject=? AND request_key=?")
    .bind(subject, requestId)
    .first<{ id: string; payload: string }>();
  if (!prior) return null;
  if (JSON.parse(prior.payload).requestDigest !== signature)
    throw new HttpError(409, "Scan retry ID already used for different inputs.");
  return { id: prior.id, replayed: true };
}
async function scanSource(
  subject: string,
  definition: ResearchDefinition,
  customCsv?: unknown,
  minimumBars?: number,
  traceId?: string,
) {
  const preset = definition.universePreset;
  const hasCsv = typeof customCsv === "string" && customCsv.trim().length > 0 &&
    (preset === undefined || preset === "CUSTOM_CSV");
  const unavailable = (source: string, reason: string): ResearchUniverse => ({
    datasets: [],
    excluded: [{ id: source, reason, kind: "scope" }],
    source,
    pointInTime: false,
    adjusted: false,
    rights: { analysis: false, storage: false },
    asOf: new Date().toISOString(),
    lineage: [],
  });
  if (preset === "CUSTOM_CSV" && !hasCsv)
    return unavailable("Private CSV", "Upload a dated daily CSV to scan this universe.");
  if ((hasCsv || preset === "CUSTOM_CSV") && definition.interval !== "1d")
    return unavailable(
      "Private CSV",
      `Private CSV uploads supply daily bars and cannot run on ${definition.interval}. Select Daily (1d).`,
    );
  const ecbOnly = preset === "ECB_DAILY" || (!preset && definition.universe === "ECB_DAILY");
  if (ecbOnly && (definition.interval === "30m" || definition.interval === "1h")) {
    return unavailable(
      "ECB Daily Reference FX",
      `ECB daily reference FX does not publish genuine ${definition.interval === "30m" ? "30-minute (30m)" : "1-hour (1h)"} candles. Select Daily, Weekly, or Monthly.`,
    );
  }
  if (hasCsv) {
    let parsed;
    try {
      parsed = parsePrivateCsvDataset(customCsv);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    const filtered = definition.instrumentIds.length
      ? parsed.datasets.filter((d) =>
          definition.instrumentIds.includes(d.instrumentId) ||
          definition.instrumentIds.includes(d.instrumentId.replace(/^CSV:/, "")),
        )
      : parsed.datasets;
    return {
      datasets: filtered,
      excluded: parsed.excluded,
      source: parsed.source,
      pointInTime: false,
      adjusted: false,
      rights: { analysis: true, storage: true },
      asOf: parsed.asOf,
      lineage: filtered.map((d) => ({
        instrumentId: d.instrumentId,
        provider: parsed.source,
        eventAt: d.observations.at(-1)?.eventAt?.slice(0, 10) ?? null,
        retrievedAt: parsed.asOf,
        adjustment: "USER_IMPORTED_RAW",
        displayAllowed: true,
        derivedDisplayAllowed: true,
        rightsExpiresAt: null,
        interval: definition.interval,
        periodPolicy: "USER_IMPORTED_CSV_OBSERVATIONS",
      })),
    };
  }
  const options = { interval: definition.interval, minimumBars, universePreset: preset, traceId };
  if (preset === "MY_WATCHLIST") {
    const watchlist = await database()
      .prepare("SELECT payload FROM x1_records WHERE subject=? AND kind='watchlist' AND archived=0 AND (? IS NULL OR id=?) ORDER BY created_at,id LIMIT 1")
      .bind(subject, definition.watchlistId ?? null, definition.watchlistId ?? null)
      .first<{ payload: string }>();
    if (!watchlist && definition.watchlistId)
      return unavailable("Watchlist", "The selected watchlist is unavailable. Choose one of your active watchlists.");
    const saved = watchlist ? JSON.parse(watchlist.payload).items as string[] : [];
    if (!saved.length)
      return unavailable("Watchlist", "Your Watchlist is empty. Add instruments to your active watchlist or switch Scan Source to Market.");
    const requested = new Set(definition.instrumentIds);
    const members = [...new Set(saved)].filter((id) => !requested.size || requested.has(id));
    const excluded = definition.instrumentIds.filter((id) => !saved.includes(id))
      .map((id) => ({ id, kind: "denied" as const, reason: "Instrument is outside your active watchlist." }));
    const ecb = members.filter((id) => id.startsWith("ECB:"));
    const connected = members.filter((id) => !id.startsWith("ECB:"));
    const sources = await Promise.all([
      ...(ecb.length ? [researchUniverse(subject, { ...options, provider: "ECB", instrumentIds: ecb })] : []),
      ...(connected.length ? [researchUniverse(subject, { ...options, provider: "CONNECTED_MARKETS", instrumentIds: connected })] : []),
    ]);
    const datasets = sources.flatMap((source) => source.datasets);
    return {
      datasets,
      excluded: [...excluded, ...sources.flatMap((source) => source.excluded)],
      source: "Watchlist",
      pointInTime: false,
      adjusted: false,
      rights: { analysis: datasets.length > 0, storage: datasets.length > 0 },
      asOf: new Date().toISOString(),
      lineage: sources.flatMap((source) => source.lineage),
    };
  }
  const ecb = preset === "ECB_DAILY" || (!preset && definition.universe === "ECB_DAILY");
  const data = await researchUniverse(subject, {
    ...options,
    provider: ecb ? "ECB" : "CONNECTED_MARKETS",
    instrumentIds: definition.instrumentIds,
  });
  if (preset && !data.datasets.length && !data.excluded.length) {
    const label =
      preset === "MARKET"
        ? "Market"
        : preset === "MCX_FUTURES"
          ? "MCX Futures"
          : preset === "INDIAN_EQUITIES"
            ? "Indian Equities"
            : "ECB Daily Reference FX";
    const reason =
      data.diagnostics?.failureCategory === "SHARED_MARKET_DATA_UNCONFIGURED"
        ? "Shared NSE, BSE, and MCX market history is not yet active for standard accounts on this deployment. Your scan quota was not charged."
        : "Eligible historical market data is temporarily unavailable for this timeframe. Retry shortly; your scan quota was not charged.";
    return unavailable(label, reason);
  }
  const datasets =
    !ecb
      ? data.datasets.filter((d) => !d.instrumentId.startsWith("ECB:"))
      : data.datasets;
  return { ...data, datasets };
}
export async function mutateWorkspace(
  subject: string,
  input: Record<string, unknown>,
  traceId?: string,
) {
  const db = database(),
    action = input.action,
    now = new Date().toISOString();
  if (action === "preflight-scan" || action === "run-scan" || action === "run-draw-scan") {
    try {
      validateScanRequestScope(input);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  }
  await rate(subject + ":x1write", 120, 60000);
  if (action === "pin-formula" || action === "unpin-formula") {
    const formulaId = typeof input.formulaId === "string" ? input.formulaId.trim() : "";
    if (!VALID_CLASSIC_FORMULA_IDS.has(formulaId)) {
      throw new HttpError(400, "Choose a valid Classic formula to pin.");
    }
    if (action === "pin-formula") {
      await db
        .prepare(
          "INSERT OR IGNORE INTO v3_formula_pins (subject, formula_id, created_at) VALUES (?, ?, ?)",
        )
        .bind(subject, formulaId, now)
        .run();
    } else {
      await db
        .prepare("DELETE FROM v3_formula_pins WHERE subject=? AND formula_id=?")
        .bind(subject, formulaId)
        .run();
    }
    const pinnedFormulaIds = await listPinnedFormulaIds(db, subject);
    return { ok: true, pinned: action === "pin-formula", formulaId, pinnedFormulaIds };
  }
  if (action === "research-preferences") {
    if (typeof input.reusePersonal !== "boolean")
      throw new HttpError(400, "Choose a personal evidence preference.");
    const id = await digest({ subject, kind: "research-preferences" });
    const payload = JSON.stringify({
      reusePersonal: input.reusePersonal,
      aggregate: false,
      updatedAt: now,
    });
    await db
      .prepare(
        "INSERT INTO x1_records (id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) SELECT ?,?,'research-preferences','Research privacy',?,1,0,?,?,? WHERE (SELECT count(*) FROM x1_records WHERE subject=? AND archived=0)<100 OR EXISTS(SELECT 1 FROM x1_records WHERE id=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=x1_records.version+1,updated_at=excluded.updated_at",
      )
      .bind(id, subject, payload, crypto.randomUUID(), now, now, subject, id)
      .run();
    const saved = await db
      .prepare("SELECT id FROM x1_records WHERE id=? AND subject=?")
      .bind(id, subject)
      .first();
    if (!saved)
      throw new HttpError(429, "Active private record limit reached.");
    return { saved: true };
  }
  if (action === "save-scan-draft") {
    const definition = researchDefinition(
        input.definition as Record<string, unknown>,
      ),
      key = retryKey(input.requestId),
      id = input.draftId ? text(input.draftId) : key;
    const before = await db
      .prepare("SELECT * FROM x1_records WHERE id=?")
      .bind(id)
      .first<RawRecord>();
    const signature = await digest(definition);
    if (before) {
      if (
        before.subject !== subject ||
        before.kind !== "scan-draft" ||
        before.archived
      )
        throw new HttpError(404, "Draft not found.");
      const previous = JSON.parse(before.payload);
      if (previous.lastRequest === key) {
        if (previous.signature !== signature)
          throw new HttpError(
            409,
            "Retry ID used for different draft content.",
          );
        return { id, version: before.version, replayed: true };
      }
      if (input.version !== before.version)
        throw new HttpError(
          409,
          "Draft changed in another tab. Your unsaved text is preserved; refresh before saving.",
        );
      if ((previous.versions?.length ?? 0) >= 50)
        throw new HttpError(
          429,
          "Draft reached 50 preserved versions. Duplicate it as a new draft.",
        );
      const payload = JSON.stringify({
        definition,
        signature,
        lastRequest: key,
        versions: [
          ...(previous.versions ?? []),
          { version: before.version + 1, savedAt: now, definition },
        ],
      });
      const result = await db
        .prepare(
          "UPDATE x1_records SET name=?,payload=?,version=version+1,last_write=?,updated_at=? WHERE id=? AND subject=? AND version=?",
        )
        .bind(definition.name, payload, key, now, id, subject, before.version)
        .run();
      if (!result.meta.changes)
        throw new HttpError(
          409,
          "Draft changed concurrently; no overwrite occurred.",
        );
      return { id, version: before.version + 1 };
    }
    const payload = JSON.stringify({
      definition,
      signature,
      lastRequest: key,
      versions: [{ version: 1, savedAt: now, definition }],
    });
    await db
      .prepare(
        "INSERT OR IGNORE INTO x1_records (id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) SELECT ?,?,'scan-draft',?,?,1,0,?,?,? WHERE (SELECT count(*) FROM x1_records WHERE subject=? AND archived=0)<100",
      )
      .bind(id, subject, definition.name, payload, key, now, now, subject)
      .run();
    const saved = await db
      .prepare("SELECT * FROM x1_records WHERE id=?")
      .bind(id)
      .first<RawRecord>();
    if (!saved)
      throw new HttpError(429, "Active private record limit reached.");
    if (
      saved.subject !== subject ||
      saved.kind !== "scan-draft" ||
      JSON.parse(saved.payload).signature !== signature
    )
      throw new HttpError(409, "Draft ID already used for different content.");
    return { id, version: 1 };
  }
  if (action === "preflight-scan") {
    const definition = researchDefinition(input);
    const minimumBars = requiredScanBars(compileFormula(definition.formula).ast);
    const source = await scanSource(
      subject,
      definition,
      input.customCsv,
      minimumBars,
      traceId,
    );
    const preflight = preflightResearch(
      definition,
      source.datasets,
      source.asOf,
      source.excluded,
      minimumBars,
    );
    const projection = await projectResearchSnapshot(
      {
        sourceLineage: source.lineage ?? [],
        results: preflight.results,
        preflight,
      },
      false,
    );
    return {
      preflight: {
        ...preflight,
        ...(projection.payload.preflight as Record<string, unknown>),
        results: projection.payload.results,
      },
      pointInTime: source.pointInTime,
      source: source.source,
      sourceExclusions: source.excluded,
      redaction: projection.redaction,
    };
  }
  if (action === "create-list" || action === "create-portfolio") {
    const key = retryKey(input.requestId),
      id = key,
      kind = action === "create-list" ? "watchlist" : "portfolio",
      name = text(input.name),
      payload =
        kind === "watchlist" ? { items: [] } : { currency: input.currency };
    if (kind === "portfolio" && !CURRENCIES.includes(String(input.currency)))
      throw new HttpError(400, "Unsupported base currency.");
    const before = await db
      .prepare("SELECT * FROM x1_records WHERE id=?")
      .bind(id)
      .first<RawRecord>();
    if (before) {
      if (
        before.subject !== subject ||
        before.kind !== kind ||
        before.name !== name ||
        before.payload !== JSON.stringify(payload)
      )
        throw new HttpError(
          409,
          "Request ID already used for different content.",
        );
      return { id: before.id };
    }
    await db
      .prepare(
        "INSERT OR IGNORE INTO x1_records (id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) SELECT ?,?,?,?,?,1,0,?,?,? WHERE (SELECT count(*) FROM x1_records WHERE subject=? AND archived=0)<100",
      )
      .bind(
        id,
        subject,
        kind,
        name,
        JSON.stringify(payload),
        key,
        now,
        now,
        subject,
      )
      .run();
    const saved = await db
      .prepare("SELECT * FROM x1_records WHERE id=?")
      .bind(id)
      .first<RawRecord>();
    if (!saved)
      throw new HttpError(429, "Keep at most 100 active lists and portfolios.");
    if (
      saved.subject !== subject ||
      saved.kind !== kind ||
      saved.name !== name ||
      saved.payload !== JSON.stringify(payload)
    )
      throw new HttpError(
        409,
        "Request ID already used for different content.",
      );
    return { id: saved.id };
  }
  if (action === "restore-record") {
    const r = await db
      .prepare(
        "SELECT * FROM x1_records WHERE subject=? AND id=? AND archived=1",
      )
      .bind(subject, text(input.id))
      .first<RawRecord>();
    if (!r) throw new HttpError(404, "Archived record not found.");
    if (input.version !== r.version)
      throw new HttpError(
        409,
        "This record changed. Refresh before restoring.",
      );
    const restored = await db
      .prepare(
        "UPDATE x1_records SET archived=0,version=version+1,last_write=?,updated_at=? WHERE id=? AND subject=? AND version=? AND archived=1 AND (SELECT count(*) FROM x1_records WHERE subject=? AND archived=0)<100",
      )
      .bind(crypto.randomUUID(), now, r.id, subject, r.version, subject)
      .run();
    if (!restored.meta.changes) {
      const current = await db
        .prepare(
          "SELECT version,archived FROM x1_records WHERE subject=? AND id=?",
        )
        .bind(subject, r.id)
        .first<{ version: number; archived: number }>();
      if (!current || current.version !== r.version || current.archived !== 1)
        throw new HttpError(
          409,
          "This record changed. Refresh before restoring.",
        );
      throw new HttpError(
        429,
        "Archive an active list or portfolio before restoring; keep at most 100 active records.",
      );
    }
    return { saved: true, id: r.id };
  }
  if (["rename", "list-items", "archive-record"].includes(String(action))) {
    const r = await owned(subject, input.id);
    if (input.version !== r.version)
      throw new HttpError(409, "This record changed. Refresh before saving.");
    const payload = JSON.parse(r.payload);
    let name = r.name;
    if (action === "rename") name = text(input.name);
    if (action === "list-items") {
      if (
        r.kind !== "watchlist" ||
        !Array.isArray(input.items) ||
        input.items.length > 80 ||
        input.items.some(
          (i) => typeof i !== "string" || !/^[A-Za-z0-9:._/!\-]{1,80}$/.test(i),
        ) ||
        new Set(input.items).size !== input.items.length
      )
        throw new HttpError(400, "Use up to 80 unique instrument IDs.");
      payload.items = input.items;
    }
    const result = await db
      .prepare(
        "UPDATE x1_records SET name=?,payload=?,archived=?,version=version+1,last_write=?,updated_at=? WHERE id=? AND subject=? AND version=? AND archived=0",
      )
      .bind(
        name,
        JSON.stringify(payload),
        action === "archive-record" ? 1 : 0,
        crypto.randomUUID(),
        now,
        r.id,
        subject,
        r.version,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "This record changed. Refresh and retry.");
    return { saved: true };
  }
  if (action === "correct-transaction" || action === "delete-transaction") {
    const record = await owned(subject, input.portfolioId);
    if (record.kind !== "portfolio") throw new HttpError(400, "Portfolio required.");
    const id = input.transactionId;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new HttpError(404, "Transaction unavailable.");
    const key = retryKey(input.requestId);
    let replacement: Transaction | null = null;
    if (action === "correct-transaction") {
      try { replacement = validateTransaction(input.transaction, now); }
      catch (err) { throw new HttpError(400, (err as Error).message); }
    }
    const hash = await digest({ portfolioId: record.id, id, replacement });
    const prior = () => db.prepare("SELECT ledger_id,digest FROM x1_ledger_corrections WHERE subject=? AND request_key=?")
      .bind(subject, key).first<{ ledger_id: string; digest: string }>();
    const previous = await prior();
    if (previous) {
      if (previous.digest !== hash) throw new HttpError(409, "Request ID belongs to another transaction change.");
      return { id: previous.ledger_id, replayed: true };
    }
    if (input.version !== record.version) throw new HttpError(409, "Portfolio changed. Refresh before editing.");
    const { results } = await db.prepare("SELECT id,payload FROM x1_effective_ledger WHERE subject=? AND portfolio_id=? LIMIT 2001")
      .bind(subject, record.id).all<{ id: string; payload: string }>();
    const current = results.find((row) => row.id === id);
    if (!current) throw new HttpError(404, "Transaction unavailable.");
    type Ordered = Transaction & { ledgerSequence?: number };
    const amended: Ordered | null = replacement ? { ...replacement,
      ledgerSequence: (JSON.parse(current.payload) as Ordered).ledgerSequence } : null;
    const next = results.flatMap((row) => row.id !== id ? [JSON.parse(row.payload) as Ordered] : amended ? [amended] : []);
    next.sort((a, b) => a.date.localeCompare(b.date) || (a.ledgerSequence ?? 0) - (b.ledgerSequence ?? 0));
    try { summarizePortfolio(next, JSON.parse(record.payload).currency); }
    catch (err) { throw new HttpError(400, (err as Error).message); }
    const op = crypto.randomUUID();
    const [, inserted] = await db.batch([
      db.prepare(`UPDATE x1_records SET version=version+1,last_write=?,updated_at=?
        WHERE id=? AND subject=? AND version=? AND archived=0`).bind(op, now, record.id, subject, record.version),
      db.prepare(`INSERT INTO x1_ledger_corrections(subject,ledger_id,revision,request_key,digest,payload,created_at)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM x1_records WHERE id=? AND subject=? AND last_write=?)`)
        .bind(subject, id, record.version + 1, key, hash, amended ? JSON.stringify(amended) : null, now, record.id, subject, op),
    ]);
    if (!inserted.meta.changes && (await prior())?.digest !== hash)
      throw new HttpError(409, "Portfolio changed. Refresh before editing.");
    return { id };
  }
  if (action === "transaction") {
    const r = await owned(subject, input.portfolioId);
    if (r.kind !== "portfolio") throw new HttpError(400, "Portfolio required.");
    const key = retryKey(input.requestId);
    let t: Transaction;
    try {
      t = validateTransaction(input.transaction, now);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const hash = await digest({ portfolioId: r.id, transaction: t });
    const prior = await db
      .prepare(
        "SELECT digest,id FROM x1_ledger WHERE subject=? AND request_key=?",
      )
      .bind(subject, key)
      .first<{ digest: string; id: string }>();
    if (prior) {
      if (prior.digest !== hash)
        throw new HttpError(409, "Retry ID belongs to another transaction.");
      return { id: prior.id, replayed: true };
    }
    if (input.version !== r.version)
      throw new HttpError(
        409,
        "Portfolio changed. Refresh before adding a transaction.",
      );
    const rows = await db
      .prepare(
        `SELECT payload FROM x1_effective_ledger WHERE subject=? AND portfolio_id=?
           ORDER BY json_extract(payload,'$.date'),CAST(json_extract(payload,'$.ledgerSequence') AS INTEGER),id LIMIT 2001`,
      )
      .bind(subject, r.id)
      .all<{ payload: string }>();
    if (rows.results.length >= 2000)
      throw new HttpError(429, "Portfolio ledger limit reached.");
    try {
      summarizePortfolio(
        [...rows.results.map((x) => JSON.parse(x.payload)), t],
        JSON.parse(r.payload).currency,
      );
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const id = crypto.randomUUID(),
      op = crypto.randomUUID();
    const result = await db.batch([
      db
        .prepare(
          "UPDATE x1_records SET version=version+1,last_write=?,updated_at=? WHERE id=? AND subject=? AND version=? AND archived=0",
        )
        .bind(op, now, r.id, subject, r.version),
      db
        .prepare(
          "INSERT INTO x1_ledger (id,subject,portfolio_id,request_key,payload,digest,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM x1_records WHERE id=? AND subject=? AND last_write=?)",
        )
        .bind(
          id,
          subject,
          r.id,
          key,
          JSON.stringify({ ...t, ledgerSequence: r.version }),
          hash,
          now,
          r.id,
          subject,
          op,
        ),
    ]);
    if (!result[1].meta.changes) {
      const replay = await db
        .prepare(
          "SELECT id,digest FROM x1_ledger WHERE subject=? AND request_key=?",
        )
        .bind(subject, key)
        .first<{ id: string; digest: string }>();
      if (replay?.digest === hash) return { id: replay.id, replayed: true };
      throw new HttpError(
        409,
        "Portfolio changed. No transaction saved; refresh and retry.",
      );
    }
    return { id };
  }
  if (action === "parse-discover") {
    // Quota-free deterministic natural-language Blueprint parser
    return { blueprint: parseDiscoverQuery(String(input.query ?? "")) };
  }
  if (action === "save-pattern") {
    const key = retryKey(input.requestId);
    const patternName = text(input.name, 60);
    const rawPts = Array.isArray(input.strokePoints)
      ? (input.strokePoints as DrawPoint[])
      : [];
    let validPts: DrawPoint[];
    try {
      validPts = validateStrokePoints(rawPts).slice(0, 240);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    const payload = JSON.stringify({
      points: validPts.map((p) => ({
        x: Math.round(p.x * 10000) / 10000,
        y: Math.round(p.y * 10000) / 10000,
      })),
      windowBars: Math.max(8, Math.min(60, Math.round(Number(input.windowBars ?? 20)))),
      minPatternFit: Math.max(35, Math.min(95, Math.round(Number(input.minPatternFit ?? 75)))),
    });
    const before = await db
      .prepare("SELECT * FROM x1_records WHERE id=?")
      .bind(key)
      .first<RawRecord>();
    if (before) {
      if (
        before.subject !== subject ||
        before.kind !== "pattern-template" ||
        before.name !== patternName ||
        before.payload !== payload
      ) {
        throw new HttpError(409, "Request ID already used for different pattern.");
      }
      return { id: before.id, replayed: true };
    }
    await db
      .prepare(
        "INSERT OR IGNORE INTO x1_records (id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) SELECT ?,?,'pattern-template',?,?,1,0,?,?,? WHERE (SELECT count(*) FROM x1_records WHERE subject=? AND archived=0)<100",
      )
      .bind(key, subject, patternName, payload, key, now, now, subject)
      .run();
    const saved = await db
      .prepare("SELECT * FROM x1_records WHERE id=?")
      .bind(key)
      .first<RawRecord>();
    if (!saved) {
      throw new HttpError(429, "Active private record limit reached.");
    }
    if (saved.subject !== subject || saved.kind !== "pattern-template") {
      throw new HttpError(409, "Pattern ID already used.");
    }
    return { id: saved.id };
  }
  if (action === "run-draw-scan") {
    const requestId = retryKey(input.requestId);
    const rawName = typeof input.name === "string" ? input.name.trim() : "";
    if ([...rawName].length === 0) {
      throw new HttpError(400, "Enter a Soul name.");
    }
    if ([...rawName].length < 3 || [...rawName].length > 100) {
      throw new HttpError(400, "Scan name requires 3–100 characters.");
    }
    const name = rawName;
    const description =
      typeof input.description === "string" && input.description.trim().length >= 10
        ? input.description.trim().slice(0, 2000)
        : "Interactive Draw shape search using Z-normalized Pearson + bounded Sakoe-Chiba DTW.";
    const strokePoints = Array.isArray(input.strokePoints)
      ? (input.strokePoints as DrawPoint[])
      : [];
    if (strokePoints.length < 2 || strokePoints.length > 400) {
      throw new HttpError(
        400,
        "Draw a shape with 2–400 points or select one of the pattern templates.",
      );
    }
    try {
      validateStrokePoints(strokePoints);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    const windowBars = Math.max(
      8,
      Math.min(60, Math.round(Number(input.windowBars ?? 20))),
    );
    const minPatternFit = Math.max(
      35,
      Math.min(95, Math.round(Number(input.minPatternFit ?? 75))),
    );
    const horizonBars = Math.max(
      1,
      Math.min(60, Math.round(Number(input.horizonBars ?? 10))),
    );
    const universe =
      input.universe === "CONNECTED_MARKETS" ? "CONNECTED_MARKETS" : "ECB_DAILY";
    const interval = ["30m", "1h", "1d", "1wk", "1mo"].includes(
      String(input.interval ?? "1d"),
    )
      ? (String(input.interval ?? "1d") as ResearchDefinition["interval"])
      : "1d";

    const definition: ResearchDefinition = {
      name,
      description,
      formula: "close > 0",
      mode: "ADVANCED",
      universe,
      ...(isScanUniversePreset(input.universePreset) ? { universePreset: input.universePreset } : {}),
      ...(input.universePreset === "MY_WATCHLIST" && typeof input.watchlistId === "string"
        ? { watchlistId: input.watchlistId } : {}),
      interval,
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: {
        family: "POSITIVE_RETURN",
        horizon: horizonBars,
        threshold: 0,
        target: 5,
        stop: 3,
        costBps: 0,
      },
      instrumentIds: Array.isArray(input.instrumentIds)
        ? input.instrumentIds.filter((x): x is string => typeof x === "string").slice(0, 1000)
        : [],
    };
    const signature = await digest({
      kind: "draw",
      definition,
      strokePoints,
      windowBars,
      minPatternFit,
      ...(definition.universePreset === "CUSTOM_CSV" && typeof input.customCsv === "string"
        ? { csvDigest: await digest(input.customCsv) } : {}),
    });
    const prior = await replayOwnedScan(db, subject, requestId, signature);
    if (prior) return prior;
    const reservation = await reserveScanSlot(db, subject, "ADVANCED", requestId);
    if (reservation.reusedCompletedScanId) {
      const completed = await replayOwnedScan(db, subject, requestId, signature);
      if (completed) return completed;
      throw new HttpError(503, "The prior scan could not be confirmed.");
    }
    try {
      const data = await scanSource(subject, definition, input.customCsv, windowBars, traceId);
      if (!data.datasets.length) {
        await releaseScanReservation(db, reservation.id, subject, "FAILED");
        throw new HttpError(
          503,
          "Eligible historical data is unavailable for this universe/timeframe. No quota was consumed.",
        );
      }
      const asOf = new Date().toISOString();
      const drawReport = matchDrawnPattern(strokePoints, data.datasets, {
        windowBars,
        minPatternFit,
        asOf,
      });
      if (drawReport.evaluated === 0) {
        await releaseScanReservation(db, reservation.id, subject, "FAILED");
        throw new HttpError(
          422,
          `No instrument had at least ${windowBars} eligible closed bars. Reduce window length or provide a longer CSV history. No quota consumed.`,
        );
      }
      const soulGenome = runSoulGenomeEvidence(data.datasets, {
        windowBars,
        horizonBars,
        asOf,
        querySeries: drawReport.matches[0]?.normalizedQuery,
      });
      const datasetById = new Map(data.datasets.map((d) => [d.instrumentId, d]));
      const results = {
        version: "x1-rule-1" as const,
        asOf,
        formula: `drawPattern(window=${windowBars}, minFit=${minPatternFit})`,
        total: data.datasets.length,
        eligible: drawReport.evaluated,
        matches: drawReport.matches.length,
        failed: drawReport.evaluated - drawReport.matches.length,
        unknown: drawReport.insufficientBarsCount,
        results: [
          ...drawReport.matches.map((m) => {
            const ds = datasetById.get(m.instrumentId);
            return {
              instrumentId: m.instrumentId,
              status: "PASS" as const,
              reasons: [m.explanation],
              latestEventAt: m.windowEndAt,
              source: m.source,
              patternFit: m.patternFit,
              ...(ds ? { metrics: computeScanMetrics(ds.observations) } : {}),
            };
          }),
          ...drawReport.excluded.map((e) => ({
            instrumentId: e.instrumentId,
            status: "UNKNOWN" as const,
            reasons: [e.reason],
            latestEventAt: null,
            source: data.source,
          })),
        ],
      };
      const payload = {
        scanTier: "ADVANCED",
        origin: "DRAW",
        research: definition,
        description,
        drawReport,
        soulGenome,
        requestDigest: signature,
        rule: { version: "x1-rule-1", formula: results.formula },
        results,
        datasets: data.datasets,
        sourceSnapshot: data.asOf,
        ...(traceId ? { traceId } : {}),
        sourceLineage: data.lineage ?? [],
        source: data.source,
        knownAtPolicy:
          "Interactive Draw similarity evaluated strictly on closed historical bars prior to as-of cutoff. Pattern Fit is descriptive geometry, not a forward probability.",
        billing: { charged: 0 },
      };
      const id = crypto.randomUUID();
      await persistReservedScan(db, {
        reservationId: reservation.id,
        subject, id, requestKey: requestId, mode: "ADVANCED", name,
        payload: JSON.stringify(payload),
        digest: await digest(payload),
        completedAt: asOf,
      });
      return {
        id,
        results,
        drawReport,
        soulGenome,
        scanQuota: await getScanQuotaSummary(db, subject),
      };
    } catch (err) {
      await releaseScanReservation(db, reservation.id, subject, "FAILED");
      throw err;
    }
  }
  if (action === "run-scan") {
    const definition = researchDefinition(input);
    const requestId = retryKey(input.requestId),
      mode = definition.mode,
      name = definition.name,
      formula = definition.formula;
    const scanTier: ScanQuotaTier =
      input.scanTier === "CLASSIC" ||
      (input.scanTier !== "ADVANCED" && mode === "SIMPLE")
        ? "CLASSIC"
        : "ADVANCED";
    let rule;
    try {
      rule = compileFormula(formula);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const minimumBars = requiredScanBars(rule.ast);
    const signature = await digest(
      definition.universePreset === "CUSTOM_CSV" && typeof input.customCsv === "string"
        ? { definition, csvDigest: await digest(input.customCsv) }
        : definition,
    );
    const prior = await replayOwnedScan(db, subject, requestId, signature);
    if (prior) return prior;
    const reservation = await reserveScanSlot(db, subject, scanTier, requestId);
    if (reservation.reusedCompletedScanId) {
      const completed = await replayOwnedScan(db, subject, requestId, signature);
      if (completed) return completed;
      throw new HttpError(503, "The prior scan could not be confirmed.");
    }
    try {
      const data = await scanSource(
        subject,
        definition,
        input.customCsv,
        minimumBars,
        traceId,
      );
      const datasets = data.datasets;
      if (!datasets.length) {
        throw new HttpError(
          503,
          data.excluded[0]?.reason ??
            "Eligible historical data is unavailable. No run or credit charge was created.",
        );
      }
      await rate(subject + ":x1scans", 60, 86400000);
      const asOf = new Date().toISOString();
      const preflight = preflightResearch(
        definition,
        datasets,
        asOf,
        data.excluded,
        minimumBars,
      );
      if (preflight.blocked) {
        throw new HttpError(
          422,
          preflight.reason || "Preflight blocked this scan.",
        );
      }
      const results = preflight.results;
      const replay =
        datasets.length === 1
          ? replayResearch(definition, datasets[0], asOf, {
              subject,
              pointInTime: data.pointInTime,
              adjusted: (data as { adjusted?: boolean }).adjusted === true,
              storagePermitted: data.rights.storage,
            })
          : {
              status: "DATA UNAVAILABLE",
              cases: [],
              summary: null,
              reasons: [
                "Choose one licensed, point-in-time adjusted instrument for reproducible replay.",
              ],
            };
      const soulGenome =
        scanTier === "ADVANCED"
          ? runSoulGenomeEvidence(datasets, {
              windowBars: 15,
              horizonBars: definition.outcome.horizon,
              asOf,
            })
          : undefined;
      const payload = {
        scanTier,
        origin:
          typeof input.origin === "string" &&
          ["CLASSIC", "DISCOVER", "BUILD", "DRAW"].includes(input.origin)
            ? input.origin
            : scanTier === "CLASSIC"
              ? "CLASSIC"
              : "BUILD",
        research: definition,
        description: definition.description,
        preflight: { ...preflight, results: undefined },
        sourceExclusions: data.excluded,
        replay,
        ...(soulGenome ? { soulGenome } : {}),
        backtest:
          datasets.length === 1
            ? backtestResearch(definition, datasets[0], asOf, {
                pointInTime: data.pointInTime,
                adjusted: (data as { adjusted?: boolean }).adjusted === true,
                storagePermitted: data.rights.storage,
              })
            : {
                status: "DATA UNAVAILABLE",
                summary: null,
                curve: [],
                trades: [],
                reasons: [
                  "Select one eligible instrument for a bounded, reproducible research backtest.",
                ],
              },
        requestDigest: signature,
        rule,
        results,
        datasets,
        sourceSnapshot: data.asOf,
        ...(traceId ? { traceId } : {}),
        sourceLineage: data.lineage ?? [],
        source: data.source,
        knownAtPolicy: data.pointInTime
          ? "Provider-certified point-in-time lineage retained; replay additionally requires adjusted history and storage rights."
          : "Historical publication instants are not certified. Known-at is conservatively the retrieval time; this is a current data filter, not a point-in-time historical backtest.",
        billing: { charged: 0 },
      };
      const id = crypto.randomUUID();
      await persistReservedScan(db, {
        reservationId: reservation.id,
        subject, id, requestKey: requestId, mode, name,
        payload: JSON.stringify(payload),
        digest: await digest(payload),
        completedAt: asOf,
      });
      const projection = await projectResearchSnapshot(payload, false);
      return {
        id,
        results: projection.payload.results,
        redaction: projection.redaction,
        ...(soulGenome ? { soulGenome } : {}),
        scanQuota: await getScanQuotaSummary(db, subject),
      };
    } catch (err) {
      await releaseScanReservation(db, reservation.id, subject, "FAILED");
      throw err;
    }
  }
  if (action === "scan-review") {
    const scanId = text(input.scanId),
      kind = String(input.kind),
      note = text(input.note, 1000);
    if (
      !["RETIRED", "INVALIDATED", "REVIEWED_FAILURE", "RESTORED"].includes(kind)
    )
      throw new HttpError(400, "Choose a supported review state.");
    const scan = await db
      .prepare("SELECT id FROM x1_scans WHERE subject=? AND id=?")
      .bind(subject, scanId)
      .first();
    if (!scan) throw new HttpError(404, "Scan not found.");
    const id =
      input.requestId === undefined
        ? crypto.randomUUID()
        : retryKey(input.requestId);
    await db
      .prepare(
        "INSERT OR IGNORE INTO x1_scan_events (id,subject,scan_id,kind,note,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(id, subject, scanId, kind, note, now)
      .run();
    const saved = await db
      .prepare(
        "SELECT subject,scan_id,kind,note FROM x1_scan_events WHERE id=?",
      )
      .bind(id)
      .first<{
        subject: string;
        scan_id: string;
        kind: string;
        note: string;
      }>();
    if (
      !saved ||
      saved.subject !== subject ||
      saved.scan_id !== scanId ||
      saved.kind !== kind ||
      saved.note !== note
    )
      throw new HttpError(
        409,
        "Review retry ID already used for different content.",
      );
    return { saved: true };
  }
  throw new HttpError(400, "Unsupported workspace action.");
}
