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
} from "lucide-react";
import {
  EXCHANGES,
  exchangeSession,
  type Exchange,
} from "../lib/x1/exchanges";
import { X2_INSTRUMENTS } from "../lib/x2/instrument-registry";
import { INSTRUMENTS } from "../lib/instruments";
import type { DataPoint, MarketSnapshot } from "../lib/x1/market-data";
import { CURRENCIES } from "../lib/x1/portfolio";
import {
  Panel,
  Empty,
  SourceLink,
  Modal,
  Sparkline,
  api,
  number,
  moment,
  InfoTip,
  type WorkspaceState,
  type Notice,
} from "../components/x1/shared";
import ScrollTabs from "../components/x2/scroll-tabs";
const AssetTerminal = lazy(() => import("./asset-terminal"));
const GlobeCanvas = lazy(() => import("./globe-canvas"));
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
  reload: () => Promise<void>;
  notify: Notice;
  analyze: (formula?: string, instrumentId?: string) => void;
  openAsset: (id: string) => void;
  refreshData: () => void;
  refreshing?: boolean;
  initialPanel?: string;
};
export function assetName(id: string, data: MarketSnapshot | null) {
  return (
    [...(data?.quotes || []), ...(data?.yields || [])].find((q) => q.id === id)
      ?.label ||
    INSTRUMENTS.find((q) => q.id === id)?.name ||
    id
  );
}
export function AssetDialog({
  id,
  onClose,
  analyze,
  notify,
}: {
  id: string;
  data: MarketSnapshot | null;
  onClose: () => void;
  analyze: (formula?: string, instrumentId?: string) => void;
  notify: Notice;
}) {
  return (
    <Modal title="Asset research" onClose={onClose}>
      <Suspense fallback={<p role="status">Loading asset research…</p>}>
        <AssetTerminal id={id} onAnalyze={analyze} notify={notify} />
      </Suspense>
    </Modal>
  );
}

function DataCard({
  point,
  history,
  open,
}: {
  point?: DataPoint;
  history?: number[];
  open: () => void;
}) {
  return (
    <button className="x1-data-card" onClick={open}>
      <span className="x1-data-card-top">
        {point?.label || "Source loading"}
        <ArrowUpRight size={15} />
      </span>
      <strong>
        {number(point?.value, point?.assetClass === "FX" ? 4 : 2)}
        <small>{point?.assetClass === "BOND_YIELD" ? "%" : ""}</small>
      </strong>
      <span className="x1-caption">
        {point?.state === "PUBLISHED_EOD"
          ? "DAILY REFERENCE"
          : point?.state.replaceAll("_", " ") || "CONNECTING"}{" "}
        · {point?.provider || "Official data"}
      </span>
      {history && (
        <Sparkline values={history} label="Daily reference observations" />
      )}
      <span className="x1-caption">
        As of {point?.sourceDate || "unavailable"} ·{" "}
        {point?.unit || "No observation"}
      </span>
    </button>
  );
}
export default function Global({
  data,
  workspace,
  reload,
  notify,
  analyze,
  openAsset,
  refreshData,
  refreshing = false,
  initialPanel,
}: Props) {
  const [panel, setPanelState] = useState(initialPanel || "Overview"),
    [selected, setSelected] = useState<Exchange | null>(
      EXCHANGES.find((e) => e.id === "XNSE") || null,
    ),
    [region, setRegion] = useState("All"),
    [exchangeSearch, setExchangeSearch] = useState(""),
    [resetToken, setResetToken] = useState(0),
    [mode, setMode] = useState<"Globe" | "List">("Globe"),
    [auto, setAuto] = useState(true),
    [motionOverride, setMotionOverride] = useState(false),
    [zoom, setZoom] = useState(1),
    [fallback, setFallback] = useState(false),
    [rendererFallback, setRendererFallback] = useState(false),
    [listId, setListId] = useState(""),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<
      "list" | "portfolio" | "transaction" | "rename" | null
    >(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      queueMicrotask(() => setAuto(false));
  }, []);
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
  const registry: { id: string; name: string; kind: string }[] = [
    ...[...(data?.quotes || []), ...(data?.yields || [])].map((q) => ({
      id: q.id,
      name: q.label,
      kind: q.assetClass,
    })),
    ...X2_INSTRUMENTS.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.assetClass,
    })),
  ];
  const filtered = registry
    .filter((i) =>
      (i.name + " " + i.id).toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 40);
  const pendingWrite = useRef<{ signature: string; id: string } | null>(null);
  async function mutate(input: Record<string, unknown>) {
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
  const currentSession =
    selected && data ? exchangeSession(selected, data.asOf) : null;
  const selectVenue = (venue: Exchange) => {
    setSelected(venue);
    setAuto(false);
  };
  return (
    <>
      <ScrollTabs
        label="Global views"
        options={["Overview", "Watchlists", "Portfolio", "Market Explorer"]}
        active={panel}
        onChange={setPanel}
      />
      <header className="x1-page-title">
        <div>
          <h1>{panel === "Overview" ? "Strategic Souls" : panel}</h1>
          {panel === "Overview" && (
            <p className="x2-tagline">Research into evidence.</p>
          )}
          <InfoTip label="About Global">
            Published reference data and private research. Source dates and
            units accompany each value. Portfolio values are manual cost records
            until entitled valuation quotes are connected.
          </InfoTip>
        </div>
        <button
          className="x1-secondary x1-motion-button"
          onClick={refreshData}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw size={16} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      {panel === "Overview" && (
        <>
          <div className="x1-private-brief">
            <button onClick={() => setPanel("Watchlists")}>
              <Star size={15} />
              <span>Watchlists</span>
              <strong>{workspace ? lists.length : "—"}</strong>
              <ArrowRight size={14} />
            </button>
            <button onClick={() => setPanel("Portfolio")}>
              <Wallet size={15} />
              <span>Portfolios</span>
              <strong>{workspace ? portfolios.length : "—"}</strong>
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="x1-metrics">
            <DataCard
              point={
                data?.quotes.find((q) => q.id.includes("USDINR")) ||
                data?.quotes[0]
              }
              history={data?.fxHistory
                .find((h) => h.id.includes("USDINR"))
                ?.points.map((p) => p.close)}
              open={() =>
                openAsset(
                  data?.quotes.find((q) => q.id.includes("USDINR"))?.id ||
                    "ECB:USDINR",
                )
              }
            />
            <DataCard
              point={
                data?.quotes.find((q) => q.id.includes("EURUSD")) ||
                data?.quotes[1]
              }
              history={data?.fxHistory
                .find((h) => h.id.includes("EURUSD"))
                ?.points.map((p) => p.close)}
              open={() =>
                openAsset(
                  data?.quotes.find((q) => q.id.includes("EURUSD"))?.id ||
                    "ECB:EURUSD",
                )
              }
            />
            <DataCard
              point={data?.yields.find((q) => q.id.includes("10Y"))}
              open={() =>
                openAsset(
                  data?.yields.find((q) => q.id.includes("10Y"))?.id ||
                    "UST:10Y",
                )
              }
            />
          </div>
          <div className="x1-overview-grid">
            <Panel
              title="Across the exchanges"
              kicker="The world, connected by geography"
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
                      onPause={() => setAuto(false)}
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
                  <span className="x1-globe-hint">
                    {rendererFallback
                      ? "Static satellite image"
                      : "Drag to rotate"}
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
                  Earth imagery: NASA Blue Marble; night lights: NASA Black
                  Marble (2016); historical cloud composite. These textures do
                  not show current weather or market activity. City locations:
                  Natural Earth, public domain.
                </p>
              </details>
            </Panel>
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
                        onClick={() => setEdit("list")}
                      >
                        <Plus size={16} />
                        Create a watchlist
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
                          setPanel("Portfolio");
                          setEdit("portfolio");
                        }}
                      >
                        Add a manual portfolio
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
        </>
      )}
      {panel === "Watchlists" && (
        <div className="x1-work-grid">
          <Panel
            title="Your lists"
            action={
              <button
                className="x1-secondary x1-motion-button"
                onClick={() => setEdit("list")}
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
          <div className="x1-panel-head">
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
            <button
              className="x1-secondary x1-motion-button"
              onClick={() => setEdit("portfolio")}
            >
              <Plus size={16} />
              New portfolio
            </button>
          </div>
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
                  <div className="x1-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Quantity</th>
                          <th>Average cost</th>
                          <th>Cost basis</th>
                          <th>Market value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.summary.holdings.map((h) => (
                          <tr key={h.symbol}>
                            <td>{h.symbol}</td>
                            <td>{number(h.quantity, 4)}</td>
                            <td>{number(h.averageCost)}</td>
                            <td>{number(h.basis)}</td>
                            <td>
                              <span className="x1-caption">Not connected</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                    onClick={() => setEdit("portfolio")}
                  >
                    Create portfolio
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
        <MarketExplorer data={data} openAsset={openAsset} analyze={analyze} />
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
                      defaultValue={data?.asOf.slice(0, 10)}
                      max={data?.asOf.slice(0, 10)}
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
  openAsset: (id: string) => void;
  analyze: (formula?: string, instrumentId?: string) => void;
}) {
  const [tab, setTab] = useState("FX");
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
