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
  UserRound,
  MoreVertical,
  Bell,
  Search,
} from "lucide-react";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import type {
  DensityPreference,
  EarthQualityPreference,
  MotionPreference,
  UserProfileSnapshot,
} from "../../../backend/services/profile/profile";
import Global, { AssetDialog } from "../../features/global/dashboard";
import type { EconomicEventChartContext } from "../../features/global/economic-calendar";
const Strategy = lazy(() => import("./strategy"));
const CommunityNetwork = lazy(
  () => import("../../features/community/research-network-shell"),
);
const SettingsView = lazy(() => import("../../features/account/settings-view"));
import AvatarBadge from "../../features/account/avatar-badge";
import AccountQuickPanel, {
  type SettingsSection,
} from "../../features/account/account-quick-panel";
import EclipseIntro from "./eclipse-intro";
import UniversalSearch from "./universal-search";
import PrivateHoldingsTicker from "./private-ticker";
const DataControl = lazy(() => import("../../features/global/data-control"));
import AuthPanel, {
  type AuthSessionResponse,
} from "../../features/auth/auth-panel";
import { api, Modal, WorkspaceSkeleton, type WorkspaceState } from "./shared";
import {
  GLOBAL_MENU_ITEMS,
  parseGlobalViewParam,
  parseIntelligenceSubViewParam,
  type GlobalView,
  type IntelligenceSubView,
} from "./global-menu";

type View = "Global" | "Strategy" | "Community" | "Settings";

const GLOBAL_THOUGHTS = [
  "Process outlasts prediction: check data quality and cutoff dates before reacting to price movement.",
  "A zero-match scan is honest evidence, not a failed run.",
];

export default function X1Workspace() {
  const [view, setView] = useState<View>("Global"),
    [settingsSection, setSettingsSection] = useState<SettingsSection>("profile"),
    [communityTab, setCommunityTab] = useState<"web" | "chats" | "groups">("web"),
    [communitySavedOnly, setCommunitySavedOnly] = useState(false),
    [communityTabNonce, setCommunityTabNonce] = useState(0),
    [communitySearch, setCommunitySearch] = useState(""),
    [sectionDrawerOpen, setSectionDrawerOpen] = useState(false),
    [contextHelpOpen, setContextHelpOpen] = useState(false),
    [thoughtDismissed, setThoughtDismissed] = useState(false),
    [bellOpen, setBellOpen] = useState(false),
    [followRequests, setFollowRequests] = useState<
      { handle: string; displayName: string; avatarId: string; createdAt: string }[]
    >([]),
    [globalView, setGlobalViewState] = useState<GlobalView>("DASHBOARD"),
    [intelligenceSubView, setIntelligenceSubView] =
      useState<IntelligenceSubView>("HEADLINES"),
    [quickMenuOpen, setQuickMenuOpen] = useState(false),
    [profileRevision, setProfileRevision] = useState(0),
    [data, setData] = useState<MarketSnapshot | null>(null),
    [workspace, setWorkspace] = useState<WorkspaceState | null>(null),
    [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [authUser, setAuthUser] = useState<AuthSessionResponse["user"]>(null),
    [googleEnabled, setGoogleEnabled] = useState(false),
    [accepted, setAccepted] = useState<boolean | null>(null),
    [authModal, setAuthModal] = useState<"signin" | "register" | null>(null),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [asset, setAsset] = useState(""),
    [assetEventContext, setAssetEventContext] =
      useState<EconomicEventChartContext | null>(null),
    [initialProfileHandle, setInitialProfileHandle] = useState<string | null>(
      null,
    ),
    [about, setAbout] = useState(false),
    [introPreview, setIntroPreview] = useState(false),
    [initialFormula, setInitialFormula] = useState(""),
    [initialInstrument, setInitialInstrument] = useState(""),
    [initialUniversePreset, setInitialUniversePreset] = useState<
      "INDIAN_EQUITIES" | "MCX_FUTURES" | "MY_WATCHLIST" | "ECB_DAILY" | "CUSTOM_CSV" | undefined
    >(undefined),
    [sharedFormula, setSharedFormula] = useState(""),
    [strategyPanel, setStrategyPanel] = useState("Soul Scan"),
    [busy, setBusy] = useState(false),
    [sessionError, setSessionError] = useState(""),
    [dataControl, setDataControl] = useState(false),
    [isOwner, setIsOwner] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [motionPref, setMotionPref] = useState<MotionPreference>("system"),
    [densityPref, setDensityPref] = useState<DensityPreference>("comfortable"),
    [earthQuality, setEarthQuality] = useState<EarthQualityPreference>("auto");

  const avatarTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const previousView = useRef<"Global" | "Strategy" | "Community">("Global");

  const selectGlobalView = useCallback(
    (next: GlobalView, sub?: IntelligenceSubView) => {
      setGlobalViewState(next);
      if (sub) setIntelligenceSubView(sub);
      const url =
        next === "DASHBOARD"
          ? "/?view=global"
          : next === "INTELLIGENCE" && sub
            ? `/?view=global&section=intelligence&tab=${sub.toLowerCase()}`
            : `/?view=global&section=${next.toLowerCase()}`;
      window.history.replaceState(null, "", url);
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("x1-main")?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!sectionDrawerOpen) return;
    drawerCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSectionDrawerOpen(false);
        drawerTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sectionDrawerOpen]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ss-motion-pref");
      if (stored === "minimal" || stored === "full") {
        queueMicrotask(() => setMotionPref(stored));
      }
      const storedDensity = window.localStorage.getItem("ss-density-pref");
      if (storedDensity === "compact") {
        queueMicrotask(() => setDensityPref("compact"));
      }
    } catch {
      /* Storage is optional. */
    }
  }, []);

  const updateMotionPref = (next: MotionPreference) => {
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
  const [mobileChatActive, setMobileChatActive] = useState(false);

  useEffect(() => {
    const onChatActive = (event: Event) => {
      setMobileChatActive(!!(event as CustomEvent<boolean>).detail);
    };
    window.addEventListener("x54-mobile-chat-active", onChatActive);
    return () =>
      window.removeEventListener("x54-mobile-chat-active", onChatActive);
  }, []);

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

      if (session.user?.preferences) {
        setMotionPref(session.user.preferences.motion);
        setDensityPref(session.user.preferences.density);
        setEarthQuality(session.user.preferences.earthQuality);
      }

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
        target = params.get("view")?.toLowerCase(),
        sec = params.get("section")?.toLowerCase();
      if (target === "strategy") setView("Strategy");
      const rawProf = (params.get("profile") || params.get("handle") || "")
        .trim()
        .replace(/^@+/, "");
      if (target === "community" || rawProf) {
        setView("Community");
        if (rawProf) setInitialProfileHandle(rawProf);
      }
      if (target === "settings") {
        setView("Settings");
        if (
          sec === "profile" ||
          sec === "appearance" ||
          sec === "notifications" ||
          sec === "privacy" ||
          sec === "account"
        ) {
          setSettingsSection(sec);
        }
      }
      if (params.get("section") && target !== "settings") {
        setGlobalViewState(parseGlobalViewParam(params.get("section")));
        if (params.get("tab")) {
          setIntelligenceSubView(parseIntelligenceSubViewParam(params.get("tab")));
        }
      }
      if (params.get("panel")) {
        const panelParam = params.get("panel")!;
        setGlobalViewState(parseGlobalViewParam(panelParam));
        setStrategyPanel(panelParam);
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
    if (next !== "Settings") {
      previousView.current = next;
    }
    setQuickMenuOpen(false);
    setView(next);
    window.history.replaceState(null, "", "/?view=" + next.toLowerCase());
    document.getElementById("x1-main")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
    return true;
  }

  const openSettings = useCallback((section: SettingsSection = "profile") => {
    if (!authRef.current.authenticated) {
      setQuickMenuOpen(false);
      setAuthModal("signin");
      return;
    }
    setSettingsSection(section);
    setQuickMenuOpen(false);
    setView("Settings");
    window.history.replaceState(
      null,
      "",
      "/?view=settings&section=" + encodeURIComponent(section),
    );
    document.getElementById("x1-main")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const handleProfileSynced = useCallback((profile: UserProfileSnapshot) => {
    setAuthUser((prev) =>
      prev
        ? {
            ...prev,
            displayName: profile.displayName,
            avatarId: profile.avatarId,
            handle: profile.handle,
            bio: profile.bio,
            discoverable: profile.social.discoverable,
            unreadNotifications: profile.unreadNotifications,
            genderSymbol: profile.genderSymbol,
            instagramHandle: profile.instagramHandle,
            bannerPresetId: profile.bannerPresetId,
            portfolioBackdrop: profile.portfolioBackdrop,
            defaultPostAudience: profile.defaultPostAudience,
            counts: profile.counts,
            preferences: profile.preferences,
          }
        : prev,
    );
    setMotionPref(profile.preferences.motion);
    setDensityPref(profile.preferences.density);
    setEarthQuality(profile.preferences.earthQuality);
    setProfileRevision((r) => r + 1);
    try {
      window.localStorage.setItem("ss-motion-pref", profile.preferences.motion);
      window.localStorage.setItem("ss-density-pref", profile.preferences.density);
    } catch {
      /* Storage is optional. */
    }
  }, []);

  const loadFollowRequests = useCallback(async () => {
    if (!authRef.current.authenticated) return;
    try {
      const res = await api<{
        requests: {
          handle: string;
          displayName: string;
          avatarId: string;
          createdAt: string;
        }[];
      }>("/api/community/network?view=follow-requests");
      setFollowRequests(res.requests ?? []);
    } catch {
      /* Ignore when unauthenticated */
    }
  }, []);

  async function respondFollowRequest(
    handle: string,
    decision: "APPROVE" | "DECLINE",
  ) {
    try {
      await api("/api/community/network", {
        action: "respond-follow",
        handle,
        decision,
      });
      setFollowRequests((prev) => prev.filter((r) => r.handle !== handle));
      notify(
        decision === "APPROVE"
          ? `Approved follow request from @${handle}.`
          : `Declined follow request from @${handle}.`,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Action failed.", true);
    }
  }

  async function hidePrivateTicker() {
    if (!isSignedIn) return;
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        {
          action: "update-preferences",
          privateTickerEnabled: false,
        },
      );
      handleProfileSynced(res.profile);
      notify("Private ticker hidden.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not hide ticker.", true);
    }
  }

  const analyze = (
    formula = "close > sma(close, 20)",
    instrumentId = "",
    universePreset?:
      | "INDIAN_EQUITIES"
      | "MCX_FUTURES"
      | "MY_WATCHLIST"
      | "ECB_DAILY"
      | "CUSTOM_CSV",
  ) => {
    setInitialInstrument(instrumentId);
    setInitialFormula(formula);
    setInitialUniversePreset(universePreset);
    setStrategyPanel("Soul Scan");
    navigate("Strategy");
    setAsset("");
  };

  async function handleSignOut() {
    setBusy(true);
    try {
      await api("/api/auth/signout", {});
      setQuickMenuOpen(false);
      setAuthenticated(false);
      setAuthUser(null);
      setAccepted(null);
      setIsOwner(false);
      setWorkspace(null);
      if (view === "Settings") {
        setView("Global");
        window.history.replaceState(null, "", "/?view=global");
      }
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
    <div
      className={"x1-app" + (mobileChatActive ? " is-mobile-chat-active" : "")}
      data-motion={motionPref === "minimal" ? "minimal" : "system"}
      data-density={densityPref}
    >
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
            About Strategic Souls
            <Info size={14} />
          </button>
        </div>
      </aside>
      <div className="x1-content">
        <header className="x1-topbar">
          {/* GLOBAL HEADER: 3-dot Sections Drawer + Universal Search + bordered ? Help + Avatar */}
          {view === "Global" && (
            <>
              <div className="x51-topbar-left">
                <button
                  ref={drawerTriggerRef}
                  type="button"
                  className="x51-menu-btn"
                  aria-label="Open Global sections menu"
                  aria-haspopup="dialog"
                  aria-expanded={sectionDrawerOpen}
                  aria-controls="x53-sections-drawer"
                  onClick={() => setSectionDrawerOpen((v) => !v)}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
              <div className="x51-topbar-search-wrap">
                <UniversalSearch
                  data={data}
                  authenticated={isSignedIn && accepted === true}
                  onAsset={setAsset}
                  onCommunity={(query) => {
                    const trimmed = query.trim();
                    if (trimmed.startsWith("@") && trimmed.length >= 2) {
                      setInitialProfileHandle(trimmed.slice(1));
                      setCommunitySearch("");
                    } else {
                      setCommunitySearch(trimmed);
                    }
                    setCommunityTab("web");
                    setCommunitySavedOnly(false);
                    setCommunityTabNonce((n) => n + 1);
                    navigate("Community");
                  }}
                />
              </div>
              <div className="x51-topbar-right">
                {isOwner && (
                  <button
                    className="x1-icon-button"
                    aria-label="Data Control Center"
                    onClick={() => setDataControl(true)}
                  >
                    <Settings2 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className="x51-help-btn"
                  aria-label="Global help and research guide"
                  onClick={() => setContextHelpOpen(true)}
                >
                  ?
                </button>
              </div>
            </>
          )}

          {/* STRATEGY HEADER: 3-dot Sections Drawer + Centered "Strategy Builder" (NO global search!) + bordered ? Help + Avatar */}
          {view === "Strategy" && (
            <>
              <div className="x51-topbar-left">
                <button
                  type="button"
                  className="x51-menu-btn"
                  aria-label="Open Strategy sections menu"
                  aria-expanded={sectionDrawerOpen}
                  onClick={() => setSectionDrawerOpen((v) => !v)}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
              <div className="x51-topbar-center">
                <h1 className="x51-topbar-title">Strategy Builder</h1>
              </div>
              <div className="x51-topbar-right">
                <button
                  type="button"
                  className="x51-help-btn"
                  aria-label="Strategy Builder help and quotas"
                  onClick={() => setContextHelpOpen(true)}
                >
                  ?
                </button>
              </div>
            </>
          )}

          {/* COMMUNITY HEADER: Body ID (@handle) Search + Notification Bell (with Follow Requests) + Avatar */}
          {view === "Community" && (
            <>
              <div className="x51-topbar-search-wrap">
                <label className="x51-body-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search Body ID or Souls"
                    value={communitySearch}
                    onChange={(e) => setCommunitySearch(e.target.value)}
                    placeholder="Search @BodyID, researcher, or Soul…"
                  />
                </label>
              </div>
              <div className="x51-topbar-right">
                <div className="x51-bell-wrap">
                  <button
                    type="button"
                    className="x51-bell-btn"
                    aria-label="Notifications and follow requests"
                    aria-expanded={bellOpen}
                    onClick={() => {
                      const next = !bellOpen;
                      setBellOpen(next);
                      if (next) void loadFollowRequests();
                    }}
                  >
                    <Bell size={18} />
                    {((authUser?.unreadNotifications ?? 0) +
                      followRequests.length) > 0 && (
                      <span className="x51-bell-badge">
                        {(authUser?.unreadNotifications ?? 0) +
                          followRequests.length}
                      </span>
                    )}
                  </button>
                  {bellOpen && (
                    <div
                      className="x51-bell-dropdown"
                      role="dialog"
                      aria-label="Notifications & follow requests"
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <strong>Notifications</strong>
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => {
                            setBellOpen(false);
                            openSettings("notifications");
                          }}
                        >
                          All settings
                        </button>
                      </div>
                      {followRequests.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <span className="x1-caption">
                            Pending Follow Requests ({followRequests.length})
                          </span>
                          {followRequests.map((req) => (
                            <div
                              key={req.handle}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                padding: 8,
                                borderRadius: 8,
                                background: "var(--x51-surface-card)",
                                border: "1px solid var(--x51-hairline)",
                              }}
                            >
                              <button
                                type="button"
                                className="x1-text-button"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  minWidth: 0,
                                  padding: 0,
                                }}
                                onClick={() => {
                                  setBellOpen(false);
                                  setInitialProfileHandle(req.handle);
                                  setCommunityTab("web");
                                  setCommunityTabNonce((n) => n + 1);
                                  navigate("Community");
                                }}
                              >
                                <AvatarBadge avatarId={req.avatarId} size={26} alt="" />
                                <span style={{ fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  @{req.handle}
                                </span>
                              </button>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  type="button"
                                  className="x51-chip is-active"
                                  style={{ minHeight: 28, padding: "2px 8px" }}
                                  onClick={() =>
                                    void respondFollowRequest(req.handle, "APPROVE")
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="x51-chip"
                                  style={{ minHeight: 28, padding: "2px 8px" }}
                                  onClick={() =>
                                    void respondFollowRequest(req.handle, "DECLINE")
                                  }
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="x1-caption" style={{ margin: 0 }}>
                          {isSignedIn
                            ? (authUser?.unreadNotifications ?? 0) > 0
                              ? `${authUser?.unreadNotifications} unread activity alert(s). Open Notifications settings to view and clear.`
                              : "No pending follow requests or unread alerts."
                            : "Sign in to receive in-app follow requests and Soul comment notifications."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* SETTINGS HEADER */}
          {view === "Settings" && (
            <>
              <div className="x51-topbar-center">
                <h1 className="x51-topbar-title">Account &amp; Preferences</h1>
              </div>
            </>
          )}

          <div className="x6-account-anchor">
            {isSignedIn ? (
              <button
                ref={avatarTriggerRef}
                type="button"
                className="x6-avatar-trigger"
                aria-haspopup="dialog"
                aria-expanded={quickMenuOpen}
                aria-controls="ss-account-quick-panel"
                aria-label={`${authUser?.displayName || "Account"} · Open account control center`}
                onClick={() => setQuickMenuOpen((v) => !v)}
              >
                <AvatarBadge
                  avatarId={authUser?.avatarId}
                  size={36}
                  ring
                  alt=""
                />
                {(authUser?.unreadNotifications ?? 0) > 0 && (
                  <span className="x6-avatar-dot" aria-hidden="true" />
                )}
              </button>
            ) : (
              <button
                ref={avatarTriggerRef}
                type="button"
                className="x6-avatar-trigger x6-avatar-trigger-guest"
                aria-haspopup="dialog"
                aria-expanded={quickMenuOpen}
                aria-controls="ss-account-quick-panel"
                aria-label="Guest explorer menu"
                onClick={() => setQuickMenuOpen((v) => !v)}
              >
                <UserRound size={16} />
                <span>Sign in</span>
              </button>
            )}
            <AccountQuickPanel
              open={quickMenuOpen}
              onClose={() => setQuickMenuOpen(false)}
              triggerRef={avatarTriggerRef}
              signedIn={isSignedIn}
              displayName={authUser?.displayName}
              handle={authUser?.handle}
              avatarId={authUser?.avatarId}
              genderSymbol={authUser?.genderSymbol}
              instagramHandle={authUser?.instagramHandle}
              counts={authUser?.counts}
              discoverable={authUser?.discoverable}
              unreadNotifications={authUser?.unreadNotifications ?? 0}
              motionPref={motionPref}
              onMotionChange={updateMotionPref}
              busy={busy}
              onOpenMyProfile={() => {
                if (authUser?.handle) {
                  setInitialProfileHandle(authUser.handle);
                  setCommunityTab("web");
                  setCommunitySavedOnly(false);
                  setCommunityTabNonce((n) => n + 1);
                  navigate("Community");
                } else {
                  openSettings("profile");
                }
              }}
              onOpenSettings={openSettings}
              onOpenSaved={() => {
                setCommunityTab("web");
                setCommunitySavedOnly(true);
                setCommunityTabNonce((n) => n + 1);
                navigate("Community");
              }}
              onOpenHelp={() => setContextHelpOpen(true)}
              onSignIn={() => setAuthModal("signin")}
              onRegister={() => setAuthModal("register")}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </header>

        {/* Opt-In Private Holdings / Watchlist Ticker (OFF by default; owner-only across all 3 dashboards) */}
        <PrivateHoldingsTicker
          enabled={!!authUser?.preferences?.privateTickerEnabled}
          mode={authUser?.preferences?.privateTickerMode ?? "HOLDINGS"}
          authenticated={isSignedIn && accepted === true}
          workspace={workspace}
          onOpenAsset={setAsset}
          onHide={() => void hidePrivateTicker()}
        />
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
                  data={data}
                  workspace={workspace}
                  authenticated={isSignedIn && accepted === true}
                  isOwner={isOwner}
                  onRequireAuth={() => setAuthModal("signin")}
                  reload={reload}
                  notify={notify}
                  analyze={analyze}
                  openAsset={(id) => {
                    setAssetEventContext(null);
                    setAsset(id);
                  }}
                  openEventChart={(ctx) => {
                    setAssetEventContext(ctx);
                    setAsset(ctx.instrumentId);
                  }}
                  refreshData={refreshData}
                  refreshing={refreshing}
                  globalView={globalView}
                  onGlobalViewChange={selectGlobalView}
                  intelligenceSubView={intelligenceSubView}
                  onIntelligenceSubViewChange={(sub) => {
                    setIntelligenceSubView(sub);
                    if (globalView === "INTELLIGENCE") {
                      window.history.replaceState(
                        null,
                        "",
                        `/?view=global&section=intelligence&tab=${sub.toLowerCase()}`,
                      );
                    }
                  }}
                  onNavigate={navigate}
                  earthQuality={earthQuality}
                  portfolioBackdrop={authUser?.portfolioBackdrop}
                  privateTickerEnabled={!!authUser?.preferences?.privateTickerEnabled}
                  privateTickerMode={authUser?.preferences?.privateTickerMode ?? "HOLDINGS"}
                  onProfileSynced={handleProfileSynced}
                />
              ) : view === "Strategy" ? (
                <Strategy
                  key={
                    "strategy-" +
                    initialFormula +
                    "-" +
                    (initialUniversePreset ?? "") +
                    "-" +
                    strategyPanel
                  }
                  data={data}
                  workspace={workspace}
                  authenticated={isSignedIn && accepted === true}
                  onRequireAuth={() => setAuthModal("signin")}
                  reload={reload}
                  notify={notify}
                  openAsset={setAsset}
                  initialFormula={initialFormula}
                  initialInstrument={initialInstrument}
                  initialUniversePreset={initialUniversePreset}
                  initialPanel={strategyPanel}
                  onOpenCommunityWeb={() => {
                    setCommunityTab("web");
                    setCommunitySavedOnly(false);
                    setCommunityTabNonce((n) => n + 1);
                    navigate("Community");
                  }}
                  share={(formula) => {
                    setSharedFormula(formula);
                    setCommunityTab("groups");
                    setCommunityTabNonce((n) => n + 1);
                    navigate("Community");
                    notify(
                      "Method ready. Open a Research Room in Groups to create a shared Soul.",
                    );
                  }}
                />
              ) : view === "Settings" ? (
                isSignedIn ? (
                  <SettingsView
                    initialSection={settingsSection}
                    notify={notify}
                    onBack={() => navigate(previousView.current)}
                    onProfileSynced={handleProfileSynced}
                    onSignOut={() => void handleSignOut()}
                  />
                ) : (
                  <section className="x1-panel">
                    <h2>Sign in to access Settings &amp; Preferences</h2>
                    <p className="x1-caption">
                      Profile settings, privacy controls, and workspace preferences are private to your account.
                    </p>
                    <div className="x1-actions">
                      <button
                        type="button"
                        className="x1-primary x1-motion-button"
                        onClick={() => setAuthModal("signin")}
                      >
                        Sign in
                        <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className="x1-secondary"
                        onClick={() => navigate("Global")}
                      >
                        Back to Global
                      </button>
                    </div>
                  </section>
                )
              ) : (
                <CommunityNetwork
                  authenticated={isSignedIn && accepted === true}
                  onRequireAuth={() => setAuthModal("signin")}
                  notify={notify}
                  sharedFormula={sharedFormula}
                  searchQuery={communitySearch}
                  currentUser={authUser}
                  profileRevision={profileRevision}
                  initialTab={communityTab}
                  initialProfileHandle={initialProfileHandle}
                  savedOnlyRequested={communitySavedOnly}
                  tabNonce={communityTabNonce}
                  onOpenSettings={openSettings}
                  onProfileSynced={handleProfileSynced}
                  onOpenAsset={setAsset}
                  onCopyToStrategy={(formula) => {
                    setInitialFormula(formula);
                    setStrategyPanel("Soul Scan");
                    navigate("Strategy");
                  }}
                  onMobileChatActive={setMobileChatActive}
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
              <button onClick={() => setAbout(true)}>About Strategic Souls</button>
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
          isOwner={isOwner}
          eventContext={assetEventContext}
          onSelectAsset={(nextId) => {
            setAssetEventContext(null);
            setAsset(nextId);
          }}
          onRequireAuth={() => {
            setAsset("");
            setAssetEventContext(null);
            setAuthModal("signin");
          }}
          onClose={() => {
            setAsset("");
            setAssetEventContext(null);
          }}
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
      {/* Left Section Navigation Drawer (Global exact 4-item contract / Strategy 2-item contract) */}
      {sectionDrawerOpen && (
        <>
          <div
            className="x51-drawer-backdrop"
            aria-hidden="true"
            onClick={() => {
              setSectionDrawerOpen(false);
              drawerTriggerRef.current?.focus();
            }}
          />
          <aside
            id="x53-sections-drawer"
            className="x51-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${view} menu`}
          >
            <div className="x51-drawer-head">
              <h3>{view === "Strategy" ? "Strategy Builder" : "Global"}</h3>
              <button
                ref={drawerCloseRef}
                type="button"
                className="x1-icon-button"
                aria-label="Close sections drawer"
                onClick={() => {
                  setSectionDrawerOpen(false);
                  drawerTriggerRef.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            </div>
            <nav
              className="x51-drawer-list"
              aria-label={view === "Strategy" ? "Strategy sections" : "Global sections"}
            >
              {view === "Strategy"
                ? (
                    [
                      ["Soul Scan", "Classic (50 rules) & Advanced Soul Genome"],
                      ["Formula Lab", "Correlation, BSM/IV, CAGR, XIRR & Historical"],
                    ] as const
                  ).map(([sec, desc]) => (
                    <button
                      key={sec}
                      type="button"
                      className={
                        "x51-drawer-item" +
                        (strategyPanel === sec ? " is-active" : "")
                      }
                      aria-current={strategyPanel === sec ? "page" : undefined}
                      onClick={() => {
                        setStrategyPanel(sec);
                        setSectionDrawerOpen(false);
                        drawerTriggerRef.current?.focus();
                      }}
                    >
                      <span>
                        <strong>{sec}</strong>
                        <small>{desc}</small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))
                : GLOBAL_MENU_ITEMS.map((item) => {
                    const isActive =
                      globalView === item.id ||
                      (item.id === "DASHBOARD" &&
                        (globalView === "PORTFOLIO" ||
                          globalView === "WATCHLISTS" ||
                          globalView === "MARKET_EXPLORER"));
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          "x51-drawer-item" + (isActive ? " is-active" : "")
                        }
                        aria-current={globalView === item.id ? "page" : undefined}
                        onClick={() => {
                          setSectionDrawerOpen(false);
                          selectGlobalView(
                            item.id,
                            item.id === "INTELLIGENCE" ? "HEADLINES" : undefined,
                          );
                        }}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    );
                  })}
            </nav>
          </aside>
        </>
      )}

      {/* Contextual Help Modal (Global & Strategy bordered ? button) */}
      {contextHelpOpen && (
        <Modal
          title={
            view === "Strategy"
              ? "Strategy Builder · Help & Allowances"
              : "Global Workspace · Help & Data Rights"
          }
          onClose={() => setContextHelpOpen(false)}
        >
          {!thoughtDismissed && (
            <div className="x1-callout" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span>{GLOBAL_THOUGHTS[view === "Strategy" ? 1 : 0]}</span>
              <button
                type="button"
                className="x1-text-button"
                onClick={() => setThoughtDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          )}
          {view === "Strategy" ? (
            <dl className="x1-details">
              <div>
                <dt>Classic Mode</dt>
                <dd>
                  50 deterministic technical presets across RSI, Moving
                  Averages, MACD, Volatility &amp; Breakouts, and Trend &amp;
                  Volume. 8 completed scans per IST civil day (00:00 IST reset).
                </dd>
              </div>
              <div>
                <dt>Advanced Mode</dt>
                <dd>
                  Discover (natural-language Blueprint), Build (visual blocks +
                  AST), and Draw (interactive shape similarity + Soul Genome). 1
                  completed scan per rolling 60 minutes. Failed runs never
                  deduct quota.
                </dd>
              </div>
              <div>
                <dt>Formula Lab</dt>
                <dd>
                  Standalone calculator suite (Options &amp; Greeks, IV, CAGR,
                  XIRR, and manual Historical Investment). Never nested inside
                  Classic/Advanced.
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="x1-details">
              <div>
                <dt>9-Card Markets Grid</dt>
                <dd>
                  Always 3×3 across desktop and mobile. Tap Customize 9 to
                  reorder or swap any canonical instrument. Quality badges
                  separate official/delayed/not-connected feeds from exchange
                  open/closed sessions.
                </dd>
              </div>
              <div>
                <dt>Economic Calendar</dt>
                <dd>
                  Official RBI, MoSPI, FOMC, BLS, BEA, EIA, and ECB schedules in
                  your chosen IANA timezone (IST default). Never fabricates
                  actuals or consensus.
                </dd>
              </div>
              <div>
                <dt>Strategic Globe</dt>
                <dd>
                  Enlarged, multi-level zoomable natural-color 3D Earth (NASA
                  Blue/Black Marble) with 24 exchange venues, USGS M4.5+
                  earthquakes, NASA EONET natural events, and country profiles.
                </dd>
              </div>
              <div>
                <dt>Focused Tools (3-dot Menu)</dt>
                <dd>
                  Open Market Intelligence / Economic Calendar (Headlines,
                  Calendar &amp; Market Vox), Heatmap (NSE sector leaders &amp;
                  Asset Comparison), or focused Strategic Globe from the top-left
                  menu.
                </dd>
              </div>
            </dl>
          )}
          <div className="x1-actions">
            {view === "Global" && (
              <button
                type="button"
                className="x1-secondary"
                onClick={() => {
                  setContextHelpOpen(false);
                  selectGlobalView("MARKET_EXPLORER");
                }}
              >
                Data Coverage &amp; Sources
              </button>
            )}
            <button
              type="button"
              className="x1-secondary"
              onClick={() => {
                setContextHelpOpen(false);
                setAbout(true);
              }}
            >
              About Strategic Souls X5.4
            </button>
          </div>
        </Modal>
      )}

      {about && (
        <Modal title="About Strategic Souls" onClose={() => setAbout(false)}>
          <p>
            A private financial research workspace by Global Vertex Vectors.
          </p>
          <dl className="x1-details">
            <div>
              <dt>Release</dt>
              <dd>
                X5.4 · Premium Mobile UI, Public Research Profiles, Telegram-like
                Chats &amp; Cleaner Soul Scanner
              </dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>
                ECB daily FX, US Treasury daily yields, USGS earthquakes, NASA
                EONET natural events, and NASA Blue/Black Marble historical
                textures (public domain), plus owner-gated broker/EOD and
                licensed news/conflict adapters when configured.
              </dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>
                Cloudflare Workers + D1 session authentication with HttpOnly
                cookies. Research Room invites never expose private portfolios.
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
