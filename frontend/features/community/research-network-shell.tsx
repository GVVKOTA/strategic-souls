"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  Copy,
  Globe2,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  PublicResearcherSearchItem,
  PublishedSoulCard,
} from "../../../backend/services/community/research-network";
import type { UserProfileSnapshot } from "../../../backend/services/profile/profile";
import {
  Empty,
  Modal,
  api,
  moment,
  type Notice,
} from "../../components/workspace/shared";
import AvatarBadge from "../account/avatar-badge";
import type { SettingsSection } from "../account/account-quick-panel";
import CommunityGroupsWorkspace from "./dashboard";
import PublicProfileSheet from "./public-profile-sheet";
import { SocialWorkspace, type SocialView } from "./social-workspace";

type PrimaryCommunityTab = "web" | "chats" | "groups";

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
  const [tab, setTab] = useState<PrimaryCommunityTab>(initialTab);
  const [chatView, setChatView] = useState<SocialView>("Messages");
  const [pendingThreadId, setPendingThreadId] = useState("");
  const [modeFilter, setModeFilter] = useState<"ALL" | "CLASSIC" | "ADVANCED">(
    "ALL",
  );
  const [tfFilter, setTfFilter] = useState("ALL");
  const [sort, setSort] = useState<"newest" | "following" | "evidence">(
    "newest",
  );
  const [savedOnly, setSavedOnly] = useState(savedOnlyRequested);

  const [posts, setPosts] = useState<PublishedSoulCard[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [myProfile, setMyProfile] = useState<UserProfileSnapshot | null>(null);
  const [legacyBannerDismissed, setLegacyBannerDismissed] = useState(false);
  const [optingPublic, setOptingPublic] = useState(false);

  // Compact researcher search results
  const [researchers, setResearchers] = useState<PublicResearcherSearchItem[]>(
    [],
  );
  const [searchingResearchers, setSearchingResearchers] = useState(false);

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
      setTab(initialTab);
      setSavedOnly(savedOnlyRequested);
    });
  }, [initialTab, savedOnlyRequested, tabNonce]);

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
      );
      setPosts(res.posts ?? []);
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Could not load Community Web Souls.",
        true,
      );
    } finally {
      setLoadingFeed(false);
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
    };
  }, [tab, loadWebFeed]);

  // Real debounced public researcher search (replaces giant banner!)
  const trimmedSearch = searchQuery.trim().replace(/^@+/, "");
  useEffect(() => {
    if (trimmedSearch.length < 1) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      if (!alive) return;
      setSearchingResearchers(true);
      try {
        const res = await api<{ researchers: PublicResearcherSearchItem[] }>(
          `/api/community/network?view=search&q=${encodeURIComponent(trimmedSearch)}`,
        );
        if (alive) setResearchers(res.researchers ?? []);
      } catch {
        if (alive) setResearchers([]);
      } finally {
        if (alive) setSearchingResearchers(false);
      }
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [trimmedSearch]);
  const visibleResearchers = trimmedSearch.length >= 1 ? researchers : [];
  const isSearchingResearchers = trimmedSearch.length >= 1 && searchingResearchers;

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
        setTab("chats");
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
    setActionBusy("save:" + post.id);
    try {
      const next = !post.savedByMe;
      await api("/api/community/network", {
        action: "save-soul",
        postId: post.id,
        active: next,
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                savedByMe: next,
                saveCount: Math.max(0, p.saveCount + (next ? 1 : -1)),
              }
            : p,
        ),
      );
      notify(next ? "Saved to your bookmarks." : "Removed from Saved.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save Soul.", true);
    } finally {
      setActionBusy("");
    }
  }

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

  async function copyPublishedSoul(post: PublishedSoulCard) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setActionBusy("copy:" + post.id);
    try {
      const res = await api<{
        ok: boolean;
        attribution: string;
        definition: { formula: string };
      }>("/api/community/network", {
        action: "copy-soul",
        postId: post.id,
      });
      notify(res.attribution + " Opening in Strategy Builder.");
      onCopyToStrategy(res.definition.formula);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not copy Soul.", true);
    } finally {
      setActionBusy("");
    }
  }

  async function openComments(post: PublishedSoulCard) {
    setDiscussPost(post);
    setCommentText("");
    setCommentsLoading(true);
    try {
      const res = await api<{ comments: SoulComment[] }>(
        `/api/community/network?view=comments&postId=${encodeURIComponent(post.id)}`,
      );
      setComments(res.comments ?? []);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not load discussion.",
        true,
      );
    } finally {
      setCommentsLoading(false);
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
      {/* 1. COMPACT MY PROFILE STRIP (keeps Web | Chats | Groups near top on mobile!) */}
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
                    : "Claim your public @BodyID"}
                </span>
              </span>
            </button>
            <div className="x54-my-strip-actions">
              {handle && (
                <button
                  type="button"
                  className="x54-strip-btn"
                  onClick={() => openResearcherProfile(handle)}
                >
                  <span>Profile</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="x54-strip-btn"
                aria-label={handle ? "Edit profile" : "Set Body ID"}
                onClick={() => onOpenSettings("profile")}
              >
                <Pencil size={13} aria-hidden="true" />
                <span>{handle ? "Edit" : "Set @BodyID"}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="x54-my-strip-text">
              <span className="x54-my-strip-name">Research Network</span>
              <span className="x54-my-strip-sub">
                Explore public Souls · Sign in to claim @BodyID
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

      {/* 3. PRIMARY COMMUNITY TABS: WEB | CHATS | GROUPS */}
      <div
        className="x1-segment"
        role="tablist"
        aria-label="Community sections"
        style={{ alignSelf: "stretch" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "web"}
          onClick={() => setTab("web")}
        >
          <Globe2 size={15} />
          <span>Web</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chats"}
          onClick={() => setTab("chats")}
        >
          <MessageSquare size={15} />
          <span>Chats</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "groups"}
          onClick={() => setTab("groups")}
        >
          <Users size={15} />
          <span>Groups</span>
        </button>
      </div>

      {/* TAB 1: WEB — Published Souls Discovery Feed */}
      {tab === "web" && (
        <section aria-label="Web Souls Feed">
          <div className="x51-cal-toolbar">
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
            <div className="x51-chip-row">
              <select
                aria-label="Filter by timeframe"
                value={tfFilter}
                onChange={(e) => setTfFilter(e.target.value)}
                style={{
                  background: "var(--x51-surface-card)",
                  color: "var(--x1-text-primary)",
                  border: "1px solid var(--x51-hairline-strong)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                }}
              >
                <option value="ALL">All Timeframes</option>
                <option value="30m">30 min</option>
                <option value="1h">1 hour</option>
                <option value="1d">Daily</option>
                <option value="1wk">Weekly</option>
                <option value="1mo">Monthly</option>
              </select>
              <select
                aria-label="Sort Web Souls"
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value as "newest" | "following" | "evidence")
                }
                style={{
                  background: "var(--x51-surface-card)",
                  color: "var(--x1-text-primary)",
                  border: "1px solid var(--x51-hairline-strong)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                }}
              >
                <option value="newest">Newest</option>
                <option value="following">Following</option>
                <option value="evidence">Most Evidence</option>
              </select>
            </div>
          </div>

          {loadingFeed ? (
            <div className="x1-callout">Loading published Souls…</div>
          ) : posts.length === 0 ? (
            <Empty
              title={
                savedOnly
                  ? "No saved Souls yet"
                  : "No published Souls match this filter"
              }
            >
              Run a scan in Strategy and tap <strong>Post Soul</strong> to share
              transparent research on Community Web.
            </Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {posts.map((post) => (
                <article key={post.id} className="x51-soul-card">
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
                        {post.mode} · {post.timeframe}
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
                    <strong>{post.evidenceStatus}</strong> ·{" "}
                    {post.sourceAttribution}
                  </div>

                  <div className="x51-soul-actions">
                    <button
                      type="button"
                      className={post.savedByMe ? "is-active" : ""}
                      disabled={actionBusy === "save:" + post.id}
                      onClick={() => void toggleSaveSoul(post)}
                    >
                      <Bookmark size={14} />
                      <span>
                        {post.savedByMe ? "Saved" : "Save"} ({post.saveCount})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openComments(post)}
                    >
                      <MessageSquare size={14} />
                      <span>Discuss ({post.commentCount})</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy === "copy:" + post.id}
                      onClick={() => void copyPublishedSoul(post)}
                    >
                      <Copy size={14} />
                      <span>Copy</span>
                    </button>
                    {post.isMine && (
                      <>
                        <button
                          type="button"
                          className={post.pinned ? "is-active" : ""}
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
                          disabled={actionBusy === "del:" + post.id}
                          onClick={() => void deletePublishedSoul(post)}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: CHATS — Telegram-like Compact Messenger */}
      {tab === "chats" && (
        <section aria-label="Direct Chats">
          {authenticated ? (
            <SocialWorkspace
              view={chatView}
              onView={setChatView}
              notify={notify}
              query={searchQuery}
              initialThreadId={pendingThreadId}
              onClearInitialThread={() => setPendingThreadId("")}
              onOpenProfile={openResearcherProfile}
              onOpenGroup={() => setTab("groups")}
              onMobileChatActive={onMobileChatActive}
            />
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

      {/* TAB 3: GROUPS — Private Research Rooms */}
      {tab === "groups" && (
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
