/** Deterministic research contracts. Pure functions never fetch or fabricate evidence. */
import {
  compileFormula,
  compileRules,
  evaluateScan,
  renderFormula,
  toSimpleRules,
  type Ast,
  type CanonicalRule,
  type ScanDataset,
  type SimpleRule,
} from "../../engines/scan";

export const RESEARCH_VERSION = "x2-research-1";
export const SCAN_UNIVERSE_PRESETS = [
  "MARKET",
  "MY_WATCHLIST",
  "INDIAN_EQUITIES",
  "INDICES",
  "INDIVIDUAL",
  "MCX_FUTURES",
  "ECB_DAILY",
  "CUSTOM_CSV",
] as const;
export type ScanUniversePreset = (typeof SCAN_UNIVERSE_PRESETS)[number];
export const SCAN_REQUEST_VERSION = 2;
export const DEFAULT_SCAN_UNIVERSE_PRESET: ScanUniversePreset = "MARKET";
export const SCAN_UNIVERSE_LABEL: Record<ScanUniversePreset, string> = {
  MARKET: "Nifty 500 equities",
  MY_WATCHLIST: "Watchlist",
  INDIAN_EQUITIES: "Mapped NSE / BSE equities",
  INDICES: "Mapped exchange indices",
  INDIVIDUAL: "Single instrument",
  MCX_FUTURES: "MCX Futures",
  ECB_DAILY: "ECB Reference FX",
  CUSTOM_CSV: "Private Daily CSV",
};

export function scanUniverseForPreset(preset: ScanUniversePreset | undefined) {
  return preset === "ECB_DAILY" ? "ECB_DAILY" as const : "CONNECTED_MARKETS" as const;
}

export function isScanUniversePreset(value: unknown): value is ScanUniversePreset {
  return SCAN_UNIVERSE_PRESETS.some((preset) => preset === value);
}

export function validateScanRequestScope(input: Record<string, unknown>) {
  // Legacy clients and previously persisted definitions predate this contract.
  if (input.scanRequestVersion === undefined) return;
  if (input.scanRequestVersion !== SCAN_REQUEST_VERSION)
    throw new Error("Unsupported scan request version.");
  if (!isScanUniversePreset(input.universePreset))
    throw new Error("Choose a scan source before continuing.");
  if (input.universe !== scanUniverseForPreset(input.universePreset))
    throw new Error("The selected source and requested dataset do not agree.");
  if (input.interval !== undefined && !["30m", "1h", "1d", "1wk", "1mo"].includes(String(input.interval)))
    throw new Error("Choose a supported scan timeframe.");
  if (input.universePreset !== "CUSTOM_CSV" && input.customCsv !== undefined)
    throw new Error("Custom bar uploads are not enabled for this scan source.");
  if (input.watchlistId !== undefined && (input.universePreset !== "MY_WATCHLIST" ||
    typeof input.watchlistId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(input.watchlistId)))
    throw new Error("Choose an active watchlist.");
}

export function matchesScanMarketPreset(
  preset: ScanUniversePreset | undefined,
  exchange: string,
  assetClass: string,
  expiry?: string | null,
  now = Date.now(),
) {
  if (preset === "INDICES") return assetClass === "INDEX";
  if (preset === "MARKET") {
    if ((exchange === "NSE" || exchange === "BSE") && (assetClass === "EQUITY" || assetClass === "INDEX")) {
      return true;
    }
    if (exchange === "MCX" && assetClass === "FUTURE") {
      return !!expiry && Date.parse(`${expiry}T23:59:59+05:30`) >= now;
    }
    return false;
  }
  if (preset === "INDIAN_EQUITIES")
    return (exchange === "NSE" || exchange === "BSE") && assetClass === "EQUITY";
  if (preset === "MCX_FUTURES")
    return exchange === "MCX" && assetClass === "FUTURE" &&
      !!expiry && Date.parse(`${expiry}T23:59:59+05:30`) >= now;
  return true;
}
export type OutcomeDefinition = {
  family: "POSITIVE_RETURN" | "FIRST_BARRIER";
  horizon: number;
  threshold: number;
  target: number;
  stop: number;
  costBps: number;
};
export type ResearchDefinition = {
  name: string;
  description: string;
  formula: string;
  mode: "SIMPLE" | "ADVANCED";
  universe: "ECB_DAILY" | "CONNECTED_MARKETS";
  universePreset?: ScanUniversePreset;
  watchlistId?: string;
  interval: "30m" | "1h" | "1d" | "1wk" | "1mo";
  partialPolicy: "STRICT" | "ALLOW_UNKNOWN";
  outcome: OutcomeDefinition;
  instrumentIds: string[];
};
export type RuleTree =
  | { kind: "condition"; rule: SimpleRule }
  | { kind: "ALL" | "ANY"; children: RuleTree[] }
  | { kind: "NOT"; child: RuleTree };

export type BeginnerScanPreset = {
  id: string;
  label: string;
  goal: string;
  plainLanguage: string;
  formula: string;
  defaultName: string;
  defaultDescription: string;
  requires: string;
};

/** Guided Beginner presets that compile through the same canonical AST as Intermediate and Advanced. */
export const BEGINNER_SCAN_PRESETS: readonly BeginnerScanPreset[] = Object.freeze([
  {
    id: "oversold-rsi",
    label: "Oversold RSI (14)",
    goal: "Pullback / mean-reversion study",
    plainLanguage:
      "Matches instruments whose 14-session Wilder RSI is below 40. Missing history stays UNKNOWN.",
    formula: "rsi(close, 14) < 40",
    defaultName: "Oversold RSI pullback study",
    defaultDescription:
      "Evaluate instruments where 14-session Wilder RSI is below 40 using eligible daily close observations.",
    requires: "15+ daily closes (works keyless on ECB daily FX)",
  },
  {
    id: "above-sma20",
    label: "Trend above 20-day SMA",
    goal: "Trend strength study",
    plainLanguage:
      "Matches instruments closing above their 20-session simple moving average.",
    formula: "close > sma(close, 20)",
    defaultName: "Above 20-session SMA trend study",
    defaultDescription:
      "Test whether eligible instruments currently close above their 20-session simple moving average.",
    requires: "20+ daily closes (works keyless on ECB daily FX)",
  },
  {
    id: "ema-not-overbought",
    label: "EMA trend without stretched RSI",
    goal: "Balanced momentum filter",
    plainLanguage:
      "Matches instruments above their 20-session EMA while 14-session RSI is not above 70.",
    formula: "all(close > ema(close, 20), not(rsi(close, 14) > 70))",
    defaultName: "EMA trend with RSI guardrail",
    defaultDescription:
      "Filter for instruments closing above their 20-session EMA while excluding RSI(14) above 70.",
    requires: "20+ daily closes (works keyless on ECB daily FX)",
  },
  {
    id: "positive-macd",
    label: "Positive MACD (12, 26)",
    goal: "Momentum continuation study",
    plainLanguage:
      "Matches instruments where the 12/26 exponential moving average spread (MACD) is above zero.",
    formula: "macd(close, 12, 26) > 0",
    defaultName: "Positive MACD momentum study",
    defaultDescription:
      "Examine instruments whose 12/26 MACD line is above zero on eligible daily observations.",
    requires: "26+ daily closes (works keyless on ECB daily FX)",
  },
  {
    id: "sma20-crossover",
    label: "Fresh SMA(20) upward cross",
    goal: "Regime-shift event study",
    plainLanguage:
      "Matches instruments whose latest close crossed above the 20-session SMA from below.",
    formula: "crossesAbove(close, sma(close, 20))",
    defaultName: "SMA 20 upward crossover study",
    defaultDescription:
      "Detect instruments whose latest eligible close crossed above the 20-session simple moving average.",
    requires: "21+ daily closes (works keyless on ECB daily FX)",
  },
  {
    id: "overbought-rsi",
    label: "Stretched RSI (14) > 70",
    goal: "Overextension monitor",
    plainLanguage:
      "Matches instruments whose 14-session Wilder RSI exceeds 70 on eligible closes.",
    formula: "rsi(close, 14) > 70",
    defaultName: "Stretched RSI overextension study",
    defaultDescription:
      "Identify instruments where 14-session Wilder RSI is above 70 under eligible daily closes.",
    requires: "15+ daily closes (works keyless on ECB daily FX)",
  },
]);

export const RESEARCH_GLOSSARY: readonly { term: string; meaning: string }[] =
  Object.freeze([
    {
      term: "Wilder RSI (14)",
      meaning:
        "Relative Strength Index over 14 sessions measuring recent up-move vs down-move magnitude on a 0–100 scale. Not a guaranteed reversal signal.",
    },
    {
      term: "ATR (14)",
      meaning:
        "Average True Range over 14 sessions measuring price range volatility. Requires high, low, and close OHLC bars.",
    },
    {
      term: "OHLC",
      meaning:
        "Open, High, Low, Close prices for a session. Daily reference feeds like ECB supply only a single reference close, never synthetic OHLC.",
    },
    {
      term: "CAGR & XIRR",
      meaning:
        "CAGR computes annualized growth between two values over a fixed period; XIRR solves the annualized internal rate of return across irregular dated cash flows.",
    },
    {
      term: "Implied Volatility (IV) & BSM",
      meaning:
        "Black-Scholes-Merton theoretical pricing and implied volatility assume European exercise and constant parameters; they are educational models, not live exchange option quotes.",
    },
    {
      term: "Point-in-Time (PIT) Evidence",
      meaning:
        "Evaluates rules using only information genuinely known at the original observation date. Retrieval-only datasets cannot establish PIT backtest claims.",
    },
  ]);
const finite = (value: unknown, label: string, lo: number, hi: number) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < lo ||
    value > hi
  )
    throw new Error(`${label} must be between ${lo} and ${hi}.`);
  return value;
};
export function validateResearch(
  input: Record<string, unknown>,
): ResearchDefinition {
  const name = typeof input.name === "string" ? input.name.trim() : "",
    description =
      typeof input.description === "string" ? input.description.trim() : "";
  if ([...name].length === 0)
    throw new Error("Enter a Soul name.");
  if ([...name].length < 3 || [...name].length > 100)
    throw new Error("Scan name requires 3–100 characters.");
  if ([...description].length < 10 || [...description].length > 2000)
    throw new Error("Describe the hypothesis in 10–2,000 characters.");
  if (input.mode !== "SIMPLE" && input.mode !== "ADVANCED")
    throw new Error("Choose Simple or Advanced mode.");
  const formula = compileFormula(String(input.formula ?? "")).formula;
  const universe = input.universe ?? "ECB_DAILY",
    interval = input.interval ?? "1d",
    partialPolicy = input.partialPolicy ?? "STRICT";
  if (universe !== "ECB_DAILY" && universe !== "CONNECTED_MARKETS")
    throw new Error("Choose a supported universe.");
  const universePreset = input.universePreset;
  if (universePreset !== undefined && !isScanUniversePreset(universePreset))
    throw new Error("Choose a supported scan universe preset.");
  if (!["30m", "1h", "1d", "1wk", "1mo"].includes(String(interval)))
    throw new Error("Choose a supported timeframe.");
  if (partialPolicy !== "STRICT" && partialPolicy !== "ALLOW_UNKNOWN")
    throw new Error("Choose a partial-data policy.");
  const raw = (input.outcome ?? {}) as Record<string, unknown>;
  const family = raw.family ?? "POSITIVE_RETURN";
  if (family !== "POSITIVE_RETURN" && family !== "FIRST_BARRIER")
    throw new Error("Choose an explicit outcome family.");
  const outcome = {
    family,
    horizon: finite(raw.horizon ?? 10, "Horizon", 1, 250),
    threshold: finite(raw.threshold ?? 0, "Return threshold (%)", -99, 1000),
    target: finite(raw.target ?? 5, "Target (%)", 0.01, 1000),
    stop: finite(raw.stop ?? 3, "Stop (%)", 0.01, 99),
    costBps: finite(
      raw.costBps ?? 0,
      "Assumed round-trip costs (bps)",
      0,
      1000,
    ),
  } as OutcomeDefinition;
  if (!Number.isInteger(outcome.horizon))
    throw new Error("Horizon must use whole eligible sessions.");
  const instrumentIds = input.instrumentIds ?? [];
  if (
    !Array.isArray(instrumentIds) ||
    instrumentIds.length > 1000 ||
    instrumentIds.some(
      (x) => typeof x !== "string" || !/^[A-Za-z0-9_:./!+-]{1,160}$/.test(x),
    )
  )
    throw new Error("Choose at most 1,000 exact instrument identifiers.");
  return {
    name,
    description,
    formula,
    mode: input.mode,
    universe,
    ...(universePreset === undefined ? {} : { universePreset }),
    ...(universePreset === "MY_WATCHLIST" && typeof input.watchlistId === "string" &&
      /^[A-Za-z0-9_-]{1,80}$/.test(input.watchlistId) ? { watchlistId: input.watchlistId } : {}),
    interval: interval as ResearchDefinition["interval"],
    partialPolicy,
    outcome,
    instrumentIds: [...new Set(instrumentIds)],
  };
}
export function compileTree(tree: RuleTree): CanonicalRule {
  let nodes = 0;
  function render(node: RuleTree, depth: number): string {
    if (++nodes > 60 || depth > 8 || !node)
      throw new Error(
        "Keep the visual rule tree within 60 nodes and eight levels.",
      );
    if (node.kind === "condition") {
      const rule = compileRules([node.rule], "ALL");
      return renderFormula(
        rule.ast.kind === "call" &&
          rule.ast.name === "all" &&
          rule.ast.args.length === 1
          ? rule.ast.args[0]
          : rule.ast,
      );
    }
    if (node.kind === "NOT") return `not(${render(node.child, depth + 1)})`;
    if (
      (node.kind !== "ALL" && node.kind !== "ANY") ||
      !Array.isArray(node.children) ||
      !node.children.length ||
      node.children.length > 12
    )
      throw new Error("Every rule group needs 1–12 children.");
    return `${node.kind.toLowerCase()}(${node.children.map((child) => render(child, depth + 1)).join(", ")})`;
  }
  return compileFormula(render(tree, 0));
}
export function treeFromFormula(formula: string): RuleTree | null {
  function convert(ast: Ast): RuleTree | null {
    if (ast.kind === "call" && ["all", "any"].includes(ast.name)) {
      const children = ast.args.map(convert);
      return children.every(Boolean)
        ? {
            kind: ast.name === "all" ? "ALL" : "ANY",
            children: children as RuleTree[],
          }
        : null;
    }
    if (ast.kind === "binary" && ["AND", "OR"].includes(ast.op)) {
      const left = convert(ast.left),
        right = convert(ast.right);
      return left && right
        ? { kind: ast.op === "AND" ? "ALL" : "ANY", children: [left, right] }
        : null;
    }
    if (
      (ast.kind === "unary" && ast.op === "NOT") ||
      (ast.kind === "call" && ast.name === "not")
    ) {
      const child = convert(ast.kind === "unary" ? ast.arg : ast.args[0]);
      return child ? { kind: "NOT", child } : null;
    }
    const simple = toSimpleRules(compileFormula(renderFormula(ast)));
    return simple?.blocks.length === 1
      ? { kind: "condition", rule: simple.blocks[0] }
      : null;
  }
  return convert(compileFormula(formula).ast);
}
export type ScanUniverseAccounting = {
  requested: number;
  discovered: number;
  authorized: number;
  eligible: number;
  evaluated: number;
  matched: number;
  notMatched: number;
  unknown: number;
  excluded: number;
  deferred: number;
  denied: number;
  withheld: number;
  errors: number;
  coveragePct: number;
};

export type ScanSourceExclusion = {
  id: string;
  reason: string;
  kind?: "scope" | "deferred" | "denied" | "unavailable" | "error";
};

export type ScanBatchPlan = {
  totalCandidates: number;
  batchSize: number;
  estimatedBatches: number;
  executionMode: "INLINE" | "BOUNDED_CHUNKED";
};

function isValidIsoCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Validates and parses a user-supplied private CSV OHLCV dataset for personal research.
 * Never treated as an exchange-licensed public feed and never redistributed.
 * Accepted header columns: symbol (or id), date, close, and optional open, high, low, volume.
 */
export function parsePrivateCsvDataset(
  csvText: string,
  nowMs = Date.now(),
): {
  datasets: ScanDataset[];
  excluded: { id: string; reason: string }[];
  asOf: string;
  source: string;
} {
  if (typeof csvText !== "string" || !csvText.trim()) {
    throw new Error("Paste or upload a non-empty CSV with symbol,date,open,high,low,close,volume.");
  }
  if (csvText.length > 500_000) {
    throw new Error("Private CSV import is bounded to 500 KB per scan.");
  }
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one observation row.");
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const symIdx = header.findIndex((h) => ["symbol", "id", "instrument", "ticker"].includes(h));
  const dateIdx = header.indexOf("date");
  const closeIdx = header.indexOf("close");
  const openIdx = header.indexOf("open");
  const highIdx = header.indexOf("high");
  const lowIdx = header.indexOf("low");
  const volIdx = header.indexOf("volume");

  if (symIdx === -1 || dateIdx === -1 || closeIdx === -1) {
    throw new Error("CSV header must contain at least: symbol,date,close (plus optional open,high,low,volume).");
  }

  const knownAt = new Date(nowMs).toISOString();
  const bySymbol = new Map<
    string,
    {
      dates: Set<string>;
      bars: {
        date: string;
        eventAt: string;
        knownAt: string;
        open?: number;
        high?: number;
        low?: number;
        close: number;
        volume?: number;
      }[];
    }
  >();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const rawSym = (cols[symIdx] ?? "").toUpperCase();
    const dateStr = cols[dateIdx] ?? "";
    if (!rawSym || !/^[A-Z0-9_:./!+-]{1,60}$/.test(rawSym)) {
      throw new Error(`Row ${i + 1}: invalid instrument identifier "${cols[symIdx] ?? ""}".`);
    }
    const sym = rawSym.includes(":") ? rawSym : `CSV:${rawSym}`;
    if (!isValidIsoCalendarDate(dateStr)) {
      throw new Error(`Row ${i + 1} (${sym}): date "${dateStr}" must be a valid YYYY-MM-DD calendar date.`);
    }
    const eventMs = Date.parse(`${dateStr}T00:00:00.000Z`);
    if (eventMs > nowMs + 86_400_000) {
      throw new Error(`Row ${i + 1} (${sym}): future-dated bar "${dateStr}" is rejected.`);
    }

    const close = Number(cols[closeIdx]);
    if (!Number.isFinite(close) || close <= 0) {
      throw new Error(`Row ${i + 1} (${sym}): close must be a positive finite number.`);
    }

    let open: number | undefined;
    let high: number | undefined;
    let low: number | undefined;
    let volume: number | undefined;

    if (openIdx !== -1 && cols[openIdx] !== "" && cols[openIdx] !== undefined) {
      open = Number(cols[openIdx]);
      if (!Number.isFinite(open) || open <= 0) {
        throw new Error(`Row ${i + 1} (${sym}): open must be a positive finite number.`);
      }
    }
    if (highIdx !== -1 && cols[highIdx] !== "" && cols[highIdx] !== undefined) {
      high = Number(cols[highIdx]);
      if (!Number.isFinite(high) || high <= 0) {
        throw new Error(`Row ${i + 1} (${sym}): high must be a positive finite number.`);
      }
    }
    if (lowIdx !== -1 && cols[lowIdx] !== "" && cols[lowIdx] !== undefined) {
      low = Number(cols[lowIdx]);
      if (!Number.isFinite(low) || low <= 0) {
        throw new Error(`Row ${i + 1} (${sym}): low must be a positive finite number.`);
      }
    }
    if (volIdx !== -1 && cols[volIdx] !== "" && cols[volIdx] !== undefined) {
      volume = Number(cols[volIdx]);
      if (!Number.isFinite(volume) || volume < 0) {
        throw new Error(`Row ${i + 1} (${sym}): volume cannot be negative or NaN.`);
      }
    }

    if (high !== undefined && low !== undefined && high < low) {
      throw new Error(`Row ${i + 1} (${sym}): impossible OHLC (high ${high} < low ${low}).`);
    }
    if (high !== undefined && (high < close || (open !== undefined && high < open))) {
      throw new Error(`Row ${i + 1} (${sym}): impossible OHLC (high below open/close).`);
    }
    if (low !== undefined && (low > close || (open !== undefined && low > open))) {
      throw new Error(`Row ${i + 1} (${sym}): impossible OHLC (low above open/close).`);
    }

    let bucket = bySymbol.get(sym);
    if (!bucket) {
      bucket = { dates: new Set(), bars: [] };
      bySymbol.set(sym, bucket);
    }
    if (bucket.dates.has(dateStr)) {
      throw new Error(`Row ${i + 1} (${sym}): duplicate date "${dateStr}" rejected.`);
    }
    bucket.dates.add(dateStr);
    bucket.bars.push({
      date: dateStr,
      eventAt: `${dateStr}T00:00:00.000Z`,
      knownAt,
      ...(open !== undefined ? { open } : {}),
      ...(high !== undefined ? { high } : {}),
      ...(low !== undefined ? { low } : {}),
      close,
      ...(volume !== undefined ? { volume } : {}),
    });
  }

  const datasets: ScanDataset[] = [];
  for (const [instrumentId, bucket] of bySymbol.entries()) {
    bucket.bars.sort((a, b) => a.date.localeCompare(b.date));
    datasets.push({
      instrumentId,
      source: "Private User CSV (Personal Research Only)",
      permitted: true,
      frequency: "USER_IMPORTED_OHLCV",
      maxAgeMs: 3650 * 86_400_000,
      observations: bucket.bars.map(({ date: _d, ...obs }) => obs),
    });
  }

  return {
    datasets,
    excluded: [],
    asOf: knownAt,
    source: "Private User CSV (Personal Research Only)",
  };
}

export function preflightResearch(
  definition: ResearchDefinition,
  datasets: ScanDataset[],
  asOf: string,
  sourceExclusions: ScanSourceExclusion[] = [],
  minimumBars: number | null = null,
) {
  const rule = compileFormula(definition.formula),
    result = evaluateScan(rule, datasets, asOf);
  const observationsById = new Map(datasets.map((d) => [d.instrumentId, d.observations]));
  const cutoff = Date.parse(asOf);
  const exclusions = result.results.filter((row) => row.status === "UNKNOWN").map((row) => {
    const available = observationsById.get(row.instrumentId)?.filter(
      (bar) => Date.parse(bar.eventAt) <= cutoff && Date.parse(bar.knownAt) <= cutoff,
    ).length;
    return {
      id: row.instrumentId,
      reasons: minimumBars !== null && available !== undefined && available < minimumBars
        ? [`Rule requires ${minimumBars} bars · ${available} available.`, ...row.reasons]
        : row.reasons,
    };
  });
  const blocked =
    !datasets.length ||
    result.eligible === 0 ||
    (definition.partialPolicy === "STRICT" && result.unknown > 0);
  const candidates = new Set(datasets.map(({ instrumentId }) => instrumentId));
  const excluded = [...new Map(sourceExclusions
    .filter(({ id, kind }) => kind !== "scope" && !candidates.has(id))
    .map((entry) => [entry.id, entry])).values()];
  const discovered = datasets.length + excluded.length;
  const authorized = datasets.filter((d) => d.permitted !== false).length;
  const accounting: ScanUniverseAccounting = {
    requested: definition.instrumentIds.length || discovered,
    discovered,
    authorized,
    eligible: result.eligible,
    evaluated: result.total,
    matched: result.matches,
    notMatched: result.failed,
    unknown: result.unknown,
    excluded: excluded.length,
    deferred: excluded.filter(({ kind }) => kind === "deferred").length,
    denied: excluded.filter(({ kind }) => kind === "denied").length,
    withheld: 0,
    errors: excluded.filter(({ kind }) => kind === "error").length,
    coveragePct:
      discovered > 0
        ? Math.round((result.eligible / discovered) * 1000) / 10
        : 0,
  };
  const batchSize = 24;
  const batchPlan: ScanBatchPlan = {
    totalCandidates: discovered,
    batchSize,
    estimatedBatches: Math.ceil(discovered / batchSize),
    executionMode: discovered > batchSize ? "BOUNDED_CHUNKED" : "INLINE",
  };
  return {
    version: RESEARCH_VERSION,
    asOf,
    eligible: result.eligible,
    total: result.total,
    unknown: result.unknown,
    requiredFields: rule.dependencies,
    minimumBars,
    blocked,
    reason: !datasets.length
      ? sourceExclusions[0]?.reason ?? "Connect an entitled source for this universe and timeframe."
      : !result.eligible
        ? "No instrument has all required fields/history. No scan will be saved."
        : blocked
          ? "Some instruments have missing inputs. Explicitly allow UNKNOWN results or narrow the universe."
          : null,
    exclusions,
    results: result,
    accounting,
    batchPlan,
    quota: "Classic: 20 completed scans / IST day · Advanced: 1 / rolling 60 min · Zero paid credits",
    sourceMode:
      definition.universe === "ECB_DAILY"
        ? "DAILY REFERENCE"
        : "SOURCE-SPECIFIC",
    lookback:
      "Required lookbacks are enforced by the canonical engine for every instrument.",
  };
}

export type OutcomeLabel =
  "SUCCESS" | "FAILURE" | "NEUTRAL" | "UNRESOLVED" | "AMBIGUOUS";
export type ResearchBar = {
  at: string;
  knownAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type EvidenceCase = {
  id: string;
  subject: string;
  clusterId: string;
  instrumentId: string;
  formula: string;
  outcomeKey: string;
  signalAt: string;
  endAt: string;
  knownAt: string;
  label: OutcomeLabel;
  returnPct: number | null;
  source: string;
  sourceVerified: boolean;
  pointInTime: boolean;
  storagePermitted: boolean;
  retired?: boolean;
  consent?: { aggregate: boolean; withdrawn: boolean };
  cohort?: string;
};
export function outcomeKey(definition: OutcomeDefinition) {
  return JSON.stringify(definition);
}
function validTime(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
export function labelOutcome(
  entry: number,
  bars: ResearchBar[],
  definition: OutcomeDefinition,
  asOf: string,
): {
  label: OutcomeLabel;
  returnPct: number | null;
  endAt: string | null;
  reason: string;
} {
  if (!Number.isFinite(entry) || entry <= 0 || !validTime(asOf))
    throw new Error(
      "Outcome requires a positive entry observation and valid as-of time.",
    );
  let previous = -Infinity;
  for (const bar of bars) {
    if (
      !validTime(bar.at) ||
      !validTime(bar.knownAt) ||
      Date.parse(bar.knownAt) < Date.parse(bar.at) ||
      Date.parse(bar.at) <= previous ||
      [bar.open, bar.high, bar.low, bar.close].some(
        (x) => !Number.isFinite(x) || x <= 0,
      ) ||
      bar.high < Math.max(bar.open, bar.close) ||
      bar.low > Math.min(bar.open, bar.close) ||
      bar.low > bar.high
    )
      throw new Error(
        "Invalid, unordered or non-causal OHLC outcome observation.",
      );
    previous = Date.parse(bar.at);
  }
  const eligible: ResearchBar[] = [];
  for (const bar of bars.slice(0, definition.horizon)) {
    if (
      Date.parse(bar.at) > Date.parse(asOf) ||
      Date.parse(bar.knownAt) > Date.parse(asOf)
    )
      break;
    eligible.push(bar);
  }
  if (definition.family === "FIRST_BARRIER") {
    for (const bar of eligible) {
      if (bar.open <= entry * (1 - definition.stop / 100))
        return {
          label: "FAILURE",
          returnPct: (bar.open / entry - 1) * 100 - definition.costBps / 100,
          endAt: bar.at,
          reason:
            "Opening observation gaps through the stop; open is first and worse than the stop level.",
        };
      if (bar.open >= entry * (1 + definition.target / 100))
        return {
          label: "SUCCESS",
          returnPct: (bar.open / entry - 1) * 100 - definition.costBps / 100,
          endAt: bar.at,
          reason:
            "Opening observation is already beyond target before later intrabar touches.",
        };
      const target = bar.high >= entry * (1 + definition.target / 100),
        stop = bar.low <= entry * (1 - definition.stop / 100);
      if (target && stop)
        return {
          label: "AMBIGUOUS",
          returnPct: null,
          endAt: bar.at,
          reason:
            "Both barriers touched in one bar; intrabar ordering is unknown. Excluded from resolved denominator.",
        };
      if (stop)
        return {
          label: "FAILURE",
          returnPct: -definition.stop - definition.costBps / 100,
          endAt: bar.at,
          reason: "Stop touched before the target.",
        };
      if (target)
        return {
          label: "SUCCESS",
          returnPct: definition.target - definition.costBps / 100,
          endAt: bar.at,
          reason: "Target touched before the stop.",
        };
    }
    return {
      label: eligible.length < definition.horizon ? "UNRESOLVED" : "NEUTRAL",
      returnPct:
        eligible.length < definition.horizon
          ? null
          : (eligible.at(-1)!.close / entry - 1) * 100 -
            definition.costBps / 100,
      endAt: eligible.at(-1)?.at ?? null,
      reason:
        eligible.length < definition.horizon
          ? "Right-censored: horizon has not matured."
          : "Neither barrier touched by the horizon; not a target success.",
    };
  }
  if (eligible.length < definition.horizon)
    return {
      label: "UNRESOLVED",
      returnPct: null,
      endAt: eligible.at(-1)?.at ?? null,
      reason: "Right-censored: horizon has not matured.",
    };
  const returnPct =
    (eligible.at(-1)!.close / entry - 1) * 100 - definition.costBps / 100;
  return {
    label: returnPct > definition.threshold ? "SUCCESS" : "FAILURE",
    returnPct,
    endAt: eligible.at(-1)!.at,
    reason:
      "Adjusted horizon return compared with the registered threshold; costs are assumptions, not observed fills.",
  };
}
export function wilson(
  successes: number,
  n: number,
  z = 1.959963984540054,
): [number, number] | null {
  if (
    !Number.isInteger(n) ||
    n <= 0 ||
    !Number.isInteger(successes) ||
    successes < 0 ||
    successes > n
  )
    return null;
  const p = successes / n,
    d = 1 + (z * z) / n,
    centre = (p + (z * z) / (2 * n)) / d,
    half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
export function calibration(
  predictions: { probability: number; outcome: 0 | 1 }[],
) {
  if (
    !predictions.length ||
    predictions.some(
      (p) =>
        !Number.isFinite(p.probability) ||
        p.probability < 0 ||
        p.probability > 1 ||
        ![0, 1].includes(p.outcome),
    )
  )
    throw new Error(
      "Calibration needs bounded probabilities and binary matured outcomes.",
    );
  const bins = Array.from({ length: 5 }, (_, index) => ({
    lower: index / 5,
    upper: (index + 1) / 5,
    n: 0,
    probability: 0,
    observed: 0,
  }));
  for (const row of predictions) {
    const bin = bins[Math.min(4, Math.floor(row.probability * 5))];
    bin.n++;
    bin.probability += row.probability;
    bin.observed += row.outcome;
  }
  for (const bin of bins)
    if (bin.n) {
      bin.probability /= bin.n;
      bin.observed /= bin.n;
    }
  const n = predictions.length,
    brier =
      predictions.reduce(
        (sum, row) => sum + (row.probability - row.outcome) ** 2,
        0,
      ) / n,
    calibrationInLarge =
      predictions.reduce((sum, row) => sum + row.probability - row.outcome, 0) /
      n;
  return {
    n,
    brier,
    calibrationInLarge,
    ece: bins.reduce(
      (sum, bin) =>
        sum + (bin.n / n) * Math.abs(bin.probability - bin.observed),
      0,
    ),
    bins,
    caveat:
      "Five fixed bins; small bins are noisy. This diagnostic does not establish individual independence or future stability.",
  };
}
export type EvidenceQuery = {
  subject: string;
  asOf: string;
  formula: string;
  outcome: OutcomeDefinition;
  reusePersonal: boolean;
  includeAggregate?: boolean;
  cohort?: string;
  baseline?: {
    rate: number;
    verified: boolean;
    knownAt: string;
    source: string;
  };
  minResolved?: number;
  minDates?: number;
  minHoldout?: number;
};
export function assessEvidence(cases: EvidenceCase[], query: EvidenceQuery) {
  if (cases.length > 20000 || !validTime(query.asOf))
    throw new Error(
      "Evidence query exceeds bounded limits or has invalid time.",
    );
  const canonical = compileFormula(query.formula).formula,
    wanted = outcomeKey(query.outcome),
    exclusions: Record<string, number> = {},
    accepted: EvidenceCase[] = [];
  const exclude = (why: string) => {
    exclusions[why] = (exclusions[why] ?? 0) + 1;
  };
  for (const row of cases) {
    // Privacy filtering precedes diagnostics: outsiders contribute no count or identity.
    const personal = row.subject === query.subject;
    if (
      personal
        ? !query.reusePersonal
        : !query.includeAggregate ||
          !row.consent?.aggregate ||
          row.consent.withdrawn
    )
      continue;
    if (!row.sourceVerified || !row.pointInTime || !row.storagePermitted) {
      exclude("Unverified source, point-in-time history or retention rights");
      continue;
    }
    if (
      ![row.signalAt, row.endAt, row.knownAt].every(validTime) ||
      Date.parse(row.signalAt) >= Date.parse(row.endAt) ||
      Date.parse(row.knownAt) < Date.parse(row.endAt) ||
      Date.parse(row.knownAt) > Date.parse(query.asOf) ||
      Date.parse(row.endAt) > Date.parse(query.asOf)
    ) {
      exclude("Future, unmatured or non-causal case");
      continue;
    }
    if (
      row.formula !== canonical ||
      row.outcomeKey !== wanted ||
      (query.cohort && row.cohort !== query.cohort)
    ) {
      exclude("Different registered rule, outcome, horizon or cohort");
      continue;
    }
    accepted.push(row);
  }
  accepted.sort(
    (a, b) => a.signalAt.localeCompare(b.signalAt) || a.id.localeCompare(b.id),
  );
  const lastEnd = new Map<string, number>(),
    independent: EvidenceCase[] = [];
  for (const row of accepted) {
    const cluster = row.clusterId || row.instrumentId;
    if (Date.parse(row.signalAt) <= (lastEnd.get(cluster) ?? -Infinity)) {
      exclude("Duplicate or overlapping event cluster");
      continue;
    }
    lastEnd.set(cluster, Date.parse(row.endAt));
    independent.push(row);
  }
  const labels = {
    SUCCESS: 0,
    FAILURE: 0,
    NEUTRAL: 0,
    UNRESOLVED: 0,
    AMBIGUOUS: 0,
  };
  independent.forEach((row) => labels[row.label]++);
  // A matured no-hit barrier is a non-success. Ambiguity/censoring stays outside denominator.
  const resolved = independent.filter(
    (row) =>
      row.label === "SUCCESS" ||
      row.label === "FAILURE" ||
      row.label === "NEUTRAL",
  );
  const n = resolved.length,
    successes = labels.SUCCESS,
    descriptiveRate = n ? successes / n : null,
    interval = wilson(successes, n),
    dates = new Set(resolved.map((row) => row.signalAt.slice(0, 10))).size;
  const trainCut = Math.floor(n * 0.6),
    validationCut = Math.floor(n * 0.8);
  const training = resolved.slice(0, trainCut),
    validationStart = resolved[trainCut]?.signalAt,
    testStart = resolved[validationCut]?.signalAt;
  // Purge any training/validation label window overlapping the next chronological split.
  const train = training.filter(
      (row) => !validationStart || row.endAt < validationStart,
    ),
    valid = resolved
      .slice(trainCut, validationCut)
      .filter((row) => !testStart || row.endAt < testStart),
    test = resolved.slice(validationCut);
  const prediction = train.length
    ? (train.filter((row) => row.label === "SUCCESS").length + 1) /
      (train.length + 2)
    : null;
  const diagnostic = (rows: EvidenceCase[], p: number) =>
    rows.length
      ? calibration(
          rows.map((row) => ({
            probability: p,
            outcome: row.label === "SUCCESS" ? 1 : 0,
          })),
        )
      : null;
  const validation = prediction === null ? null : diagnostic(valid, prediction),
    holdout = prediction === null ? null : diagnostic(test, prediction);
  const baseline =
    query.baseline &&
    query.baseline.verified &&
    validTime(query.baseline.knownAt) &&
    query.baseline.knownAt <= query.asOf &&
    Number.isFinite(query.baseline.rate) &&
    query.baseline.rate >= 0 &&
    query.baseline.rate <= 1
      ? diagnostic(test, query.baseline.rate)
      : null;
  const reasons: string[] = [];
  if (n < Math.max(100, query.minResolved ?? 100))
    reasons.push(
      "At least 100 resolved, non-overlapping comparable observations are required.",
    );
  if (dates < Math.max(50, query.minDates ?? 50))
    reasons.push("At least 50 distinct signal dates are required.");
  if (
    test.length < Math.max(30, query.minHoldout ?? 30) ||
    valid.length < 20 ||
    train.length < 50
  )
    reasons.push(
      "Insufficient purged chronological training, validation or independent holdout data.",
    );
  if (
    [train, valid, test].some(
      (part) =>
        (part.length && !part.some((row) => row.label === "SUCCESS")) ||
        (part.length && part.every((row) => row.label === "SUCCESS")),
    )
  )
    reasons.push(
      "Training, validation and holdout each require both binary outcome classes.",
    );
  if (!successes || successes === n)
    reasons.push(
      "Both outcome classes are required; all-win/all-loss samples do not certify a probability.",
    );
  if (!interval || interval[1] - interval[0] > 0.3)
    reasons.push("The descriptive 95% interval is too wide.");
  if (!baseline)
    reasons.push(
      "A verified contemporaneous unconditional/cohort baseline is missing.",
    );
  if (
    !holdout ||
    !validation ||
    holdout.ece > 0.12 ||
    validation.ece > 0.12 ||
    Math.abs(holdout.calibrationInLarge) > 0.12 ||
    (baseline && holdout.brier > baseline.brier + 0.005)
  )
    reasons.push(
      "Out-of-sample calibration or baseline-relative Brier release gate is not met.",
    );
  return {
    version: RESEARCH_VERSION,
    status: reasons.length
      ? ("INSUFFICIENT EVIDENCE" as const)
      : ("VALIDATED" as const),
    probability: reasons.length ? null : prediction,
    interval: reasons.length
      ? null
      : wilson(
          train.filter((row) => row.label === "SUCCESS").length,
          train.length,
        ),
    descriptive: {
      n,
      successes,
      dates,
      rate: descriptiveRate,
      interval,
      labels,
    },
    split: {
      training: train.length,
      validation: valid.length,
      holdout: test.length,
      policy:
        "Chronological 60/20/20 split with purged overlapping label windows. No random split.",
    },
    calibration: { validation, holdout, baseline },
    reasons,
    exclusions,
    personalCaseLinks: independent
      .filter((row) => row.subject === query.subject)
      .slice(-50)
      .map((row) => ({
        id: row.id,
        instrumentId: row.instrumentId,
        signalAt: row.signalAt,
        label: row.label,
        retired: !!row.retired,
      })),
    scope:
      "Conditional registered-rule cohort; not asset-specific advice. Negative-only Graveyard selection is never a denominator.",
    drift:
      "Suppress and roll back scoring whenever freshness, calibration, baseline or consent gates fail.",
  };
}

export function replayResearch(
  definition: ResearchDefinition,
  dataset: ScanDataset,
  asOf: string,
  metadata: {
    subject: string;
    pointInTime: boolean;
    adjusted: boolean;
    storagePermitted: boolean;
    clusterId?: string;
  },
) {
  if (
    !metadata.pointInTime ||
    !metadata.adjusted ||
    !metadata.storagePermitted ||
    !dataset.permitted
  )
    return {
      status: "DATA UNAVAILABLE" as const,
      reasons: [
        "Replay requires licensed point-in-time adjusted history and permitted outcome storage. Daily reference retrieval timestamps do not establish historical availability.",
      ],
      cases: [] as EvidenceCase[],
      summary: null,
    };
  if (dataset.observations.length > 1000)
    return {
      status: "DATA UNAVAILABLE" as const,
      reasons: [
        "Replay is bounded to 1,000 observations per selected instrument; choose a shorter licensed window.",
      ],
      cases: [] as EvidenceCase[],
      summary: null,
    };
  if (!validTime(asOf) || dataset.observations.length > 5000)
    throw new Error("Replay time or size is invalid.");
  const rule = compileFormula(definition.formula),
    cases: EvidenceCase[] = [];
  for (let i = 0; i < dataset.observations.length - 1; i++) {
    const o = dataset.observations[i];
    if (
      !validTime(o.eventAt) ||
      Date.parse(o.eventAt) > Date.parse(asOf) ||
      o.close == null ||
      o.close <= 0
    )
      continue;
    const signalAt = o.eventAt;
    // Features at this historical instant are evaluated using historical knownAt, not today's cutoff.
    if (evaluateScan(rule, [dataset], signalAt).results[0]?.status !== "PASS")
      continue;
    const forward = dataset.observations.slice(
      i + 1,
      i + 1 + definition.outcome.horizon,
    );
    if (
      forward.some((x) =>
        [x.open, x.high, x.low, x.close].some((v) => v == null),
      )
    )
      continue;
    const labelled = labelOutcome(
      o.close,
      forward.map((x) => ({
        at: x.eventAt,
        knownAt: x.knownAt,
        open: x.open!,
        high: x.high!,
        low: x.low!,
        close: x.close!,
      })),
      definition.outcome,
      asOf,
    );
    const endAt = labelled.endAt ?? signalAt,
      knownAt = forward
        .filter((x) => x.eventAt <= endAt)
        .reduce((a, x) => (x.knownAt > a ? x.knownAt : a), endAt);
    cases.push({
      id: `${dataset.instrumentId}:${signalAt}:${definition.outcome.horizon}`,
      subject: metadata.subject,
      clusterId: metadata.clusterId ?? dataset.instrumentId,
      instrumentId: dataset.instrumentId,
      formula: rule.formula,
      outcomeKey: outcomeKey(definition.outcome),
      signalAt,
      endAt,
      knownAt,
      label: labelled.label,
      returnPct: labelled.returnPct,
      source: dataset.source,
      sourceVerified: true,
      pointInTime: true,
      storagePermitted: true,
    });
  }
  const returns = cases
      .filter((x) => x.returnPct !== null)
      .map((x) => x.returnPct!),
    sorted = [...returns].sort((a, b) => a - b);
  const bins = [
    { label: "Below -5%", n: 0 },
    { label: "-5% to 0%", n: 0 },
    { label: "0% to 5%", n: 0 },
    { label: "5% or more", n: 0 },
  ];
  returns.forEach((v) => bins[v < -5 ? 0 : v <= 0 ? 1 : v < 5 ? 2 : 3].n++);
  return {
    status: "RESEARCH REPLAY" as const,
    reasons: [
      "Signal cohort observations may overlap. This distribution is descriptive, not a tradable portfolio equity curve; evidence scoring separately deduplicates overlaps.",
    ],
    cases,
    summary: {
      n: returns.length,
      median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      minimum: sorted[0] ?? null,
      maximum: sorted.at(-1) ?? null,
      bins,
      costBps: definition.outcome.costBps,
    },
  };
}
