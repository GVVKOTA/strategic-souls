"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { PublishedSoulCard } from "../../../backend/services/community/research-network";
import { resolveBannerPreset } from "../../../backend/services/profile/banners";
import type { UserProfileSnapshot } from "../../../backend/services/profile/profile";
import {
  Empty,
  Modal,
  api,
  moment,
  type Notice,
} from "../../components/workspace/shared";
import AvatarBadge from "../account/avatar-badge";
import AvatarStudio from "../account/avatar-studio";
import type { SettingsSection } from "../account/account-quick-panel";
import CommunityGroupsWorkspace from "./dashboard";
import { SocialWorkspace, type SocialView } from "./social-workspace";

type PrimaryCommunityTab = "web" | "chats" | "groups";

type PublicProfileResponse = {
  profile: {
    handle: string;
    displayName: string;
    bio: string;
    avatarId: string;
    genderSymbol: "MALE" | "FEMALE" | "HIDDEN";
    bannerPresetId: string;
    bannerPosition: "top" | "center" | "bottom";
    bannerOverlay: number;
    instagramHandle: string;
    websiteUrl: string;
    researchInterests: string[];
    discoverable: boolean;
    isMe: boolean;
    followState: "NONE" | "PENDING" | "ACTIVE";
    canMessage: boolean;
    counts: { followers: number; following: number; publishedSouls: number };
    pinnedSouls: PublishedSoulCard[];
    posts: PublishedSoulCard[];
    portfolioValueVisibility: string;
  };
};

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
    genderSymbol?: "MALE" | "FEMALE" | "HIDDEN";
    instagramHandle?: string;
    bannerPresetId?: string;
    counts?: { followers: number; following: number; publishedSouls: number };
  } | null;
  profileRevision?: number;
  initialTab?: PrimaryCommunityTab;
  savedOnlyRequested?: boolean;
  tabNonce?: number;
  onOpenSettings: (section: SettingsSection) => void;
  onProfileSynced?: (profile: UserProfileSnapshot) => void;
  onOpenAsset: (symbol: string) => void;
  onCopyToStrategy: (formula: string) => void;
};

function genderGlyph(g?: "MALE" | "FEMALE" | "HIDDEN"): string {
  if (g === "MALE") return " ♂";
  if (g === "FEMALE") return " ♀";
  return "";
}

export default function ResearchNetworkShell({
  authenticated,
  onRequireAuth,
  notify,
  sharedFormula,
  searchQuery,
  currentUser,
  profileRevision = 0,
  initialTab = "web",
  savedOnlyRequested = false,
  tabNonce = 0,
  onOpenSettings,
  onProfileSynced,
  onOpenAsset,
  onCopyToStrategy,
}: Props) {
  const [tab, setTab] = useState<PrimaryCommunityTab>(initialTab);
  const [chatView, setChatView] = useState<SocialView>("Messages");
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
  const [avatarStudioOpen, setAvatarStudioOpen] = useState(false);

  // Public researcher profile modal
  const [viewedProfile, setViewedProfile] = useState<
    PublicProfileResponse["profile"] | null
  >(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Comments drawer modal
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

  async function openResearcherProfile(rawHandle: string) {
    const clean = rawHandle.trim().replace(/^@/, "");
    if (!clean) return;
    setProfileLoading(true);
    try {
      const res = await api<PublicProfileResponse>(
        `/api/community/network?view=profile&handle=${encodeURIComponent(clean)}`,
      );
      setViewedProfile(res.profile);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : `Could not open @${clean}.`,
        true,
      );
    } finally {
      setProfileLoading(false);
    }
  }

  async function toggleFollow(handle: string, currentlyFollowingOrPending: boolean) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setActionBusy("follow:" + handle);
    try {
      const res = await api<{ ok: boolean; state: "NONE" | "PENDING" | "ACTIVE" }>(
        "/api/community/network",
        {
          action: "follow",
          handle,
          active: !currentlyFollowingOrPending,
        },
      );
      setViewedProfile((prev) =>
        prev && prev.handle === handle
          ? {
              ...prev,
              followState: res.state,
              counts: {
                ...prev.counts,
                followers:
                  res.state === "ACTIVE" && prev.followState !== "ACTIVE"
                    ? prev.counts.followers + 1
                    : res.state === "NONE" && prev.followState === "ACTIVE"
                      ? Math.max(0, prev.counts.followers - 1)
                      : prev.counts.followers,
              },
            }
          : prev,
      );
      void loadMyProfile();
      notify(
        res.state === "ACTIVE"
          ? `Following @${handle}.`
          : res.state === "PENDING"
            ? `Follow request sent to @${handle}.`
            : `Unfollowed @${handle}.`,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Follow action failed.", true);
    } finally {
      setActionBusy("");
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
      notify(next ? "Saved to your research bookmarks." : "Removed from Saved.");
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
      notify(next ? "Pinned Soul to your profile (max 3)." : "Unpinned Soul.");
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
  const genderSym =
    myProfile?.genderSymbol ?? currentUser?.genderSymbol ?? "HIDDEN";
  const bannerId =
    myProfile?.bannerPresetId ?? currentUser?.bannerPresetId ?? "b01";
  const bannerPos = myProfile?.bannerPosition ?? "center";
  const bannerOverlay = myProfile?.bannerOverlay ?? 0.55;
  const bio = myProfile?.bio ?? currentUser?.bio ?? "";
  const instagram =
    myProfile?.instagramHandle ?? currentUser?.instagramHandle ?? "";
  const website = myProfile?.websiteUrl ?? "";
  const interests = myProfile?.researchInterests ?? [];
  const counts = myProfile?.counts ??
    currentUser?.counts ?? { followers: 0, following: 0, publishedSouls: 0 };
  const bannerPreset = resolveBannerPreset(bannerId);
  const myPinnedSouls = posts.filter((p) => p.isMine && p.pinned).slice(0, 3);
  const cleanSearchHandle = searchQuery.trim().replace(/^@/, "");

  return (
    <div className="x51-global-stack">
      {/* 1. CENTERED PERSONAL PROFILE PREVIEW CARD */}
      <section className="x51-profile-hero" aria-label="Your researcher profile">
        <div
          className="x51-profile-banner"
          style={{
            background: bannerPreset.gradient,
            backgroundPosition: bannerPos,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(7, 8, 9, ${bannerOverlay * 0.55})`,
            }}
            aria-hidden="true"
          />
        </div>
        <div className="x51-profile-body">
          <div className="x51-profile-avatar-lift">
            <AvatarBadge
              avatarId={avatarId}
              size={72}
              ring
              alt={`${displayName} avatar`}
            />
          </div>

          {authenticated ? (
            <>
              <div>
                <h2 style={{ margin: "2px 0 0", fontSize: "1.18rem" }}>
                  {displayName}
                  {genderGlyph(genderSym)}
                </h2>
                <p className="x1-caption" style={{ margin: "2px 0 0" }}>
                  {handle ? `@${handle}` : "No Body ID (@handle) claimed yet"} ·
                  Private portfolio hidden
                </p>
              </div>
              {bio && (
                <p
                  className="x1-caption"
                  style={{ maxWidth: 520, margin: "2px 0 0" }}
                >
                  {bio}
                </p>
              )}
              {(instagram || website || interests.length > 0) && (
                <div
                  className="x51-chip-row"
                  style={{ justifyContent: "center" }}
                >
                  {instagram && (
                    <a
                      className="x51-pill"
                      href={`https://instagram.com/${encodeURIComponent(instagram)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      IG @{instagram} <ExternalLink size={11} />
                    </a>
                  )}
                  {website && (
                    <a
                      className="x51-pill"
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Website <ExternalLink size={11} />
                    </a>
                  )}
                  {interests.map((tag) => (
                    <span key={tag} className="x51-pill x51-pill-green">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="x51-profile-stats">
                <div>
                  <strong>{counts.followers}</strong>
                  <span>Followers</span>
                </div>
                <div>
                  <strong>{counts.following}</strong>
                  <span>Following</span>
                </div>
                <div>
                  <strong>{counts.publishedSouls}</strong>
                  <span>Published Souls</span>
                </div>
              </div>

              <div className="x1-actions" style={{ justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="x1-secondary"
                  style={{ minHeight: 38, fontSize: "0.84rem" }}
                  onClick={() => onOpenSettings("profile")}
                >
                  <Pencil size={14} />
                  <span>{handle ? "Edit Profile & Banner" : "Claim @BodyID"}</span>
                </button>
                <button
                  type="button"
                  className="x51-accent-btn"
                  style={{ minHeight: 38, fontSize: "0.84rem" }}
                  onClick={() => setAvatarStudioOpen(true)}
                >
                  <Sparkles size={14} />
                  <span>50 Avatars</span>
                </button>
              </div>

              {myPinnedSouls.length > 0 && (
                <div style={{ width: "100%", marginTop: 6, textAlign: "left" }}>
                  <p className="x1-caption" style={{ margin: "0 0 6px" }}>
                    Pinned Souls ({myPinnedSouls.length}/3)
                  </p>
                  <div className="x51-chip-row">
                    {myPinnedSouls.map((ps) => (
                      <span key={ps.id} className="x51-pill x51-pill-blue">
                        <Pin size={11} /> {ps.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 style={{ margin: "2px 0 0" }}>The Research Network</h2>
              <p className="x1-caption" style={{ maxWidth: 480, margin: 0 }}>
                Explore public research Souls from independent analysts. Sign in
                to claim your unique @BodyID, choose from 50 avatars, follow
                researchers, post Souls, and join Research Groups.
              </p>
              <button
                type="button"
                className="x51-accent-btn"
                onClick={onRequireAuth}
              >
                Sign in to claim @BodyID
              </button>
            </>
          )}
        </div>
      </section>

      {/* Body ID Quick Jump Banner when user types in Community Header search */}
      {cleanSearchHandle.length >= 2 && (
        <div
          className="x1-callout"
          style={{ justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <span>
            Searching Research Network for <strong>{searchQuery}</strong>
          </span>
          <button
            type="button"
            className="x51-accent-btn"
            style={{ minHeight: 34, fontSize: "0.82rem" }}
            disabled={profileLoading}
            onClick={() => void openResearcherProfile(cleanSearchHandle)}
          >
            {profileLoading
              ? "Looking up…"
              : `Open @${cleanSearchHandle} Profile`}
          </button>
        </div>
      )}

      {/* 2. EXACTLY THREE PRIMARY COMMUNITY TABS: WEB | CHATS | GROUPS */}
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
                  {m === "ALL" ? "All Modes" : m === "CLASSIC" ? "Classic" : "Advanced"}
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
            <div className="x1-callout">Loading Research Network Souls…</div>
          ) : posts.length === 0 ? (
            <Empty
              title={
                savedOnly
                  ? "No saved Souls yet"
                  : "No published Souls match this filter"
              }
            >
              Run a Classic or Advanced scan in Strategy Builder and tap{" "}
              <strong>Post Soul</strong> to share transparent, reproducible
              research with the network.
            </Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {posts.map((post) => (
                <article key={post.id} className="x51-soul-card">
                  <div className="x51-soul-card-head">
                    <button
                      type="button"
                      className="x51-soul-author-btn"
                      onClick={() => void openResearcherProfile(post.authorHandle)}
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
                          {genderGlyph(post.authorGenderSymbol)}
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
                      <span className="x51-pill">{post.audience}</span>
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
                    {post.sourceAttribution} · <em>{post.riskNote}</em>
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
                      <span>Make a Copy</span>
                    </button>
                    {!post.isMine && (
                      <button
                        type="button"
                        onClick={() =>
                          void openResearcherProfile(post.authorHandle)
                        }
                      >
                        <UserPlus size={14} />
                        <span>Profile / Follow</span>
                      </button>
                    )}
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

      {/* TAB 2: CHATS — 1-to-1 Direct Messages & Message Requests (Never claims E2EE) */}
      {tab === "chats" && (
        <section aria-label="Direct Chats">
          <div className="x1-callout" style={{ marginBottom: 12 }}>
            Private 1-to-1 research messaging, message requests, and Soul
            sharing. Conversations are stored server-side with account-scoped
            access controls (not end-to-end encrypted).
          </div>
          {authenticated ? (
            <SocialWorkspace
              view={chatView}
              onView={setChatView}
              notify={notify}
              query={searchQuery}
              onOpenGroup={() => setTab("groups")}
            />
          ) : (
            <Empty title="Sign in for Private Chats">
              <button
                type="button"
                className="x51-accent-btn"
                onClick={onRequireAuth}
              >
                Sign in to access Chats
              </button>
            </Empty>
          )}
        </section>
      )}

      {/* TAB 3: GROUPS — Full Collaborative Research Rooms & Directory */}
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
        />
      )}

      {/* 50-Avatar Studio Modal */}
      {avatarStudioOpen && (
        <AvatarStudio
          open={avatarStudioOpen}
          currentAvatarId={avatarId}
          displayName={displayName}
          handle={handle}
          onClose={() => setAvatarStudioOpen(false)}
          onSaved={(updatedProfile) => {
            setMyProfile(updatedProfile);
            onProfileSynced?.(updatedProfile);
            setAvatarStudioOpen(false);
            notify("Avatar updated across your profile and Research Network.");
          }}
        />
      )}

      {/* Discuss / Comments Modal */}
      {discussPost && (
        <Modal
          title={`Discuss · ${discussPost.title}`}
          onClose={() => setDiscussPost(null)}
        >
          <p className="x1-caption" style={{ marginTop: 0 }}>
            By @{discussPost.authorHandle} · <code>{discussPost.formula}</code>
          </p>
          {commentsLoading ? (
            <p role="status">Loading discussion…</p>
          ) : comments.length === 0 ? (
            <p className="x1-caption">
              No discussion notes yet. Share a constructive research critique or
              question below.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
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
                    <AvatarBadge avatarId={c.authorAvatar} size={24} alt="" />
                    <strong style={{ fontSize: "0.84rem" }}>
                      @{c.authorHandle}
                    </strong>
                    <span className="x1-caption">{moment(c.createdAt)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.88rem" }}>{c.text}</p>
                </div>
              ))}
            </div>
          )}
          <form className="x1-form" onSubmit={submitComment}>
            <label>
              Add research comment
              <textarea
                rows={2}
                maxLength={1000}
                required
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Ask about assumptions, universe coverage, or out-of-sample risk…"
              />
            </label>
            <button
              type="submit"
              className="x51-accent-btn"
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

      {/* Public Researcher Body ID Profile Sheet */}
      {viewedProfile && (
        <Modal
          title={`@${viewedProfile.handle}`}
          onClose={() => setViewedProfile(null)}
        >
          <div className="x51-profile-hero" style={{ marginBottom: 12 }}>
            <div
              className="x51-profile-banner"
              style={{
                height: 112,
                background: resolveBannerPreset(viewedProfile.bannerPresetId)
                  .gradient,
                backgroundPosition: viewedProfile.bannerPosition,
              }}
            />
            <div className="x51-profile-body">
              <div className="x51-profile-avatar-lift">
                <AvatarBadge
                  avatarId={viewedProfile.avatarId}
                  size={64}
                  ring
                  alt=""
                />
              </div>
              <h3 style={{ margin: "2px 0 0" }}>
                {viewedProfile.displayName}
                {genderGlyph(viewedProfile.genderSymbol)}
              </h3>
              <span className="x1-caption">
                @{viewedProfile.handle} · Private portfolio hidden
              </span>
              {viewedProfile.bio && (
                <p className="x1-caption" style={{ margin: 0 }}>
                  {viewedProfile.bio}
                </p>
              )}
              <div className="x51-profile-stats">
                <div>
                  <strong>{viewedProfile.counts.followers}</strong>
                  <span>Followers</span>
                </div>
                <div>
                  <strong>{viewedProfile.counts.following}</strong>
                  <span>Following</span>
                </div>
                <div>
                  <strong>{viewedProfile.counts.publishedSouls}</strong>
                  <span>Souls</span>
                </div>
              </div>
              {!viewedProfile.isMe && (
                <div className="x1-actions" style={{ justifyContent: "center" }}>
                  <button
                    type="button"
                    className={
                      viewedProfile.followState === "NONE"
                        ? "x51-accent-btn"
                        : "x1-secondary"
                    }
                    disabled={actionBusy === "follow:" + viewedProfile.handle}
                    onClick={() =>
                      void toggleFollow(
                        viewedProfile.handle,
                        viewedProfile.followState !== "NONE",
                      )
                    }
                  >
                    {viewedProfile.followState === "ACTIVE" ? (
                      <>
                        <UserCheck size={14} /> Following
                      </>
                    ) : viewedProfile.followState === "PENDING" ? (
                      <>
                        <Check size={14} /> Request Pending
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} /> Follow
                      </>
                    )}
                  </button>
                  {viewedProfile.canMessage && (
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={() => {
                        setViewedProfile(null);
                        setTab("chats");
                      }}
                    >
                      <MessageSquare size={14} /> Message
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {viewedProfile.posts.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: "0.88rem" }}>
                Published Souls ({viewedProfile.posts.length})
              </strong>
              {viewedProfile.posts.slice(0, 6).map((p) => (
                <div key={p.id} className="x51-soul-card" style={{ padding: 10 }}>
                  <strong>{p.title}</strong>
                  <code className="x51-soul-formula">{p.formula}</code>
                  <span className="x1-caption">
                    {p.mode} · {p.timeframe} · {moment(p.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="x1-caption">No visible published Souls yet.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
