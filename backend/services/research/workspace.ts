import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { digest } from "../../../database/queries/notebook-repository";
import {
  CURRENCIES,
  validateTransaction,
  summarizePortfolio,
  type Transaction,
} from "../../engines/portfolio";
import { compileFormula, evaluateScan } from "../../engines/scan";
import { researchUniverse } from "../market-data/data-service";
import { backtestResearch } from "../../engines/backtest";
import {
  projectResearchSnapshot,
  snapshotDisplayRights,
  type DisplayRightsCache,
} from "./scan-projection";
import {
  validateResearch,
  preflightResearch,
  assessEvidence,
  replayResearch,
  type ResearchDefinition,
  type EvidenceCase,
} from "./research";
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
  const [records, archived, ledger, scans, events] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM x1_records WHERE subject=? AND archived=0 ORDER BY created_at,id LIMIT 101",
      )
      .bind(subject)
      .all<RawRecord>(),
    db
      .prepare(
        "SELECT * FROM x1_records WHERE subject=? AND archived=1 ORDER BY updated_at DESC,id DESC LIMIT ?",
      )
      .bind(subject, archivedLimit + 1)
      .all<RawRecord>(),
    db
      .prepare(
        "SELECT id,portfolio_id,payload,created_at FROM x1_ledger WHERE subject=? ORDER BY CAST(json_extract(payload,'$.ledgerSequence') AS INTEGER),id LIMIT 2001",
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
      allowance: "No paid credits are active; bounded free research only.",
    },
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
async function scanSource(subject: string, definition: ResearchDefinition) {
  const data = await researchUniverse(subject, {
    provider: definition.universe === "ECB_DAILY" ? "ECB" : "CONNECTED_MARKETS",
    instrumentIds: definition.instrumentIds,
    interval: definition.interval,
  });
  const datasets =
    definition.universe === "CONNECTED_MARKETS"
      ? data.datasets.filter((d) => !d.instrumentId.startsWith("ECB:"))
      : data.datasets;
  return { ...data, datasets };
}
export async function mutateWorkspace(
  subject: string,
  input: Record<string, unknown>,
) {
  const db = database(),
    action = input.action,
    now = new Date().toISOString();
  await rate(subject + ":x1write", 120, 60000);
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
    const definition = researchDefinition(input),
      source = await scanSource(subject, definition);
    const preflight = preflightResearch(
      definition,
      source.datasets,
      source.asOf,
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
        "SELECT payload FROM x1_ledger WHERE subject=? AND portfolio_id=? ORDER BY CAST(json_extract(payload,'$.ledgerSequence') AS INTEGER),id LIMIT 2001",
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
  if (action === "run-scan") {
    const definition = researchDefinition(input);
    const requestId = retryKey(input.requestId),
      mode = definition.mode,
      name = definition.name,
      formula = definition.formula;
    let rule;
    try {
      rule = compileFormula(formula);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const signature = await digest(definition);
    const prior = await db
      .prepare(
        "SELECT id,payload FROM x1_scans WHERE subject=? AND request_key=?",
      )
      .bind(subject, requestId)
      .first<{ id: string; payload: string }>();
    if (prior) {
      if (JSON.parse(prior.payload).requestDigest !== signature)
        throw new HttpError(
          409,
          "Scan retry ID already used for different inputs.",
        );
      return { id: prior.id, replayed: true };
    }
    const data = await scanSource(subject, definition);
    const datasets = data.datasets;
    if (!datasets.length)
      throw new HttpError(
        503,
        "Eligible historical data is unavailable. No run or credit charge was created.",
      );
    await rate(subject + ":x1scans", 30, 86400000);
    const asOf = new Date().toISOString(),
      results = evaluateScan(rule, datasets, asOf);
    const preflight = preflightResearch(definition, datasets, asOf);
    if (preflight.blocked)
      throw new HttpError(
        422,
        preflight.reason || "Preflight blocked this scan.",
      );
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
    const payload = {
      research: definition,
      description: definition.description,
      preflight: { ...preflight, results: undefined },
      replay,
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
      sourceLineage: data.lineage ?? [],
      source: data.source,
      knownAtPolicy: data.pointInTime
        ? "Provider-certified point-in-time lineage retained; replay additionally requires adjusted history and storage rights."
        : "Historical publication instants are not certified. Known-at is conservatively the retrieval time; this is a current data filter, not a point-in-time historical backtest.",
      billing: { charged: 0 },
    };
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT OR IGNORE INTO x1_scans (id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        subject,
        requestId,
        mode,
        name,
        JSON.stringify(payload),
        await digest(payload),
        asOf,
      )
      .run();
    const saved = await db
      .prepare(
        "SELECT id,payload FROM x1_scans WHERE subject=? AND request_key=?",
      )
      .bind(subject, requestId)
      .first<{ id: string; payload: string }>();
    if (!saved)
      throw new HttpError(
        503,
        "Save unconfirmed. Retry with the same request ID.",
      );
    const stored = JSON.parse(saved.payload);
    if (stored.requestDigest !== signature)
      throw new HttpError(
        409,
        "Scan retry ID already used for different inputs.",
      );
    const projection = await projectResearchSnapshot(stored, false);
    return {
      id: saved.id,
      results: projection.payload.results,
      redaction: projection.redaction,
    };
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
