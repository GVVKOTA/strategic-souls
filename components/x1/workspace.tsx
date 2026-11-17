/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation preserves Sites authentication and the existing archive. */
"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Globe2,
  SlidersHorizontal,
  Users,
  ArrowUpRight,
  Check,
  AlertCircle,
  X,
  Info,
  ArrowRight,
  FolderArchive,
  Settings2,
} from "lucide-react";
import type { MarketSnapshot } from "../../lib/x1/market-data";
import Global, { AssetDialog } from "../../global/dashboard";
const Strategy = lazy(() => import("./strategy"));
const Community = lazy(() => import("../../community/dashboard"));
import EclipseIntro from "./eclipse-intro";
import UniversalSearch from "../x2/universal-search";
const DataControl = lazy(() => import("../../global/data-control"));
import { api, Modal, type WorkspaceState } from "./shared";
type View = "Global" | "Strategy" | "Community";
export default function X1Workspace() {
  const [view, setView] = useState<View>("Global"),
    [data, setData] = useState<MarketSnapshot | null>(null),
    [workspace, setWorkspace] = useState<WorkspaceState | null>(null),
    [accepted, setAccepted] = useState<boolean | null>(null),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [asset, setAsset] = useState(""),
    [about, setAbout] = useState(false),
    [introPreview, setIntroPreview] = useState(false),
    [initialFormula, setInitialFormula] = useState(""),
    [initialInstrument, setInitialInstrument] = useState(""),
    [sharedFormula, setSharedFormula] = useState(""),
    [globalPanel, setGlobalPanel] = useState("Overview"),
    [strategyPanel, setStrategyPanel] = useState("Soul Scan"),
    [busy, setBusy] = useState(false),
    [sessionError, setSessionError] = useState(""),
    [dataControl, setDataControl] = useState(false),
    [isOwner, setIsOwner] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const refreshLock = useRef(false);
  const researchDirty = useRef(false);
  useEffect(() => {
    const dirty = (event: Event) => {
      researchDirty.current = !!(event as CustomEvent<boolean>).detail;
    };
    window.addEventListener("x2-research-dirty", dirty);
    return () => window.removeEventListener("x2-research-dirty", dirty);
  }, []);
  const notify = useCallback(
    (text: string, error = false) => setMessage({ text, error }),
    [],
  );
  const reload = useCallback(async () => {
    const state = await api<WorkspaceState>("/api/x1/workspace");
    setWorkspace(state);
  }, []);
  const refreshData = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      setData(await api<MarketSnapshot>("/api/x2/data?view=overview"));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, [notify]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search),
        target = params.get("view")?.toLowerCase();
      if (target === "strategy") setView("Strategy");
      if (target === "community") setView("Community");
      if (params.get("panel")) {
        setGlobalPanel(params.get("panel")!);
        setStrategyPanel(params.get("panel")!);
      }
    });
    api<{ isOwner: boolean }>("/api/x2/providers?view=capabilities")
      .then((r) => {
        if (alive) setIsOwner(r.isOwner);
      })
      .catch(() => {});
    Promise.allSettled([
      api<{ accepted: boolean }>("/api/session"),
      api<WorkspaceState>("/api/x1/workspace"),
      api<MarketSnapshot>("/api/x2/data?view=overview"),
    ]).then(([session, ws, market]) => {
      if (!alive) return;
      if (session.status === "fulfilled") setAccepted(session.value.accepted);
      else setSessionError(session.reason.message);
      if (ws.status === "fulfilled") setWorkspace(ws.value);
      if (market.status === "fulfilled") setData(market.value);
      else notify(market.reason.message, true);
    });
    return () => {
      alive = false;
    };
  }, [notify]);
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const updated = () => {
      void refreshData();
    };
    window.addEventListener("x2-data-updated", updated);
    return () => window.removeEventListener("x2-data-updated", updated);
  }, [refreshData]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshData();
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [refreshData]);
  function navigate(next: View) {
    if (
      view === "Strategy" &&
      next !== view &&
      researchDirty.current &&
      !window.confirm(
        "Leave this unsaved research draft? Save it first to keep your changes.",
      )
    )
      return false;
    setView(next);
    window.history.replaceState(null, "", "/?view=" + next.toLowerCase());
    document.getElementById("x1-main")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
    return true;
  }
  const analyze = (formula = "close > sma(close, 20)", instrumentId = "") => {
    setInitialInstrument(instrumentId);
    setInitialFormula(formula);
    setStrategyPanel("Soul Scan");
    navigate("Strategy");
    setAsset("");
  };
  const nav = [
    {
      name: "Global",
      index: "01",
      icon: Globe2,
      detail: "Markets & your world",
    },
    {
      name: "Strategy",
      index: "02",
      icon: SlidersHorizontal,
      detail: "Questions into evidence",
    },
    {
      name: "Community",
      index: "03",
      icon: Users,
      detail: "Research, together",
    },
  ] as const;
  return (
    <div className="x1-app">
      <EclipseIntro
        key={introPreview ? "preview" : "normal"}
        ready={introPreview ? false : accepted !== null || !!sessionError}
        preview={introPreview}
        onDismiss={() => setIntroPreview(false)}
      />
      <a href="#x1-main" className="x1-skip">
        Skip to content
      </a>
      <aside className="x1-sidebar">
        <a
          className="x1-brand"
          href="/"
          aria-label="Strategic Souls by Global Vertex Vectors"
        >
          {/* Founder-supplied approved GVV artwork; source bytes preserved. */}
          <img src="/gvv-approved.jpg" width="42" height="42" alt="" />
        </a>
        <nav aria-label="Main dashboards">
          {nav.map((item) => (
            <a
              key={item.name}
              href={"/?view=" + item.name.toLowerCase()}
              className={view === item.name ? "is-active" : ""}
              aria-current={view === item.name ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.name);
              }}
            >
              <span className="x1-nav-number">{item.index}</span>
              <item.icon size={20} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
            </a>
          ))}
        </nav>
        <div className="x1-sidebar-foot">
          <a href="/legacy" className="x1-archive-link">
            <FolderArchive size={16} />
            Existing saved research
            <ArrowUpRight size={14} />
          </a>
          <button className="x1-about-link" onClick={() => setAbout(true)}>
            Strategic Souls X2
            <Info size={14} />
          </button>
        </div>
      </aside>
      <div className="x1-content">
        <header className="x1-topbar">
          <a
            className="x2-header-logo"
            href="/"
            aria-label="Strategic Souls home"
            onClick={(e) => {
              e.preventDefault();
              navigate("Global");
            }}
          >
            <img src="/gvv-approved.jpg" alt="" width="44" height="44" />
          </a>
          <UniversalSearch
            data={data}
            onAsset={setAsset}
            onCommunity={(query) => {
              navigate("Community");
              window.dispatchEvent(
                new CustomEvent("x2-community-search", { detail: query }),
              );
              window.history.replaceState(
                null,
                "",
                "/?view=community&q=" + encodeURIComponent(query),
              );
            }}
          />
          {isOwner && (
            <button
              className="x1-icon-button"
              aria-label="Data Control Center"
              onClick={() => setDataControl(true)}
            >
              <Settings2 size={19} />
            </button>
          )}
          <button
            className="x1-top-source"
            onClick={() => {
              setGlobalPanel("Market Explorer");
              navigate("Global");
            }}
          >
            <i />
            <span>
              {data?.providers.some((p) => p.state === "CONNECTED")
                ? "Daily sources connected"
                : data
                  ? "Sources unavailable"
                  : "Checking sources"}
            </span>
            <ArrowUpRight size={14} />
          </button>
          <button
            className="x1-account"
            aria-label="GV · Open your Community profile"
            onClick={() => navigate("Community")}
          >
            GV
          </button>
        </header>
        <main id="x1-main" tabIndex={-1} className="x1-main">
          {sessionError && (
            <div role="alert" className="x1-callout">
              {sessionError}{" "}
              <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                Sign in with ChatGPT
              </a>
            </div>
          )}
          {accepted === false && (
            <section className="x1-consent">
              <h2>Your private research workspace</h2>
              <p>
                Confirm each notice to create and save research. Existing data
                export remains available through account controls.
              </p>
              <form
                className="x1-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const f = new FormData(e.currentTarget);
                    await api("/api/consent", {
                      adult: f.get("adult") === "on",
                      privacy: f.get("privacy") === "on",
                      terms: f.get("terms") === "on",
                    });
                    setAccepted(true);
                    await reload();
                    notify("Workspace enabled for private adult research.");
                  } catch (error) {
                    notify((error as Error).message, true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="x1-checkbox">
                  <input type="checkbox" name="adult" required />I confirm I am
                  18 or older.
                </label>
                <label className="x1-checkbox">
                  <input type="checkbox" name="privacy" required />I have read
                  the{" "}
                  <a href="/trust" target="_blank" rel="noreferrer">
                    privacy notice
                  </a>
                  .
                </label>
                <label className="x1-checkbox">
                  <input type="checkbox" name="terms" required />I accept the{" "}
                  <a href="/terms" target="_blank" rel="noreferrer">
                    research terms
                  </a>
                  .
                </label>
                <button className="x1-primary x1-motion-button" disabled={busy}>
                  Open private workspace
                  <ArrowRight size={16} />
                </button>
              </form>
            </section>
          )}
          <Suspense fallback={<p role="status">Opening {view}…</p>}>
            <div
              key={view}
              className={"x1-dashboard x1-dashboard-" + view.toLowerCase()}
            >
              {view === "Global" ? (
                <Global
                  key={"global-" + globalPanel}
                  data={data}
                  workspace={workspace}
                  reload={reload}
                  notify={notify}
                  analyze={analyze}
                  openAsset={setAsset}
                  refreshData={refreshData}
                  refreshing={refreshing}
                  initialPanel={globalPanel}
                />
              ) : view === "Strategy" ? (
                <Strategy
                  key={"strategy-" + initialFormula + "-" + strategyPanel}
                  data={data}
                  workspace={workspace}
                  reload={reload}
                  notify={notify}
                  openAsset={setAsset}
                  initialFormula={initialFormula}
                  initialInstrument={initialInstrument}
                  initialPanel={strategyPanel}
                  share={(formula) => {
                    setSharedFormula(formula);
                    navigate("Community");
                    notify(
                      "Method ready. Open a private group and create a shared Soul.",
                    );
                  }}
                />
              ) : (
                <Community notify={notify} sharedFormula={sharedFormula} />
              )}
            </div>
          </Suspense>
          <footer className="x1-footer">
            <span>STRATEGIC SOULS / GLOBAL VERTEX VECTORS</span>
            <p>
              Private research and education. Daily data is not a live trading
              quote.
            </p>
            <div>
              <a href="/trust">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/help">Help</a>
              <button onClick={() => setAbout(true)}>About X2</button>
            </div>
          </footer>
        </main>
      </div>
      <nav className="x1-mobile-nav" aria-label="Main mobile dashboards">
        {nav.map((item) => (
          <a
            key={item.name}
            href={"/?view=" + item.name.toLowerCase()}
            aria-current={view === item.name ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(item.name);
            }}
          >
            <item.icon size={21} />
            <span>{item.name}</span>
          </a>
        ))}
      </nav>
      {message && (
        <div
          className={"x1-toast " + (message.error ? "x1-toast-error" : "")}
          role={message.error ? "alert" : "status"}
        >
          {message.error ? (
            <AlertCircle size={18} />
          ) : /saved|published|revision/i.test(message.text) ? (
            <span className="x1-save-confirmed" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="var(--x1-divider-strong)"
                />
                <path
                  className="x1-save-check-line"
                  pathLength="1"
                  strokeWidth="1.6"
                  d="m5 12 4 4L19 6"
                />
              </svg>
            </span>
          ) : (
            <Check size={18} />
          )}
          <span>{message.text}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {asset && (
        <AssetDialog
          id={asset}
          data={data}
          onClose={() => setAsset("")}
          analyze={(formula, id) => analyze(formula, id)}
          notify={notify}
        />
      )}
      {dataControl && isOwner && (
        <Modal
          title="Data Control Center"
          onClose={() => setDataControl(false)}
        >
          <Suspense fallback={<p role="status">Opening provider controls…</p>}>
            <DataControl notify={notify} />
          </Suspense>
        </Modal>
      )}
      {about && (
        <Modal title="Strategic Souls · X2" onClose={() => setAbout(false)}>
          <p>
            A private financial research workspace by Global Vertex Vectors.
          </p>
          <dl className="x1-details">
            <div>
              <dt>Release</dt>
              <dd>X2 · Research intelligence and community</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>
                ECB daily FX and US Treasury daily yields, when available.
              </dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                Existing restricted Site audience. Group invites do not grant
                Site access.
              </dd>
            </div>
            <div>
              <dt>Research</dt>
              <dd>
                Current deterministic filters on eligible daily FX observations.
                No historical accuracy or probability claims.
              </dd>
            </div>
          </dl>
          <p>
            Payments, broker execution, public content publishing, external
            member onboarding and collective evidence are not enabled.
          </p>
          <div className="x1-actions">
            <button
              className="x1-secondary x1-motion-button"
              onClick={() => {
                if (
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ) {
                  notify(
                    "Your reduced-motion preference bypasses the welcome animation.",
                  );
                  return;
                }
                setAbout(false);
                setIntroPreview(true);
              }}
            >
              Preview silver eclipse
            </button>
            <a
              className="x1-secondary x1-motion-button"
              href="/api/export"
              target="_blank"
              rel="noreferrer"
            >
              Export my private data
              <ArrowUpRight size={15} />
            </a>
            <a className="x1-text-button" href="/legacy">
              Existing research archive
              <ArrowUpRight size={15} />
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
