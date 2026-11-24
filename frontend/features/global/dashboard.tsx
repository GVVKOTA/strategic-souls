"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  Trash2,
  MoveUp,
  MoveDown,
  RefreshCw,
  Image as ImageIcon,
  SlidersHorizontal,
  Star,
  Info,
  X,
} from "lucide-react";
import {
  PORTFOLIO_BACKDROP_PRESETS,
  resolvePortfolioBackdropPreset,
} from "../../../backend/services/profile/banners";
import type {
  PortfolioBackdropSettings,
  UserProfileSnapshot,
} from "../../../backend/services/profile/profile";
import {
  X2_INSTRUMENTS,
  registryInstrument,
  searchCanonicalInstruments,
} from "../../../backend/services/market-data/instrument-registry";
import { INSTRUMENTS } from "../../../backend/services/market-data/instruments";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import { CURRENCIES } from "../../../backend/engines/portfolio";
import {
  Panel,
  Empty,
  SourceLink,
  Modal,
  WorkspaceSkeleton,
  api,
  number,
  formatQuantity,
  formatCurrency,
  moment,
  type WorkspaceState,
  type Notice,
} from "../../components/workspace/shared";
import { IconPortfolio, IconWatchlist } from "../../components/workspace/ss-icons";
import { triggerGoFeedback } from "../../components/workspace/go-feedback";
import type {
  GlobalView,
  IntelligenceSubView,
} from "../../components/workspace/global-menu";
import MarketOverviewGrid from "./market-grid";
import EconomicCalendar, {
  type EconomicEventChartContext,
} from "./economic-calendar";
import PortfolioAllocation from "./portfolio-allocation";
import MarketIntelligenceNews from "./market-intelligence";
import SectorExplorer from "./sector-explorer";
import DailyMarketPulse from "./daily-pulse";
import StrategicGlobe from "./strategic-globe";
import type {
  CountryProfile,
  DailyBriefingItem,
  NaturalHazardEvent,
  NewsArticle,
  OfficialAgencyPortal,
} from "../../../backend/services/intelligence/news-and-disasters";
import type { GeopoliticalExposurePathway } from "../../../backend/services/market-data/sectors-and-ecosystem";
import type { WatchRegionsState } from "../../../backend/services/user/preferences-store";

type IntelligenceApiPayload = {
  asOfUTC: string;
  news: {
    status: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE";
    providerName: string;
    fetchedAtUTC: string;
    articles: NewsArticle[];
    officialPortals: readonly OfficialAgencyPortal[];
    note: string;
  };
  hazards: {
    events: NaturalHazardEvent[];
    usgsStatus: "CONNECTED" | "UNAVAILABLE";
    eonetStatus: "CONNECTED" | "UNAVAILABLE";
    fetchedAtUTC: string;
  };
  briefing: {
    asOfUTC: string;
    items: DailyBriefingItem[];
    emptyMessage: string;
  };
  countries: readonly CountryProfile[];
  geopoliticsPathways: readonly GeopoliticalExposurePathway[];
  watchRegions: WatchRegionsState | null;
};
const AssetTerminal = lazy(() => import("./asset-terminal"));

type Props = {
  data: MarketSnapshot | null;
  workspace: WorkspaceState | null;
  authenticated?: boolean;
  isOwner?: boolean;
  onRequireAuth?: () => void;
  reload: () => Promise<void>;
  notify: Notice;
  analyze: (
    formula?: string,
    instrumentId?: string,
    universePreset?:
      | "INDIAN_EQUITIES"
      | "MCX_FUTURES"
      | "MY_WATCHLIST"
      | "ECB_DAILY"
      | "CUSTOM_CSV",
    watchlistId?: string,
  ) => void;
  openAsset: (id: string) => void;
  openEventChart?: (ctx: EconomicEventChartContext) => void;
  refreshData: () => void;
  refreshing?: boolean;
  globalView: GlobalView;
  onGlobalViewChange: (view: GlobalView, sub?: IntelligenceSubView) => void;
  intelligenceSubView: IntelligenceSubView;
  onIntelligenceSubViewChange: (sub: IntelligenceSubView) => void;
  onNavigate?: (view: "Global" | "Strategy" | "Community") => void;
  earthQuality?: "auto" | "balanced" | "reduced";
  portfolioBackdrop?: PortfolioBackdropSettings;
  privateTickerEnabled?: boolean;
  privateTickerMode?: "HOLDINGS" | "WATCHLIST";
  onProfileSynced?: (profile: UserProfileSnapshot) => void;
};
export function assetName(id: string, data: MarketSnapshot | null) {
  return (
    [...(data?.quotes || []), ...(data?.yields || [])].find((q) => q.id === id)
      ?.label ||
    registryInstrument(id)?.name ||
    INSTRUMENTS.find((q) => q.id === id)?.name ||
    id
  );
}
export function AssetDialog({
  id,
  data,
  authenticated = true,
  isOwner = false,
  inWatchlist = false,
  watchlistBusy = false,
  onToggleWatchlist,
  eventContext = null,
  onSelectAsset,
  onRequireAuth,
  onClose,
  analyze,
  notify,
}: {
  id: string;
  data: MarketSnapshot | null;
  authenticated?: boolean;
  isOwner?: boolean;
  inWatchlist?: boolean;
  watchlistBusy?: boolean;
  onToggleWatchlist?: (instrumentId: string) => void;
  eventContext?: EconomicEventChartContext | null;
  onSelectAsset?: (nextId: string) => void;
  onRequireAuth?: () => void;
  onClose: () => void;
  analyze: (formula?: string, instrumentId?: string) => void;
  notify: Notice;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="ss-v31-asset-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="ss-v31-asset-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${assetName(id, data)} research`}
        tabIndex={-1}
      >
        <Suspense
          fallback={
            <WorkspaceSkeleton
              label="Loading asset research terminal…"
              kind="terminal"
            />
          }
        >
          <AssetTerminal
            id={id}
            authenticated={authenticated}
            isOwner={isOwner}
            inWatchlist={inWatchlist}
            watchlistBusy={watchlistBusy}
            onToggleWatchlist={onToggleWatchlist}
            eventContext={eventContext}
            onSelectAsset={onSelectAsset}
            onRequireAuth={onRequireAuth}
            onClose={onClose}
            onAnalyze={analyze}
            notify={notify}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default function Global({
  data,
  workspace,
  authenticated = true,
  isOwner = false,
  onRequireAuth,
  reload,
  notify,
  analyze,
  openAsset,
  openEventChart,
  refreshData,
  refreshing = false,
  globalView,
  onGlobalViewChange,
  intelligenceSubView,
  onIntelligenceSubViewChange,
  onNavigate,
  earthQuality = "auto",
  portfolioBackdrop,
  privateTickerEnabled = false,
  privateTickerMode = "HOLDINGS",
  onProfileSynced,
}: Props) {
  const [listId, setListId] = useState(""),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<
      "list" | "portfolio" | "transaction" | "rename" | null
    >(null),
    [busy, setBusy] = useState(false),
    [backdropEditorOpen, setBackdropEditorOpen] = useState(false),
    [backdropDraft, setBackdropDraft] = useState<PortfolioBackdropSettings>(
      portfolioBackdrop ?? {
        presetId: "b01",
        position: "center",
        overlay: 0.72,
        blur: 4,
      },
    ),
    [uploadMessage, setUploadMessage] = useState("");

  useEffect(() => {
    if (!portfolioBackdrop) return;
    queueMicrotask(() => setBackdropDraft(portfolioBackdrop));
  }, [portfolioBackdrop]);

  const [intel, setIntel] = useState<IntelligenceApiPayload | null>(null);
  const [intelLoading, setIntelLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setIntelLoading(true);
    });
    api<IntelligenceApiPayload>("/api/intelligence")
      .then((res) => {
        if (alive) setIntel(res);
      })
      .catch(() => {
        /* Fail quietly with component fallbacks */
      })
      .finally(() => {
        if (alive) setIntelLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authenticated]);

  async function saveBackdropSettings() {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        {
          action: "update-profile",
          portfolioBackdrop: backdropDraft,
        },
      );
      onProfileSynced?.(res.profile);
      setBackdropEditorOpen(false);
      triggerGoFeedback(
        "Portfolio banner saved",
        `portfolio-banner-${backdropDraft.presetId}-${Date.now()}`,
      );
      notify("Portfolio banner saved.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save backdrop.", true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTickerSetting(
    nextEnabled: boolean,
    nextMode: "HOLDINGS" | "WATCHLIST" = privateTickerMode,
  ) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        {
          action: "update-preferences",
          privateTickerEnabled: nextEnabled,
          privateTickerMode: nextMode,
        },
      );
      onProfileSynced?.(res.profile);
      notify(
        nextEnabled
          ? `Private ${nextMode === "HOLDINGS" ? "Holdings" : "Watchlist"} ticker enabled across your dashboards.`
          : "Private ticker hidden.",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update ticker preference.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleBackdropFileUpload(file: File | null) {
    if (!file) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setUploadMessage("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", "portfolio-backdrop");
    try {
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        setUploadMessage(
          json.error ||
            "Object storage (R2) is not configured yet. Choose one of the 8 curated Obsidian backdrops below.",
        );
        return;
      }
      setUploadMessage("Backdrop uploaded.");
    } catch {
      setUploadMessage(
        "Upload failed. Choose one of the 8 curated Obsidian backdrops below.",
      );
    }
  }

  const lists = workspace?.records.filter((r) => r.kind === "watchlist") || [],
    activeList = lists.find((l) => l.id === listId) || lists[0],
    portfolios = workspace?.portfolios || [],
    [portfolioId, setPortfolioId] = useState("");
  const portfolio =
    portfolios.find((p) => p.id === portfolioId) || portfolios[0];
  const totalWatchlistItems = lists.reduce(
    (sum, l) => sum + (l.payload.items?.length ?? 0),
    0,
  );

  const registry = useMemo(
    () => [
      ...[...(data?.quotes || []), ...(data?.yields || [])].map((q) => ({
        id: q.id,
        label: q.id.split(":")[1] ?? q.id,
        name: q.label,
        kind: q.assetClass,
        assetClass: q.assetClass,
        market: q.provider,
        aliases: [q.label],
      })),
      ...X2_INSTRUMENTS.map((i) => ({
        id: i.id,
        label: i.label,
        name: i.name,
        kind: i.assetClass,
        assetClass: i.assetClass,
        market: i.market,
        aliases: i.aliases,
        sector: i.sector,
      })),
    ],
    [data],
  );
  const filtered = useMemo(
    () => searchCanonicalInstruments(search, registry, { limit: 40 }),
    [registry, search],
  );
  const [txDefaultKind, setTxDefaultKind] = useState<string>("BUY");
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("ss-v3-welcome-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const pendingWrite = useRef<{ signature: string; id: string } | null>(null);
  const openEditor = (
    kind: "list" | "portfolio" | "transaction" | "rename",
    defaultTxKind = "BUY",
  ) => {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (kind === "transaction") setTxDefaultKind(defaultTxKind);
    setEdit(kind);
  };
  async function mutate(input: Record<string, unknown>) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (input.requestId) {
      const signature = JSON.stringify({ ...input, requestId: undefined });
      if (pendingWrite.current?.signature !== signature)
        pendingWrite.current = { signature, id: String(input.requestId) };
      input = { ...input, requestId: pendingWrite.current.id };
    }
    setBusy(true);
    try {
      await api("/api/x1/workspace", input);
      await reload();
      pendingWrite.current = null;
      const action = String(input.action ?? "");
      const goLabel =
        action === "transaction"
          ? "Transaction saved"
          : action === "create-portfolio"
            ? "Portfolio created"
            : action === "list-items"
              ? "Watchlist updated"
              : action === "create-list"
                ? "Watchlist created"
                : "Workspace updated";
      triggerGoFeedback(
        goLabel,
        `workspace-${action}-${crypto.randomUUID()}`,
        action === "list-items",
      );
      notify("Saved to your private workspace.");
      setEdit(null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const updateItems = (items: string[]) =>
    activeList &&
    mutate({
      action: "list-items",
      id: activeList.id,
      version: activeList.version,
      items,
    });

  const focusedHeaderTitle: Record<Exclude<GlobalView, "DASHBOARD">, string> = {
    INTELLIGENCE: "Market Intelligence / Economic Calendar",
    HEATMAP: "Heatmap",
    GLOBE_FOCUS: "Strategic Globe",
    PORTFOLIO: "My Portfolio",
    WATCHLISTS: "Watchlists",
    MARKET_EXPLORER: "Data Coverage & Sources",
  };

  return (
    <>
      {globalView !== "DASHBOARD" && (
        <header className="x53-focused-bar">
          <div className="x53-focused-bar-left">
            <button
              type="button"
              className="x1-secondary x53-back-btn"
              onClick={() => onGlobalViewChange("DASHBOARD")}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Back to Dashboard</span>
            </button>
            <h1 className="x53-focused-title">{focusedHeaderTitle[globalView]}</h1>
          </div>
          <div className="x1-actions" style={{ gap: 6 }}>
            <button
              type="button"
              className="x1-secondary"
              style={{ minHeight: 38, fontSize: "0.82rem" }}
              onClick={refreshData}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCw size={14} />
              <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
            </button>
            {globalView === "MARKET_EXPLORER" && onNavigate && (
              <button
                type="button"
                className="x51-accent-btn"
                style={{ minHeight: 38, fontSize: "0.82rem" }}
                onClick={() => onNavigate("Strategy")}
              >
                <span>Soul Scan</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </header>
      )}

      {/* =====================================================================
          MAIN GLOBAL OVERVIEW — STRICTLY 4 CONTENT BLOCKS (X5.3 Section 02):
          A. Centered "Strategic Dashboard" + 9 Market Cards
          B. My Portfolio & Watchlist (compact overview; details on click)
          C. Enlarged, Truly Zoomable 3D Strategic Globe (NO 2D map)
          D. Redesigned Economic Calendar (at very bottom)
         ===================================================================== */}
      {globalView === "DASHBOARD" && (
        <div className="x53-dashboard-stack" data-global-layout="x53-4-blocks">
          {/* BLOCK A: Centered "Strategic Dashboard" + 8 Market Tiles */}
          <MarketOverviewGrid
            authenticated={authenticated}
            onOpenAsset={openAsset}
            onRequireAuth={onRequireAuth}
            onCelebration={(label, mutationId) =>
              triggerGoFeedback(label, mutationId)
            }
            notify={notify}
          />

          {/* Lightweight Dismissible First-Use Welcome Checklist (Sec 18.1) */}
          {authenticated &&
            !welcomeDismissed &&
            ((workspace?.scans.length ?? 0) === 0 ||
              totalWatchlistItems === 0 ||
              !portfolio) && (
              <section
                className="ss-v3-welcome-card"
                aria-label="Getting started checklist"
              >
                <div className="ss-v3-welcome-head">
                  <div>
                    <h2>Start with Strategic Souls</h2>
                    <p className="x1-caption" style={{ margin: 0 }}>
                      Three quick steps to set up your private research workspace.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="x1-icon-button"
                    aria-label="Dismiss getting started checklist"
                    onClick={() => {
                      setWelcomeDismissed(true);
                      try {
                        window.localStorage.setItem("ss-v3-welcome-dismissed", "1");
                      } catch {
                        /* Ignore storage failure */
                      }
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="ss-v3-welcome-steps">
                  <button
                    type="button"
                    className={
                      "ss-v3-welcome-step" +
                      (totalWatchlistItems > 0 ? " is-done" : "")
                    }
                    onClick={() => onGlobalViewChange("WATCHLISTS")}
                  >
                    <small>{totalWatchlistItems > 0 ? "Done" : "Step 1"}</small>
                    <strong>Build a Watchlist</strong>
                    <span className="x1-caption">
                      Track NIFTY, SENSEX, Gold, or equities you study.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={
                      "ss-v3-welcome-step" +
                      ((workspace?.scans.length ?? 0) > 0 ? " is-done" : "")
                    }
                    onClick={() => onNavigate?.("Strategy")}
                  >
                    <small>
                      {(workspace?.scans.length ?? 0) > 0 ? "Done" : "Step 2"}
                    </small>
                    <strong>Run Your First Soul Scan</strong>
                    <span className="x1-caption">
                      Classic mode is ready in one tap on Strategy.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={
                      "ss-v3-welcome-step" + (portfolio ? " is-done" : "")
                    }
                    onClick={() => onGlobalViewChange("PORTFOLIO")}
                  >
                    <small>{portfolio ? "Done" : "Step 3"}</small>
                    <strong>Set Up My Portfolio</strong>
                    <span className="x1-caption">
                      Private manual ledger with cost-basis allocation.
                    </span>
                  </button>
                </div>
              </section>
            )}

          {/* BLOCK B: Highlighted My Portfolio + Watchlist Compact Overview */}
          <section
            className="x53-pw-section"
            aria-labelledby="x53-portfolio-heading"
          >
            <div className="x53-pw-grid">
              <article className="x53-pw-card ss-v3-pw-card-featured">
                <div className="x53-pw-card-head">
                  <div className="ss-v3-pw-title-row">
                    <span className="ss-v3-icon-badge" aria-hidden="true">
                      <IconPortfolio size={20} />
                    </span>
                    <div>
                      <h2 id="x53-portfolio-heading">My Portfolio</h2>
                      <span className="x1-caption">
                        Private manual ledger · Cost basis &amp; cash flows
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="x51-accent-btn"
                    style={{ minHeight: 40, padding: "0 13px", fontSize: "0.84rem" }}
                    onClick={() =>
                      authenticated
                        ? onGlobalViewChange("PORTFOLIO")
                        : onRequireAuth?.()
                    }
                  >
                    <span>{authenticated ? "Open" : "Sign in"}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>

                {authenticated && portfolio ? (
                  <div className="x53-pw-metrics">
                    <div>
                      <small>Holdings</small>
                      <strong>{portfolio.summary.holdings.length}</strong>
                    </div>
                    <div>
                      <small>Cost basis</small>
                      <strong>
                        {formatCurrency(
                          portfolio.summary.investedCost,
                          portfolio.payload.currency,
                        )}
                      </strong>
                    </div>
                    <div>
                      <small>
                        {portfolio.summary.cash < 0
                          ? "Funding"
                          : "Recorded cash"}
                      </small>
                      <strong>
                        {portfolio.summary.cash < 0
                          ? "Not recorded"
                          : formatCurrency(
                              portfolio.summary.cash,
                              portfolio.payload.currency,
                            )}
                      </strong>
                    </div>
                  </div>
                ) : authenticated ? (
                  <div className="x53-pw-empty">
                    <span className="x1-caption">
                      No portfolio recorded yet.
                    </span>
                    <button
                      type="button"
                      className="x1-text-button"
                      onClick={() => {
                        onGlobalViewChange("PORTFOLIO");
                        setEdit("portfolio");
                      }}
                    >
                      <Plus size={14} /> Create manual portfolio
                    </button>
                  </div>
                ) : (
                  <div className="x53-pw-empty">
                    <span className="x1-caption">
                      Track private manual holdings and cost-basis allocation.
                    </span>
                    <button
                      type="button"
                      className="x1-text-button"
                      onClick={() => onRequireAuth?.()}
                    >
                      Sign in to save <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </article>

              <article className="x53-pw-card ss-v3-pw-card-watchlist">
                <div className="x53-pw-card-head">
                  <div className="ss-v3-pw-title-row">
                    <span className="ss-v3-icon-badge" aria-hidden="true">
                      <IconWatchlist size={20} />
                    </span>
                    <div>
                      <h2>Watchlist</h2>
                      <span className="x1-caption">
                        Saved instruments &amp; quick Soul Scan source
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="x1-secondary"
                    style={{ minHeight: 40, padding: "0 13px", fontSize: "0.84rem" }}
                    onClick={() =>
                      authenticated
                        ? onGlobalViewChange("WATCHLISTS")
                        : onRequireAuth?.()
                    }
                  >
                    <span>{authenticated ? "Manage" : "Sign in"}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>

                {authenticated ? (
                  <div className="x53-pw-metrics">
                    <div>
                      <small>Lists</small>
                      <strong>{lists.length}</strong>
                    </div>
                    <div>
                      <small>Tracked symbols</small>
                      <strong>{totalWatchlistItems}</strong>
                    </div>
                    <div>
                      <small>Active list</small>
                      <strong>{activeList ? activeList.name : "None"}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="x53-pw-empty">
                    <span className="x1-caption">
                      Build private watchlists across FX, indices, and equities.
                    </span>
                    <button
                      type="button"
                      className="x1-text-button"
                      onClick={() => onRequireAuth?.()}
                    >
                      Sign in to save <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </article>
            </div>
          </section>

          {/* BLOCK C: ONE Much Bigger, Truly Zoomable 3D Strategic Globe (NO 2D Map) */}
          <StrategicGlobe
            data={data}
            hazards={intel?.hazards.events ?? []}
            briefing={intel?.briefing ?? null}
            countries={intel?.countries ?? []}
            geopoliticsPathways={intel?.geopoliticsPathways ?? []}
            watchRegions={intel?.watchRegions ?? null}
            authenticated={authenticated}
            onRequireAuth={onRequireAuth}
            onWatchRegionsChange={(next) =>
              setIntel((prev) => (prev ? { ...prev, watchRegions: next } : prev))
            }
            onOpenAsset={openAsset}
            earthQuality={earthQuality}
            notify={notify}
          />

          {/* BLOCK D: Redesigned Economic Calendar — ALWAYS LAST BLOCK */}
          <EconomicCalendar
            authenticated={authenticated}
            onRequireAuth={onRequireAuth}
            onOpenEventChart={openEventChart}
            notify={notify}
          />
        </div>
      )}

      {/* =====================================================================
          FOCUSED VIEW 2: Market Intelligence / Economic Calendar
          Compact internal tabs: [ Headlines | Calendar | Market Vox ]
         ===================================================================== */}
      {globalView === "INTELLIGENCE" && (
        <div className="x53-focused-stack">
          <div
            className="x53-subtabs"
            role="tablist"
            aria-label="Market Intelligence and Economic Calendar tabs"
          >
            {(
              [
                ["HEADLINES", "Headlines"],
                ["CALENDAR", "Calendar"],
                ["MARKET_VOX", "Market Vox"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={intelligenceSubView === id}
                className={
                  "x53-subtab" + (intelligenceSubView === id ? " is-active" : "")
                }
                onClick={() => onIntelligenceSubViewChange(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {intelligenceSubView === "HEADLINES" && (
            <MarketIntelligenceNews
              news={intel?.news ?? null}
              loading={intelLoading}
              onOpenAsset={openAsset}
            />
          )}
          {intelligenceSubView === "CALENDAR" && (
            <EconomicCalendar
              authenticated={authenticated}
              onRequireAuth={onRequireAuth}
              onOpenEventChart={openEventChart}
              notify={notify}
            />
          )}
          {intelligenceSubView === "MARKET_VOX" && (
            <DailyMarketPulse
              authenticated={authenticated}
              onRequireAuth={onRequireAuth}
              notify={notify}
            />
          )}
        </div>
      )}

      {/* =====================================================================
          FOCUSED VIEW 3: Heatmap (NSE Sector Explorer & Asset Comparison)
         ===================================================================== */}
      {globalView === "HEATMAP" && (
        <div className="x53-focused-stack">
          <SectorExplorer key={authenticated ? "member" : "guest"} data={data} onOpenAsset={openAsset} />
        </div>
      )}

      {/* =====================================================================
          FOCUSED VIEW 4: Strategic Globe (Immersive Focus on Same ONE 3D Earth)
         ===================================================================== */}
      {globalView === "GLOBE_FOCUS" && (
        <div className="x53-focused-stack">
          <StrategicGlobe
            data={data}
            hazards={intel?.hazards.events ?? []}
            briefing={intel?.briefing ?? null}
            countries={intel?.countries ?? []}
            geopoliticsPathways={intel?.geopoliticsPathways ?? []}
            watchRegions={intel?.watchRegions ?? null}
            authenticated={authenticated}
            onRequireAuth={onRequireAuth}
            onWatchRegionsChange={(next) =>
              setIntel((prev) => (prev ? { ...prev, watchRegions: next } : prev))
            }
            onOpenAsset={openAsset}
            earthQuality={earthQuality}
            focused
            notify={notify}
          />
        </div>
      )}

      {globalView === "WATCHLISTS" && (
        <div className="x1-work-grid">
          <Panel
            title="Your lists"
            action={
              <button
                className="x1-secondary x1-motion-button"
                onClick={() => openEditor("list")}
              >
                <Plus size={16} />
                New list
              </button>
            }
          >
            <div className="x1-list-tabs">
              {lists.map((l) => (
                <button
                  key={l.id}
                  aria-pressed={activeList?.id === l.id}
                  onClick={() => setListId(l.id)}
                >
                  <Star size={15} />
                  {l.name}
                </button>
              ))}
            </div>
            {activeList ? (
              <>
                <div className="x1-panel-head">
                  <p>
                    {activeList.payload.items?.length || 0} saved instruments
                  </p>
                  <div className="x1-actions">
                    <button type="button" className="x1-secondary" disabled={!activeList.payload.items?.length}
                      onClick={() => analyze(undefined, undefined, "MY_WATCHLIST", activeList.id)}>
                      Scan this watchlist
                    </button>
                    <button
                      className="x1-text-button"
                      onClick={() => setEdit("rename")}
                    >
                      Rename
                    </button>
                    <button
                      className="x1-text-button"
                      onClick={() =>
                        mutate({
                          action: "archive-record",
                          id: activeList.id,
                          version: activeList.version,
                        })
                      }
                    >
                      Archive list
                    </button>
                  </div>
                </div>
                {activeList.payload.items?.length ? (
                  activeList.payload.items.map((id, i, items) => (
                    <div className="x1-list-item" key={id}>
                      <button
                        className="x1-asset-button"
                        onClick={() => openAsset(id)}
                      >
                        <strong>{assetName(id, data)}</strong>
                        <span>{id}</span>
                      </button>
                      <div className="x1-actions">
                        <button
                          className="x1-icon-button"
                          disabled={busy || i === 0}
                          aria-label={"Move " + assetName(id, data) + " up"}
                          onClick={() => {
                            const copy = [...items];
                            [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                            updateItems(copy);
                          }}
                        >
                          <MoveUp size={16} />
                        </button>
                        <button
                          className="x1-icon-button"
                          disabled={busy || i === items.length - 1}
                          aria-label={"Move " + assetName(id, data) + " down"}
                          onClick={() => {
                            const copy = [...items];
                            [copy[i + 1], copy[i]] = [copy[i], copy[i + 1]];
                            updateItems(copy);
                          }}
                        >
                          <MoveDown size={16} />
                        </button>
                        <button
                          className="x1-icon-button"
                          disabled={busy}
                          aria-label={"Remove " + assetName(id, data)}
                          onClick={() =>
                            updateItems(items.filter((x) => x !== id))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty title="A clean slate">
                    Search and add an instrument from the registry.
                  </Empty>
                )}
              </>
            ) : (
              <Empty title="Create your first list">
                Your lists are private and saved across sessions.
              </Empty>
            )}
            {!!workspace?.archivedRecords?.length && (
              <details className="x1-small-details">
                <summary>
                  Archived lists ({workspace.archivedRecords.length})
                </summary>
                {workspace.archivedRecords
                  .filter((r) => r.kind === "watchlist")
                  .map((r) => (
                    <div className="x1-panel-head" key={r.id}>
                      <span>{r.name}</span>
                      <button
                        className="x1-text-button"
                        disabled={busy}
                        onClick={() =>
                          mutate({
                            action: "restore-record",
                            id: r.id,
                            version: r.version,
                          })
                        }
                      >
                        Restore list
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  ))}
              </details>
            )}
          </Panel>
          <Panel title="Find an instrument" kicker="Exact identity matters">
            <label className="x1-search">
              <Search size={17} />
              <input
                aria-label="Search instruments"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search FX, yields, indices…"
              />
            </label>
            <div className="x1-search-results">
              {filtered.map((i) => (
                <div className="x1-list-item" key={i.id}>
                  <button
                    className="x1-asset-button"
                    onClick={() => openAsset(i.id)}
                  >
                    <strong>{i.name}</strong>
                    <span>
                      {i.id} · {i.kind}
                    </span>
                  </button>
                  <button
                    className="x1-icon-button"
                    aria-label={"Add " + i.name + " to watchlist"}
                    disabled={
                      busy ||
                      !activeList ||
                      activeList.payload.items?.includes(i.id)
                    }
                    onClick={() =>
                      updateItems([...(activeList?.payload.items || []), i.id])
                    }
                  >
                    <Plus size={17} />
                  </button>
                </div>
              ))}
            </div>
            <p className="x1-caption">
              An instrument identity is not a quote entitlement. Unconnected
              values stay unavailable.
            </p>
          </Panel>
        </div>
      )}
      {globalView === "PORTFOLIO" && (
        <>
          {(() => {
            const activePreset = resolvePortfolioBackdropPreset(backdropDraft.presetId);
            return (
              <div className="x51-portfolio-hero">
                <div
                  className="x51-portfolio-backdrop-layer"
                  style={{
                    background: activePreset.gradient,
                    backgroundPosition: backdropDraft.position,
                    filter:
                      backdropDraft.blur > 0
                        ? `blur(${backdropDraft.blur}px)`
                        : undefined,
                  }}
                  aria-hidden="true"
                />
                <div
                  className="x51-portfolio-scrim"
                  style={{
                    background: `rgba(7, 8, 9, ${backdropDraft.overlay})`,
                  }}
                  aria-hidden="true"
                />
                <div className="x51-portfolio-hero-inner">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, color: "var(--x1-title-blue)" }}>
                          My Portfolio
                        </h2>
                        <span className="x51-pill x51-pill-green">Private Manual Ledger</span>
                      </div>
                      <p className="x1-caption" style={{ margin: "4px 0 0" }}>
                        Private to your account · Cost basis &amp; cash flows only
                      </p>
                    </div>
                    <div className="x1-actions" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="x1-secondary"
                        style={{ minHeight: 40, fontSize: "0.84rem" }}
                        onClick={() => setBackdropEditorOpen(true)}
                      >
                        <ImageIcon size={14} aria-hidden="true" />
                        <span>Change Banner</span>
                      </button>
                      <button
                        type="button"
                        className="x1-secondary"
                        style={{ minHeight: 40, fontSize: "0.84rem" }}
                        disabled={busy}
                        onClick={() =>
                          void toggleTickerSetting(!privateTickerEnabled)
                        }
                      >
                        <SlidersHorizontal size={14} aria-hidden="true" />
                        <span>
                          {privateTickerEnabled
                            ? "Hide Private Ticker"
                            : "Show Private Ticker"}
                        </span>
                      </button>
                      <button
                        className="x1-secondary x1-motion-button"
                        style={{ minHeight: 40, fontSize: "0.84rem" }}
                        onClick={() => openEditor("portfolio")}
                      >
                        <Plus size={15} aria-hidden="true" />
                        <span>New portfolio</span>
                      </button>
                    </div>
                  </div>

                  <div className="x1-list-tabs">
                    {portfolios.map((p) => (
                      <button
                        key={p.id}
                        aria-pressed={portfolio?.id === p.id}
                        onClick={() => setPortfolioId(p.id)}
                      >
                        {p.name} · {p.payload.currency}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {backdropEditorOpen && (
            <Modal
              title="Change Portfolio Banner"
              onClose={() => setBackdropEditorOpen(false)}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p className="x1-caption" style={{ margin: 0 }}>
                  Curated Portfolio backdrops — saved independently from your public Profile banner.
                </p>

                {/* Live Preview Strip */}
                {(() => {
                  const previewPreset = resolvePortfolioBackdropPreset(
                    backdropDraft.presetId,
                  );
                  return (
                    <div
                      className="x51-portfolio-hero"
                      style={{ marginBottom: 0, minHeight: 86, padding: 14 }}
                    >
                      <div
                        className="x51-portfolio-backdrop-layer"
                        style={{
                          background: previewPreset.gradient,
                          backgroundPosition: backdropDraft.position,
                          filter:
                            backdropDraft.blur > 0
                              ? `blur(${backdropDraft.blur}px)`
                              : undefined,
                        }}
                        aria-hidden="true"
                      />
                      <div
                        className="x51-portfolio-scrim"
                        style={{
                          background: `rgba(7, 8, 9, ${backdropDraft.overlay})`,
                        }}
                        aria-hidden="true"
                      />
                      <div className="x51-portfolio-hero-inner">
                        <strong style={{ color: "var(--x1-title-blue)" }}>
                          {previewPreset.name}
                        </strong>
                        <span className="x1-caption">
                          {previewPreset.description}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="ss-v3-banner-modal-grid">
                  {PORTFOLIO_BACKDROP_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={
                        "ss-v3-banner-tile" +
                        (backdropDraft.presetId === preset.id
                          ? " is-active"
                          : "")
                      }
                      style={{ backgroundImage: preset.gradient }}
                      onClick={() =>
                        setBackdropDraft((d) => ({
                          ...d,
                          presetId: preset.id,
                        }))
                      }
                    >
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>

                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="x1-caption">Upload custom portfolio image</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) =>
                      void handleBackdropFileUpload(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {uploadMessage && (
                  <p className="x1-caption" role="status" style={{ margin: 0 }}>
                    {uploadMessage}
                  </p>
                )}

                <details className="x54-compact-details">
                  <summary style={{ cursor: "pointer", fontSize: "0.84rem", color: "var(--x1-title-blue)" }}>
                    Fine-tune framing &amp; contrast
                  </summary>
                  <div className="x1-form-grid" style={{ marginTop: 10 }}>
                    <label>
                      Crop alignment
                      <select
                        value={backdropDraft.position}
                        onChange={(e) =>
                          setBackdropDraft((d) => ({
                            ...d,
                            position: e.target.value as "top" | "center" | "bottom",
                          }))
                        }
                      >
                        <option value="top">Top</option>
                        <option value="center">Center</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </label>
                    <label>
                      Contrast scrim ({Math.round(backdropDraft.overlay * 100)}%)
                      <input
                        type="range"
                        min={0.45}
                        max={0.92}
                        step={0.02}
                        value={backdropDraft.overlay}
                        onChange={(e) =>
                          setBackdropDraft((d) => ({
                            ...d,
                            overlay: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Soft blur ({backdropDraft.blur}px)
                      <input
                        type="range"
                        min={0}
                        max={14}
                        step={1}
                        value={backdropDraft.blur}
                        onChange={(e) =>
                          setBackdropDraft((d) => ({
                            ...d,
                            blur: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                </details>

                <div className="x1-actions" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    className="x1-secondary"
                    onClick={() => setBackdropEditorOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="x1-primary"
                    disabled={busy}
                    onClick={() => void saveBackdropSettings()}
                  >
                    {busy ? "Saving…" : "Save Banner"}
                  </button>
                </div>
              </div>
            </Modal>
          )}
          {portfolio ? (
            <>
              <div className="x1-metrics x1-ledger-metrics">
                <div className="x1-data-card">
                  <span>Acquisition cost</span>
                  <strong>
                    {formatCurrency(
                      portfolio.summary.investedCost,
                      portfolio.payload.currency,
                    )}
                  </strong>
                  <span className="x1-caption">Moving-average cost basis</span>
                </div>
                <div className="x1-data-card">
                  <span>Recorded cash</span>
                  <strong>
                    {portfolio.summary.cash < 0
                      ? "Funding not recorded"
                      : formatCurrency(
                          portfolio.summary.cash,
                          portfolio.payload.currency,
                        )}
                  </strong>
                  <span className="x1-caption">
                    {portfolio.summary.cash < 0
                      ? `Unfunded buys: ${formatCurrency(Math.abs(portfolio.summary.cash), portfolio.payload.currency)}`
                      : "Net manual cash ledger"}
                  </span>
                </div>
                <div className="x1-data-card">
                  <span>Realized P/L</span>
                  <strong>
                    {formatCurrency(
                      portfolio.summary.realized,
                      portfolio.payload.currency,
                    )}
                  </strong>
                  <span className="x1-caption">Closed positions only</span>
                </div>
              </div>

              {portfolio.summary.cash < 0 && (
                <div className="ss-v3-portfolio-funding-bar" role="note">
                  <div className="ss-v3-portfolio-funding-copy">
                    <Info size={16} aria-hidden="true" />
                    <span>
                      <strong>Funding not recorded</strong> — buys were logged
                      without a matching cash deposit. Allocation reflects 100%
                      of invested cost basis.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="x51-accent-btn"
                    style={{ minHeight: 38, padding: "0 12px", fontSize: "0.82rem" }}
                    onClick={() => openEditor("transaction", "DEPOSIT")}
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span>Record deposit</span>
                  </button>
                </div>
              )}

              <PortfolioAllocation
                currency={portfolio.payload.currency || "INR"}
                cash={portfolio.summary.cash}
                holdings={portfolio.summary.holdings.map((h) => ({
                  symbol: h.symbol,
                  quantity: h.quantity,
                  basis: h.basis,
                }))}
                onRecordDeposit={() => openEditor("transaction", "DEPOSIT")}
              />
              <Panel
                title="Holdings at recorded cost"
                action={
                  <button
                    className="x1-primary x1-motion-button"
                    onClick={() => openEditor("transaction", "BUY")}
                  >
                    <Plus size={16} />
                    Add transaction
                  </button>
                }
              >
                {portfolio.summary.holdings.length ? (
                  <div className="x51-holdings-table">
                    {portfolio.summary.holdings.map((h) => (
                      <button
                        key={h.symbol}
                        type="button"
                        className="x51-holding-row"
                        onClick={() => openAsset(h.symbol)}
                        title={`Inspect ${h.symbol} in Asset Detail`}
                      >
                        <div>
                          <strong>{h.symbol}</strong>
                          <div className="x1-caption">
                            Tap for Chart &amp; Analysis
                          </div>
                        </div>
                        <span>Qty {formatQuantity(h.quantity, 4)}</span>
                        <span>
                          Avg {formatCurrency(h.averageCost, portfolio.payload.currency)}
                        </span>
                        <div>
                          <strong>
                            {formatCurrency(h.basis, portfolio.payload.currency)}
                          </strong>
                          <div className="x1-caption">Recorded cost basis</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty title="Begin with your first transaction">
                    Record a cash deposit, holding purchase, or dividend. This is
                    your private manual ledger.
                  </Empty>
                )}
                <p className="x1-caption">
                  No automatic currency conversion. Manual cost-basis records only — not a tax statement.
                </p>
              </Panel>
              <Panel title="Transaction history" kicker="Append-only records">
                <div className="x1-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Instrument</th>
                        <th>Quantity</th>
                        <th>Price / amount</th>
                        <th>Fees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace?.transactions
                        .filter((t) => t.portfolio_id === portfolio.id)
                        .map((t) => (
                          <tr key={t.id}>
                            <td>{t.payload.date}</td>
                            <td>{t.payload.kind}</td>
                            <td>{t.payload.symbol || "Cash"}</td>
                            <td>{formatQuantity(t.payload.quantity, 4)}</td>
                            <td>{formatCurrency(t.payload.price, portfolio.payload.currency)}</td>
                            <td>{formatCurrency(t.payload.fees, portfolio.payload.currency)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : (
            <Panel title="Your first private portfolio">
              <Empty
                title="Bring your holdings into view"
                action={
                  <button
                    className="x1-primary x1-motion-button"
                    onClick={() => openEditor("portfolio")}
                  >
                    {authenticated ? "Create portfolio" : "Sign in to create portfolio"}
                    <ArrowRight size={16} />
                  </button>
                }
              >
                Use a manual ledger with separate base currencies. Broker
                connections remain outside this workspace.
              </Empty>
            </Panel>
          )}
        </>
      )}
      {globalView === "MARKET_EXPLORER" && (
        <MarketExplorer
          data={data}
          authenticated={authenticated}
          isOwner={isOwner}
          onRequireAuth={onRequireAuth}
          openAsset={openAsset}
          analyze={analyze}
          notify={notify}
        />
      )}
      {edit && (
        <Modal
          title={
            edit === "list"
              ? "Create a private watchlist"
              : edit === "portfolio"
                ? "Create a manual portfolio"
                : edit === "rename"
                  ? "Rename watchlist"
                  : "Record a transaction"
          }
          onClose={() => setEdit(null)}
        >
          <form
            className="x1-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (edit === "list" || edit === "portfolio")
                mutate({
                  action: edit === "list" ? "create-list" : "create-portfolio",
                  name: f.get("name"),
                  currency: f.get("currency"),
                  requestId: crypto.randomUUID(),
                });
              else if (edit === "rename" && activeList)
                mutate({
                  action: "rename",
                  id: activeList.id,
                  version: activeList.version,
                  name: f.get("name"),
                });
              else if (portfolio)
                mutate({
                  action: "transaction",
                  portfolioId: portfolio.id,
                  version: portfolio.version,
                  requestId: crypto.randomUUID(),
                  transaction: {
                    kind: f.get("kind"),
                    symbol: f.get("symbol") || "",
                    quantity: Number(f.get("quantity")),
                    price: Number(f.get("price")),
                    fees: Number(f.get("fees")),
                    currency: portfolio.payload.currency,
                    date: f.get("date"),
                  },
                });
            }}
          >
            {edit !== "transaction" ? (
              <>
                <label>
                  Name
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={edit === "rename" ? activeList?.name : ""}
                    placeholder={
                      edit === "portfolio"
                        ? "Long-term research"
                        : "My research list"
                    }
                  />
                </label>
                {edit === "portfolio" && (
                  <label>
                    Base currency
                    <select name="currency">
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                <p className="x1-callout">
                  {portfolio?.name} · {portfolio?.payload.currency}.
                  Transactions are append-only; verify your inputs before
                  saving.
                </p>
                <label>
                  Transaction type
                  <select name="kind" defaultValue={txDefaultKind}>
                    {["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL"].map(
                      (k) => (
                        <option key={k}>{k}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Instrument / symbol
                  <input
                    name="symbol"
                    maxLength={50}
                    placeholder="Example: NSE:SBIN (manual identity)"
                  />
                </label>
                <div className="x1-form-grid">
                  <label>
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      step="any"
                      min="0"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <label>
                    Unit price / cash amount
                    <input
                      name="price"
                      type="number"
                      step="any"
                      min="0"
                      required
                    />
                  </label>
                  <label>
                    Fees
                    <input
                      name="fees"
                      type="number"
                      step="any"
                      min="0"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <label>
                    Transaction date
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={
                        data?.asOf.slice(0, 10) ||
                        new Date().toISOString().slice(0, 10)
                      }
                      max={
                        data?.asOf.slice(0, 10) ||
                        new Date().toISOString().slice(0, 10)
                      }
                    />
                  </label>
                </div>
                <p className="x1-caption">
                  Cash movements and dividends: quantity 0; amount in the price
                  field. Enter transactions in chronological order.
                </p>
              </>
            )}
            <button className="x1-primary x1-motion-button" disabled={busy}>
              {busy ? "Saving…" : "Save privately"}
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
const gaps: Record<string, { reason: string; source: string }> = {
  Markets: {
    reason:
      "Intraday equities and index data require verified display and non-display entitlements. No numeric equity feed is connected.",
    source: "https://www.nseindia.com/static/market-data/nse-data-policy",
  },
  Sectors: {
    reason:
      "A licensed sector taxonomy, benchmark constituents and performance dataset are not configured.",
    source:
      "https://www.nseindia.com/static/products-services/indices-sectoral",
  },
  Capital: {
    reason:
      "Sourced share counts, point-in-time market caps and currency conversion rules are not configured.",
    source: "https://www.world-exchanges.org/our-work/statistics",
  },
  Flows: {
    reason:
      "FII/FPI and DII exchange cash activity is published EOD, often provisional. No reusable report adapter is configured. Depository flows use a different definition.",
    source: "https://www.nseindia.com/reports/fii-dii",
  },
  Commodities: {
    reason:
      "Contracts require exact venue, denomination, expiry and display rights. Spot and futures are not interchangeable.",
    source: "https://www.cmegroup.com/market-data.html",
  },
  Crypto: {
    reason:
      "No crypto venue has verified continuous display and scanning rights. Open a provider source for its own prices.",
    source: "https://www.tradingview.com/markets/cryptocurrencies/",
  },
  Macro: {
    reason:
      "An economic-release data API is not configured. Use the shared financial calendar for approved display or original releases.",
    source: "https://data.rbi.org.in/",
  },
};
function MarketExplorer({
  data,
  openAsset,
  analyze,
}: {
  data: MarketSnapshot | null;
  authenticated?: boolean;
  isOwner?: boolean;
  onRequireAuth?: () => void;
  openAsset: (id: string) => void;
  analyze: (formula?: string, instrumentId?: string) => void;
  notify?: Notice;
}) {
  const [tab, setTab] = useState("FX");
  return (
    <>
      <div className="x1-chip-row" aria-label="Market categories">
        {["FX", "Bonds", "Markets", "Commodities", "Macro"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <Panel
        title={
          tab === "FX"
            ? "Official daily currency references"
            : tab === "Bonds"
              ? "US Treasury daily par yields"
              : tab
        }
        kicker="Data Coverage"
      >
        {tab === "FX" || tab === "Bonds" ? (
          <>
            <p className="x1-muted">
              {tab === "FX"
                ? "ECB reference rates are daily information, not executable FX prices. Cross rates disclose their calculation."
                : "US Treasury par yields are daily published percent yields, not bond prices. Changes use basis points."}
            </p>
            <div className="x1-market-grid">
              {(tab === "FX" ? data?.quotes : data?.yields)?.map((q) => (
                <button
                  key={q.id}
                  className="x1-market-item"
                  onClick={() => openAsset(q.id)}
                >
                  <span>
                    <strong>{q.label}</strong>
                    <small>{q.id}</small>
                  </span>
                  <span>
                    <strong>
                      {number(q.value, tab === "FX" ? 4 : 2)}
                      {tab === "Bonds" ? "%" : ""}
                    </strong>
                    <small>
                      {q.state.replaceAll("_", " ")} ·{" "}
                      {q.sourceDate || "No observation"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {tab === "FX" && (
              <button
                className="x1-text-button"
                onClick={() => analyze("close > sma(close, 20)")}
              >
                Filter the eligible daily FX universe
                <ArrowRight size={15} />
              </button>
            )}
          </>
        ) : (
          <Empty title="Data coverage note">
            <p>{gaps[tab]?.reason ?? "Official reference data is shown where available."}</p>
            {gaps[tab]?.source && (
              <SourceLink href={gaps[tab].source}>
                Official source and methodology
              </SourceLink>
            )}
          </Empty>
        )}
      </Panel>
      <Panel title="Official public feeds" kicker="Reference provenance">
        <div className="x1-provider-list">
          {data?.providers.map((p) => (
            <div key={p.id}>
              <div className="x1-panel-head">
                <h3>{p.label}</h3>
                <span className="x1-badge">{p.state.replaceAll("_", " ")}</span>
              </div>
              <p>{p.reason}</p>
              <p className="x1-caption">
                Observation date: {p.lastDataDate || "Unavailable"} · Last
                successful retrieval: {moment(p.lastSuccessAt)} · {p.frequency}
              </p>
              <SourceLink href={p.sourceUrl}>Provider source</SourceLink>
              <SourceLink href={p.rightsUrl}>Use and rights</SourceLink>
            </div>
          ))}
        </div>
        <p className="x1-caption">
          Official public-data API fees: $0 for the connected datasets. Site
          compute and storage are usage-dependent and unmetered here. No
          subscriptions or billing were activated.
        </p>
      </Panel>
    </>
  );
}
