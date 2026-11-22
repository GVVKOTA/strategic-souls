"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Check,
  Compass,
  Copy,
  PenTool,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { compileFormula } from "../../../backend/engines/scan";
import type { SoulGenomeReport } from "../../../backend/engines/soul-genome";
import {
  CLASSIC_50_PRESETS,
  CLASSIC_PRESET_CATEGORIES,
  type ClassicPreset,
  type ClassicPresetCategory,
} from "../../../backend/services/research/classic-presets";
import {
  DISCOVER_EXAMPLES,
  type DiscoverBlueprint,
} from "../../../backend/services/research/discover-parser";
import {
  RESEARCH_GLOSSARY,
  compileTree,
  treeFromFormula,
  validateResearch,
  type RuleTree,
  type ResearchDefinition,
  type OutcomeDefinition,
  type preflightResearch,
} from "../../../backend/services/research/research";
import {
  X2_INSTRUMENTS,
  registryInstrument,
  searchCanonicalInstruments,
} from "../../../backend/services/market-data/instrument-registry";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import { TradingViewWidget } from "../../components/tradingview-widget";
import {
  Panel,
  Empty,
  Modal,
  SourceLink,
  api,
  moment,
  type WorkspaceState,
  type ScanRun,
  type Notice,
} from "../../components/workspace/shared";
import {
  RuleEditor,
  OutcomeControls,
  ResearchInfo,
  EvidencePanel,
  ReplayPanel,
  Comparison,
} from "./controls";
import FormulaLab from "./formula-lab";
import PatternDrawCanvas from "./draw-canvas";
import { ScanCoverageChart } from "./evidence-charts";
import "./research.css";

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
  initialFormula: string;
  initialInstrument?: string;
  initialUniversePreset?:
    | "INDIAN_EQUITIES"
    | "MCX_FUTURES"
    | "MY_WATCHLIST"
    | "ECB_DAILY"
    | "CUSTOM_CSV";
  initialPanel?: string;
};

type Preflight = {
  preflight: ReturnType<typeof preflightResearch>;
  pointInTime: boolean;
  source: string;
  sourceExclusions: { id: string; reason: string }[];
  redaction?: { applied: boolean; reason: string | null };
};

type Draft = {
  id: string;
  name: string;
  version: number;
  payload: {
    definition: ResearchDefinition;
    versions: {
      version: number;
      savedAt: string;
      definition: ResearchDefinition;
    }[];
  };
};

type RichRun = ScanRun & {
  redaction?: { applied: boolean; reason: string | null };
  digestVerifiableFromResponse?: boolean;
  payload: ScanRun["payload"] & {
    description?: string;
    scanTier?: "CLASSIC" | "ADVANCED";
    origin?: "CLASSIC" | "DISCOVER" | "BUILD" | "DRAW";
    research?: ResearchDefinition;
    soulGenome?: SoulGenomeReport;
  };
};

export function FinancialCalendar() {
  return (
    <Panel title="Financial calendar">
      <ResearchInfo label="Source coverage">
        Source-hosted calendars are display only. Structured official schedules
        now live in Global → Economic Calendar.
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

const defaultOutcome: OutcomeDefinition = {
  family: "POSITIVE_RETURN",
  horizon: 10,
  threshold: 0,
  target: 5,
  stop: 3,
  costBps: 0,
};

const defaultTree: RuleTree = {
  kind: "ALL",
  children: [
    { kind: "condition", rule: { field: "rsi14", op: "<", value: 40 } },
  ],
};

const TIMEFRAMES: { id: ResearchDefinition["interval"]; label: string }[] = [
  { id: "30m", label: "30 min" },
  { id: "1h", label: "1 hour" },
  { id: "1d", label: "Daily" },
  { id: "1wk", label: "Weekly" },
  { id: "1mo", label: "Monthly" },
];

function buildSampleTestCsv(): string {
  const rows = ["symbol,date,open,high,low,close,volume"];
  const specs: [string, number, number][] = [
    ["NSE:HDFCBANK", 1680, 4.5],
    ["NSE:SBIN", 1120, 3.2],
    ["NSE:RELIANCE", 1410, -2.5],
    ["NSE:TCS", 4150, 8.0],
    ["NSE:INFY", 1890, -3.0],
  ];
  const baseMs = Date.UTC(2026, 8, 1);
  for (const [sym, start, step] of specs) {
    for (let d = 0; d < 42; d++) {
      const date = new Date(baseMs + d * 86_400_000).toISOString().slice(0, 10);
      const wave = Math.sin(d * 0.45) * Math.abs(step) * 1.4;
      const close = Math.round((start + d * step + wave) * 100) / 100;
      const open = Math.round((close - step * 0.35) * 100) / 100;
      const high =
        Math.round((Math.max(open, close) + Math.abs(step) * 0.85 + 2) * 100) /
        100;
      const low =
        Math.round((Math.min(open, close) - Math.abs(step) * 0.85 - 2) * 100) /
        100;
      const vol = 150000 + d * 2800 + (d === 41 ? 180000 : 0);
      rows.push(`${sym},${date},${open},${high},${low},${close},${vol}`);
    }
  }
  return rows.join("\n");
}

function localTimeShort(iso: string | null | undefined): string {
  if (!iso) return "unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SoulGenomePanel({
  genome,
  onOpenAsset,
}: {
  genome: SoulGenomeReport;
  onOpenAsset: (id: string) => void;
}) {
  return (
    <Panel
      title="Soul Genome Evidence"
      kicker="Causal Historical Twins · Empirical Future Paths · Anti-Scan Skepticism"
    >
      <div className="x51-genome-grid">
        {/* 1. Historical Twins */}
        <div className="x51-genome-card">
          <h4>Historical Twins ({genome.historicalTwins.length})</h4>
          {genome.historicalTwins.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {genome.historicalTwins.slice(0, 6).map((t, i) => (
                <div
                  key={`${t.instrumentId}-${t.windowEndAt}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: "0.82rem",
                    borderBottom: "1px solid var(--x51-hairline)",
                    paddingBottom: 4,
                  }}
                >
                  <button
                    type="button"
                    className="x1-text-button"
                    onClick={() =>
                      onOpenAsset(t.instrumentId.replace(/^CSV:/, ""))
                    }
                  >
                    {t.instrumentId} ({t.windowEndAt.slice(0, 10)})
                  </button>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    Fit {t.patternFit} ·{" "}
                    {t.subsequentReturnPct >= 0 ? "+" : ""}
                    {t.subsequentReturnPct.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="x1-caption" style={{ margin: 0 }}>
              No purged non-overlapping historical analogues qualified on this
              series.
            </p>
          )}
        </div>

        {/* 2. Empirical Future Paths */}
        <div className="x51-genome-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <h4>Future Paths ({genome.futurePaths.horizonBars}-bar)</h4>
            <span
              className={
                genome.futurePaths.status === "CALIBRATED_EMPIRICAL"
                  ? "x51-pill x51-pill-green"
                  : "x51-pill x51-pill-amber"
              }
            >
              {genome.futurePaths.status}
            </span>
          </div>
          {genome.futurePaths.status === "CALIBRATED_EMPIRICAL" &&
          genome.futurePaths.quantilesPct ? (
            <dl className="x1-details" style={{ margin: 0 }}>
              <div>
                <dt>Sample (purged)</dt>
                <dd>n = {genome.futurePaths.sampleSize}</dd>
              </div>
              <div>
                <dt>Positive rate (Wilson 95%)</dt>
                <dd>
                  {genome.futurePaths.positiveOutcomeRatePct}% (
                  {genome.futurePaths.wilson95IntervalPct?.[0]}% –{" "}
                  {genome.futurePaths.wilson95IntervalPct?.[1]}%)
                </dd>
              </div>
              <div>
                <dt>Median / IQR</dt>
                <dd>
                  {genome.futurePaths.quantilesPct.median}% (P25{" "}
                  {genome.futurePaths.quantilesPct.p25}% · P75{" "}
                  {genome.futurePaths.quantilesPct.p75}%)
                </dd>
              </div>
              <div>
                <dt>Median Max Drawdown</dt>
                <dd>{genome.futurePaths.medianMaxAdverseExcursionPct}%</dd>
              </div>
            </dl>
          ) : (
            <p className="x1-caption" style={{ margin: 0 }}>
              {genome.futurePaths.disclosure}
            </p>
          )}
        </div>

        {/* 3. Anti-Scan Skepticism */}
        <div className="x51-genome-card">
          <h4>Anti-Scan Skepticism</h4>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: "0.82rem" }}>
            {genome.antiScan.map((chk) => (
              <li key={chk.id} style={{ marginBottom: 6 }}>
                <strong>{chk.title}</strong> ({chk.status}):{" "}
                <span className="x1-caption">{chk.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Explicit Gated R&D Modules Disclosure */}
      <details className="x1-small-details" style={{ marginTop: 12 }}>
        <summary>
          Explicitly Gated R&amp;D Modules ({genome.gatedModules.length})
        </summary>
        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
          {genome.gatedModules.map((mod) => (
            <li key={mod.name} className="x1-caption" style={{ marginBottom: 4 }}>
              <strong>{mod.name}</strong> [{mod.status}]: {mod.reason}
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

export default function ResearchWorkspace({
  workspace,
  authenticated = true,
  onRequireAuth,
  reload,
  notify,
  openAsset,
  share,
  onOpenCommunityWeb,
  initialFormula,
  initialInstrument,
  initialUniversePreset,
  initialPanel,
}: Props) {
  // Strictly 2 sub-dashboards: "Soul Scan" | "Formula Lab"
  const [panel, setPanel] = useState<"Soul Scan" | "Formula Lab">(
    initialPanel === "Formula Lab" ? "Formula Lab" : "Soul Scan",
  );
  // Inside Soul Scan ONLY: Classic | Advanced
  const [scanMode, setScanMode] = useState<"CLASSIC" | "ADVANCED">(
    initialFormula ? "ADVANCED" : "CLASSIC",
  );
  // Inside Advanced ONLY: Discover | Build | Draw
  const [advancedTab, setAdvancedTab] = useState<"DISCOVER" | "BUILD" | "DRAW">(
    initialFormula ? "BUILD" : "DISCOVER",
  );
  // Build mode sub-editor: visual block builder vs canonical formula editor
  const [buildMode, setBuildMode] = useState<"VISUAL" | "FORMULA">(
    initialFormula ? "FORMULA" : "VISUAL",
  );

  // Classic 50-preset state (selection-only — no freeform typing in Classic!)
  const [selectedClassicId, setSelectedClassicId] = useState<string>(
    CLASSIC_50_PRESETS[10].id, // Default: Close above SMA(20)
  );
  const [classicFilter, setClassicFilter] = useState("");
  const [classicCategory, setClassicCategory] = useState<
    "ALL" | ClassicPresetCategory
  >("ALL");

  // Discover state
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverBlueprint, setDiscoverBlueprint] =
    useState<DiscoverBlueprint | null>(null);
  const [discoverBusy, setDiscoverBusy] = useState(false);

  // Shared Soul definition state
  const [formula, setFormula] = useState(
    initialFormula || CLASSIC_50_PRESETS[10].formula,
  );
  const [tree, setTree] = useState<RuleTree>(defaultTree);
  const [name, setName] = useState(
    initialFormula ? "Custom Strategy Soul" : CLASSIC_50_PRESETS[10].label,
  );
  const [description, setDescription] = useState(
    CLASSIC_50_PRESETS[10].note +
      " Evaluated strictly on closed historical bars.",
  );
  const [universe, setUniverse] = useState<ResearchDefinition["universe"]>(
    initialUniversePreset === "CUSTOM_CSV" ||
      initialUniversePreset === "INDIAN_EQUITIES" ||
      initialUniversePreset === "MCX_FUTURES"
      ? "CONNECTED_MARKETS"
      : "ECB_DAILY",
  );
  const [universePreset, setUniversePreset] = useState<
    "INDIAN_EQUITIES" | "MCX_FUTURES" | "MY_WATCHLIST" | "ECB_DAILY" | "CUSTOM_CSV"
  >(initialUniversePreset || "ECB_DAILY");
  const [customCsv, setCustomCsv] = useState(
    initialUniversePreset === "CUSTOM_CSV" ? buildSampleTestCsv() : "",
  );
  const [pickerQuery, setPickerQuery] = useState("");
  const [interval, setInterval] = useState<ResearchDefinition["interval"]>("1d");
  const [instruments, setInstruments] = useState("");
  const [partialPolicy, setPartial] =
    useState<ResearchDefinition["partialPolicy"]>("ALLOW_UNKNOWN");
  const [outcome, setOutcome] = useState<OutcomeDefinition>(defaultOutcome);

  // Execution & Pipeline UX
  const [busy, setBusy] = useState("");
  const [pipelineStep, setPipelineStep] = useState<number>(0);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<{
    signature: string;
    value: Preflight;
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [review, setReview] = useState<ScanRun | null>(null);
  const [graveyardFilter, setGraveyardFilter] = useState<
    "ALL" | "CLASSIC" | "ADVANCED" | "RETIRED"
  >("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [olderRuns, setOlderRuns] = useState<ScanRun[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [draft, setDraft] = useState<{ id: string; version: number } | null>(
    null,
  );
  const [savedSignature, setSavedSignature] = useState("");

  // [06] Compact searchable Classic formula dialog
  const [formulaPickerOpen, setFormulaPickerOpen] = useState(false);

  // One-Click Post Soul + [30] Server-Validated Post Preview state
  const [postTarget, setPostTarget] = useState<ScanRun | null>(null);
  const [postAudience, setPostAudience] = useState<
    "PUBLIC" | "FOLLOWERS" | "GROUP"
  >("PUBLIC");
  const [postGroupId, setPostGroupId] = useState("");
  const [postSummary, setPostSummary] = useState("");
  const [postRiskNote, setPostRiskNote] = useState(
    "Educational research hypothesis on historical observations only; not financial advice.",
  );
  const [postBusy, setPostBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [postPreview, setPostPreview] = useState<{
    allowed: boolean;
    blockReason: string | null;
    preview: {
      authorHandle: string;
      authorDisplayName: string;
      title: string;
      summary: string;
      audience: string;
      mode: string;
      formula: string;
      timeframe: string;
      universeLabel: string;
      matchedSymbols: string[];
      evidenceStatus: string;
      sourceAttribution: string;
      riskNote: string;
      redactionsApplied: string[];
    };
  } | null>(null);
  const [postedResultId, setPostedResultId] = useState<string | null>(null);

  const lock = useRef(false);
  const pending = useRef<{ kind: string; signature: string; id: string } | null>(
    null,
  );

  useEffect(() => {
    if (!initialPanel) return;
    queueMicrotask(() => {
      setPanel(initialPanel === "Formula Lab" ? "Formula Lab" : "Soul Scan");
    });
  }, [initialPanel]);

  useEffect(() => {
    if (!initialFormula) return;
    queueMicrotask(() => {
      setFormula(initialFormula);
      setScanMode("ADVANCED");
      setAdvancedTab("BUILD");
      setBuildMode("FORMULA");
    });
  }, [initialFormula]);

  useEffect(() => {
    if (!initialInstrument) return;
    queueMicrotask(() => {
      setInstruments(initialInstrument);
      const isEcb = initialInstrument.startsWith("ECB:");
      setUniverse(isEcb ? "ECB_DAILY" : "CONNECTED_MARKETS");
      setUniversePreset(
        isEcb
          ? "ECB_DAILY"
          : initialInstrument.startsWith("MCX:")
            ? "MCX_FUTURES"
            : "INDIAN_EQUITIES",
      );
      setPreflight(null);
    });
  }, [initialInstrument]);

  const activeClassicPreset = useMemo(
    () =>
      CLASSIC_50_PRESETS.find((p) => p.id === selectedClassicId) ??
      CLASSIC_50_PRESETS[10],
    [selectedClassicId],
  );

  const filteredClassicPresets = useMemo(() => {
    const q = classicFilter.trim().toLowerCase();
    return CLASSIC_50_PRESETS.filter((p) => {
      if (classicCategory !== "ALL" && p.category !== classicCategory) {
        return false;
      }
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q) ||
        p.formula.toLowerCase().includes(q) ||
        String(p.number) === q
      );
    });
  }, [classicFilter, classicCategory]);

  const pickerMatches = useMemo(() => {
    if (!pickerQuery.trim()) return [];
    return searchCanonicalInstruments(pickerQuery, X2_INSTRUMENTS, {
      limit: 6,
    });
  }, [pickerQuery]);

  function selectClassicPreset(preset: ClassicPreset) {
    setSelectedClassicId(preset.id);
    setFormula(preset.formula);
    setName(preset.label);
    setDescription(`${preset.note} (${preset.category} preset #${preset.number}).`);
    setPreflight(null);
  }

  function applyUniversePreset(
    next:
      | "INDIAN_EQUITIES"
      | "MCX_FUTURES"
      | "MY_WATCHLIST"
      | "ECB_DAILY"
      | "CUSTOM_CSV",
  ) {
    setUniversePreset(next);
    setPreflight(null);
    if (next === "ECB_DAILY") {
      setUniverse("ECB_DAILY");
      setInstruments("");
      setCustomCsv("");
      return;
    }
    if (next === "INDIAN_EQUITIES") {
      setUniverse("CONNECTED_MARKETS");
      setInstruments("");
      setCustomCsv("");
      return;
    }
    if (next === "MCX_FUTURES") {
      setUniverse("CONNECTED_MARKETS");
      setInstruments("MCX:GOLD04DEC26FUT, MCX:CRUDEOIL18DEC26FUT");
      setCustomCsv("");
      return;
    }
    if (next === "MY_WATCHLIST") {
      setCustomCsv("");
      const wl = workspace?.records.find((r) => r.kind === "watchlist");
      const items = (wl?.payload?.items ?? []).filter(Boolean);
      setInstruments(items.join(", "));
      const allEcb =
        items.length > 0 && items.every((i) => i.startsWith("ECB:"));
      setUniverse(allEcb ? "ECB_DAILY" : "CONNECTED_MARKETS");
      return;
    }
    if (next === "CUSTOM_CSV") {
      setUniverse("CONNECTED_MARKETS");
      setInstruments("");
      if (!customCsv.trim()) {
        setCustomCsv(buildSampleTestCsv());
      }
    }
  }

  const effectiveFormula =
    scanMode === "CLASSIC"
      ? activeClassicPreset.formula
      : advancedTab === "DISCOVER" && discoverBlueprint?.formula
        ? discoverBlueprint.formula
        : buildMode === "VISUAL"
          ? (() => {
              try {
                return compileTree(tree).formula;
              } catch {
                return formula;
              }
            })()
          : formula;

  const canonical = useMemo(() => {
    try {
      return { value: compileFormula(effectiveFormula), error: "" };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  }, [effectiveFormula]);

  const backendMode: ResearchDefinition["mode"] =
    scanMode === "CLASSIC" ? "SIMPLE" : "ADVANCED";

  const effectiveDescription =
    description.trim().length >= 10
      ? description.trim()
      : `${name.trim() || "Research Soul"} evaluated strictly on closed historical observations.`;

  const definition = useMemo(() => {
    try {
      return {
        value: validateResearch({
          name: name.trim() || activeClassicPreset.label,
          description: effectiveDescription,
          formula: canonical.value?.formula ?? effectiveFormula,
          mode: backendMode,
          universe,
          interval,
          instrumentIds: instruments.split(/[\s,]+/).filter(Boolean),
          partialPolicy,
          outcome,
        }),
        error: "",
      };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  }, [
    name,
    activeClassicPreset.label,
    effectiveDescription,
    canonical.value,
    effectiveFormula,
    backendMode,
    universe,
    interval,
    instruments,
    partialPolicy,
    outcome,
  ]);

  const signature = JSON.stringify(
    definition.value ?? {
      name,
      formula: effectiveFormula,
      mode: backendMode,
      universe,
      interval,
      instruments,
      partialPolicy,
      outcome,
    },
  );
  const [initialSignature] = useState(signature);
  const dirty = signature !== savedSignature && signature !== initialSignature;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("x2-research-dirty", { detail: dirty }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("x2-research-dirty", { detail: false }),
      );
    };
  }, [dirty]);

  const runs = [
    ...new Map(
      [...(workspace?.scans ?? []), ...olderRuns].map((r) => [r.id, r]),
    ).values(),
  ].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  const active = (runs.find((r) => r.id === selected) ?? runs[0]) as
    | RichRun
    | undefined;

  const grave = new Set(
    runs
      .filter((r) => r.reviewState && r.reviewState !== "RESTORED")
      .map((r) => r.id),
  );
  for (const event of workspace?.scanEvents ?? [])
    if (event.kind === "RESTORED") grave.delete(event.scan_id);
    else grave.add(event.scan_id);

  const filteredGraveyard = runs.filter((r) => {
    const rich = r as RichRun;
    const tier =
      rich.payload.scanTier ?? (r.mode === "SIMPLE" ? "CLASSIC" : "ADVANCED");
    if (graveyardFilter === "CLASSIC" && tier !== "CLASSIC") return false;
    if (graveyardFilter === "ADVANCED" && tier !== "ADVANCED") return false;
    if (graveyardFilter === "RETIRED" && !grave.has(r.id)) return false;
    if (!historySearch.trim()) return true;
    return (
      r.name +
      " " +
      (rich.payload.description ?? "") +
      " " +
      r.payload.rule.formula
    )
      .toLowerCase()
      .includes(historySearch.toLowerCase());
  });

  const drafts =
    (workspace as (WorkspaceState & { researchDrafts?: Draft[] }) | null)
      ?.researchDrafts ?? [];
  const nextCursor =
    olderCursor === undefined ? workspace?.scanHistoryNextBefore : olderCursor;
  const coverage = preflight?.signature === signature ? preflight.value : null;
  const quota = workspace?.scanQuota;

  function loadDefinition(
    value: ResearchDefinition,
    current: { id: string; version: number } | null = null,
  ) {
    setName(value.name);
    setDescription(value.description);
    setFormula(value.formula);
    const converted = treeFromFormula(value.formula);
    if (converted) setTree(converted);
    setScanMode("ADVANCED");
    setAdvancedTab("BUILD");
    setBuildMode(converted ? "VISUAL" : "FORMULA");
    setUniverse(value.universe);
    setInterval(value.interval);
    setInstruments(value.instrumentIds.join(", "));
    setPartial(value.partialPolicy);
    setOutcome(value.outcome);
    setDraft(current);
    setSavedSignature(current ? JSON.stringify(value) : "");
    setPanel("Soul Scan");
  }

  async function parseDiscoverIntent(rawQuery?: string) {
    const q = (rawQuery ?? discoverQuery).trim();
    if (!q) {
      notify("Enter a natural-language research hypothesis first.", true);
      return;
    }
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setDiscoverBusy(true);
    try {
      const res = await api<{ blueprint: DiscoverBlueprint }>(
        "/api/strategy/scan",
        {
          action: "parse-discover",
          query: q,
        },
      );
      setDiscoverBlueprint(res.blueprint);
      if (res.blueprint.supported && res.blueprint.formula) {
        setFormula(res.blueprint.formula);
        setName(q.slice(0, 88));
        setDescription(res.blueprint.humanSummary);
        setInterval(res.blueprint.suggestedTimeframe);
        setPreflight(null);
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not parse Discover query.",
        true,
      );
    } finally {
      setDiscoverBusy(false);
    }
  }

  async function perform(kind: "preflight" | "run" | "draft") {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (lock.current || !definition.value || !canonical.value) return;
    lock.current = true;
    setPipelineStep(kind === "run" ? 1 : 0);
    setBusy(
      kind === "preflight"
        ? "1/1 Checking source coverage…"
        : kind === "draft"
          ? "Saving draft version…"
          : "1/3 Running preflight & data checks…",
    );
    if (
      pending.current?.signature !== signature ||
      pending.current?.kind !== kind
    ) {
      pending.current = { kind, signature, id: crypto.randomUUID() };
    }
    const endpoint =
      universePreset === "CUSTOM_CSV" && customCsv.trim()
        ? "/api/strategy/scan"
        : "/api/x1/workspace";
    try {
      if (kind === "preflight") {
        const value = await api<Preflight>(endpoint, {
          action: "preflight-scan",
          ...definition.value,
          ...(universePreset === "CUSTOM_CSV" && customCsv.trim()
            ? { customCsv }
            : {}),
        });
        setPreflight({ signature, value });
        if (value.preflight.blocked) {
          notify(
            value.preflight.reason || "Data preflight blocked execution.",
            true,
          );
        } else {
          notify(
            `Coverage ready: ${value.preflight.eligible}/${value.preflight.total} eligible instruments.`,
          );
        }
      }
      if (kind === "draft") {
        const result = await api<{ id: string; version: number }>(
          "/api/x1/workspace",
          {
            action: "save-scan-draft",
            requestId: pending.current.id,
            draftId: draft?.id,
            version: draft?.version,
            definition: definition.value,
          },
        );
        setDraft(result);
        setSavedSignature(signature);
        await reload();
        notify("Draft version saved privately.");
      }
      if (kind === "run") {
        setPipelineStep(2);
        setBusy("2/3 Evaluating rules on closed historical bars…");
        const result = await api<{ id: string }>(endpoint, {
          action: "run-scan",
          requestId: pending.current.id,
          scanTier: scanMode,
          origin: scanMode === "CLASSIC" ? "CLASSIC" : advancedTab,
          ...definition.value,
          ...(universePreset === "CUSTOM_CSV" && customCsv.trim()
            ? { customCsv }
            : {}),
        });
        setPipelineStep(3);
        setBusy("3/3 Saved to Graveyard · Updating workspace…");
        setSelected(result.id);
        setJustCompletedId(result.id);
        setSavedSignature(signature);
        await reload();
        setPipelineStep(4);
        notify("Scan completed and archived immutably in Graveyard.");
      }
      pending.current = null;
    } catch (e) {
      notify((e as Error).message, true);
      setPipelineStep(0);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function loadOlder() {
    if (lock.current || !nextCursor) return;
    lock.current = true;
    setBusy("Loading older Graveyard scans…");
    try {
      const page = await api<WorkspaceState>(
        "/api/x1/workspace?scanBefore=" + encodeURIComponent(nextCursor),
      );
      setOlderRuns((current) => [
        ...new Map([...current, ...page.scans].map((r) => [r.id, r])).values(),
      ]);
      setOlderCursor(page.scanHistoryNextBefore ?? null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  function openPostSoulModal(run: ScanRun) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const rich = run as RichRun;
    setPostTarget(run);
    setPostAudience("PUBLIC");
    setPostGroupId("");
    setPostPreview(null);
    setPostedResultId(null);
    setPostSummary(
      rich.payload.description ||
        `Evaluated ${run.payload.rule.formula} across ${run.payload.results.total} instruments (${run.payload.results.matches} matched).`,
    );
  }

  async function runPostPreview() {
    if (!postTarget || previewBusy) return;
    setPreviewBusy(true);
    try {
      const res = await api<
        NonNullable<typeof postPreview> & { ok: boolean }
      >("/api/community/network", {
        action: "preview-soul",
        scanId: postTarget.id,
        audience: postAudience,
        groupId: postAudience === "GROUP" ? postGroupId.trim() : undefined,
        summary: postSummary.trim(),
      });
      setPostPreview({
        allowed: res.allowed,
        blockReason: res.blockReason,
        preview: res.preview,
      });
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not generate server post preview.",
        true,
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  async function submitPostSoul(e: React.FormEvent) {
    e.preventDefault();
    if (!postTarget || postBusy) return;
    setPostBusy(true);
    try {
      const res = await api<{ ok: boolean; postId: string; replayed?: boolean }>(
        "/api/community/network",
        {
          action: "publish-soul",
          scanId: postTarget.id,
          audience: postAudience,
          groupId: postAudience === "GROUP" ? postGroupId.trim() : undefined,
          summary: postSummary.trim(),
          riskNote: postRiskNote.trim(),
          requestId: `post_${postTarget.id}_${postAudience}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80),
        },
      );
      setPostedResultId(res.postId);
      notify(
        res.replayed
          ? "This Soul is already posted for this audience."
          : "Soul published to Community Research Network.",
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not publish Soul.",
        true,
      );
    } finally {
      setPostBusy(false);
    }
  }

  const activeMatches = active
    ? active.payload.results.results.filter((r) => r.status === "PASS")
    : [];
  const activeNonMatches = active
    ? active.payload.results.results.filter((r) => r.status !== "PASS")
    : [];

  return (
    <>
      {/* EXACTLY TWO SUB-DASHBOARDS: Full-Width 50/50 SS Blue Tabs */}
      <div className="x52-full-tabs-2" role="tablist" aria-label="Strategy sub-dashboards">
        {(["Soul Scan", "Formula Lab"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={panel === t}
            className="x52-full-tab"
            onClick={() => setPanel(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {panel === "Soul Scan" && (
        <div className="x51-global-stack">
          {/* Full-Width 50/50 SS Blue Classic | Advanced Switcher + 1-line integrated quota */}
          <div>
            <div
              className="x52-full-tabs-2"
              role="group"
              aria-label="Soul Scan mode"
              style={{ marginBottom: 4 }}
            >
              <button
                type="button"
                className="x52-full-tab"
                aria-pressed={scanMode === "CLASSIC"}
                onClick={() => {
                  setScanMode("CLASSIC");
                  setFormula(activeClassicPreset.formula);
                  setPreflight(null);
                }}
              >
                Classic
              </button>
              <button
                type="button"
                className="x52-full-tab"
                aria-pressed={scanMode === "ADVANCED"}
                onClick={() => {
                  setScanMode("ADVANCED");
                  setPreflight(null);
                }}
              >
                Advanced
              </button>
            </div>

            <div className="x52-quota-inline">
              <span>
                {scanMode === "CLASSIC"
                  ? quota
                    ? `${quota.classic.remaining}/${quota.classic.limit} Classic scans left today (IST) · resets ${localTimeShort(quota.classic.resetsAtUTC)}`
                    : "8 Classic scans / IST day · 50 verified rules"
                  : quota
                    ? quota.advanced.remaining > 0
                      ? "1/1 Advanced scan ready (rolling 60 min)"
                      : `Advanced cooldown · next eligible ${localTimeShort(quota.advanced.nextEligibleAtUTC)}`
                    : "1 Advanced scan / rolling 60 min"}
              </span>
              <span>Failed scans never deduct quota</span>
            </div>
          </div>

          <div className="x1-scan-grid">
            <Panel
              title={
                scanMode === "CLASSIC"
                  ? "Classic Soul Scan"
                  : "Advanced Soul Scan"
              }
            >
              {/* Compact Market Selector */}
              <div className="x1-label">
                <span>Market</span>
                <div className="x51-chip-row" role="group" aria-label="Scan market">
                  {(
                    [
                      ["ECB_DAILY", "ECB Daily FX"],
                      ["CUSTOM_CSV", "Private CSV"],
                      ["MY_WATCHLIST", "My Watchlist"],
                      ["INDIAN_EQUITIES", "NSE / BSE"],
                      ["MCX_FUTURES", "MCX Futures"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={
                        "x51-chip" + (universePreset === id ? " is-active" : "")
                      }
                      aria-pressed={universePreset === id}
                      onClick={() => applyUniversePreset(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {universePreset === "CUSTOM_CSV" && (
                <div className="x1-label">
                  <span>
                    Private CSV OHLCV (<code>symbol,date,open,high,low,close,volume</code> · user-supplied only)
                  </span>
                  <textarea
                    className="x1-code-editor"
                    rows={4}
                    value={customCsv}
                    aria-label="Private CSV OHLCV dataset"
                    onChange={(e) => {
                      setCustomCsv(e.target.value);
                      setPreflight(null);
                    }}
                  />
                  <div className="x1-actions">
                    <button
                      type="button"
                      className="x1-secondary"
                      style={{ minHeight: 34, fontSize: "0.8rem" }}
                      onClick={() => {
                        setCustomCsv(buildSampleTestCsv());
                        setDescription("Simulated 5-stock Indian equity test CSV fixture (non-publishable TEST DATA).");
                        setPreflight(null);
                      }}
                    >
                      Load 5-stock test CSV (non-publishable fixture)
                    </button>
                  </div>
                </div>
              )}

              {/* CLASSIC MODE [06]: Clean Compact Searchable Formula Selector */}
              {scanMode === "CLASSIC" ? (
                <>
                  <label className="x1-label">
                    Soul name
                    <input
                      value={name}
                      maxLength={100}
                      placeholder="Name your Classic Soul"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>

                  <div className="x1-label">
                    <span>Formula (50 verified rules)</span>
                    <button
                      type="button"
                      className="x52-formula-trigger"
                      aria-haspopup="dialog"
                      onClick={() => setFormulaPickerOpen(true)}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: "0.92rem" }}>
                          #{String(activeClassicPreset.number).padStart(2, "0")} · {activeClassicPreset.label}
                        </strong>
                        <span className="x1-caption">
                          {activeClassicPreset.category} · <code>{activeClassicPreset.formula}</code>
                        </span>
                      </div>
                      <span className="x51-pill x51-pill-blue">Select formula</span>
                    </button>
                  </div>

                  <div className="x1-label">
                    <span>Timeframe</span>
                    <div className="x51-chip-row" role="group" aria-label="Timeframe">
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf.id}
                          type="button"
                          className={
                            "x51-chip" + (interval === tf.id ? " is-active" : "")
                          }
                          aria-pressed={interval === tf.id}
                          onClick={() => {
                            setInterval(tf.id);
                            setPreflight(null);
                          }}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                    {(interval === "30m" || interval === "1h") && (
                      <span className="x1-caption">
                        Intraday 30m/1h requires intraday bars in Private CSV or a connected intraday feed.
                      </span>
                    )}
                  </div>
                </>
              ) : (
                /* ADVANCED MODE: Full-Width 33.3% / 33.3% / 33.3% SS Blue Tabs */
                <>
                  <div
                    className="x52-full-tabs-3"
                    role="tablist"
                    aria-label="Advanced Soul Scan modes"
                  >
                    <button
                      type="button"
                      role="tab"
                      className="x52-full-tab"
                      aria-selected={advancedTab === "DISCOVER"}
                      onClick={() => setAdvancedTab("DISCOVER")}
                    >
                      <Compass size={14} /> Discover
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="x52-full-tab"
                      aria-selected={advancedTab === "BUILD"}
                      onClick={() => setAdvancedTab("BUILD")}
                    >
                      <SlidersHorizontal size={14} /> Build
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="x52-full-tab"
                      aria-selected={advancedTab === "DRAW"}
                      onClick={() => setAdvancedTab("DRAW")}
                    >
                      <PenTool size={14} /> Draw
                    </button>
                  </div>

                  <div className="x1-label">
                    <span>Timeframe</span>
                    <div className="x51-chip-row" role="group" aria-label="Advanced timeframe">
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf.id}
                          type="button"
                          className={
                            "x51-chip" + (interval === tf.id ? " is-active" : "")
                          }
                          aria-pressed={interval === tf.id}
                          onClick={() => {
                            setInterval(tf.id);
                            setPreflight(null);
                          }}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {advancedTab === "DISCOVER" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <label className="x1-label">
                        Natural-language research question (deterministic AST
                        parser · quota-free preview)
                        <textarea
                          rows={3}
                          value={discoverQuery}
                          onChange={(e) => setDiscoverQuery(e.target.value)}
                          placeholder="Example: Find stocks trading sideways for 15 closed candles, breaking resistance on more than 1.5x volume while the daily trend is rising"
                        />
                      </label>
                      <div className="x51-chip-row" aria-label="Example prompts">
                        {DISCOVER_EXAMPLES.map((ex) => (
                          <button
                            key={ex.title}
                            type="button"
                            className="x51-chip"
                            onClick={() => {
                              setDiscoverQuery(ex.query);
                              void parseDiscoverIntent(ex.query);
                            }}
                          >
                            <Sparkles size={12} /> {ex.title}
                          </button>
                        ))}
                      </div>
                      <div className="x1-actions">
                        <button
                          type="button"
                          className="x51-accent-btn"
                          disabled={discoverBusy || !discoverQuery.trim()}
                          onClick={() => void parseDiscoverIntent()}
                        >
                          {discoverBusy
                            ? "Parsing Blueprint…"
                            : "Translate to Research Blueprint"}
                        </button>
                      </div>

                      {discoverBlueprint && (
                        <div className="x51-genome-card">
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <h4>Reviewable Research Blueprint</h4>
                            <span
                              className={
                                discoverBlueprint.supported
                                  ? "x51-pill x51-pill-green"
                                  : "x51-pill x51-pill-red"
                              }
                            >
                              {discoverBlueprint.interpretationConfidence}
                            </span>
                          </div>
                          <p className="x1-caption" style={{ margin: 0 }}>
                            {discoverBlueprint.humanSummary}
                          </p>
                          {discoverBlueprint.formula && (
                            <code className="x51-soul-formula">
                              {discoverBlueprint.formula}
                            </code>
                          )}
                          {discoverBlueprint.clauses.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.82rem" }}>
                              {discoverBlueprint.clauses.map((c, idx) => (
                                <li key={idx}>
                                  <strong>{c.explanation}</strong> →{" "}
                                  <code>{c.formula}</code>
                                </li>
                              ))}
                            </ul>
                          )}
                          {discoverBlueprint.assumptions.length > 0 && (
                            <p className="x1-caption" style={{ margin: 0 }}>
                              Assumptions:{" "}
                              {discoverBlueprint.assumptions.join(" · ")}
                            </p>
                          )}
                          {discoverBlueprint.unsupportedPhrases.length > 0 && (
                            <p role="alert" className="x1-form-error" style={{ margin: 0 }}>
                              Unsupported concepts rejected:{" "}
                              {discoverBlueprint.unsupportedPhrases.join("; ")}
                            </p>
                          )}
                          {discoverBlueprint.supported &&
                            discoverBlueprint.formula && (
                              <div className="x1-actions">
                                <button
                                  type="button"
                                  className="x1-secondary"
                                  onClick={() => {
                                    setFormula(discoverBlueprint.formula!);
                                    setAdvancedTab("BUILD");
                                    setBuildMode("FORMULA");
                                  }}
                                >
                                  Edit in Build
                                </button>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  )}

                  {advancedTab === "BUILD" && (
                    <>
                      <label className="x1-label">
                        Soul name
                        <input
                          value={name}
                          maxLength={100}
                          placeholder="Name your Advanced Soul"
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <label className="x1-label">
                        Hypothesis note
                        <textarea
                          className="x2-scan-description"
                          value={description}
                          minLength={10}
                          maxLength={2000}
                          placeholder="Document what edge or structure you are testing and why."
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </label>
                      <div className="x1-segment" style={{ marginBottom: 10 }}>
                        <button
                          type="button"
                          aria-pressed={buildMode === "VISUAL"}
                          onClick={() => {
                            const converted = treeFromFormula(formula);
                            if (converted) setTree(converted);
                            setBuildMode("VISUAL");
                          }}
                        >
                          Visual Rule Blocks
                        </button>
                        <button
                          type="button"
                          aria-pressed={buildMode === "FORMULA"}
                          onClick={() => {
                            if (canonical.value) setFormula(canonical.value.formula);
                            setBuildMode("FORMULA");
                          }}
                        >
                          Canonical Formula AST
                        </button>
                      </div>
                      {buildMode === "VISUAL" ? (
                        <RuleEditor tree={tree} onChange={setTree} />
                      ) : (
                        <label className="x1-label">
                          Canonical formula
                          <textarea
                            className="x1-code-editor"
                            value={formula}
                            maxLength={4000}
                            spellCheck={false}
                            onChange={(e) => setFormula(e.target.value)}
                          />
                        </label>
                      )}
                      <OutcomeControls value={outcome} onChange={setOutcome} />
                    </>
                  )}

                  {advancedTab === "DRAW" && (
                    <PatternDrawCanvas
                      authenticated={authenticated}
                      onRequireAuth={onRequireAuth}
                      universe={universe}
                      interval={interval}
                      customCsv={
                        universePreset === "CUSTOM_CSV" ? customCsv : undefined
                      }
                      instrumentIds={instruments.split(/[\s,]+/).filter(Boolean)}
                      busy={!!busy}
                      onOpenAsset={openAsset}
                      notify={notify}
                      onScanComplete={async (res) => {
                        setSelected(res.id);
                        setJustCompletedId(res.id);
                        await reload();
                      }}
                    />
                  )}
                </>
              )}

              {/* Scope & Partial-Data Policy (Collapsible) */}
              <details className="x1-small-details">
                <summary>Instrument filter &amp; missing-data policy</summary>
                <label className="x1-label">
                  Find &amp; add instruments (HDFC, SBIN, NIFTY, GOLD…)
                  <input
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Type HDFC, SBIN, RELIANCE, NIFTY…"
                  />
                </label>
                {pickerMatches.length > 0 && (
                  <div className="x1-chip-row">
                    {pickerMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          const existing = instruments
                            .split(/[\s,]+/)
                            .filter(Boolean);
                          if (!existing.includes(m.id)) {
                            setInstruments([...existing, m.id].join(", "));
                            if (!m.id.startsWith("ECB:")) {
                              setUniverse("CONNECTED_MARKETS");
                              if (universePreset === "ECB_DAILY") {
                                setUniversePreset("INDIAN_EQUITIES");
                              }
                            }
                            setPreflight(null);
                          }
                          setPickerQuery("");
                        }}
                      >
                        + {m.name} ({m.id})
                      </button>
                    ))}
                  </div>
                )}
                <label className="x1-label">
                  Exact instruments (optional)
                  <input
                    value={instruments}
                    onChange={(e) => setInstruments(e.target.value)}
                    placeholder="Comma-separated canonical IDs"
                  />
                </label>
                <label className="x1-label">
                  Missing inputs
                  <select
                    value={partialPolicy}
                    onChange={(e) =>
                      setPartial(
                        e.target.value as ResearchDefinition["partialPolicy"],
                      )
                    }
                  >
                    <option value="ALLOW_UNKNOWN">
                      Explicit UNKNOWN rows permitted
                    </option>
                    <option value="STRICT">Require complete inputs only</option>
                  </select>
                </label>
              </details>

              {/* Run Controls (hidden only in DRAW tab because DrawCanvas has its own Run Draw Scan button) */}
              {!(scanMode === "ADVANCED" && advancedTab === "DRAW") && (
                <>
                  {canonical.error && (
                    <p role="alert" className="x1-form-error">
                      {canonical.error}
                    </p>
                  )}
                  <div className="x2-scan-toolbar">
                    <button
                      type="button"
                      className="x1-secondary"
                      disabled={!!busy || !definition.value || !canonical.value}
                      onClick={() => void perform("draft")}
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      className="x1-secondary"
                      disabled={!!busy || !definition.value || !canonical.value}
                      onClick={() => void perform("preflight")}
                    >
                      Check coverage
                    </button>
                    <button
                      type="button"
                      className="x1-primary x1-motion-button"
                      disabled={
                        !!busy ||
                        !definition.value ||
                        !canonical.value ||
                        (scanMode === "ADVANCED" &&
                          advancedTab === "DISCOVER" &&
                          !discoverBlueprint?.supported)
                      }
                      onClick={() => void perform("run")}
                    >
                      RUN SCAN
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}

              {busy && (
                <div className="x51-pipeline-steps" role="status" aria-live="polite">
                  <span className="x51-accent-dot" />
                  <strong>{busy}</strong>
                  <span>
                    Stage {Math.max(1, pipelineStep)} / 3
                  </span>
                </div>
              )}

              {coverage && (
                <div className="x2-source-preflight">
                  <strong>
                    {coverage.preflight.blocked
                      ? "COVERAGE BLOCKED"
                      : "COVERAGE VERIFIED"}
                  </strong>
                  <p>
                    {coverage.preflight.eligible}/{coverage.preflight.total}{" "}
                    eligible · {coverage.preflight.unknown} UNKNOWN ·{" "}
                    {coverage.source}
                  </p>
                  <p>{coverage.preflight.reason}</p>
                </div>
              )}
            </Panel>

            <Panel title="Drafts & Glossary" kicker="Private memory">
              {drafts.length ? (
                <div className="x2-research-drafts">
                  {drafts.map((row) => (
                    <details key={row.id}>
                      <summary>
                        {row.name} · v{row.version}
                      </summary>
                      <div className="x1-actions">
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() =>
                            loadDefinition(row.payload.definition, {
                              id: row.id,
                              version: row.version,
                            })
                          }
                        >
                          Open in Build
                        </button>
                      </div>
                      <p className="x1-caption">
                        <code>{row.payload.definition.formula}</code>
                      </p>
                    </details>
                  ))}
                </div>
              ) : (
                <Empty title="Working drafts">
                  Saved drafts and copied Community Souls appear here cleanly.
                </Empty>
              )}
              <Comparison runs={runs} />
              <details className="x1-small-details">
                <summary>Research glossary (RSI, ATR, MACD, BB, ADX, PIT)</summary>
                <div className="x3-glossary-grid">
                  {RESEARCH_GLOSSARY.map((item) => (
                    <div className="x3-glossary-item" key={item.term}>
                      <strong>{item.term}</strong>
                      <p>{item.meaning}</p>
                    </div>
                  ))}
                </div>
              </details>
            </Panel>
          </div>

          {/* ACTIVE SCAN RESULTS: Compact Metrics + Coverage Chart + Collapsed-by-Default Match Accordion */}
          {active && (
            <div
              className={
                "x53-results-shell" +
                (justCompletedId === active.id ? " x51-scan-complete-pulse" : "")
              }
            >
              <Panel
                title={`Results · ${active.name}`}
                kicker={`${active.payload.scanTier ?? active.mode} · ${moment(active.created_at)}`}
                action={
                  <div className="x1-actions" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="x51-accent-btn"
                      style={{ minHeight: 36, fontSize: "0.82rem" }}
                      onClick={() => openPostSoulModal(active)}
                    >
                      <Send size={14} />
                      <span>Post Soul</span>
                    </button>
                    <button
                      type="button"
                      className="x1-secondary"
                      style={{ minHeight: 36, fontSize: "0.82rem" }}
                      onClick={() => {
                        setSavedSignature(signature);
                        share(active.payload.rule.formula);
                      }}
                    >
                      <Share2 size={14} />
                      <span>Share</span>
                    </button>
                  </div>
                }
              >
                <div className="x53-compact-metrics" aria-label="Scan result counts">
                  <div className="x53-compact-metric">
                    <strong>{activeMatches.length}</strong>
                    <span>Matched</span>
                  </div>
                  <div className="x53-compact-metric">
                    <strong>{active.payload.results.eligible ?? 0}</strong>
                    <span>Evaluated</span>
                  </div>
                  <div className="x53-compact-metric">
                    <strong>{active.payload.results.failed ?? 0}</strong>
                    <span>Failed</span>
                  </div>
                  <div className="x53-compact-metric">
                    <strong>{active.payload.results.unknown ?? 0}</strong>
                    <span>Unknown</span>
                  </div>
                </div>

                <div className="x53-formula-meta-row">
                  <code className="x53-compact-formula">
                    {active.payload.rule.formula}
                  </code>
                  <details className="x53-meta-info">
                    <summary>Method &amp; Digest</summary>
                    <div className="x53-meta-info-body">
                      <p className="x1-caption" style={{ margin: 0 }}>
                        {active.payload.knownAtPolicy}
                      </p>
                      <div className="x1-actions" style={{ gap: 8, marginTop: 6 }}>
                        <code className="x1-caption">
                          SHA-256: {active.digest.slice(0, 20)}…
                        </code>
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(active.digest);
                            notify("Copied scan SHA-256 digest.");
                          }}
                        >
                          <Copy size={13} /> Copy digest
                        </button>
                      </div>
                    </div>
                  </details>
                </div>

                <ScanCoverageChart
                  passed={activeMatches.length}
                  failed={active.payload.results.failed ?? 0}
                  unknown={active.payload.results.unknown ?? 0}
                  sourceLabel={active.payload.research?.universe ?? active.payload.interval ?? "1d"}
                />

                {activeMatches.length > 0 ? (
                  <div className="x53-match-accordion" role="list" aria-label="Matching instruments">
                    {activeMatches.map((r) => {
                      const regInfo = registryInstrument(
                        r.instrumentId.replace(/^CSV:/, ""),
                      );
                      return (
                        <details
                          key={r.instrumentId}
                          className="x53-match-row"
                          role="listitem"
                        >
                          <summary className="x53-match-summary">
                            <span className="x53-match-title">
                              <strong>{r.instrumentId.replace(/^CSV:/, "")}</strong>
                              {regInfo && (
                                <span className="x1-caption">{regInfo.name}</span>
                              )}
                            </span>
                            <span className="x51-pill x51-pill-green">MATCH</span>
                          </summary>
                          <div className="x53-match-body">
                            <ul>
                              {r.reasons.map((reason, i) => (
                                <li key={i}>{reason}</li>
                              ))}
                            </ul>
                            <div className="x53-match-foot">
                              <span className="x1-caption">
                                {r.source} · closed bar{" "}
                                {r.latestEventAt ?? "unavailable"}
                              </span>
                              <button
                                type="button"
                                className="x1-text-button"
                                onClick={() =>
                                  openAsset(r.instrumentId.replace(/^CSV:/, ""))
                                }
                              >
                                Asset Detail
                                <ArrowUpRight size={14} />
                              </button>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <div className="x1-callout" style={{ marginTop: 10 }}>
                    Zero instruments matched at {moment(active.created_at)}.
                    Recorded honestly in Graveyard.
                  </div>
                )}

                <details className="x1-small-details" style={{ marginTop: 10 }}>
                  <summary>
                    Coverage &amp; Exclusions ({activeNonMatches.length})
                  </summary>
                  <div className="x1-scan-results" style={{ marginTop: 8 }}>
                    {activeNonMatches.map((r) => (
                      <div
                        key={r.instrumentId}
                        style={{
                          padding: "7px 10px",
                          borderBottom: "1px solid var(--x51-hairline)",
                          fontSize: "0.82rem",
                        }}
                      >
                        <strong>{r.instrumentId}</strong>{" "}
                        <span className="x51-pill">{r.status}</span> —{" "}
                        <span className="x1-caption">
                          {r.reasons.join(" ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </Panel>

              {active.payload.soulGenome && (
                <div style={{ marginTop: 14 }}>
                  <SoulGenomePanel
                    genome={active.payload.soulGenome}
                    onOpenAsset={openAsset}
                  />
                </div>
              )}

              <div className="x2-probability-grid" style={{ marginTop: 14 }}>
                <EvidencePanel scanId={active.id} selectRun={setSelected} />
                <ReplayPanel run={active} />
              </div>
            </div>
          )}

          {/* GRAVEYARD: Prominent Signature Immutable Research Archive */}
          <section
            className="x53-graveyard-shell"
            aria-labelledby="x53-graveyard-heading"
          >
            <div className="x53-graveyard-head">
              <div className="x53-graveyard-title-wrap">
                <span className="x53-graveyard-icon" aria-hidden="true">
                  <Archive size={18} />
                </span>
                <div>
                  <h2 id="x53-graveyard-heading" className="x53-graveyard-title">
                    GRAVEYARD
                  </h2>
                  <p className="x1-caption" style={{ margin: 0 }}>
                    Immutable personal scan archive · original formulas, cutoffs &amp; post-mortems preserved
                  </p>
                </div>
              </div>
              <div className="x51-chip-row" role="group" aria-label="Graveyard filter">
                {(["ALL", "CLASSIC", "ADVANCED", "RETIRED"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      type="button"
                      className={
                        "x51-chip" + (graveyardFilter === f ? " is-active" : "")
                      }
                      aria-pressed={graveyardFilter === f}
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
                  ),
                )}
              </div>
            </div>

            <div className="x2-history-tools">
              <input
                type="search"
                aria-label="Search Graveyard scans"
                placeholder="Search saved Souls or formulas…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <span>{filteredGraveyard.length} archived</span>
            </div>

            {filteredGraveyard.length ? (
              <div className="x53-graveyard-list">
                {filteredGraveyard.map((run) => {
                  const rich = run as RichRun;
                  const tier =
                    rich.payload.scanTier ??
                    (run.mode === "SIMPLE" ? "CLASSIC" : "ADVANCED");
                  const isSelected = active?.id === run.id;
                  return (
                    <div
                      className={
                        "x53-graveyard-card" + (isSelected ? " is-selected" : "")
                      }
                      key={run.id}
                    >
                      <button
                        type="button"
                        className="x53-graveyard-main"
                        onClick={() => setSelected(run.id)}
                      >
                        <div className="x53-graveyard-card-top">
                          <strong>{run.name}</strong>
                          <span className="x51-pill">{tier}</span>
                          {grave.has(run.id) && (
                            <span className="x51-pill x51-pill-amber">Retired</span>
                          )}
                        </div>
                        <div className="x1-caption">
                          {moment(run.created_at)} ·{" "}
                          {run.payload.results.matches ?? "Withheld"} matched ·{" "}
                          <code>{run.payload.rule.formula}</code>
                        </div>
                      </button>
                      <div className="x1-actions" style={{ gap: 8, flexShrink: 0 }}>
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => openPostSoulModal(run)}
                        >
                          Post Soul
                        </button>
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => setReview(run)}
                        >
                          {grave.has(run.id) ? "Review" : "Post-mortem"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title="No saved Souls in this view">
                Completed Classic and Advanced scans are archived here
                immutably; nothing is fabricated.
              </Empty>
            )}
            {nextCursor && (
              <button
                type="button"
                className="x1-secondary"
                style={{ marginTop: 10 }}
                disabled={!!busy}
                onClick={() => void loadOlder()}
              >
                Load older Graveyard scans
              </button>
            )}
          </section>
        </div>
      )}

      {/* STANDALONE FORMULA LAB (Never nested inside Classic / Advanced!) */}
      {panel === "Formula Lab" && <FormulaLab notify={notify} />}

      {/* [06] Compact Searchable 50-Formula Picker Modal */}
      {formulaPickerOpen && (
        <Modal
          title="Select Classic Formula (50 Verified Rules)"
          onClose={() => setFormulaPickerOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="search"
              value={classicFilter}
              onChange={(e) => setClassicFilter(e.target.value)}
              aria-label="Search 50 Classic formulas"
              placeholder="Search RSI, Golden Cross, MACD, Bollinger, ADX, Volume…"
              autoFocus
            />
            <div className="x51-chip-row" role="group" aria-label="Formula category">
              <button
                type="button"
                className={"x51-chip" + (classicCategory === "ALL" ? " is-active" : "")}
                onClick={() => setClassicCategory("ALL")}
              >
                All (50)
              </button>
              {CLASSIC_PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={"x51-chip" + (classicCategory === cat ? " is-active" : "")}
                  onClick={() => setClassicCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div
              className="x51-preset-list"
              style={{ maxHeight: "50vh" }}
              role="listbox"
              aria-label="50 Classic Soul Scan formulas"
            >
              {filteredClassicPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="option"
                  aria-selected={selectedClassicId === preset.id}
                  className={
                    "x51-preset-option" +
                    (selectedClassicId === preset.id ? " is-active" : "")
                  }
                  onClick={() => {
                    selectClassicPreset(preset);
                    setFormulaPickerOpen(false);
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: "0.86rem" }}>
                      #{String(preset.number).padStart(2, "0")} · {preset.label}
                    </strong>
                    <div className="x1-caption">
                      <code>{preset.formula}</code> · min {preset.minBars} bars
                    </div>
                  </div>
                  <span className="x51-pill">{preset.category}</span>
                </button>
              ))}
              {filteredClassicPresets.length === 0 && (
                <p className="x1-caption">No formula matched “{classicFilter}”.</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* One-Click Post Soul Modal with [30] Exact Server-Validated Post Preview */}
      {postTarget && (
        <Modal
          title="Post Soul to Community"
          onClose={() => setPostTarget(null)}
        >
          {postedResultId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="x1-callout">
                <strong>Published cleanly!</strong> Your Soul{" "}
                <strong>{postTarget.name}</strong> is live on Community Web.
              </div>
              <div className="x1-actions">
                {onOpenCommunityWeb && (
                  <button
                    type="button"
                    className="x51-accent-btn"
                    onClick={() => {
                      setPostTarget(null);
                      onOpenCommunityWeb();
                    }}
                  >
                    View on Community Web
                    <ArrowRight size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={() => setPostTarget(null)}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form className="x1-form" onSubmit={submitPostSoul}>
              <p className="x1-caption" style={{ margin: 0 }}>
                Soul: <strong>{postTarget.name}</strong> · Formula:{" "}
                <code>{postTarget.payload.rule.formula}</code>
              </p>
              <label>
                Audience
                <select
                  value={postAudience}
                  onChange={(e) => {
                    setPostAudience(
                      e.target.value as "PUBLIC" | "FOLLOWERS" | "GROUP",
                    );
                    setPostPreview(null);
                  }}
                >
                  <option value="PUBLIC">Public (Community Web)</option>
                  <option value="FOLLOWERS">Followers Only</option>
                  <option value="GROUP">Specific Research Group</option>
                </select>
              </label>
              {postAudience === "GROUP" && (
                <label>
                  Research Group ID
                  <input
                    value={postGroupId}
                    required
                    onChange={(e) => {
                      setPostGroupId(e.target.value);
                      setPostPreview(null);
                    }}
                    placeholder="Enter group ID from Community → Groups"
                  />
                </label>
              )}
              <label>
                Research summary
                <textarea
                  rows={3}
                  maxLength={1200}
                  value={postSummary}
                  onChange={(e) => {
                    setPostSummary(e.target.value);
                    setPostPreview(null);
                  }}
                  required
                />
              </label>
              <label>
                Risk &amp; limitation note
                <input
                  maxLength={280}
                  value={postRiskNote}
                  onChange={(e) => setPostRiskNote(e.target.value)}
                  required
                />
              </label>

              {/* [30] Exact Server-Validated Post Preview Card */}
              {postPreview && (
                <div
                  className="x51-soul-card"
                  role="region"
                  aria-label="Server-validated post preview"
                >
                  <div className="x51-soul-card-head">
                    <strong>
                      Preview · @{postPreview.preview.authorHandle}
                    </strong>
                    <span
                      className={
                        postPreview.allowed
                          ? "x51-pill x51-pill-green"
                          : "x51-pill x51-pill-red"
                      }
                    >
                      {postPreview.allowed
                        ? `Ready (${postPreview.preview.audience})`
                        : "Blocked by Data Rights"}
                    </span>
                  </div>
                  {!postPreview.allowed && postPreview.blockReason ? (
                    <p role="alert" className="x1-caption" style={{ color: "var(--x51-red)", margin: 0 }}>
                      {postPreview.blockReason}
                    </p>
                  ) : (
                    <>
                      <strong>{postPreview.preview.title}</strong>
                      <p className="x1-caption" style={{ margin: 0 }}>
                        {postPreview.preview.summary}
                      </p>
                      <code className="x51-soul-formula">
                        {postPreview.preview.formula}
                      </code>
                      <p className="x1-caption" style={{ margin: 0 }}>
                        {postPreview.preview.mode} · {postPreview.preview.timeframe} ·{" "}
                        {postPreview.preview.universeLabel} ·{" "}
                        {postPreview.preview.matchedSymbols.length} matched symbol(s)
                      </p>
                      <p className="x1-caption" style={{ margin: 0 }}>
                        Redactions: {postPreview.preview.redactionsApplied.join(" ")}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="x1-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="x1-secondary"
                  disabled={previewBusy}
                  onClick={() => void runPostPreview()}
                >
                  {previewBusy ? "Checking preview…" : "Preview Post"}
                </button>
                <button
                  type="submit"
                  className="x51-accent-btn"
                  disabled={postBusy || (postPreview !== null && !postPreview.allowed)}
                >
                  <Send size={15} />
                  <span>
                    {postBusy ? "Publishing…" : "Confirm & Post Soul"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Graveyard Post-Mortem / Review Modal */}
      {review && (
        <Modal title="Graveyard Post-Mortem" onClose={() => setReview(null)}>
          <p>{review.name} · original execution stays immutable.</p>
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy("Saving review…");
              const fields = new FormData(e.currentTarget);
              const sig = JSON.stringify({
                id: review.id,
                kind: fields.get("kind"),
                note: fields.get("note"),
              });
              if (
                pending.current?.kind !== "review" ||
                pending.current.signature !== sig
              ) {
                pending.current = {
                  kind: "review",
                  signature: sig,
                  id: crypto.randomUUID(),
                };
              }
              try {
                await api("/api/x1/workspace", {
                  action: "scan-review",
                  scanId: review.id,
                  kind: fields.get("kind"),
                  note: fields.get("note"),
                  requestId: pending.current.id,
                });
                await reload();
                setReview(null);
                pending.current = null;
                notify("Post-mortem saved; original scan preserved.");
              } catch (error) {
                notify((error as Error).message, true);
              } finally {
                lock.current = false;
                setBusy("");
              }
            }}
          >
            <label>
              State
              <select name="kind">
                <option value="RETIRED">Retired</option>
                <option value="INVALIDATED">Invalidated</option>
                <option value="REVIEWED_FAILURE">
                  Reviewed failure (personal assessment)
                </option>
                <option value="RESTORED">Restore active research</option>
              </select>
            </label>
            <label>
              Evidence and limitations
              <textarea name="note" required maxLength={1000} />
            </label>
            <button className="x1-primary" disabled={!!busy}>
              {busy || "Save post-mortem"}
              <Check size={15} />
            </button>
          </form>
          {workspace?.scanEvents
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
    </>
  );
}
