"use client";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  Compass,
  Info,
  Layers,
  PenTool,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { compileFormula, requiredScanBars } from "../../../backend/engines/scan";
import {
  CLASSIC_50_PRESETS,
  CLASSIC_CATEGORY_COUNTS,
  CLASSIC_PRESET_CATEGORIES,
  findClassicPresetByFormula,
  findClassicPresetById,
  searchClassicPresets,
  type ClassicPreset,
  type ClassicPresetCategory,
} from "../../../backend/services/research/classic-presets";
import {
  DISCOVER_EXAMPLES,
  type DiscoverBlueprint,
} from "../../../backend/services/research/discover-parser";
import {
  RESEARCH_GLOSSARY,
  SCAN_REQUEST_VERSION,
  SCAN_UNIVERSE_LABEL,
  compileTree,
  scanUniverseForPreset,
  treeFromFormula,
  validateResearch,
  type OutcomeDefinition,
  type ResearchDefinition,
  type RuleTree,
  type ScanUniversePreset,
} from "../../../backend/services/research/research";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import { TradingViewWidget } from "../../components/tradingview-widget";
import {
  Empty,
  Modal,
  Panel,
  SourceLink,
  WorkspaceSkeleton,
  api,
  moment,
  type Notice,
  type ScanRun,
  type WorkspaceState,
} from "../../components/workspace/shared";
import { IconGraveyard, IconPin, IconStrategy } from "../../components/workspace/ss-icons";
import { triggerGoFeedback } from "../../components/workspace/go-feedback";
import { ResearchInfo, RuleEditor } from "./controls";
import "./research.css";

const FormulaLab = lazy(() => import("./formula-lab"));
const PatternDrawCanvas = lazy(() => import("./draw-canvas"));

type Props = {
  data: MarketSnapshot | null;
  workspace: WorkspaceState | null;
  authenticated?: boolean;
  onRequireAuth?: () => void;
  reload: () => Promise<void>;
  notify: Notice;
  openAsset: (id: string) => void;
  share: (formula: string) => void;
  onOpenCommunityWeb?: () => void;
  onOpenWatchlist?: () => void;
  initialFormula: string;
  initialInstrument?: string;
  initialUniversePreset?: ScanUniversePreset;
  initialPanel?: string;
};

type StrategyTab = "scan" | "lab";
type ScanTierMode = "CLASSIC" | "ADVANCED";
type AdvancedEntryMode = "BUILD" | "DISCOVER" | "DRAW";
type UserTimeframe = "30m" | "1h" | "1d" | "1wk" | "1mo";
type ScanPhase =
  | "IDLE"
  | "RUNNING"
  | "COMPLETE"
  | "NO_MATCHES"
  | "BLOCKED"
  | "FAILED"
  | "CANCELED";

type FormulaParamToken = {
  id: string;
  label: string;
  value: string;
  start: number;
  end: number;
};

const TIMEFRAME_OPTIONS: readonly { value: UserTimeframe; label: string }[] = [
  { value: "30m", label: "30m" },
  { value: "1h", label: "1 Hour" },
  { value: "1d", label: "Daily" },
  { value: "1wk", label: "Weekly" },
  { value: "1mo", label: "Monthly" },
];

const TIMEFRAME_LABEL: Record<string, string> = {
  "30m": "30m",
  "1h": "1 Hour",
  "1d": "Daily",
  "1wk": "Weekly",
  "1mo": "Monthly",
};

const EXTRA_SCOPES: readonly { id: ScanUniversePreset; label: string }[] = [
  { id: "INDIAN_EQUITIES", label: "NSE / BSE" },
  { id: "MCX_FUTURES", label: "MCX Futures" },
  { id: "ECB_DAILY", label: "ECB FX (Daily)" },
  { id: "CUSTOM_CSV", label: "Private CSV" },
];

const DEFAULT_OUTCOME: OutcomeDefinition = {
  family: "POSITIVE_RETURN",
  horizon: 10,
  threshold: 0,
  target: 5,
  stop: 3,
  costBps: 0,
};

const DEFAULT_ADVANCED_TREE: RuleTree = {
  kind: "ALL",
  children: [
    { kind: "condition", rule: { id: "r1", field: "close", op: ">", value: 0 } },
    { kind: "condition", rule: { id: "r2", field: "rsi14", op: "<", value: 70 } },
  ],
};

const DEFAULT_ADVANCED_FORMULA = "all(close > sma(close, 20), rsi(close, 14) < 70)";

function defaultSoulNameForPreset(preset: ClassicPreset): string {
  const short = preset.label.trim();
  return short.length <= 64 ? short : `${short.slice(0, 61)}…`;
}

function sourceBadgeLabel(rawPreset?: string, rawSource?: string): string {
  if (rawPreset === "MY_WATCHLIST" || rawSource === "Watchlist") return "Watchlist";
  if (rawPreset === "MARKET") return "Market";
  if (rawPreset && rawPreset in SCAN_UNIVERSE_LABEL) {
    return SCAN_UNIVERSE_LABEL[rawPreset as ScanUniversePreset];
  }
  return rawSource || "Market";
}

function formatScanBarTimestamp(
  iso: string | null | undefined,
  interval?: string,
): string {
  if (!iso) return "";
  if (
    interval === "30m" ||
    interval === "1h" ||
    (iso.includes("T") && !iso.endsWith("T00:00:00.000Z"))
  ) {
    return moment(iso);
  }
  return iso.slice(0, 10);
}

/**
 * Extracts editable numeric tokens from a Classic AST formula expression so users can
 * adjust indicator periods or thresholds directly without losing AST syntax.
 */
function extractFormulaParameters(formula: string): FormulaParamToken[] {
  const out: FormulaParamToken[] = [];
  const regex = /\b\d+(?:\.\d+)?\b/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(formula)) !== null && out.length < 4) {
    const start = match.index;
    const end = start + match[0].length;
    const before = formula.slice(Math.max(0, start - 24), start).toLowerCase();
    // Skip numbers embedded inside identifier names like rsi14 or sma20
    if (start > 0 && /[a-z_]/i.test(formula[start - 1])) continue;
    let label = `Param ${idx + 1}`;
    if (/ema\([^)]*,\s*$/.test(before)) label = "EMA period";
    else if (/sma\([^)]*,\s*$/.test(before)) label = "SMA period";
    else if (/rsi\([^)]*,\s*$/.test(before)) label = "RSI period";
    else if (/atr\(\s*$/.test(before)) label = "ATR period";
    else if (/highest\([^)]*,\s*$/.test(before)) label = "High lookback";
    else if (/lowest\([^)]*,\s*$/.test(before)) label = "Low lookback";
    else if (/bb(?:upper|lower)\([^)]*,\s*$/.test(before)) label = "BB param";
    else if (/macd\([^)]*,\s*$/.test(before)) label = "MACD period";
    else if (/change\([^)]*,\s*$/.test(before)) label = "Lookback";
    else if (/[<>!=]=?\s*$/.test(before)) label = "Threshold";
    else if (/[*/+-]\s*$/.test(before)) label = "Multiplier";
    out.push({
      id: `p-${idx}-${start}`,
      label,
      value: match[0],
      start,
      end,
    });
    idx++;
  }
  return out;
}

function replaceFormulaToken(
  formula: string,
  token: FormulaParamToken,
  nextRaw: string,
): string {
  const trimmed = nextRaw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return formula;
  return formula.slice(0, token.start) + trimmed + formula.slice(token.end);
}

export function FinancialCalendar() {
  return (
    <Panel title="Financial calendar">
      <ResearchInfo label="Source coverage">
        Source-hosted calendars are display only. Structured official schedules
        live in Global → Economic Calendar.
      </ResearchInfo>
      <div className="x1-actions">
        <SourceLink href="https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx">
          RBI
        </SourceLink>
        <SourceLink href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">
          Federal Reserve
        </SourceLink>
        <SourceLink href="https://www.ecb.europa.eu/press/calendars/html/index.en.html">
          ECB
        </SourceLink>
      </div>
      <TradingViewWidget
        kind="calendar"
        title="Financial calendar · TradingView display only"
      />
    </Panel>
  );
}

export default function Strategy({
  workspace,
  authenticated = true,
  onRequireAuth,
  reload,
  notify,
  openAsset,
  onOpenCommunityWeb,
  onOpenWatchlist,
  initialFormula,
  initialInstrument,
  initialUniversePreset,
  initialPanel,
}: Props) {
  const [section, setSection] = useState<StrategyTab>(
    initialPanel === "lab" ? "lab" : "scan",
  );
  const [scanTier, setScanTier] = useState<ScanTierMode>("CLASSIC");
  const [advancedEntry, setAdvancedEntry] = useState<AdvancedEntryMode>("BUILD");

  // Classic preset + editable formula state (presets themselves stay immutable!)
  const initialClassic = CLASSIC_50_PRESETS[0];
  const [classicPresetId, setClassicPresetId] = useState<string>(initialClassic.id);
  const [classicFormula, setClassicFormula] = useState<string>(initialClassic.formula);
  const [formulaPickerOpen, setFormulaPickerOpen] = useState(false);
  const [formulaQuery, setFormulaQuery] = useState("");
  const [formulaCategory, setFormulaCategory] = useState<"ALL" | ClassicPresetCategory>("ALL");
  const [expandedFormulaId, setExpandedFormulaId] = useState<string | null>(null);
  const [activeInfoOpen, setActiveInfoOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Per-user D1 formula pins (optimistic with rollback)
  const [pinnedIds, setPinnedIds] = useState<string[]>(
    workspace?.pinnedFormulaIds ?? [],
  );
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Soul name (sensible prefilled editable default; persists custom typing across preset switches)
  const [name, setName] = useState<string>(defaultSoulNameForPreset(initialClassic));
  const [nameEditedManually, setNameEditedManually] = useState(false);

  // Advanced rule tree + formula
  const [tree, setTree] = useState<RuleTree>(DEFAULT_ADVANCED_TREE);
  const [advancedFormula, setAdvancedFormula] = useState<string>(DEFAULT_ADVANCED_FORMULA);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverBlueprint, setDiscoverBlueprint] = useState<DiscoverBlueprint | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  // Scan Source (Market default; Watchlist + expandable scopes + single-asset deep-link scope)
  const [scopedInstrument, setScopedInstrument] = useState<string>(
    initialInstrument?.trim() ?? "",
  );
  const [scanSource, setScanSource] = useState<ScanUniversePreset>(
    initialInstrument?.trim().startsWith("ECB:")
      ? "ECB_DAILY"
      : initialUniversePreset ?? "MARKET",
  );
  const [moreScopesOpen, setMoreScopesOpen] = useState(
    !!initialUniversePreset &&
      initialUniversePreset !== "MARKET" &&
      initialUniversePreset !== "MY_WATCHLIST",
  );
  const [watchlistId, setWatchlistId] = useState<string>("");
  const [customCsv, setCustomCsv] = useState<string>("");

  // Timeframe (30m, 1h, Daily, Weekly, Monthly; default Daily)
  const [interval, setInterval] = useState<UserTimeframe>("1d");

  // Explicit scan execution lifecycle & cancellation
  const [scanPhase, setScanPhase] = useState<ScanPhase>("IDLE");
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [runningContext, setRunningContext] = useState<{
    name: string;
    sourceLabel: string;
    timeframeLabel: string;
  } | null>(null);

  // GRAVEYARD filters & actions
  const [graveyardFilter, setGraveyardFilter] = useState<
    "ALL" | "CLASSIC" | "ADVANCED" | "RETIRED"
  >("ALL");
  const [graveyardQuery, setGraveyardQuery] = useState("");
  const [review, setReview] = useState<ScanRun | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const lock = useRef(false);
  const runSeqRef = useRef(0);
  const scanAbortRef = useRef<AbortController | null>(null);
  const reviewKeyRef = useRef<{ sig: string; id: string } | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Cleanup any in-flight scan abort controller on unmount
  useEffect(() => {
    return () => {
      scanAbortRef.current?.abort();
    };
  }, []);

  // Sync D1 formula pins from workspace payload
  useEffect(() => {
    const incoming = workspace?.pinnedFormulaIds;
    if (!incoming) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) setPinnedIds(incoming);
    });
    return () => {
      alive = false;
    };
  }, [workspace?.pinnedFormulaIds]);

  // Sync section when initialPanel changes (e.g. Strategy -> Formula Lab)
  useEffect(() => {
    if (initialPanel !== "lab" && initialPanel !== "scan") return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) setSection(initialPanel);
    });
    return () => {
      alive = false;
    };
  }, [initialPanel]);

  // Sync single-asset scope when launched via "Scan Asset"
  useEffect(() => {
    const clean = (initialInstrument ?? "").trim();
    if (!clean) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setSection("scan");
      setScopedInstrument(clean);
      if (clean.startsWith("ECB:")) {
        setScanSource("ECB_DAILY");
        setMoreScopesOpen(true);
        setInterval((cur) => (cur === "30m" || cur === "1h" ? "1d" : cur));
      } else {
        setScanSource("MARKET");
      }
    });
    return () => {
      alive = false;
    };
  }, [initialInstrument]);

  // Handle "Try this formula" handoff from Community (never auto-runs!)
  useEffect(() => {
    const clean = initialFormula.trim();
    if (!clean) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setSection("scan");
      const matched = findClassicPresetByFormula(clean);
      if (matched) {
        setScanTier("CLASSIC");
        setClassicPresetId(matched.id);
        setClassicFormula(matched.formula);
        setName(defaultSoulNameForPreset(matched));
        setNameEditedManually(false);
      } else {
        setScanTier("ADVANCED");
        setAdvancedEntry("BUILD");
        setAdvancedFormula(clean);
        const parsed = treeFromFormula(clean);
        if (parsed) setTree(parsed);
        setName("Imported Community Soul");
        setNameEditedManually(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [initialFormula]);

  // Watchlists
  const watchlists = useMemo(
    () => (workspace?.records ?? []).filter((r) => r.kind === "watchlist"),
    [workspace?.records],
  );
  const activeWatchlist = useMemo(
    () =>
      watchlists.find((w) => w.id === watchlistId) ?? watchlists[0] ?? null,
    [watchlists, watchlistId],
  );
  const watchlistItems = activeWatchlist?.payload.items ?? [];

  const activePreset = useMemo(
    () => findClassicPresetById(classicPresetId) ?? CLASSIC_50_PRESETS[0],
    [classicPresetId],
  );
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const filteredPresets = useMemo(() => {
    const matches = searchClassicPresets(formulaQuery, formulaCategory);
    const pinned = matches.filter((p) => pinnedSet.has(p.id));
    const unpinned = matches.filter((p) => !pinnedSet.has(p.id));
    return { pinned, unpinned, total: matches.length };
  }, [formulaQuery, formulaCategory, pinnedSet]);

  const isClassicCustomized =
    classicFormula.trim() !== activePreset.formula.trim();

  const editableClassicParams = useMemo(
    () => extractFormulaParameters(classicFormula),
    [classicFormula],
  );

  const effectiveFormula =
    scanTier === "CLASSIC" ? classicFormula : advancedFormula;

  const formulaCompile = useMemo(() => {
    try {
      const compiled = compileFormula(effectiveFormula);
      return {
        ok: true as const,
        compiled,
        minBars: requiredScanBars(compiled.ast),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [effectiveFormula]);

  const dailyOnlyScope = scanSource === "ECB_DAILY" || scanSource === "CUSTOM_CSV";

  // Select latest scan cleanly, prioritizing explicit completed scan
  const scans = useMemo(() => workspace?.scans ?? [], [workspace?.scans]);
  const activeScan = useMemo(() => {
    if (selectedScanId) {
      const found = scans.find((s) => s.id === selectedScanId);
      if (found) return found;
    }
    return scans[0] ?? null;
  }, [scans, selectedScanId]);

  // Smooth-scroll to Scan Results ONLY after an explicit Run Scan completes
  useEffect(() => {
    if (!justCompletedId) return;
    const el = resultsRef.current;
    if (el) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
    const timer = window.setTimeout(() => setJustCompletedId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [justCompletedId]);

  function invalidatePendingRun() {
    if (busy) {
      runSeqRef.current += 1;
      scanAbortRef.current?.abort();
      scanAbortRef.current = null;
      lock.current = false;
      setBusy(false);
      setRunningContext(null);
      setScanPhase("CANCELED");
    }
  }

  function selectMode(nextTier: ScanTierMode) {
    setScanTier(nextTier);
    setScanError("");
    if (nextTier === "CLASSIC") {
      if (!nameEditedManually) {
        setName(defaultSoulNameForPreset(activePreset));
      }
    } else {
      if (!nameEditedManually) {
        setName("Custom Advanced Scan");
      }
    }
  }

  function applyClassicPreset(preset: ClassicPreset) {
    setClassicPresetId(preset.id);
    setClassicFormula(preset.formula);
    setScanError("");
    if (!nameEditedManually) {
      setName(defaultSoulNameForPreset(preset));
    }
  }

  function handleScopeChange(nextScope: ScanUniversePreset) {
    invalidatePendingRun();
    setScanSource(nextScope);
    setScanError("");
    if (
      (nextScope === "ECB_DAILY" || nextScope === "CUSTOM_CSV") &&
      (interval === "30m" || interval === "1h")
    ) {
      setInterval("1d");
    }
  }

  async function saveClassicCopy() {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (!formulaCompile.ok) {
      setScanError(formulaCompile.error);
      return;
    }
    if (savingDraft) return;
    const cleanName =
      name.trim().length >= 3
        ? name.trim()
        : `${defaultSoulNameForPreset(activePreset)} Copy`;
    setSavingDraft(true);
    try {
      await api("/api/x1/workspace", {
        action: "save-scan-draft",
        requestId: crypto.randomUUID(),
        definition: {
          name: cleanName,
          description: `Saved private rule copy based on ${activePreset.label}: ${classicFormula}`.slice(
            0,
            1900,
          ),
          formula: classicFormula,
          mode: "SIMPLE",
          universe: scanUniverseForPreset(scanSource),
          universePreset: scanSource,
          interval,
          partialPolicy: "ALLOW_UNKNOWN",
          outcome: DEFAULT_OUTCOME,
          instrumentIds: scopedInstrument ? [scopedInstrument] : [],
        },
      });
      await reload();
      triggerGoFeedback("Formula saved", `draft-${crypto.randomUUID()}`, true);
      notify("Saved private formula copy to your account.");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not save formula copy.",
        true,
      );
    } finally {
      setSavingDraft(false);
    }
  }

  async function togglePin(presetId: string) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (pinningId) return;
    const currentlyPinned = pinnedSet.has(presetId);
    const optimistic = currentlyPinned
      ? pinnedIds.filter((id) => id !== presetId)
      : [presetId, ...pinnedIds.filter((id) => id !== presetId)];
    setPinnedIds(optimistic);
    setPinningId(presetId);
    try {
      const res = await api<{
        ok: boolean;
        pinned: boolean;
        pinnedFormulaIds: string[];
      }>("/api/x1/workspace", {
        action: currentlyPinned ? "unpin-formula" : "pin-formula",
        formulaId: presetId,
      });
      setPinnedIds(res.pinnedFormulaIds);
      triggerGoFeedback(
        currentlyPinned ? "Formula unpinned" : "Formula pinned",
        `pin-${presetId}-${currentlyPinned ? "off" : "on"}-${crypto.randomUUID()}`,
        true,
      );
    } catch (err) {
      setPinnedIds(pinnedIds);
      notify(
        err instanceof Error ? err.message : "Could not update formula pin.",
        true,
      );
    } finally {
      setPinningId(null);
    }
  }

  async function handleDiscoverParse() {
    if (!discoverQuery.trim() || discoverLoading) return;
    setDiscoverLoading(true);
    try {
      const res = await api<{ blueprint: DiscoverBlueprint }>("/api/x1/workspace", {
        action: "parse-discover",
        query: discoverQuery.trim(),
      });
      setDiscoverBlueprint(res.blueprint);
      if (res.blueprint.formula) {
        setAdvancedFormula(res.blueprint.formula);
        const parsed = treeFromFormula(res.blueprint.formula);
        if (parsed) setTree(parsed);
        if (!nameEditedManually) {
          setName(
            res.blueprint.humanSummary
              ? res.blueprint.humanSummary.slice(0, 60)
              : "Discover Rule Scan",
          );
        }
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not parse query.",
        true,
      );
    } finally {
      setDiscoverLoading(false);
    }
  }

  function handleCancelScan() {
    if (!busy) return;
    invalidatePendingRun();
    setScanError(
      "Stopped waiting in this tab. If the server had already finished saving the scan, it will appear in GRAVEYARD after refresh.",
    );
  }

  async function executeScan() {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (lock.current || busy) return;

    const cleanName =
      name.trim() ||
      (scanTier === "CLASSIC"
        ? defaultSoulNameForPreset(activePreset)
        : "Custom Advanced Scan");
    if (cleanName !== name) setName(cleanName);

    if (scanSource === "MY_WATCHLIST" && watchlistItems.length === 0) {
      setScanPhase("BLOCKED");
      setScanError(
        "Your Watchlist is empty. Add instruments to your Watchlist or switch Scan Source to Market.",
      );
      return;
    }
    if (scanSource === "CUSTOM_CSV" && !customCsv.trim()) {
      setScanPhase("BLOCKED");
      setScanError("Paste or upload dated daily CSV bars before running a Private CSV scan.");
      return;
    }

    if (!formulaCompile.ok) {
      setScanPhase("BLOCKED");
      setScanError(formulaCompile.error);
      return;
    }

    const autoDescription =
      scanTier === "CLASSIC"
        ? `${activePreset.label}${isClassicCustomized ? " (Customized)" : ""}: ${effectiveFormula}`
        : `Advanced rule evaluation for ${cleanName}: ${effectiveFormula}`.slice(0, 1900);

    const requestDef: ResearchDefinition = {
      name: cleanName.length >= 3 ? cleanName : `${cleanName} Scan`,
      description:
        autoDescription.length >= 10
          ? autoDescription
          : `Deterministic scan evaluation for ${cleanName}.`,
      formula: effectiveFormula,
      mode: scanTier === "CLASSIC" ? "SIMPLE" : "ADVANCED",
      universe: scanUniverseForPreset(scanSource),
      universePreset: scanSource,
      ...(scanSource === "MY_WATCHLIST" && activeWatchlist
        ? { watchlistId: activeWatchlist.id }
        : {}),
      interval,
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: DEFAULT_OUTCOME,
      instrumentIds: scopedInstrument ? [scopedInstrument] : [],
    };

    try {
      validateResearch(requestDef as unknown as Record<string, unknown>);
    } catch (err) {
      setScanPhase("BLOCKED");
      setScanError((err as Error).message);
      return;
    }

    lock.current = true;
    setBusy(true);
    setScanPhase("RUNNING");
    setScanError("");
    setRunningContext({
      name: requestDef.name,
      sourceLabel: scopedInstrument || sourceBadgeLabel(scanSource),
      timeframeLabel: TIMEFRAME_LABEL[interval] ?? interval,
    });
    const seq = ++runSeqRef.current;
    scanAbortRef.current?.abort();
    const ctrl = new AbortController();
    scanAbortRef.current = ctrl;

    try {
      const res = await api<{
        id: string;
        results?: { matches?: number };
      }>(
        "/api/strategy/scan",
        {
          action: "run-scan",
          scanRequestVersion: SCAN_REQUEST_VERSION,
          scanTier,
          origin: scanTier === "CLASSIC" ? "CLASSIC" : advancedEntry,
          ...requestDef,
          ...(scanSource === "CUSTOM_CSV" ? { customCsv } : {}),
          requestId: crypto.randomUUID(),
        },
        { signal: ctrl.signal },
      );
      if (seq !== runSeqRef.current) return;
      await reload();
      if (seq !== runSeqRef.current) return;
      setSelectedScanId(res.id);
      setJustCompletedId(res.id);
      setScanPhase(
        (res.results?.matches ?? 0) > 0 ? "COMPLETE" : "NO_MATCHES",
      );
      notify("Scan completed and archived to GRAVEYARD.");
    } catch (err) {
      if (seq !== runSeqRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : "Scan could not complete right now. Please try again.";
      setScanPhase(
        /allowance|not yet active|unavailable|requires|does not publish/i.test(msg)
          ? "BLOCKED"
          : "FAILED",
      );
      setScanError(msg);
      notify(msg, true);
    } finally {
      if (seq === runSeqRef.current) {
        lock.current = false;
        setBusy(false);
        setRunningContext(null);
      }
    }
  }

  async function publishScanToCommunity(scan: ScanRun) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (publishingId) return;
    setPublishingId(scan.id);
    try {
      await api("/api/community/network", {
        action: "publish-soul",
        scanId: scan.id,
        title: scan.name,
        audience: "PUBLIC",
      });
      triggerGoFeedback(
        "Soul published",
        `publish-${scan.id}-${crypto.randomUUID()}`,
      );
      notify("Soul published to Community.");
      onOpenCommunityWeb?.();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "This scan could not be published.",
        true,
      );
    } finally {
      setPublishingId(null);
    }
  }

  const graveyardScans = useMemo(() => {
    const q = graveyardQuery.trim().toLowerCase();
    return scans.filter((s) => {
      const isRetired = s.reviewState === "RETIRED";
      const isClassic = s.mode === "SIMPLE";
      if (graveyardFilter === "CLASSIC" && !isClassic) return false;
      if (graveyardFilter === "ADVANCED" && isClassic) return false;
      if (graveyardFilter === "RETIRED" && !isRetired) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.payload.rule?.formula ?? "").toLowerCase().includes(q)
      );
    });
  }, [scans, graveyardFilter, graveyardQuery]);

  const quota = workspace?.scanQuota;
  const classicRemaining = quota?.classic.remaining ?? 20;
  const classicLimit = quota?.classic.limit ?? 20;
  const isDrawMode = scanTier === "ADVANCED" && advancedEntry === "DRAW";

  const scopeAndTimeframeControls = (
    <>
      {/* Scan Source: Market default + Watchlist + expandable scopes */}
      <div className="x54-field-group">
        <div className="x54-field-label">
          <span>Scan Source</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="x1-caption">
              {scopedInstrument
                ? scopedInstrument
                : scanSource === "MARKET"
                  ? "NSE · BSE · MCX"
                  : scanSource === "MY_WATCHLIST"
                    ? `${watchlistItems.length} symbol${watchlistItems.length === 1 ? "" : "s"}`
                    : SCAN_UNIVERSE_LABEL[scanSource]}
            </span>
            <button
              type="button"
              className="x1-text-button"
              style={{ padding: "2px 4px", fontSize: "0.78rem" }}
              aria-expanded={moreScopesOpen}
              onClick={() => setMoreScopesOpen((v) => !v)}
            >
              {moreScopesOpen ? "Fewer scopes" : "More scopes"}
            </button>
          </div>
        </div>

        {scopedInstrument && (
          <div className="ss-v31-scope-chip" role="status">
            <span>Scoped to <strong>{scopedInstrument}</strong></span>
            <button
              type="button"
              className="x1-text-button"
              style={{ padding: "2px 6px", fontSize: "0.78rem" }}
              onClick={() => {
                setScopedInstrument("");
                if (scanSource === "ECB_DAILY") setScanSource("MARKET");
              }}
            >
              Scan all
            </button>
          </div>
        )}

        <div
          className="ss-v3-source-grid"
          role="group"
          aria-label="Primary scan source"
        >
          <button
            type="button"
            aria-pressed={scanSource === "MY_WATCHLIST"}
            className={
              "ss-v3-seg-btn" +
              (scanSource === "MY_WATCHLIST" ? " is-active" : "")
            }
            onClick={() => handleScopeChange("MY_WATCHLIST")}
          >
            Watchlist
          </button>
          <button
            type="button"
            aria-pressed={scanSource === "MARKET"}
            className={
              "ss-v3-seg-btn" + (scanSource === "MARKET" ? " is-active" : "")
            }
            onClick={() => handleScopeChange("MARKET")}
          >
            Market
          </button>
        </div>

        {moreScopesOpen && (
          <div
            className="ss-v31-extra-scopes"
            role="group"
            aria-label="Additional scan scopes"
          >
            {EXTRA_SCOPES.map((sc) => (
              <button
                key={sc.id}
                type="button"
                aria-pressed={scanSource === sc.id}
                className={
                  "ss-v31-scope-pill" + (scanSource === sc.id ? " is-active" : "")
                }
                onClick={() => handleScopeChange(sc.id)}
              >
                {sc.label}
              </button>
            ))}
          </div>
        )}

        {scanSource === "MY_WATCHLIST" && watchlists.length > 1 && (
          <select
            id="ss-v31-watchlist-select"
            name="watchlistId"
            aria-label="Choose watchlist"
            className="x54-name-input"
            value={activeWatchlist?.id ?? ""}
            onChange={(e) => setWatchlistId(e.target.value)}
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.payload.items?.length ?? 0})
              </option>
            ))}
          </select>
        )}

        {scanSource === "MY_WATCHLIST" && watchlistItems.length === 0 && (
          <div className="x54-quota-popover" role="note">
            <div>
              Your Watchlist is empty. Add instruments to scan your Watchlist, or
              switch directly to Market.
            </div>
            <div className="x1-actions" style={{ marginTop: 8, gap: 8 }}>
              <button
                type="button"
                className="x1-secondary"
                onClick={() => handleScopeChange("MARKET")}
              >
                Switch to Market
              </button>
              {onOpenWatchlist && (
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={onOpenWatchlist}
                >
                  Open Watchlist
                </button>
              )}
            </div>
          </div>
        )}

        {scanSource === "CUSTOM_CSV" && (
          <div className="x54-field-group" style={{ marginTop: 6 }}>
            <label className="x1-caption" htmlFor="ss-v31-custom-csv">
              Paste daily OHLCV CSV (columns: symbol,date,open,high,low,close,volume)
            </label>
            <textarea
              id="ss-v31-custom-csv"
              name="customCsv"
              rows={3}
              className="x54-name-input"
              style={{
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: "0.8rem",
              }}
              value={customCsv}
              onChange={(e) => setCustomCsv(e.target.value)}
              placeholder="symbol,date,open,high,low,close,volume"
            />
          </div>
        )}
      </div>

      {/* Timeframe: 30m, 1 Hour, Daily, Weekly, Monthly */}
      <div className="x54-field-group">
        <div className="x54-field-label">
          <span>Timeframe</span>
          {dailyOnlyScope && (
            <span className="x1-caption">Daily bars only for this source</span>
          )}
        </div>
        <div
          className="ss-v31-tf-grid"
          role="group"
          aria-label="Scan timeframe"
        >
          {TIMEFRAME_OPTIONS.map((tf) => {
            const disabled =
              dailyOnlyScope && (tf.value === "30m" || tf.value === "1h");
            return (
              <button
                key={tf.value}
                type="button"
                disabled={disabled}
                aria-pressed={interval === tf.value}
                title={
                  disabled
                    ? `${tf.label} requires an intraday exchange feed`
                    : tf.label
                }
                className={
                  "ss-v3-seg-btn" + (interval === tf.value ? " is-active" : "")
                }
                onClick={() => {
                  invalidatePendingRun();
                  setInterval(tf.value);
                  setScanError("");
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="x53-focused-stack">
      {/* Top Strategy Section Switcher: Soul Scan vs Formula Lab */}
      <div
        className="x52-full-tabs-2"
        role="tablist"
        aria-label="Strategy tools"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === "scan"}
          className={"x52-full-tab" + (section === "scan" ? " is-active" : "")}
          onClick={() => setSection("scan")}
        >
          <IconStrategy size={18} />
          <span>Soul Scan</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "lab"}
          className={"x52-full-tab" + (section === "lab" ? " is-active" : "")}
          onClick={() => setSection("lab")}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          <span>Formula Lab</span>
        </button>
      </div>

      {section === "lab" ? (
        <Suspense
          fallback={<WorkspaceSkeleton label="Opening Formula Lab…" kind="panel" />}
        >
          <FormulaLab notify={notify} />
        </Suspense>
      ) : (
        <>
          {/* 1. SOUL SCAN BUILDER */}
          <section
            className="ss-v3-strategy-card"
            aria-labelledby="ss-v3-strategy-heading"
          >
            <div className="ss-v3-strategy-head">
              <div className="ss-v3-pw-title-row">
                <span className="ss-v3-icon-badge" aria-hidden="true">
                  <IconStrategy size={20} />
                </span>
                <div>
                  <h2 id="ss-v3-strategy-heading" className="ss-v31-heading-white">
                    Soul Scan
                  </h2>
                  <p className="ss-v31-quota-inline" aria-live="polite">
                    {scanTier === "CLASSIC"
                      ? `${classicRemaining} of ${classicLimit} scans left today`
                      : `Advanced: ${quota?.advanced.remaining ?? 1}/${quota?.advanced.limit ?? 1} available this hour`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="x54-quota-info-btn"
                onClick={() => setGuideOpen(true)}
              >
                <Info size={14} aria-hidden="true" />
                <span>Guide &amp; Limits</span>
              </button>
            </div>

            {/* 2. Classic / Advanced */}
            <div
              className="x52-full-tabs-2"
              role="group"
              aria-label="Scan mode"
              style={{ marginBottom: 0 }}
            >
              <button
                type="button"
                aria-pressed={scanTier === "CLASSIC"}
                className={
                  "x52-full-tab" + (scanTier === "CLASSIC" ? " is-active" : "")
                }
                onClick={() => selectMode("CLASSIC")}
              >
                Classic
              </button>
              <button
                type="button"
                aria-pressed={scanTier === "ADVANCED"}
                className={
                  "x52-full-tab" + (scanTier === "ADVANCED" ? " is-active" : "")
                }
                onClick={() => selectMode("ADVANCED")}
              >
                Advanced
              </button>
            </div>

            {/* 3. Soul Name (prefilled editable default; never blocks or steals focus) */}
            <div className="x54-field-group">
              <label className="x54-field-label" htmlFor="ss-v3-soul-name">
                <span>Soul Name</span>
              </label>
              <input
                id="ss-v3-soul-name"
                name="soulName"
                type="text"
                className="x54-name-input"
                value={name}
                maxLength={100}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEditedManually(true);
                }}
                placeholder="Name your Soul scan"
              />
            </div>

            {/* 4. Classic Editable Formula + Full-Width Browse Button OR Advanced Mode */}
            {scanTier === "CLASSIC" ? (
              <div className="x54-field-group">
                <div className="x54-field-label">
                  <span>Formula</span>
                  <span className="x1-caption">
                    {pinnedIds.length > 0 ? `${pinnedIds.length} pinned · ` : ""}
                    50 Classic rules
                  </span>
                </div>

                {/* Active Rule Summary Card with compact Pin & Info icons */}
                <div className="ss-v31-classic-box">
                  <div className="ss-v31-classic-box-head">
                    <div className="ss-v31-classic-meta">
                      <div className="x54-formula-card-head">
                        <span className="x54-formula-rank-badge">
                          {activePreset.rankCode}
                        </span>
                        <span className="x54-formula-card-title">
                          {activePreset.label}
                        </span>
                      </div>
                      <div className="x54-formula-card-meta">
                        <span className="x56-rule-type-pill">
                          {activePreset.category}
                        </span>
                        <span className="x56-rule-type-pill">
                          {activePreset.ruleType}
                        </span>
                        {isClassicCustomized && (
                          <span className="ss-v31-teal-pill">Customized</span>
                        )}
                      </div>
                    </div>
                    <div className="ss-v31-classic-icon-col">
                      <button
                        type="button"
                        className={
                          "ss-v3-pin-btn" +
                          (pinnedSet.has(activePreset.id) ? " is-pinned" : "")
                        }
                        aria-label={
                          pinnedSet.has(activePreset.id)
                            ? `Unpin ${activePreset.label}`
                            : `Pin ${activePreset.label}`
                        }
                        aria-pressed={pinnedSet.has(activePreset.id)}
                        disabled={pinningId === activePreset.id}
                        onClick={() => void togglePin(activePreset.id)}
                      >
                        <IconPin size={17} active={pinnedSet.has(activePreset.id)} />
                      </button>
                      <button
                        type="button"
                        className="ss-v3-pin-btn"
                        aria-label="Inspect formula details"
                        aria-expanded={activeInfoOpen}
                        onClick={() => setActiveInfoOpen((v) => !v)}
                      >
                        <Info size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Quick numeric parameter controls synced live to the actual AST expression */}
                  {editableClassicParams.length > 0 && (
                    <div
                      className="ss-v31-param-grid"
                      aria-label="Quick formula parameters"
                    >
                      {editableClassicParams.map((param) => (
                        <label
                          key={param.id}
                          className="ss-v31-param-field"
                          htmlFor={`ss-v31-${param.id}`}
                        >
                          <span>{param.label}</span>
                          <input
                            id={`ss-v31-${param.id}`}
                            name={param.id}
                            type="number"
                            step="any"
                            value={param.value}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              if (/^\d+(?:\.\d+)?$/.test(nextVal)) {
                                setClassicFormula((cur) =>
                                  replaceFormulaToken(cur, param, nextVal),
                                );
                                setScanError("");
                              }
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Editable validated Classic Formula input */}
                  <div className="ss-v31-formula-editor">
                    <div className="ss-v31-formula-editor-head">
                      <label htmlFor="ss-v31-classic-formula">
                        Active rule expression
                      </label>
                      <span className="x1-caption">
                        {formulaCompile.ok
                          ? `Valid · ${formulaCompile.minBars} bars min`
                          : "Check syntax"}
                      </span>
                    </div>
                    <input
                      id="ss-v31-classic-formula"
                      name="classicFormula"
                      type="text"
                      className="x54-name-input ss-v31-mono-input"
                      value={classicFormula}
                      aria-invalid={!formulaCompile.ok ? "true" : undefined}
                      onChange={(e) => {
                        setClassicFormula(e.target.value);
                        setScanError("");
                      }}
                    />
                    {!formulaCompile.ok && (
                      <p className="x54-inline-error" role="alert" style={{ margin: 0 }}>
                        {formulaCompile.error}
                      </p>
                    )}
                    {isClassicCustomized && (
                      <div className="ss-v31-formula-edit-actions">
                        <button
                          type="button"
                          className="ss-v31-tool-btn"
                          onClick={() => {
                            setClassicFormula(activePreset.formula);
                            setScanError("");
                          }}
                        >
                          <RotateCcw size={13} aria-hidden="true" />
                          <span>Reset to template</span>
                        </button>
                        <button
                          type="button"
                          className="ss-v31-tool-btn"
                          disabled={savingDraft || !formulaCompile.ok}
                          onClick={() => void saveClassicCopy()}
                        >
                          <BookmarkPlus size={13} aria-hidden="true" />
                          <span>{savingDraft ? "Saving…" : "Save copy"}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {activeInfoOpen && (
                    <div className="x56-formula-drawer" role="note">
                      <p className="x56-formula-meaning" style={{ margin: 0 }}>
                        {activePreset.shortDescription}
                      </p>
                      <div className="x56-formula-drawer-grid">
                        <span>Template default: {activePreset.formula}</span>
                        <span>Requires: {activePreset.prerequisites.join(", ")}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Large full-width Strategic Blue Browse button (zero truncation at 320px) */}
                <button
                  type="button"
                  className="ss-v31-browse-cta"
                  onClick={() => setFormulaPickerOpen(true)}
                >
                  <Layers size={16} aria-hidden="true" />
                  <span>Browse all 50 formulas</span>
                </button>
              </div>
            ) : (
              <div className="x54-advanced-pane">
                <div
                  className="x52-full-tabs-3"
                  role="group"
                  aria-label="Advanced creation style"
                  style={{ marginBottom: 4 }}
                >
                  <button
                    type="button"
                    aria-pressed={advancedEntry === "BUILD"}
                    className={
                      "x52-full-tab" +
                      (advancedEntry === "BUILD" ? " is-active" : "")
                    }
                    onClick={() => setAdvancedEntry("BUILD")}
                  >
                    <SlidersHorizontal size={15} aria-hidden="true" />
                    <span>Rule Builder</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={advancedEntry === "DISCOVER"}
                    className={
                      "x52-full-tab" +
                      (advancedEntry === "DISCOVER" ? " is-active" : "")
                    }
                    onClick={() => setAdvancedEntry("DISCOVER")}
                  >
                    <Compass size={15} aria-hidden="true" />
                    <span>Discover</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={advancedEntry === "DRAW"}
                    className={
                      "x52-full-tab" +
                      (advancedEntry === "DRAW" ? " is-active" : "")
                    }
                    onClick={() => setAdvancedEntry("DRAW")}
                  >
                    <PenTool size={15} aria-hidden="true" />
                    <span>Pattern</span>
                  </button>
                </div>

                {advancedEntry === "DISCOVER" && (
                  <div className="x54-field-group">
                    <label className="x54-field-label" htmlFor="ss-v3-discover">
                      <span>Describe your setup</span>
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        id="ss-v3-discover"
                        name="discoverQuery"
                        type="text"
                        className="x54-name-input"
                        value={discoverQuery}
                        onChange={(e) => setDiscoverQuery(e.target.value)}
                        placeholder="e.g. RSI below 35 and price above 200 SMA"
                      />
                      <button
                        type="button"
                        className="x1-secondary"
                        disabled={discoverLoading || !discoverQuery.trim()}
                        onClick={() => void handleDiscoverParse()}
                      >
                        <Sparkles size={15} aria-hidden="true" />
                        <span>{discoverLoading ? "Parsing…" : "Build"}</span>
                      </button>
                    </div>
                    <div className="x51-chip-row">
                      {DISCOVER_EXAMPLES.slice(0, 3).map((ex) => (
                        <button
                          key={ex.title}
                          type="button"
                          className="x51-chip"
                          onClick={() => setDiscoverQuery(ex.query)}
                        >
                          {ex.title}
                        </button>
                      ))}
                    </div>
                    {discoverBlueprint && (
                      <div className="x56-formula-drawer">
                        <strong>Generated formula</strong>
                        <code className="x56-formula-drawer-code">
                          {discoverBlueprint.formula}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                {isDrawMode ? (
                  <>
                    {/* In Pattern Scan mode, Source & Timeframe sit above Canvas so Find Similar Patterns is the final bottom CTA */}
                    {scopeAndTimeframeControls}
                    <Suspense
                      fallback={
                        <WorkspaceSkeleton label="Opening Pattern Scan…" kind="panel" />
                      }
                    >
                      <PatternDrawCanvas
                        authenticated={authenticated}
                        onRequireAuth={onRequireAuth}
                        scanName={name}
                        universe={scanUniverseForPreset(scanSource)}
                        universePreset={scanSource}
                        watchlistId={
                          scanSource === "MY_WATCHLIST" ? activeWatchlist?.id : undefined
                        }
                        interval={interval}
                        customCsv={scanSource === "CUSTOM_CSV" ? customCsv : undefined}
                        instrumentIds={scopedInstrument ? [scopedInstrument] : undefined}
                        savedPatterns={workspace?.savedPatterns ?? []}
                        onPatternSaved={reload}
                        busy={busy}
                        onScanComplete={async (res) => {
                          await reload();
                          setSelectedScanId(res.id);
                          setJustCompletedId(res.id);
                          setScanPhase(
                            (res.drawReport?.matches?.length ?? 0) > 0
                              ? "COMPLETE"
                              : "NO_MATCHES",
                          );
                        }}
                        onOpenAsset={openAsset}
                        notify={notify}
                      />
                    </Suspense>
                  </>
                ) : (
                  <>
                    <RuleEditor
                      tree={tree}
                      onChange={(nextTree) => {
                        setTree(nextTree);
                        try {
                          setAdvancedFormula(compileTree(nextTree).formula);
                        } catch {
                          /* Keep last valid formula while editing */
                        }
                      }}
                    />
                    <div className="x54-field-group">
                      <label
                        className="x54-field-label"
                        htmlFor="ss-v3-adv-formula"
                      >
                        <span>Rule expression</span>
                      </label>
                      <textarea
                        id="ss-v3-adv-formula"
                        name="advancedFormula"
                        rows={2}
                        className="x54-name-input ss-v31-mono-input"
                        value={advancedFormula}
                        onChange={(e) => {
                          setAdvancedFormula(e.target.value);
                          setScanError("");
                        }}
                      />
                      {!formulaCompile.ok && (
                        <p className="x54-inline-error" role="alert">
                          {formulaCompile.error}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 5 & 6. Scope & Timeframe (placed here for Classic, Build & Discover) */}
            {!isDrawMode && scopeAndTimeframeControls}

            {scanError && (
              <div className="x1-callout" role="alert" style={{ margin: 0 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>
                    {scanPhase === "BLOCKED"
                      ? "Scan unavailable · 0 quota charged"
                      : scanPhase === "CANCELED"
                        ? "Scan wait canceled"
                        : "Scan could not complete"}
                  </strong>
                  <div style={{ marginTop: 4 }}>{scanError}</div>
                </div>
                <button
                  type="button"
                  className="x1-secondary"
                  disabled={busy}
                  onClick={() => void executeScan()}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>Retry scan</span>
                </button>
              </div>
            )}

            {/* 7. Primary Run Scan CTA + Cancel during active request */}
            {!isDrawMode && (
              <div className="ss-v31-run-row">
                <button
                  type="button"
                  className="ss-v3-run-cta"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void executeScan()}
                >
                  <span>{busy ? "Scanning completed bars…" : "Run Scan"}</span>
                  {!busy && <ArrowRight size={17} aria-hidden="true" />}
                </button>
                {busy && (
                  <button
                    type="button"
                    className="x1-secondary ss-v31-cancel-btn"
                    onClick={handleCancelScan}
                  >
                    <X size={15} aria-hidden="true" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 2. SCAN RESULTS (Explicit Loading State + Truthful Disjoint Breakdown) */}
          <section
            ref={resultsRef}
            className="ss-v3-results-card"
            aria-labelledby="ss-v3-results-heading"
          >
            <div>
              <h2
                id="ss-v3-results-heading"
                className="ss-v3-results-title ss-v31-heading-white"
              >
                Scan Results
              </h2>
              {busy && runningContext ? (
                <p className="ss-v3-results-context" role="status" aria-live="polite">
                  Evaluating {runningContext.name} · {runningContext.sourceLabel} ·{" "}
                  {runningContext.timeframeLabel}…
                </p>
              ) : activeScan ? (
                <p className="ss-v3-results-context">
                  {activeScan.name} ·{" "}
                  {activeScan.mode === "SIMPLE" ? "Classic" : "Advanced"} ·{" "}
                  {sourceBadgeLabel(
                    (activeScan.payload as { research?: { universePreset?: string } })
                      .research?.universePreset,
                    (activeScan.payload as { source?: string }).source,
                  )}{" "}
                  ·{" "}
                  {TIMEFRAME_LABEL[
                    (activeScan.payload as { research?: { interval?: string } })
                      .research?.interval ??
                      activeScan.payload.interval ??
                      "1d"
                  ] ?? "Daily"}{" "}
                  · {moment(activeScan.payload.results?.asOf ?? activeScan.created_at)}
                </p>
              ) : (
                <p className="ss-v3-results-context">
                  Run a scan above to see matching instruments here.
                </p>
              )}
            </div>

            {busy ? (
              <WorkspaceSkeleton
                label="Fetching authorized bars and evaluating rule…"
                kind="panel"
              />
            ) : activeScan ? (
              (() => {
                const res = activeScan.payload.results;
                const matched = (res?.results ?? []).filter(
                  (r) => r.status === "PASS",
                );
                const nonMatchCount = res?.failed ?? 0;
                const unknownCount = res?.unknown ?? 0;
                const accounting = (
                  activeScan.payload as {
                    preflight?: {
                      accounting?: {
                        discovered?: number;
                        deferred?: number;
                        excluded?: number;
                        coveragePct?: number;
                      };
                    };
                  }
                ).preflight?.accounting;
                const deferredCount = accounting?.deferred ?? 0;
                const excludedCount = Math.max(
                  0,
                  (accounting?.excluded ?? 0) - deferredCount,
                );
                const scanInterval =
                  (activeScan.payload as { research?: { interval?: string } })
                    .research?.interval ??
                  activeScan.payload.interval ??
                  "1d";
                const isAdvanced = activeScan.mode !== "SIMPLE";

                return (
                  <>
                    <div className="ss-v3-results-count">
                      {matched.length === 0
                        ? "0 instruments matched"
                        : `${matched.length} instrument${matched.length === 1 ? "" : "s"} matched`}
                    </div>

                    {/* Truthful Disjoint Breakdown (never labels non-matches as "Failed"!) */}
                    <div className="ss-v31-breakdown-row" aria-label="Scan coverage breakdown">
                      <span className="ss-v31-stat-chip is-pos">
                        Matched: {matched.length}
                      </span>
                      <span className="ss-v31-stat-chip">
                        Did not match: {nonMatchCount}
                      </span>
                      {unknownCount > 0 && (
                        <span className="ss-v31-stat-chip">
                          Insufficient data: {unknownCount}
                        </span>
                      )}
                      {deferredCount > 0 && (
                        <span className="ss-v31-stat-chip">
                          Deferred: {deferredCount}
                        </span>
                      )}
                      {excludedCount > 0 && (
                        <span className="ss-v31-stat-chip">
                          Unavailable: {excludedCount}
                        </span>
                      )}
                      {typeof accounting?.coveragePct === "number" &&
                        accounting.discovered &&
                        accounting.discovered > 0 && (
                          <span className="ss-v31-stat-chip">
                            Coverage: {accounting.coveragePct.toFixed(0)}% (
                            {res?.eligible ?? 0}/{accounting.discovered})
                          </span>
                        )}
                    </div>

                    {matched.length > 0 ? (
                      <div className="ss-v3-match-list" role="list">
                        {matched.map((item) => {
                          const [venue, sym] = item.instrumentId.includes(":")
                            ? item.instrumentId.split(":", 2)
                            : ["MKT", item.instrumentId];
                          const barStamp = formatScanBarTimestamp(
                            item.latestEventAt,
                            scanInterval,
                          );
                          return (
                            <div
                              key={item.instrumentId}
                              role="listitem"
                              className="ss-v3-match-item"
                            >
                              <div className="ss-v3-match-row">
                                <button
                                  type="button"
                                  className="x1-text-button"
                                  style={{
                                    padding: 0,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    color: "var(--x1-text-primary)",
                                  }}
                                  onClick={() => openAsset(item.instrumentId)}
                                >
                                  <strong>{sym}</strong>
                                  <span className="x51-pill">{venue}</span>
                                </button>
                                <span className="x1-caption">
                                  {barStamp || "Latest closed bar"}
                                </span>
                              </div>
                              {isAdvanced && item.reasons?.length > 0 && (
                                <details
                                  style={{
                                    padding: "0 14px 10px",
                                    fontSize: "0.82rem",
                                    color: "var(--x1-text-secondary)",
                                  }}
                                >
                                  <summary style={{ cursor: "pointer", color: "var(--x1-title-blue)" }}>
                                    Matched conditions
                                  </summary>
                                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                    {item.reasons.slice(0, 6).map((reason, idx) => (
                                      <li key={idx}>{reason}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="x1-caption" style={{ margin: 0 }}>
                        Checked {res?.eligible ?? 0} eligible instrument
                        {(res?.eligible ?? 0) === 1 ? "" : "s"} on completed bars
                        — none satisfied the rule as of{" "}
                        {moment(res?.asOf ?? activeScan.created_at)}.
                      </p>
                    )}
                  </>
                );
              })()
            ) : (
              <Empty title="Ready for your first scan">
                Classic mode with Market and Daily is pre-configured — tap Run
                Scan above whenever you are ready.
              </Empty>
            )}
          </section>

          {/* 3. GRAVEYARD (Preserved Approved Visual DNA, Standalone Heading, Zero Subtitle) */}
          <section
            className="x53-graveyard-shell"
            aria-labelledby="ss-v3-graveyard-heading"
          >
            <div className="x53-graveyard-head">
              <div className="x53-graveyard-title-wrap">
                <span className="x53-graveyard-icon" aria-hidden="true">
                  <IconGraveyard size={22} />
                </span>
                <h2 id="ss-v3-graveyard-heading" className="x53-graveyard-title">
                  GRAVEYARD
                </h2>
              </div>
              <span className="x51-pill x51-pill-blue">
                {scans.length} saved
              </span>
            </div>

            <div className="x51-chip-row" role="group" aria-label="Filter GRAVEYARD">
              {(["ALL", "CLASSIC", "ADVANCED", "RETIRED"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={graveyardFilter === f}
                  className={
                    "x51-chip" + (graveyardFilter === f ? " is-active" : "")
                  }
                  onClick={() => setGraveyardFilter(f)}
                >
                  {f === "ALL"
                    ? "All"
                    : f === "CLASSIC"
                      ? "Classic"
                      : f === "ADVANCED"
                        ? "Advanced"
                        : "Retired"}
                </button>
              ))}
            </div>

            <input
              id="ss-v31-graveyard-search"
              name="graveyardSearch"
              type="search"
              className="x56-formula-search-input"
              aria-label="Search GRAVEYARD scans"
              placeholder="Search saved Souls or formulas…"
              value={graveyardQuery}
              onChange={(e) => setGraveyardQuery(e.target.value)}
            />

            {graveyardScans.length > 0 ? (
              <div className="x53-graveyard-list">
                {graveyardScans.map((s) => {
                  const tfKey =
                    (s.payload as { research?: { interval?: string } }).research
                      ?.interval ??
                    s.payload.interval ??
                    "1d";
                  const presetKey = (
                    s.payload as { research?: { universePreset?: string } }
                  ).research?.universePreset;
                  const srcStr = (s.payload as { source?: string }).source;
                  return (
                    <div
                      key={s.id}
                      className={
                        "x53-graveyard-card" +
                        (activeScan?.id === s.id ? " is-selected" : "")
                      }
                    >
                      <button
                        type="button"
                        className="x53-graveyard-main"
                        onClick={() => setSelectedScanId(s.id)}
                      >
                        <div className="x53-graveyard-card-top">
                          <strong>{s.name}</strong>
                          <span className="x51-pill">
                            {s.mode === "SIMPLE" ? "Classic" : "Advanced"}
                          </span>
                          <span className="x51-pill">
                            {sourceBadgeLabel(presetKey, srcStr)}
                          </span>
                          <span className="x51-pill">
                            {TIMEFRAME_LABEL[tfKey] ?? tfKey}
                          </span>
                          {s.reviewState && (
                            <span className="x51-pill x51-pill-amber">
                              {s.reviewState}
                            </span>
                          )}
                        </div>
                        <code className="x53-compact-formula">
                          {s.payload.rule?.formula ?? ""}
                        </code>
                        <span className="x1-caption">
                          {s.payload.results?.matches ?? 0} matched ·{" "}
                          {s.payload.results?.eligible ?? 0} evaluated ·{" "}
                          {moment(s.created_at)}
                        </span>
                      </button>

                      <div className="ss-v3-graveyard-actions">
                        <button
                          type="button"
                          className="x51-accent-btn"
                          style={{ minHeight: 40, padding: "0 12px", fontSize: "0.84rem" }}
                          disabled={publishingId === s.id}
                          onClick={() => void publishScanToCommunity(s)}
                        >
                          <Send size={14} aria-hidden="true" />
                          <span>
                            {publishingId === s.id
                              ? "Publishing…"
                              : "Publish Soul"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="x1-secondary"
                          style={{ minHeight: 40, padding: "0 12px", fontSize: "0.84rem" }}
                          onClick={() => setReview(s)}
                        >
                          Review Scan
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title="No archived Souls match">
                Completed Soul scans appear here automatically and stay preserved
                as immutable records.
              </Empty>
            )}
          </section>
        </>
      )}

      {/* 50-Formula Picker Modal with Pinned Section First */}
      {formulaPickerOpen && (
        <Modal
          title="Browse all 50 Classic Formulas"
          onClose={() => setFormulaPickerOpen(false)}
        >
          <div className="x56-formula-modal-shell">
            <div className="x56-formula-modal-subhead">
              <p className="x56-formula-modal-subtitle">
                Select any formula to load and customize its parameters. Pin
                favorites to keep them on top.
              </p>
              <span className="x56-formula-count-badge">
                {filteredPresets.total} of {CLASSIC_50_PRESETS.length}
              </span>
            </div>

            <div className="x56-formula-search-row">
              <input
                id="ss-v31-formula-picker-search"
                name="formulaSearch"
                type="search"
                className="x56-formula-search-input"
                aria-label="Search 50 Classic formulas"
                placeholder="Search RSI, EMA, MACD, Bollinger, Supertrend…"
                value={formulaQuery}
                onChange={(e) => setFormulaQuery(e.target.value)}
              />
              {formulaQuery && (
                <button
                  type="button"
                  className="x56-formula-search-clear"
                  onClick={() => setFormulaQuery("")}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="x56-formula-chip-bar" role="group" aria-label="Formula categories">
              <button
                type="button"
                className={
                  "x51-chip" + (formulaCategory === "ALL" ? " is-active" : "")
                }
                onClick={() => setFormulaCategory("ALL")}
              >
                All ({CLASSIC_50_PRESETS.length})
              </button>
              {CLASSIC_PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={
                    "x51-chip" + (formulaCategory === cat ? " is-active" : "")
                  }
                  onClick={() => setFormulaCategory(cat)}
                >
                  {cat} ({CLASSIC_CATEGORY_COUNTS[cat]})
                </button>
              ))}
            </div>

            <div className="x56-formula-list">
              {filteredPresets.pinned.length > 0 && (
                <>
                  <small className="x1-caption" style={{ paddingLeft: 4 }}>
                    Pinned ({filteredPresets.pinned.length})
                  </small>
                  {filteredPresets.pinned.map((p) => {
                    const isSelected = p.id === classicPresetId;
                    const isExpanded = expandedFormulaId === p.id;
                    return (
                      <div
                        key={`pin-${p.id}`}
                        className={
                          "x56-formula-item" + (isSelected ? " is-active" : "")
                        }
                      >
                        <div className="x56-formula-item-top">
                          <button
                            type="button"
                            className="x56-formula-select-btn"
                            onClick={() => {
                              applyClassicPreset(p);
                              setFormulaPickerOpen(false);
                            }}
                          >
                            <div className="x56-formula-title-row">
                              <span className="x54-formula-rank-badge">
                                {p.rankCode}
                              </span>
                              <span className="x56-formula-title">{p.label}</span>
                            </div>
                            <p className="x56-formula-meaning">{p.shortDescription}</p>
                          </button>
                          <div className="x56-formula-actions-col">
                            <button
                              type="button"
                              className="ss-v3-pin-btn is-pinned"
                              style={{ minWidth: 36, minHeight: 36, padding: 0 }}
                              aria-label={`Unpin ${p.label}`}
                              disabled={pinningId === p.id}
                              onClick={() => void togglePin(p.id)}
                            >
                              <IconPin size={16} active />
                            </button>
                            <button
                              type="button"
                              className="x56-formula-details-btn"
                              onClick={() =>
                                setExpandedFormulaId(isExpanded ? null : p.id)
                              }
                            >
                              {isExpanded ? "Hide" : "Formula"}
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="x56-formula-drawer">
                            <code className="x56-formula-drawer-code">
                              {p.formula}
                            </code>
                            <div className="x56-formula-drawer-grid">
                              <span>Min bars: {p.minBars}</span>
                              <span>{p.ruleType}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredPresets.unpinned.length > 0 && (
                    <small className="x1-caption" style={{ paddingLeft: 4, marginTop: 4 }}>
                      All Classic Formulas
                    </small>
                  )}
                </>
              )}

              {filteredPresets.unpinned.map((p) => {
                const isSelected = p.id === classicPresetId;
                const isExpanded = expandedFormulaId === p.id;
                return (
                  <div
                    key={p.id}
                    className={
                      "x56-formula-item" + (isSelected ? " is-active" : "")
                    }
                  >
                    <div className="x56-formula-item-top">
                      <button
                        type="button"
                        className="x56-formula-select-btn"
                        onClick={() => {
                          applyClassicPreset(p);
                          setFormulaPickerOpen(false);
                        }}
                      >
                        <div className="x56-formula-title-row">
                          <span className="x54-formula-rank-badge">
                            {p.rankCode}
                          </span>
                          <span className="x56-formula-title">{p.label}</span>
                        </div>
                        <p className="x56-formula-meaning">{p.shortDescription}</p>
                      </button>
                      <div className="x56-formula-actions-col">
                        <button
                          type="button"
                          className="ss-v3-pin-btn"
                          style={{ minWidth: 36, minHeight: 36, padding: 0 }}
                          aria-label={`Pin ${p.label}`}
                          disabled={pinningId === p.id}
                          onClick={() => void togglePin(p.id)}
                        >
                          <IconPin size={16} />
                        </button>
                        <button
                          type="button"
                          className="x56-formula-details-btn"
                          onClick={() =>
                            setExpandedFormulaId(isExpanded ? null : p.id)
                          }
                        >
                          {isExpanded ? "Hide" : "Formula"}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="x56-formula-drawer">
                        <code className="x56-formula-drawer-code">
                          {p.formula}
                        </code>
                        <div className="x56-formula-drawer-grid">
                          <span>Min bars: {p.minBars}</span>
                          <span>{p.ruleType}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredPresets.total === 0 && (
                <div className="x56-formula-empty">
                  <strong>No formulas matched</strong>
                  <button
                    type="button"
                    className="x1-secondary"
                    onClick={() => {
                      setFormulaQuery("");
                      setFormulaCategory("ALL");
                    }}
                  >
                    Reset search
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Consolidated Guide & Limits Modal */}
      {guideOpen && (
        <Modal title="Soul Scan Guide & Limits" onClose={() => setGuideOpen(false)}>
          <div className="x54-quota-popover" style={{ marginBottom: 14 }}>
            <strong>Daily scan allowance</strong>
            <div style={{ marginTop: 4 }}>
              Classic: {classicRemaining}/{classicLimit} scans remaining today
              (resets 00:00 IST) · Advanced: {quota?.advanced.remaining ?? 1}/
              {quota?.advanced.limit ?? 1} available per rolling 60 minutes.
            </div>
            <div className="x1-caption" style={{ marginTop: 4 }}>
              Failed, invalid, or unentitled scans release their reservation and
              never deduct quota. Valid completed scans with 0 matches count as
              1 completed scan.
            </div>
          </div>
          <p className="x1-caption" style={{ marginTop: 0 }}>
            All scans evaluate strictly on completed closed bars across your
            selected source and timeframe.
          </p>
          <div className="x3-glossary-grid">
            {RESEARCH_GLOSSARY.map((item) => (
              <div key={item.term} className="x3-glossary-item">
                <strong>{item.term}</strong>
                <p>{item.meaning}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* GRAVEYARD Review Scan Modal */}
      {review && (
        <Modal
          title={`Review Scan · ${review.name}`}
          onClose={() => setReview(null)}
        >
          <p className="x1-caption" style={{ marginTop: 0 }}>
            Reviews append a status event without altering the original archived
            scan snapshot.
          </p>
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (reviewBusy) return;
              const fields = new FormData(e.currentTarget);
              const kind = String(fields.get("kind") ?? "RETIRED");
              const note = String(fields.get("note") ?? "").trim();
              if (!note) return;
              const sig = JSON.stringify({ id: review.id, kind, note });
              if (reviewKeyRef.current?.sig !== sig) {
                reviewKeyRef.current = { sig, id: crypto.randomUUID() };
              }
              setReviewBusy(true);
              try {
                await api("/api/x1/workspace", {
                  action: "scan-review",
                  scanId: review.id,
                  kind,
                  note,
                  requestId: reviewKeyRef.current.id,
                });
                await reload();
                setReview(null);
                reviewKeyRef.current = null;
                notify("Review saved; original scan preserved.");
              } catch (err) {
                notify(
                  err instanceof Error ? err.message : "Could not save review.",
                  true,
                );
              } finally {
                setReviewBusy(false);
              }
            }}
          >
            <label>
              Status
              <select name="kind">
                <option value="RETIRED">Retired</option>
                <option value="INVALIDATED">Invalidated</option>
                <option value="REVIEWED_FAILURE">Reviewed note</option>
                <option value="RESTORED">Restore active</option>
              </select>
            </label>
            <label>
              Notes
              <textarea name="note" required maxLength={1000} />
            </label>
            <button
              type="submit"
              className="x1-primary"
              disabled={reviewBusy}
            >
              {reviewBusy ? "Saving…" : "Save review"}
              <Check size={15} />
            </button>
          </form>
          {(workspace?.scanEvents ?? [])
            .filter((e) => e.scan_id === review.id)
            .map((event) => (
              <div className="x1-review-history" key={event.id}>
                <strong>{event.kind}</strong>
                <p>{event.note}</p>
                <span>{moment(event.created_at)}</span>
              </div>
            ))}
        </Modal>
      )}
    </div>
  );
}
