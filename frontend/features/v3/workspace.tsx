"use client";
import Link from "next/link";
import { ManualPortfolio } from "./portfolio";
import { SCAN_PRESETS, SCAN_LEVEL_HELP, scanFromPreset } from "../../../backend/services/v3/scan-presets";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Home,
  ChartNoAxesCombined,
  Plus,
  Users,
  UserRound,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  Archive,
  GitBranch,
  ShieldCheck,
  Activity,
  LockKeyhole,
  Download,
  RefreshCw,
  FileText,
  X,
  Globe2,
  Orbit,
  FlaskConical,
  Layers3,
  Send,
  Settings2,
} from "lucide-react";
import { WATCHLIST, bsm } from "../../../backend/services/legacy/research";
import { TradingViewWidget } from "../../components/tradingview-widget";
import {
  MODES,
  PROFILE_LABEL,
  EMPTY_SCAN,
  parseCommand,
  validateScan,
  validateSoul,
  soulState,
  diff,
  stable,
  type Mode,
  type Profile,
  type Soul,
  type SoulPayload,
  type SoulVersion,
  type SoulEvent,
  type Team,
  type Scan,
} from "../../../backend/services/v3/model";
type Session = {
  configured: boolean;
  authenticated: boolean;
  google: boolean;
  id?: string;
  profile?: Profile | null;
  notice?: string;
  preferences?: { preferences: { mode?: Mode } };
};
type ScanVersion = {
  id: string;
  scan_id: string;
  parent_id: string | null;
  branch: string;
  summary: string;
  ast: Scan;
  digest: string;
  created_at: string;
  author_id: string;
};
type Member = {
  team_id: string;
  body_id: string;
  role: string;
  created_at: string;
};
type Row = { id: string; created_at: string; [key: string]: unknown };
type Page = { rows: Row[]; nextOffset: number | null };
async function api<T = unknown>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch("/api/v3/" + path, {
    method: payload === undefined ? "GET" : "POST",
    headers:
      payload === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(18000),
    cache: "no-store",
  });
  const value = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(value.error ?? "Request failed."));
  return value as T;
}
async function all<T>(resource: string): Promise<T[]> {
  const result: T[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const p: Page = await api(
      resource + (resource.includes("?") ? "&" : "?") + "offset=" + offset,
    );
    result.push(...(p.rows as T[]));
    offset = p.nextOffset;
    if (result.length > 10000)
      throw new Error(
        "Archive is too large for this view. Use a complete account export.",
      );
  }
  return result;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
const blank = (): SoulPayload => ({
  title: "",
  topic: "",
  hypothesis: "",
  horizon: "One month",
  reasoning: "",
  opposingCase: "",
  invalidation: "",
  reviewAt: null,
  tags: [],
  evidence: [],
  commitment: "DRAFT",
  dataRequired: false,
});
const example: Partial<SoulPayload> = {
  title: "Could cheaper energy ease input costs?",
  topic: "Energy → Indian manufacturers",
  hypothesis:
    "Lower energy costs could improve manufacturers’ margins over the next quarter.",
  horizon: "One quarter",
  reasoning:
    "Energy is one input to production. Margins also depend on demand, FX and pricing.",
  opposingCase: "Weak demand or a weaker rupee could offset cheaper energy.",
  invalidation:
    "The proposed mechanism is contradicted if input costs stay high or margins fail to improve.",
};
const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: ChartNoAxesCombined },
  { id: "create", label: "Create", icon: Plus },
  { id: "teams", label: "Teams", icon: Users },
  { id: "profile", label: "Profile", icon: UserRound },
];
function Badge({ children }: { children: ReactNode }) {
  return <span className="v3-badge">{children}</span>;
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
    <section className={"v3-panel " + className}>
      <div className="v3-panel-head">
        <div>
          {kicker && <p className="v3-eyebrow">{kicker}</p>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({
  title,
  children,
  icon: Icon = BookOpen,
}: {
  title: string;
  children: ReactNode;
  icon?: typeof BookOpen;
}) {
  return (
    <div className="v3-empty">
      <span>
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="v3-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function OrbitArt() {
  return (
    <svg
      className="v3-orbit"
      viewBox="0 0 440 300"
      role="img"
      aria-label="An idea connected to evidence, opposing views and review"
    >
      <defs>
        <radialGradient id="orb">
          <stop stopColor="var(--x1-text-tertiary)" stopOpacity=".12" />
          <stop offset="1" stopColor="var(--x1-text-tertiary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="230" cy="148" r="148" fill="url(#orb)" />
      <g fill="none" stroke="var(--x1-divider)">
        <ellipse
          cx="230"
          cy="148"
          rx="173"
          ry="83"
          transform="rotate(-30 230 148)"
        />
        <ellipse
          cx="230"
          cy="148"
          rx="173"
          ry="83"
          transform="rotate(30 230 148)"
        />
        <circle cx="230" cy="148" r="104" strokeDasharray="2 7" />
        <path d="M82 210L230 148L355 82" />
      </g>
      <circle cx="230" cy="148" r="43" fill="var(--x1-surface-2)" stroke="var(--x1-text-tertiary)" />
      <g fill="var(--x1-text-tertiary)">
        <circle cx="82" cy="210" r="5" />
        <circle cx="355" cy="82" r="5" />
        <circle cx="170" cy="61" r="4" />
      </g>
      <g
        fill="var(--x1-text-primary)"
        fontFamily="Space Grotesk,sans-serif"
        textAnchor="middle"
      >
        <text x="230" y="152" fontSize="13" letterSpacing="3">
          SOUL
        </text>
        <text x="72" y="239" fontSize="12" letterSpacing="2">
          EVIDENCE
        </text>
        <text x="355" y="63" fontSize="12" letterSpacing="2">
          COUNTERCASE
        </text>
        <text x="155" y="39" fontSize="12" letterSpacing="2">
          REVIEW
        </text>
      </g>
    </svg>
  );
}
export default function V3Workspace() {
  const [view, setView] = useState("home"),
    [collapsed, setCollapsed] = useState(false),
    [mode, setMode] = useState<Mode>("Beginner"),
    [search, setSearch] = useState(""),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [offline, setOffline] = useState(false);
  const [souls, setSouls] = useState<Soul[]>([]),
    [versions, setVersions] = useState<SoulVersion[]>([]),
    [events, setEvents] = useState<SoulEvent[]>([]),
    [teams, setTeams] = useState<Team[]>([]),
    [scans, setScans] = useState<ScanVersion[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [revision, setRevision] = useState<SoulVersion | null>(null),
    [exampleDraft, setExampleDraft] = useState(false),
    [seed, setSeed] = useState<SoulPayload | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    preferenceOwner = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const s = await api<Session>("session");
    setSession(s);
    if (s.authenticated && s.id !== preferenceOwner.current) {
      if (s.preferences?.preferences.mode)
        setMode(s.preferences.preferences.mode);
      preferenceOwner.current = s.id ?? null;
    }
    if (!s.authenticated) preferenceOwner.current = null;
    if (s.authenticated && s.profile) {
      const data = await Promise.all([
        all<Soul>("souls"),
        all<SoulVersion>("versions"),
        all<SoulEvent>("events"),
        all<Team>("teams"),
        all<ScanVersion>("scans"),
      ]);
      setSouls(data[0]);
      setVersions(data[1]);
      setEvents(data[2]);
      setTeams(data[3]);
      setScans(data[4]);
    } else {
      setSouls([]);
      setVersions([]);
      setEvents([]);
      setTeams([]);
      setScans([]);
    }
  }, []);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    queueMicrotask(on);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const v = new URLSearchParams(window.location.search).get("view");
    if (
      v &&
      [
        ...NAV.map((n) => n.id),
        "library",
        "graveyard",
        "scans",
        "health",
        "options",
        "backtests",
      ].includes(v)
    )
      queueMicrotask(() => setView(v));
    void Promise.resolve()
      .then(refresh)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [refresh]);
  function navigate(next: string) {
    setView(next);
    setSelected(null);
    setMessage("");
    setError("");
    setSearch("");
    window.history.replaceState(null, "", "?view=" + next);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Retry safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  const current = selected
    ? versions.find(
        (v) => v.id === souls.find((s) => s.id === selected)?.head_id,
      )
    : null;
  const filtered = souls.filter((s) => {
    const v = versions.find((v) => v.id === s.head_id);
    if (!v) return false;
    const state = soulState(v, events);
    return (
      (view === "graveyard"
        ? ["ARCHIVED", "RESOLVED_INVALIDATED", "INCONCLUSIVE"].includes(state)
        : view === "library" || !["ARCHIVED"].includes(state)) &&
      JSON.stringify(v.payload).toLowerCase().includes(search.toLowerCase())
    );
  });
  const nav = (id: string) => navigate(id);
  function create(ex = false) {
    setRevision(null);
    setExampleDraft(ex);
    setSeed(ex ? { ...blank(), ...example } : null);
    navigate("create");
  }
  return (
    <div className={"v3-app " + (collapsed ? "v3-collapsed" : "")}>
      <a className="v3-skip" href="#v3-main">
        Skip to content
      </a>
      <aside className="v3-sidebar">
        <Link className="v3-brand" href="/">
          <span className="v3-mark" aria-hidden="true">
            V<span>·</span>
          </span>
          <span>
            <small>GLOBAL VERTEX VECTORS</small>
            <b>
              STRATEGIC
              <br />
              SOULS<span>.</span>
            </b>
          </span>
        </Link>
        <p className="v3-rail-label">YOUR RESEARCH WORKSPACE</p>
        <nav aria-label="Desktop navigation">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "is-active" : ""}
              onClick={() => (n.id === "create" ? create() : nav(n.id))}
              aria-current={view === n.id ? "page" : undefined}
              title={n.label}
            >
              <n.icon size={19} />
              <span>{n.id === "create" ? "Create a Soul" : n.label}</span>
              {n.id === "create" && <kbd>+</kbd>}
            </button>
          ))}
        </nav>
        <div className="v3-rule" />
        <nav aria-label="Research tools">
          {[
            { id: "library", label: "Soul Library", icon: BookOpen },
            { id: "scans", label: "Scan Builder", icon: GitBranch },
            { id: "backtests", label: "Backtests", icon: FlaskConical },
            { id: "graveyard", label: "Graveyard", icon: Archive },
            { id: "options", label: "Options Lab", icon: Layers3 },
            { id: "health", label: "Source health", icon: Activity },
          ].map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "is-active" : ""}
              onClick={() => nav(n.id)}
              title={n.label}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="v3-sidebar-foot">
          <div className="v3-private">
            <LockKeyhole size={17} />
            <b>Thoughtfully private.</b>
            <p>
              Your ideas. Your evidence.
              <br />
              Your research history.
            </p>
          </div>
          <button className="v3-profile-button" onClick={() => nav("profile")}>
            <span className="v3-avatar">
              {session?.profile?.display_name.slice(0, 2).toUpperCase() || "GV"}
            </span>
            <span>
              <b>{session?.profile?.display_name || "Your Body"}</b>
              <small>
                {session?.profile
                  ? "@" + session.profile.handle
                  : "Independent sign-in"}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
          <small className="v3-muted" data-testid="release-identity">Phoenix 2026.11.16</small>
        </div>
      </aside>
      <div className="v3-body">
        <header className="v3-topbar">
          <button
            className="v3-icon v3-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
          <span className="v3-breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <b>
              {view === "home"
                ? "Your research"
                : view.charAt(0).toUpperCase() + view.slice(1)}
            </b>
          </span>
          <form
            className="v3-global-search"
            role="search"
            aria-label="Search authorized research"
            onSubmit={(e) => {
              e.preventDefault();
              const query = String(
                new FormData(e.currentTarget).get("q") ?? "",
              );
              void run(async () => {
                await refresh();
                navigate("library");
                setSearch(query);
              });
            }}
          >
            <Search size={16} />
            <input
              name="q"
              aria-label="Search your private and Team Souls"
              placeholder="Search your research…"
              maxLength={200}
            />
          </form>
          <div className="v3-top-actions">
            <span className="v3-local-label">V3 RESEARCH WORKSPACE</span>
            <button className="v3-source" onClick={() => nav("health")}>
              <span className="v3-dot" />
              <span>Data not connected</span>
              <ChevronRight size={12} />
            </button>
            <button
              className="v3-icon"
              aria-label="Refresh research"
              disabled={busy || loading}
              onClick={() => run(refresh)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main
          id="v3-main"
          className={"v3-main " + (view === "create" ? "v3-create-main" : "")}
          tabIndex={-1}
        >
          {offline && (
            <div className="v3-notice" role="status">
              You’re offline. Keep this tab open to retain the draft in memory.
              Saving requires a connection.
            </div>
          )}
          {error && (
            <div className="v3-notice v3-error" role="alert">
              {error}
              <button
                className="v3-icon"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="v3-notice v3-success" role="status">
              <Check size={18} />
              {message}
            </div>
          )}
          <div className="v3-page-intro">
            <div>
              <p className="v3-eyebrow">
                {["markets", "health"].includes(view)
                  ? "01 / STRATEGIC GLOBAL"
                  : view === "teams" || view === "profile"
                    ? "02 / SOCIAL COMMUNITY"
                    : view === "home"
                      ? "A QUESTION. A RECORD. A CLEARER PERSPECTIVE."
                      : "03 / SOUL INTELLIGENCE"}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {view === "home" ? (
                  <>
                    Your next market idea
                    <br />
                    starts with a <em>question.</em>
                  </>
                ) : view === "create" ? (
                  "Create your Soul."
                ) : view === "library" ? (
                  "A library of your thinking."
                ) : view === "graveyard" ? (
                  "Good research learns from failure."
                ) : view === "markets" ? (
                  "The world. Through an Indian lens."
                ) : view === "teams" ? (
                  "Better questions. Together."
                ) : view === "profile" ? (
                  "Your Body. Your perspective."
                ) : view === "scans" ? (
                  "Make your reasoning reproducible."
                ) : view === "options" ? (
                  "Understand the assumptions."
                ) : view === "backtests" ? (
                  "Evidence before confidence."
                ) : (
                  "Know the source. Know the limits."
                )}
              </h1>
              {view === "home" && (
                <p>
                  Turn a market idea into a hypothesis you can challenge,
                  revisit and learn from.
                </p>
              )}
            </div>
            {view !== "create" && view !== "home" && (
              <button className="v3-primary" onClick={() => create()}>
                <Plus size={17} />
                Create Soul
              </button>
            )}
          </div>
          {view === "home" && (
            <>
              {session?.configured === false && (
                <div className="v3-notice" role="status">
                  <span>
                    Your saved research is in the owner workspace. New profiles
                    and Teams are not connected yet.
                  </span>
                  <Link className="v3-secondary" href="/legacy">
                    Open saved research <ArrowUpRight size={16} />
                  </Link>
                </div>
              )}
              <section className="v3-hero">
                <div>
                  <Badge>
                    <Orbit size={12} /> RESEARCH WITH MEMORY
                  </Badge>
                  <h2>
                    Start with an idea.
                    <br />
                    Keep the <span>whole story.</span>
                  </h2>
                  <p>
                    Your hypothesis, its evidence, the opposing case.
                    <br className="v3-desktop" /> Preserved together. Reviewed
                    over time.
                  </p>
                  <div className="v3-actions">
                    <button className="v3-primary" onClick={() => create()}>
                      <Plus size={18} />
                      Create your first Soul
                      <ArrowUpRight size={17} />
                    </button>
                    <button className="v3-text" onClick={() => create(true)}>
                      Try an example
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="v3-hero-foot">
                    <LockKeyhole size={13} />
                    Private by default<span>·</span>
                    <span>Three simple steps</span>
                  </div>
                </div>
                <OrbitArt />
              </section>
              <div className="v3-home-grid">
                <Panel
                  title="My Souls"
                  kicker="IDEAS YOU’RE TRACKING"
                  action={
                    <button className="v3-text" onClick={() => nav("library")}>
                      Library <ArrowUpRight size={15} />
                    </button>
                  }
                >
                  {loading ? (
                    <div
                      className="v3-skeleton"
                      aria-label="Loading research"
                    />
                  ) : filtered.length ? (
                    filtered.slice(0, 3).map((s) => {
                      const v = versions.find((v) => v.id === s.head_id)!;
                      return (
                        <button
                          className="v3-soul-row"
                          key={s.id}
                          onClick={() => {
                            nav("library");
                            setSelected(s.id);
                          }}
                        >
                          <span className="v3-soul-icon">
                            <Orbit size={19} />
                          </span>
                          <span>
                            <b>{s.title}</b>
                            <small>
                              {v.payload.topic} ·{" "}
                              {soulState(v, events).replaceAll("_", " ")}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      );
                    })
                  ) : session?.configured === false ? (
                    <Empty title="Your saved research is ready to revisit.">
                      Open the owner workspace to save, review and manage your
                      existing Souls.
                      <Link className="v3-text" href="/legacy">
                        Open saved research <ArrowUpRight size={15} />
                      </Link>
                    </Empty>
                  ) : (
                    <Empty title="The first question is yours.">
                      Save an idea with an opposing case and a review date. Your
                      research starts here.
                      <button className="v3-text" onClick={() => create()}>
                        Create a Soul <ArrowRight size={15} />
                      </button>
                    </Empty>
                  )}
                  <div className="v3-panel-foot">
                    <button
                      className="v3-text"
                      onClick={() => nav("graveyard")}
                    >
                      <Archive size={15} /> Explore your Graveyard
                    </button>
                  </div>
                </Panel>
                <Panel
                  title="Market context"
                  kicker="SOURCE AWARE, ALWAYS"
                  action={
                    <button className="v3-text" onClick={() => nav("markets")}>
                      Markets <ArrowUpRight size={15} />
                    </button>
                  }
                >
                  <div className="v3-market-mini">
                    {[
                      ["NIFTY", "Nifty 50"],
                      ["INDIAVIX", "India VIX"],
                      ["USDINR", "USD / INR"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <span>
                          <b>{label}</b>
                          <small>{key}</small>
                        </span>
                        <span>
                          <b className="v3-mono">—</b>
                          <small>Not configured</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="v3-footnote">
                    <ShieldCheck size={15} />
                    Numerical quotes require verified feed rights and
                    timestamps. Missing values remain unavailable.
                  </p>
                </Panel>
              </div>
              <div className="v3-home-grid v3-secondary-grid">
                <button className="v3-education" onClick={() => nav("guide")}>
                  <span className="v3-eyebrow">THE RESEARCH HABIT / 01</span>
                  <BookOpen size={22} />
                  <h3>What would prove you wrong?</h3>
                  <p>
                    A useful hypothesis makes room for an opposing explanation.
                  </p>
                  <span className="v3-text">
                    Read the two-minute guide <ArrowRight size={15} />
                  </span>
                </button>
                <Panel title="Research together" kicker="SOCIAL COMMUNITY">
                  {teams.length ? (
                    <div className="v3-team-mini">
                      {teams.slice(0, 3).map((t) => (
                        <button
                          className="v3-soul-row"
                          key={t.id}
                          onClick={() => nav("teams")}
                        >
                          <Users size={18} />
                          <b>{t.name}</b>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="v3-team-invite">
                      <Users size={24} />
                      <p>
                        A Team gives your research a room, explicit roles and an
                        accountable history.
                      </p>
                      <button
                        className="v3-secondary"
                        onClick={() => nav("teams")}
                      >
                        Explore Teams <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
          {view === "home" && (
            <Panel title="Your research toolkit" kicker="SOUL INTELLIGENCE">
              <div className="v3-actions">
                <button className="v3-secondary" onClick={() => nav("scans")}>
                  <GitBranch size={16} />
                  Scan Builder
                </button>
                <button
                  className="v3-secondary"
                  onClick={() => nav("backtests")}
                >
                  <FlaskConical size={16} />
                  Backtests
                </button>
                <button className="v3-secondary" onClick={() => nav("options")}>
                  <Layers3 size={16} />
                  Options Lab
                </button>
                <button
                  className="v3-secondary"
                  onClick={() => nav("graveyard")}
                >
                  <Archive size={16} />
                  Graveyard
                </button>
              </div>
            </Panel>
          )}
          {view === "create" && (
            <SoulWizard
              key={revision?.id ?? (exampleDraft ? "example" : "new")}
              initial={seed ?? revision?.payload ?? null}
              initialTeamId={
                souls.find((s) => s.id === revision?.soul_id)?.team_id ?? ""
              }
              revision={revision}
              exampleMode={exampleDraft}
              mode={mode}
              setMode={setMode}
              teams={teams}
              busy={busy}
              authorized={!!session?.profile}
              servicesAvailable={session?.configured === true}
              openProfile={() => nav("profile")}
              save={(payload, teamId, requestId) =>
                run(async () => {
                  if (exampleDraft)
                    throw new Error(
                      "This is an example. Choose “Use as my draft” before saving real research.",
                    );
                  const saved = await api<SoulVersion>("soul", {
                    payload,
                    teamId,
                    soulId: revision?.soul_id ?? null,
                    expectedHead: revision?.id ?? null,
                    requestId,
                  });
                  await refresh();
                  setView("library");
                  setSelected(saved.soul_id);
                  setMessage(
                    "Soul saved. Your original snapshot and its history are preserved.",
                  );
                })
              }
              useExample={() => {
                setExampleDraft(false);
                setSeed({ ...blank(), ...example });
              }}
            />
          )}
          {(view === "library" || view === "graveyard") && (
            <>
              {current ? (
                <SoulDetail
                  soul={souls.find((s) => s.id === current.soul_id)!}
                  version={current}
                  versions={versions.filter(
                    (v) => v.soul_id === current.soul_id,
                  )}
                  events={events.filter((e) => e.soul_id === current.soul_id)}
                  busy={busy}
                  run={run}
                  back={() => setSelected(null)}
                  revise={() => {
                    setRevision(current);
                    setSeed(null);
                    setExampleDraft(false);
                    navigate("create");
                  }}
                  reload={refresh}
                  notify={setMessage}
                />
              ) : (
                <>
                  <div className="v3-library-toolbar">
                    <label className="v3-search">
                      <Search size={17} />
                      <input
                        aria-label="Search Souls, tags and evidence"
                        placeholder="Search ideas, topics, tags…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <button
                      className="v3-secondary"
                      onClick={() =>
                        nav(view === "graveyard" ? "library" : "graveyard")
                      }
                    >
                      {view === "graveyard" ? (
                        <BookOpen size={16} />
                      ) : (
                        <Archive size={16} />
                      )}
                      {view === "graveyard" ? "Soul Library" : "Graveyard"}
                    </button>
                  </div>
                  {view === "graveyard" && (
                    <p className="v3-callout">
                      A Dead Soul records a failed criterion or a negative
                      research outcome. It is not automatically a losing trade.
                      Regime and factor context stay unknown until authorized
                      historical data is available.
                    </p>
                  )}
                  <div className="v3-soul-grid">
                    {filtered.map((s) => {
                      const v = versions.find((v) => v.id === s.head_id)!;
                      return (
                        <button
                          className="v3-soul-card"
                          key={s.id}
                          onClick={() => setSelected(s.id)}
                        >
                          <div>
                            <Badge>
                              {soulState(v, events).replaceAll("_", " ")}
                            </Badge>
                            <ArrowUpRight size={18} />
                          </div>
                          <h2>{s.title}</h2>
                          <p>{v.payload.hypothesis || "Draft hypothesis"}</p>
                          <footer>
                            <span>
                              {s.team_id ? "Team research" : "Private research"}
                            </span>
                            <span>{v.payload.evidence.length} sources</span>
                          </footer>
                        </button>
                      );
                    })}
                  </div>
                  {!filtered.length && (
                    <Empty
                      icon={view === "graveyard" ? Archive : BookOpen}
                      title={
                        session?.configured === false
                          ? "Your existing history stays in the owner workspace."
                          : view === "graveyard"
                          ? "Every outcome has something to teach."
                          : "No Souls here yet."
                      }
                    >
                      {session?.configured === false
                        ? "The new research service is not connected. Open your saved research to view its preserved history."
                        : view === "graveyard"
                        ? "Archived, invalidated and inconclusive research appears here with its original record."
                        : "Create a question, gather evidence and save a private Soul."}
                      {session?.configured === false ? (
                        <Link className="v3-text" href="/legacy">
                          Open saved research <ArrowUpRight size={15} />
                        </Link>
                      ) : (
                        <button className="v3-text" onClick={() => create()}>
                          Create Soul <Plus size={15} />
                        </button>
                      )}
                    </Empty>
                  )}
                </>
              )}
            </>
          )}
          {view === "markets" && (
            <Markets
              seedIdea={(topic) => {
                setRevision(null);
                setSeed({ ...blank(), topic });
                setExampleDraft(false);
                nav("create");
              }}
            />
          )}
          {view === "profile" && (
            <ProfileView
              session={session}
              busy={busy}
              mode={mode}
              run={run}
              reload={refresh}
              notify={setMessage}
            />
          )}
          {view === "teams" && (
            <TeamView
              teams={teams}
              busy={busy}
              authorized={!!session?.profile}
              run={run}
              reload={refresh}
              notify={setMessage}
              openSoul={(s) => {
                navigate("library");
                setSelected(s);
              }}
              souls={souls}
            />
          )}
          {view === "scans" && (
            <ScanBuilder
              mode={mode}
              scans={scans}
              teams={teams}
              busy={busy}
              run={run}
              reload={refresh}
              notify={setMessage}
              authorized={!!session?.profile}
            />
          )}
          {view === "backtests" && (
            <Panel title="Reproducible evaluation" kicker="SOUL SCAN LAB">
              <div className="v3-callout">
                A unique thesis has no statistically valid historical win rate
                of its own. A backtest evaluates a defined signal and simulated
                execution model on a declared dataset.
              </div>
              <div className="v3-readiness-grid">
                {[
                  ["Dataset provenance", "No entitled history connected"],
                  [
                    "Walk-forward validation",
                    "Python evaluator; runtime integration unverified",
                  ],
                  ["Fees, taxes & slippage", "Must be declared in each run"],
                  ["Out-of-sample evidence", "No completed runs to display"],
                ].map(([title, note]) => (
                  <div key={title}>
                    <FlaskConical size={19} />
                    <h3>{title}</h3>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              <p className="v3-footnote">
                The local worker includes deterministic statistical and leakage
                tests. These are software verification, not investment
                performance.
              </p>
              <button className="v3-secondary" onClick={() => nav("scans")}>
                Build a versioned scan <ArrowRight size={16} />
              </button>
            </Panel>
          )}
          {view === "health" && <SourceHealth />}
          {view === "guide" && <Guide />}
          {view === "options" && <OptionsLab />}
          <footer className="v3-footer">
            <span>
              STRATEGIC SOULS <span className="v3-mint">/</span> GLOBAL VERTEX
              VECTORS
            </span>
            <p>
              Private research and education. No trade execution. Public
              publishing and payments are disabled.
            </p>
            <Link href="/legacy">
              Existing owner workspace <ArrowUpRight size={12} />
            </Link>
          </footer>
        </main>
      </div>
      <nav className="v3-bottom-nav" aria-label="Mobile navigation">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={
              (view === n.id ? "is-active " : "") +
              (n.id === "create" ? "v3-nav-create" : "")
            }
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => (n.id === "create" ? create() : nav(n.id))}
          >
            <span>
              <n.icon size={21} />
            </span>
            <small>
              {n.label}
              {n.id === "create" ? " +" : ""}
            </small>
          </button>
        ))}
      </nav>
    </div>
  );
}
function SoulWizard({
  initial,
  initialTeamId,
  revision,
  exampleMode,
  mode,
  setMode,
  teams,
  busy,
  authorized,
  servicesAvailable,
  openProfile,
  save,
  useExample,
}: {
  initial: SoulPayload | null;
  initialTeamId: string;
  revision: SoulVersion | null;
  exampleMode: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  teams: Team[];
  busy: boolean;
  authorized: boolean;
  servicesAvailable: boolean;
  openProfile: () => void;
  save: (p: SoulPayload, t: string | null, k: string) => void;
  useExample: () => void;
}) {
  const [draft, setDraft] = useState<SoulPayload>(initial ?? blank()),
    [step, setStep] = useState(1),
    [teamId, setTeamId] = useState(initialTeamId),
    [validation, setValidation] = useState(""),
    [showSource, setShowSource] = useState(false),
    [source, setSource] = useState({
      title: "",
      url: "",
      claim: "",
      stance: "SUPPORTS",
      publishedAt: "",
      knownAt: "",
    }),
    [preview, setPreview] = useState(false);
  const requestId = useRef<string | null>(null),
    priorPayload = useRef(""),
    first = useRef<HTMLInputElement>(null);
  function patch(p: Partial<SoulPayload>) {
    setDraft((d) => ({ ...d, ...p }));
    setValidation("");
  }
  function next() {
    if (
      step === 1 &&
      (!draft.title.trim() || draft.hypothesis.trim().length < 10)
    ) {
      setValidation(
        "Give the idea a title and a hypothesis of at least ten characters. You can also save an incomplete draft.",
      );
      return;
    }
    setValidation("");
    setStep(step + 1);
    window.scrollTo(0, 0);
  }
  function submit(commitment: "DRAFT" | "COMMITTED") {
    try {
      const payload = validateSoul({ ...draft, commitment });
      const fingerprint = JSON.stringify({ payload, teamId });
      if (priorPayload.current !== fingerprint) {
        requestId.current = crypto.randomUUID();
        priorPayload.current = fingerprint;
      }
      save(payload, teamId || null, requestId.current!);
    } catch (e) {
      setValidation((e as Error).message);
    }
  }
  function addSource() {
    try {
      const s = {
        ...source,
        publishedAt: new Date(source.publishedAt).toISOString(),
        knownAt: new Date(source.knownAt).toISOString(),
        stance: source.stance as "SUPPORTS" | "OPPOSES" | "CONTEXT",
      };
      const result = validateSoul({
        ...draft,
        commitment: "DRAFT",
        evidence: [...draft.evidence, s],
      });
      patch({ evidence: result.evidence });
      setShowSource(false);
      setSource({
        title: "",
        url: "",
        claim: "",
        stance: "SUPPORTS",
        publishedAt: "",
        knownAt: "",
      });
    } catch (e) {
      setValidation((e as Error).message);
    }
  }
  return (
    <section className="v3-wizard">
      {exampleMode && (
        <div className="v3-notice">
          <FlaskConical size={18} />
          <span>
            INTERACTIVE EXAMPLE · Hypothetical reasoning, no historical
            performance.
          </span>
          <button className="v3-text" onClick={useExample}>
            Use as my draft
          </button>
        </div>
      )}
      {revision && (
        <p className="v3-callout">
          <GitBranch size={17} />
          New revision of {revision.payload.title}. The original stays
          immutable.
        </p>
      )}
      <div className="v3-wizard-top">
        <ol aria-label="Creation progress">
          {["Idea", "Evidence", "Save & track"].map((label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className={step >= i + 1 ? "is-current" : ""}
            >
              <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>
              <b>{label}</b>
            </li>
          ))}
        </ol>
        <label className="v3-mode">
          <span>Presentation</span>
          <select
            aria-label="Research presentation"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>{m === "Standard" ? "Intermediate" : m}</option>
            ))}
          </select>
        </label>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else submit("COMMITTED");
        }}
      >
        {step === 1 && (
          <div className="v3-wizard-fields">
            <Field label="Give your idea a name">
              <input
                ref={first}
                value={draft.title}
                maxLength={100}
                placeholder="A short title for your question"
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <Field
              label="What do you think will happen?"
              hint="Be specific enough to challenge later."
            >
              <textarea
                value={draft.hypothesis}
                maxLength={2000}
                rows={4}
                placeholder="I think… because…"
                onChange={(e) => patch({ hypothesis: e.target.value })}
              />
            </Field>
            <div className="v3-form-grid">
              <Field label="Asset, sector or topic">
                <input
                  value={draft.topic}
                  maxLength={80}
                  placeholder="For example: Indian manufacturing"
                  onChange={(e) => patch({ topic: e.target.value })}
                />
              </Field>
              <Field label="Time horizon">
                <select
                  value={draft.horizon}
                  onChange={(e) => patch({ horizon: e.target.value })}
                >
                  {[
                    "One week",
                    "One month",
                    "One quarter",
                    "One year",
                    "Open research question",
                  ].map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="v3-footnote">
              Your words become an editable research record. Nothing here places
              an order.
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="v3-wizard-fields">
            <Field label="Why might this happen?">
              <textarea
                rows={3}
                value={draft.reasoning}
                maxLength={2000}
                onChange={(e) => patch({ reasoning: e.target.value })}
              />
            </Field>
            <Field label="What is the strongest opposing case?">
              <textarea
                rows={3}
                value={draft.opposingCase}
                maxLength={1500}
                placeholder="What else could explain this?"
                onChange={(e) => patch({ opposingCase: e.target.value })}
              />
            </Field>
            <Field
              label="What would prove this wrong?"
              hint="Declare the observation before you know the outcome."
            >
              <textarea
                rows={3}
                value={draft.invalidation}
                maxLength={1500}
                placeholder="I would reconsider if…"
                onChange={(e) => patch({ invalidation: e.target.value })}
              />
            </Field>
            <div className="v3-evidence-head">
              <h3>
                Evidence <Badge>{draft.evidence.length} references</Badge>
              </h3>
              <button
                type="button"
                className="v3-secondary"
                onClick={() => setShowSource(!showSource)}
              >
                <Plus size={16} />
                Add source
              </button>
            </div>
            {draft.evidence.map((s, i) => (
              <article className="v3-evidence" key={s.url}>
                <div>
                  <Badge>{s.stance}</Badge>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title} <ArrowUpRight size={14} />
                  </a>
                  <p>{s.claim}</p>
                  <small>
                    Published {stamp(s.publishedAt)} · Known {stamp(s.knownAt)}
                  </small>
                </div>
                <button
                  type="button"
                  className="v3-icon"
                  aria-label={"Remove source " + s.title}
                  onClick={() =>
                    patch({
                      evidence: draft.evidence.filter((_, j) => i !== j),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </article>
            ))}
            {showSource && (
              <fieldset className="v3-source-fields">
                <legend>Reference only · content and rights unverified</legend>
                <Field label="Source title">
                  <input
                    value={source.title}
                    onChange={(e) =>
                      setSource({ ...source, title: e.target.value })
                    }
                  />
                </Field>
                <Field label="HTTPS source URL">
                  <input
                    type="url"
                    value={source.url}
                    placeholder="https://…"
                    onChange={(e) =>
                      setSource({ ...source, url: e.target.value })
                    }
                  />
                </Field>
                <Field label="Your interpretation">
                  <textarea
                    value={source.claim}
                    rows={2}
                    onChange={(e) =>
                      setSource({ ...source, claim: e.target.value })
                    }
                  />
                </Field>
                <Field label="Source stance">
                  <select
                    value={source.stance}
                    onChange={(e) =>
                      setSource({ ...source, stance: e.target.value })
                    }
                  >
                    {["SUPPORTS", "OPPOSES", "CONTEXT"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <div className="v3-form-grid">
                  <Field label="Published (your local time)">
                    <input
                      type="datetime-local"
                      value={source.publishedAt}
                      onChange={(e) =>
                        setSource({ ...source, publishedAt: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Known to you (your local time)">
                    <input
                      type="datetime-local"
                      value={source.knownAt}
                      onChange={(e) =>
                        setSource({ ...source, knownAt: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  className="v3-secondary"
                  onClick={addSource}
                >
                  Attach reference
                </button>
              </fieldset>
            )}
            {!draft.evidence.length && (
              <p className="v3-callout">
                No references yet. You can save a draft; evidence is still
                missing.
              </p>
            )}
            {!draft.evidence.some((e) => e.stance === "OPPOSES") && (
              <p className="v3-footnote">
                Consider finding a source that challenges your hypothesis.
              </p>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="v3-wizard-fields">
            <Field label="Who can see this Soul?">
              <select
                value={teamId}
                disabled={!!revision}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">Private · only you</option>
                {teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    Team · {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="v3-footnote">
              {revision
                ? "Revisions retain the original audience."
                : "Team sharing is an explicit choice. Public publication is disabled."}
            </p>
            <Field label="When will you review it?">
              <input
                type="datetime-local"
                value={draft.reviewAt ? localTime(draft.reviewAt) : ""}
                onChange={(e) =>
                  patch({
                    reviewAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </Field>
            {mode !== "Beginner" && (
              <Field label="Tags (comma separated)">
                <input
                  value={draft.tags.join(", ")}
                  onChange={(e) =>
                    patch({
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            )}
            <label className="v3-checkbox">
              <input
                type="checkbox"
                checked={draft.dataRequired}
                onChange={(e) => patch({ dataRequired: e.target.checked })}
              />
              <span>
                This hypothesis needs a market dataset before evaluation.
              </span>
            </label>
            <button
              className="v3-text"
              type="button"
              onClick={() => setPreview(!preview)}
            >
              <FileText size={16} />
              {preview ? "Hide" : "Preview"} immutable snapshot
            </button>
            {preview && (
              <pre className="v3-json">
                {JSON.stringify({ ...draft, commitment: "COMMITTED" }, null, 2)}
              </pre>
            )}
            <p className="v3-callout">
              <ShieldCheck size={17} />
              Saving records your reasoning. It does not verify sources, predict
              returns or assign your thesis a historical win rate.
            </p>
            {!servicesAvailable ? (
              <div className="v3-notice">
                New Soul saving is not connected yet. Your draft stays in this
                tab until you leave or reload.
                <Link className="v3-text" href="/legacy">
                  Open saved research <ArrowUpRight size={15} />
                </Link>
              </div>
            ) : !authorized && (
              <div className="v3-notice">
                Create your Body and sign in to save research.
                <button type="button" className="v3-text" onClick={openProfile}>
                  Open profile <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
        {validation && (
          <p className="v3-notice v3-error" role="alert">
            {validation}
          </p>
        )}
        <div className="v3-wizard-actions">
          {step > 1 ? (
            <button
              className="v3-secondary"
              type="button"
              onClick={() => {
                setStep(step - 1);
                setValidation("");
              }}
            >
              <ChevronLeft size={16} />
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="v3-text"
            disabled={busy || exampleMode || !servicesAvailable}
            onClick={() => submit("DRAFT")}
          >
            Save draft
          </button>
          <button
            className="v3-primary"
            disabled={busy || (step === 3 && (exampleMode || !servicesAvailable))}
            type="submit"
          >
            {busy ? "Saving…" : step < 3 ? "Continue" : "Save Soul"}
            {step < 3 ? <ChevronRight size={16} /> : <Check size={16} />}
          </button>
        </div>
        <p className="v3-footnote">
          Draft stays in this tab’s memory. Private research is never placed in
          browser local storage.
        </p>
      </form>
    </section>
  );
}
function localTime(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function SoulDetail({
  soul,
  version,
  versions,
  events,
  busy,
  run,
  back,
  revise,
  reload,
  notify,
}: {
  soul: Soul;
  version: SoulVersion;
  versions: SoulVersion[];
  events: SoulEvent[];
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  back: () => void;
  revise: () => void;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [compareId, setCompare] = useState(""),
    [review, setReview] = useState(false),
    [outcome, setOutcome] = useState("INCONCLUSIVE"),
    [note, setNote] = useState(""),
    [source, setSource] = useState(""),
    [observed, setObserved] = useState(localTime(new Date().toISOString())),
    [comments, setComments] = useState<Row[]>([]),
    [tasks, setTasks] = useState<Row[]>([]),
    [comment, setComment] = useState(""),
    [task, setTask] = useState(""),
    [assignee, setAssignee] = useState(""),
    [due, setDue] = useState(""),
    [connection, setConnection] = useState("Connecting…");
  const request = useRef<string | null>(null),
    last = useRef(""),
    compare = versions.find((v) => v.id === compareId);
  const refreshRoom = useCallback(async () => {
    const [c, t] = await Promise.all([
      all<Row>("comments?soulId=" + soul.id),
      all<Row>("tasks?soulId=" + soul.id),
    ]);
    setComments(c);
    setTasks(t);
    setConnection("Connected · refreshes every 15 seconds");
  }, [soul.id]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      refreshRoom().catch(() => {
        if (alive) {
          setComments([]);
          setTasks([]);
          setConnection(
            "Connection lost or access changed. Refresh the library.",
          );
        }
      });
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [soul.id, refreshRoom]);
  function event(type: string, payload: Record<string, unknown> = {}) {
    const key = JSON.stringify({ type, payload });
    if (last.current !== key) {
      request.current = crypto.randomUUID();
      last.current = key;
    }
    run(async () => {
      await api("event", {
        soulId: soul.id,
        type,
        payload,
        requestId: request.current,
      });
      await reload();
      notify("Research event appended. The original snapshot is unchanged.");
      setReview(false);
    });
  }
  return (
    <>
      <button className="v3-text" onClick={back}>
        <ChevronLeft size={16} />
        Back to library
      </button>
      <Panel
        title={version.payload.title}
        kicker={soul.team_id ? "TEAM RESEARCH" : "PRIVATE RESEARCH"}
        action={
          <Badge>{soulState(version, events).replaceAll("_", " ")}</Badge>
        }
      >
        <p className="v3-detail-thesis">
          {version.payload.hypothesis || "Incomplete draft"}
        </p>
        <div className="v3-detail-metadata">
          <span>{version.payload.topic}</span>
          <span>{version.payload.horizon}</span>
          <span>
            {version.payload.reviewAt
              ? "Review " + stamp(version.payload.reviewAt)
              : "No review date"}
          </span>
        </div>
        <div className="v3-detail-grid">
          {[
            ["Reasoning", version.payload.reasoning],
            ["Opposing case", version.payload.opposingCase],
            ["What would prove this wrong?", version.payload.invalidation],
          ].map(([label, value]) => (
            <section key={label}>
              <h3>{label}</h3>
              <p>{value || "Not recorded in this draft."}</p>
            </section>
          ))}
        </div>
        <h3>Source references</h3>
        {version.payload.evidence.length ? (
          version.payload.evidence.map((e) => (
            <article className="v3-evidence" key={e.url}>
              <div>
                <Badge>{e.stance}</Badge>
                <a href={e.url} target="_blank" rel="noreferrer">
                  {e.title}
                  <ArrowUpRight size={14} />
                </a>
                <p>{e.claim}</p>
                <small>
                  Published {stamp(e.publishedAt)} · Known {stamp(e.knownAt)}
                </small>
              </div>
            </article>
          ))
        ) : (
          <p className="v3-muted">No source references supplied.</p>
        )}
        <p className="v3-callout">
          Sources and conclusions are researcher supplied. Quantitative
          evaluation abstains without an entitled dataset. This thesis has no
          standalone historical win rate.
        </p>
        <div className="v3-actions">
          <button className="v3-primary" onClick={revise}>
            <GitBranch size={16} />
            Create revision
          </button>
          <button className="v3-secondary" onClick={() => setReview(!review)}>
            Append review
          </button>
          <button
            className="v3-secondary"
            disabled={busy}
            onClick={() =>
              event(
                soulState(version, events) === "ARCHIVED"
                  ? "RESTORE"
                  : "ARCHIVE",
              )
            }
          >
            {soulState(version, events) === "ARCHIVED" ? "Restore" : "Archive"}
          </button>
          <button
            className="v3-text"
            onClick={() =>
              download({ soul, versions, events }, "Soul-" + soul.id + ".json")
            }
          >
            <Download size={16} />
            Export history
          </button>
          <button className="v3-text" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <details className="v3-hash">
          <summary>Immutable provenance</summary>
          <p>Committed {stamp(version.created_at)}</p>
          <p>Author ID {version.author_id}</p>
          <code>SHA-256 {version.digest}</code>
          <p>Parent {version.parent_id ?? "Original version"}</p>
        </details>
      </Panel>
      {review && (
        <Panel title="A dated assessment" kicker="APPEND A REVIEW">
          <form
            className="v3-wizard-fields"
            onSubmit={(e) => {
              e.preventDefault();
              event("REVIEW", {
                versionId: version.id,
                outcome,
                note,
                observedAt: new Date(observed).toISOString(),
                sourceUrl: source,
              });
            }}
          >
            <Field label="Research outcome">
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="INCONCLUSIVE">Inconclusive</option>
                <option value="RESOLVED_SUPPORTED">
                  Supported · researcher assessment
                </option>
                <option value="RESOLVED_INVALIDATED">
                  Invalidated · criterion met
                </option>
              </select>
            </Field>
            <Field label="What did you observe?">
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                minLength={10}
                maxLength={2000}
                required
              />
            </Field>
            <Field label="Observation time (your local time)">
              <input
                type="datetime-local"
                value={observed}
                onChange={(e) => setObserved(e.target.value)}
                required
              />
            </Field>
            <Field label="HTTPS evidence URL">
              <input
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
              />
            </Field>
            <p className="v3-footnote">
              A negative research outcome is not automatically a financial loss.
              Regime tags and factor attribution remain unknown without
              point-in-time source data.
            </p>
            <button className="v3-primary" disabled={busy}>
              Append immutable review
              <Check size={16} />
            </button>
          </form>
        </Panel>
      )}
      <Panel title="Versions & research history" kicker="PRESERVE THE ORIGINAL">
        <Field label="Compare current version with">
          <select
            value={compareId}
            onChange={(e) => setCompare(e.target.value)}
          >
            <option value="">Choose an earlier snapshot</option>
            {versions
              .filter((v) => v.id !== version.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {stamp(v.created_at)} · {v.payload.title}
                </option>
              ))}
          </select>
        </Field>
        {compare && (
          <div className="v3-diffs">
            {diff(compare.payload, version.payload).map((d) => (
              <article key={d.path}>
                <b>{d.path}</b>
                <div>
                  <span>Earlier</span>
                  <p>
                    {typeof d.before === "string"
                      ? d.before
                      : JSON.stringify(d.before)}
                  </p>
                </div>
                <div>
                  <span>Current</span>
                  <p>
                    {typeof d.after === "string"
                      ? d.after
                      : JSON.stringify(d.after)}
                  </p>
                </div>
              </article>
            ))}
            <p className="v3-footnote">
              Performance delta: not comparable. No aligned out-of-sample runs
              exist.
            </p>
          </div>
        )}
        <ol className="v3-timeline">
          {[
            ...versions.map((v) => ({
              id: v.id,
              at: v.created_at,
              label: v.parent_id ? "Revision committed" : "Original saved",
              note: v.payload.title,
            })),
            ...events.map((e) => ({
              id: e.id,
              at: e.created_at,
              label: e.event_type,
              note: String(
                e.payload.note ??
                  e.payload.outcome ??
                  "Research history retained.",
              ),
            })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((e) => (
              <li key={e.id}>
                <span className="v3-dot" />
                <div>
                  <b>{e.label}</b>
                  <p>{e.note}</p>
                  <small>{stamp(e.at)}</small>
                </div>
              </li>
            ))}
        </ol>
      </Panel>
      <Panel
        title={soul.team_id ? "Team research room" : "Research notes & tasks"}
        kicker={connection.toUpperCase()}
      >
        <div className="v3-home-grid">
          <div>
            <h3>Discussion</h3>
            {comments.length ? (
              comments.map((c) => (
                <article className="v3-comment" key={c.id}>
                  <small>
                    {String(c.author_id).slice(0, 8)} · {stamp(c.created_at)}
                  </small>
                  <p>{String(c.content)}</p>
                </article>
              ))
            ) : (
              <p className="v3-muted">
                No discussion yet. Comments append to the research record.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const key = crypto.randomUUID();
                  await api("comment", {
                    soulId: soul.id,
                    content: comment,
                    requestId: key,
                  });
                  setComment("");
                  await refreshRoom();
                  notify("Comment saved.");
                });
              }}
            >
              <Field label="Add a research comment">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  required
                />
              </Field>
              <button className="v3-secondary" disabled={busy}>
                <Send size={15} />
                Add comment
              </button>
            </form>
          </div>
          <div>
            <h3>Research backlog</h3>
            {tasks.map((t) => (
              <div className="v3-task" key={t.id}>
                <span>
                  <b>{String(t.title)}</b>
                  <small>
                    {String(t.state)}
                    {t.due_at ? " · " + stamp(String(t.due_at)) : ""}
                  </small>
                </span>
                <button
                  className="v3-text"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("task", {
                        id: t.id,
                        soulId: soul.id,
                        title: t.title,
                        expectedRevision: t.revision,
                        state: t.state === "DONE" ? "OPEN" : "DONE",
                      });
                      await refreshRoom();
                    })
                  }
                >
                  {t.state === "DONE" ? "Reopen" : "Complete"}
                </button>
              </div>
            ))}
            <form
              className="v3-wizard-fields"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api("task", {
                    soulId: soul.id,
                    title: task,
                    assigneeId: assignee || null,
                    dueAt: due ? new Date(due).toISOString() : null,
                  });
                  setTask("");
                  await refreshRoom();
                  notify("Research task created.");
                });
              }}
            >
              <Field label="Research task">
                <input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  required
                  maxLength={160}
                />
              </Field>
              <Field label="Assignee Body ID">
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                />
              </Field>
              <Field label="Task deadline (local time)">
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
              <button className="v3-secondary" disabled={busy}>
                <Plus size={15} />
                Add task
              </button>
            </form>
          </div>
        </div>
      </Panel>
    </>
  );
}
function TeamView({
  teams,
  busy,
  authorized,
  run,
  reload,
  notify,
  openSoul,
  souls,
}: {
  teams: Team[];
  busy: boolean;
  authorized: boolean;
  run: (f: () => Promise<void>) => void;
  reload: () => Promise<void>;
  notify: (m: string) => void;
  openSoul: (id: string) => void;
  souls: Soul[];
}) {
  const [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [teamId, setTeam] = useState(""),
    [members, setMembers] = useState<Member[]>([]),
    [activity, setActivity] = useState<Row[]>([]),
    [role, setRole] = useState("EDITOR"),
    [handle, setHandle] = useState(""),
    [invite, setInvite] = useState<{ id: string; token: string } | null>(null),
    [token, setToken] = useState(""),
    [status, setStatus] = useState("Polling not connected");
  const loadRoom = useCallback(async (id: string) => {
    const [m, a] = await Promise.all([
      all<Member>("members?teamId=" + id),
      all<Row>("activity?teamId=" + id),
    ]);
    setMembers(m);
    setActivity(a);
    setStatus("Connected · reliable 15-second refresh");
  }, []);
  useEffect(() => {
    if (!teamId) return;
    void Promise.resolve()
      .then(() => loadRoom(teamId))
      .catch(() => {
        setMembers([]);
        setActivity([]);
        setStatus("Access changed or connection lost.");
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void loadRoom(teamId)
          .then(reload)
          .catch(() => {
            setMembers([]);
            setActivity([]);
            setStatus("Access changed or connection lost.");
          });
    }, 15000);
    return () => clearInterval(timer);
  }, [teamId, loadRoom, reload]);
  return (
    <>
      <div className="v3-home-grid">
        <Panel title="Your Teams" kicker="EXPLICIT ROLES · PRIVATE ROOMS">
          {teams.length ? (
            teams.map((t) => (
              <button
                key={t.id}
                className={
                  "v3-team-row " + (teamId === t.id ? "is-active" : "")
                }
                onClick={() => {
                  setTeam(t.id);
                  setInvite(null);
                }}
              >
                <span className="v3-avatar">
                  <Users size={19} />
                </span>
                <span>
                  <b>{t.name}</b>
                  <small>/{t.slug}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty icon={Users} title="Bring a different perspective.">
              Create a private Team or accept a one-use invitation. Each member
              has an explicit role.
            </Empty>
          )}
          <form
            className="v3-wizard-fields"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const t = await api<Team>("team", { name, slug });
                await reload();
                setTeam(t.id);
                notify("Team created. You are its owner.");
                setName("");
                setSlug("");
              });
            }}
          >
            <Field label="Team name">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug)
                    setSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    );
                }}
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field label="Team slug">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                minLength={3}
                maxLength={40}
              />
            </Field>
            <button className="v3-primary" disabled={busy || !authorized}>
              <Plus size={16} />
              Create private Team
            </button>
            {!authorized && (
              <p className="v3-footnote">Sign in and create your Body first.</p>
            )}
          </form>
        </Panel>
        <Panel title="Accept an invitation" kicker="ONE USE · 48 HOURS">
          <form
            className="v3-wizard-fields"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("accept-invite", { token });
                setToken("");
                await reload();
                notify("Invitation accepted. Team access is active.");
              });
            }}
          >
            <Field label="Secure invitation token">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                minLength={64}
                maxLength={64}
                required
              />
            </Field>
            <button className="v3-secondary" disabled={busy || !authorized}>
              Join Team
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="v3-footnote">
            Tokens expire, can be revoked, and may be restricted to an exact
            @handle. Joining never changes private Soul ownership.
          </p>
        </Panel>
      </div>
      {teamId && (
        <>
          <Panel
            title={teams.find((t) => t.id === teamId)?.name ?? "Team room"}
            kicker={status.toUpperCase()}
          >
            <div className="v3-home-grid">
              <div>
                <h3>Roster & permissions</h3>
                {members.map((m) => (
                  <div className="v3-member" key={m.body_id}>
                    <span>
                      <b>Researcher {m.body_id.slice(0, 8)}</b>
                      <small>Body ID: {m.body_id}</small>
                    </span>
                    {m.role === "OWNER" ? (
                      <Badge>OWNER</Badge>
                    ) : (
                      <>
                        <select
                          aria-label={"Role for " + m.body_id}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            run(async () => {
                              await api("member", {
                                teamId,
                                bodyId: m.body_id,
                                role: e.target.value,
                                action: "role",
                              });
                              await loadRoom(teamId);
                              notify("Role updated.");
                            })
                          }
                        >
                          {["ADMIN", "EDITOR", "REVIEWER", "VIEWER"].map(
                            (r) => (
                              <option key={r}>{r}</option>
                            ),
                          )}
                        </select>
                        <button
                          className="v3-text"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api("member", {
                                teamId,
                                bodyId: m.body_id,
                                action: "remove",
                              });
                              await loadRoom(teamId);
                              notify("Membership revoked.");
                            })
                          }
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                ))}
                <p className="v3-footnote">
                  Owner/Admin manage membership; Editor authors research;
                  Reviewer comments and reviews; Viewer reads. The database
                  enforces all roles.
                </p>
              </div>
              <div>
                <h3>Invite a perspective</h3>
                <form
                  className="v3-wizard-fields"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      setInvite(
                        await api("invite", {
                          teamId,
                          role,
                          handle: handle || null,
                        }),
                      );
                      notify(
                        "One-use invite created. Share it only with your intended collaborator.",
                      );
                    });
                  }}
                >
                  <Field label="Invite role">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      {["ADMIN", "EDITOR", "REVIEWER", "VIEWER"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Restrict to @handle">
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      maxLength={24}
                    />
                  </Field>
                  <button className="v3-secondary" disabled={busy}>
                    Create invitation
                  </button>
                </form>
                {invite && (
                  <div className="v3-invite">
                    <p>This token is displayed once. It expires in 48 hours.</p>
                    <code>{invite.token}</code>
                    <button
                      className="v3-text"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api("revoke-invite", { id: invite.id });
                          setInvite(null);
                          notify("Invitation revoked.");
                        })
                      }
                    >
                      Revoke invitation
                    </button>
                  </div>
                )}
              </div>
            </div>
            <h3>Shared research</h3>
            {souls
              .filter((s) => s.team_id === teamId)
              .map((s) => (
                <button
                  className="v3-soul-row"
                  key={s.id}
                  onClick={() => openSoul(s.id)}
                >
                  <Orbit size={18} />
                  <b>{s.title}</b>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            <button
              className="v3-text"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  download(
                    await api("export-team", { teamId }),
                    "Team-" + teamId + "-private-research.json",
                  ),
                )
              }
            >
              <Download size={16} />
              Export authorized Team research
            </button>
          </Panel>
          <Panel title="Activity trail" kicker="ATTRIBUTION & ACCOUNTABILITY">
            <ol className="v3-timeline">
              {activity.slice(0, 30).map((a) => (
                <li key={a.id}>
                  <span className="v3-dot" />
                  <div>
                    <b>{String(a.action).replaceAll("_", " ")}</b>
                    <p>Researcher {String(a.actor_id).slice(0, 8)}</p>
                    <small>{stamp(a.created_at)}</small>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </>
      )}
    </>
  );
}
function ScanBuilder({
  mode,
  scans,
  teams,
  busy,
  run,
  reload,
  notify,
  authorized,
}: {
  mode: Mode;
  scans: ScanVersion[];
  teams: Team[];
  busy: boolean;
  run: (f: () => Promise<void>) => void;
  reload: () => Promise<void>;
  notify: (m: string) => void;
  authorized: boolean;
}) {
  const [guidance, setGuidance] = useState<Mode>(mode),
    [command, setCommand] = useState(""),
    [scan, setScan] = useState<Scan>(structuredClone(EMPTY_SCAN)),
    [notes, setNotes] = useState<string[]>([]),
    [unknown, setUnknown] = useState<string[]>([]),
    [name, setName] = useState("My research scan"),
    [summary, setSummary] = useState("Initial explicit filter definition"),
    [teamId, setTeam] = useState(""),
    [branch, setBranch] = useState("main"),
    [parent, setParent] = useState<ScanVersion | null>(null),
    [compareA, setA] = useState(""),
    [compareB, setB] = useState(""),
    [approved, setApproved] = useState(false);
  const key = useRef<string | null>(null),
    prior = useRef("");
  const a = scans.find((s) => s.id === compareA),
    b = scans.find((s) => s.id === compareB);
  type DatasetChoice = {
    id: string;
    provider: string;
    datasetHash: string;
    researchCutoff: string;
    rows: number;
    teamAllowed: boolean;
  };
  const [datasets, setDatasets] = useState<DatasetChoice[]>([]),
    [datasetId, setDatasetId] = useState(""),
    [runVersionId, setRunVersionId] = useState(""),
    [catalogScope, setCatalogScope] = useState<string | null>(null),
    [jobs, setJobs] = useState<Row[]>([]);
  const runKey = useRef<string | null>(null),
    runFingerprint = useRef("");
  const selectedVersion = scans.find((v) => v.id === runVersionId),
    selectedDataset = datasets.find((d) => d.id === datasetId);
  const liquidityResolved =
    !/\bliquid\b/i.test(command) ||
    scan.conditions.some((c) => c.field === "avg_traded_value" && c.value > 0);
  const planReady =
    authorized &&
    catalogScope === teamId &&
    !!selectedVersion &&
    !!selectedDataset &&
    selectedDataset.rows > 0 &&
    selectedDataset.rows <= 1000000 &&
    stable(scan) === stable(selectedVersion.ast) &&
    unknown.length === 0 &&
    liquidityResolved;
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!authorized) {
        if (alive) {
          setDatasets([]);
          setCatalogScope(null);
          setJobs([]);
        }
        return;
      }
      const [d, j] = await Promise.all([
        api<DatasetChoice[]>(
          "datasets" + (teamId ? "?teamId=" + encodeURIComponent(teamId) : ""),
        ),
        all<Row>("runs"),
      ]);
      if (alive) {
        setDatasets(d);
        setCatalogScope(teamId);
        setJobs(j);
      }
    }
    void Promise.resolve()
      .then(load)
      .catch(() => {
        if (alive) {
          setDatasets([]);
          setCatalogScope(null);
        }
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authorized, teamId]);
  function parse() {
    try {
      const result = parseCommand(command);
      setScan(result.scan);
      setNotes(result.ambiguities);
      setUnknown(result.unrecognized);
    } catch (e) {
      setNotes([(e as Error).message]);
    }
  }
  function update(i: number, p: Partial<Scan["conditions"][number]>) {
    setScan((s) => ({
      ...s,
      conditions: s.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)),
    }));
    setApproved(false);
  }
  return (
    <>
      <Panel title="Choose a research starting point" kicker="THREE LEVELS, EXPLICIT LIMITS">
        <Field label="Scan guidance level">
          <select aria-label="Scan guidance level" value={guidance} onChange={e => setGuidance(e.target.value as Mode)}>
            {MODES.map(m => <option key={m} value={m}>{m === "Standard" ? "Intermediate" : m}</option>)}
          </select>
        </Field>
        <p>{SCAN_LEVEL_HELP[guidance]}</p>
        <div className="v3-readiness-grid">
          {SCAN_PRESETS.map(p => <div className="v3-callout" key={p.id}>
            <b>{p.title}</b><p>{p.explanation}</p>
            <button type="button" className="v3-secondary" onClick={() => {
              setScan(scanFromPreset(p.id)); setName(p.title); setCommand(""); setNotes(["Example costs: 10 bps fees and 10 bps slippage per side; tax is zero. Replace with the actual costs for your market."]); setUnknown([]); setApproved(false); setRunVersionId(""); setParent(null); setSummary("Explicit template: " + p.title);
            }}>Use {p.title.toLowerCase()}</button>
          </div>)}
        </div>
        <p className="v3-muted">Templates are editable definitions. They do not fetch market data, run a scan or save to an unavailable backend. All existing data and version history remain separate.</p>
      </Panel>
      <Panel
        title="From a question to explicit rules"
        kicker="BOUNDED NATURAL-LANGUAGE BUILDER"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            parse();
          }}
        >
          <Field
            label="What would you like to explore?"
            hint="Example command only: “Find liquid NSE stocks above 50-day SMA and RSI < 35”."
          >
            <textarea
              value={command}
              rows={3}
              maxLength={500}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Find liquid NSE stocks above 50-day SMA and RSI < 35"
            />
          </Field>
          <button className="v3-primary">
            Build editable conditions <ArrowRight size={16} />
          </button>
        </form>
        {notes.length > 0 && (
          <div className="v3-callout">
            <b>Review the assumptions</b>
            <ul>
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {unknown.length > 0 && (
          <div className="v3-notice v3-error">
            <b>Unrecognized text:</b> {unknown.join(", ")}. Edit the command
            before saving; no hidden interpretation will execute.
          </div>
        )}
        <div className="v3-condition-list">
          {scan.conditions.map((c, i) => (
            <div className="v3-condition" key={i}>
              <Field label="Measure">
                <select
                  value={c.field}
                  onChange={(e) => {
                    const field = e.target.value as typeof c.field;
                    const unit =
                      field === "rsi" || field === "delivery_pct"
                        ? "percent"
                        : field === "spread_bps" || field === "impact_bps"
                          ? "bps"
                          : field === "close_vs_sma"
                            ? "ratio"
                            : "INR";
                    update(i, {
                      field,
                      unit,
                      period: [
                        "close_vs_sma",
                        "rsi",
                        "avg_traded_value",
                        "median_turnover",
                      ].includes(field)
                        ? 14
                        : null,
                    });
                  }}
                >
                  {[
                    "close_vs_sma",
                    "rsi",
                    "avg_traded_value",
                    "delivery_pct",
                    "median_turnover",
                    "spread_bps",
                    "impact_bps",
                  ].map((f) => (
                    <option key={f} value={f}>
                      {
                        {
                          close_vs_sma: "Price / moving average",
                          rsi: "Relative strength index (RSI)",
                          avg_traded_value: "Average traded value",
                          delivery_pct: "Deliverable volume (%)",
                          median_turnover: "Median traded value",
                          spread_bps: "Bid–ask spread",
                          impact_bps: "Impact cost",
                        }[f]
                      }
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Comparison">
                <select
                  value={c.op}
                  onChange={(e) =>
                    update(i, { op: e.target.value as typeof c.op })
                  }
                >
                  {["gt", "gte", "lt", "lte"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label={"Threshold (" + c.unit + ")"}>
                <input
                  type="number"
                  step="any"
                  value={c.value}
                  onChange={(e) => update(i, { value: Number(e.target.value) })}
                />
              </Field>
              {c.period !== null && (
                <Field label="Completed bars">
                  <input
                    type="number"
                    min={2}
                    max={252}
                    value={c.period}
                    onChange={(e) =>
                      update(i, { period: Number(e.target.value) })
                    }
                  />
                </Field>
              )}
              <button
                className="v3-icon"
                aria-label={"Remove condition " + (i + 1)}
                onClick={() =>
                  setScan((s) => ({
                    ...s,
                    conditions: s.conditions.filter((_, j) => i !== j),
                  }))
                }
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="v3-text"
          onClick={() =>
            setScan((s) => ({
              ...s,
              conditions: [
                ...s.conditions,
                {
                  field: "avg_traded_value",
                  op: "gt",
                  value: 0,
                  period: 20,
                  unit: "INR",
                },
              ],
            }))
          }
        >
          <Plus size={16} />
          Add explicit condition
        </button>
        <p className="v3-footnote">
          Delivery percentage measures the delivered share of exchange volume.
          It does not measure immediate execution liquidity. Spread and impact
          need separately entitled observations.
        </p>
      </Panel>
      <Panel
        title="Commit a reproducible definition"
        kicker={
          parent
            ? "FORK FROM " + parent.id.slice(0, 8)
            : "IMMUTABLE SCAN VERSION"
        }
      >
        <div className="v3-form-grid">
          <Field label="Scan name">
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Branch">
            <input
              value={branch}
              maxLength={60}
              onChange={(e) => setBranch(e.target.value)}
            />
          </Field>
          <Field label="Audience">
            <select value={teamId} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Private</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Holding period (bars)">
            <input
              type="number"
              min={1}
              max={252}
              value={scan.exit.holdingBars}
              onChange={(e) =>
                setScan({
                  ...scan,
                  exit: { holdingBars: Number(e.target.value) },
                })
              }
            />
          </Field>
          {(["feeBps", "slippageBps", "taxBps"] as const).map((k) => (
            <Field
              key={k}
              label={
                k === "feeBps"
                  ? "Fee bps per side"
                  : k === "slippageBps"
                    ? "Slippage bps per side"
                    : "Total round-trip tax bps"
              }
            >
              <input
                type="number"
                min={0}
                max={1000}
                value={scan.costs[k]}
                onChange={(e) =>
                  setScan({
                    ...scan,
                    costs: { ...scan.costs, [k]: Number(e.target.value) },
                  })
                }
              />
            </Field>
          ))}
        </div>
        <Field label="Change summary">
          <textarea
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={500}
          />
        </Field>
        <details>
          <summary>Typed scan AST</summary>
          <pre className="v3-json">{JSON.stringify(scan, null, 2)}</pre>
        </details>
        <div className="v3-actions">
          <button
            className="v3-primary"
            disabled={busy || !authorized || unknown.length > 0}
            onClick={() =>
              run(async () => {
                const ast = validateScan(scan),
                  payload = {
                    ast,
                    name,
                    branch,
                    summary,
                    teamId: teamId || null,
                    parentId: parent?.id ?? null,
                  };
                const fp = JSON.stringify(payload);
                if (fp !== prior.current) {
                  key.current = crypto.randomUUID();
                  prior.current = fp;
                }
                const committed = await api<ScanVersion>("scan-version", {
                  ...payload,
                  requestId: key.current,
                });
                setRunVersionId(committed.id);
                setScan(structuredClone(committed.ast));
                setApproved(false);
                await reload();
                notify(
                  "Scan definition committed. No data evaluation has been run.",
                );
              })
            }
          >
            <GitBranch size={16} />
            Commit scan version
          </button>
        </div>
        <div className="v3-form-grid" style={{ marginTop: 24 }}>
          <Field label="Committed version to screen">
            <select
              value={runVersionId}
              onChange={(e) => {
                setRunVersionId(e.target.value);
                const v = scans.find((s) => s.id === e.target.value);
                if (v) setScan(structuredClone(v.ast));
                setApproved(false);
              }}
            >
              <option value="">Commit or choose an immutable version</option>
              {scans.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.branch} · {v.summary}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entitled historical dataset">
            <select
              value={datasetId}
              onChange={(e) => {
                setDatasetId(e.target.value);
                setApproved(false);
              }}
            >
              <option value="">No dataset selected</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.provider} · {d.researchCutoff} · {d.rows} rows
                </option>
              ))}
            </select>
          </Field>
        </div>
        {selectedDataset && (
          <p className="v3-callout">
            Read-only cached screen over at most{" "}
            {selectedDataset.rows.toLocaleString("en-IN")} rows, as of{" "}
            {stamp(selectedDataset.researchCutoff)}. The selected committed
            version supplies the exact conditions and costs. No order or
            backtest is implied.
          </p>
        )}
        {!liquidityResolved && (
          <p className="v3-callout">
            “Liquid” still needs an explicit positive average-traded-value
            threshold before execution.
          </p>
        )}
        <label className="v3-checkbox">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          <span>
            I reviewed this committed scan, its cost assumptions and finite row
            estimate before requesting a cached screen.
          </span>
        </label>
        <button
          className="v3-secondary"
          disabled={busy || !approved || !planReady}
          onClick={() =>
            run(async () => {
              if (!selectedVersion || !selectedDataset)
                throw new Error(
                  "Choose a committed version and entitled dataset.",
                );
              const p = {
                scanVersionId: selectedVersion.id,
                datasetVersionId: selectedDataset.id,
                asOf: selectedDataset.researchCutoff,
                approved: true,
              };
              const fp = stable(p);
              if (runFingerprint.current !== fp) {
                runKey.current = crypto.randomUUID();
                runFingerprint.current = fp;
              }
              const queued = await api<{ id: string; state: string }>("run", {
                ...p,
                requestId: runKey.current,
              });
              notify(
                "Screen request " +
                  queued.id +
                  " is " +
                  queued.state +
                  ". No completed result is implied.",
              );
              setJobs(await all<Row>("runs"));
            })
          }
        >
          Request cached screen <FlaskConical size={16} />
        </button>
        {!datasets.length && (
          <p className="v3-callout">
            Execution estimate unavailable: no entitled dataset or connected
            worker. Requests fail closed, create no result and charge no quota.
          </p>
        )}
        {jobs.length > 0 && (
          <div>
            <h3>Evaluation jobs · refresh every 15 seconds</h3>
            {jobs.map((j) => (
              <article className="v3-evidence" key={j.id}>
                <div>
                  <Badge>{String(j.state)}</Badge>
                  <p>
                    Job {j.id} · {stamp(j.created_at)}
                  </p>
                  {j.result && typeof j.result === "object" ? (
                    <pre className="v3-json">
                      {JSON.stringify(
                        {
                          ...(j.result as Record<string, unknown>),
                          matches: Array.isArray(
                            (j.result as Record<string, unknown>).matches,
                          )
                            ? (
                                (j.result as Record<string, unknown>)
                                  .matches as unknown[]
                              ).slice(0, 20)
                            : undefined,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  ) : (
                    <p>Waiting for a confirmed worker result.</p>
                  )}
                  <small>
                    Match previews show at most twenty rows. A cached screen is
                    not a backtest or recommendation.
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel
        title="Compare versions"
        kicker="PARAMETERS, ATTRIBUTION & METHODOLOGY"
      >
        <div className="v3-form-grid">
          <Field label="Earlier version">
            <select value={compareA} onChange={(e) => setA(e.target.value)}>
              <option value="">Choose a version</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.branch} · {stamp(s.created_at)} · {s.summary}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Later version">
            <select value={compareB} onChange={(e) => setB(e.target.value)}>
              <option value="">Choose a version</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.branch} · {stamp(s.created_at)} · {s.summary}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {a && b && (
          <>
            <div className="v3-diffs">
              {diff(a.ast, b.ast).map((d) => (
                <article key={d.path}>
                  <b>{d.path}</b>
                  <div>
                    <span>Earlier</span>
                    <p>{JSON.stringify(d.before)}</p>
                  </div>
                  <div>
                    <span>Later</span>
                    <p>{JSON.stringify(d.after)}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="v3-callout">
              Historical performance: not comparable. Aligned out-of-sample
              windows, universe, dataset hash, corporate actions and cost
              assumptions are required.
            </p>
            <button
              className="v3-secondary"
              onClick={() => {
                setParent(b);
                setScan(structuredClone(b.ast));
                setBranch("research-fork");
                setSummary("Fork with explicit parameter review");
                window.scrollTo(0, 0);
              }}
            >
              Fork later version <GitBranch size={16} />
            </button>
          </>
        )}
        {!scans.length && (
          <p className="v3-muted">No committed scan versions yet.</p>
        )}
      </Panel>
    </>
  );
}
function ProfileView({
  session,
  busy,
  mode,
  run,
  reload,
  notify,
}: {
  session: Session | null;
  busy: boolean;
  mode: Mode;
  run: (fn: () => Promise<void>) => void;
  reload: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [handle, setHandle] = useState(session?.profile?.handle ?? ""),
    [name, setName] = useState(session?.profile?.display_name ?? ""),
    [bio, setBio] = useState(session?.profile?.bio ?? ""),
    [isPublic, setPublic] = useState(session?.profile?.is_public ?? false),
    [adult, setAdult] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [terms, setTerms] = useState(false),
    [erase, setErase] = useState(""),
    [reminders, setReminders] = useState(false);
  return (
    <div className="v3-profile-grid">
      <Panel
        title={
          session?.authenticated
            ? "Your researcher identity"
            : "A private place for your thinking"
        }
        kicker={PROFILE_LABEL.toUpperCase() + " / INDEPENDENT IDENTITY"}
      >
        {!session?.authenticated ? (
          <>
            <p>
              Use Google or a passwordless email code. Create a unique @handle
              after you sign in.
            </p>
            {!session?.configured && (
              <p className="v3-callout">
                Independent sign-in is not connected yet. Your existing owner
                sign-in and saved research remain available.
                <Link className="v3-text" href="/legacy">
                  Open saved research <ArrowUpRight size={15} />
                </Link>
              </p>
            )}
            <a
              className={
                "v3-secondary v3-google " +
                (!session?.google ? "is-disabled" : "")
              }
              aria-disabled={!session?.google}
              href={session?.google ? "/api/v3/auth/google" : undefined}
            >
              Continue with Google
              <ArrowUpRight size={16} />
            </a>
            {!session?.google && (
              <p className="v3-footnote">
                Google OAuth credentials are not configured.
              </p>
            )}
            <div className="v3-divider">
              <span>or use an email code</span>
            </div>
            <form
              className="v3-wizard-fields"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (!sent) {
                    const r = await api<{ notice: string }>("auth/email-code", {
                      email,
                    });
                    setSent(true);
                    notify(r.notice);
                  } else {
                    await api("auth/verify", { email, code });
                    await reload();
                    notify("Signed in. Choose your Body handle to continue.");
                  }
                });
              }}
            >
              <Field label="Email address">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sent}
                />
              </Field>
              {sent && (
                <Field label="Sign-in code">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    minLength={6}
                    maxLength={10}
                  />
                </Field>
              )}
              <button
                className="v3-primary"
                disabled={busy || !session?.configured}
              >
                {busy
                  ? "Please wait…"
                  : sent
                    ? "Verify & sign in"
                    : "Send email code"}
                <ArrowRight size={16} />
              </button>
              {sent && (
                <button
                  type="button"
                  className="v3-text"
                  onClick={() => setSent(false)}
                >
                  Use another email
                </button>
              )}
            </form>
          </>
        ) : (
          <form
            className="v3-wizard-fields"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("profile", {
                  handle,
                  displayName: name,
                  bio,
                  isPublic,
                  mode,
                  adult,
                  privacy,
                  terms,
                  reviewReminders: reminders,
                });
                await reload();
                notify(
                  "Body profile saved. Your handle is reserved atomically by PostgreSQL.",
                );
              });
            }}
          >
            <Field
              label="Your unique @handle"
              hint="3–24 letters, numbers and underscores. Case insensitive."
            >
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                maxLength={24}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
              />
            </Field>
            <Field label="Bio">
              <textarea
                value={bio}
                maxLength={300}
                rows={3}
                onChange={(e) => setBio(e.target.value)}
              />
            </Field>
            <label className="v3-checkbox">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setPublic(e.target.checked)}
              />
              <span>
                Let signed-in researchers see my profile. Private research and
                holdings are never included.
              </span>
            </label>
            <label className="v3-checkbox">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
              />
              <span>
                Allow review reminders in the app. External email/push delivery
                is not configured.
              </span>
            </label>
            <fieldset className="v3-consent">
              <legend>Research workspace consent</legend>
              {[
                [adult, setAdult, "I am 18 or older."],
                [privacy, setPrivacy, "I have read the privacy notice."],
                [terms, setTerms, "I accept the research workspace terms."],
              ].map(([checked, setter, label]) => (
                <label className="v3-checkbox" key={label as string}>
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={(e) =>
                      (setter as (v: boolean) => void)(e.target.checked)
                    }
                  />
                  <span>{label as string}</span>
                </label>
              ))}
              <p>
                <a href="/legal/privacy" target="_blank" rel="noreferrer">
                  Privacy notice
                </a>{" "}
                ·{" "}
                <a href="/legal/terms" target="_blank" rel="noreferrer">
                  Terms
                </a>
              </p>
            </fieldset>
            <button
              className="v3-primary"
              disabled={busy || !adult || !privacy || !terms}
            >
              Save Body <Check size={16} />
            </button>
          </form>
        )}
      </Panel>
      <div>
        <Panel title="Your data, under your control" kicker="PRIVACY & HISTORY">
          <p>
            Private is the default. Team sharing requires a separate choice.
            Public publishing is disabled.
          </p>
          {session?.profile && (
            <>
              <p className="v3-footnote">
                Joined {stamp(session.profile.created_at)}
              </p>
              {session.profile.avatar_path && (
                <Image
                  src="/api/v3/avatar"
                  alt="Your private profile avatar"
                  width={64}
                  height={64}
                  unoptimized
                />
              )}
              <Field label="Private avatar (PNG, JPEG or WebP, up to 128 KiB)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    run(async () => {
                      if (file.size > 131072)
                        throw new Error("Avatar must be at most 128 KiB.");
                      const bytes = new Uint8Array(await file.arrayBuffer());
                      let binary = "";
                      for (const byte of bytes)
                        binary += String.fromCharCode(byte);
                      await api("avatar", {
                        mime: file.type,
                        base64: btoa(binary),
                      });
                      await reload();
                      notify("Private avatar saved.");
                    });
                  }}
                />
              </Field>
              <button
                className="v3-secondary"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    download(
                      await api("export"),
                      "Strategic-Souls-V3-private-export.json",
                    ),
                  )
                }
              >
                <Download size={16} />
                Export my V3 data
              </button>
              <button
                className="v3-text"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("auth/logout", {});
                    await reload();
                    notify("Signed out.");
                  })
                }
              >
                Sign out
              </button>
              <details className="v3-danger-zone">
                <summary>Withdraw private research data</summary>
                <p>
                  This removes personal V3 research and anonymizes your
                  researcher profile. Shared research retains pseudonymous
                  attribution. The external identity deletion remains an
                  operator task. Existing D1 data is unaffected.
                </p>
                <Field label="Type DELETE MY V3 DATA">
                  <input
                    value={erase}
                    onChange={(e) => setErase(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <button
                  className="v3-danger"
                  disabled={busy || erase !== "DELETE MY V3 DATA"}
                  onClick={() =>
                    run(async () => {
                      const r = await api<{ notice: string }>("erase", {
                        confirmation: erase,
                      });
                      await reload();
                      notify(r.notice);
                      setErase("");
                    })
                  }
                >
                  Withdraw private V3 data
                </button>
              </details>
            </>
          )}
          <Link className="v3-text" href="/legacy">
            Open existing owner records <ArrowUpRight size={15} />
          </Link>
        </Panel>
      </div>
    </div>
  );
}
function Markets({ seedIdea }: { seedIdea: (s: string) => void }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [showAll, setShowAll] = useState(false),
    [widget, setWidget] = useState(""),
    [favorites, setFavorites] = useState<string[]>([]),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  const [marketView, setMarketView] = useState("Watchlist");
  const rows = WATCHLIST.filter(
    ([s, n, c]) =>
      (category === "All" || category === c) &&
      (!favoritesOnly || favorites.includes(s)) &&
      (s + " " + n).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <nav
        className="v3-actions"
        aria-label="Markets sections"
        style={{ marginBottom: 24 }}
      >
        {["Watchlist", "Portfolio"].map((t) => (
          <button
            className={marketView === t ? "v3-primary" : "v3-secondary"}
            key={t}
            onClick={() => setMarketView(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {marketView === "Portfolio" ? (
        <ManualPortfolio />
      ) : (
        <>
          <div className="v3-context">
            <div>
              <p className="v3-eyebrow">GLOBAL CONTEXT → INDIA IMPACT</p>
              <h2>
                Find the mechanism.
                <br />
                <span>Question the conclusion.</span>
              </h2>
              <p>
                Explore rates, energy and currencies. Numerical feeds remain
                unavailable until rights and freshness can be verified.
              </p>
              <button
                className="v3-text"
                onClick={() =>
                  seedIdea("How could global energy prices affect India?")
                }
              >
                Turn a question into a Soul <ArrowRight size={16} />
              </button>
            </div>
            <Globe2 size={120} strokeWidth={0.5} />
          </div>
          <Panel
            title="Your market universe"
            kicker="ORIGINAL REGISTRY · NO NUMERICAL FEED"
            action={<Badge>28 instruments</Badge>}
          >
            <div className="v3-library-toolbar">
              <label className="v3-search">
                <Search size={17} />
                <input
                  aria-label="Search instruments"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find an instrument…"
                />
              </label>
              <select
                aria-label="Asset class"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "All",
                  "Volatility",
                  "Rates",
                  "FX",
                  "Commodities",
                  "Indices",
                  "Crypto",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button
                className="v3-secondary"
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
              >
                Favorites {favoritesOnly ? "on" : "off"}
              </button>
            </div>
            <div className="v3-quote-grid">
              {(showAll || query ? rows : rows.slice(0, 6)).map(
                ([symbol, name, c]) => (
                  <article className="v3-quote-card" key={symbol}>
                    <div>
                      <span className="v3-eyebrow">{c}</span>
                      <button
                        className="v3-icon"
                        aria-label={
                          (favorites.includes(symbol)
                            ? "Unfavorite "
                            : "Favorite ") + symbol
                        }
                        aria-pressed={favorites.includes(symbol)}
                        onClick={() =>
                          setFavorites((f) =>
                            f.includes(symbol)
                              ? f.filter((v) => v !== symbol)
                              : [...f, symbol],
                          )
                        }
                      >
                        {favorites.includes(symbol) ? (
                          <Check size={16} />
                        ) : (
                          <Plus size={16} />
                        )}
                      </button>
                    </div>
                    <h3>{symbol}</h3>
                    <p>{name}</p>
                    <strong className="v3-mono">—</strong>
                    <span className="v3-muted">NOT CONFIGURED</span>
                    <small>
                      No value, venue, acquisition time or entitlement verified.
                    </small>
                    <button
                      className="v3-text"
                      onClick={() => seedIdea(symbol)}
                    >
                      Research this topic <ArrowUpRight size={14} />
                    </button>
                  </article>
                ),
              )}
            </div>
            {rows.length > 6 && !query && (
              <button
                className="v3-secondary v3-show-universe"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? "Show fewer"
                  : "Explore all " + rows.length + " instruments"}
                <ChevronRight size={16} />
              </button>
            )}
            <p className="v3-footnote">
              Favorites last for this tab session. Registry labels are not
              verified provider tickers. Two natural-gas labels and continuous
              contracts need identity resolution.
            </p>
          </Panel>
          <div className="v3-home-grid v3-secondary-grid">
            <Panel
              title="Official chart views"
              kicker="INDEPENDENT VENDOR DISPLAY"
            >
              <p>
                TradingView widgets are viewing only. They do not supply scan,
                quote or backtest data to this app. Loading connects your
                browser to TradingView.
              </p>
              <div className="v3-actions">
                <button
                  className="v3-secondary"
                  onClick={() => setWidget(widget === "chart" ? "" : "chart")}
                >
                  Load Nifty chart
                </button>
                <button
                  className="v3-secondary"
                  onClick={() =>
                    setWidget(widget === "calendar" ? "" : "calendar")
                  }
                >
                  Load economic calendar
                </button>
              </div>
              {widget && (
                <TradingViewWidget
                  kind={widget === "chart" ? "chart" : "calendar"}
                  symbol={widget === "chart" ? "NSE:NIFTY" : undefined}
                  title={
                    widget === "chart"
                      ? "TradingView Nifty chart"
                      : "TradingView economic calendar"
                  }
                />
              )}
            </Panel>
            <Panel
              title="Three questions for India"
              kicker="EDUCATION · NO CURRENT SIGNAL"
            >
              {[
                [
                  "Energy",
                  "Could lower import costs improve margins? What if demand weakens?",
                ],
                [
                  "Rates",
                  "Could financing costs affect investment? What if earnings offset the effect?",
                ],
                [
                  "Currency",
                  "Who imports, who exports, and where are their costs denominated?",
                ],
              ].map(([topic, question]) => (
                <button
                  className="v3-question-row"
                  key={topic}
                  onClick={() => seedIdea(topic + " → India")}
                >
                  <b>{topic}</b>
                  <p>{question}</p>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </Panel>
          </div>
          <Panel
            title="Sector relative strength"
            kicker="POINT-IN-TIME EVIDENCE REQUIRED"
          >
            <Empty
              icon={ChartNoAxesCombined}
              title="No licensed sector history connected."
            >
              Benchmark-relative scores require aligned official histories and
              historical constituents. The worker can compute these after an
              entitled dataset is loaded.
            </Empty>
          </Panel>
        </>
      )}
    </>
  );
}
function SourceHealth() {
  return (
    <>
      <Panel title="Transparent availability" kicker="DATA & SYSTEM HEALTH">
        <div className="v3-readiness-grid">
          {[
            [
              "Numerical quotes",
              "NOT CONFIGURED",
              "Missing observations remain null.",
            ],
            [
              "Historical EOD",
              "NOT CONFIGURED",
              "No authorized dataset ingested.",
            ],
            [
              "Supabase consumer identity",
              "LOCAL CONFIGURATION REQUIRED",
              "Independent local journeys require the real running stack.",
            ],
            [
              "Public publishing",
              "DISABLED",
              "Qualified review, provider rights and owner approval required.",
            ],
          ].map(([a, b, c]) => (
            <article key={a}>
              <Activity size={20} />
              <h3>{a}</h3>
              <Badge>{b}</Badge>
              <p>{c}</p>
            </article>
          ))}
        </div>
        <p className="v3-callout">
          A build, a fixture test or a vendor widget does not establish live
          market-data coverage.
        </p>
      </Panel>
      <Panel
        title="How data earns a label"
        kicker="PROVENANCE → RIGHTS → FRESHNESS"
      >
        <ol className="v3-guide-list">
          <li>
            Resolve provider symbol, venue, units, currency and contract
            identity.
          </li>
          <li>
            Verify documented rights for display, caching, derived analysis and
            sharing.
          </li>
          <li>
            Record exchange event time, acquisition time, session and declared
            delay.
          </li>
          <li>
            Reject out-of-order, stale, unentitled or invalid observations.
          </li>
        </ol>
        <p>
          Verified live, delayed, last close, stale, offline and not entitled
          are different states. Prices are never inferred from widget pixels.
        </p>
        <a
          className="v3-text"
          href="https://www.nseindia.com/static/market-data/nse-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          NSE data policy <ArrowUpRight size={15} />
        </a>
      </Panel>
    </>
  );
}
function Guide() {
  return (
    <Panel
      title="A stronger question in three steps"
      kicker="THE RESEARCH HABIT"
    >
      <ol className="v3-guide-list">
        <li>
          <h3>State the mechanism.</h3>
          <p>
            What do you expect, over what period, and why? Specific observations
            beat vague confidence.
          </p>
        </li>
        <li>
          <h3>Make room for the other explanation.</h3>
          <p>
            Record the best opposing case and when each source became available.
            A source reference is not proof that its contents or reuse rights
            are verified.
          </p>
        </li>
        <li>
          <h3>Predeclare a fair review.</h3>
          <p>
            What would disprove the hypothesis? Preserve the original and append
            your later assessment. An expired deadline means ready to review,
            not an automatic success or failure.
          </p>
        </li>
      </ol>
      <p className="v3-callout">
        A one-off thesis has no standalone historical win rate. A scan’s
        simulated win rate belongs to a specific strategy, sample, period,
        dataset and cost model.
      </p>
    </Panel>
  );
}
function OptionsLab() {
  const [spot, setSpot] = useState(100),
    [strike, setStrike] = useState(100),
    [vol, setVol] = useState(20),
    [days, setDays] = useState(30),
    [rate, setRate] = useState(6);
  let result: ReturnType<typeof bsm> | null = null,
    err = "";
  try {
    result = bsm(spot, strike, days / 365, rate / 100, 0, vol / 100);
  } catch (e) {
    err = (e as Error).message;
  }
  return (
    <Panel
      title="Educational options calculator"
      kicker="HYPOTHETICAL INPUTS ONLY"
    >
      <p>
        No option chain, market quote or executable price. Black–Scholes assumes
        constant volatility, frictionless continuous trading and European
        exercise.
      </p>
      <div className="v3-form-grid">
        {[
          ["Spot", spot, setSpot],
          ["Strike", strike, setStrike],
          ["Volatility (%)", vol, setVol],
          ["Days to expiry", days, setDays],
          ["Risk-free rate (%)", rate, setRate],
        ].map(([label, value, setter]) => (
          <Field key={label as string} label={label as string}>
            <input
              type="number"
              value={value as number}
              onChange={(e) =>
                (setter as (v: number) => void)(Number(e.target.value))
              }
            />
          </Field>
        ))}
      </div>
      {err && <p role="alert">{err}</p>}
      {result && (
        <div className="v3-readiness-grid">
          {Object.entries(result).map(([key, value]) => (
            <div key={key}>
              <span className="v3-eyebrow">{key}</span>
              <strong className="v3-number">{Number(value).toFixed(4)}</strong>
            </div>
          ))}
        </div>
      )}
      <p className="v3-footnote">
        Calculated from your hypothetical inputs, not market observations. Units
        and assumptions matter; no trading recommendation is provided.
      </p>
    </Panel>
  );
}
