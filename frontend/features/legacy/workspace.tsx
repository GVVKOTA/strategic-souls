/* eslint-disable @next/next/no-html-link-for-pages -- Sites authentication requires native top-level anchors, not client routing. */
"use client";
import Link from "next/link";
import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  Globe2,
  Users,
  Orbit,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  Database,
  LockKeyhole,
  Activity,
  Plus,
  Download,
  FileText,
  Check,
  Layers3,
  Trash2,
  X,
  BookOpen,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import {
  WATCHLIST,
  TIMEFRAMES,
  ASSET_CLASSES,
  parseFormula,
  parseCSV,
  validateHolding,
  holdingKey,
  bsm,
  type Holding,
} from "../../../backend/services/legacy/research";
import {
  NotebookBuilder,
  NotebookArchive,
} from "./notebook";
import type { StoredNotebook, StoredEvent } from "../../../backend/services/legacy/notebook";
import { releaseGates, documents, officialSources } from "../../../backend/services/legacy/content";
import { TradingViewWidget } from "../../components/tradingview-widget";
import { INSTRUMENTS, instrumentByLabel } from "../../../backend/services/market-data/instruments";
type BaseEntry = { id: string; created_at: string; digest: string };
type Strategy = {
  name: string;
  formula: string;
  thesis: string;
  instrument: string;
  timeframe: string;
};
type StrategyEntry = BaseEntry & { kind: "strategy"; payload: Strategy };
type HoldingEntry = BaseEntry & { kind: "holding"; payload: Holding };
type NoteEntry = BaseEntry & { kind: "note"; payload: { text: string } };
type Entry = StrategyEntry | HoldingEntry | NoteEntry;
type Session = { authenticated: boolean; accepted: boolean; alias: string };
declare global {
  interface Window {
    GVV_REFERENCE?: boolean;
  }
}
const NAV = [
  {
    id: "global",
    name: "Strategic Global",
    short: "Global",
    icon: Globe2,
    tabs: ["Markets", "Portfolio", "Intelligence", "Economic Calendar"],
  },
  {
    id: "community",
    name: "Social Community",
    short: "Community",
    icon: Users,
    tabs: ["Feed", "Groups", "Public Souls", "Marketplace"],
  },
  {
    id: "souls",
    name: "Soul Intelligence",
    short: "Souls",
    icon: Orbit,
    tabs: ["Soul Builder", "Soul Scan", "Options Lab", "Soul Graveyard"],
  },
];
const num = (v: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(v);
const date = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
function download(value: unknown, name: string) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob(
        [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
        { type: typeof value === "string" ? "text/plain" : "application/json" },
      ),
    );
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function referenceApi(path: string, input?: unknown): Promise<unknown> {
  if (typeof window !== "undefined" && window.GVV_REFERENCE) {
    const key = "gvv-reference-v2";
    const state = JSON.parse(
      localStorage.getItem(key) ||
        '{"accepted":false,"records":[],"alias":"Local researcher"}',
    ) as { accepted: boolean; records: Entry[]; alias: string };
    let result: unknown = {};
    if (path === "session") return { ...state, authenticated: true };
    if (path === "workspace") return { records: state.records, legacyCount: 0 };
    if (!state.accepted && !["session", "consent", "workspace"].includes(path))
      throw new Error("Activate private saving first.");
    if (path === "consent") {
      const consent = input as Record<string, unknown>;
      if (!consent.adult || !consent.privacy || !consent.terms)
        throw new Error("All consent choices are required.");
      state.accepted = true;
      result = { accepted: true };
    } else if (path === "save") {
      const data = input as {
        kind: Entry["kind"];
        payload: Strategy | Holding | { text: string };
      };
      let payload: unknown = data.payload;
      if (data.kind === "holding") payload = validateHolding(payload);
      if (data.kind === "strategy")
        payload = {
          ...(payload as Strategy),
          ...parseFormula((payload as Strategy).formula),
          status: "DRAFT_UNVALIDATED",
          dataFingerprint: null,
          aggregateConsent: false,
        };
      const digest = JSON.stringify(payload);
      if (
        !state.records.some(
          (r: Entry) =>
            r.kind === data.kind && JSON.stringify(r.payload) === digest,
        )
      )
        state.records.unshift({
          id: crypto.randomUUID(),
          kind: data.kind,
          created_at: new Date().toISOString(),
          digest: "Local reference · not a server audit hash",
          payload,
        } as Entry);
      result = { saved: true };
    } else if (path === "remove") {
      state.records = state.records.filter(
        (r: Entry) => r.id !== (input as Record<string, unknown>).id,
      );
      result = { removed: true };
    } else if (path === "export") return { referenceOnly: true, ...state };
    else if (path === "profile")
      state.alias = String((input as Record<string, unknown>).alias);
    else if (path === "erase") {
      localStorage.removeItem(key);
      return { erased: true };
    } else if (path === "support")
      throw new Error("Support recording requires the hosted private Site.");
    else if (path !== "consent")
      throw new Error(
        "Live data unavailable — provider/entitlement not connected. No quota charged.",
      );
    localStorage.setItem(key, JSON.stringify(state));
    return result;
  }
  throw new Error("Reference mode is unavailable.");
}
async function api<T = unknown>(path: string, input?: unknown): Promise<T> {
  if (typeof window !== "undefined" && window.GVV_REFERENCE)
    return (await referenceApi(path, input)) as T;
  const response = await fetch("/api/" + path, {
    signal: AbortSignal.timeout(15000),
    method: input === undefined ? "GET" : "POST",
    headers:
      input === undefined ? undefined : { "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : "Request failed.";
    throw new Error(error);
  }
  return data as T;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
function Empty({
  title,
  children,
  icon: Icon = Database,
}: {
  title: string;
  children: ReactNode;
  icon?: typeof Database;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={23} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Panel({
  title,
  kicker,
  children,
  action,
  className = "",
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <div>
          {kicker && <div className="eyebrow">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} className="modal">
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Atlas() {
  return (
    <svg
      className="atlas"
      viewBox="0 0 510 175"
      role="img"
      aria-label="Conceptual connections from global rates, energy and currency to India. No live signals."
    >
      <g fill="none" stroke="var(--x1-divider)">
        <ellipse cx="270" cy="90" rx="202" ry="69" />
        <ellipse cx="270" cy="90" rx="137" ry="69" />
        <ellipse cx="270" cy="90" rx="70" ry="69" />
        <path d="M68 90h404M100 52h340M102 127h336" />
        <path
          d="M98 90Q200 0 326 92M226 40Q280 45 326 92M411 70Q369 63 326 92"
          stroke="var(--x1-text-tertiary)"
          strokeDasharray="3 5"
        />
      </g>
      <g fill="var(--x1-text-tertiary)">
        {[
          [98, 90],
          [226, 40],
          [411, 70],
          [326, 92],
        ].map(([x, y]) => (
          <g key={x}>
            <circle cx={x} cy={y} r="12" opacity=".1" />
            <circle cx={x} cy={y} r="3" />
          </g>
        ))}
      </g>
      <g fontSize="12" letterSpacing="1.5" fill="var(--x1-text-secondary)">
        <text x="66" y="116">
          ENERGY
        </text>
        <text x="198" y="27">
          RATES
        </text>
        <text x="402" y="53">
          FX
        </text>
        <text x="304" y="118" fill="var(--x1-text-tertiary)">
          INDIA
        </text>
      </g>
    </svg>
  );
}
export default function Workspace() {
  const [view, setView] = useState("global"),
    [tab, setTab] = useState("Markets"),
    [collapsed, setCollapsed] = useState(false),
    [utility, setUtility] = useState(""),
    [loading, setLoading] = useState(true),
    [session, setSession] = useState<Session | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [legacy, setLegacy] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All assets"),
    [detail, setDetail] = useState(""),
    [reference, setReference] = useState(false),
    [now, setNow] = useState(""),
    [seed, setSeed] = useState("");
  const [notebooks, setNotebooks] = useState<StoredNotebook[]>([]),
    [events, setEvents] = useState<StoredEvent[]>([]),
    [revision, setRevision] = useState<StoredNotebook | null>(null),
    [builderMode, setBuilderMode] = useState("Notebook Soul");
  const nav = NAV.find((n) => n.id === view)!;
  async function refresh() {
    const s = await api<Session>("session");
    setSession(s);
    if (s.accepted) {
      const d = await api<{ records: Entry[]; legacyCount: number }>(
        "workspace",
      );
      setEntries(d.records);
      setLegacy(d.legacyCount);
      if (!window.GVV_REFERENCE) {
        const archive = await api<{
          souls: StoredNotebook[];
          events: StoredEvent[];
        }>("notebooks");
        setNotebooks(archive.souls);
        setEvents(archive.events);
      }
    } else {
      setEntries([]);
      setLegacy(0);
      setNotebooks([]);
      setEvents([]);
    }
  }
  useEffect(() => {
    void Promise.resolve()
      .then(() => {
        setReference(!!window.GVV_REFERENCE);
        setNow(
          new Date().toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        );
        return refresh();
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }
  async function save(kind: string, payload: unknown) {
    await api("save", { kind, payload });
    await refresh();
    setMessage(
      "Saved privately. Repeated identical submissions are deduplicated.",
    );
  }
  function navigate(id: string, t?: string) {
    setView(id);
    setTab(t || NAV.find((n) => n.id === id)!.tabs[0]);
    setUtility("");
    setSearch("");
    setMessage("");
    setError("");
    window.scrollTo(0, 0);
  }
  function thesis(s: string) {
    setSeed(s);
    setRevision(null);
    setBuilderMode("Notebook Soul");
    navigate("souls", "Soul Builder");
  }
  const holdings = entries.filter((e) => e.kind === "holding"),
    strategies = entries.filter((e) => e.kind === "strategy");
  return (
    <div className={"shell " + (collapsed ? "collapsed" : "")}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            V<span>·</span>
          </span>
          <span className="brand-copy">
            <small>GLOBAL VERTEX VECTORS</small>
            <strong>
              STRATEGIC
              <br />
              SOULS<span className="mint">.</span>
            </strong>
          </span>
        </Link>
        <div className="rail-label">RESEARCH WORKSPACE</div>
        <nav aria-label="Main dashboards">
          {NAV.map((n, i) => (
            <button
              title={n.name}
              key={n.id}
              className={"nav-item " + (view === n.id ? "active" : "")}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.name}</span>
              <small>0{i + 1}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-rule" />
        <Link className="nav-item utility" href="/home">
          <BookOpen size={18} />
          <span>About Strategic Souls</span>
        </Link>
        <button
          className="nav-item utility"
          onClick={() => setUtility("Source health")}
          title="Source health"
        >
          <Activity size={18} />
          <span>Source health</span>
        </button>
        <button
          className="nav-item utility"
          onClick={() => setUtility("Trust & readiness")}
          title="Trust and readiness"
        >
          <ShieldCheck size={18} />
          <span>Trust & readiness</span>
        </button>
        <button
          className="nav-item utility"
          onClick={() => setUtility("Research guide")}
          title="Research guide"
        >
          <BookOpen size={18} />
          <span>Research guide</span>
        </button>
        <div className="sidebar-bottom">
          <div className="private-note">
            <LockKeyhole size={16} />
            <b>Yours. By design.</b>
            <p>
              Your research stays private.
              <br />
              Sharing is always a separate choice.
            </p>
          </div>
          <button
            className="profile"
            onClick={() => setUtility("Settings & privacy")}
          >
            <span className="avatar">GV</span>
            <span>
              <strong>{session?.alias || "Your workspace"}</strong>
              <small>Owner-private · Research alpha</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="body">
        <header className="topbar">
          <div className="crumb">
            <button
              className="icon collapse"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{nav.name}</strong>
          </div>
          <div className="top-actions">
            <span className="date">{now} · IST</span>
            <Badge>
              <LockKeyhole size={11} /> PRIVATE
            </Badge>
            <button
              className="icon"
              aria-label="Open settings"
              onClick={() => setUtility("Settings & privacy")}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        {reference && (
          <div className="notice">
            SELF-CONTAINED REFERENCE · Data saved only in this browser. No
            hosted authentication, database, live feeds or encrypted storage.
            Use the private Site for real personal records.
          </div>
        )}
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                GLOBAL VERTEX VECTORS <span>/</span>{" "}
                {view === "global"
                  ? "A WIDER PERSPECTIVE"
                  : view === "community"
                    ? "IDEAS WITH ACCOUNTABILITY"
                    : "RESEARCH WITH MEMORY"}
              </div>
              <h1>
                {view === "global"
                  ? "The world. Through an Indian lens."
                  : view === "community"
                    ? "Better questions. Shared thoughtfully."
                    : "An idea today. Evidence over time."}
              </h1>
              <p>
                {view === "global"
                  ? "Connect global context, your portfolio and the forces that may shape India."
                  : view === "community"
                    ? "A space for transparent research, opposing views and considered conversation."
                    : "Build a hypothesis. Preserve its assumptions. Let the evidence challenge it."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => navigate("souls", "Soul Builder")}
            >
              <Plus size={15} />
              Build a Soul
              <ArrowUpRight size={15} />
            </button>
          </div>
          <nav className="tabs" aria-label={nav.name + " sections"}>
            {nav.tabs.map((t) => (
              <button
                key={t}
                className={tab === t ? "selected" : ""}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => {
                  setTab(t);
                  setError("");
                  setMessage("");
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          {loading && (
            <div className="notice" role="status">
              Loading your private workspace…
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              <Check size={16} />
              {message}
            </div>
          )}
          {!session && error.includes("Sign in") && (
            <a
              className="secondary"
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
            >
              Sign in with ChatGPT
            </a>
          )}
          {session && !session.accepted && (
            <Consent
              busy={busy}
              submit={(data) =>
                run(async () => {
                  await api("consent", data);
                  await refresh();
                  setMessage("Private workspace consent saved.");
                })
              }
            />
          )}
          {view === "global" && tab === "Markets" && (
            <>
              <section className="context-banner">
                <div>
                  <div className="eyebrow">GLOBAL CONTEXT → INDIA IMPACT</div>
                  <h2>
                    See the connections.
                    <br />
                    <span>Question the conclusions.</span>
                  </h2>
                  <p>
                    Energy, rates and currencies rarely move in isolation.
                    <br />
                    Start with a mechanism. Demand the evidence.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("Intelligence")}
                  >
                    Open research workbench <ArrowRight size={14} />
                  </button>
                </div>
                <Atlas />
                <div className="banner-status">
                  <span className="status-ring">
                    <Database size={21} />
                  </span>
                  <strong>Research works without a quote feed</strong>
                  <p>
                    Official charts available on request. GVV numeric data
                    remains unconnected.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setUtility("Source health")}
                  >
                    View source readiness <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
              <div className="market-start">
                <div>
                  <span className="eyebrow">YOUR RESEARCH STARTS HERE</span>
                  <h2>A question first. A clearer view next.</h2>
                  <p>
                    Write an idea, attach sources and return to it later.
                    Explore market context separately.
                  </p>
                </div>
                <button className="primary" onClick={() => thesis("")}>
                  Create your first Soul <ArrowRight size={16} />
                </button>
              </div>
              <div
                className="market-categories"
                aria-label="Explore market categories"
              >
                {[
                  ["Indices", "Global indices"],
                  ["Rates", "Rates & policy"],
                  ["Commodities", "Energy & metals"],
                  ["FX", "Currencies"],
                  ["Crypto", "Digital assets"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={category === key ? "selected" : ""}
                    onClick={() =>
                      setCategory(category === key ? "All assets" : key)
                    }
                    aria-pressed={category === key}
                  >
                    {label}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              <TradingViewWidget
                kind="overview"
                title="Global context, at a glance"
              />
              <details className="universe-disclosure">
                <summary>
                  Explore the original 28-instrument universe{" "}
                  <span className="badge">NUMERIC FEED NOT CONNECTED</span>
                </summary>
                <div className="market-layout">
                  <Panel
                    title="Global market watch"
                    kicker="THE FIXED UNIVERSE"
                    action={<Badge>28 INSTRUMENTS</Badge>}
                  >
                    <div className="watch-controls">
                      <label className="search">
                        <Search size={15} />
                        <input
                          aria-label="Filter instruments"
                          placeholder="Find an instrument"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter asset class"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {[
                          "All assets",
                          ...new Set(WATCHLIST.map((r) => r[2])),
                        ].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="watch-head">
                      <span>INSTRUMENT / SOURCE ID</span>
                      <span>QUOTE / STATUS</span>
                    </div>
                    <div className="watch-list">
                      {WATCHLIST.filter(
                        (r) =>
                          (category === "All assets" || r[2] === category) &&
                          (!search ||
                            (r[0] + " " + r[1])
                              .toLowerCase()
                              .includes(search.toLowerCase())),
                      ).map((r) => (
                        <button
                          className="watch-row"
                          key={r[0]}
                          onClick={() => setDetail(r[0])}
                        >
                          <span className="instrument-icon">
                            {r[2] === "Crypto"
                              ? "C"
                              : r[2] === "FX"
                                ? "FX"
                                : r[2] === "Rates"
                                  ? "%"
                                  : r[2] === "Volatility"
                                    ? "V"
                                    : "↗"}
                          </span>
                          <span className="instrument">
                            <b>{r[0]}</b>
                            <small>{r[1]}</small>
                          </span>
                          <span className="quote">
                            <strong>Unavailable</strong>
                            <small>Not connected</small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </div>
                    <div className="panel-foot">
                      Original order preserved · Documented chart identities are
                      separate from unavailable GVV numeric quotes
                    </div>
                  </Panel>
                  <div className="research-rail">
                    <Panel
                      title="India Impact Intelligence"
                      kicker="FOLLOW THE TRANSMISSION"
                      action={<Badge>EDUCATIONAL</Badge>}
                    >
                      <p className="section-note">
                        No current event triggers are available. These are
                        research mechanisms, not market observations.
                      </p>
                      {[
                        {
                          id: "01",
                          title: "Energy → import costs",
                          text: "If crude declines, India’s import bill may ease. Weak global demand can offset the benefit.",
                          tags: "INFLATION · CURRENCY",
                          thesis:
                            "Test whether falling crude reduces Indian import costs after controlling for global demand.",
                        },
                        {
                          id: "02",
                          title: "US rates → capital flows",
                          text: "Changing US yields may alter capital flows and valuations. Domestic growth can outweigh the relationship.",
                          tags: "CAPITAL FLOWS · VALUATIONS",
                          thesis:
                            "Test US-yield sensitivity of Indian valuations across domestic growth regimes.",
                        },
                        {
                          id: "03",
                          title: "Rupee → sector exposure",
                          text: "A weaker rupee can support exporters while increasing import costs. Hedges and input mix matter.",
                          tags: "EXPORTERS · IMPORTERS",
                          thesis:
                            "Compare currency sensitivity of exporters and importers with hedging and input costs.",
                        },
                      ].map((c) => (
                        <article className="impact-card" key={c.id}>
                          <div className="impact-number">{c.id}</div>
                          <div>
                            <small>{c.tags}</small>
                            <h3>{c.title}</h3>
                            <p>{c.text}</p>
                            <details>
                              <summary>Explore evidence requirements</summary>
                              <p>
                                Needed: entitled time series, publication
                                timestamps, precommitted horizon and sector
                                exposure data. Countercase: local demand, policy
                                or hedging explains the result. No observed
                                fact, sensitivity estimate or causal effect is
                                claimed.
                              </p>
                            </details>
                            <button
                              className="text-button"
                              onClick={() => thesis(c.thesis)}
                            >
                              Create strategy hypothesis{" "}
                              <ArrowUpRight size={12} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </Panel>
                    <Panel
                      title="Economic news headlines"
                      kicker="FROM THE ORIGINAL SOURCE"
                      action={<FileText size={17} />}
                    >
                      <Empty
                        title="A clear signal needs a source."
                        icon={FileText}
                      >
                        No entitled news feed is connected. Headlines,
                        publication times and India relevance will appear only
                        after source verification.
                      </Empty>
                    </Panel>
                    <Panel
                      title="On the horizon"
                      kicker="GLOBAL ECONOMIC CALENDAR"
                      action={<CalendarDays size={17} />}
                    >
                      <Empty
                        title="Open the official calendar"
                        icon={CalendarDays}
                      >
                        TradingView provides a separate calendar for human
                        viewing. GVV does not import event records, forecasts or
                        alerts from it.
                      </Empty>
                      <button
                        className="full-button"
                        onClick={() => setTab("Economic Calendar")}
                      >
                        Open official calendar <ArrowRight size={14} />
                      </button>
                    </Panel>
                  </div>
                </div>
              </details>
            </>
          )}
          {view === "global" && tab === "Portfolio" && (
            <Portfolio
              entries={holdings}
              busy={busy}
              save={(p) => save("holding", p)}
              run={run}
              remove={(id) =>
                run(async () => {
                  await api("remove", { id });
                  await refresh();
                })
              }
            />
          )}
          {view === "global" && tab === "Intelligence" && (
            <>
              <div className="section-intro">
                <span className="overline">THE RESEARCH WORKBENCH</span>
                <h2>Separate the observation from the explanation.</h2>
                <p>
                  Build the opposing case before accepting a conclusion. No
                  current market event or historical result has been supplied.
                </p>
              </div>
              <div className="three-grid">
                {[
                  "01 · Observation",
                  "02 · Transmission",
                  "03 · Falsification",
                ].map((s, i) => (
                  <Panel key={s} title={s}>
                    <p className="section-note">
                      {
                        [
                          "Record what actually happened, when it became knowable and the original source. No verified event is available.",
                          "Map rates, FX, commodities and sector exposure. Distinguish correlation from causation and account for alternative causes.",
                          "Precommit the comparison window, countercase, costs and conditions that would invalidate the thesis.",
                        ][i]
                      }
                    </p>
                  </Panel>
                ))}
              </div>
              <Panel
                title="Start with a research question"
                kicker="PRIVATE STRATEGY DRAFT"
              >
                <p className="section-note">
                  Write the mechanism you want to test. The next step captures a
                  formula and timeframe; it does not generate a prediction.
                </p>
                <textarea
                  aria-label="Research hypothesis"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  maxLength={1000}
                  placeholder="What mechanism could explain this relationship, and what evidence would disprove it?"
                />
                <button className="primary" onClick={() => thesis(seed)}>
                  Create Soul from thesis <ArrowRight size={15} />
                </button>
              </Panel>
            </>
          )}
          {view === "global" && tab === "Economic Calendar" && (
            <TradingViewWidget kind="calendar" title="The economic calendar" />
          )}
          {view === "souls" && tab === "Soul Builder" && (
            <>
              <div className="segmented">
                {["Notebook Soul", "Formula drafts"].map((m) => (
                  <button
                    key={m}
                    className={builderMode === m ? "selected" : ""}
                    onClick={() => setBuilderMode(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {builderMode === "Notebook Soul" ? (
                <NotebookBuilder
                  key={revision?.id ?? seed}
                  seed={seed}
                  revision={revision}
                  busy={busy}
                  run={run}
                  api={api}
                  onSaved={async () => {
                    await refresh();
                    setTab("Soul Graveyard");
                    setMessage(
                      "Notebook Soul preserved. Your original thesis cannot be overwritten.",
                    );
                    setRevision(null);
                  }}
                />
              ) : (
                <Builder
                  seed={seed}
                  strategies={strategies}
                  busy={busy}
                  run={run}
                  save={(p) => save("strategy", p)}
                  openScan={() => setTab("Soul Scan")}
                />
              )}
            </>
          )}
          {view === "souls" && tab === "Soul Scan" && (
            <Scan strategies={strategies} busy={busy} run={run} />
          )}
          {view === "souls" && tab === "Options Lab" && <Options />}
          {view === "souls" && tab === "Soul Graveyard" && (
            <NotebookArchive
              souls={notebooks}
              events={events}
              legacy={legacy}
              busy={busy}
              run={run}
              api={api}
              refresh={refresh}
              onRevise={(s) => {
                setRevision(s);
                setBuilderMode("Notebook Soul");
                setTab("Soul Builder");
                window.scrollTo(0, 0);
              }}
            />
          )}
          {view === "community" && (
            <Community
              tab={tab}
              entries={entries.filter((e) => e.kind === "note")}
              busy={busy}
              run={run}
              save={(p) => save("note", p)}
              remove={(id) =>
                run(async () => {
                  await api("remove", { id });
                  await refresh();
                })
              }
            />
          )}
          <footer>
            <span>
              GLOBAL VERTEX VECTORS <b> / </b> STRATEGIC SOULS
            </span>
            <span>Research/analysis, not assured investment returns.</span>
            <button
              className="text-button"
              onClick={() => setUtility("Trust & readiness")}
            >
              Trust & disclosures <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile dashboards">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={view === n.id ? "active" : ""}
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>{n.short}</span>
          </button>
        ))}
      </nav>
      {detail && (
        <Modal title={detail} close={() => setDetail("")}>
          <a
            className="secondary"
            href={"/asset/" + encodeURIComponent(detail)}
          >
            Open asset details <ArrowUpRight size={14} />
          </a>
          <p>{WATCHLIST.find((r) => r[0] === detail)?.[1]}</p>
          <Badge>NOT CONFIGURED</Badge>
          <Empty title="Live data unavailable">
            Provider/entitlement not connected. GVV last trade, prior close,
            price change and session status cannot be computed. A separately
            hosted chart may be available on the asset details page.
          </Empty>
          <dl className="data-list">
            {Object.entries(instrumentByLabel(detail)!).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v === null ? "Not verified" : String(v)}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
      {utility && (
        <Modal title={utility} close={() => setUtility("")}>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {utility === "Source health" ? (
            <>
              <p>
                Checked 14 November 2026: no numeric provider keys are
                configured. Official TradingView charts and calendar load only
                after your choice; frame availability and timing are shown
                inside the vendor surface. They supply no GVV numeric API.
              </p>
              <div className="notice">
                Chart candidates documented:{" "}
                {INSTRUMENTS.filter((i) => i.vendorSymbol).length} / 28. Every
                custom numeric quote remains unavailable. An identity mapping is
                not proof of widget support or data rights.
              </div>
              <div className="source-table">
                {[
                  "NSE/BSE/MCX and Indian F&O",
                  "Global equities, indices and futures",
                  "FX, rates and spot metals",
                  "Crypto by exact exchange",
                  "Fundamentals and corporate actions",
                  "News and global calendar",
                ].map((s) => (
                  <div key={s}>
                    <b>{s}</b>
                    <Badge>NOT CONFIGURED</Badge>
                    <small>
                      Entitlement unverified · Freshness unavailable
                    </small>
                  </div>
                ))}
              </div>
              <button
                className="secondary"
                onClick={() =>
                  download(INSTRUMENTS, "GVV_Instrument_Registry.json")
                }
              >
                <Download size={14} />
                Export instrument registry
              </button>
              <details>
                <summary>Feed state contract</summary>
                <p>
                  Not configured → not entitled → connecting → live confirmed /
                  delayed / exchange closed → stale / source error / offline.
                  Provider adapters and measured feed observability are not
                  implemented. LIVE requires evidence of rights, source
                  identity, completed session metadata and freshness.
                </p>
              </details>
            </>
          ) : utility === "Trust & readiness" ? (
            <>
              <p className="muted">
                Private foundation · 14 November 2026 · No compliance
                certification
              </p>
              {releaseGates.map((g) => (
                <div className="risk-row" key={g.area}>
                  <Badge>{g.status}</Badge>
                  <h3>{g.area}</h3>
                  <p>{g.evidence}</p>
                </div>
              ))}
              {officialSources.map((s) => (
                <a
                  className="source-link"
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.title} ↗
                </a>
              ))}
            </>
          ) : utility === "Settings & privacy" ? (
            <Settings
              session={session}
              busy={busy}
              run={run}
              refresh={refresh}
              reference={reference}
            />
          ) : (
            <>
              {Object.entries(documents).map(([k, d]) => (
                <details key={k}>
                  <summary>{d.title}</summary>
                  <p>{d.intro}</p>
                  {d.sections.map((s) => (
                    <div key={s.title}>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  ))}
                </details>
              ))}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function Consent({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (p: unknown) => void;
}) {
  const [adult, a] = useState(false),
    [privacy, p] = useState(false),
    [terms, t] = useState(false);
  return (
    <section className="consent">
      <div>
        <ShieldCheck size={22} />
        <h2>Activate your private research workspace</h2>
        <p>
          Saving requires updated consent for private notebook Souls, source
          references, review events, strategies, holdings and notes. Review
          Privacy and Terms in the research guide. No public sharing or
          community contribution is enabled.
        </p>
        <details>
          <summary>Review privacy &amp; terms</summary>
          {[documents.privacy, documents.terms].map((d) => (
            <div key={d.title}>
              <h3>{d.title}</h3>
              <p>{d.intro}</p>
              {d.sections.map((section) => (
                <p key={section.title}>
                  <b>{section.title}: </b>
                  {section.body}
                </p>
              ))}
            </div>
          ))}
        </details>
      </div>
      <div>
        {[
          [adult, a, "I confirm I am 18 or older."],
          [
            privacy,
            p,
            "I agree to the private data processing described in Privacy.",
          ],
          [
            terms,
            t,
            "I accept the private beta Terms and research limitations.",
          ],
        ].map(([v, fn, label], i) => (
          <label className="check-field" key={i}>
            <input
              type="checkbox"
              checked={v as boolean}
              onChange={(e) => (fn as (v: boolean) => void)(e.target.checked)}
            />
            {label as string}
          </label>
        ))}
        <button
          className="primary"
          disabled={busy || !adult || !privacy || !terms}
          onClick={() => submit({ adult, privacy, terms })}
        >
          Activate private saving <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function Portfolio({
  entries,
  busy,
  save,
  run,
  remove,
}: {
  entries: HoldingEntry[];
  busy: boolean;
  save: (p: Holding) => Promise<void>;
  run: (fn: () => Promise<void>) => Promise<void>;
  remove: (id: string) => void;
}) {
  const [mode, setMode] = useState("Manual entry"),
    [preview, setPreview] = useState<Holding[]>([]),
    [importError, setImportError] = useState(""),
    [benchmark, setBenchmark] = useState("Nifty 50");
  async function manual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = Object.fromEntries(new FormData(form));
    await run(async () => {
      await save(
        validateHolding({
          ...data,
          quantity: Number(data.quantity),
          cost: Number(data.cost),
        }),
      );
      form.reset();
    });
  }
  return (
    <>
      <div className="portfolio-summary">
        <div>
          <span className="overline">YOUR CAPITAL, IN CONTEXT</span>
          <h2>
            Know what you own.
            <br />
            <span className="muted">Value it only with evidence.</span>
          </h2>
        </div>
        <div>
          <small>CURRENT VALUE / P&amp;L</small>
          <strong>Not computed</strong>
          <p>Verified marks and FX unavailable</p>
        </div>
        <div>
          <small>USER-ENTERED HOLDINGS</small>
          <strong>{entries.length}</strong>
          <p>Acquisition cost is not a market quote</p>
        </div>
      </div>
      <div className="two-grid">
        <Panel title="Add to your portfolio" kicker="PRIVATE · MULTI-ASSET">
          <div className="segmented">
            {["Manual entry", "Import CSV", "Read-only sync"].map((m) => (
              <button
                key={m}
                className={mode === m ? "selected" : ""}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === "Manual entry" ? (
            <form onSubmit={manual} className="form-grid">
              <label className="field">
                Instrument
                <input
                  name="symbol"
                  required
                  maxLength={40}
                  placeholder="Your instrument identifier"
                />
              </label>
              <label className="field">
                Asset class
                <select name="assetClass">
                  {ASSET_CLASSES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min=".00000001"
                  step="any"
                  required
                />
              </label>
              <label className="field">
                Unit acquisition cost
                <input name="cost" type="number" min="0" step="any" required />
              </label>
              <label className="field">
                Original currency
                <select name="currency">
                  {["INR", "USD", "EUR", "GBP", "JPY", "USDT"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Account alias
                <input
                  name="account"
                  required
                  maxLength={60}
                  placeholder="A label, never an account number"
                />
              </label>
              <button className="primary" disabled={busy}>
                <Plus size={15} />
                Save holding
              </button>
              <p className="micro">
                Holdings only in this release. Transactions, tax lots, corporate
                actions and reconciliation await implementation.
              </p>
            </form>
          ) : mode === "Import CSV" ? (
            <>
              <p className="section-note">
                Up to 100 rows / 100 KB. Match the six named columns below.
                Excel workbooks and statements are not yet supported; export a
                CSV first.
              </p>
              <code className="code">
                symbol,assetClass,quantity,cost,currency,account
              </code>
              <input
                aria-label="Choose holdings CSV"
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  setPreview([]);
                  setImportError("");
                  try {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 100000)
                      throw new Error("Maximum file size is 100 KB.");
                    const rows = parseCSV(await f.text()),
                      keys = new Set(
                        entries.map((r) => holdingKey(r.payload as Holding)),
                      );
                    if (rows.some((h) => keys.has(holdingKey(h))))
                      throw new Error(
                        "This import contains an existing holding. Remove duplicates before importing.",
                      );
                    setPreview(rows);
                  } catch (e) {
                    setImportError((e as Error).message);
                  }
                }}
              />
              {importError && (
                <p role="alert" className="error-text">
                  {importError}
                </p>
              )}
              {preview.length > 0 && (
                <>
                  <p>
                    {preview.length} validated holdings · review before saving
                  </p>
                  <div className="scroll-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Qty</th>
                          <th>Unit cost</th>
                          <th>Currency</th>
                          <th>Account</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((h, i) => (
                          <tr key={i}>
                            <td>{h.symbol}</td>
                            <td>{h.quantity}</td>
                            <td>{h.cost}</td>
                            <td>{h.currency}</td>
                            <td>{h.account}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="micro">
                    Rows save individually. If interrupted, completed rows
                    remain saved; retry is deduplicated.
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        for (const h of preview)
                          await api("save", { kind: "holding", payload: h });
                        await save(preview[preview.length - 1]);
                        setPreview([]);
                      })
                    }
                  >
                    Confirm import
                  </button>
                </>
              )}
            </>
          ) : (
            <Empty title="Connect only with consent" icon={LockKeyhole}>
              No read-only broker provider is connected. Future access must be
              scoped, revocable and separate from trading. Never enter broker
              credentials here.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Your benchmark, on equal terms"
          kicker="COMPARISON WORKBENCH"
        >
          <Select
            label="Comparison benchmark"
            value={benchmark}
            onChange={setBenchmark}
            options={[
              "Nifty 50",
              "Nifty 500",
              "Sector index",
              "Bond benchmark",
              "Gold",
              "Portfolio-weighted comparison composite",
            ]}
          />
          <Empty title="Comparison is not computed." icon={Activity}>
            Entitled benchmark history, verified valuations, cash flows and
            consistent INR conversion are required. TWR, XIRR, drawdown,
            volatility and attribution remain unknown.
          </Empty>
          <details>
            <summary>Why like-for-like matters</summary>
            <p>
              TWR must chain returns around cash flows. XIRR requires dated cash
              flows and a verified ending value. Match dates, reinvestment, fees
              and currency. A portfolio-weighted comparison is not an official
              index.
            </p>
          </details>
        </Panel>
      </div>
      <Panel
        title="Your holdings"
        action={
          <button
            className="text-button"
            onClick={() =>
              download(
                entries.map((e) => e.payload),
                "GVV_Private_Holdings.json",
              )
            }
          >
            <Download size={14} />
            Export
          </button>
        }
      >
        {entries.length ? (
          <div className="scroll-table">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Asset / account</th>
                  <th>Quantity</th>
                  <th>Unit acquisition cost</th>
                  <th>Current mark</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.payload.symbol}</b>
                    </td>
                    <td>
                      {e.payload.assetClass}
                      <small>{e.payload.account}</small>
                    </td>
                    <td>{num(e.payload.quantity)}</td>
                    <td>
                      {e.payload.currency} {num(e.payload.cost)}
                      <small>User-entered</small>
                    </td>
                    <td>Unavailable</td>
                    <td>
                      <button
                        className="icon"
                        aria-label={"Remove " + e.payload.symbol}
                        onClick={() => remove(e.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Begin with what you own." icon={Layers3}>
            Add a holding manually or preview a validated CSV. Values will
            remain unknown until genuine marks are available.
          </Empty>
        )}
      </Panel>
    </>
  );
}
function Builder({
  seed,
  strategies,
  busy,
  run,
  save,
  openScan,
}: {
  seed: string;
  strategies: StrategyEntry[];
  busy: boolean;
  run: (f: () => Promise<void>) => Promise<void>;
  save: (p: unknown) => Promise<void>;
  openScan: () => void;
}) {
  const [mode, setMode] = useState("Visual blocks"),
    [name, setName] = useState(""),
    [formula, setFormula] = useState("close > sma(close, 20)"),
    [thesis, setThesis] = useState(seed),
    [instrument, setInstrument] = useState("NIFTY"),
    [timeframe, setTimeframe] = useState("daily"),
    [factor, setFactor] = useState("close"),
    [operator, setOperator] = useState(">"),
    [window, setWindow] = useState("20");
  let validation: ReturnType<typeof parseFormula> | null = null,
    issue = "";
  try {
    validation = parseFormula(formula);
  } catch (e) {
    issue = (e as Error).message;
  }
  function visual(f: string, op: string, w: string) {
    setFactor(f);
    setOperator(op);
    setWindow(w);
    setFormula(f + " " + op + " sma(" + f + ", " + w + ")");
  }
  return (
    <div className="builder-grid">
      <Panel
        title="Give your hypothesis a structure."
        kicker="SOUL BUILDER · PRIVATE BY DEFAULT"
        action={<Badge>DRAFT</Badge>}
      >
        <div className="segmented">
          {["Visual blocks", "Formula editor"].map((m) => (
            <button
              key={m}
              className={mode === m ? "selected" : ""}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">
            Strategy name
            <input
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name the idea, not its expected return"
            />
          </label>
          <label className="field">
            Research instrument
            <input
              maxLength={50}
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
            />
          </label>
          <label className="field full">
            Hypothesis and countercase
            <textarea
              value={thesis}
              maxLength={1000}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="What would this test? What could invalidate it?"
            />
          </label>
        </div>
        {mode === "Visual blocks" ? (
          <div className="visual-blocks">
            <Select
              label="Observe"
              value={factor}
              onChange={(f) => visual(f, operator, window)}
              options={[
                "close",
                "volume",
                "rsi",
                "roic",
                "revenueGrowth",
                "debtEquity",
              ]}
            />
            <Select
              label="Relationship"
              value={operator}
              onChange={(op) => visual(factor, op, window)}
              options={[">", "<", ">=", "<="]}
            />
            <Select
              label="Moving average window"
              value={window}
              onChange={(w) => visual(factor, operator, w)}
              options={["5", "10", "20", "50", "100", "200"]}
            />
          </div>
        ) : (
          <>
            <label className="field">
              Formula · safe mathematical DSL
              <textarea
                spellCheck={false}
                className="formula"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                maxLength={1000}
              />
            </label>
            <div className="chips">
              {[
                "close / sma(close, 20) - 1",
                "zscore(volume, 20)",
                "abs(revenueGrowth)",
              ].map((s) => (
                <button key={s} onClick={() => setFormula(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="formula-preview">
          <span>LOGIC PREVIEW</span>
          <code>{formula}</code>
          <small className={issue ? "error-text" : "mint"}>
            {issue ||
              "Syntax and units valid · " +
                validation?.unit +
                " · Market evaluation unavailable"}
          </small>
        </div>
        <div className="field">
          Observation timeframe
          <div className="timeframes">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                className={t === timeframe ? "selected" : ""}
                onClick={() => setTimeframe(t)}
                aria-pressed={t === timeframe}
              >
                {t}
                <small>Feed unavailable</small>
              </button>
            ))}
          </div>
        </div>
        <p className="micro">
          Selecting a timeframe records research intent. No aggregation or
          historical availability is claimed. Fundamental fields require
          point-in-time filings and cannot be treated as intraday observations.
        </p>
        <div className="button-row">
          <button
            className="primary"
            disabled={busy || !!issue || !name.trim() || !instrument.trim()}
            onClick={() =>
              void run(() =>
                save({ name, formula, thesis, instrument, timeframe }),
              )
            }
          >
            <LockKeyhole size={14} />
            Save immutable version
          </button>
          <button className="secondary" onClick={openScan}>
            Check scan readiness <ArrowRight size={14} />
          </button>
        </div>
      </Panel>
      <div>
        <Panel
          title="A model is a question."
          kicker="EVIDENCE BEFORE CONFIDENCE"
        >
          <p className="section-note">
            Saving records your logic and assumptions. Validation requires real,
            entitled inputs and a reproducible evaluation plan.
          </p>
          <ol className="method-list">
            <li>
              <b>Inputs &amp; timing</b>
              <span>
                Source, units, completed candles and when each fact became
                knowable.
              </span>
            </li>
            <li>
              <b>Opposing evidence</b>
              <span>
                Countercases, confounders, costs and a meaningful baseline.
              </span>
            </li>
            <li>
              <b>Independent validation</b>
              <span>
                Walk-forward evaluation, sample size, overlap and multiple
                testing.
              </span>
            </li>
          </ol>
          <details>
            <summary>Supported formula language</summary>
            <p>
              Arithmetic + − × /; comparisons; sma(x,n), zscore(x,n), abs(x).
              Lookback 2–500; bounded nodes/depth and evaluation budget. No
              arbitrary code. Price and volume cannot be added. Editor
              autocomplete and syntax highlighting are not implemented.
            </p>
            <p>
              Fields: close, volume, rsi, roic, revenueGrowth, debtEquity. All
              input sources are currently unavailable. RSI calculation and
              filing ingestion await licensed data.
            </p>
          </details>
        </Panel>
        <Panel
          title="Your strategy versions"
          action={<Badge>{strategies.length} SAVED</Badge>}
        >
          {strategies.length ? (
            strategies.map((e) => (
              <details key={e.id}>
                <summary>
                  {e.payload.name}
                  <small>{date(e.created_at)}</small>
                </summary>
                <Badge>UNVALIDATED DRAFT</Badge>
                <p>{e.payload.thesis || "No written thesis recorded."}</p>
                <code className="code">{e.payload.formula}</code>
                <p className="micro">
                  {e.payload.instrument} · {e.payload.timeframe}
                  <br />
                  SHA-256: {e.digest}
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setName(e.payload.name + " · revision");
                    setFormula(e.payload.formula);
                    setThesis(e.payload.thesis);
                    setInstrument(e.payload.instrument);
                    setTimeframe(e.payload.timeframe);
                    setMode("Formula editor");
                  }}
                >
                  Use as new draft <ArrowUpRight size={12} />
                </button>
              </details>
            ))
          ) : (
            <Empty title="A fresh research notebook." icon={FileText}>
              Saved versions appear here. Revising creates a new version; the
              original stays intact.
            </Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Scan({
  strategies,
  busy,
  run,
}: {
  strategies: StrategyEntry[];
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [model, m] = useState("Adaptive default · not validated"),
    [segment, s] = useState("Indian equities"),
    [frame, f] = useState("daily");
  return (
    <div className="two-grid">
      <Panel title="A scan starts with valid evidence." kicker="SOUL SCAN">
        <div className="form-grid">
          <label className="field full">
            Research universe
            <input placeholder="Instrument IDs from an eligible licensed universe" />
          </label>
          <Select
            label="Segment"
            value={segment}
            onChange={s}
            options={["Indian equities", "ETFs", "Indices", "Derivatives"]}
          />
          <Select
            label="Timeframe"
            value={frame}
            onChange={f}
            options={TIMEFRAMES}
          />
          <label className="field full">
            Model
            <select value={model} onChange={(e) => m(e.target.value)}>
              <option>Adaptive default · not validated</option>
              {strategies.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.payload.name} · private draft
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Lookback observations
            <input type="number" min="20" max="10000" placeholder="Required" />
          </label>
          <label className="field">
            Objective
            <input placeholder="Describe the research question" />
          </label>
        </div>
        <div className="notice">
          <ShieldCheck size={18} />
          <span>
            Preflight stops here: provider rights, verified inputs, sufficient
            history and model validation are missing. No quota deduction.
          </span>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api("scan", { model, segment, timeframe: frame });
            })
          }
        >
          <RefreshCw size={14} />
          Check readiness
        </button>
      </Panel>
      <Panel
        title="Clarity at every depth"
        kicker="SOUL REPORT · STRUCTURE PREVIEW"
      >
        <p className="section-note">
          No report has been generated. A completed report will disclose the
          evidence behind every claim.
        </p>
        {[
          [
            "01 · The current",
            "Thesis, context, uncertainty, tail risks and attention / caution / abstain.",
          ],
          [
            "02 · Below the surface",
            "Factors, opposing evidence, scenario assumptions and genuinely comparable Graveyard records.",
          ],
          [
            "03 · Deep research",
            "Exact formulas, as-of inputs, costs, walk-forward splits, corrections, calibration, robustness and reproducibility hashes.",
          ],
        ].map(([title, text]) => (
          <details key={title}>
            <summary>{title}</summary>
            <p>{text}</p>
            <Badge>NOT COMPUTED</Badge>
          </details>
        ))}
        <p className="micro">
          No validated edge, win probability or adaptive learning is claimed.
          Research/analysis, not assured investment returns.
        </p>
      </Panel>
    </div>
  );
}
function Options() {
  const [result, setResult] = useState<ReturnType<typeof bsm> | null>(null),
    [error, e] = useState("");
  return (
    <div className="two-grid">
      <Panel
        title="Black–Scholes–Merton"
        kicker="EDUCATIONAL WHAT-IF · EUROPEAN OPTIONS"
        action={<Badge>USER INPUTS</Badge>}
      >
        <p className="section-note">
          Explore hypothetical mathematics. Inputs are yours; outputs are model
          values, never market quotes or executable premiums.
        </p>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            e("");
            try {
              const d = new FormData(event.currentTarget);
              setResult(
                bsm(
                  ...([
                    "spot",
                    "strike",
                    "years",
                    "rate",
                    "yield",
                    "volatility",
                  ].map((k) => Number(d.get(k))) as [
                    number,
                    number,
                    number,
                    number,
                    number,
                    number,
                  ]),
                ),
              );
            } catch (err) {
              setResult(null);
              e((err as Error).message);
            }
          }}
          onChange={() => setResult(null)}
        >
          {[
            ["spot", "Spot · currency/unit"],
            ["strike", "Strike · same currency/unit"],
            ["years", "Time to expiry · years"],
            ["rate", "Continuous risk-free rate · decimal"],
            ["yield", "Continuous dividend yield · decimal"],
            ["volatility", "Annual volatility · decimal"],
          ].map(([name, label]) => (
            <label className="field" key={name}>
              {label}
              <input type="number" step="any" name={name} required />
            </label>
          ))}
          <button className="primary">
            Calculate hypothetical values <ArrowRight size={14} />
          </button>
        </form>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <details>
          <summary>Formula, assumptions and units</summary>
          <code className="code">
            C = S e^(−qT) N(d₁) − K e^(−rT) N(d₂)
            <br />
            d₁ = [ln(S/K) + (r−q+σ²/2)T] / (σ√T)
            <br />
            d₂ = d₁ − σ√T
          </code>
          <p>
            European exercise; lognormal underlying; constant volatility, rates
            and dividend yield; continuous frictionless trading. No discrete
            dividends, early exercise, transaction costs or liquidity. Theta per
            calendar day; vega and rho per one percentage point; gamma per
            underlying unit. Currency and unit must match.
          </p>
        </details>
      </Panel>
      <Panel title="Sensitivity, with limitations" kicker="CALCULATION OUTPUT">
        {result ? (
          <>
            <Badge>HYPOTHETICAL · NOT MARKET PRICES</Badge>
            <dl className="data-list">
              {Object.entries(result).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{num(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="micro">
              Per underlying unit. No exchange lot multiplier, margin or actual
              contract eligibility is implied.
            </p>
          </>
        ) : (
          <Empty title="Enter your own assumptions." icon={Activity}>
            No default spot, premium, volatility or interest rate has been
            invented. Calculation results appear only after you supply the
            scenario.
          </Empty>
        )}
        <div className="notice">
          Live option chains, implied volatility, contract calendars, multi-leg
          payoff analysis, margin and smile/skew await licensed inputs and
          further implementation.
        </div>
      </Panel>
    </div>
  );
}
function Community({
  tab,
  entries,
  busy,
  run,
  save,
  remove,
}: {
  tab: string;
  entries: NoteEntry[];
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  save: (p: unknown) => Promise<void>;
  remove: (id: string) => void;
}) {
  const [text, t] = useState("");
  if (tab === "Feed")
    return (
      <div className="two-grid">
        <Panel
          title="Make room for an opposing view."
          kicker="PRIVATE DISCUSSION DRAFT"
        >
          <textarea
            aria-label="Private discussion draft"
            value={text}
            onChange={(e) => t(e.target.value)}
            maxLength={2000}
            placeholder="Record an idea, its evidence and the strongest counterargument…"
          />
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !text.trim()}
              onClick={() =>
                void run(async () => {
                  await save({ text });
                  t("");
                })
              }
            >
              <LockKeyhole size={14} />
              Save private draft
            </button>
            <Badge>NOT PUBLISHED</Badge>
          </div>
          <p className="micro">
            Public posting, comments, likes and notifications await moderation
            and legal readiness. No one else can see these drafts.
          </p>
          {entries.map((n) => (
            <article className="private-post" key={n.id}>
              <Badge>YOUR PRIVATE NOTE</Badge>
              <p>{n.payload.text}</p>
              <small>{date(n.created_at)}</small>
              <button
                className="icon"
                aria-label="Delete private note"
                onClick={() => remove(n.id)}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </Panel>
        <Panel
          title="A thoughtful community takes care."
          kicker="PUBLIC COMMUNITY · GATED"
        >
          <Empty title="Evidence over popularity." icon={Users}>
            Publication requires explicit consent, moderation, reporting,
            appeals and clear distinctions between opinion and verified
            outcomes.
          </Empty>
          <p className="section-note">
            Private strategies and Graveyards are never automatically shared.
            There are no invented users, conversations, reviews or rankings
            here.
          </p>
        </Panel>
      </div>
    );
  if (tab === "Marketplace")
    return (
      <>
        <div className="section-intro">
          <span className="overline">COMING AFTER REGULATORY REVIEW</span>
          <h2>Research rights, clearly defined.</h2>
          <p>
            A commerce blueprint. No listings, sellers or purchases are active.
          </p>
        </div>
        <div className="two-grid">
          {[
            [
              "Single Soul report",
              "One intentionally published research artifact, with specified access, attribution and permitted uses.",
            ],
            [
              "Reusable strategy licence",
              "A versioned strategy licence defining duration, permitted execution, updates, attribution and creator IP.",
            ],
          ].map(([title, text]) => (
            <Panel title={title} key={title} action={<LockKeyhole size={18} />}>
              <p className="section-note">{text}</p>
              <Badge>COMMERCE DISABLED</Badge>
              <details>
                <summary>Required before activation</summary>
                <p>
                  RA/IA classification, authorship verification, reviewed
                  licensing terms, refund/dispute handling, tax/invoicing,
                  payment authorization, moderation and explicit owner approval.
                </p>
              </details>
            </Panel>
          ))}
        </div>
      </>
    );
  return (
    <Panel title={tab} action={<Badge>AWAITING REVIEW</Badge>}>
      <Empty
        title={
          tab === "Public Souls"
            ? "Nothing is published by default."
            : "Conversations need a safe foundation."
        }
        icon={Users}
      >
        {tab === "Public Souls"
          ? "No intentionally published, validated Souls are available. A future ranking rubric must consider sample size, out-of-sample calibration, risk, costs, regime and reproducibility. Popularity is not performance."
          : "Groups, membership, moderated conversations, opt-in DMs, block/report/mute and appeals are not implemented. They remain unavailable until secure multi-user moderation is ready."}
      </Empty>
    </Panel>
  );
}
function Settings({
  session,
  busy,
  run,
  refresh,
  reference,
}: {
  session: Session | null;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  reference: boolean;
}) {
  const [alias, a] = useState(session?.alias || ""),
    [confirm, c] = useState(""),
    [support, s] = useState(""),
    [notice, n] = useState(""),
    [sharedGroups, sg] = useState(false),
    [sharedConversations, sc] = useState(false);
  return (
    <>
      <Badge>
        {reference ? "BROWSER-LOCAL REFERENCE" : "OWNER-PRIVATE WORKSPACE"}
      </Badge>
      <label className="field">
        Display name
        <input
          value={alias}
          onChange={(e) => a(e.target.value)}
          maxLength={40}
        />
      </label>
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await api("profile", { alias });
            await refresh();
            n("Display name saved.");
          })
        }
      >
        Save name
      </button>
      <hr />
      <a
        className="secondary"
        href="/signout-with-chatgpt?return_to=%2Fhome"
        target="_top"
      >
        Sign out
      </a>
      {!reference && (
        <div className="button-row">
          <a
            className="secondary"
            href="/downloads/README_Strategic_Souls_GVV.md"
            download
          >
            Download README
          </a>
        </div>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () =>
            download(await api("export"), "GVV_Private_Account_Export.json"),
          )
        }
      >
        <Download size={14} />
        Export all my private app data
      </button>
      <p className="micro">
        Includes preserved legacy synthetic records, explicitly separated from
        genuine research. Keep your export private.
      </p>
      <details>
        <summary>Proposed plans · not on sale</summary>
        <p>
          Free: proposed 5 completed scans/month. Premium: proposed ₹49/month
          with 49 completed scans and no ads. Monthly reset, costs and
          commercial terms need owner validation. Quota ledger, payments,
          advertisements and checkout are disabled.
        </p>
      </details>
      <details>
        <summary>Private support request</summary>
        <textarea
          aria-label="Support request"
          maxLength={1000}
          value={support}
          onChange={(e) => s(e.target.value)}
          placeholder="Describe an issue without sensitive identifiers"
        />
        <button
          className="secondary"
          disabled={busy || support.trim().length < 5}
          onClick={() =>
            void run(async () => {
              const r = await api<{ notice: string }>("support", {
                category: "general",
                message: support,
              });
              n(r.notice);
              s("");
            })
          }
        >
          Record request
        </button>
        <p className="micro">
          No email is sent. A staffed grievance contact is not configured.
        </p>
      </details>
      <details>
        <summary>Withdraw consent and delete my app data</summary>
        <p>
          Deletes your notebook Souls and review events, holdings, notes,
          strategy versions, account and ownership links. Unlinked legacy
          synthetic records and provider backups are separate. This does not
          delete your ChatGPT account.
        </p>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={sharedGroups}
              onChange={(e) => sg(e.target.checked)}
            />{" "}
            Also delete private groups I own and their shared research.
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={sharedConversations}
              onChange={(e) => sc(e.target.checked)}
            />{" "}
            Also delete my paired conversations, including other participants’
            copies.
          </span>
        </label>
        <label className="field">
          Type DELETE MY DATA
          <input value={confirm} onChange={(e) => c(e.target.value)} />
        </label>
        <button
          className="danger"
          disabled={busy || confirm !== "DELETE MY DATA"}
          onClick={() =>
            void run(async () => {
              const r = await api<{ notice: string }>("erase", {
                confirmation: confirm,
                confirmSharedGroupDeletion: sharedGroups,
                confirmSharedConversationDeletion: sharedConversations,
              });
              await refresh();
              n(r.notice || "Local reference data deleted.");
              c("");
            })
          }
        >
          Delete my private app data
        </button>
      </details>
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
