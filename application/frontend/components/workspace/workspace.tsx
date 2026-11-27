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
  ArrowUpRight,
  Check,
  AlertCircle,
  X,
  Info,
  ArrowRight,
  FolderArchive,
  UserRound,
  MoreVertical,
  Bell,
  Search,
} from "lucide-react";
import { APP_RELEASE } from "../../../backend/services/release-meta";
import { notificationLabel } from "../../../backend/services/community/notification-target";
import type { ScanUniversePreset } from "../../../backend/services/research/research";
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
import GoFeedbackHost from "./go-feedback";
import { IconCommunity, IconGlobal, IconStrategy } from "./ss-icons";
import UniversalSearch from "./universal-search";
import PrivateHoldingsTicker from "./private-ticker";
import AuthPanel, {
  type AuthSessionResponse,
} from "../../features/auth/auth-panel";
import { api, Modal, WorkspaceSkeleton, type WorkspaceState } from "./shared";
import {
  GLOBAL_MENU_ITEMS,
  globalViewUrl,
  parseGlobalViewParam,
  parseIntelligenceSubViewParam,
  type GlobalView,
  type IntelligenceSubView,
} from "./global-menu";

type View = "Global" | "Strategy" | "Community";
type StrategyPanel = "scan" | "lab";

const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  "profile", "appearance", "notifications", "privacy", "data", "account",
  "security", "sessions", "help", "about",
];

function settingsSectionFromUrl(value: string | null): SettingsSection | null {
  if (value === "all") return null;
  return SETTINGS_SECTIONS.find((section) => section === value) ?? "profile";
}

const GLOBAL_THOUGHTS = [
  "Process outlasts prediction: check data quality and cutoff dates before reacting to price movement.",
  "A zero-match scan is honest evidence, not a failed run.",
];

export default function X1Workspace() {
  const [view, setView] = useState<View>("Global"),
    [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [helpMenuOpen, setHelpMenuOpen] = useState(false),
    [communityTab, setCommunityTab] = useState<"web" | "chats" | "groups">("web"),
    [communitySavedOnly, setCommunitySavedOnly] = useState(false),
    [communityTabNonce, setCommunityTabNonce] = useState(0),
    [communitySearch, setCommunitySearch] = useState(""),
    [sectionDrawerOpen, setSectionDrawerOpen] = useState(false),
    [contextHelpOpen, setContextHelpOpen] = useState<boolean | "about">(false),
    [thoughtDismissed, setThoughtDismissed] = useState(false),
    [bellOpen, setBellOpen] = useState(false),
    [notices, setNotices] = useState<{ id: string; kind: string; readAt: string | null }[]>([]),
    [followRequests, setFollowRequests] = useState<{ handle: string; displayName: string }[]>([]),
    [noticeStatus, setNoticeStatus] = useState(""),
    [noticeBusy, setNoticeBusy] = useState(false),
    [deepLink, setDeepLink] = useState({ thread: "", room: "", post: "", anchor: "", scan: "", event: "" }),
    [globalView, setGlobalViewState] = useState<GlobalView>("DASHBOARD"),
    [intelligenceSubView, setIntelligenceSubView] =
      useState<IntelligenceSubView>("HEADLINES"),
    [quickMenuOpen, setQuickMenuOpen] = useState(false),
    [profileRevision, setProfileRevision] = useState(0),
    [data, setData] = useState<MarketSnapshot | null>(null),
    [marketUnavailable, setMarketUnavailable] = useState(false),
    [workspace, setWorkspace] = useState<WorkspaceState | null>(null),
    [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [authUser, setAuthUser] = useState<AuthSessionResponse["user"]>(null),
    [accepted, setAccepted] = useState<boolean | null>(null),
    [authModal, setAuthModal] = useState<"signin" | "register" | null>(null),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [asset, setAsset] = useState(""),
    [assetAlerts, setAssetAlerts] = useState(""),
    [selectedAlert, setSelectedAlert] = useState(""),
    [assetEventContext, setAssetEventContext] =
      useState<EconomicEventChartContext | null>(null),
    [initialProfileHandle, setInitialProfileHandle] = useState<string | null>(
      null,
    ),
    [about, setAbout] = useState(false),
    [initialFormula, setInitialFormula] = useState(""),
    [initialInstrument, setInitialInstrument] = useState(""),
    [initialUniversePreset, setInitialUniversePreset] = useState<
      ScanUniversePreset | undefined
    >(undefined),
    [sharedFormula, setSharedFormula] = useState(""),
    [strategyPanel, setStrategyPanel] = useState<StrategyPanel>("scan"),
    [busy, setBusy] = useState(false),
    [sessionError, setSessionError] = useState(""),
    [isOwner, setIsOwner] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [motionPref, setMotionPref] = useState<MotionPreference>("system"),
    [densityPref, setDensityPref] = useState<DensityPreference>("comfortable"),
    [earthQuality, setEarthQuality] = useState<EarthQualityPreference>("auto");

  const avatarTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const settingsBaseUrl = useRef("");
  const settingsLocationOpen = useRef(false);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);
  const helpAnchor = useRef<HTMLDivElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const bellAnchor = useRef<HTMLDivElement>(null);
  const bellTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!bellOpen) return;
    function dismiss(event: PointerEvent) {
      if (!bellAnchor.current?.contains(event.target as Node)) setBellOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setBellOpen(false);
      bellTrigger.current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [bellOpen]);

  useEffect(() => {
    if (!helpMenuOpen) return;
    function dismiss(event: PointerEvent) {
      if (!helpAnchor.current?.contains(event.target as Node)) setHelpMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setHelpMenuOpen(false);
      helpTrigger.current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [helpMenuOpen]);

  const selectGlobalView = useCallback(
    (next: GlobalView, sub?: IntelligenceSubView) => {
      setGlobalViewState(next);
      if (sub) setIntelligenceSubView(sub);
      const url = globalViewUrl(next, sub);
      if (window.location.pathname + window.location.search !== url) window.history.pushState(null, "", url);
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("x1-main")?.focus();
    },
    [],
  );

  const selectStrategyPanel = useCallback((panel: StrategyPanel) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "strategy");
    url.searchParams.set("panel", panel);
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    setStrategyPanel(panel);
  }, []);

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
  const sessionGeneration = useRef(0);
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
    const generation = sessionGeneration.current;
    const state = await api<WorkspaceState>("/api/x1/workspace");
    if (generation === sessionGeneration.current) setWorkspace(state);
  }, []);

  const loadMarket = useCallback(async (usePrivate: boolean) => {
    const endpoint = usePrivate
      ? "/api/x2/data?view=overview"
      : "/api/markets/public";
    return api<MarketSnapshot>(endpoint);
  }, []);

  const refreshData = useCallback(async () => {
    if (refreshLock.current) return;
    const generation = sessionGeneration.current;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const usePrivate =
        authRef.current.authenticated && authRef.current.accepted;
      let result: MarketSnapshot;
      try {
        result = await loadMarket(usePrivate);
      } catch (error) {
        if (!usePrivate) throw error;
        if (generation !== sessionGeneration.current) return;
        result = await loadMarket(false);
      }
      if (generation !== sessionGeneration.current) return;
      setData(result);
      setMarketUnavailable(false);
    } catch {
      if (generation === sessionGeneration.current) setMarketUnavailable(true);
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, [loadMarket]);

  const hydrateForSession = useCallback(
    async (session: AuthSessionResponse, aliveCheck: () => boolean) => {
      const generation = ++sessionGeneration.current;
      const isCurrent = () => aliveCheck() && generation === sessionGeneration.current;
      authRef.current = { authenticated: session.authenticated, accepted: session.accepted };
      setAuthenticated(session.authenticated);
      setAuthUser(session.user);
      setIsOwner(!!session.isOwner);
      setAccepted(session.authenticated ? session.accepted : null);
      setSessionError("");
      setMarketUnavailable(false);
      setWorkspace(null);
      setData(null);

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
        if (!isCurrent()) return;
        if (ws.status === "fulfilled") setWorkspace(ws.value);
        if (market.status === "fulfilled") setData(market.value);
        else {
          try {
            const fallback = await loadMarket(false);
            if (isCurrent()) setData(fallback);
          } catch {
            if (isCurrent()) setMarketUnavailable(true);
          }
        }
      } else {
        try {
          const pub = await loadMarket(false);
          if (isCurrent()) setData(pub);
        } catch {
          if (isCurrent()) setMarketUnavailable(true);
        }
      }
    },
    [loadMarket],
  );

  useEffect(() => {
    let alive = true;
    const syncLocation = (event?: PopStateEvent) => {
      const params = new URLSearchParams(window.location.search),
        target = params.get("view")?.toLowerCase(),
        sec = params.get("section")?.toLowerCase();
      const settings = params.get("settings");
      const isSettingsLocation = target === "settings" || settings !== null;
      const wasSettingsLocation = settingsLocationOpen.current;
      settingsLocationOpen.current = isSettingsLocation;
      setSettingsOpen(isSettingsLocation);
      if (isSettingsLocation) {
        setSettingsSection(settingsSectionFromUrl(settings ?? sec ?? null));
      } else if (settingsReturnFocus.current) {
        const trigger = settingsReturnFocus.current;
        settingsReturnFocus.current = null;
        requestAnimationFrame(() => {
          (trigger.isConnected ? trigger : helpTrigger.current)?.focus({ preventScroll: true });
        });
      }
      const base = new URL(window.location.href);
      base.searchParams.delete("settings");
      if (event && (wasSettingsLocation || isSettingsLocation) && base.href === settingsBaseUrl.current) return;
      const validId = (name: string) => {
        const id = params.get(name) ?? "";
        return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : "";
      };
      setDeepLink({ thread: validId("thread"), room: validId("room"), post: validId("post"),
        anchor: validId("anchor"), scan: validId("scan"), event: validId("event") });
      const alert = params.get("alert") ?? "";
      setSelectedAlert(/^[0-9a-f-]{36}$/i.test(alert) ? alert : "");
      if (event) {
        setSectionDrawerOpen(false);
        setAsset("");
        setAssetAlerts("");
      }
      setView(target === "strategy" ? "Strategy" : target === "community" ? "Community" : "Global");
      const rawProf = (params.get("profile") || params.get("handle") || "")
        .trim()
        .replace(/^@+/, "");
      if (target === "community" || rawProf) {
        setView("Community");
        const tab = params.get("tab")?.toLowerCase();
        setInitialProfileHandle(rawProf || null);
        if (rawProf || tab === "souls" || tab === "web") setCommunityTab("web");
        else if (tab === "rooms" || tab === "groups") setCommunityTab("groups");
        else if (tab === "chats" || validId("thread")) setCommunityTab("chats");
        else {
          try {
            const remembered = localStorage.getItem("ss-community-tab");
            setCommunityTab(remembered === "chats" || remembered === "groups" ? remembered : "web");
          } catch { setCommunityTab("web"); }
        }
      }
      if (target !== "settings") {
        setGlobalViewState(parseGlobalViewParam(sec));
        setIntelligenceSubView(parseIntelligenceSubViewParam(params.get("tab") ?? sec));
      }
      const panelParam = params.get("panel");
      if (target === "strategy") {
        setStrategyPanel(/^(lab|formula[ -]lab)$/i.test(panelParam ?? "") ? "lab" : "scan");
      } else if (panelParam) {
        setGlobalViewState(parseGlobalViewParam(panelParam));
      }
    };
    queueMicrotask(() => { if (alive) syncLocation(); });
    window.addEventListener("popstate", syncLocation);

    const initialGeneration = sessionGeneration.current;
    api<AuthSessionResponse>("/api/auth/session")
      .then((session) => {
        if (!alive || initialGeneration !== sessionGeneration.current) return;
        return hydrateForSession(session, () => alive);
      })
      .catch(async (err) => {
        if (!alive || initialGeneration !== sessionGeneration.current) return;
        setAuthenticated(false);
        setAccepted(null);
        setSessionError((err as Error).message);
        try {
          const pub = await loadMarket(false);
          if (alive && initialGeneration === sessionGeneration.current) setData(pub);
        } catch {
          /* Public feed error surfaced separately if refresh is retried. */
        }
      });

    return () => {
      alive = false;
      window.removeEventListener("popstate", syncLocation);
    };
  }, [hydrateForSession, loadMarket]);

  useEffect(() => {
    const onUnreadSynced = (event: Event) => {
      const nextCount = (event as CustomEvent<number>).detail;
      if (typeof nextCount !== "number" || !Number.isFinite(nextCount)) return;
      setAuthUser((prev) =>
        prev ? { ...prev, unreadNotifications: Math.max(0, nextCount) } : prev,
      );
    };
    window.addEventListener("ss-unread-synced", onUnreadSynced);
    return () => window.removeEventListener("ss-unread-synced", onUnreadSynced);
  }, []);

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

  function navigate(next: View, nextStrategyPanel = strategyPanel) {
    if (
      view === "Strategy" &&
      next !== view &&
      researchDirty.current &&
      !window.confirm(
        "Leave this unsaved research draft? Save it first to keep your changes.",
      )
    )
      return false;
    settingsLocationOpen.current = false;
    setSettingsOpen(false);
    setHelpMenuOpen(false);
    setQuickMenuOpen(false);
    if (next !== "Community") {
      setCommunitySavedOnly(false);
      setInitialProfileHandle(null);
      setCommunitySearch("");
    }
    if (view !== next) setDeepLink({ thread: "", room: "", post: "", anchor: "", scan: "", event: "" });
    setView(next);
    const url = new URLSearchParams({ view: next.toLowerCase() });
    if (next === "Strategy" && nextStrategyPanel === "lab") url.set("panel", "lab");
    window.history.pushState(null, "", "/?" + url);
    document.getElementById("x1-main")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
    return true;
  }

  const openSettings = useCallback((section: SettingsSection | null = null) => {
    setHelpMenuOpen(false);
    setQuickMenuOpen(false);
    if (!authRef.current.authenticated) {
      setAuthModal("signin");
      return;
    }
    settingsReturnFocus.current = helpMenuOpen
      ? helpTrigger.current
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSettingsSection(section);
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    settingsBaseUrl.current = url.href;
    url.searchParams.set("settings", section ?? "all");
    window.history.pushState({ workspaceSettings: true }, "", url);
    settingsLocationOpen.current = true;
    setSettingsOpen(true);
  }, [helpMenuOpen]);

  const closeSettings = useCallback((skipHistoryBack = false) => {
    if (!skipHistoryBack && window.history.state?.workspaceSettings) {
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("view")?.toLowerCase() === "settings") {
      url.searchParams.set("view", "global");
      url.searchParams.delete("section");
    }
    url.searchParams.delete("settings");
    window.history.replaceState(null, "", url);
    settingsLocationOpen.current = false;
    setSettingsOpen(false);
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
            legacyPrivateProfile: profile.legacyPrivateProfile,
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

  const loadNotices = useCallback(async () => {
    const viewer = authRef.current;
    if (!viewer.authenticated || !viewer.accepted) return;
    setNoticeStatus("Loading notifications…");
    try {
      const [response, requests] = await Promise.all([
        api<{ notifications: typeof notices }>("/api/notifications"),
        api<{ requests: typeof followRequests }>("/api/community/network?view=follow-requests"),
      ]);
      if (authRef.current !== viewer) return;
      setNotices(response.notifications);
      setFollowRequests(requests.requests);
      setNoticeStatus("");
    } catch (err) { if (authRef.current === viewer) setNoticeStatus((err as Error).message); }
  }, []);
  async function respondFollowRequest(handle: string, decision: "APPROVE" | "DECLINE") {
    if (noticeBusy) return;
    setNoticeBusy(true);
    try {
      await api("/api/community/network", { action: "respond-follow", handle, decision });
      setFollowRequests((items) => items.filter((item) => item.handle !== handle));
    } catch (err) { notify((err as Error).message, true); }
    finally { setNoticeBusy(false); }
  }

  async function openNotification(id: string) {
    if (noticeBusy || (view === "Strategy" && researchDirty.current &&
        !window.confirm("Leave this unsaved research draft?"))) return;
    setNoticeBusy(true);
    try {
      const response = await api<{ href: string | null; unread: number }>("/api/notifications", { id });
      if (!authRef.current.authenticated) return;
      setNotices((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
      window.dispatchEvent(new CustomEvent("ss-unread-synced", { detail: response.unread }));
      setBellOpen(false);
      if (response.href?.startsWith("/?")) {
        window.history.pushState(null, "", response.href);
        window.dispatchEvent(new PopStateEvent("popstate"));
        window.scrollTo({ top: 0 });
      } else notify("The notification target is no longer available.", true);
    } catch (err) { notify((err as Error).message, true); }
    finally { setNoticeBusy(false); }
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

  const [watchlistToggleBusy, setWatchlistToggleBusy] = useState(false);

  const primaryWatchlist =
    workspace?.records.find((r) => r.kind === "watchlist") ?? null;
  const primaryWatchlistItems = primaryWatchlist?.payload.items ?? [];

  async function toggleAssetWatchlist(instrumentId: string) {
    if (!(authenticated === true && accepted === true)) {
      setAsset("");
      setAuthModal("signin");
      return;
    }
    if (watchlistToggleBusy) return;
    setWatchlistToggleBusy(true);
    try {
      const targetList = primaryWatchlist;
      if (!targetList) {
        const created = await api<{ id: string }>("/api/x1/workspace", {
          action: "create-list",
          name: "Watchlist",
          requestId: crypto.randomUUID(),
        });
        await api("/api/x1/workspace", {
          action: "list-items",
          id: created.id,
          version: 1,
          items: [instrumentId],
        });
        await reload();
        notify("Added to Watchlist.");
        return;
      }
      const existing = targetList.payload.items ?? [];
      const has = existing.includes(instrumentId);
      const nextItems = has
        ? existing.filter((x) => x !== instrumentId)
        : [...existing, instrumentId];
      await api("/api/x1/workspace", {
        action: "list-items",
        id: targetList.id,
        version: targetList.version,
        items: nextItems,
      });
      await reload();
      notify(has ? "Removed from Watchlist." : "Saved to Watchlist.");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not update Watchlist.",
        true,
      );
    } finally {
      setWatchlistToggleBusy(false);
    }
  }

  const [initialScanWatchlist, setInitialScanWatchlist] = useState("");
  const analyze = (
    formula = "close > sma(close, 20)",
    instrumentId = "",
    universePreset?:
      | "INDIAN_EQUITIES"
      | "MCX_FUTURES"
      | "MY_WATCHLIST"
      | "ECB_DAILY"
      | "CUSTOM_CSV",
    watchlistId?: string,
  ) => {
    setInitialScanWatchlist(watchlistId ?? "");
    setInitialInstrument(instrumentId);
    setInitialFormula(formula);
    setInitialUniversePreset(universePreset);
    setStrategyPanel("scan");
    navigate("Strategy", "scan");
    setAsset("");
  };

  async function handleSignOut() {
    setBusy(true);
    try {
      await api("/api/auth/signout", {});
      const generation = ++sessionGeneration.current;
      authRef.current = { authenticated: false, accepted: false };
      setQuickMenuOpen(false);
      setAuthenticated(false);
      setAuthUser(null);
      setNotices([]);
      setFollowRequests([]);
      setAccepted(null);
      setIsOwner(false);
      setWorkspace(null);
      setData(null);
      setMarketUnavailable(false);
      setInitialProfileHandle(null);
      setCommunitySearch("");
      setSharedFormula("");
      setInitialFormula("");
      setInitialInstrument("");
      setAsset("");
      setAssetEventContext(null);
      setMobileChatActive(false);
      setBellOpen(false);
      if (settingsOpen) closeSettings();
      try {
        const publicData = await loadMarket(false);
        if (generation === sessionGeneration.current) setData(publicData);
      } catch {
        if (generation === sessionGeneration.current) setMarketUnavailable(true);
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
      icon: IconGlobal,
      detail: "Markets & your world",
    },
    {
      name: "Strategy",
      index: "02",
      icon: IconStrategy,
      detail: "Rules & Soul Scans",
    },
    {
      name: "Community",
      index: "03",
      icon: IconCommunity,
      detail: "Souls, Chats & Rooms",
    },
  ] as const;

  const isSignedIn = authenticated === true;
  const memberWorkspace = isSignedIn && accepted === true;

  return (
    <div
      className={"x1-app" + (mobileChatActive ? " is-mobile-chat-active" : "")}
      data-motion={motionPref === "minimal" ? "minimal" : "system"}
      data-density={densityPref}
    >
      {view === "Global" && globalView === "DASHBOARD" && <>
        <link rel="preload" as="image" type="image/webp" href="/eclipse-horizon-mobile.webp" media="(width < 768px)" fetchPriority="high" />
        <link rel="preload" as="image" type="image/webp" href="/eclipse-horizon.webp" media="(width >= 768px)" fetchPriority="high" />
      </>}
      <EclipseIntro
        ready={
          motionPref === "minimal" || !!sessionError || view !== "Global" || globalView !== "DASHBOARD" || !!authModal
        }
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
          {/* eslint-disable-next-line @next/next/no-img-element -- Static Cloudflare Workers brand asset; exact source bytes preserved. */}
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
        <header className={"x1-topbar x11-header x11-header-" + view.toLowerCase()}>
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
                <span className="x1-india-identity">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Static Cloudflare Workers asset. */}
                  <img src="/data/india-flag.png" alt="Flag of India" width={24} height={16} />
                  <span>Made in India<br />For India ❤️</span>
                </span>
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
            </>
          )}

          {/* STRATEGY HEADER: 3-dot Sections Drawer + Centered "Strategy Builder" (NO global search!) + bordered ? Help + Avatar */}
          {view === "Strategy" && (
            <>
              <div className="x51-topbar-left">
                <button
                  ref={drawerTriggerRef}
                  type="button"
                  className="x51-menu-btn"
                  aria-label="Open Strategy sections menu"
                  aria-haspopup="dialog"
                  aria-expanded={sectionDrawerOpen}
                  aria-controls="x53-sections-drawer"
                  onClick={() => setSectionDrawerOpen((v) => !v)}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
              <div className="x51-topbar-center">
                <h1 className="x51-topbar-title">Strategy Builder</h1>
              </div>
            </>
          )}

          {/* COMMUNITY HEADER: Body ID (@handle) Search */}
          {view === "Community" && (
            <div className="x51-topbar-search-wrap">
              <label className="x51-body-search">
                <Search size={16} aria-hidden="true" />
                <input
                  id="ss-v31-community-search"
                  name="communitySearch"
                  type="search"
                  aria-label="Search Body ID or Souls"
                  value={communitySearch}
                  onChange={(e) => setCommunitySearch(e.target.value)}
                  placeholder="Search Body ID or Soul…"
                />
              </label>
            </div>
          )}

          {/* WORKSPACE-WIDE NOTIFICATION BELL (Global, Strategy & Community) */}
          {(isSignedIn || view === "Community") && (
            <div className="x51-topbar-right">
              <div className="x51-bell-wrap" ref={bellAnchor}>
                <button
                  ref={bellTrigger}
                  type="button"
                  className="x51-bell-btn"
                  aria-label="Notifications"
                  aria-expanded={bellOpen}
                  onClick={() => {
                    const next = !bellOpen;
                    setBellOpen(next);
                    if (next) void loadNotices();
                  }}
                >
                  <Bell size={18} />
                  {(authUser?.unreadNotifications ?? 0) > 0 && (
                    <span className="x51-bell-badge">
                      {authUser?.unreadNotifications ?? 0}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <div
                    className="x51-bell-dropdown"
                    role="dialog"
                    aria-label="Notifications"
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
                    {isSignedIn && followRequests.length > 0 && <div className="x1-global-menu-group">
                      <h3>Follow requests</h3>
                      {followRequests.map(({ handle, displayName }) => <div className="x1-actions" key={handle}>
                        <span>{displayName} @{handle}</span>
                        <button type="button" disabled={noticeBusy} className="x1-text-button"
                          onClick={() => void respondFollowRequest(handle, "APPROVE")}>Approve</button>
                        <button type="button" disabled={noticeBusy} className="x1-text-button"
                          onClick={() => void respondFollowRequest(handle, "DECLINE")}>Decline</button>
                      </div>)}
                    </div>}
                    {noticeStatus ? <p role="status">{noticeStatus}</p> : isSignedIn ? (
                      notices.length ? <div className="x1-global-menu-group">
                        {notices.map((item) => <button type="button" className={"x51-drawer-item" + (item.readAt ? "" : " is-active")}
                          key={item.id} disabled={noticeBusy} onClick={() => void openNotification(item.id)}>
                          <span>{notificationLabel(item.kind)}</span> <ArrowRight size={14} aria-hidden="true" />
                        </button>)}
                      </div> : <p>No notifications.</p>
                    ) : <p>Sign in to view notifications.</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="x11-help-anchor" ref={helpAnchor}>
            <button
              ref={helpTrigger}
              type="button"
              className="x51-help-btn"
              aria-label="Help"
              aria-expanded={helpMenuOpen}
              aria-controls="x11-help-options"
              onClick={() => setHelpMenuOpen((open) => !open)}
            >?</button>
            {helpMenuOpen && (
              <div id="x11-help-options" className="x11-help-options" role="group" aria-label="Help options">
                <button type="button" onClick={() => { setHelpMenuOpen(false); setContextHelpOpen(true); }}>
                  Help &amp; Guide
                </button>
                <button type="button" onClick={() => openSettings()}>
                  {isSignedIn ? "All Settings" : "Sign in for settings"}
                </button>
                <button type="button" onClick={() => {
                  if (isSignedIn) openSettings("about");
                  else { setHelpMenuOpen(false); setContextHelpOpen("about"); }
                }}>About</button>
              </div>
            )}
          </div>

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
              isOwner={isOwner}
              displayName={authUser?.displayName}
              handle={authUser?.handle}
              avatarId={authUser?.avatarId}
              genderSymbol={authUser?.genderSymbol}
              instagramHandle={authUser?.instagramHandle}
              counts={authUser?.counts}
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
          {marketUnavailable && view === "Global" && globalView !== "DASHBOARD" && (
            <div className="x1-callout" role="status">
              <span>Market reference data could not be refreshed.</span>
              <button type="button" className="x1-text-button" onClick={() => void refreshData()} disabled={refreshing}>Retry</button>
            </div>
          )}
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
                  const generation = sessionGeneration.current;
                  setBusy(true);
                  try {
                    const f = new FormData(e.currentTarget);
                    await api("/api/consent", {
                      adult: f.get("adult") === "on",
                      privacy: f.get("privacy") === "on",
                      terms: f.get("terms") === "on",
                    });
                    if (generation !== sessionGeneration.current) return;
                    setAccepted(true);
                    await reload();
                    if (generation !== sessionGeneration.current) return;
                    const privateData = await loadMarket(true);
                    if (generation !== sessionGeneration.current) return;
                    setData(privateData);
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
              key={view + (memberWorkspace ? "-member" : "-guest")}
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
                  openAsset={(id, panel) => {
                    setAssetEventContext(null);
                    setAssetAlerts(panel === "alerts" ? id : "");
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
                  onIntelligenceSubViewChange={(sub) => selectGlobalView("INTELLIGENCE", sub)}
                  onNavigate={navigate}
                  earthQuality={earthQuality}
                  portfolioBackdrop={authUser?.portfolioBackdrop}
                  privateTickerEnabled={!!authUser?.preferences?.privateTickerEnabled}
                  privateTickerMode={authUser?.preferences?.privateTickerMode ?? "HOLDINGS"}
                  onProfileSynced={handleProfileSynced}
                  selectedAlert={selectedAlert}
                  selectedEvent={deepLink.event}
                />
              ) : view === "Strategy" ? (
                <Strategy
                  key={
                    "strategy-" +
                    initialFormula +
                    "-" +
                    initialInstrument +
                    "-" +
                    (initialUniversePreset ?? "") + initialScanWatchlist
                  }
                  data={data}
                  workspace={workspace}
                  isOwner={isOwner}
                  sessionPending={authenticated === null}
                  authenticated={isSignedIn && accepted === true}
                  onRequireAuth={() => setAuthModal("signin")}
                  reload={reload}
                  notify={notify}
                  openAsset={setAsset}
                  initialFormula={initialFormula}
                  initialInstrument={initialInstrument}
                  initialUniversePreset={initialUniversePreset}
                  initialWatchlistId={initialScanWatchlist}
                  panel={strategyPanel}
                  onPanelChange={selectStrategyPanel}
                  initialRunId={deepLink.scan}
                  onOpenCommunityWeb={() => {
                    setCommunityTab("web");
                    setCommunitySavedOnly(false);
                    setCommunityTabNonce((n) => n + 1);
                    navigate("Community");
                  }}
                  onOpenWatchlist={() => {
                    navigate("Global");
                    selectGlobalView("WATCHLISTS");
                  }}
                  share={(formula) => {
                    setSharedFormula(formula);
                    setCommunityTab("groups");
                    setCommunityTabNonce((n) => n + 1);
                    navigate("Community");
                    notify(
                      "Method ready. Open a Room to create a shared Soul.",
                    );
                  }}
                />
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
                  initialThread={deepLink.thread}
                  initialRoom={deepLink.room}
                  initialPost={deepLink.post}
                  initialAnchor={deepLink.anchor}
                  onOpenNotification={(id) => void openNotification(id)}
                  savedOnlyRequested={communitySavedOnly}
                  tabNonce={communityTabNonce}
                  onOpenSettings={openSettings}
                  onOpenAsset={setAsset}
                  onCopyToStrategy={(formula) => {
                    setInitialFormula(formula);
                    setStrategyPanel("scan");
                    navigate("Strategy", "scan");
                  }}
                  onClearSearch={() => setCommunitySearch("")}
                  onMobileChatActive={setMobileChatActive}
                  onSelectTab={setCommunityTab}
                />
              )}
            </div>
          </Suspense>
          {authenticated === false && !sessionError && (
            <div className="x1-callout x2-guest-banner">
              <span>
                Sign in to save watchlists, portfolios, scans, and shared research.
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
          {!(view === "Community" && mobileChatActive) && (
            <footer className="x1-footer">
              <span>STRATEGIC SOULS / GLOBAL VERTEX VECTORS</span>
              <p>
                Private research and education. Market views are not live order
                execution or investment advice.
              </p>
              <div>
                <a href="/trust">Privacy</a>
                <a href="/terms">Terms</a>
                <a href="/legal/compliance">Compliance</a>
                <a href="/help">Help</a>
                <button onClick={() => setAbout(true)}>About Strategic Souls</button>
              </div>
            </footer>
          )}
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
      <GoFeedbackHost />
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
          key={asset + (assetAlerts === asset ? ":alerts" : "")}
          id={asset}
          initialAlerts={assetAlerts === asset}
          data={data}
          authenticated={isSignedIn && accepted === true}
          isOwner={isOwner}
          inWatchlist={primaryWatchlistItems.includes(asset)}
          watchlistBusy={watchlistToggleBusy}
          onToggleWatchlist={(sym) => void toggleAssetWatchlist(sym)}
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
            setAssetAlerts("");
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
      {/* Workspace section navigation */}
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
                      ["scan", "Soul Scan", "Classic (50 rules) & Advanced Soul Genome"],
                      ["lab", "Formula Lab", "Correlation, BSM/IV, CAGR, XIRR & Historical"],
                    ] as const
                  ).map(([panel, label, desc]) => (
                    <button
                      key={panel}
                      type="button"
                      className={
                        "x51-drawer-item" +
                        (strategyPanel === panel ? " is-active" : "")
                      }
                      aria-current={strategyPanel === panel ? "page" : undefined}
                      onClick={() => {
                        selectStrategyPanel(panel);
                        setSectionDrawerOpen(false);
                        drawerTriggerRef.current?.focus();
                      }}
                    >
                      <span>
                        <strong>{label}</strong>
                        <small>{desc}</small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))
                : GLOBAL_MENU_ITEMS.map((group) => (
                    <section key={group.label} aria-label={group.label} className="x1-global-menu-group">
                      <h3>{group.label}</h3>
                      {group.items.map((item) => {
                        const active = globalView === item.id && (!item.sub || intelligenceSubView === item.sub);
                        return <button key={item.label} type="button"
                          className={"x51-drawer-item" + (active ? " is-active" : "")}
                          aria-current={active ? "page" : undefined}
                          onClick={() => { setSectionDrawerOpen(false); selectGlobalView(item.id, item.sub); }}>
                          <strong>{item.label}</strong>
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>;
                      })}
                    </section>
                  ))}
            </nav>
          </aside>
        </>
      )}

      {settingsOpen && authenticated !== null && (
        <Modal title="All Settings" className="x11-settings-sheet" onClose={() => closeSettings(false)}>
          {isSignedIn ? (
            <Suspense fallback={<WorkspaceSkeleton label="Opening settings…" kind="panel" />}>
              <SettingsView
                key={settingsSection ?? "all"}
                initialSection={settingsSection}
                isOwner={isOwner}
                notify={notify}
                onProfileSynced={handleProfileSynced}
                onSignOut={() => void handleSignOut()}
                onOpenNotification={(id) => { closeSettings(true); void openNotification(id); }}
                onOpenPriceAlerts={() => { closeSettings(true); if (navigate("Global")) selectGlobalView("PRICE_ALERTS"); }}
              />
            </Suspense>
          ) : (
            <div className="x1-panel">
              <p>Sign in to manage your profile, privacy and preferences.</p>
              <button type="button" className="x1-primary" onClick={() => {
                closeSettings(false);
                setAuthModal("signin");
              }}>Sign in</button>
            </div>
          )}
        </Modal>
      )}

      {/* Contextual Help & Guide */}
      {contextHelpOpen === "about" && (
        <Modal title="About Strategic Souls" onClose={() => setContextHelpOpen(false)}>
          <p>{APP_RELEASE.versionLabel} by {APP_RELEASE.organization}</p>
          <p>Read-only market research, strategy testing and community discussion.</p>
          <a href={`mailto:${APP_RELEASE.supportEmail}`}>{APP_RELEASE.supportEmail}</a>
        </Modal>
      )}
      {contextHelpOpen === true && (
        <Modal
          title={
            view === "Strategy" ? "Strategy Builder · Help & Allowances" : view === "Community" ? "Community · Help & Guide" : "Global Workspace · Help & Data Rights"
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
                  Volume — with live parameter and expression editing. 20
                  completed scans per IST civil day (00:00 IST reset).
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
                <dt>GRAVEYARD</dt>
                <dd>
                  Personal scan archive. Original formulas, cutoffs, digests,
                  and scan reviews stay preserved and immutable.
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
                <dt>8-Tile Markets Grid</dt>
                <dd>
                  Displays the 8 core instruments (NIFTY 50, SENSEX, BANK NIFTY,
                  Nifty Midcap Select, GOLD, SILVER MCX, CL Jan 2027, and USD/INR) in a balanced
                  2×4 desktop and 2-column mobile grid. Tap Reorder to arrange
                  your view.
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
            <button
              type="button"
              className="x1-secondary"
              onClick={() => {
                setContextHelpOpen(false);
                setAbout(true);
              }}
            >
              About {APP_RELEASE.productName} {APP_RELEASE.releaseTrack}
            </button>
          </div>
        </Modal>
      )}

      {about && (
        <Modal title="About Strategic Souls" onClose={() => setAbout(false)}>
          <p>
            A financial research workspace and Soul Network by{" "}
            {APP_RELEASE.organization}.
          </p>
          <dl className="x1-details">
            <div>
              <dt>Release</dt>
              <dd>{APP_RELEASE.versionLabel}</dd>
            </div>
            <div>
              <dt>Support</dt>
              <dd>
                <a href={`mailto:${APP_RELEASE.supportEmail}`}>
                  {APP_RELEASE.supportEmailDisplay}
                </a>
              </dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>
                Official ECB daily FX, US Treasury yields, USGS earthquakes,
                NASA EONET events, NASA Blue/Black Marble 3D Earth textures, and
                configured exchange feeds when entitled.
              </dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>
                Session-authenticated accounts with HttpOnly cookies, active
                session controls, and password recovery. Private portfolios,
                GRAVEYARD scans, and direct messages are never exposed publicly.
              </dd>
            </div>
            <div>
              <dt>Research</dt>
              <dd>
                Deterministic formulas evaluated strictly on completed historical
                bars. Never fabricates prices, candles, or performance claims.
              </dd>
            </div>
          </dl>
          <p>
            Payments, commercial brokerage execution, automated trade routing,
            and unverified forward probability claims remain disabled.
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
