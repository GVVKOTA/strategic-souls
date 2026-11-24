"use client";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Info,
  PenTool,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { compileFormula } from "../../../backend/engines/scan";
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
type UserScanSource = "MY_WATCHLIST" | "MARKET";
type UserTimeframe = "1h" | "1d" | "1wk" | "1mo";

const TIMEFRAME_OPTIONS: readonly { value: UserTimeframe; label: string }[] = [
  { value: "1h", label: "1 Hour" },
  { value: "1d", label: "Daily" },
  { value: "1wk", label: "Weekly" },
  { value: "1mo", label: "Monthly" },
];

const TIMEFRAME_LABEL: Record<string, string> = {
  "1h": "1 Hour",
  "1d": "Daily",
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

const DEFAULT_ADVANCED_FORMULA = "all(close > sma(close, 20), rsi(close, 14) < 70)";

function defaultSoulNameForPreset(preset: ClassicPreset): string {
  const short = preset.label.trim();
  return short.length <= 64 ? short : `${short.slice(0, 61)}…`;
}

function sourceBadgeLabel(rawPreset?: string, rawSource?: string): string {
  if (rawPreset === "MY_WATCHLIST" || rawSource === "Watchlist") return "Watchlist";
  if (
    rawPreset === "MARKET" ||
    rawPreset === "INDIAN_EQUITIES" ||
    rawPreset === "MCX_FUTURES"
  ) {
    return "Market";
  }
  if (rawPreset && rawPreset in SCAN_UNIVERSE_LABEL) {
    return SCAN_UNIVERSE_LABEL[rawPreset as ScanUniversePreset];
  }
  return "Market";
}

function formatScanBarTimestamp(iso: string | null | undefined, interval?: string): string {
  if (!iso) return "";
  if (interval === "1h" || (iso.includes("T") && !iso.endsWith("T00:00:00.000Z"))) {
    return moment(iso);
  }
  return iso.slice(0, 10);
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
  initialUniversePreset,
  initialPanel,
}: Props) {
  const [section, setSection] = useState<StrategyTab>(
    initialPanel === "lab" ? "lab" : "scan",
  );
  const [scanTier, setScanTier] = useState<ScanTierMode>("CLASSIC");
  const [advancedEntry, setAdvancedEntry] = useState<AdvancedEntryMode>("BUILD");

  // Classic preset state (default-ready in 1 click)
  const initialClassic = CLASSIC_50_PRESETS[0];
  const [classicPresetId, setClassicPresetId] = useState<string>(initialClassic.id);
  const [formulaPickerOpen, setFormulaPickerOpen] = useState(false);
  const [formulaQuery, setFormulaQuery] = useState("");
  const [formulaCategory, setFormulaCategory] = useState<"ALL" | ClassicPresetCategory>("ALL");
  const [expandedFormulaId, setExpandedFormulaId] = useState<string | null>(null);
  const [activeInfoOpen, setActiveInfoOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  // Per-user D1 formula pins (optimistic with rollback)
  const [pinnedIds, setPinnedIds] = useState<string[]>(
    workspace?.pinnedFormulaIds ?? [],
  );
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Soul name (sensible prefilled editable default so 1 click runs immediately)
  const [name, setName] = useState<string>(defaultSoulNameForPreset(initialClassic));
  const [nameEditedManually, setNameEditedManually] = useState(false);

  // Advanced rule tree + formula
  const [tree, setTree] = useState<RuleTree>(DEFAULT_ADVANCED_TREE);
  const [advancedFormula, setAdvancedFormula] = useState<string>(DEFAULT_ADVANCED_FORMULA);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverBlueprint, setDiscoverBlueprint] = useState<DiscoverBlueprint | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  // Scan Source (EXACTLY Watchlist or Market; default Market)
  const [scanSource, setScanSource] = useState<UserScanSource>(
    initialUniversePreset === "MY_WATCHLIST" ? "MY_WATCHLIST" : "MARKET",
  );
  const [watchlistId, setWatchlistId] = useState<string>("");

  // Timeframe (EXACTLY 1 Hour, Daily, Weekly, Monthly; default Daily)
  const [interval, setInterval] = useState<UserTimeframe>("1d");

  // Scan execution & results state
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

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
  const reviewKeyRef = useRef<{ sig: string; id: string } | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

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

  const effectiveFormula =
    scanTier === "CLASSIC" ? activePreset.formula : advancedFormula;

  const formulaCompile = useMemo(() => {
    try {
      return { ok: true as const, compiled: compileFormula(effectiveFormula) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [effectiveFormula]);

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
    setScanError("");
    if (!nameEditedManually) {
      setName(defaultSoulNameForPreset(preset));
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
      // Roll back optimistic state cleanly on failure
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
      setScanError(
        "Your Watchlist is empty. Add instruments to your Watchlist or switch Scan Source to Market.",
      );
      return;
    }

    if (!formulaCompile.ok) {
      setScanError(formulaCompile.error);
      return;
    }

    const autoDescription =
      scanTier === "CLASSIC"
        ? `${activePreset.label}: ${activePreset.shortDescription}`
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
      instrumentIds: [],
    };

    try {
      validateResearch(requestDef as unknown as Record<string, unknown>);
    } catch (err) {
      setScanError((err as Error).message);
      return;
    }

    lock.current = true;
    setBusy(true);
    setScanError("");
    const seq = ++runSeqRef.current;

    try {
      const res = await api<{ id: string }>("/api/x1/workspace", {
        action: "run-scan",
        scanRequestVersion: SCAN_REQUEST_VERSION,
        scanTier,
        origin: scanTier === "CLASSIC" ? "CLASSIC" : advancedEntry,
        ...requestDef,
        requestId: crypto.randomUUID(),
      });
      if (seq !== runSeqRef.current) return;
      await reload();
      if (seq !== runSeqRef.current) return;
      setSelectedScanId(res.id);
      setJustCompletedId(res.id);
      notify("Scan completed and archived to GRAVEYARD.");
    } catch (err) {
      if (seq !== runSeqRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : "Scan could not complete right now. Please try again.";
      setScanError(msg);
      notify(msg, true);
    } finally {
      lock.current = false;
      setBusy(false);
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
          {/* 1. STRATEGY BUILDER */}
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
                  <h2 id="ss-v3-strategy-heading">Strategy Builder</h2>
                  <p className="x1-caption" style={{ margin: 0 }}>
                    Pick a rule, source, and timeframe — then tap Run Scan.
                  </p>
                </div>
              </div>
              <div className="x1-actions" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="x54-quota-info-btn"
                  onClick={() => setGuideOpen(true)}
                >
                  <Info size={14} aria-hidden="true" />
                  <span>Guide</span>
                </button>
                <button
                  type="button"
                  className="x54-quota-info-btn"
                  aria-expanded={policyOpen}
                  onClick={() => setPolicyOpen((v) => !v)}
                >
                  <span>Limits</span>
                </button>
              </div>
            </div>

            {policyOpen && (
              <div className="x54-quota-popover" role="note">
                <strong>Daily scan allowance</strong>
                <div style={{ marginTop: 4 }}>
                  {quota
                    ? `Classic: ${quota.classic.remaining}/${quota.classic.limit} remaining today · Advanced: ${quota.advanced.remaining}/${quota.advanced.limit} available this hour.`
                    : "Classic: 8 scans per IST day · Advanced: 1 scan per rolling 60 minutes."}
                </div>
                <div className="x1-caption" style={{ marginTop: 4 }}>
                  Failed or unavailable scans never consume your scan allowance.
                </div>
              </div>
            )}

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

            {/* 3. Soul Name (prefilled editable default) */}
            <div className="x54-field-group">
              <label className="x54-field-label" htmlFor="ss-v3-soul-name">
                <span>Soul Name</span>
              </label>
              <input
                id="ss-v3-soul-name"
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

            {/* 4. Formula Picker (Classic) OR Rule Tree + Expression (Advanced) */}
            {scanTier === "CLASSIC" ? (
              <div className="x54-field-group">
                <div className="x54-field-label">
                  <span>Formula</span>
                  <span className="x1-caption">
                    {pinnedIds.length > 0 ? `${pinnedIds.length} pinned · ` : ""}
                    50 Classic rules
                  </span>
                </div>
                <div className="ss-v3-formula-row">
                  <button
                    type="button"
                    className="x54-formula-card"
                    onClick={() => setFormulaPickerOpen(true)}
                  >
                    <div className="x54-formula-card-main">
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
                      </div>
                    </div>
                    <span className="x54-formula-card-cue">
                      <span>Browse</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </button>
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
                    <IconPin size={18} active={pinnedSet.has(activePreset.id)} />
                  </button>
                  <button
                    type="button"
                    className="ss-v3-pin-btn"
                    aria-label="Inspect formula details"
                    aria-expanded={activeInfoOpen}
                    onClick={() => setActiveInfoOpen((v) => !v)}
                  >
                    <Info size={18} aria-hidden="true" />
                  </button>
                </div>
                {activeInfoOpen && (
                  <div className="x56-formula-drawer" role="note">
                    <p className="x56-formula-meaning" style={{ margin: 0 }}>
                      {activePreset.shortDescription}
                    </p>
                    <code className="x56-formula-drawer-code">
                      {activePreset.formula}
                    </code>
                    <div className="x56-formula-drawer-grid">
                      <span>Minimum bars: {activePreset.minBars}</span>
                      <span>Requires: {activePreset.prerequisites.join(", ")}</span>
                    </div>
                  </div>
                )}
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

                {advancedEntry === "DRAW" ? (
                  <Suspense
                    fallback={
                      <WorkspaceSkeleton label="Opening Draw canvas…" kind="panel" />
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
                      busy={busy}
                      onScanComplete={async (res) => {
                        await reload();
                        setSelectedScanId(res.id);
                        setJustCompletedId(res.id);
                      }}
                      onOpenAsset={openAsset}
                      notify={notify}
                    />
                  </Suspense>
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
                        rows={2}
                        className="x54-name-input"
                        style={{
                          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                          fontSize: "0.88rem",
                        }}
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

            {/* 5. Scan Source: EXACTLY Watchlist or Market */}
            <div className="x54-field-group">
              <div className="x54-field-label">
                <span>Scan Source</span>
                <span className="x1-caption">
                  {scanSource === "MARKET"
                    ? "NSE · BSE · MCX"
                    : `${watchlistItems.length} symbol${watchlistItems.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <div
                className="ss-v3-source-grid"
                role="group"
                aria-label="Scan source"
              >
                <button
                  type="button"
                  aria-pressed={scanSource === "MY_WATCHLIST"}
                  className={
                    "ss-v3-seg-btn" +
                    (scanSource === "MY_WATCHLIST" ? " is-active" : "")
                  }
                  onClick={() => {
                    setScanSource("MY_WATCHLIST");
                    setScanError("");
                  }}
                >
                  Watchlist
                </button>
                <button
                  type="button"
                  aria-pressed={scanSource === "MARKET"}
                  className={
                    "ss-v3-seg-btn" +
                    (scanSource === "MARKET" ? " is-active" : "")
                  }
                  onClick={() => {
                    setScanSource("MARKET");
                    setScanError("");
                  }}
                >
                  Market
                </button>
              </div>

              {scanSource === "MY_WATCHLIST" && watchlists.length > 1 && (
                <select
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
                    Your Watchlist is empty. Add instruments to scan your
                    Watchlist, or switch directly to Market.
                  </div>
                  <div className="x1-actions" style={{ marginTop: 8, gap: 8 }}>
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={() => {
                        setScanSource("MARKET");
                        setScanError("");
                      }}
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
            </div>

            {/* 6. Timeframe: EXACTLY 1 Hour, Daily, Weekly, Monthly */}
            <div className="x54-field-group">
              <div className="x54-field-label">
                <span>Timeframe</span>
              </div>
              <div
                className="ss-v3-tf-grid"
                role="group"
                aria-label="Scan timeframe"
              >
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <button
                    key={tf.value}
                    type="button"
                    aria-pressed={interval === tf.value}
                    className={
                      "ss-v3-seg-btn" + (interval === tf.value ? " is-active" : "")
                    }
                    onClick={() => {
                      setInterval(tf.value);
                      setScanError("");
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {scanError && (
              <div className="x1-callout" role="alert" style={{ margin: 0 }}>
                <div style={{ marginBottom: 8 }}>{scanError}</div>
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

            {/* 7. Primary Run Scan CTA (hidden in Draw mode since Draw canvas has its own submit) */}
            {!(scanTier === "ADVANCED" && advancedEntry === "DRAW") && (
              <button
                type="button"
                className="ss-v3-run-cta"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void executeScan()}
              >
                <span>{busy ? "Scanning…" : "Run Scan"}</span>
                {!busy && <ArrowRight size={17} aria-hidden="true" />}
              </button>
            )}
          </section>

          {/* 2. SCAN RESULTS (Simple, Minimal, Uncluttered — Sec 06) */}
          <section
            ref={resultsRef}
            className="ss-v3-results-card"
            aria-labelledby="ss-v3-results-heading"
          >
            <div>
              <h2 id="ss-v3-results-heading" className="ss-v3-results-title">
                Scan Results
              </h2>
              {activeScan ? (
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

            {activeScan ? (
              (() => {
                const res = activeScan.payload.results;
                const matched = (res?.results ?? []).filter(
                  (r) => r.status === "PASS",
                );
                const unknownCount = res?.unknown ?? 0;
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
                        ? "No instruments matched"
                        : `${matched.length} instrument${matched.length === 1 ? "" : "s"} matched`}
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
                        Evaluated {res?.eligible ?? 0} instrument
                        {(res?.eligible ?? 0) === 1 ? "" : "s"} on closed bars —
                        none satisfied the rule on the latest bar.
                      </p>
                    )}

                    {unknownCount > 0 && (
                      <p className="x1-caption" style={{ margin: 0 }}>
                        {unknownCount} instrument
                        {unknownCount === 1 ? " had" : "s had"} insufficient
                        history for the selected lookback and{" "}
                        {unknownCount === 1 ? "was" : "were"} skipped cleanly.
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

          {/* 3. GRAVEYARD (Preserved Approved Visual DNA, Immediately Below Scan Results — Sec 07) */}
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
          title="Select Classic Formula"
          onClose={() => setFormulaPickerOpen(false)}
        >
          <div className="x56-formula-modal-shell">
            <div className="x56-formula-modal-subhead">
              <p className="x56-formula-modal-subtitle">
                Pin your favorite formulas to keep them at the top.
              </p>
              <span className="x56-formula-count-badge">
                {filteredPresets.total} of {CLASSIC_50_PRESETS.length}
              </span>
            </div>

            <div className="x56-formula-search-row">
              <input
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

      {/* Formula Guide Modal (replaces inline Drafts & Glossary card) */}
      {guideOpen && (
        <Modal title="Formula & Scan Guide" onClose={() => setGuideOpen(false)}>
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
