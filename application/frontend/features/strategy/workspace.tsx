"use client";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  Info,
  Layers,
  LineChart,
  PenTool,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { compileFormula, requiredScanBars } from "../../../backend/engines/scan";
import {
  CLASSIC_50_PRESETS,
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
import { IconPin, IconStrategy } from "../../components/workspace/ss-icons";
import { triggerGoFeedback } from "../../components/workspace/go-feedback";
import { ResearchInfo, RuleEditor } from "./controls";
import FormulaPickerModal from "./formula-picker-modal";
import GraveyardPanel from "./graveyard-panel";
import SoulMemoryStrip from "./soul-memory-strip";
import StrategyScopeBar, { type X3Timeframe } from "./strategy-scope-bar";
import {
  cancelMarketScan,
  fetchActiveMarketScans,
  fetchUniverseReadiness,
  resultPhase,
  waitForMarketScan,
  type MarketScanProgress,
  type UniverseReadinessView,
} from "./market-scan-client";
import {
  exportScanResultsCsv,
  extractFormulaParameters,
  formatScanBarTimestamp,
  formatScanPrice,
  formatSignedPct,
  replaceFormulaToken,
  rsiZoneBadge,
  sortScanRows,
  sourceBadgeLabel,
  type ScanSortKey,
} from "./scan-helpers";
import "./research.css";
import "./scanner-x54.css";

const FormulaLab = lazy(() => import("./formula-lab"));
const PatternDrawCanvas = lazy(() => import("./draw-canvas"));

type Props = {
  data: MarketSnapshot | null;
  workspace: WorkspaceState | null;
  authenticated?: boolean;
  sessionPending: boolean;
  isOwner?: boolean;
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
  initialWatchlistId?: string;
  initialRunId?: string;
  panel: StrategyTab;
  onPanelChange: (panel: StrategyTab) => void;
};

type StrategyTab = "scan" | "lab";
type ScanTierMode = "CLASSIC" | "ADVANCED";
type AdvancedEntryMode = "BUILD" | "DISCOVER" | "DRAW";
type UserTimeframe = X3Timeframe;
type ScanPhase =
  | "IDLE"
  | "RUNNING"
  | "COMPLETE"
  | "PARTIAL"
  | "NO_MATCHES"
  | "BLOCKED"
  | "FAILED"
  | "CANCELED";

const STRATEGY_DRAFT_STORAGE_KEY = "ss-x3-strategy-draft-v1";

const TIMEFRAME_LABEL: Record<string, string> = {
  "30m": "30m",
  "1h": "1H",
  "3h": "3H",
  "6h": "6H",
  "1d": "24H",
  "1wk": "Weekly",
  "1mo": "Monthly",
};

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

const DEFAULT_ADVANCED_FORMULA = compileTree(DEFAULT_ADVANCED_TREE).formula;

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
  sessionPending,
  isOwner = false,
  onRequireAuth,
  reload,
  notify,
  openAsset,
  onOpenCommunityWeb,
  onOpenWatchlist,
  initialFormula,
  initialInstrument,
  initialUniversePreset,
  initialWatchlistId,
  initialRunId,
  panel: section,
  onPanelChange,
}: Props) {
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

  const [name, setName] = useState("");

  // Advanced rule tree + formula
  const [tree, setTree] = useState<RuleTree>(DEFAULT_ADVANCED_TREE);
  const [advancedFormula, setAdvancedFormula] = useState<string>(DEFAULT_ADVANCED_FORMULA);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverBlueprint, setDiscoverBlueprint] = useState<DiscoverBlueprint | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  const [scopedInstrument, setScopedInstrument] = useState<string>(
    initialInstrument?.trim() ?? "",
  );
  const [chosenScope, setScanSource] = useState<"MARKET" | "MY_WATCHLIST">(
    initialUniversePreset === "MY_WATCHLIST" ? "MY_WATCHLIST" : "MARKET",
  );
  const [universeReadiness, setUniverseReadiness] = useState<UniverseReadinessView | null>(null);
  const [activeJob, setActiveJob] = useState<MarketScanProgress | null>(null);
  const [scanErrorRetryable, setScanErrorRetryable] = useState(false);
  const [soulMemoryEnabled, setSoulMemoryEnabled] = useState(true);
  const [soulMemoryRefreshNonce, setSoulMemoryRefreshNonce] = useState(0);
  const niftyReady = universeReadiness?.status === "READY";
  const exchangeAvailable = (workspace?.marketScanAvailable ?? false) || niftyReady || isOwner;
  const scanSource: ScanUniversePreset = chosenScope;
  const exchangeScopeUnavailable = !exchangeAvailable && scanSource === "MARKET";
  const [watchlistId, setWatchlistId] = useState<string>(initialWatchlistId ?? "");

  // Timeframe: strictly 30m, 1H, 3H, 6H, 24H (default 24H / 1d)
  const [interval, setInterval] = useState<UserTimeframe>("1d");

  // Restore saved guest/member draft on initial mount when no explicit formula/instrument was passed
  useEffect(() => {
    if (initialFormula || initialInstrument || initialUniversePreset) return;
    try {
      const raw = window.localStorage.getItem(STRATEGY_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        scanTier: ScanTierMode;
        classicPresetId: string;
        classicFormula: string;
        advancedFormula: string;
        chosenScope: "MARKET" | "MY_WATCHLIST";
        interval: UserTimeframe;
        name: string;
      }>;
      queueMicrotask(() => {
        if (parsed.scanTier === "CLASSIC" || parsed.scanTier === "ADVANCED") {
          setScanTier(parsed.scanTier);
        }
        if (typeof parsed.classicPresetId === "string" && findClassicPresetById(parsed.classicPresetId)) {
          setClassicPresetId(parsed.classicPresetId);
        }
        if (typeof parsed.classicFormula === "string" && parsed.classicFormula.trim()) {
          setClassicFormula(parsed.classicFormula);
        }
        if (typeof parsed.advancedFormula === "string" && parsed.advancedFormula.trim()) {
          setAdvancedFormula(parsed.advancedFormula);
        }
        if (parsed.chosenScope === "MARKET" || parsed.chosenScope === "MY_WATCHLIST") {
          setScanSource(parsed.chosenScope);
        }
        if (
          parsed.interval === "30m" ||
          parsed.interval === "1h" ||
          parsed.interval === "3h" ||
          parsed.interval === "6h" ||
          parsed.interval === "1d"
        ) {
          setInterval(parsed.interval);
        }
        if (typeof parsed.name === "string") setName(parsed.name);
      });
    } catch {
      /* Ignore storage failures */
    }
  }, [initialFormula, initialInstrument, initialUniversePreset]);

  // Persist current Strategy draft across reloads and guest sign-in handoff
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STRATEGY_DRAFT_STORAGE_KEY,
        JSON.stringify({
          scanTier,
          classicPresetId,
          classicFormula,
          advancedFormula,
          chosenScope,
          interval,
          name,
        }),
      );
    } catch {
      /* Ignore storage quota errors */
    }
  }, [scanTier, classicPresetId, classicFormula, advancedFormula, chosenScope, interval, name]);

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

  // Results analysis controls (sorting, universe snapshot toggle, quick watchlist add)
  const [resultSort, setResultSort] = useState<ScanSortKey>("move_desc");
  const [universeTableOpen, setUniverseTableOpen] = useState<boolean | null>(null);
  const [addingWatchId, setAddingWatchId] = useState<string | null>(null);

  // GRAVEYARD filters & actions
  const [graveyardFilter, setGraveyardFilter] = useState<
    "ALL" | "CLASSIC" | "ADVANCED" | "RETIRED"
  >("ALL");
  const [graveyardQuery, setGraveyardQuery] = useState("");
  const [review, setReview] = useState<ScanRun | null>(null);
  useEffect(() => {
    if (!initialRunId || !authenticated) return;
    const controller = new AbortController();
    void api<ScanRun>("/api/x1/workspace?scanId=" + encodeURIComponent(initialRunId), undefined, { signal: controller.signal })
      .then((record) => { if (!controller.signal.aborted) setReview(record); })
      .catch(() => { if (!controller.signal.aborted) notify("This saved Soul is unavailable.", true); });
    return () => controller.abort();
  }, [initialRunId, authenticated, notify]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const lock = useRef(false);
  const runSeqRef = useRef(0);
  const scanAbortRef = useRef<AbortController | null>(null);
  const reviewKeyRef = useRef<{ sig: string; id: string } | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Fetch Nifty 500 shared universe readiness & recover any in-flight durable job on mount/reload
  useEffect(() => {
    let alive = true;
    void fetchUniverseReadiness().then((status) => {
      if (alive && status) setUniverseReadiness(status);
    });
    if (!authenticated) return () => { alive = false; };
    const ctrl = new AbortController();
    void fetchActiveMarketScans()
      .then(async (jobs) => {
        const running = jobs[0];
        if (!alive || !running?.jobId || lock.current) return;
        lock.current = true;
        setBusy(true);
        setScanPhase("RUNNING");
        setActiveJob(running);
        setRunningContext({
          name: running.name || "Market Scan",
          sourceLabel: "Nifty 500",
          timeframeLabel: "Daily",
        });
        try {
          const completed = await waitForMarketScan(running, ctrl.signal, (st) => {
            if (alive) setActiveJob(st);
          });
          if (!alive) return;
          await reload();
          if (completed.id) {
            setSelectedScanId(completed.id);
            setJustCompletedId(completed.id);
          }
          setScanPhase(resultPhase(completed) as ScanPhase);
          notify("Resumed scan completed and archived to GRAVEYARD.");
        } catch (err) {
          if (!alive || ctrl.signal.aborted) return;
          setScanPhase("FAILED");
          setScanErrorRetryable(false);
          setScanError(err instanceof Error ? err.message : "Resumed scan did not complete.");
        } finally {
          if (alive) {
            lock.current = false;
            setBusy(false);
            setActiveJob(null);
            setRunningContext(null);
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [authenticated, reload, notify]);

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

  // Sync single-asset scope when launched via "Scan Asset"
  useEffect(() => {
    const clean = (initialInstrument ?? "").trim();
    if (!clean) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setScopedInstrument(clean);
      setScanSource("MARKET");
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
      const matched = findClassicPresetByFormula(clean);
      if (matched) {
        setScanTier("CLASSIC");
        setClassicPresetId(matched.id);
        setClassicFormula(matched.formula);
      } else {
        setScanTier("ADVANCED");
        setAdvancedEntry("BUILD");
        setAdvancedFormula(clean);
        const parsed = treeFromFormula(clean);
        if (parsed) setTree(parsed);
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

  const sharedSupportsIntraday = Boolean(
    universeReadiness?.eligibleTimeframes?.includes("30m") ||
      universeReadiness?.eligibleTimeframes?.includes("1h"),
  );
  const dailyOnlyScope =
    scanSource === "MARKET" && niftyReady && !isOwner && !sharedSupportsIntraday;

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

  }

  function applyClassicPreset(preset: ClassicPreset) {
    if (scanTier === "ADVANCED") {
      setAdvancedFormula(preset.formula);
      setTree(treeFromFormula(preset.formula) ?? DEFAULT_ADVANCED_TREE);
      setAdvancedEntry("BUILD");
      setScanError("");
      return;
    }
    setClassicPresetId(preset.id);
    setClassicFormula(preset.formula);
    setScanError("");
  }

  function handleScopeChange(nextScope: "MARKET" | "MY_WATCHLIST") {
    invalidatePendingRun();
    if (nextScope !== scanSource) setScopedInstrument("");
    setScanSource(nextScope);
    setScanError("");
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
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setScanError("Enter a Soul name of at least 3 characters before saving.");
      return;
    }
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
    const jobId = activeJob?.jobId;
    if (jobId) {
      void cancelMarketScan(jobId).catch(() => {});
    }
    invalidatePendingRun();
    setActiveJob(null);
    setScanErrorRetryable(false);
    setScanError(
      jobId
        ? "Scan cancelled on the server. Your scan quota was not charged."
        : "Stopped waiting in this tab. If the server had already finished saving the scan, it will appear in GRAVEYARD after refresh.",
    );
  }

  async function executeScan() {
    if (sessionPending) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (lock.current || busy) return;
    if (exchangeScopeUnavailable) return;
    if (scanSource === "NIFTY_500" && !niftyReady) {
      setScanPhase("BLOCKED");
      setScanErrorRetryable(
        universeReadiness?.status === "WARMING" || universeReadiness?.status === "RATE_LIMITED",
      );
      setScanError(
        universeReadiness?.reason ??
          "Nifty 500 requires authorized constituents and eligible historical coverage.",
      );
      return;
    }

    const enteredName = name.trim();
    const cleanName = enteredName.length >= 3 ? enteredName : "Untitled scan";

    if (scanSource === "MY_WATCHLIST" && watchlistItems.length === 0) {
      setScanPhase("BLOCKED");
      setScanError(
        "Your Watchlist is empty. Add instruments or switch to Markets.",
      );
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
      name: cleanName,
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
      const initial = await api<
        MarketScanProgress & {
          id?: string;
          results?: { matches?: number };
        }
      >(
        "/api/strategy/scan",
        {
          action: "run-scan",
          scanRequestVersion: SCAN_REQUEST_VERSION,
          scanTier,
          origin: scanTier === "CLASSIC" ? "CLASSIC" : advancedEntry,
          ...requestDef,
          requestId: crypto.randomUUID(),
        },
        { signal: ctrl.signal, timeoutMs: 65_000 },
      );
      if (seq !== runSeqRef.current) return;
      const res = initial.jobId
        ? await waitForMarketScan(initial, ctrl.signal, (status) => {
            if (seq === runSeqRef.current) setActiveJob(status);
          })
        : initial;
      if (seq !== runSeqRef.current) return;
      await reload();
      void fetchUniverseReadiness().then((status) => {
        if (status) setUniverseReadiness(status);
      });
      if (seq !== runSeqRef.current) return;
      const scanId = res.id ?? null;
      if (scanId) {
        setSelectedScanId(scanId);
        setJustCompletedId(scanId);
      }
      setSoulMemoryRefreshNonce((n) => n + 1);
      setUniverseTableOpen(null);
      setScanPhase(
        initial.jobId
          ? (resultPhase(res, initial.results?.matches) as ScanPhase)
          : (initial.results?.matches ?? 0) > 0
            ? "COMPLETE"
            : "NO_MATCHES",
      );
      notify("Scan completed and archived to GRAVEYARD.");
    } catch (err) {
      if (seq !== runSeqRef.current) return;
      const typed = err as Error & { errorCode?: string; retryable?: boolean };
      const msg =
        err instanceof Error
          ? err.message
          : "Scan could not complete right now. Please try again.";
      const persistent =
        typed?.errorCode === "MISSING_PERMISSION" ||
        typed?.errorCode === "NIFTY_UNIVERSE_UNAVAILABLE" ||
        typed?.errorCode === "INTRADAY_NOT_SUPPORTED" ||
        typed?.errorCode === "DATA_EXPIRED" ||
        /allowance|not yet active|unavailable|requires|does not publish|not yet imported|expired/i.test(msg);
      setScanPhase(persistent ? "BLOCKED" : "FAILED");
      setScanErrorRetryable(
        typeof typed?.retryable === "boolean" ? typed.retryable : !persistent,
      );
      setScanError(msg);
    } finally {
      if (seq === runSeqRef.current) {
        lock.current = false;
        setBusy(false);
        setActiveJob(null);
        setRunningContext(null);
      }
    }
  }

  async function quickAddToWatchlist(instrumentId: string) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (addingWatchId) return;
    setAddingWatchId(instrumentId);
    try {
      const targetList = activeWatchlist ?? watchlists[0] ?? null;
      if (!targetList) {
        const created = await api<{ id: string }>("/api/x1/workspace", {
          action: "create-list",
          name: "Primary Watchlist",
          requestId: crypto.randomUUID(),
        });
        await api("/api/x1/workspace", {
          action: "list-items",
          id: created.id,
          version: 1,
          items: [instrumentId],
        });
      } else {
        const existing = targetList.payload.items ?? [];
        if (existing.includes(instrumentId)) {
          notify(`${instrumentId} is already in ${targetList.name}.`);
          return;
        }
        await api("/api/x1/workspace", {
          action: "list-items",
          id: targetList.id,
          version: targetList.version,
          items: [...existing, instrumentId],
        });
      }
      await reload();
      triggerGoFeedback("Added to Watchlist", `wl-${instrumentId}-${crypto.randomUUID()}`, true);
      notify(`Added ${instrumentId} to Watchlist.`);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not add instrument to Watchlist.",
        true,
      );
    } finally {
      setAddingWatchId(null);
    }
  }

  const publishKeyRef = useRef<Map<string, string>>(new Map());

  async function publishScanToCommunity(
    scan: ScanRun,
    audience: "PUBLIC" | "FOLLOWERS" = "PUBLIC",
  ) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (publishingId) return;
    setPublishingId(scan.id);
    const cacheKey = `${scan.id}:${audience}`;
    const existingKey = publishKeyRef.current.get(cacheKey);
    const idempotencyKey =
      existingKey ??
      `pub_${scan.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 28)}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    publishKeyRef.current.set(cacheKey, idempotencyKey);
    try {
      const res = await api<{ postId?: string; replayed?: boolean }>(
        "/api/community/network",
        {
          action: "publish-soul",
          scanId: scan.id,
          title: scan.name,
          audience,
          idempotencyKey,
        },
      );
      publishKeyRef.current.delete(cacheKey);
      triggerGoFeedback(
        res.replayed ? "Soul already published" : "Soul published",
        `publish-${scan.id}-${crypto.randomUUID()}`,
      );
      notify(
        res.replayed
          ? "Soul was already published to Community."
          : "Soul published to Community.",
      );
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
  const classicAllowance = quota
    ? `${quota.classic.remaining} of ${quota.classic.limit} scans left today`
    : "Scan allowance unavailable";
  const advancedAllowance = quota
    ? `${quota.advanced.remaining} of ${quota.advanced.limit} Advanced scans available this hour`
    : "Scan allowance unavailable";
  const isDrawMode = scanTier === "ADVANCED" && advancedEntry === "DRAW";

  const scopeAndTimeframeControls = (
    <StrategyScopeBar
      scanSource={scanSource}
      onSelectSource={handleScopeChange}
      interval={interval}
      onSelectInterval={(tf) => {
        invalidatePendingRun();
        setInterval(tf);
        setScanError("");
      }}
      dailyOnlyScope={dailyOnlyScope}
      exchangeScopeUnavailable={exchangeScopeUnavailable}
      universeReadiness={universeReadiness}
      watchlists={watchlists}
      activeWatchlist={activeWatchlist}
      watchlistItemCount={watchlistItems.length}
      onSelectWatchlistId={setWatchlistId}
      onOpenWatchlist={onOpenWatchlist}
      authenticated={authenticated}
    />
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
          onClick={() => onPanelChange("scan")}
        >
          <IconStrategy size={18} />
          <span>Soul Scan</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "lab"}
          className={"x52-full-tab" + (section === "lab" ? " is-active" : "")}
          onClick={() => onPanelChange("lab")}
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
                    {scanTier === "CLASSIC" ? classicAllowance : advancedAllowance}
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

            {/* Mobile-first flow: 1. Source (Markets/Watchlist) & 2. Timeframe (30m/1H/3H/6H/24H) */}
            {scopeAndTimeframeControls}

            {/* Compact daily SOUL MEMORY status & ranking toggle */}
            <SoulMemoryStrip
              authenticated={authenticated}
              refreshNonce={soulMemoryRefreshNonce}
              enabled={soulMemoryEnabled}
              onToggle={setSoulMemoryEnabled}
            />

            {/* 3. Formula (Classic 50 editable OR Advanced) */}
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
                            min={/period|lookback|window|bars/i.test(param.label) ? 1 : 0}
                            max={/period|lookback|window|bars/i.test(param.label) ? 400 : 1000000}
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
                    <span>Draw</span>
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
                        instrumentIds={scopedInstrument ? [scopedInstrument] : undefined}
                        savedPatterns={workspace?.savedPatterns ?? []}
                        onPatternSaved={reload}
                        busy={busy || sessionPending || (authenticated && exchangeScopeUnavailable)}
                        onScanComplete={async (res) => {
                          await reload();
                          setSelectedScanId(res.id);
                          setJustCompletedId(res.id);
                          setSoulMemoryRefreshNonce((n) => n + 1);
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
                    <div className="x1-actions">
                      <button type="button" className="x1-secondary" onClick={() => setFormulaPickerOpen(true)}>
                        Browse formulas
                      </button>
                      <button type="button" className="x1-secondary" onClick={() => {
                        setTree(DEFAULT_ADVANCED_TREE); setAdvancedFormula(DEFAULT_ADVANCED_FORMULA); setScanError("");
                      }}>Reset rules</button>
                    </div>
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

            {/* 4. Soul Name */}
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
                onChange={(e) => setName(e.target.value)}
                placeholder="Name your Soul scan"
              />
            </div>

            {scanError && (
              <div className="x1-callout" role="alert" style={{ margin: 0 }}>
                <div style={{ marginBottom: scanErrorRetryable ? 8 : 0 }}>
                  <strong>
                    {scanPhase === "BLOCKED"
                      ? "Scan unavailable · 0 quota charged"
                      : scanPhase === "CANCELED"
                        ? "Scan wait canceled"
                        : "Scan could not complete"}
                  </strong>
                  <div style={{ marginTop: 4 }}>{scanError}</div>
                </div>
                {scanErrorRetryable && (
                  <button
                    type="button"
                    className="x1-secondary"
                    disabled={sessionPending || busy || (authenticated && exchangeScopeUnavailable)}
                    onClick={() => void executeScan()}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>Retry scan</span>
                  </button>
                )}
              </div>
            )}

            {/* 5. Primary Run Scan CTA (Guest CTA always enabled: "Sign in to run this scan") */}
            {!isDrawMode && (
              <div className="ss-v31-run-row">
                <button
                  type="button"
                  className="ss-v3-run-cta"
                  disabled={sessionPending || busy || (authenticated && exchangeScopeUnavailable)}
                  aria-busy={sessionPending || busy}
                  onClick={() => void executeScan()}
                >
                  <span>
                    {sessionPending
                      ? "Checking session…"
                      : !authenticated
                        ? "Sign in to run this scan"
                        : busy
                          ? "Scanning completed bars…"
                          : "Run Scan"}
                  </span>
                  {!sessionPending && !busy && <ArrowRight size={17} aria-hidden="true" />}
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
                <div className="ss-scan-running">
                <p className="ss-v3-results-context" role="status" aria-live="polite">
                  Evaluating {runningContext.name} · {runningContext.sourceLabel} ·{" "}
                  {runningContext.timeframeLabel}
                  {activeJob?.coverage
                    ? ` · ${activeJob.coverage.selected - activeJob.coverage.deferred}/${activeJob.coverage.selected} checked`
                    : "…"}
                </p>
                {activeJob?.coverage && activeJob.coverage.selected > 0 && (
                  <progress className="ss-scan-progress" aria-label="Checked instruments"
                    max={activeJob.coverage.selected}
                    value={activeJob.coverage.selected - activeJob.coverage.deferred} />
                )}
                </div>
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
                const allRows = res?.results ?? [];
                const matchedRaw = allRows.filter((r) => r.status === "PASS");
                const evaluatedRows = allRows.filter(
                  (r) => r.status === "PASS" || r.status === "FAIL",
                );
                const soulMemoryPayload = (
                  activeScan.payload as {
                    soulMemory?: {
                      status?: string;
                      rankings?: { instrumentId: string; score: number }[];
                    };
                  }
                ).soulMemory;
                const soulScoreById = new Map<string, number>();
                for (const rk of soulMemoryPayload?.rankings ?? []) {
                  soulScoreById.set(rk.instrumentId, rk.score);
                }
                const baseMatched = sortScanRows(matchedRaw, resultSort);
                const sortedMatched =
                  soulMemoryEnabled && soulScoreById.size > 0
                    ? [...baseMatched].sort(
                        (a, b) =>
                          (soulScoreById.get(b.instrumentId) ?? -1) -
                          (soulScoreById.get(a.instrumentId) ?? -1),
                      )
                    : baseMatched;
                const sortedEvaluated = sortScanRows(evaluatedRows, resultSort);
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
                const scanFormula = activeScan.payload.rule?.formula ?? "";
                const isSingleBarCross = /\bcrosses(?:above|below)\s*\(/i.test(
                  scanFormula,
                );

                // Deterministic market breadth from real evaluated bars
                let upCount = 0;
                let downCount = 0;
                let aboveEmaCount = 0;
                let emaTotal = 0;
                let rsiSum = 0;
                let rsiCount = 0;
                for (const row of evaluatedRows) {
                  const m = row.metrics;
                  if (!m) continue;
                  if (typeof m.changePct === "number") {
                    if (m.changePct > 0) upCount++;
                    else if (m.changePct < 0) downCount++;
                  }
                  if (typeof m.distEma20Pct === "number") {
                    emaTotal++;
                    if (m.distEma20Pct > 0) aboveEmaCount++;
                  }
                  if (typeof m.rsi14 === "number") {
                    rsiSum += m.rsi14;
                    rsiCount++;
                  }
                }
                const avgRsi = rsiCount > 0 ? rsiSum / rsiCount : null;
                const watchlistSet = new Set(watchlistItems);
                const showSnapshotTable =
                  universeTableOpen ?? (sortedMatched.length === 0 && sortedEvaluated.length > 0);

                return (
                  <>
                    <div className="ss-v32-results-headline">
                      <div className="ss-v3-results-count">
                        {sortedMatched.length === 0
                          ? "0 instruments matched"
                          : `${sortedMatched.length} instrument${sortedMatched.length === 1 ? "" : "s"} matched`}
                      </div>
                      {allRows.length > 0 && (
                        <div className="ss-v32-results-controls">
                          <label className="ss-v32-sort-wrap" htmlFor="ss-v32-result-sort">
                            <span className="x2-sr-only">Sort scan results</span>
                            <select
                              id="ss-v32-result-sort"
                              className="ss-v32-sort-select"
                              value={resultSort}
                              onChange={(e) => setResultSort(e.target.value as ScanSortKey)}
                            >
                              <option value="move_desc">Sort: Best Move %</option>
                              <option value="move_asc">Sort: Weakest Move %</option>
                              <option value="vol_desc">Sort: Volume Surge</option>
                              <option value="rsi_asc">Sort: RSI Low → High</option>
                              <option value="rsi_desc">Sort: RSI High → Low</option>
                              <option value="range_desc">Sort: Near 20-Bar High</option>
                              <option value="range_asc">Sort: Near 20-Bar Low</option>
                              <option value="symbol_asc">Sort: Symbol A–Z</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            className="ss-v31-tool-btn"
                            onClick={() => {
                              exportScanResultsCsv(activeScan);
                              notify("Downloaded CSV with verified scan metrics.");
                            }}
                          >
                            <Download size={14} aria-hidden="true" />
                            <span>Export CSV</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {activeScan.redaction?.applied && (
                      <p className="x1-caption" role="note" style={{ margin: "4px 0 8px" }}>
                        {activeScan.redaction.reason ||
                          "Raw exchange prices are withheld by data licence; showing permitted derived scan outcomes only."}
                      </p>
                    )}

                    {/* Truthful Disjoint Breakdown (never labels non-matches as "Failed"!) */}
                    <div className="ss-v31-breakdown-row" aria-label="Scan coverage breakdown">
                      <span className="ss-v31-stat-chip is-pos">
                        Matched: {sortedMatched.length}
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

                    {/* Market Breadth Strip derived strictly from real evaluated bars */}
                    {(upCount + downCount > 0 || emaTotal > 0 || avgRsi !== null) && (
                      <div className="ss-v32-breadth-bar" aria-label="Scanned universe breadth">
                        <span className="ss-v32-breadth-label">
                          <Activity size={14} aria-hidden="true" />
                          <span>Universe Breadth</span>
                        </span>
                        {upCount + downCount > 0 && (
                          <span className="ss-v32-breadth-item">
                            <strong className="ss-v31-delta is-pos">{upCount} Up</strong>
                            <span className="x1-caption"> · </span>
                            <strong className="ss-v31-delta is-neg">{downCount} Down</strong>
                          </span>
                        )}
                        {emaTotal > 0 && (
                          <span className="ss-v32-breadth-item">
                            <strong>{aboveEmaCount}/{emaTotal}</strong> above EMA(20)
                          </span>
                        )}
                        {avgRsi !== null && (
                          <span className="ss-v32-breadth-item">
                            Avg RSI(14): <strong>{avgRsi.toFixed(1)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {sortedMatched.length > 0 ? (
                      <div className="ss-v3-match-list" role="list">
                        {sortedMatched.map((item) => {
                          const [venue, sym] = item.instrumentId.includes(":")
                            ? item.instrumentId.split(":", 2)
                            : ["MKT", item.instrumentId];
                          const barStamp = formatScanBarTimestamp(
                            item.latestEventAt,
                            scanInterval,
                          );
                          const m = item.metrics;
                          const rsiMeta = rsiZoneBadge(m?.rsi14);
                          const inWatchlist = watchlistSet.has(item.instrumentId);
                          const proofLines = (item.reasons ?? []).slice(1);
                          const primaryProof =
                            proofLines[0] ?? item.reasons?.[0] ?? "";
                          const moveTone =
                            typeof m?.changePct === "number"
                              ? m.changePct > 0
                                ? "is-pos"
                                : m.changePct < 0
                                  ? "is-neg"
                                  : "is-flat"
                              : "is-flat";
                          const emaTone =
                            typeof m?.distEma20Pct === "number"
                              ? m.distEma20Pct > 0
                                ? "is-pos"
                                : m.distEma20Pct < 0
                                  ? "is-neg"
                                  : "is-flat"
                              : "is-flat";
                          const hasRange =
                            typeof m?.low20 === "number" &&
                            typeof m?.high20 === "number" &&
                            typeof m?.rangePosPct === "number";

                          return (
                            <article
                              key={item.instrumentId}
                              role="listitem"
                              className="ss-v3-match-item ss-v32-match-card"
                            >
                              <div className="ss-v32-match-top">
                                <div className="ss-v32-match-identity">
                                  <button
                                    type="button"
                                    className="x1-text-button ss-v32-sym-btn"
                                    onClick={() => openAsset(item.instrumentId)}
                                  >
                                    <strong>{sym}</strong>
                                    <span className="x51-pill">{venue}</span>
                                    {typeof item.patternFit === "number" && (
                                      <span className="ss-v31-teal-pill">
                                        Fit {item.patternFit.toFixed(0)}%
                                      </span>
                                    )}
                                    {soulMemoryEnabled && soulScoreById.has(item.instrumentId) && (
                                      <span
                                        className="x51-pill x51-pill-blue"
                                        title="SOUL MEMORY same-day research ranking index (0–100)"
                                      >
                                        SM {Math.round(soulScoreById.get(item.instrumentId)!)}
                                      </span>
                                    )}
                                  </button>
                                  <span className="x1-caption">
                                    {barStamp || "Latest closed bar"}
                                    {typeof m?.barsEvaluated === "number"
                                      ? ` · ${m.barsEvaluated} bars`
                                      : ""}
                                  </span>
                                </div>
                                {typeof m?.close === "number" && (
                                  <div className="ss-v32-price-col">
                                    <span className="ss-v32-price-val">
                                      {formatScanPrice(item.instrumentId, m.close)}
                                    </span>
                                    {typeof m.changePct === "number" && (
                                      <span className={`ss-v31-delta ${moveTone}`}>
                                        {formatSignedPct(m.changePct)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {primaryProof && (
                                <div className="ss-v32-proof-strip" title={primaryProof}>
                                  <code>{primaryProof}</code>
                                </div>
                              )}

                              {m && (
                                <div className="ss-v32-metrics-grid">
                                  <div className="ss-v32-metric-cell">
                                    <span className="ss-v32-metric-k">RSI (14)</span>
                                    <div className="ss-v32-metric-v-row">
                                      <strong>
                                        {typeof m.rsi14 === "number" ? m.rsi14.toFixed(1) : "—"}
                                      </strong>
                                      {rsiMeta && (
                                        <span className={`ss-v32-zone-tag is-${rsiMeta.tone}`}>
                                          {rsiMeta.label}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="ss-v32-metric-cell">
                                    <span className="ss-v32-metric-k">vs EMA (20)</span>
                                    <div className="ss-v32-metric-v-row">
                                      <strong className={`ss-v31-delta ${emaTone}`}>
                                        {formatSignedPct(m.distEma20Pct)}
                                      </strong>
                                    </div>
                                    {typeof m.ema20 === "number" && (
                                      <span className="ss-v32-metric-sub">
                                        EMA {formatScanPrice(item.instrumentId, m.ema20)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="ss-v32-metric-cell">
                                    <span className="ss-v32-metric-k">
                                      {typeof m.volRatio === "number" ? "Vol / ATR(14)" : "ATR(14) / SMA50"}
                                    </span>
                                    <div className="ss-v32-metric-v-row">
                                      {typeof m.volRatio === "number" ? (
                                        <strong
                                          className={
                                            m.volRatio >= 1.5 ? "ss-v32-vol-surge" : undefined
                                          }
                                        >
                                          {`${m.volRatio.toFixed(2)}× vol`}
                                        </strong>
                                      ) : typeof m.atrPct === "number" ? (
                                        <strong>{`ATR ${m.atrPct.toFixed(2)}%`}</strong>
                                      ) : (
                                        <strong>—</strong>
                                      )}
                                    </div>
                                    <span className="ss-v32-metric-sub">
                                      {typeof m.volRatio === "number" && typeof m.atrPct === "number"
                                        ? `ATR ${m.atrPct.toFixed(2)}%`
                                        : typeof m.sma50 === "number"
                                          ? `SMA50 ${formatScanPrice(item.instrumentId, m.sma50)}`
                                          : typeof m.atr14 === "number"
                                            ? `ATR ${formatScanPrice(item.instrumentId, m.atr14)}`
                                            : "—"}
                                    </span>
                                  </div>

                                  <div className="ss-v32-metric-cell">
                                    <span className="ss-v32-metric-k">20-Bar S/R Range</span>
                                    {hasRange ? (
                                      <>
                                        <div className="ss-v32-range-track" aria-hidden="true">
                                          <span
                                            className="ss-v32-range-fill"
                                            style={{ width: `${Math.min(100, Math.max(4, m.rangePosPct!))}%` }}
                                          />
                                        </div>
                                        <span className="ss-v32-metric-sub">
                                          {formatScanPrice(item.instrumentId, m.low20)} –{" "}
                                          {formatScanPrice(item.instrumentId, m.high20)} (
                                          {m.rangePosPct!.toFixed(0)}%)
                                        </span>
                                      </>
                                    ) : (
                                      <span className="ss-v32-metric-sub">Warm-up pending</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="ss-v32-match-actions">
                                <button
                                  type="button"
                                  className="ss-v31-tool-btn ss-v32-chart-btn"
                                  onClick={() => openAsset(item.instrumentId)}
                                >
                                  <LineChart size={14} aria-hidden="true" />
                                  <span>Open Chart</span>
                                </button>
                                <button
                                  type="button"
                                  className={
                                    "ss-v31-tool-btn" +
                                    (inWatchlist ? " is-teal-active" : "")
                                  }
                                  disabled={addingWatchId === item.instrumentId || inWatchlist}
                                  onClick={() => void quickAddToWatchlist(item.instrumentId)}
                                >
                                  {inWatchlist ? (
                                    <>
                                      <Check size={14} aria-hidden="true" />
                                      <span>In Watchlist</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={14} aria-hidden="true" />
                                      <span>
                                        {addingWatchId === item.instrumentId
                                          ? "Adding…"
                                          : "Watchlist"}
                                      </span>
                                    </>
                                  )}
                                </button>
                                {item.reasons && item.reasons.length > 1 && (
                                  <details className="ss-v32-proof-details">
                                    <summary>Rule proof ({item.reasons.length - 1})</summary>
                                    <ul>
                                      {item.reasons.slice(0, 8).map((reason, idx) => (
                                        <li key={idx}>{reason}</li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ss-v32-zero-match-box">
                        <p className="x1-caption" style={{ margin: 0 }}>
                          Checked {res?.eligible ?? 0} eligible instrument
                          {(res?.eligible ?? 0) === 1 ? "" : "s"} on completed bars
                          — none satisfied this exact rule as of{" "}
                          {moment(res?.asOf ?? activeScan.created_at)}.
                          {isSingleBarCross
                            ? " Crossover rules only fire on the exact bar of crossing."
                            : ""}
                        </p>
                        {isSingleBarCross && (
                          <div className="ss-v32-pivot-row">
                            <button
                              type="button"
                              className="ss-v31-tool-btn"
                              onClick={() => {
                                setScanTier("CLASSIC");
                                setClassicFormula("close > ema(close, 20)");
                                setScanError("");
                              }}
                            >
                              Load trend filter: close &gt; ema(close, 20)
                            </button>
                            <button
                              type="button"
                              className="ss-v31-tool-btn"
                              onClick={() => {
                                setScanTier("CLASSIC");
                                setClassicFormula("rsi(close, 14) < 50");
                                setScanError("");
                              }}
                            >
                              Load pullback: rsi(close, 14) &lt; 50
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Full Evaluated Market Snapshot Table (Actionable Technical Context for ALL Scanned Instruments) */}
                    {sortedEvaluated.length > 0 && (
                      <div className="ss-v32-snapshot-wrap">
                        <button
                          type="button"
                          className="ss-v32-snapshot-toggle"
                          aria-expanded={showSnapshotTable}
                          onClick={() => setUniverseTableOpen(!showSnapshotTable)}
                        >
                          <span>
                            Evaluated Market Snapshot ({sortedEvaluated.length}{" "}
                            {sortedEvaluated.length === 1 ? "instrument" : "instruments"})
                          </span>
                          {showSnapshotTable ? (
                            <ChevronUp size={16} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={16} aria-hidden="true" />
                          )}
                        </button>
                        {showSnapshotTable && (
                          <div className="ss-v32-table-scroll">
                            <table className="ss-v32-table">
                              <thead>
                                <tr>
                                  <th>Instrument</th>
                                  <th>Status</th>
                                  <th className="ss-v32-num">Close</th>
                                  <th className="ss-v32-num">1-Bar %</th>
                                  <th className="ss-v32-num">RSI(14)</th>
                                  <th className="ss-v32-num">vs EMA20</th>
                                  <th className="ss-v32-num">Vol ×</th>
                                  <th className="ss-v32-num">20B Pos</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedEvaluated.map((row) => {
                                  const [venue, sym] = row.instrumentId.includes(":")
                                    ? row.instrumentId.split(":", 2)
                                    : ["MKT", row.instrumentId];
                                  const m = row.metrics;
                                  const moveCls =
                                    typeof m?.changePct === "number"
                                      ? m.changePct > 0
                                        ? "is-pos"
                                        : m.changePct < 0
                                          ? "is-neg"
                                          : "is-flat"
                                      : "is-flat";
                                  const emaCls =
                                    typeof m?.distEma20Pct === "number"
                                      ? m.distEma20Pct > 0
                                        ? "is-pos"
                                        : m.distEma20Pct < 0
                                          ? "is-neg"
                                          : "is-flat"
                                      : "is-flat";
                                  return (
                                    <tr key={row.instrumentId}>
                                      <td>
                                        <button
                                          type="button"
                                          className="x1-text-button ss-v32-tbl-sym"
                                          title={`Open ${sym} chart`}
                                          onClick={() => openAsset(row.instrumentId)}
                                        >
                                          <strong>{sym}</strong>
                                          <span className="ss-v32-tbl-venue">{venue}</span>
                                        </button>
                                      </td>
                                      <td>
                                        <span
                                          className={
                                            "ss-v32-status-pill" +
                                            (row.status === "PASS" ? " is-pass" : "")
                                          }
                                        >
                                          {row.status === "PASS" ? "Match" : "Checked"}
                                        </span>
                                      </td>
                                      <td className="ss-v32-num">
                                        {formatScanPrice(row.instrumentId, m?.close)}
                                      </td>
                                      <td className={`ss-v32-num ss-v31-delta ${moveCls}`}>
                                        {formatSignedPct(m?.changePct)}
                                      </td>
                                      <td className="ss-v32-num">
                                        {typeof m?.rsi14 === "number" ? m.rsi14.toFixed(1) : "—"}
                                      </td>
                                      <td className={`ss-v32-num ss-v31-delta ${emaCls}`}>
                                        {formatSignedPct(m?.distEma20Pct)}
                                      </td>
                                      <td className="ss-v32-num">
                                        {typeof m?.volRatio === "number"
                                          ? `${m.volRatio.toFixed(2)}×`
                                          : "—"}
                                      </td>
                                      <td className="ss-v32-num">
                                        {typeof m?.rangePosPct === "number"
                                          ? `${m.rangePosPct.toFixed(0)}%`
                                          : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <Empty title="Ready for your first scan">
                {!authenticated
                  ? `Explore formulas, choose Markets or Watchlist and a timeframe (${TIMEFRAME_LABEL[interval] ?? interval}), then tap Sign in to run this scan.`
                  : exchangeScopeUnavailable
                    ? "Connected Markets history is awaiting an active exchange provider key. Switch to Watchlist or wait for sync to complete."
                    : `${scanTier === "CLASSIC" ? "Classic" : isDrawMode ? "Pattern Scan" : "Advanced"} mode with ${scanSource === "MY_WATCHLIST" ? "Watchlist" : "Markets"} and ${TIMEFRAME_LABEL[interval] ?? interval} is selected — tap ${isDrawMode ? "Find Similar Patterns" : "Run Scan"} above whenever you are ready.`}
              </Empty>
            )}
          </section>

          {/* 3. GRAVEYARD (Preserved Approved Visual DNA, Standalone Heading, Zero Subtitle) */}
          <GraveyardPanel
            totalSavedCount={scans.length}
            graveyardFilter={graveyardFilter}
            setGraveyardFilter={setGraveyardFilter}
            graveyardQuery={graveyardQuery}
            setGraveyardQuery={setGraveyardQuery}
            graveyardScans={graveyardScans}
            activeScanId={activeScan?.id ?? null}
            publishingId={publishingId}
            timeframeLabel={TIMEFRAME_LABEL}
            onSelectScan={(scanId) => {
              setSelectedScanId(scanId);
              setUniverseTableOpen(null);
            }}
            onPublishScan={(s) => void publishScanToCommunity(s)}
            onOpenReview={setReview}
          />
        </>
      )}

      {/* 50-Formula Picker Modal with Pinned Section First */}
      <FormulaPickerModal
        open={formulaPickerOpen}
        onClose={() => setFormulaPickerOpen(false)}
        formulaQuery={formulaQuery}
        setFormulaQuery={setFormulaQuery}
        formulaCategory={formulaCategory}
        setFormulaCategory={setFormulaCategory}
        filteredPresets={filteredPresets}
        classicPresetId={classicPresetId}
        expandedFormulaId={expandedFormulaId}
        setExpandedFormulaId={setExpandedFormulaId}
        pinningId={pinningId}
        onApplyPreset={applyClassicPreset}
        onTogglePin={(id) => void togglePin(id)}
      />

      {/* Consolidated Guide & Limits Modal */}
      {guideOpen && (
        <Modal title="Soul Scan Guide & Limits" onClose={() => setGuideOpen(false)}>
          <div className="x54-quota-popover" style={{ marginBottom: 14 }}>
            <strong>Daily scan allowance</strong>
            <div style={{ marginTop: 4 }}>
              {quota ? <>{classicAllowance} (resets 00:00 IST) · {advancedAllowance}.</> : classicAllowance}
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
