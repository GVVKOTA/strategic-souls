"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Pause,
  Play,
  List,
  Globe2,
  MapPin,
  Minus,
  Star,
  Search,
  Trash2,
  MoveUp,
  MoveDown,
  ShieldCheck,
  Wallet,
  RefreshCw,
  RotateCcw,
  Image as ImageIcon,
  SlidersHorizontal,
} from "lucide-react";
import {
  BANNER_PRESETS,
  resolveBannerPreset,
} from "../../../backend/services/profile/banners";
import type {
  PortfolioBackdropSettings,
  UserProfileSnapshot,
} from "../../../backend/services/profile/profile";
import {
  EXCHANGES,
  exchangeSession,
  type Exchange,
} from "../../../backend/services/market-data/exchanges";
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
  moment,
  InfoTip,
  type WorkspaceState,
  type Notice,
} from "../../components/workspace/shared";
import ScrollTabs from "../../components/workspace/scroll-tabs";
import PrivateMarketPanel from "./private-market-panel";
import MarketOverviewGrid from "./market-grid";
import EconomicCalendar from "./economic-calendar";
import type { MapFocusTarget } from "../earth/world-conflict-map";
const AssetTerminal = lazy(() => import("./asset-terminal"));
const GlobeCanvas = lazy(() => import("./globe-canvas"));
const WorldConflictMap = lazy(() => import("../earth/world-conflict-map"));
function DeferredGlobe(props: React.ComponentProps<typeof GlobeCanvas>) {
  const host = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="x1-deferred-globe" ref={host}>
      {ready ? (
        <Suspense
          fallback={
            <div className="x1-globe-loading">Preparing satellite Earth…</div>
          }
        >
          <GlobeCanvas {...props} />
        </Suspense>
      ) : (
        <div className="x1-globe-loading">
          Satellite Earth loads as it comes into view.
        </div>
      )}
    </div>
  );
}
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
  ) => void;
  openAsset: (id: string) => void;
  refreshData: () => void;
  refreshing?: boolean;
  initialPanel?: string;
  onNavigate?: (view: "Global" | "Strategy" | "Community") => void;
  earthQuality?: "auto" | "balanced" | "reduced";
  portfolioBackdrop?: PortfolioBackdropSettings;
  privateTickerEnabled?: boolean;
  privateTickerMode?: "HOLDINGS" | "WATCHLIST";
  onProfileSynced?: (profile: UserProfileSnapshot) => void;
  sectionJump?: { target: string; nonce: number } | null;
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
  authenticated = true,
  isOwner = false,
  onRequireAuth,
  onClose,
  analyze,
  notify,
}: {
  id: string;
  data: MarketSnapshot | null;
  authenticated?: boolean;
  isOwner?: boolean;
  onRequireAuth?: () => void;
  onClose: () => void;
  analyze: (formula?: string, instrumentId?: string) => void;
  notify: Notice;
}) {
  return (
    <Modal title="Asset research" onClose={onClose}>
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
          onRequireAuth={onRequireAuth}
          onAnalyze={analyze}
          notify={notify}
        />
      </Suspense>
    </Modal>
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
  refreshData,
  refreshing = false,
  initialPanel,
  onNavigate,
  earthQuality = "auto",
  portfolioBackdrop,
  privateTickerEnabled = false,
  privateTickerMode = "HOLDINGS",
  onProfileSynced,
  sectionJump,
}: Props) {
  const [panel, setPanelState] = useState(initialPanel || "Overview"),
    [selected, setSelected] = useState<Exchange | null>(
      EXCHANGES.find((e) => e.id === "XNSE") || null,
    ),
    [globeFocusCoords, setGlobeFocusCoords] = useState<{
      lat: number;
      lon: number;
      nonce: number;
    } | null>(null),
    [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget | null>(null),
    [globeConflicts, setGlobeConflicts] = useState<
      { id: string; lat: number; lon: number }[]
    >([]),
    [selectedConflictId, setSelectedConflictId] = useState<string | null>(null),
    [region, setRegion] = useState("All"),
    [exchangeSearch, setExchangeSearch] = useState(""),
    [resetToken, setResetToken] = useState(0),
    [mode, setMode] = useState<"Globe" | "List">("Globe"),
    [auto, setAuto] = useState(true),
    [motionOverride, setMotionOverride] = useState(false),
    [zoom, setZoom] = useState(1),
    [fallback, setFallback] = useState(false),
    [rendererFallback, setRendererFallback] = useState(false),
    [tourActive, setTourActive] = useState(false),
    [listId, setListId] = useState(""),
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

  const marketsRef = useRef<HTMLDivElement>(null);
  const portfolioSectionRef = useRef<HTMLDivElement>(null);
  const calendarSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionJump) return;
    const t = sectionJump.target;
    if (t === "Portfolio" || t === "Watchlists" || t === "Market Explorer") {
      queueMicrotask(() => setPanelState(t));
      return;
    }
    queueMicrotask(() => setPanelState("Overview"));
    window.setTimeout(() => {
      if (t === "Markets") {
        marketsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (t === "My Portfolio") {
        portfolioSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (t === "Economic Calendar") {
        calendarSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (t === "Strategic Globe") {
        earthSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  }, [sectionJump]);

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
      notify("Portfolio backdrop saved.");
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
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      queueMicrotask(() => setAuto(false));
  }, []);
  useEffect(() => {
    if (!tourActive || mode !== "Globe" || rendererFallback) return;
    const hubs = ["XNSE", "XLON", "XNYS", "XTKS"]
      .map((id) => EXCHANGES.find((e) => e.id === id))
      .filter((e): e is Exchange => !!e);
    if (!hubs.length) return;
    let step = 0;
    queueMicrotask(() => {
      setRegion("All");
      setAuto(false);
      setSelected(hubs[0]);
    });
    const timer = window.setInterval(() => {
      step = (step + 1) % hubs.length;
      setSelected(hubs[step]);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [tourActive, mode, rendererFallback]);
  const setPanel = (value: string) => {
    setPanelState(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const lists = workspace?.records.filter((r) => r.kind === "watchlist") || [],
    activeList = lists.find((l) => l.id === listId) || lists[0],
    portfolios = workspace?.portfolios || [],
    [portfolioId, setPortfolioId] = useState("");
  const portfolio =
    portfolios.find((p) => p.id === portfolioId) || portfolios[0];
  const venues = useMemo(
    () => EXCHANGES.filter((e) => region === "All" || e.region === region),
    [region],
  );
  const listedVenues = venues.filter((v) =>
    (v.name + " " + v.mic + " " + v.city + " " + v.country)
      .toLowerCase()
      .includes(exchangeSearch.toLowerCase()),
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
  const pendingWrite = useRef<{ signature: string; id: string } | null>(null);
  const openEditor = (kind: "list" | "portfolio" | "transaction" | "rename") => {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
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
  const earthSectionRef = useRef<HTMLDivElement>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const currentSession =
    selected && data ? exchangeSession(selected, data.asOf) : null;
  const selectVenue = (venue: Exchange) => {
    setTourActive(false);
    setSelected(venue);
    setAuto(false);
  };
  const investigateOnMap = (venue: Exchange) => {
    setMapFocusTarget({
      lat: venue.lat,
      lon: venue.lon,
      zoom: 5.2,
      label: `${venue.city}, ${venue.country} · ${venue.mic}`,
      exchangeId: venue.id,
      nonce: Date.now(),
    });
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const viewOnGlobe = (coords: {
    lat: number;
    lon: number;
    label: string;
    exchangeId?: string;
    conflictId?: string;
  }) => {
    setMode("Globe");
    setTourActive(false);
    setAuto(false);
    if (coords.exchangeId) {
      const ex = EXCHANGES.find((e) => e.id === coords.exchangeId);
      if (ex) setSelected(ex);
    }
    if (coords.conflictId) {
      setSelectedConflictId(coords.conflictId);
    }
    setGlobeFocusCoords({ lat: coords.lat, lon: coords.lon, nonce: Date.now() });
    earthSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <>
      <ScrollTabs
        label="Global views"
        options={["Overview", "Watchlists", "Portfolio", "Market Explorer"]}
        active={panel}
        onChange={setPanel}
      />
      {panel !== "Overview" && (
        <header className="x1-page-title">
          <div>
            <h1>{panel}</h1>
            <InfoTip label="About Global">
              Published reference data and private research. Source dates and
              units accompany each value. Portfolio values are manual cost records
              until entitled valuation quotes are connected.
            </InfoTip>
          </div>
          <div className="x1-actions">
            <button
              type="button"
              className="x1-primary x1-motion-button"
              onClick={() => onNavigate?.("Strategy")}
            >
              Run a Soul Scan
              <ArrowRight size={16} />
            </button>
            <button
              className="x1-secondary x1-motion-button"
              onClick={refreshData}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCw size={16} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>
      )}
      {panel === "Overview" && (
        <div className="x51-global-stack">
          {/* 1. MARKETS — 9 Rearrangeable Cards (3×3 on Desktop & Mobile) */}
          <div ref={marketsRef}>
            <MarketOverviewGrid
              authenticated={authenticated}
              onOpenAsset={openAsset}
              onRequireAuth={onRequireAuth}
              notify={notify}
            />
          </div>

          {authenticated && isOwner && (
            <PrivateMarketPanel
              isOwner={isOwner}
              authenticated={authenticated}
              compact
              openAsset={openAsset}
              analyze={analyze}
              notify={notify}
            />
          )}

          {/* 2. MY PORTFOLIO — Summary Preview + Dedicated Full Portfolio View */}
          <section ref={portfolioSectionRef} aria-labelledby="x51-portfolio-heading">
            <div className="x51-section-head">
              <div>
                <h2 id="x51-portfolio-heading">My Portfolio</h2>
                <p className="x51-section-sub">
                  Private manual ledger · Never shared publicly · Cost basis only
                </p>
              </div>
              <div className="x1-actions" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="x1-secondary"
                  style={{ minHeight: 38, padding: "0 11px", fontSize: "0.82rem" }}
                  onClick={() => setPanel("Watchlists")}
                >
                  <Star size={14} />
                  <span>Watchlists ({workspace ? lists.length : 0})</span>
                </button>
                <button
                  type="button"
                  className="x51-accent-btn"
                  style={{ minHeight: 38, padding: "0 12px", fontSize: "0.82rem" }}
                  onClick={() => setPanel("Portfolio")}
                >
                  <Wallet size={14} />
                  <span>Open Portfolio</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
            {portfolios.length > 0 && portfolio ? (
              <div className="x51-holdings-table">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--x51-hairline)",
                    background: "var(--x51-surface-elevated)",
                  }}
                >
                  <div>
                    <strong>{portfolio.name}</strong>{" "}
                    <span className="x51-pill x51-pill-green">Manual Ledger</span>{" "}
                    <span className="x51-pill">Broker: Not Connected</span>
                  </div>
                  <div className="x1-caption" style={{ fontVariantNumeric: "tabular-nums" }}>
                    Cost basis:{" "}
                    <strong>
                      {portfolio.payload.currency} {number(portfolio.summary.investedCost)}
                    </strong>{" "}
                    · Cash:{" "}
                    <strong>
                      {portfolio.payload.currency} {number(portfolio.summary.cash)}
                    </strong>
                  </div>
                </div>
                {portfolio.summary.holdings.length > 0 ? (
                  portfolio.summary.holdings.slice(0, 5).map((h) => (
                    <button
                      key={h.symbol}
                      type="button"
                      className="x51-holding-row"
                      onClick={() => openAsset(h.symbol)}
                    >
                      <strong>{h.symbol}</strong>
                      <span>Qty {number(h.quantity, 4)}</span>
                      <span>
                        Avg {portfolio.payload.currency} {number(h.averageCost)}
                      </span>
                      <span className="x1-caption">
                        Basis {number(h.basis)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div style={{ padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="x1-caption">
                      No holdings recorded yet in {portfolio.name}.
                    </span>
                    <button
                      type="button"
                      className="x1-secondary"
                      style={{ minHeight: 36, fontSize: "0.82rem" }}
                      onClick={() => {
                        setPanel("Portfolio");
                        openEditor("transaction");
                      }}
                    >
                      <Plus size={14} />
                      <span>Record transaction</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="x51-empty-cta">
                <p className="x1-caption" style={{ margin: 0 }}>
                  Track private manual holdings and cash movements in INR, USD,
                  EUR, or GBP — with customizable Obsidian backdrops and an
                  opt-in private ticker.
                </p>
                <button
                  type="button"
                  className="x1-secondary"
                  style={{ flexShrink: 0 }}
                  onClick={() => {
                    if (!authenticated) {
                      onRequireAuth?.();
                      return;
                    }
                    setPanel("Portfolio");
                    setEdit("portfolio");
                  }}
                >
                  <Plus size={14} />
                  <span>
                    {authenticated ? "Create manual portfolio" : "Sign in to track portfolio"}
                  </span>
                </button>
              </div>
            )}
          </section>

          {/* 3. ECONOMIC CALENDAR — Official Statutory Schedules */}
          <div ref={calendarSectionRef}>
            <EconomicCalendar
              authenticated={authenticated}
              onRequireAuth={onRequireAuth}
              notify={notify}
            />
          </div>

          {/* 4. STRATEGIC GLOBE — 3D Photoreal Earth + 2D Satellite World Map */}
          <section
            className="x6-earth-showcase"
            ref={earthSectionRef}
            aria-label="Strategic Globe 3D Earth and World Map"
          >
            <Panel
              title="Strategic Globe · 3D Earth & Global Exchanges"
              kicker="Geography, sessions & sourced world intelligence"
              className="x1-globe-panel"
              action={
                <div className="x1-segment" aria-label="Exchange view">
                  {(["Globe", "List"] as const).map((m) => (
                    <button
                      key={m}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {m === "Globe" ? (
                        <Globe2 size={15} />
                      ) : (
                        <List size={15} />
                      )}
                      <span>{m}</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="x1-globe-toolbar">
                <label className="x1-inline-label">
                  Region
                  <select
                    aria-label="Exchange region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {[
                      "All",
                      "Americas",
                      "Europe",
                      "Middle East/Africa",
                      "Asia-Pacific",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <span className="x1-caption">
                  {mode === "List" ? listedVenues.length : venues.length} venues
                  · city markers
                  {globeConflicts.length > 0
                    ? ` · ${globeConflicts.length} sourced conflict markers`
                    : ""}
                </span>
              </div>
              {mode === "Globe" ? (
                <div className="x1-globe-stage">
                  <Suspense
                    fallback={
                      <div className="x1-globe-loading">
                        Preparing the exchange globe…
                      </div>
                    }
                  >
                    <DeferredGlobe
                      venues={[...venues]}
                      selected={selected}
                      autoRotate={auto}
                      motionOverride={motionOverride}
                      zoom={zoom}
                      resetToken={resetToken}
                      focusCoords={globeFocusCoords}
                      conflictPoints={globeConflicts}
                      selectedConflictId={selectedConflictId}
                      earthQuality={earthQuality}
                      onSelectConflict={(id) => {
                        setSelectedConflictId(id);
                        mapSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      onPause={() => {
                        setTourActive(false);
                        setAuto(false);
                      }}
                      onSelect={selectVenue}
                      onZoom={setZoom}
                      forceFallback={fallback}
                      onFallbackChange={setRendererFallback}
                    />
                  </Suspense>
                  <div className="x1-globe-controls">
                    <button
                      aria-label={
                        auto ? "Pause globe rotation" : "Start globe rotation"
                      }
                      aria-pressed={auto}
                      disabled={rendererFallback}
                      onClick={() => {
                        setTourActive(false);
                        setMotionOverride(true);
                        setAuto(!auto);
                      }}
                    >
                      {auto ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      aria-label="Zoom out"
                      disabled={rendererFallback || zoom <= 0.8}
                      onClick={() => setZoom((z) => Math.max(0.8, z - 0.1))}
                    >
                      <Minus size={15} />
                    </button>
                    <button
                      aria-label="Zoom in"
                      disabled={rendererFallback || zoom >= 1.35}
                      onClick={() => setZoom((z) => Math.min(1.35, z + 0.1))}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      aria-label="Reset globe view"
                      disabled={rendererFallback}
                      onClick={() => {
                        setTourActive(false);
                        setZoom(1);
                        setAuto(false);
                        setSelected(
                          EXCHANGES.find((v) => v.id === "XNSE") || null,
                        );
                        setResetToken((n) => n + 1);
                      }}
                    >
                      <RotateCcw size={15} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="x1-secondary x1-globe-tour-btn"
                    aria-pressed={tourActive}
                    disabled={rendererFallback}
                    onClick={() => setTourActive((v) => !v)}
                  >
                    {tourActive ? "Stop tour" : "Explore Earth"}
                  </button>
                  {zoom >= 1.25 && selected && (
                    <button
                      type="button"
                      className="x51-globe-zoom-cta"
                      onClick={() => investigateOnMap(selected)}
                    >
                      <MapPin size={15} />
                      <span>Open 2D Satellite Map · {selected.city}</span>
                    </button>
                  )}
                  <span className="x1-globe-hint">
                    {rendererFallback
                      ? "Natural-color static image"
                      : tourActive
                        ? "Touring 4 global hubs"
                        : "Drag to rotate · Zoom for 2D map"}
                  </span>
                </div>
              ) : (
                <div className="x1-exchange-list">
                  <label className="x1-search">
                    <Search size={16} />
                    <input
                      value={exchangeSearch}
                      onChange={(e) => setExchangeSearch(e.target.value)}
                      aria-label="Search exchanges"
                      placeholder="Find an exchange or city…"
                    />
                  </label>
                  {listedVenues.map((v) => (
                    <button
                      key={v.id}
                      aria-pressed={selected?.id === v.id}
                      onClick={() => selectVenue(v)}
                    >
                      <span>
                        <strong>{v.mic}</strong>
                        {v.city} · {v.country}
                      </span>
                      <span>
                        {data
                          ? exchangeSession(v, data.asOf).label
                          : "Schedule unknown"}
                        <ArrowUpRight size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="x1-globe-legend">
                <span>
                  <i />
                  Exchange city · grouped venues
                </span>
                <span className="x1-muted">
                  Illustrative hub connections · no capital-flow data
                </span>
              </div>
              {selected && (
                <div className="x1-exchange-detail">
                  <div>
                    <p className="x1-kicker">
                      {selected.city}, {selected.country} · {selected.mic}
                    </p>
                    <h3>{selected.name}</h3>
                    <span className="x1-caption">
                      {currentSession?.localTime ||
                        "Clock awaiting server time"}{" "}
                      · {selected.timeZone}
                    </span>
                  </div>
                  <span
                    className={
                      "x1-badge " +
                      (currentSession?.state === "OPEN"
                        ? "x1-scheduled-open"
                        : "")
                    }
                  >
                    {currentSession?.label || "Schedule unknown"}
                  </span>
                  <p className="x1-caption">
                    {currentSession?.reason || "Calendar not connected."} Index
                    data not connected.
                  </p>
                  <div className="x1-exchange-links">
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={() => investigateOnMap(selected)}
                    >
                      <MapPin size={14} />
                      Investigate on 2D Map
                    </button>
                    {EXCHANGES.filter(
                      (v) =>
                        v.clusterKey === selected.clusterKey &&
                        v.id !== selected.id,
                    ).map((v) => (
                      <button
                        key={v.id}
                        className="x1-text-button"
                        onClick={() => selectVenue(v)}
                      >
                        {v.name}
                        <ArrowRight size={13} />
                      </button>
                    ))}
                    <SourceLink href={selected.website}>
                      Open market view
                    </SourceLink>
                    <SourceLink href={selected.calendarUrl}>
                      Official calendar
                    </SourceLink>
                  </div>
                </div>
              )}
              <details className="x1-small-details">
                <summary>Accessibility and map details</summary>
                <p>
                  List view provides every venue without 3D interaction. Markers
                  use verified city coordinates, not precise exchange premises.
                  Focus the globe and use arrow keys to rotate; +/− or Ctrl +
                  wheel zooms within bounds. Session checks use the source
                  server time. Only the documented NYSE/Nasdaq 2026 core-session
                  calendars are connected; live halts are unknown.
                </p>
                <button
                  className="x1-text-button"
                  onClick={() => setFallback(!fallback)}
                >
                  {fallback
                    ? "Restore WebGL globe"
                    : "Use 2D compatibility view"}
                </button>
                <p>
                  Earth imagery: natural-color NASA Blue Marble (2002); night
                  lights: NASA Black Marble (2016); historical cloud composite.
                  Day/night lighting approximates solar orientation from the
                  current UTC clock. These textures do not show live satellite
                  weather, current night activity, or capital flows. City
                  locations: Natural Earth, public domain.
                </p>
              </details>
            </Panel>

            {/* Context bridge directly linking 3D Globe to the real 2D Satellite World Map immediately below */}
            <div className="x6-earth-bridge">
              <div className="x6-earth-bridge-meta">
                <strong>2D World Map · Synchronized with 3D Earth</strong>
                <span>
                  {selected
                    ? `Active hub: ${selected.city}, ${selected.country} (${selected.mic})`
                    : "Select any region, hub, or sourced conflict event below"}
                </span>
              </div>
              {selected && (
                <button
                  type="button"
                  className="x1-text-button"
                  onClick={() => investigateOnMap(selected)}
                >
                  Fly map to {selected.city}
                  <ArrowRight size={14} />
                </button>
              )}
            </div>

            {/* Real Licensed NASA GIBS 2D Satellite World Map & Sourced Conflict Layer IMMEDIATELY below 3D Globe */}
            <div ref={mapSectionRef}>
              <Suspense
                fallback={
                  <WorkspaceSkeleton
                    label="Loading NASA GIBS 2D World Satellite Map…"
                    kind="panel"
                  />
                }
              >
                <WorldConflictMap
                  focusTarget={mapFocusTarget}
                  externalConflictId={selectedConflictId}
                  onViewOnGlobe={viewOnGlobe}
                  onConflictsLoaded={setGlobeConflicts}
                  onOpenAsset={openAsset}
                  onSelectExchange={selectVenue}
                />
              </Suspense>
            </div>
          </section>

          <div className="x1-overview-side">
              <Panel
                title="Your watchlist"
                kicker="Private research"
                action={
                  <button
                    className="x1-icon-button"
                    aria-label="Manage watchlists"
                    onClick={() => setPanel("Watchlists")}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                }
              >
                {activeList ? (
                  <>
                    <p className="x1-caption">
                      {activeList.name} ·{" "}
                      {activeList.payload.items?.length || 0} instruments
                    </p>
                    {activeList.payload.items?.slice(0, 5).map((id) => (
                      <button
                        className="x1-quote-row"
                        key={id}
                        onClick={() => openAsset(id)}
                      >
                        <span>
                          <strong>{assetName(id, data)}</strong>
                          <small>{id}</small>
                        </span>
                        <span>
                          {number(
                            [
                              ...(data?.quotes || []),
                              ...(data?.yields || []),
                            ].find((q) => q.id === id)?.value,
                            4,
                          )}
                          <small>
                            {[
                              ...(data?.quotes || []),
                              ...(data?.yields || []),
                            ].some((q) => q.id === id)
                              ? "Daily reference"
                              : "Not connected"}
                          </small>
                        </span>
                      </button>
                    ))}
                    <button
                      className="x1-text-button"
                      onClick={() => setPanel("Watchlists")}
                    >
                      Manage watchlists
                      <ArrowRight size={15} />
                    </button>
                  </>
                ) : (
                  <Empty
                    title="Make the brief yours"
                    action={
                      <button
                        className="x1-secondary x1-motion-button"
                        onClick={() => openEditor("list")}
                      >
                        <Plus size={16} />
                        {authenticated ? "Create a watchlist" : "Sign in to create a watchlist"}
                      </button>
                    }
                  >
                    Save a private list of currencies, benchmarks and
                    instruments.
                  </Empty>
                )}
              </Panel>
              <Panel
                title="Recorded portfolio"
                kicker="Your ledger"
                action={<Wallet size={18} />}
              >
                {portfolios.length ? (
                  <>
                    {portfolios.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        className="x1-quote-row"
                        onClick={() => {
                          setPortfolioId(p.id);
                          setPanel("Portfolio");
                        }}
                      >
                        <span>
                          <strong>{p.name}</strong>
                          <small>Acquisition cost · {p.payload.currency}</small>
                        </span>
                        <strong>{number(p.summary.investedCost)}</strong>
                      </button>
                    ))}
                    <p className="x1-caption">
                      Cost basis only. Market valuations require entitled
                      quotes.
                    </p>
                  </>
                ) : (
                  <Empty
                    title="A clearer personal picture"
                    action={
                      <button
                        className="x1-text-button"
                        onClick={() => {
                          if (!authenticated) {
                            onRequireAuth?.();
                            return;
                          }
                          setPanel("Portfolio");
                          setEdit("portfolio");
                        }}
                      >
                        {authenticated ? "Add a manual portfolio" : "Sign in to track a portfolio"}
                        <ArrowRight size={15} />
                      </button>
                    }
                  >
                    Record holdings and cash movements in your own currency.
                  </Empty>
                )}
              </Panel>
              <div className="x1-source-note">
                <ShieldCheck size={19} />
                <div>
                  <strong>Source aware, always.</strong>
                  <p>
                    ECB and US Treasury publish daily observations. Live equity
                    feeds are not connected.
                  </p>
                  <button
                    className="x1-text-button"
                    onClick={() => setPanel("Market Explorer")}
                  >
                    Review data coverage
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
        </div>
      )}
      {panel === "Watchlists" && (
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
      {panel === "Portfolio" && (
        <>
          {(() => {
            const activePreset = resolveBannerPreset(backdropDraft.presetId);
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
                        <h2 style={{ margin: 0 }}>My Private Portfolio</h2>
                        <span className="x51-pill x51-pill-green">Manual Ledger</span>
                        <span className="x51-pill">Linked Broker: Not Connected</span>
                      </div>
                      <p className="x1-caption" style={{ margin: "4px 0 0" }}>
                        Private to your account · Never exposed on public profiles ·
                        Cost basis &amp; cash flows only
                      </p>
                    </div>
                    <div className="x1-actions" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="x1-secondary"
                        style={{ minHeight: 38, fontSize: "0.82rem" }}
                        onClick={() => setBackdropEditorOpen((v) => !v)}
                      >
                        <ImageIcon size={14} />
                        <span>{backdropEditorOpen ? "Close Backdrop" : "Customize Backdrop"}</span>
                      </button>
                      <button
                        type="button"
                        className="x1-secondary"
                        style={{ minHeight: 38, fontSize: "0.82rem" }}
                        disabled={busy}
                        onClick={() =>
                          void toggleTickerSetting(!privateTickerEnabled)
                        }
                      >
                        <SlidersHorizontal size={14} />
                        <span>
                          {privateTickerEnabled
                            ? "Hide Private Ticker"
                            : "Show Private Ticker"}
                        </span>
                      </button>
                      <button
                        className="x1-secondary x1-motion-button"
                        onClick={() => openEditor("portfolio")}
                      >
                        <Plus size={16} />
                        New portfolio
                      </button>
                    </div>
                  </div>

                  {backdropEditorOpen && (
                    <div
                      style={{
                        border: "1px solid var(--x51-hairline-strong)",
                        borderRadius: 12,
                        padding: 14,
                        background: "rgba(16, 18, 21, 0.94)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <strong style={{ fontSize: "0.9rem" }}>
                        Obsidian Portfolio Backdrop (contrast-guarded)
                      </strong>
                      <div className="x51-backdrop-swatches">
                        {BANNER_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={
                              "x51-backdrop-swatch" +
                              (backdropDraft.presetId === preset.id
                                ? " is-active"
                                : "")
                            }
                            style={{ background: preset.gradient }}
                            onClick={() =>
                              setBackdropDraft((d) => ({
                                ...d,
                                presetId: preset.id,
                              }))
                            }
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                      <div className="x1-form-grid">
                        <label>
                          Crop alignment
                          <select
                            value={backdropDraft.position}
                            onChange={(e) =>
                              setBackdropDraft((d) => ({
                                ...d,
                                position: e.target.value as
                                  | "top"
                                  | "center"
                                  | "bottom",
                              }))
                            }
                          >
                            <option value="top">Top</option>
                            <option value="center">Center</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </label>
                        <label>
                          Dark overlay ({Math.round(backdropDraft.overlay * 100)}%)
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
                          Subtle blur ({backdropDraft.blur}px)
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
                        <label>
                          Custom image upload (R2-gated)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) =>
                              void handleBackdropFileUpload(
                                e.target.files?.[0] ?? null,
                              )
                            }
                          />
                        </label>
                      </div>
                      {uploadMessage && (
                        <p className="x1-caption" role="status" style={{ margin: 0 }}>
                          {uploadMessage}
                        </p>
                      )}
                      <div className="x1-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                        <label className="x1-caption" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          Ticker stream:
                          <select
                            value={privateTickerMode}
                            onChange={(e) =>
                              void toggleTickerSetting(
                                true,
                                e.target.value as "HOLDINGS" | "WATCHLIST",
                              )
                            }
                          >
                            <option value="HOLDINGS">My Holdings</option>
                            <option value="WATCHLIST">My Watchlists</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="x1-primary"
                          disabled={busy}
                          onClick={() => void saveBackdropSettings()}
                        >
                          {busy ? "Saving…" : "Save Backdrop"}
                        </button>
                      </div>
                    </div>
                  )}

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
          {portfolio ? (
            <>
              <div className="x1-metrics x1-ledger-metrics">
                {[
                  ["Acquisition cost", portfolio.summary.investedCost],
                  ["Recorded cash", portfolio.summary.cash],
                  ["Realized P/L", portfolio.summary.realized],
                ].map(([k, v]) => (
                  <div className="x1-data-card" key={k}>
                    <span>
                      {k} · {portfolio.payload.currency}
                    </span>
                    <strong>{number(v as number)}</strong>
                    <span className="x1-caption">
                      Manual ledger · moving average cost
                    </span>
                  </div>
                ))}
              </div>
              <Panel
                title="Holdings at recorded cost"
                action={
                  <button
                    className="x1-primary x1-motion-button"
                    onClick={() => setEdit("transaction")}
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
                        <span>Qty {number(h.quantity, 4)}</span>
                        <span>
                          Avg {portfolio.payload.currency} {number(h.averageCost)}
                        </span>
                        <div>
                          <strong>
                            {portfolio.payload.currency} {number(h.basis)}
                          </strong>
                          <div className="x1-caption">Live MTM: Not connected</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty title="Begin with your first transaction">
                    Record a cash deposit, holding purchase or dividend. This is
                    a manual record.
                  </Empty>
                )}
                <p className="x1-caption">
                  No automatic currency conversion. Missing prices do not become
                  zero. This ledger is not a tax statement.
                </p>
                {portfolio.summary.cashNotice && (
                  <p className="x1-callout">{portfolio.summary.cashNotice}</p>
                )}
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
                            <td>{number(t.payload.quantity, 4)}</td>
                            <td>{number(t.payload.price)}</td>
                            <td>{number(t.payload.fees)}</td>
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
      {panel === "Market Explorer" && (
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
                  <select name="kind">
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
  authenticated = false,
  isOwner = false,
  onRequireAuth,
  openAsset,
  analyze,
  notify,
}: {
  data: MarketSnapshot | null;
  authenticated?: boolean;
  isOwner?: boolean;
  onRequireAuth?: () => void;
  openAsset: (id: string) => void;
  analyze: (formula?: string, instrumentId?: string) => void;
  notify?: Notice;
}) {
  const [tab, setTab] = useState(isOwner ? "Markets" : "FX");
  return (
    <>
      <div className="x1-chip-row" aria-label="Market categories">
        {[
          "Markets",
          "Sectors",
          "Bonds",
          "Capital",
          "Flows",
          "FX",
          "Commodities",
          "Crypto",
          "Macro",
        ].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Markets" || tab === "Commodities" ? (
        <PrivateMarketPanel
          key={"private-" + tab}
          isOwner={isOwner}
          authenticated={authenticated}
          exchangeFilter={tab === "Commodities" ? "MCX" : "EQUITIES"}
          openAsset={openAsset}
          analyze={analyze}
          onRequireAuth={onRequireAuth}
          notify={notify}
        />
      ) : (
      <Panel
        title={
          tab === "FX"
            ? "Official daily currency references"
            : tab === "Bonds"
              ? "US Treasury daily par yields"
              : tab
        }
        kicker="Market Explorer"
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
          <Empty title="Coverage to connect">
            <p>{gaps[tab].reason}</p>
            <SourceLink href={gaps[tab].source}>
              Official source and methodology
            </SourceLink>
          </Empty>
        )}
      </Panel>
      )}
      <Panel title="Source health" kicker="Connected does not mean live">
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
