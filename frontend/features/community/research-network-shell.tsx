"use client";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart2,
  Bookmark,
  Eye,
  Heart,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Play,
  Send,
  Share2,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type {
  PostInsightsSnapshot,
  PublicResearcherSearchItem,
  PublishedSoulCard,
} from "../../../backend/services/community/research-network";
import type { UserProfileSnapshot } from "../../../backend/services/profile/profile";
import {
  Empty,
  Modal,
  WorkspaceSkeleton,
  api,
  copyTextSafe,
  moment,
  type Notice,
} from "../../components/workspace/shared";
import {
  IconChats,
  IconRooms,
  IconSoulFeed,
} from "../../components/workspace/ss-icons";
import AvatarBadge from "../account/avatar-badge";
import type { SettingsSection } from "../account/account-quick-panel";
import PublicProfileSheet from "./public-profile-sheet";
import type { SocialView } from "./social-workspace";

const CommunityGroupsWorkspace = lazy(() => import("./dashboard"));
const SocialWorkspace = lazy(() =>
  import("./social-workspace").then((m) => ({ default: m.SocialWorkspace })),
);

type PrimaryCommunityTab = "web" | "chats" | "groups";

const COMM_TAB_STORAGE_KEY = "ss-v3-comm-tab";
const COMM_TAB_ORDER: PrimaryCommunityTab[] = ["web", "chats", "groups"];

function formatFeedTimeframe(tf: string): string {
  const lower = tf.toLowerCase();
  if (lower === "1h") return "1 Hour";
  if (lower === "1d") return "Daily";
  if (lower === "1wk") return "Weekly";
  if (lower === "1mo") return "Monthly";
  return tf;
}

/**
 * Observes card visibility (>=50% visible for >=1.2s) and records at most
 * one real post view per card per page session. Never fires for the post's author.
 */
function PostViewObserver({
  postId,
  isMine,
  recordedSet,
  onViewRecorded,
}: {
  postId: string;
  isMine: boolean;
  recordedSet: React.MutableRefObject<Set<string>>;
  onViewRecorded: (postId: string, viewCount: number) => void;
}) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isMine || recordedSet.current.has(postId)) return;
    const node = markerRef.current?.parentElement;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let dwellTimer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (dwellTimer === null && !recordedSet.current.has(postId)) {
            dwellTimer = window.setTimeout(async () => {
              if (recordedSet.current.has(postId)) return;
              recordedSet.current.add(postId);
              try {
                const res = await api<{ viewCount?: number }>(
                  "/api/community/network",
                  { action: "record-view", postId },
                );
                if (typeof res.viewCount === "number") {
                  onViewRecorded(postId, res.viewCount);
                }
              } catch {
                /* Best-effort telemetry never disrupts reading */
              }
            }, 1200);
          }
        } else if (dwellTimer !== null) {
          window.clearTimeout(dwellTimer);
          dwellTimer = null;
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(node);
    return () => {
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [postId, isMine, recordedSet, onViewRecorded]);

  return <span ref={markerRef} aria-hidden="true" style={{ display: "none" }} />;
}

type SoulComment = {
  id: string;
  postId: string;
  authorHandle: string;
  authorAvatar: string;
  text: string;
  createdAt: string;
  isMine: boolean;
};

type Props = {
  authenticated: boolean;
  onRequireAuth?: () => void;
  notify: Notice;
  sharedFormula: string;
  searchQuery: string;
  currentUser?: {
    displayName?: string;
    avatarId?: string;
    handle?: string | null;
    bio?: string;
    discoverable?: boolean;
    legacyPrivateProfile?: boolean;
    genderSymbol?: "MALE" | "FEMALE" | "HIDDEN";
    instagramHandle?: string;
    bannerPresetId?: string;
    counts?: { followers: number; following: number; publishedSouls: number };
  } | null;
  profileRevision?: number;
  initialTab?: PrimaryCommunityTab;
  initialProfileHandle?: string | null;
  savedOnlyRequested?: boolean;
  tabNonce?: number;
  onOpenSettings: (section: SettingsSection) => void;
  onProfileSynced?: (profile: UserProfileSnapshot) => void;
  onOpenAsset: (symbol: string) => void;
  onCopyToStrategy: (formula: string) => void;
  onMobileChatActive?: (active: boolean) => void;
};

export default function ResearchNetworkShell({
  authenticated,
  onRequireAuth,
  notify,
  sharedFormula,
  searchQuery,
  currentUser,
  profileRevision = 0,
  initialTab = "web",
  initialProfileHandle = null,
  savedOnlyRequested = false,
  tabNonce = 0,
  onOpenSettings,
  onProfileSynced,
  onOpenAsset,
  onCopyToStrategy,
  onMobileChatActive,
}: Props) {
  const [tab, setTab] = useState<PrimaryCommunityTab>(() => {
    if (initialTab !== "web" || tabNonce > 0) return initialTab;
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(COMM_TAB_STORAGE_KEY);
        if (saved === "web" || saved === "chats" || saved === "groups") {
          return saved;
        }
      } catch {
        /* Storage unavailable */
      }
    }
    return initialTab;
  });
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatView, setChatView] = useState<SocialView>("Messages");
  const [pendingThreadId, setPendingThreadId] = useState("");
  const [modeFilter, setModeFilter] = useState<"ALL" | "CLASSIC" | "ADVANCED">(
    "ALL",
  );
  const [tfFilter, setTfFilter] = useState("ALL");
  const [sort, setSort] = useState<"newest" | "following">("newest");
  const [savedOnly, setSavedOnly] = useState(savedOnlyRequested);

  const [posts, setPosts] = useState<PublishedSoulCard[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [myProfile, setMyProfile] = useState<UserProfileSnapshot | null>(null);
  const [legacyBannerDismissed, setLegacyBannerDismissed] = useState(false);
  const [optingPublic, setOptingPublic] = useState(false);

  // Author-only Post Insights modal
  const [insightsPost, setInsightsPost] = useState<PublishedSoulCard | null>(null);
  const [insightsData, setInsightsData] = useState<PostInsightsSnapshot | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const recordedViewsRef = useRef<Set<string>>(new Set());
  const tabRefs = useRef<Record<PrimaryCommunityTab, HTMLButtonElement | null>>({
    web: null,
    chats: null,
    groups: null,
  });

  const selectCommunityTab = useCallback((nextTab: PrimaryCommunityTab) => {
    setTab(nextTab);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(COMM_TAB_STORAGE_KEY, nextTab);
      } catch {
        /* Ignore storage restrictions */
      }
    }
  }, []);

  // Compact researcher search results
  const [researchers, setResearchers] = useState<PublicResearcherSearchItem[]>(
    [],
  );
  const [searchingResearchers, setSearchingResearchers] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const feedSeqRef = useRef(0);
  const feedAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const commentsSeqRef = useRef(0);
  const commentsAbortRef = useRef<AbortController | null>(null);

  // ONE canonical public researcher profile surface
  const [activeProfileHandle, setActiveProfileHandle] = useState<string | null>(
    initialProfileHandle ? initialProfileHandle.trim().replace(/^@+/, "").toLowerCase() : null,
  );
  const pushedProfileHistoryRef = useRef(false);

  // Comments modal
  const [discussPost, setDiscussPost] = useState<PublishedSoulCard | null>(
    null,
  );
  const [comments, setComments] = useState<SoulComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [actionBusy, setActionBusy] = useState("");

  useEffect(() => {
    if (tabNonce <= 0) return;
    queueMicrotask(() => {
      selectCommunityTab(initialTab);
      setSavedOnly(savedOnlyRequested);
    });
  }, [initialTab, savedOnlyRequested, tabNonce, selectCommunityTab]);

  // Real unread chat count badge sync (fetched on mount when signed in + updated live from SocialWorkspace)
  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => setChatUnreadCount(0));
      return;
    }
    let alive = true;
    const onUnread = (e: Event) => {
      const n = Number((e as CustomEvent<number>).detail ?? 0);
      if (alive && Number.isFinite(n)) setChatUnreadCount(Math.max(0, n));
    };
    window.addEventListener("ss-chat-unread-synced", onUnread);
    api<{ inbox?: { unread?: number }[] }>("/api/x2/social?view=home")
      .then((res) => {
        if (!alive) return;
        const total = (res.inbox ?? []).reduce(
          (sum, t) => sum + Math.max(0, Number(t.unread || 0)),
          0,
        );
        setChatUnreadCount(total);
      })
      .catch(() => {
        /* Leave badge at 0 until chats sync */
      });
    return () => {
      alive = false;
      window.removeEventListener("ss-chat-unread-synced", onUnread);
    };
  }, [authenticated]);

  const loadMyProfile = useCallback(async () => {
    if (!authenticated) {
      setMyProfile(null);
      return;
    }
    try {
      const res = await api<{ profile: UserProfileSnapshot }>("/api/profile");
      setMyProfile(res.profile);
    } catch {
      /* Session meta fallback stays active */
    }
  }, [authenticated]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadMyProfile();
    });
    return () => {
      alive = false;
    };
  }, [loadMyProfile, profileRevision]);

  const loadWebFeed = useCallback(async () => {
    feedAbortRef.current?.abort();
    const controller = new AbortController();
    feedAbortRef.current = controller;
    const seq = ++feedSeqRef.current;
    setLoadingFeed(true);
    try {
      const qs = new URLSearchParams({
        view: "web",
        mode: modeFilter,
        timeframe: tfFilter,
        sort,
      });
      if (savedOnly) qs.set("saved", "1");
      if (searchQuery.trim()) qs.set("q", searchQuery.trim());
      const res = await api<{ posts: PublishedSoulCard[] }>(
        `/api/community/network?${qs}`,
        undefined,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || seq !== feedSeqRef.current) return;
      setPosts(res.posts ?? []);
    } catch (err) {
      if (controller.signal.aborted || seq !== feedSeqRef.current) return;
      notify(
        err instanceof Error
          ? err.message
          : "Could not load Soul Feed.",
        true,
      );
    } finally {
      if (!controller.signal.aborted && seq === feedSeqRef.current) {
        setLoadingFeed(false);
      }
    }
  }, [modeFilter, tfFilter, sort, savedOnly, searchQuery, notify]);

  useEffect(() => {
    if (tab !== "web") return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadWebFeed();
    });
    return () => {
      alive = false;
      feedAbortRef.current?.abort();
    };
  }, [tab, loadWebFeed]);

  // Real debounced public researcher search — never flashes stale results or false empty states during debounce
  const trimmedSearch = searchQuery.trim().replace(/^@+/, "");
  useEffect(() => {
    searchAbortRef.current?.abort();
    if (trimmedSearch.length < 1) {
      queueMicrotask(() => {
        setResearchers([]);
        setLastSearchedQuery("");
        setSearchingResearchers(false);
      });
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const seq = ++searchSeqRef.current;
    const targetQ = trimmedSearch;
    const timer = window.setTimeout(async () => {
      if (controller.signal.aborted || seq !== searchSeqRef.current) return;
      setSearchingResearchers(true);
      try {
        const res = await api<{ researchers: PublicResearcherSearchItem[] }>(
          `/api/community/network?view=search&q=${encodeURIComponent(targetQ)}`,
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || seq !== searchSeqRef.current) return;
        setResearchers(res.researchers ?? []);
        setLastSearchedQuery(targetQ);
      } catch {
        if (controller.signal.aborted || seq !== searchSeqRef.current) return;
        setResearchers([]);
        setLastSearchedQuery(targetQ);
      } finally {
        if (!controller.signal.aborted && seq === searchSeqRef.current) {
          setSearchingResearchers(false);
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedSearch]);
  const isSearchingResearchers =
    trimmedSearch.length >= 1 &&
    (searchingResearchers || lastSearchedQuery !== trimmedSearch);
  const visibleResearchers =
    trimmedSearch.length >= 1 && lastSearchedQuery === trimmedSearch
      ? researchers
      : [];

  // Deep-link synchronization & browser Back button support for canonical PublicProfileSheet
  const openResearcherProfile = useCallback((rawHandle: string) => {
    const clean = rawHandle.trim().replace(/^@+/, "").toLowerCase();
    if (!clean) return;
    setActiveProfileHandle(clean);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("view", "community");
        url.searchParams.set("profile", clean);
        url.searchParams.delete("handle");
        window.history.pushState(
          { x54Profile: clean },
          "",
          url.pathname + url.search,
        );
        pushedProfileHistoryRef.current = true;
      } catch {
        /* Ignore history restrictions */
      }
    }
  }, []);

  const closeResearcherProfile = useCallback(() => {
    setActiveProfileHandle(null);
    if (typeof window !== "undefined") {
      if (pushedProfileHistoryRef.current) {
        pushedProfileHistoryRef.current = false;
        try {
          window.history.back();
          return;
        } catch {
          /* Fall through to replaceState */
        }
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("profile");
        url.searchParams.delete("handle");
        window.history.replaceState(null, "", url.pathname + url.search);
      } catch {
        /* Ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!initialProfileHandle) return;
    const clean = initialProfileHandle.trim().replace(/^@+/, "").toLowerCase();
    if (clean) {
      queueMicrotask(() => setActiveProfileHandle(clean));
    }
  }, [initialProfileHandle, tabNonce]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("profile") || params.get("handle");
      pushedProfileHistoryRef.current = false;
      setActiveProfileHandle(
        fromUrl ? fromUrl.trim().replace(/^@+/, "").toLowerCase() : null,
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  async function handleMessageFromProfile(targetHandle: string) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      const res = await api<{ threadId?: string }>("/api/x2/social", {
        action: "start-thread",
        handle: targetHandle,
      });
      if (res.threadId) {
        setActiveProfileHandle(null);
        pushedProfileHistoryRef.current = false;
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("profile");
          url.searchParams.delete("handle");
          window.history.replaceState(null, "", url.pathname + url.search);
        } catch {
          /* Ignore */
        }
        selectCommunityTab("chats");
        setChatView("Messages");
        setPendingThreadId(res.threadId);
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : `Could not message @${targetHandle}.`,
        true,
      );
    }
  }

  async function quickFollowFromSearch(person: PublicResearcherSearchItem) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const wantFollow = person.followState === "NONE";
    setActionBusy("follow:" + person.handle);
    try {
      const res = await api<{
        state: "NONE" | "PENDING" | "ACTIVE";
        counts?: { followers: number };
      }>("/api/community/network", {
        action: "follow",
        handle: person.handle,
        active: wantFollow,
      });
      setResearchers((prev) =>
        prev.map((r) =>
          r.handle === person.handle
            ? {
                ...r,
                followState: res.state,
                followers: res.counts?.followers ?? r.followers,
              }
            : r,
        ),
      );
      void loadMyProfile();
      notify(
        res.state === "ACTIVE"
          ? `Following @${person.handle}.`
          : res.state === "PENDING"
            ? `Follow request sent to @${person.handle}.`
            : `Unfollowed @${person.handle}.`,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Follow failed.", true);
    } finally {
      setActionBusy("");
    }
  }

  async function optInLegacyPublic() {
    if (!authenticated || optingPublic) return;
    setOptingPublic(true);
    try {
      const res = await api<{ profile: UserProfileSnapshot }>("/api/profile", {
        action: "update-preferences",
        social: { discoverable: true },
      });
      setMyProfile(res.profile);
      onProfileSynced?.(res.profile);
      notify("Your researcher profile is now publicly discoverable.");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not update profile visibility.",
        true,
      );
    } finally {
      setOptingPublic(false);
    }
  }

  async function toggleSaveSoul(post: PublishedSoulCard) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const prevSaved = post.savedByMe;
    const prevCount = post.saveCount;
    const next = !prevSaved;
    setActionBusy("save:" + post.id);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              savedByMe: next,
              saveCount: Math.max(0, prevCount + (next ? 1 : -1)),
            }
          : p,
      ),
    );
    try {
      await api("/api/community/network", {
        action: "save-soul",
        postId: post.id,
        active: next,
      });
      notify(next ? "Saved to your bookmarks." : "Removed from Saved.");
    } catch (err) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, savedByMe: prevSaved, saveCount: prevCount }
            : p,
        ),
      );
      notify(err instanceof Error ? err.message : "Could not save Soul.", true);
    } finally {
      setActionBusy("");
    }
  }

  async function toggleLikeSoul(post: PublishedSoulCard) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const prevLiked = post.likedByMe;
    const prevCount = post.likeCount;
    const next = !prevLiked;
    setActionBusy("like:" + post.id);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              likedByMe: next,
              likeCount: Math.max(0, prevCount + (next ? 1 : -1)),
            }
          : p,
      ),
    );
    try {
      const res = await api<{ liked: boolean; likeCount: number }>(
        "/api/community/network",
        {
          action: "like-post",
          postId: post.id,
          active: next,
        },
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, likedByMe: res.liked, likeCount: res.likeCount }
            : p,
        ),
      );
    } catch (err) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, likedByMe: prevLiked, likeCount: prevCount }
            : p,
        ),
      );
      notify(err instanceof Error ? err.message : "Could not update like.", true);
    } finally {
      setActionBusy("");
    }
  }

  async function shareSoul(post: PublishedSoulCard) {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/?view=community&profile=${encodeURIComponent(post.authorHandle)}`
        : "";
    let channel: "NATIVE" | "COPY" = "COPY";
    let completed = false;
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: `${post.title} — Strategic Souls`,
          text: `${post.title} by @${post.authorHandle}`,
          url: shareUrl,
        });
        channel = "NATIVE";
        completed = true;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    if (!completed) {
      const copied = await copyTextSafe(shareUrl);
      if (!copied) {
        notify("Unable to copy share link on this browser.", true);
        return;
      }
      channel = "COPY";
      completed = true;
    }
    if (!completed) return;
    try {
      const res = await api<{ shareCount?: number }>("/api/community/network", {
        action: "record-share",
        postId: post.id,
        channel,
      });
      if (typeof res.shareCount === "number") {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, shareCount: res.shareCount! } : p,
          ),
        );
      }
      notify(channel === "NATIVE" ? "Soul shared." : "Share link copied.");
    } catch {
      notify(channel === "NATIVE" ? "Soul shared." : "Share link copied.");
    }
  }

  async function openPostInsights(post: PublishedSoulCard) {
    if (!post.isMine) return;
    setInsightsPost(post);
    setInsightsData(null);
    setInsightsLoading(true);
    try {
      const res = await api<{ insights: PostInsightsSnapshot }>(
        `/api/community/network?view=insights&postId=${encodeURIComponent(post.id)}`,
      );
      setInsightsData(res.insights);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not load Post Insights.",
        true,
      );
      setInsightsPost(null);
    } finally {
      setInsightsLoading(false);
    }
  }

  const handleViewRecorded = useCallback((postId: string, viewCount: number) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, viewCount } : p)),
    );
  }, []);

  async function togglePinSoul(post: PublishedSoulCard) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setActionBusy("pin:" + post.id);
    try {
      const next = !post.pinned;
      await api("/api/community/network", {
        action: "pin-soul",
        postId: post.id,
        pinned: next,
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, pinned: next } : p)),
      );
      notify(next ? "Pinned Soul to your profile." : "Unpinned Soul.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update pin.", true);
    } finally {
      setActionBusy("");
    }
  }

  async function deletePublishedSoul(post: PublishedSoulCard) {
    if (!window.confirm(`Delete published Soul "${post.title}" from Community?`)) {
      return;
    }
    setActionBusy("del:" + post.id);
    try {
      await api("/api/community/network", {
        action: "delete-soul",
        postId: post.id,
      });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      void loadMyProfile();
      notify("Published Soul deleted. Original private Graveyard scan remains intact.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not delete Soul.", true);
    } finally {
      setActionBusy("");
    }
  }

  function tryPublishedFormula(post: PublishedSoulCard) {
    notify(`Loaded "${post.title}" by @${post.authorHandle} into Strategy Builder.`);
    onCopyToStrategy(post.formula);
  }

  async function openComments(post: PublishedSoulCard) {
    commentsAbortRef.current?.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    const seq = ++commentsSeqRef.current;
    setDiscussPost(post);
    setCommentText("");
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await api<{ comments: SoulComment[] }>(
        `/api/community/network?view=comments&postId=${encodeURIComponent(post.id)}`,
        undefined,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || seq !== commentsSeqRef.current) return;
      setComments(res.comments ?? []);
    } catch (err) {
      if (controller.signal.aborted || seq !== commentsSeqRef.current) return;
      notify(
        err instanceof Error ? err.message : "Could not load discussion.",
        true,
      );
    } finally {
      if (!controller.signal.aborted && seq === commentsSeqRef.current) {
        setCommentsLoading(false);
      }
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!discussPost || !commentText.trim() || actionBusy) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setActionBusy("comment");
    try {
      await api("/api/community/network", {
        action: "comment-soul",
        postId: discussPost.id,
        text: commentText.trim(),
        requestId: crypto.randomUUID().replaceAll("-", "_"),
      });
      setCommentText("");
      await openComments(discussPost);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === discussPost.id
            ? { ...p, commentCount: p.commentCount + 1 }
            : p,
        ),
      );
      notify("Comment posted.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not post comment.", true);
    } finally {
      setActionBusy("");
    }
  }

  const displayName =
    myProfile?.displayName ?? currentUser?.displayName ?? "Researcher";
  const handle = myProfile?.handle ?? currentUser?.handle ?? null;
  const avatarId = myProfile?.avatarId ?? currentUser?.avatarId ?? "a01";
  const counts = myProfile?.counts ??
    currentUser?.counts ?? { followers: 0, following: 0, publishedSouls: 0 };
  const isLegacyPrivate =
    authenticated &&
    !legacyBannerDismissed &&
    (myProfile?.legacyPrivateProfile ?? currentUser?.legacyPrivateProfile === true);

  return (
    <div className="x51-global-stack" style={{ gap: 12 }}>
      <header className="ss-v3-comm-header">
        <h1>Community</h1>
        <span className="x1-caption">
          Published Souls, direct chats, and private research rooms
        </span>
      </header>

      {/* 1. COMPACT MY PROFILE STRIP (tapping identity opens canonical Profile; Edit opens Settings) */}
      <div className="x54-my-strip" aria-label="Your researcher identity">
        {authenticated ? (
          <>
            <button
              type="button"
              className="x54-my-strip-main"
              onClick={() =>
                handle
                  ? openResearcherProfile(handle)
                  : onOpenSettings("profile")
              }
            >
              <AvatarBadge
                avatarId={avatarId}
                displayName={displayName}
                size={40}
                ring
              />
              <span className="x54-my-strip-text">
                <span className="x54-my-strip-name">{displayName}</span>
                <span className="x54-my-strip-sub">
                  {handle
                    ? `@${handle} · ${counts.publishedSouls} Souls · ${counts.followers} Followers`
                    : "Create your Body ID"}
                </span>
              </span>
            </button>
            <div className="x54-my-strip-actions">
              <button
                type="button"
                className="x54-strip-btn"
                aria-label={handle ? "Edit profile" : "Choose Body ID"}
                onClick={() => onOpenSettings("profile")}
              >
                <Pencil size={13} aria-hidden="true" />
                <span>{handle ? "Edit" : "Choose Body ID"}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="x54-my-strip-text">
              <span className="x54-my-strip-name">Soul Network</span>
              <span className="x54-my-strip-sub">
                Explore public Souls · Sign in to create your Body ID
              </span>
            </div>
            <button
              type="button"
              className="x54-btn-primary"
              onClick={onRequireAuth}
            >
              Sign in
            </button>
          </>
        )}
      </div>

      {/* One-time consent notice ONLY for legacy private profiles (never bulk-exposed silently!) */}
      {isLegacyPrivate && (
        <div className="x54-legacy-optin" role="region" aria-label="Legacy private profile notice">
          <span>
            Your legacy profile <strong>@{handle}</strong> stays hidden until you opt in.
            DMs, portfolios, and drafts always stay private.
          </span>
          <div className="x1-actions" style={{ gap: 6 }}>
            <button
              type="button"
              className="x54-btn-primary"
              disabled={optingPublic}
              onClick={() => void optInLegacyPublic()}
            >
              {optingPublic ? "Updating…" : "Make profile public"}
            </button>
            <button
              type="button"
              className="x54-tiny-btn"
              onClick={() => setLegacyBannerDismissed(true)}
            >
              Keep hidden
            </button>
          </div>
        </div>
      )}

      {/* 2. COMPACT RESEARCHER SEARCH RESULTS */}
      {trimmedSearch.length >= 1 && (
        <section className="x54-search-results" aria-label="Matching researchers">
          <div className="x54-search-results-head">
            <span>
              {isSearchingResearchers
                ? `Searching "${trimmedSearch}"…`
                : `Researchers (${visibleResearchers.length})`}
            </span>
          </div>
          {visibleResearchers.map((person) => (
            <div className="x54-search-row" key={person.handle}>
              <button
                type="button"
                className="x54-search-row-tap"
                onClick={() => openResearcherProfile(person.handle)}
              >
                <AvatarBadge
                  avatarId={person.avatarId}
                  displayName={person.displayName}
                  size={38}
                />
                <span className="x54-search-row-meta">
                  <strong>{person.displayName}</strong>
                  <span className="x54-search-row-handle">
                    @{person.handle} · {person.followers} followers · {person.publishedSouls} Souls
                  </span>
                </span>
              </button>
              {!person.isMe && (
                <button
                  type="button"
                  className={
                    person.followState === "NONE"
                      ? "x54-btn-primary"
                      : "x54-btn-ghost"
                  }
                  disabled={actionBusy === "follow:" + person.handle}
                  onClick={(e) => {
                    e.stopPropagation();
                    void quickFollowFromSearch(person);
                  }}
                >
                  {person.followState === "ACTIVE" ? (
                    <>
                      <UserCheck size={13} aria-hidden="true" />
                      <span>Following</span>
                    </>
                  ) : person.followState === "PENDING" ? (
                    <span>Requested</span>
                  ) : (
                    <>
                      <UserPlus size={13} aria-hidden="true" />
                      <span>Follow</span>
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
          {!isSearchingResearchers && visibleResearchers.length === 0 && (
            <div className="x54-search-row">
              <span className="x1-caption">
                No public researcher matched &ldquo;{trimmedSearch}&rdquo;.
              </span>
            </div>
          )}
        </section>
      )}

      {/* 3. ENLARGED, IMMEDIATELY DISCOVERABLE COMMUNITY TABS: SOUL FEED | CHATS | ROOMS (Sec 08.1) */}
      <div className="ss-v3-comm-tabs-wrap">
        <div
          className="ss-v3-comm-tabs"
          role="tablist"
          aria-label="Community sections"
          onKeyDown={(e) => {
            const idx = COMM_TAB_ORDER.indexOf(tab);
            if (idx < 0) return;
            let nextIdx = idx;
            if (e.key === "ArrowRight") nextIdx = (idx + 1) % COMM_TAB_ORDER.length;
            else if (e.key === "ArrowLeft")
              nextIdx = (idx - 1 + COMM_TAB_ORDER.length) % COMM_TAB_ORDER.length;
            else if (e.key === "Home") nextIdx = 0;
            else if (e.key === "End") nextIdx = COMM_TAB_ORDER.length - 1;
            else return;
            e.preventDefault();
            const nextTab = COMM_TAB_ORDER[nextIdx];
            selectCommunityTab(nextTab);
            tabRefs.current[nextTab]?.focus();
          }}
        >
          <button
            ref={(el) => {
              tabRefs.current.web = el;
            }}
            type="button"
            role="tab"
            className={"ss-v3-comm-tab" + (tab === "web" ? " is-active" : "")}
            aria-selected={tab === "web"}
            tabIndex={tab === "web" ? 0 : -1}
            onClick={() => selectCommunityTab("web")}
          >
            <span className="ss-v3-comm-tab-icon">
              <IconSoulFeed size={24} />
            </span>
            <span>Soul Feed</span>
          </button>
          <button
            ref={(el) => {
              tabRefs.current.chats = el;
            }}
            type="button"
            role="tab"
            className={"ss-v3-comm-tab" + (tab === "chats" ? " is-active" : "")}
            aria-selected={tab === "chats"}
            tabIndex={tab === "chats" ? 0 : -1}
            onClick={() => selectCommunityTab("chats")}
          >
            <span className="ss-v3-comm-tab-icon">
              <IconChats size={24} />
              {chatUnreadCount > 0 && (
                <span
                  className="ss-v3-comm-badge"
                  aria-label={`${chatUnreadCount} unread messages`}
                >
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </span>
              )}
            </span>
            <span>Chats</span>
          </button>
          <button
            ref={(el) => {
              tabRefs.current.groups = el;
            }}
            type="button"
            role="tab"
            className={"ss-v3-comm-tab" + (tab === "groups" ? " is-active" : "")}
            aria-selected={tab === "groups"}
            tabIndex={tab === "groups" ? 0 : -1}
            onClick={() => selectCommunityTab("groups")}
          >
            <span className="ss-v3-comm-tab-icon">
              <IconRooms size={24} />
            </span>
            <span>Rooms</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SOUL FEED — Published Souls Discovery Feed */}
      {tab === "web" && (
        <section aria-label="Soul Feed">
          <div className="x51-cal-toolbar x55-feed-toolbar">
            <div className="x51-chip-row" role="group" aria-label="Feed mode">
              {(["ALL", "CLASSIC", "ADVANCED"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={"x51-chip" + (modeFilter === m ? " is-active" : "")}
                  onClick={() => setModeFilter(m)}
                >
                  {m === "ALL" ? "All" : m === "CLASSIC" ? "Classic" : "Advanced"}
                </button>
              ))}
              <button
                type="button"
                className={"x51-chip" + (savedOnly ? " is-active" : "")}
                onClick={() => setSavedOnly((v) => !v)}
              >
                <Bookmark size={12} /> Saved
              </button>
            </div>
            <div className="x55-feed-selects">
              <select
                aria-label="Filter by timeframe"
                className="x55-feed-select"
                value={tfFilter}
                onChange={(e) => setTfFilter(e.target.value)}
              >
                <option value="ALL">All Timeframes</option>
                <option value="1h">1 Hour</option>
                <option value="1d">Daily</option>
                <option value="1wk">Weekly</option>
                <option value="1mo">Monthly</option>
              </select>
              <select
                aria-label="Sort Soul Feed"
                className="x55-feed-select"
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value as "newest" | "following")
                }
              >
                <option value="newest">Newest</option>
                <option value="following">Following</option>
              </select>
            </div>
          </div>

          {loadingFeed ? (
            <div className="x55-feed-skeleton" aria-busy="true" aria-label="Loading Soul Feed">
              <div className="x55-skel-card" />
              <div className="x55-skel-card" />
            </div>
          ) : posts.length === 0 ? (
            <Empty
              title={
                savedOnly
                  ? "No saved Souls yet"
                  : "No Souls match these filters."
              }
            >
              Run a scan in Strategy and tap <strong>Publish Soul</strong> to share
              transparent research in the Soul Feed.
            </Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {posts.map((post) => (
                <article key={post.id} className="x51-soul-card">
                  <PostViewObserver
                    postId={post.id}
                    isMine={post.isMine}
                    recordedSet={recordedViewsRef}
                    onViewRecorded={handleViewRecorded}
                  />
                  <div className="x51-soul-card-head">
                    <button
                      type="button"
                      className="x51-soul-author-btn"
                      onClick={() => openResearcherProfile(post.authorHandle)}
                    >
                      <AvatarBadge
                        avatarId={post.authorAvatarId}
                        size={36}
                        ring
                        alt=""
                      />
                      <div>
                        <strong style={{ fontSize: "0.9rem" }}>
                          {post.authorDisplayName}
                        </strong>
                        <div className="x1-caption">
                          @{post.authorHandle} · {moment(post.createdAt)}
                        </div>
                      </div>
                    </button>
                    <div className="x51-chip-row">
                      {post.pinned && (
                        <span className="x51-pill x51-pill-blue">Pinned</span>
                      )}
                      <span className="x51-pill x51-pill-green">
                        {post.mode === "CLASSIC" ? "Classic" : "Advanced"} ·{" "}
                        {formatFeedTimeframe(post.timeframe)}
                      </span>
                      {post.audience !== "PUBLIC" && (
                        <span className="x51-pill">{post.audience}</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>
                      {post.title}
                    </h3>
                    <p className="x1-caption" style={{ margin: 0 }}>
                      {post.summary}
                    </p>
                  </div>

                  <code className="x51-soul-formula">{post.formula}</code>

                  {post.matchedSymbols.length > 0 && (
                    <div className="x51-chip-row" aria-label="Matched instruments">
                      {post.matchedSymbols.slice(0, 10).map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          className="x51-chip"
                          onClick={() => onOpenAsset(sym.replace(/^CSV:/, ""))}
                        >
                          {sym} <ArrowUpRight size={11} />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="x1-caption">
                    {post.mode === "CLASSIC" ? "Classic" : "Advanced"} ·{" "}
                    {post.universeLabel} · {formatFeedTimeframe(post.timeframe)} ·{" "}
                    {post.matchedSymbols.length} matched · {moment(post.createdAt)}
                  </div>

                  <div className="ss-v3-post-stats" role="group" aria-label="Post actions and metrics">
                    <button
                      type="button"
                      className={
                        "ss-v3-post-stat-btn" + (post.likedByMe ? " is-liked" : "")
                      }
                      aria-pressed={post.likedByMe}
                      disabled={actionBusy === "like:" + post.id}
                      onClick={() => void toggleLikeSoul(post)}
                    >
                      <Heart
                        size={14}
                        fill={post.likedByMe ? "currentColor" : "none"}
                      />
                      <span>{post.likeCount}</span>
                    </button>
                    <button
                      type="button"
                      className="ss-v3-post-stat-btn"
                      onClick={() => void openComments(post)}
                    >
                      <MessageSquare size={14} />
                      <span>{post.commentCount}</span>
                    </button>
                    <button
                      type="button"
                      className={
                        "ss-v3-post-stat-btn" + (post.savedByMe ? " is-saved" : "")
                      }
                      aria-pressed={post.savedByMe}
                      disabled={actionBusy === "save:" + post.id}
                      onClick={() => void toggleSaveSoul(post)}
                    >
                      <Bookmark
                        size={14}
                        fill={post.savedByMe ? "currentColor" : "none"}
                      />
                      <span>{post.saveCount}</span>
                    </button>
                    <button
                      type="button"
                      className="ss-v3-post-stat-btn"
                      onClick={() => void shareSoul(post)}
                    >
                      <Share2 size={14} />
                      <span>{post.shareCount}</span>
                    </button>
                    <button
                      type="button"
                      className="ss-v3-post-stat-btn"
                      onClick={() => tryPublishedFormula(post)}
                    >
                      <Play size={13} />
                      <span>Try this formula</span>
                    </button>
                    {post.isMine && (
                      <>
                        <button
                          type="button"
                          className="ss-v3-post-stat-btn"
                          onClick={() => void openPostInsights(post)}
                        >
                          <BarChart2 size={14} />
                          <span>Insights</span>
                        </button>
                        <button
                          type="button"
                          className={
                            "ss-v3-post-stat-btn" + (post.pinned ? " is-saved" : "")
                          }
                          disabled={actionBusy === "pin:" + post.id}
                          onClick={() => void togglePinSoul(post)}
                        >
                          {post.pinned ? (
                            <PinOff size={14} />
                          ) : (
                            <Pin size={14} />
                          )}
                          <span>{post.pinned ? "Unpin" : "Pin"}</span>
                        </button>
                        <button
                          type="button"
                          className="ss-v3-post-stat-btn"
                          disabled={actionBusy === "del:" + post.id}
                          onClick={() => void deletePublishedSoul(post)}
                          aria-label={`Delete ${post.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <span className="ss-v3-post-views" title="Unique daily views (excludes author)">
                      <Eye size={14} aria-hidden="true" />
                      <span>{post.viewCount}</span>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: CHATS — Lazy-loaded Direct Messenger */}
      {tab === "chats" && (
        <section aria-label="Direct Chats">
          {authenticated ? (
            <Suspense
              fallback={<WorkspaceSkeleton label="Loading chats…" kind="panel" />}
            >
              <SocialWorkspace
                view={chatView}
                onView={setChatView}
                notify={notify}
                query={searchQuery}
                initialThreadId={pendingThreadId}
                onClearInitialThread={() => setPendingThreadId("")}
                onOpenProfile={openResearcherProfile}
                onOpenGroup={() => selectCommunityTab("groups")}
                onMobileChatActive={onMobileChatActive}
              />
            </Suspense>
          ) : (
            <Empty title="Sign in for Direct Chats">
              <button
                type="button"
                className="x54-btn-primary"
                onClick={onRequireAuth}
              >
                Sign in to access Chats
              </button>
            </Empty>
          )}
        </section>
      )}

      {/* TAB 3: ROOMS — Lazy-loaded Private Research Rooms */}
      {tab === "groups" && (
        <Suspense
          fallback={<WorkspaceSkeleton label="Loading Rooms…" kind="workspace" />}
        >
          <CommunityGroupsWorkspace
            authenticated={authenticated}
            onRequireAuth={onRequireAuth}
            notify={notify}
            sharedFormula={sharedFormula}
            currentUserAvatarId={avatarId}
            currentUserDisplayName={displayName}
            profileRevision={profileRevision}
            initialTab="rooms"
            onOpenSettings={onOpenSettings}
            onOpenProfile={openResearcherProfile}
          />
        </Suspense>
      )}

      {/* Discuss / Comments Modal — all @handles open canonical PublicProfileSheet */}
      {discussPost && (
        <Modal
          title={`Discuss · ${discussPost.title}`}
          onClose={() => setDiscussPost(null)}
        >
          <p className="x1-caption" style={{ marginTop: 0 }}>
            By{" "}
            <button
              type="button"
              className="x1-text-button"
              style={{ padding: 0, fontSize: "inherit" }}
              onClick={() => {
                const h = discussPost.authorHandle;
                setDiscussPost(null);
                openResearcherProfile(h);
              }}
            >
              @{discussPost.authorHandle}
            </button>{" "}
            · <code>{discussPost.formula}</code>
          </p>
          {commentsLoading ? (
            <p role="status">Loading discussion…</p>
          ) : comments.length === 0 ? (
            <p className="x1-caption">
              No comments yet. Share a constructive question or critique below.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 12,
              }}
            >
              {comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--x51-hairline)",
                    background: "var(--x51-surface-card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <button
                      type="button"
                      className="x1-text-button"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: 0,
                      }}
                      onClick={() => {
                        setDiscussPost(null);
                        openResearcherProfile(c.authorHandle);
                      }}
                    >
                      <AvatarBadge avatarId={c.authorAvatar} size={24} alt="" />
                      <strong style={{ fontSize: "0.84rem" }}>
                        @{c.authorHandle}
                      </strong>
                    </button>
                    <span className="x1-caption">{moment(c.createdAt)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.88rem" }}>{c.text}</p>
                </div>
              ))}
            </div>
          )}
          <form className="x1-form" onSubmit={submitComment}>
            <label>
              Add comment
              <textarea
                rows={2}
                maxLength={1000}
                required
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Ask about assumptions, coverage, or risk…"
              />
            </label>
            <button
              type="submit"
              className="x54-btn-primary"
              disabled={actionBusy === "comment" || !commentText.trim()}
            >
              <Send size={14} />
              <span>
                {actionBusy === "comment" ? "Posting…" : "Post Comment"}
              </span>
            </button>
          </form>
        </Modal>
      )}

      {/* Author-only Post Insights Modal (Sec 17.3) */}
      {insightsPost && (
        <Modal
          title={`Post Insights · ${insightsPost.title}`}
          onClose={() => {
            setInsightsPost(null);
            setInsightsData(null);
          }}
        >
          {insightsLoading ? (
            <p role="status" className="x1-caption">
              Loading post metrics…
            </p>
          ) : insightsData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <div className="x1-stat-box">
                  <span>Views</span>
                  <strong>{insightsData.views}</strong>
                </div>
                <div className="x1-stat-box">
                  <span>Likes</span>
                  <strong>{insightsData.likes}</strong>
                </div>
                <div className="x1-stat-box">
                  <span>Comments</span>
                  <strong>{insightsData.comments}</strong>
                </div>
                <div className="x1-stat-box">
                  <span>Saves</span>
                  <strong>{insightsData.saves}</strong>
                </div>
                <div className="x1-stat-box">
                  <span>Shares</span>
                  <strong>{insightsData.shares}</strong>
                </div>
                <div className="x1-stat-box">
                  <span>Engagement</span>
                  <strong>
                    {insightsData.engagementRatePct === null
                      ? "—"
                      : `${insightsData.engagementRatePct}%`}
                  </strong>
                </div>
              </div>
              <p className="x1-caption" style={{ margin: 0 }}>
                Only you can see Post Insights for your published Souls. Views are
                deduplicated per viewer per UTC day and exclude your own visits.
                Individual viewer identities are never exposed.
              </p>
            </div>
          ) : null}
        </Modal>
      )}

      {/* ONE Canonical Public Researcher Profile Surface */}
      {activeProfileHandle && (
        <PublicProfileSheet
          handle={activeProfileHandle}
          authenticated={authenticated}
          onClose={closeResearcherProfile}
          onOpenProfile={openResearcherProfile}
          onMessageUser={handleMessageFromProfile}
          onOpenSettings={() => onOpenSettings("profile")}
          onCopyToStrategy={(f) => {
            closeResearcherProfile();
            onCopyToStrategy(f);
          }}
          onRequireAuth={onRequireAuth}
          onProfileMutated={() => {
            void loadMyProfile();
            if (tab === "web") void loadWebFeed();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}
