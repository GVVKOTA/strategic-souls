/** Read-time licence enforcement. Stored snapshots and their digests are never modified. */
import { currentDisplayRights } from "../market-data/data-service";
import type { ProviderConfig } from "../market-data/data-types";
import { EXPLICIT_SCOPE_VERSION, niftyUniverseRightsActive } from "../market-data/nifty-500";

type DisplayRights = {
  displayAllowed: boolean;
  derivedDisplayAllowed: boolean;
  rightsExpiresAt: string | null;
};
type Lineage = DisplayRights & { instrumentId: string; provider: string; configVersion?: number; attribution?: { label: string; url: string } };
type ResultRow = {
  instrumentId: string;
  status: string;
  reasons?: string[];
  latestEventAt?: string | null;
  source?: string;
  metrics?: Record<string, number | null>;
  patternFit?: number;
};
type Snapshot = {
  sourceLineage?: Lineage[];
  datasets?: { instrumentId: string; source?: string }[];
  results?: {
    version?: unknown;
    asOf?: unknown;
    formula?: unknown;
    total?: unknown;
    eligible?: unknown;
    matches?: unknown;
    failed?: unknown;
    unknown?: unknown;
    results?: ResultRow[];
  };
  [key: string]: unknown;
};
export type DisplayRightsCache = Map<string, Promise<DisplayRights>>;
const validGrant = (expiry: string | null | undefined) =>
  expiry === null ||
  (typeof expiry === "string" &&
    Number.isFinite(Date.parse(expiry)) &&
    Date.parse(expiry) > Date.now());
const legacyECB = (id: string, source: string | undefined) =>
  id.startsWith("ECB:") &&
  typeof source === "string" &&
  /^ECB(?:\b|\s|$)/.test(source);
export async function snapshotDisplayRights(
  payload: Snapshot,
  cache: DisplayRightsCache = new Map(),
) {
  const entries = new Map<string, Lineage>();
  for (const row of payload.sourceLineage ?? [])
    if (
      row &&
      typeof row.instrumentId === "string" &&
      typeof row.provider === "string"
    )
      entries.set(row.instrumentId, row);
  const sourceRows = [
    ...(payload.datasets ?? []),
    ...(payload.results?.results ?? []),
  ];
  for (const row of sourceRows)
    if (!(payload.runState && "status" in row && row.status === "UNKNOWN" && !entries.has(row.instrumentId)) && typeof row.instrumentId === "string" && !entries.has(row.instrumentId))
      entries.set(row.instrumentId, {
        instrumentId: row.instrumentId,
        provider: legacyECB(row.instrumentId, row.source)
          ? "ECB"
          : "UNVERIFIED",
        displayAllowed: legacyECB(row.instrumentId, row.source),
        derivedDisplayAllowed: legacyECB(row.instrumentId, row.source),
        rightsExpiresAt: null,
      });
  const rights = new Map<string, DisplayRights>();
  const configs = new Map<string, Promise<ProviderConfig[]>>();
  await Promise.all(
    [...entries].map(async ([id, creation]) => {
      const key = creation.provider + "|" + (creation.configVersion ?? "") + "|" + id;
      if (!cache.has(key))
        cache.set(
          key,
          currentDisplayRights(id, creation.provider, configs, creation.configVersion).catch(() => ({
            displayAllowed: false,
            derivedDisplayAllowed: false,
            rightsExpiresAt: null,
          })),
        );
      const current = await cache.get(key)!;
      const active =
        validGrant(creation.rightsExpiresAt) &&
        validGrant(current.rightsExpiresAt);
      rights.set(id, {
        displayAllowed:
          active &&
          creation.displayAllowed === true &&
          current.displayAllowed === true,
        derivedDisplayAllowed:
          active &&
          creation.derivedDisplayAllowed === true &&
          current.derivedDisplayAllowed === true,
        rightsExpiresAt: current.rightsExpiresAt,
      });
    }),
  );
  return rights;
}
/** The only snapshot serializer used by history, detail, export and mutation responses. */
function publicHistoryLabel(source: string) {
  return /Angel\s*One|SmartAPI|Configured Exchange Feed \(Private\)/i.test(source) ? "Private exchange history"
    : source === "TRUEDATA" || source === "EODHD" ? "Licensed exchange history" : source;
}
function redactLineage(lineage: Lineage[]) {
  return lineage.map((row) => ({ ...row, provider: publicHistoryLabel(row.provider) }));
}
export async function projectResearchSnapshot(
  payload: Snapshot,
  includeDatasets: boolean,
  cache: DisplayRightsCache = new Map(),
) {
  if (typeof payload.universeVersion === "string" && payload.universeVersion !== EXPLICIT_SCOPE_VERSION) {
    const key = "universe:" + payload.universeVersion;
    if (!cache.has(key)) cache.set(key, niftyUniverseRightsActive(payload.universeVersion).catch(() => false)
      .then((active) => ({ displayAllowed: active, derivedDisplayAllowed: active, rightsExpiresAt: null })));
    if (!(await cache.get(key))?.displayAllowed) {
      return {
        payload: { runState: payload.runState, completedAt: payload.completedAt, rule: payload.rule, origin: payload.origin,
          name: payload.name, results: { version: payload.results?.version, asOf: payload.results?.asOf, formula: payload.results?.formula,
            total: payload.results?.total, matches: null, eligible: 0, failed: null, unknown: null, results: [] as ResultRow[] } },
        redaction: { applied: true, rawInstrumentIds: [] as string[], derivedInstrumentIds: [] as string[],
          reason: "Constituent display rights have expired." },
        digestVerifiableFromResponse: false,
      };
    }
  }
  const rights = await snapshotDisplayRights(payload, cache);
  const rawHidden = [...rights]
      .filter(([, r]) => !r.displayAllowed)
      .map(([id]) => id),
    derivedHidden = [...rights]
      .filter(([, r]) => !r.derivedDisplayAllowed)
      .map(([id]) => id);
  if (
    rights.size === 0 &&
    (payload.results || payload.datasets || payload.replay || payload.backtest)
  ) {
    rawHidden.push("UNVERIFIED_SOURCE");
    derivedHidden.push("UNVERIFIED_SOURCE");
  }
  const restricted = rawHidden.length > 0 || derivedHidden.length > 0;
  if (!restricted) {
    const projected = { ...payload };
    const sourceRedacted = payload.sourceLineage?.some((row) => publicHistoryLabel(row.provider) !== row.provider) ?? false;
    if (sourceRedacted && payload.sourceLineage) projected.sourceLineage = redactLineage(payload.sourceLineage);

    if (!includeDatasets) delete projected.datasets;
    return {
      payload: projected,
      redaction: {
        applied: false,
        rawInstrumentIds: [] as string[],
        derivedInstrumentIds: [] as string[],
        reason: null as string | null,
      },
      digestVerifiableFromResponse: includeDatasets && !sourceRedacted,
    };
  }
  // Fail closed on unrecognized payload fields: do not spread future raw-price objects into a restricted response.
  const projected: Snapshot = {};
  for (const key of [
    "requestDigest",
    "scanTier",
    "origin",
    "runState",
    "universeVersion",
    "completedAt",
    "patternRecipe",
    "rule",
    "research",
    "description",
    "sourceSnapshot",
    "source",
    "knownAtPolicy",
    "billing",
  ])
    if (key in payload) projected[key] = payload[key];
  if (payload.coverage && typeof payload.coverage === "object") {
    const { matched, unmatched, ...safeCoverage } = payload.coverage as Record<string, unknown>;
    void matched; void unmatched;
    projected.coverage = safeCoverage;
  }
  projected.sourceLineage = (payload.sourceLineage ?? []).map((row) => {
    const metadata = row as Lineage & Record<string, unknown>;
    return {
      instrumentId: row.instrumentId,
      provider: publicHistoryLabel(row.provider),
      ...(row.attribution && { attribution: row.attribution }),
      eventAt: metadata.eventAt,
      retrievedAt: metadata.retrievedAt,
      adjustment: metadata.adjustment,
      configVersion: metadata.configVersion,
      ...(rights.get(row.instrumentId) ?? {
        displayAllowed: false,
        derivedDisplayAllowed: false,
        rightsExpiresAt: null,
      }),
    };
  });
  if (includeDatasets)
    projected.datasets = (payload.datasets ?? []).filter(
      (row) => rights.get(row.instrumentId)?.displayAllowed === true,
    );
  if (payload.results) {
    const rows = (payload.results.results ?? []).map((row) => {
      const r = rights.get(row.instrumentId),
        raw = r?.displayAllowed === true,
        derived = r?.derivedDisplayAllowed === true;
      if (payload.runState && !r && row.status === "UNKNOWN")
        return { instrumentId: row.instrumentId, status: "UNKNOWN", reasons: ["Completed history unavailable."],
          latestEventAt: null, source: "Unavailable" };
      return {
        instrumentId: row.instrumentId,
        status: derived ? row.status : "WITHHELD",
        reasons: raw
          ? (row.reasons ?? [])
          : [
              derived
                ? "Detailed observations are withheld by source licence; permitted derived status only."
                : "Calculation retained server-side; this source does not permit displaying its result.",
            ],
        latestEventAt: row.latestEventAt ?? null,
        source: row.source,
        ...(raw && derived && row.metrics ? { metrics: row.metrics } : {}),
        ...(derived && typeof row.patternFit === "number" ? { patternFit: row.patternFit } : {}),
      };
    });
    const allDerived = derivedHidden.length === 0;
    projected.results = {
      version: payload.results.version,
      asOf: payload.results.asOf,
      formula: payload.results.formula,
      total: payload.results.total,
      eligible: payload.results.eligible,
      matches: allDerived ? payload.results.matches : null,
      failed: allDerived ? payload.results.failed : null,
      unknown: allDerived ? payload.results.unknown : null,
      results: rows,
    };
  }
  const p = payload.preflight as Record<string, unknown> | undefined;
  if (p)
    projected.preflight = {
      version: p.version,
      asOf: p.asOf,
      eligible: p.eligible,
      total: p.total,
      unknown: p.unknown,
      requiredFields: p.requiredFields,
      blocked: p.blocked,
      reason: p.reason,
      quota: p.quota,
      sourceMode: p.sourceMode,
      lookback: p.lookback,
      exclusions: rawHidden.length
        ? [
            {
              id: "SOURCE_LICENCE",
              reasons: ["Detailed input diagnostics are withheld by licence."],
            },
          ]
        : p.exclusions,
    };
  if (derivedHidden.length) {
    projected.replay = {
      status: "DATA WITHHELD",
      summary: null,
      cases: [],
      reasons: [
        "Historical derived outputs are not display-licensed. Internal permitted evidence is retained without exposing observations.",
      ],
    };
    projected.backtest = {
      status: "DATA WITHHELD",
      summary: null,
      curve: [],
      trades: [],
      reasons: [
        "Backtest outputs are not display-licensed; no model values are serialized.",
      ],
    };
  } else {
    const pick = (value: unknown, keys: string[]) =>
      value && typeof value === "object"
        ? Object.fromEntries(
            keys
              .filter((key) => key in value)
              .map((key) => [key, (value as Record<string, unknown>)[key]]),
          )
        : null;
    const derivedReasons = [
      "Explicitly permitted derived output only. Raw inputs, price diagnostics and fill prices are withheld by source licence.",
    ];
    const replay = payload.replay as
      | {
          status?: string;
          reasons?: string[];
          summary?: unknown;
          cases?: Record<string, unknown>[];
        }
      | undefined;
    if (replay)
      projected.replay = {
        status: replay.status,
        reasons: derivedReasons,
        summary: pick(replay.summary, [
          "n",
          "median",
          "minimum",
          "maximum",
          "bins",
        ]),
        cases:
          replay.cases?.map((row) => ({
            id: row.id,
            instrumentId: row.instrumentId,
            signalAt: row.signalAt,
            endAt: row.endAt,
            label: row.label,
            returnPct: row.returnPct,
          })) ?? [],
      };
    const backtest = payload.backtest as
      | {
          status?: string;
          reasons?: string[];
          summary?: unknown;
          curve?: Record<string, unknown>[];
          trades?: Record<string, unknown>[];
        }
      | undefined;
    if (backtest)
      projected.backtest = {
        status: backtest.status,
        reasons: derivedReasons,
        summary: pick(backtest.summary, [
          "trades",
          "totalReturnPct",
          "maxDrawdownPct",
          "hitRatio",
          "ambiguous",
          "unresolved",
          "turnover",
          "benchmarkReturnPct",
          "slippageBps",
          "costBps",
        ]),
        curve:
          backtest.curve?.map((row) => ({
            at: row.at,
            equity: row.equity,
            drawdown: row.drawdown,
          })) ?? [],
        trades:
          backtest.trades?.map((row) => ({
            signalAt: row.signalAt,
            entryAt: row.entryAt,
            exitAt: row.exitAt,
            label: row.label,
            returnPct: row.returnPct,
          })) ?? [],
      };
  }
  return {
    payload: projected,
    redaction: {
      applied: true,
      rawInstrumentIds: rawHidden,
      derivedInstrumentIds: derivedHidden,
      reason:
        "Read-time source licence restrictions; the digest covers the unchanged full server-stored snapshot, not this redacted projection.",
    },
    digestVerifiableFromResponse: false,
  };
}
