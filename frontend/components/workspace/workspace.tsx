/* eslint-disable @next/next/no-html-link-for-pages -- Preserve native document transitions for archive/export routes. */
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
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import Global, { AssetDialog } from "../../features/global/dashboard";
const Strategy = lazy(() => import("./strategy"));
const Community = lazy(() => import("../../features/community/dashboard"));
import EclipseIntro from "./eclipse-intro";
import UniversalSearch from "./universal-search";
const DataControl = lazy(() => import("../../features/global/data-control"));
import AuthPanel, {
  type AuthSessionResponse,
} from "../../features/auth/auth-panel";
import { api, Modal, WorkspaceSkeleton, type WorkspaceState } from "./shared";

type View = "Global" | "Strategy" | "Community";

function userInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "SS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function X1Workspace() {
  const [view, setView] = useState<View>("Global"),
    [data, setData] = useState<MarketSnapshot | null>(null),
    [workspace, setWorkspace] = useState<WorkspaceState | null>(null),
    [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [authUser, setAuthUser] = useState<AuthSessionResponse["user"]>(null),
    [googleEnabled, setGoogleEnabled] = useState(false),
    [accepted, setAccepted] = useState<boolean | null>(null),
    [authModal, setAuthModal] = useState<"signin" | "register" | null>(null),
    [accountModal, setAccountModal] = useState(false),
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
    [refreshing, setRefreshing] = useState(false),
    [motionPref, setMotionPref] = useState<"system" | "minimal">("system");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ss-motion-pref");
      if (stored === "minimal") queueMicrotask(() => setMotionPref("minimal"));
    } catch {
      /* Storage is optional. */
    }
  }, []);

  const updateMotionPref = (next: "system" | "minimal") => {
    setMotionPref(next);
    try {
      window.localStorage.setItem("ss-motion-pref", next);
    } catch {
      /* Storage is optional. */
    }
  };

  const refreshLock = useRef(false);
  const researchDirty = useRef(false);
  const authRef = useRef({ authenticated: false, accepted: false });

  useEffect(() => {
    authRef.current = {
      authenticated: authenticated === true,
      accepted: accepted === true,
    };
  }, [authenticated, accepted]);

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

  const loadMarket = useCallback(async (usePrivate: boolean) => {
    const endpoint = usePrivate
      ? "/api/x2/data?view=overview"
      : "/api/markets/public";
    return api<MarketSnapshot>(endpoint);
  }, []);

  const refreshData = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const usePrivate =
        authRef.current.authenticated && authRef.current.accepted;
      setData(await loadMarket(usePrivate));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, [loadMarket, notify]);

  const hydrateForSession = useCallback(
    async (session: AuthSessionResponse, aliveCheck: () => boolean) => {
      setAuthenticated(session.authenticated);
      setAuthUser(session.user);
      setGoogleEnabled(!!session.googleEnabled);
      setIsOwner(!!session.isOwner);
      setAccepted(session.authenticated ? session.accepted : null);
      setSessionError("");

      const canLoadPrivate = session.authenticated && session.accepted;
      if (canLoadPrivate) {
        const [ws, market] = await Promise.allSettled([
          api<WorkspaceState>("/api/x1/workspace"),
          loadMarket(true),
        ]);
        if (!aliveCheck()) return;
        if (ws.status === "fulfilled") setWorkspace(ws.value);
        if (market.status === "fulfilled") setData(market.value);
        else {
          try {
            const fallback = await loadMarket(false);
            if (aliveCheck()) setData(fallback);
          } catch {
            if (aliveCheck()) notify(market.reason.message, true);
          }
        }
      } else {
        setWorkspace(null);
        try {
          const pub = await loadMarket(false);
          if (aliveCheck()) setData(pub);
        } catch (err) {
          if (aliveCheck()) notify((err as Error).message, true);
        }
      }
    },
    [loadMarket, notify],
  );

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

    api<AuthSessionResponse>("/api/auth/session")
      .then((session) => {
        if (!alive) return;
        return hydrateForSession(session, () => alive);
      })
      .catch(async (err) => {
        if (!alive) return;
        setAuthenticated(false);
        setAccepted(null);
        setSessionError((err as Error).message);
        try {
          const pub = await loadMarket(false);
          if (alive) setData(pub);
        } catch {
          /* Public feed error surfaced separately if refresh is retried. */
        }
      });

    return () => {
      alive = false;
    };
  }, [hydrateForSession, loadMarket]);

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

  async function handleSignOut() {
    setBusy(true);
    try {
      await api("/api/auth/signout", {});
      setAccountModal(false);
      setAuthenticated(false);
      setAuthUser(null);
      setAccepted(null);
      setIsOwner(false);
      setWorkspace(null);
      try {
        setData(await loadMarket(false));
      } catch {
        /* Keep last official snapshot if refresh fails. */
      }
      notify("Signed out safely.");
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

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

  const isSignedIn = authenticated === true;

  return (
    <div className="x1-app" data-motion={motionPref}>
      <EclipseIntro
        key={introPreview ? "preview" : "normal"}
        ready={
          introPreview ? false : authenticated !== null || !!sessionError
        }
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
            authenticated={isSignedIn && accepted === true}
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
          {isSignedIn ? (
            <button
              className="x1-account"
              aria-label={`${authUser?.displayName || "Account"} · Open account controls`}
              onClick={() => setAccountModal(true)}
            >
              {userInitials(authUser?.displayName)}
            </button>
          ) : (
            <button
              className="x1-secondary x2-signin-trigger"
              onClick={() => setAuthModal("signin")}
            >
              <LogIn size={15} />
              <span>Sign in</span>
            </button>
          )}
        </header>
        <main id="x1-main" tabIndex={-1} className="x1-main">
          {sessionError && (
            <div role="alert" className="x1-callout">
              {sessionError}{" "}
              <button
                className="x1-text-button"
                onClick={() => setAuthModal("signin")}
              >
                Sign in
              </button>
            </div>
          )}
          {authenticated === false && !sessionError && (
            <div className="x1-callout x2-guest-banner">
              <span>
                Exploring official ECB daily FX, US Treasury yields, the
                24-exchange globe, and Formula Lab. Sign in or create an account
                to save watchlists, portfolios, Soul Scans, and Community
                research.
              </span>
              <div className="x1-actions">
                <button
                  className="x1-secondary"
                  onClick={() => setAuthModal("signin")}
                >
                  Sign in
                </button>
                <button
                  className="x1-primary"
                  onClick={() => setAuthModal("register")}
                >
                  Create account
                </button>
              </div>
            </div>
          )}
          {isSignedIn && accepted === false && (
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
                    setData(await loadMarket(true));
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
          <Suspense
            fallback={
              <WorkspaceSkeleton
                label={`Opening ${view} workspace…`}
                kind="workspace"
              />
            }
          >
            <div
              key={view}
              className={"x1-dashboard x1-dashboard-" + view.toLowerCase()}
            >
              {view === "Global" ? (
                <Global
                  key={"global-" + globalPanel}
                  data={data}
                  workspace={workspace}
                  authenticated={isSignedIn && accepted === true}
                  onRequireAuth={() => setAuthModal("signin")}
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
                  authenticated={isSignedIn && accepted === true}
                  onRequireAuth={() => setAuthModal("signin")}
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
                <Community
                  authenticated={isSignedIn && accepted === true}
                  onRequireAuth={() => setAuthModal("signin")}
                  notify={notify}
                  sharedFormula={sharedFormula}
                />
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
          authenticated={isSignedIn && accepted === true}
          onRequireAuth={() => {
            setAsset("");
            setAuthModal("signin");
          }}
          onClose={() => setAsset("")}
          analyze={(formula, id) => analyze(formula, id)}
          notify={notify}
        />
      )}
      {authModal && (
        <Modal
          title={
            authModal === "register"
              ? "Create your Strategic Souls account"
              : "Sign in to Strategic Souls"
          }
          onClose={() => setAuthModal(null)}
        >
          <AuthPanel
            initialMode={authModal}
            googleEnabled={googleEnabled}
            onAuthenticated={(session) => {
              setAuthModal(null);
              void hydrateForSession(session, () => true);
              notify(
                session.accepted
                  ? "Signed in to your private workspace."
                  : "Signed in. Confirm research notices to enable saving.",
              );
            }}
          />
        </Modal>
      )}
      {accountModal && isSignedIn && (
        <Modal title="Your account" onClose={() => setAccountModal(false)}>
          <dl className="x1-details">
            <div>
              <dt>Researcher</dt>
              <dd>{authUser?.displayName || "Researcher"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{authUser?.email || "—"}</dd>
            </div>
            <div>
              <dt>Sign-in method</dt>
              <dd>
                {authUser?.authProvider === "google"
                  ? "Google OAuth"
                  : "Email & password (Cloudflare D1)"}
              </dd>
            </div>
          </dl>
          <div className="x3-motion-pref">
            <span>Interface motion</span>
            <div className="x1-segment" role="group" aria-label="Interface motion preference">
              {(["system", "minimal"] as const).map((pref) => (
                <button
                  key={pref}
                  type="button"
                  aria-pressed={motionPref === pref}
                  onClick={() => updateMotionPref(pref)}
                >
                  {pref === "system" ? "System (default)" : "Minimal"}
                </button>
              ))}
            </div>
          </div>
          <div className="x1-actions">
            <button
              className="x1-secondary x1-motion-button"
              onClick={() => {
                setAccountModal(false);
                navigate("Community");
              }}
            >
              <UserRound size={15} />
              Community profile
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
            <a className="x1-secondary x1-motion-button" href="/legacy">
              Account settings & archive
              <ArrowUpRight size={15} />
            </a>
            <button
              className="x1-primary x1-motion-button"
              disabled={busy}
              onClick={() => void handleSignOut()}
            >
              <LogOut size={15} />
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Modal>
      )}
      {dataControl && isOwner && (
        <Modal
          title="Data Control Center"
          onClose={() => setDataControl(false)}
        >
          <Suspense
            fallback={
              <WorkspaceSkeleton
                label="Opening Data Control Center…"
                kind="panel"
              />
            }
          >
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
              <dt>Authentication</dt>
              <dd>
                Cloudflare Workers + D1 session authentication with HttpOnly
                cookies. Group invites do not expose private portfolios.
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
            Payments, broker execution, public content publishing, and
            unverified forward probability claims remain disabled.
          </p>
          <div className="x3-motion-pref">
            <span>Interface motion</span>
            <div className="x1-segment" role="group" aria-label="Interface motion preference">
              {(["system", "minimal"] as const).map((pref) => (
                <button
                  key={pref}
                  type="button"
                  aria-pressed={motionPref === pref}
                  onClick={() => updateMotionPref(pref)}
                >
                  {pref === "system" ? "System (default)" : "Minimal"}
                </button>
              ))}
            </div>
          </div>
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
            {isSignedIn && (
              <a
                className="x1-secondary x1-motion-button"
                href="/api/export"
                target="_blank"
                rel="noreferrer"
              >
                Export my private data
                <ArrowUpRight size={15} />
              </a>
            )}
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
