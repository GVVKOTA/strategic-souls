"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Share2 } from "lucide-react";
import { compileFormula } from "../../../backend/engines/scan";
import {
  BEGINNER_SCAN_PRESETS,
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
  initialFormula: string;
  initialInstrument?: string;
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
    research?: ResearchDefinition;
  };
};
export function FinancialCalendar() {
  return (
    <Panel title="Financial calendar">
      <ResearchInfo label="Source coverage">
        Source-hosted calendars are display only. No structured events are
        connected to the scan engine.
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

function buildSampleTestCsv(): string {
  const rows = ["symbol,date,open,high,low,close,volume"];
  const specs: [string, number, number][] = [
    ["NSE:HDFCBANK", 1680, 4.5],
    ["NSE:SBIN", 1120, 3.2],
    ["NSE:RELIANCE", 1410, -2.5],
    ["NSE:TCS", 4150, 8.0],
    ["NSE:INFY", 1890, -3.0],
  ];
  const baseMs = Date.UTC(2026, 9, 1);
  for (const [sym, start, step] of specs) {
    for (let d = 0; d < 28; d++) {
      const date = new Date(baseMs + d * 86_400_000).toISOString().slice(0, 10);
      const close = Math.round((start + d * step + (d % 3 === 0 ? -step * 0.4 : 0)) * 100) / 100;
      const open = Math.round((close - step * 0.3) * 100) / 100;
      const high = Math.round((Math.max(open, close) + Math.abs(step) * 0.8 + 2) * 100) / 100;
      const low = Math.round((Math.min(open, close) - Math.abs(step) * 0.8 - 2) * 100) / 100;
      rows.push(`${sym},${date},${open},${high},${low},${close},${150000 + d * 2500}`);
    }
  }
  return rows.join("\n");
}
export default function ResearchWorkspace({
  data,
  workspace,
  authenticated = true,
  onRequireAuth,
  reload,
  notify,
  openAsset,
  share,
  initialFormula,
  initialInstrument,
  initialPanel,
}: Props) {
  const [panel, setPanel] = useState(initialPanel || "Soul Scan"),
    [level, setLevel] = useState<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">(
      initialFormula ? "ADVANCED" : "BEGINNER",
    ),
    [activePreset, setActivePreset] = useState<string>(
      BEGINNER_SCAN_PRESETS[0].id,
    ),
    [formula, setFormula] = useState(
      initialFormula || BEGINNER_SCAN_PRESETS[0].formula,
    ),
    [tree, setTree] = useState<RuleTree>(defaultTree),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [universe, setUniverse] =
      useState<ResearchDefinition["universe"]>("ECB_DAILY"),
    [universePreset, setUniversePreset] = useState<
      "INDIAN_EQUITIES" | "MCX_FUTURES" | "MY_WATCHLIST" | "ECB_DAILY" | "CUSTOM_CSV"
    >("ECB_DAILY"),
    [customCsv, setCustomCsv] = useState(""),
    [pickerQuery, setPickerQuery] = useState(""),
    [resultSort, setResultSort] = useState<"STATUS" | "SYMBOL">("STATUS"),
    [interval, setInterval] = useState<ResearchDefinition["interval"]>("1d"),
    [instruments, setInstruments] = useState(""),
    [partialPolicy, setPartial] =
      useState<ResearchDefinition["partialPolicy"]>("STRICT"),
    [outcome, setOutcome] = useState<OutcomeDefinition>(defaultOutcome),
    [busy, setBusy] = useState(""),
    [preflight, setPreflight] = useState<{
      signature: string;
      value: Preflight;
    } | null>(null),
    [selected, setSelected] = useState(""),
    [review, setReview] = useState<ScanRun | null>(null),
    [historyTab, setHistoryTab] = useState("Scan History"),
    [historySearch, setHistorySearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [olderRuns, setOlderRuns] = useState<ScanRun[]>([]),
    [olderCursor, setOlderCursor] = useState<string | null | undefined>(
      undefined,
    ),
    [draft, setDraft] = useState<{ id: string; version: number } | null>(null),
    [savedSignature, setSavedSignature] = useState("");
  const lock = useRef(false),
    pending = useRef<{ kind: string; signature: string; id: string } | null>(
      null,
    );
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive && initialFormula) {
        setFormula(initialFormula);
        setLevel("ADVANCED");
      }
    });
    return () => {
      alive = false;
    };
  }, [initialFormula]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive && initialPanel) setPanel(initialPanel);
    });
    return () => {
      alive = false;
    };
  }, [initialPanel]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive && initialInstrument) {
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
      }
    });
    return () => {
      alive = false;
    };
  }, [initialInstrument]);

  const pickerMatches = useMemo(() => {
    if (!pickerQuery.trim()) return [];
    return searchCanonicalInstruments(pickerQuery, X2_INSTRUMENTS, {
      limit: 6,
    });
  }, [pickerQuery]);

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
      const allEcb = items.length > 0 && items.every((i) => i.startsWith("ECB:"));
      setUniverse(allEcb ? "ECB_DAILY" : "CONNECTED_MARKETS");
      return;
    }
    if (next === "CUSTOM_CSV") {
      setUniverse("CONNECTED_MARKETS");
      setInstruments("");
      if (!customCsv.trim()) {
        setCustomCsv(buildSampleTestCsv());
      }
      if (!name.trim()) {
        setName(BEGINNER_SCAN_PRESETS[0].defaultName);
      }
      if (description.trim().length < 10) {
        setDescription(BEGINNER_SCAN_PRESETS[0].defaultDescription);
      }
    }
  }
  const canonical = useMemo(() => {
    try {
      return {
        value:
          level === "INTERMEDIATE"
            ? compileTree(tree)
            : compileFormula(formula),
        error: "",
      };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  }, [level, tree, formula]);
  const backendMode: ResearchDefinition["mode"] = useMemo(() => {
    if (level === "INTERMEDIATE") return "SIMPLE";
    if (level === "BEGINNER") {
      try {
        return treeFromFormula(formula) ? "SIMPLE" : "ADVANCED";
      } catch {
        return "ADVANCED";
      }
    }
    return "ADVANCED";
  }, [level, formula]);
  const definition = useMemo(() => {
    try {
      return {
        value: validateResearch({
          name,
          description,
          formula: canonical.value?.formula ?? formula,
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
    description,
    canonical.value,
    formula,
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
      description,
      formula: canonical.value?.formula ?? formula,
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
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
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
    ),
    active = runs.find((r) => r.id === selected) ?? runs[0];
  const grave = new Set(
    runs
      .filter((r) => r.reviewState && r.reviewState !== "RESTORED")
      .map((r) => r.id),
  );
  for (const event of workspace?.scanEvents ?? [])
    if (event.kind === "RESTORED") grave.delete(event.scan_id);
    else grave.add(event.scan_id);
  const history = runs.filter(
    (r) =>
      (historyTab !== "Graveyard" || grave.has(r.id)) &&
      (r.name + " " + ((r as RichRun).payload.description ?? ""))
        .toLowerCase()
        .includes(historySearch.toLowerCase()),
  );
  const drafts =
      (workspace as (WorkspaceState & { researchDrafts?: Draft[] }) | null)
        ?.researchDrafts ?? [],
    nextCursor =
      olderCursor === undefined
        ? workspace?.scanHistoryNextBefore
        : olderCursor,
    coverage = preflight?.signature === signature ? preflight.value : null;
  function selectBeginnerPreset(preset: (typeof BEGINNER_SCAN_PRESETS)[number]) {
    setActivePreset(preset.id);
    setFormula(preset.formula);
    const converted = treeFromFormula(preset.formula);
    if (converted) setTree(converted);
    if (!name.trim()) setName(preset.defaultName);
    if (description.trim().length < 10) setDescription(preset.defaultDescription);
    setPreflight(null);
  }
  function switchLevel(next: "BEGINNER" | "INTERMEDIATE" | "ADVANCED") {
    if (next === level) return;
    const currentFormula = canonical.value?.formula ?? formula;
    if (next === "ADVANCED") {
      setFormula(currentFormula);
      setLevel("ADVANCED");
      return;
    }
    if (next === "BEGINNER") {
      setFormula(currentFormula);
      setLevel("BEGINNER");
      return;
    }
    try {
      const converted = treeFromFormula(currentFormula);
      if (!converted) {
        notify(
          "This custom expression needs Advanced mode; your method is preserved.",
          true,
        );
        return;
      }
      setTree(converted);
      setFormula(currentFormula);
      setLevel("INTERMEDIATE");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function loadDefinition(
    value: ResearchDefinition,
    current: { id: string; version: number } | null = null,
  ) {
    setName(value.name);
    setDescription(value.description);
    setFormula(value.formula);
    const converted =
      value.mode === "SIMPLE" ? treeFromFormula(value.formula) : null;
    if (converted) {
      setTree(converted);
      setLevel("INTERMEDIATE");
    } else setLevel("ADVANCED");
    setUniverse(value.universe);
    setInterval(value.interval);
    setInstruments(value.instrumentIds.join(", "));
    setPartial(value.partialPolicy);
    setOutcome(value.outcome);
    setDraft(current);
    setSavedSignature(current ? JSON.stringify(value) : "");
    setPanel("Soul Scan");
  }
  async function perform(kind: "preflight" | "run" | "draft") {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (lock.current || !definition.value || !canonical.value) return;
    lock.current = true;
    setBusy(
      kind === "preflight"
        ? "Checking coverage…"
        : kind === "draft"
          ? "Saving draft…"
          : "Running and saving…",
    );
    if (
      pending.current?.signature !== signature ||
      pending.current?.kind !== kind
    )
      pending.current = { kind, signature, id: crypto.randomUUID() };
    try {
      if (kind === "preflight") {
        const value = await api<Preflight>("/api/x1/workspace", {
          action: "preflight-scan",
          ...definition.value,
          ...(universePreset === "CUSTOM_CSV" && customCsv.trim()
            ? { customCsv }
            : {}),
        });
        setPreflight({ signature, value });
        if (value.preflight.blocked)
          notify(
            value.preflight.reason || "Data preflight blocked execution.",
            true,
          );
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
        notify("Draft version saved.");
      }
      if (kind === "run") {
        const result = await api<{ id: string }>("/api/x1/workspace", {
          action: "run-scan",
          requestId: pending.current.id,
          ...definition.value,
          ...(universePreset === "CUSTOM_CSV" && customCsv.trim()
            ? { customCsv }
            : {}),
        });
        setSelected(result.id);
        setHistoryTab("Scan History");
        setSavedSignature(signature);
        await reload();
        notify("Scan and exact source snapshot saved.");
      }
      pending.current = null;
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function loadOlder() {
    if (lock.current || !nextCursor) return;
    lock.current = true;
    setBusy("Loading history…");
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
  return (
    <>
      <div className="x1-subnav" aria-label="Strategy menus">
        {["Soul Scan", "Market Radar", "Formula Lab"].map((t) => (
          <button
            key={t}
            aria-current={panel === t ? "page" : undefined}
            onClick={() => setPanel(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <header className="x1-page-title">
        <h1>{panel}</h1>
        <span className="x1-badge">Research, not a recommendation</span>
      </header>
      {panel === "Soul Scan" && (
        <>
          <div className="x1-scan-grid">
            <Panel
              title="Build a Soul"
              action={
                <div className="x1-segment" role="group" aria-label="Soul Scan experience level">
                  {(
                    [
                      ["BEGINNER", "Beginner"],
                      ["INTERMEDIATE", "Intermediate"],
                      ["ADVANCED", "Advanced"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={level === id}
                      onClick={() => switchLevel(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="x1-chip-row" aria-label="Soul Scan 4-step workflow">
                <span>1. Choose universe</span>
                <span>2. Define rules</span>
                <span>3. Check coverage</span>
                <span>4. Run &amp; review evidence</span>
              </div>
              <label className="x1-label">
                Scan name
                <input
                  value={name}
                  maxLength={100}
                  placeholder="Name your hypothesis"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="x1-label">
                Description
                <textarea
                  className="x2-scan-description"
                  value={description}
                  minLength={10}
                  maxLength={2000}
                  placeholder="What are you testing, and why?"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className="x1-label">
                <span>Step 1 · Where should we scan?</span>
                <div className="x3-preset-grid" role="group" aria-label="Where should we scan">
                  <button
                    type="button"
                    className="x3-preset-card"
                    aria-pressed={universePreset === "INDIAN_EQUITIES"}
                    onClick={() => applyUniversePreset("INDIAN_EQUITIES")}
                  >
                    <strong>Indian Equities &amp; Indices (NSE / BSE)</strong>
                    <span>
                      Evaluates all entitled NSE/BSE stocks and indices (HDFCBANK,
                      SBIN, RELIANCE, TCS, INFY, NIFTY, SENSEX). Never substitutes FX.
                    </span>
                    <small className="x1-caption">
                      Requires Connected Provider or Owner Broker Gateway
                    </small>
                  </button>
                  <button
                    type="button"
                    className="x3-preset-card"
                    aria-pressed={universePreset === "MCX_FUTURES"}
                    onClick={() => applyUniversePreset("MCX_FUTURES")}
                  >
                    <strong>MCX Commodity Futures</strong>
                    <span>
                      Evaluates active dated MCX futures contracts (GOLD04DEC26FUT,
                      CRUDEOIL18DEC26FUT) with verified expiry and lot metadata.
                    </span>
                    <small className="x1-caption">
                      Requires Connected Provider or Owner Broker Gateway
                    </small>
                  </button>
                  <button
                    type="button"
                    className="x3-preset-card"
                    aria-pressed={universePreset === "MY_WATCHLIST"}
                    onClick={() => applyUniversePreset("MY_WATCHLIST")}
                  >
                    <strong>My Watchlist</strong>
                    <span>
                      Scans the instruments saved in your private watchlist using
                      their verified canonical IDs.
                    </span>
                    <small className="x1-caption">
                      {(workspace?.records.find((r) => r.kind === "watchlist")?.payload?.items
                        ?.length ?? 0) > 0
                        ? `${workspace?.records.find((r) => r.kind === "watchlist")?.payload?.items?.length} saved watchlist instruments`
                        : "Save a watchlist in Global to prefill"}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="x3-preset-card"
                    aria-pressed={universePreset === "ECB_DAILY"}
                    onClick={() => applyUniversePreset("ECB_DAILY")}
                  >
                    <strong>Currencies (Official ECB Daily FX)</strong>
                    <span>
                      Official daily European Central Bank FX reference pairs
                      (USD/INR, EUR/USD, etc.).
                    </span>
                    <small className="x1-caption">
                      AVAILABLE · {data?.fxHistory.length ?? 6} reference pairs connected
                    </small>
                  </button>
                  <button
                    type="button"
                    className="x3-preset-card"
                    aria-pressed={universePreset === "CUSTOM_CSV"}
                    onClick={() => applyUniversePreset("CUSTOM_CSV")}
                  >
                    <strong>Private User CSV OHLCV Dataset</strong>
                    <span>
                      Evaluate your own historical OHLCV CSV (or a 5-stock Indian
                      equity TEST DATA fixture) privately without a paid API key.
                    </span>
                    <small className="x1-caption">
                      AVAILABLE · Personal research only (not live exchange data)
                    </small>
                  </button>
                </div>
              </div>
              {universePreset === "CUSTOM_CSV" && (
                <div className="x1-label">
                  <span>
                    Private CSV OHLCV data (<code>symbol,date,open,high,low,close,volume</code> · TEST / USER-IMPORTED, not live)
                  </span>
                  <textarea
                    className="x1-code-editor"
                    rows={5}
                    value={customCsv}
                    aria-label="Private CSV OHLCV dataset"
                    placeholder="symbol,date,open,high,low,close,volume"
                    onChange={(e) => {
                      setCustomCsv(e.target.value);
                      setPreflight(null);
                    }}
                  />
                  <div className="x1-actions">
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={() => {
                        setCustomCsv(buildSampleTestCsv());
                        setPreflight(null);
                      }}
                    >
                      Load 5-stock Indian equity test fixture (TEST DATA)
                    </button>
                  </div>
                </div>
              )}
              <div className="x2-research-form-grid">
                <label>
                  Universe
                  <select
                    value={universe}
                    onChange={(e) => {
                      const nextU = e.target.value as ResearchDefinition["universe"];
                      setUniverse(nextU);
                      setUniversePreset(
                        nextU === "ECB_DAILY" ? "ECB_DAILY" : "INDIAN_EQUITIES",
                      );
                      setCustomCsv("");
                      setPreflight(null);
                    }}
                  >
                    <option value="ECB_DAILY">ECB daily FX references</option>
                    <option value="CONNECTED_MARKETS">
                      Connected NSE / BSE / MCX / indices
                    </option>
                  </select>
                </label>
                <label>
                  Timeframe
                  <select
                    value={interval}
                    onChange={(e) =>
                      setInterval(
                        e.target.value as ResearchDefinition["interval"],
                      )
                    }
                  >
                    <option value="1d">Daily</option>
                    <option value="1wk">Weekly</option>
                    <option value="1mo">Monthly</option>
                  </select>
                </label>
              </div>
              {interval !== "1d" && (
                <p className="x1-caption">
                  Calendar groups use actual daily observations. The latest week
                  or month may be incomplete; its date remains the last
                  available observation.
                </p>
              )}
              <details className="x1-small-details">
                <summary>Scope and partial-data policy</summary>
                <label className="x1-label">
                  Find &amp; add instruments by name or ticker (HDFC, SBIN, NIFTY, GOLD…)
                  <input
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Type HDFC, HDFCBANK, SBIN, RELIANCE, NIFTY…"
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
                    placeholder="Comma-separated canonical IDs (e.g. NSE:HDFCBANK, NSE:SBIN)"
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
                    <option value="STRICT">Require complete inputs</option>
                    <option value="ALLOW_UNKNOWN">
                      I accept explicit UNKNOWN rows
                    </option>
                  </select>
                </label>
                <p className="x1-caption">
                  {universe === "ECB_DAILY"
                    ? `${data?.fxHistory.length ?? 0} daily reference pairs connected; these are not execution quotes.`
                    : "Only supported, entitled provider instruments execute. No substitute dataset is used."}
                </p>
              </details>
              {level === "BEGINNER" ? (
                <div>
                  <p className="x1-caption">
                    Choose a guided research preset below. Every preset compiles
                    to the exact same deterministic AST used by Intermediate and
                    Advanced modes.
                  </p>
                  <div className="x3-preset-grid">
                    {BEGINNER_SCAN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="x3-preset-card"
                        aria-pressed={activePreset === preset.id && formula === preset.formula}
                        onClick={() => selectBeginnerPreset(preset)}
                      >
                        <strong>{preset.label}</strong>
                        <span>{preset.plainLanguage}</span>
                        <code>{preset.formula}</code>
                        <small className="x1-caption">{preset.requires}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : level === "INTERMEDIATE" ? (
                <RuleEditor tree={tree} onChange={setTree} />
              ) : (
                <>
                  <label className="x1-label">
                    Typed formula
                    <textarea
                      className="x1-code-editor"
                      value={formula}
                      maxLength={4000}
                      spellCheck={false}
                      onChange={(e) => setFormula(e.target.value)}
                    />
                  </label>
                  <div className="x1-chip-row">
                    {[
                      "close > sma(close,20)",
                      "rsi(close,14) < 40",
                      "all(close > ema(close,20), not(rsi(close,14) > 70))",
                      "crossesAbove(close,sma(close,20))",
                    ].map((f) => (
                      <button key={f} type="button" onClick={() => setFormula(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <OutcomeControls value={outcome} onChange={setOutcome} />
              {canonical.error ? (
                <p role="alert" className="x1-form-error">
                  {canonical.error}
                </p>
              ) : (
                <div className="x1-rule-preview">
                  <code>{canonical.value?.formula}</code>
                </div>
              )}
              {(name || description) && definition.error && (
                <p role="alert" className="x1-form-error">
                  {definition.error}
                </p>
              )}
              <div className="x2-scan-toolbar">
                <button
                  className="x1-secondary"
                  disabled={!!busy || !definition.value || !canonical.value}
                  onClick={() => perform("draft")}
                >
                  Save draft
                </button>
                <button
                  className="x1-secondary"
                  disabled={!!busy || !definition.value || !canonical.value}
                  onClick={() => perform("preflight")}
                >
                  Check coverage
                </button>
                <button
                  className="x1-primary x1-motion-button"
                  disabled={
                    !!busy ||
                    !definition.value ||
                    !canonical.value ||
                    !coverage ||
                    coverage.preflight.blocked
                  }
                  onClick={() => perform("run")}
                >
                  Run scan
                  <ArrowRight size={16} />
                </button>
              </div>
              <p className="x2-scan-status" role="status" aria-live="polite">
                {busy ||
                  (!authenticated
                    ? "Sign in to check coverage, run scans, and save immutable Soul history."
                    : !definition.value
                      ? "Name and describe the hypothesis before execution."
                      : !coverage
                        ? "Check source coverage before running."
                        : dirty
                          ? "Unsaved definition changes"
                          : "Definition preserved")}
              </p>
              {coverage && (
                <div className="x2-source-preflight">
                  <strong>
                    {coverage.preflight.blocked
                      ? "COVERAGE BLOCKED"
                      : "READY FOR CURRENT FILTER"}
                  </strong>
                  <p>
                    {coverage.preflight.eligible}/{coverage.preflight.total}{" "}
                    eligible · {coverage.preflight.unknown} UNKNOWN ·{" "}
                    {coverage.source}
                  </p>
                  <p>{coverage.preflight.reason}</p>
                  {coverage.redaction?.applied && (
                    <p role="status">
                      Source licence restricts displayed observations/results.
                      Internal analysis remains separate from permitted UI
                      output.
                    </p>
                  )}
                  <details>
                    <summary>Inputs, source time and quota</summary>
                    <p>{coverage.preflight.requiredFields.join(", ")}</p>
                    <p>
                      {coverage.preflight.asOf} ·{" "}
                      {coverage.preflight.sourceMode}
                    </p>
                    <p>{coverage.preflight.quota}</p>
                    {coverage.preflight.exclusions.map((r) => (
                      <p key={r.id}>
                        {r.id}: {r.reasons.join(" ")}
                      </p>
                    ))}
                    {coverage.sourceExclusions.map((r) => (
                      <p key={r.id}>
                        {r.id}: {r.reason}
                      </p>
                    ))}
                  </details>
                </div>
              )}
              <ResearchInfo label="Method and evidence">
                Beginner presets, Intermediate ALL/ANY/NOT groups, and Advanced
                formulas all compile to one bounded typed AST engine. Missing
                inputs remain UNKNOWN. Executions preserve method, description,
                source snapshot and outcome. Replay requires licensed
                point-in-time adjusted history.
              </ResearchInfo>
              <details className="x1-small-details">
                <summary>Research glossary (RSI, ATR, OHLC, CAGR, XIRR, IV, PIT)</summary>
                <div className="x3-glossary-grid">
                  {RESEARCH_GLOSSARY.map((item) => (
                    <div className="x3-glossary-item" key={item.term}>
                      <strong>{item.term}</strong>
                      <p>{item.meaning}</p>
                    </div>
                  ))}
                </div>
              </details>
              <button
                className="x1-text-button"
                disabled={!canonical.value}
                onClick={() => {
                  if (canonical.value) {
                    setSavedSignature(signature);
                    window.dispatchEvent(
                      new CustomEvent("x2-research-dirty", { detail: false }),
                    );
                    share(canonical.value.formula);
                  }
                }}
              >
                <Share2 size={15} />
                Share method with a group
              </button>
            </Panel>
            <Panel title="Drafts & research memory">
              {drafts.length ? (
                <div className="x2-research-drafts">
                  {drafts.map((row) => (
                    <details key={row.id}>
                      <summary>
                        {row.name} · v{row.version}
                      </summary>
                      <div className="x1-actions">
                        <button
                          className="x1-text-button"
                          onClick={() =>
                            loadDefinition(row.payload.definition, {
                              id: row.id,
                              version: row.version,
                            })
                          }
                        >
                          Open draft
                        </button>
                        <button
                          className="x1-text-button"
                          onClick={() =>
                            loadDefinition({
                              ...row.payload.definition,
                              name: row.name.slice(0, 94) + " Copy",
                            })
                          }
                        >
                          Duplicate
                        </button>
                      </div>
                      {row.payload.versions.map((v) => (
                        <p className="x1-caption" key={v.version}>
                          v{v.version} · {moment(v.savedAt)} ·{" "}
                          {v.definition.formula}
                        </p>
                      ))}
                    </details>
                  ))}
                </div>
              ) : (
                <Empty title="Keep a working hypothesis">
                  Named drafts preserve versions independently of executed
                  scans.
                </Empty>
              )}
              <Comparison runs={runs} />
              <ResearchInfo label="History vs Graveyard">
                History includes every executed scan. Graveyard holds explicitly
                retired, invalidated or failure-reviewed hypotheses. A
                negative-only sample cannot estimate success.
              </ResearchInfo>
            </Panel>
          </div>
          {active && (
            <>
              <Panel
                title={active.name}
                kicker="Immutable execution"
                action={
                  <span className="x1-badge">
                    {active.mode} · {moment(active.created_at)}
                  </span>
                }
              >
                {(active as RichRun).redaction?.applied && (
                  <p role="status" className="x1-callout">
                    Source-licensed projection:{" "}
                    {(active as RichRun).redaction?.reason}
                  </p>
                )}
                <p>
                  {(active as RichRun).payload.description ||
                    "Existing X1 run: no description was recorded. Original evidence is unchanged."}
                </p>
                <div className="x1-result-summary">
                  {[
                    ["Universe", active.payload.results.total],
                    ["Matched", active.payload.results.matches],
                    ["Did not match", active.payload.results.failed],
                    ["Unknown", active.payload.results.unknown],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <strong>{value ?? "Withheld"}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <code className="x1-inline-code">
                  {active.payload.rule.formula}
                </code>
                <div className="x2-result-filter">
                  <label>
                    Results{" "}
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {["ALL", "PASS", "FAIL", "UNKNOWN", "WITHHELD"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Sort{" "}
                    <select
                      aria-label="Sort scan results"
                      value={resultSort}
                      onChange={(e) =>
                        setResultSort(e.target.value as "STATUS" | "SYMBOL")
                      }
                    >
                      <option value="STATUS">Matched (PASS) first</option>
                      <option value="SYMBOL">Symbol (A–Z)</option>
                    </select>
                  </label>
                  <button
                    className="x1-text-button"
                    onClick={() => {
                      const def = (active as RichRun).payload.research;
                      if (def) loadDefinition(def);
                      else {
                        setName(active.name);
                        setDescription("");
                        setFormula(active.payload.rule.formula);
                        setLevel("ADVANCED");
                      }
                    }}
                  >
                    Use as new version
                  </button>
                </div>
                <div className="x1-scan-results">
                  {[...active.payload.results.results]
                    .filter((r) => filter === "ALL" || r.status === filter)
                    .sort((a, b) => {
                      if (resultSort === "SYMBOL") {
                        return a.instrumentId.localeCompare(b.instrumentId);
                      }
                      const rank = (s: string) =>
                        s === "PASS" ? 0 : s === "FAIL" ? 1 : s === "UNKNOWN" ? 2 : 3;
                      return (
                        rank(a.status) - rank(b.status) ||
                        a.instrumentId.localeCompare(b.instrumentId)
                      );
                    })
                    .map((r) => {
                      const regInfo = registryInstrument(
                        r.instrumentId.replace(/^CSV:/, ""),
                      );
                      return (
                        <details key={r.instrumentId} open={r.status === "PASS"}>
                          <summary>
                            <strong>
                              {regInfo
                                ? `${regInfo.name} · ${r.instrumentId}`
                                : r.instrumentId}
                            </strong>
                            <span className="x1-badge">{r.status}</span>
                          </summary>
                          <ul>
                            {r.reasons.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                          <p className="x1-caption">
                            {r.source} · observation{" "}
                            {r.latestEventAt ?? "unavailable"}
                          </p>
                          <button
                            className="x1-text-button"
                            onClick={() =>
                              openAsset(r.instrumentId.replace(/^CSV:/, ""))
                            }
                          >
                            Asset research
                            <ArrowUpRight size={14} />
                          </button>
                        </details>
                      );
                    })}
                </div>
                <details className="x1-small-details">
                  <summary>Snapshot & reproducibility</summary>
                  <p>{active.payload.knownAtPolicy}</p>
                  <p>
                    Stored snapshot SHA-256 <code>{active.digest}</code>
                  </p>
                  {(active as RichRun).digestVerifiableFromResponse ===
                    false && (
                    <p className="x1-caption">
                      This response is a metadata/redacted projection. Its JSON
                      cannot be used to recompute the full stored-snapshot
                      digest.
                    </p>
                  )}
                  <p>One-time execution; no continuous monitoring or orders.</p>
                </details>
              </Panel>
              <div className="x2-probability-grid">
                <EvidencePanel scanId={active.id} selectRun={setSelected} />
                <ReplayPanel run={active} />
              </div>
            </>
          )}
          <Panel
            title="Research history"
            action={
              <div className="x1-segment">
                {["Scan History", "Graveyard"].map((t) => (
                  <button
                    key={t}
                    aria-pressed={historyTab === t}
                    onClick={() => setHistoryTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            }
          >
            <div className="x2-history-tools">
              <input
                type="search"
                aria-label="Search scan history"
                placeholder="Find a named hypothesis…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <span>{history.length} loaded</span>
            </div>
            {history.length ? (
              history.map((run) => (
                <div className="x1-history-row" key={run.id}>
                  <button
                    className="x1-asset-button"
                    onClick={() => setSelected(run.id)}
                  >
                    <strong>{run.name}</strong>
                    <span>
                      {moment(run.created_at)} ·{" "}
                      {run.payload.results.matches ?? "Withheld"} matches ·{" "}
                      {run.payload.results.unknown ?? "Withheld"} UNKNOWN
                    </span>
                  </button>
                  <button
                    className="x1-text-button"
                    onClick={() => setReview(run)}
                  >
                    {grave.has(run.id) ? "Review / restore" : "Review"}
                  </button>
                </div>
              ))
            ) : (
              <Empty
                title={
                  historyTab === "Graveyard"
                    ? "No retired hypotheses"
                    : "No matching history"
                }
              >
                Saved executions appear here; no synthetic research history is
                generated.
              </Empty>
            )}
            {nextCursor && (
              <button
                className="x1-secondary"
                disabled={!!busy}
                onClick={loadOlder}
              >
                Load older history
              </button>
            )}
            {workspace?.scanEventsHasMore && (
              <p className="x1-caption">
                Recent 500 review events shown. Full per-scan state is resolved
                server-side.
              </p>
            )}
          </Panel>
        </>
      )}
      {panel === "Market Radar" && (
        <>
          <Panel title="Market Radar">
            <div className="x2-radar-buttons">
              {[
                ["Oversold", "rsi(close,14) < 30", "Needs daily closes"],
                ["Overbought", "rsi(close,14) > 70", "Needs daily closes"],
                [
                  "Above recent mean",
                  "close > sma(close,20)",
                  "Needs 20 observations",
                ],
                [
                  "Breakout",
                  "close > max(lag(high,1),lag(high,2))",
                  "Needs entitled OHLC",
                ],
                [
                  "Unusual volume",
                  "volume > sma(volume,20) * 2",
                  "Needs entitled volume",
                ],
                [
                  "Upcoming earnings",
                  "earningsindays <= 7",
                  "Needs verified event times",
                ],
              ].map(([label, method, requires]) => (
                <button
                  key={label}
                  onClick={() => {
                    setFormula(method);
                    setLevel("ADVANCED");
                    setName(label + " research");
                    setDescription(
                      "Test " +
                        label.toLowerCase() +
                        " under the selected source and timeframe; missing fields remain UNKNOWN.",
                    );
                    setPanel("Soul Scan");
                    setPreflight(null);
                  }}
                >
                  <h3>{label}</h3>
                  <span>{requires} · Open editable method</span>
                </button>
              ))}
            </div>
          </Panel>
          <FinancialCalendar />
        </>
      )}
      {panel === "Formula Lab" && <FormulaLab notify={notify} />}
      {review && (
        <Modal title="Review hypothesis" onClose={() => setReview(null)}>
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
              )
                pending.current = {
                  kind: "review",
                  signature: sig,
                  id: crypto.randomUUID(),
                };
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
                notify("Review saved; original scan preserved.");
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
            <p className="x1-caption">
              A personal post-mortem is not a verified outcome or probability.
            </p>
            <button className="x1-primary" disabled={!!busy}>
              {busy || "Save review"}
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
