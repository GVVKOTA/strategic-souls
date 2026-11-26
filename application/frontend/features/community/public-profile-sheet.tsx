"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Flag,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  QrCode,
  RefreshCw,
  Settings,
  ShieldBan,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { resolveBannerPreset } from "../../../backend/services/profile/banners";
import AvatarBadge from "../account/avatar-badge";
import { api, copyTextSafe, moment, type Notice } from "../../components/workspace/shared";
import { buildQrSvgString } from "../../lib/qr-svg";

export type PublicSoulItem = {
  id: string;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatarId: string;
  authorGenderSymbol: "MALE" | "FEMALE" | "HIDDEN";
  scanId: string;
  soulVersion: number;
  mode: "CLASSIC" | "ADVANCED";
  title: string;
  summary: string;
  formula: string;
  timeframe: string;
  universeLabel: string;
  matchedSymbols: string[];
  evidenceStatus: string;
  sourceAttribution: string;
  riskNote: string;
  audience: "PUBLIC" | "FOLLOWERS" | "GROUP";
  pinned: boolean;
  createdAt: string;
  saveCount: number;
  commentCount: number;
  likeCount?: number;
  likedByMe?: boolean;
  viewCount?: number;
  shareCount?: number;
  savedByMe: boolean;
  isMine: boolean;
};

export type CanonicalPublicProfile = {
  handle: string;
  displayName: string;
  bio: string;
  avatarId: string;
  stateCode?: string | null;
  stateName?: string | null;
  age: number | null;
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
  counts: {
    followers: number;
    following: number;
    publishedSouls: number;
  };
  pinnedSouls: PublicSoulItem[];
  posts: PublicSoulItem[];
  portfolioValueVisibility: "PRIVATE_HIDDEN";
};

type ConnectionPerson = {
  handle: string;
  displayName: string;
  avatarId: string;
  bio: string;
  followState: "NONE" | "PENDING" | "ACTIVE";
  isMe: boolean;
};

type Props = {
  handle: string;
  authenticated: boolean;
  onClose: () => void;
  onOpenProfile: (handle: string) => void;
  onMessageUser: (handle: string) => Promise<void> | void;
  onOpenSettings?: () => void;
  onCopyToStrategy?: (formula: string) => void;
  onRequireAuth?: () => void;
  onProfileMutated?: () => void;
  notify: Notice;
};

function genderGlyph(g?: "MALE" | "FEMALE" | "HIDDEN"): string {
  if (g === "MALE") return "♂";
  if (g === "FEMALE") return "♀";
  return "";
}

function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Canonical Public Researcher Profile surface (X5.4).
 * Opened from every permitted @BodyID tap across Search, Web feed, Comments,
 * Followers/Following lists, Notifications, Chat inbox/header, Rooms, and deep links.
 */
export default function PublicProfileSheet({
  handle,
  authenticated,
  onClose,
  onOpenProfile,
  onMessageUser,
  onOpenSettings,
  onCopyToStrategy,
  onRequireAuth,
  onProfileMutated,
  notify,
}: Props) {
  const [profile, setProfile] = useState<CanonicalPublicProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState<"souls" | "pinned" | "about">("souls");
  const [followBusy, setFollowBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("MISLEADING_CLAIM");
  const [reportNote, setReportNote] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [connectionsKind, setConnectionsKind] = useState<"followers" | "following" | null>(null);
  const [connections, setConnections] = useState<ConnectionPerson[]>([]);
  const [connectionsBusy, setConnectionsBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const profileSeqRef = useRef(0);
  const profileAbortRef = useRef<AbortController | null>(null);
  const connectionsSeqRef = useRef(0);
  const connectionsAbortRef = useRef<AbortController | null>(null);

  const normalizedHandle = handle.trim().replace(/^@+/, "").toLowerCase();

  const loadProfile = useCallback(async () => {
    profileAbortRef.current?.abort();
    connectionsAbortRef.current?.abort();
    if (!normalizedHandle) {
      setStatus("not_found");
      return;
    }
    const controller = new AbortController();
    profileAbortRef.current = controller;
    const seq = ++profileSeqRef.current;
    const requestedHandle = normalizedHandle;
    setStatus("loading");
    setErrorMsg("");
    setMenuOpen(false);
    setConfirmBlock(false);
    setConfirmDeleteId(null);
    setReportOpen(false);
    setQrOpen(false);
    setConnectionsKind(null);
    setConnections([]);
    try {
      const res = await api<{ profile: CanonicalPublicProfile }>(
        `/api/community/network?view=profile&handle=${encodeURIComponent(requestedHandle)}`,
        undefined,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || seq !== profileSeqRef.current) return;
      setProfile(res.profile);
      setStatus("ready");
      setTab("souls");
    } catch (err) {
      if (controller.signal.aborted || seq !== profileSeqRef.current) return;
      const msg = err instanceof Error ? err.message : "Could not load profile.";
      if (/not found|private|404/i.test(msg)) {
        setStatus("not_found");
      } else {
        setStatus("error");
      }
      setErrorMsg(msg);
      setProfile(null);
    }
  }, [normalizedHandle]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadProfile();
    });
    return () => {
      alive = false;
      profileAbortRef.current?.abort();
      connectionsAbortRef.current?.abort();
    };
  }, [loadProfile]);

  // Modal lifecycle: capture & restore opener focus, lock background scroll, and trap Tab focus inside sheet
  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => {
      backButtonRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) {
        try {
          prev.focus();
        } catch {
          /* Ignore unfocusable opener */
        }
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (connectionsKind) {
          setConnectionsKind(null);
        } else if (qrOpen) {
          setQrOpen(false);
        } else if (reportOpen) {
          setReportOpen(false);
        } else if (menuOpen) {
          setMenuOpen(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const container =
          (connectionsKind
            ? sheetRef.current.querySelector<HTMLElement>(".x54-connections-drawer")
            : null) ?? sheetRef.current;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !container.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectionsKind, menuOpen, onClose, qrOpen, reportOpen]);

  async function toggleFollow() {
    if (!profile || followBusy) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const wantFollow = profile.followState === "NONE";
    setFollowBusy(true);
    try {
      const res = await api<{
        state: "NONE" | "PENDING" | "ACTIVE";
        counts?: { followers: number; following: number; publishedSouls: number };
      }>("/api/community/network", {
        action: "follow",
        handle: profile.handle,
        active: wantFollow,
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              followState: res.state,
              counts: res.counts ?? prev.counts,
            }
          : prev,
      );
      notify(
        res.state === "ACTIVE"
          ? `Following @${profile.handle}.`
          : res.state === "PENDING"
            ? `Follow request sent to @${profile.handle}.`
            : `Unfollowed @${profile.handle}.`,
      );
      onProfileMutated?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Follow action failed.", true);
    } finally {
      setFollowBusy(false);
    }
  }

  async function handleStartMessage() {
    if (!profile || messageBusy) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setMessageBusy(true);
    try {
      await onMessageUser(profile.handle);
    } finally {
      setMessageBusy(false);
    }
  }

  async function openConnections(kind: "followers" | "following") {
    if (!profile) return;
    connectionsAbortRef.current?.abort();
    const controller = new AbortController();
    connectionsAbortRef.current = controller;
    const seq = ++connectionsSeqRef.current;
    const targetHandle = profile.handle;
    setConnectionsKind(kind);
    setConnectionsBusy(true);
    setConnections([]);
    try {
      const res = await api<{ profiles: ConnectionPerson[] }>(
        `/api/community/network?view=${kind}&handle=${encodeURIComponent(targetHandle)}`,
        undefined,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || seq !== connectionsSeqRef.current) return;
      setConnections(res.profiles ?? []);
    } catch (err) {
      if (controller.signal.aborted || seq !== connectionsSeqRef.current) return;
      notify(
        err instanceof Error ? err.message : `Could not load ${kind}.`,
        true,
      );
    } finally {
      if (!controller.signal.aborted && seq === connectionsSeqRef.current) {
        setConnectionsBusy(false);
      }
    }
  }

  async function handleBlock() {
    if (!profile) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      await api("/api/x2/social", {
        action: "block",
        handle: profile.handle,
        active: true,
      });
      notify(`Blocked @${profile.handle}.`);
      onProfileMutated?.();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not block account.", true);
    }
  }

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const cleanNote = reportNote.trim();
    const fullReason = cleanNote
      ? `${reportReason}: ${cleanNote}`
      : `${reportReason} — reported via profile sheet`;
    try {
      await api("/api/x2/social", {
        action: "report",
        kind: "BODY",
        targetId: profile.handle,
        reason: fullReason,
      });
      notify(`Report logged for @${profile.handle}.`);
      setReportOpen(false);
      setReportNote("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not send report.", true);
    }
  }

  async function toggleSaveSoul(post: PublicSoulItem) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      const next = !post.savedByMe;
      await api("/api/community/network", {
        action: "save-soul",
        postId: post.id,
        active: next,
      });
      setProfile((prev) => {
        if (!prev) return prev;
        const patch = (list: PublicSoulItem[]) =>
          list.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  savedByMe: next,
                  saveCount: Math.max(0, p.saveCount + (next ? 1 : -1)),
                }
              : p,
          );
        return {
          ...prev,
          posts: patch(prev.posts),
          pinnedSouls: patch(prev.pinnedSouls),
        };
      });
      notify(next ? "Saved to your Community bookmarks." : "Removed bookmark.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update save.", true);
    }
  }

  function trySoulFormula(post: PublicSoulItem) {
    notify(`Loaded "${post.title}" into Strategy Builder.`);
    onCopyToStrategy?.(post.formula);
  }

  async function togglePinSoul(post: PublicSoulItem) {
    if (!authenticated) return;
    try {
      const next = !post.pinned;
      await api("/api/community/network", {
        action: "pin-soul",
        postId: post.id,
        pinned: next,
      });
      await loadProfile();
      notify(next ? "Pinned to profile." : "Unpinned from profile.");
      onProfileMutated?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update pin.", true);
    }
  }

  async function deleteSoul(post: PublicSoulItem) {
    if (!authenticated) return;
    try {
      await api("/api/community/network", {
        action: "delete-soul",
        postId: post.id,
      });
      setConfirmDeleteId(null);
      await loadProfile();
      notify("Removed from Soul Feed (private Graveyard scan kept).");
      onProfileMutated?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not delete post.", true);
    }
  }

  const profileUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}/?view=community&profile=${encodeURIComponent(profile.handle)}`
      : "";

  const qrSvg = qrOpen && profileUrl ? (() => {
    try {
      return buildQrSvgString(profileUrl, 176);
    } catch {
      return "";
    }
  })() : "";

  async function copyProfileLink() {
    if (!profileUrl) return;
    const ok = await copyTextSafe(profileUrl);
    if (!ok) {
      notify("Unable to copy profile link on this browser.", true);
      return;
    }
    setCopiedLink(true);
    notify("Copied profile link.");
    window.setTimeout(() => setCopiedLink(false), 2000);
  }

  const banner = profile ? resolveBannerPreset(profile.bannerPresetId) : null;
  const visibleSouls =
    tab === "pinned" ? profile?.pinnedSouls ?? [] : profile?.posts ?? [];

  return (
    <div
      className="x54-profile-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={
        profile ? `${profile.displayName} (@${profile.handle}) profile` : "Researcher profile"
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="x54-profile-sheet" ref={sheetRef}>
        {/* Sticky top navigation header */}
        <header className="x54-profile-topbar">
          <button
            ref={backButtonRef}
            type="button"
            className="x54-icon-circle"
            aria-label="Close profile and go back"
            onClick={onClose}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div className="x54-profile-topbar-title">
            {profile ? `@${profile.handle}` : `@${normalizedHandle}`}
          </div>
          <div className="x54-profile-topbar-right">
            {profile?.isMe && onOpenSettings ? (
              <button
                type="button"
                className="x54-icon-circle"
                aria-label="Account and Preferences"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
              >
                <Settings size={17} aria-hidden="true" />
              </button>
            ) : profile && !profile.isMe ? (
              <div className="x54-menu-anchor">
                <button
                  type="button"
                  className="x54-icon-circle"
                  aria-label="More profile options"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="x54-dropdown-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setQrOpen(true);
                      }}
                    >
                      <QrCode size={15} aria-hidden="true" />
                      <span>Share profile</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setReportOpen(true);
                      }}
                    >
                      <Flag size={15} aria-hidden="true" />
                      <span>Report profile</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmBlock(true);
                      }}
                    >
                      <ShieldBan size={15} aria-hidden="true" />
                      <span>Block @{profile.handle}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <span style={{ width: 40 }} aria-hidden="true" />
            )}
          </div>
        </header>

        <div className="x54-profile-scroll">
          {status === "loading" && (
            <div className="x54-profile-skeleton" aria-busy="true">
              <div className="x54-skel-banner" />
              <div className="x54-skel-body">
                <div className="x54-skel-avatar" />
                <div className="x54-skel-line is-lg" />
                <div className="x54-skel-line is-sm" />
                <div className="x54-skel-stats">
                  <div className="x54-skel-box" />
                  <div className="x54-skel-box" />
                  <div className="x54-skel-box" />
                </div>
              </div>
            </div>
          )}

          {status === "not_found" && (
            <div className="x54-profile-state">
              <h3>Profile unavailable</h3>
              <p>
                <strong>@{normalizedHandle}</strong> was not found or is currently private.
              </p>
              <button type="button" className="x1-secondary" onClick={onClose}>
                Go back
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="x54-profile-state" role="alert">
              <h3>Could not load profile</h3>
              <p>{errorMsg}</p>
              <div className="x1-actions" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={() => void loadProfile()}
                >
                  <RefreshCw size={14} /> Retry
                </button>
                <button type="button" className="x1-secondary" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}

          {status === "ready" && profile && banner && (
            <>
              {/* Hero Banner + Overlapping Ringed Avatar */}
              <div
                className="x54-profile-banner"
                style={{
                  backgroundImage: banner.gradient,
                  backgroundSize: "cover",
                  backgroundPosition: profile.bannerPosition || "center",
                }}
              >
                <div
                  className="x54-profile-banner-veil"
                  style={{
                    background: banner.safeZoneScrim,
                    opacity: Math.max(
                      0.35,
                      Math.min(0.88, profile.bannerOverlay * 0.8),
                    ),
                  }}
                />
              </div>

              <div className="x54-profile-identity">
                <div className="x54-profile-avatar-row">
                  <div className="x54-profile-avatar-ring">
                    <AvatarBadge
                      avatarId={profile.avatarId}
                      displayName={profile.displayName}
                      size={82}
                    />
                  </div>
                  <div className="x54-profile-quick-actions">
                    {profile.isMe ? (
                      <>
                        {onOpenSettings && (
                          <button
                            type="button"
                            className="x54-btn-primary"
                            onClick={() => {
                              onClose();
                              onOpenSettings();
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            <span>Edit profile</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="x54-btn-ghost"
                          aria-label="Share profile QR code"
                          onClick={() => setQrOpen((v) => !v)}
                        >
                          <QrCode size={16} aria-hidden="true" />
                          <span>Share</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={
                            profile.followState === "NONE"
                              ? "x54-btn-primary"
                              : "x54-btn-ghost"
                          }
                          disabled={followBusy}
                          onClick={() => void toggleFollow()}
                        >
                          {profile.followState === "ACTIVE" ? (
                            <>
                              <UserCheck size={14} aria-hidden="true" />
                              <span>Following</span>
                            </>
                          ) : profile.followState === "PENDING" ? (
                            <>
                              <UserCheck size={14} aria-hidden="true" />
                              <span>Requested</span>
                            </>
                          ) : (
                            <>
                              <UserPlus size={14} aria-hidden="true" />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                        {profile.canMessage && (
                          <button
                            type="button"
                            className="x54-btn-ghost"
                            disabled={messageBusy}
                            onClick={() => void handleStartMessage()}
                          >
                            <MessageSquare size={14} aria-hidden="true" />
                            <span>{messageBusy ? "Opening…" : "Message"}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="x54-btn-icon"
                          aria-label="Share profile QR and link"
                          onClick={() => setQrOpen((v) => !v)}
                        >
                          <QrCode size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Name + @handle + optional opt-in details + Top-Right State Capsule */}
                <div className="x54-profile-name-block">
                  <div className="x56-profile-identity-head">
                    <div className="x56-profile-identity-main">
                      <div className="x54-profile-name-line">
                        <h2 className="x54-profile-display-name">
                          {profile.displayName}
                        </h2>
                        {genderGlyph(profile.genderSymbol) && (
                          <span
                            className="x54-profile-meta-chip"
                            aria-label={
                              profile.genderSymbol === "MALE" ? "Male" : "Female"
                            }
                          >
                            {genderGlyph(profile.genderSymbol)}
                          </span>
                        )}
                        {profile.age !== null && (
                          <span className="x54-profile-meta-chip">
                            {profile.age}y
                          </span>
                        )}
                      </div>
                      <div className="x54-profile-handle-line">
                        <span className="x54-profile-handle">
                          @{profile.handle}
                        </span>
                        {!profile.discoverable && profile.isMe && (
                          <span className="x54-profile-private-pill">
                            Legacy private
                          </span>
                        )}
                      </div>
                    </div>
                    {profile.stateCode && (
                      <span
                        className="x56-profile-state-capsule"
                        title={profile.stateName ?? profile.stateCode}
                        aria-label={`State or Union Territory: ${profile.stateName ?? profile.stateCode}`}
                      >
                        {profile.stateCode}
                      </span>
                    )}
                  </div>
                  {profile.bio && (
                    <p className="x54-profile-bio">{profile.bio}</p>
                  )}

                  {(profile.researchInterests.length > 0 ||
                    profile.instagramHandle ||
                    profile.websiteUrl) && (
                    <div className="x54-profile-tags">
                      {profile.researchInterests.map((tag) => (
                        <span key={tag} className="x54-interest-pill">
                          {tag}
                        </span>
                      ))}
                      {profile.instagramHandle && (
                        <a
                          href={`https://instagram.com/${encodeURIComponent(profile.instagramHandle)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="x54-link-pill"
                        >
                          <span>IG @{profile.instagramHandle}</span>
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      )}
                      {profile.websiteUrl && (
                        <a
                          href={profile.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="x54-link-pill"
                        >
                          <Link2 size={12} aria-hidden="true" />
                          <span>{displayDomain(profile.websiteUrl)}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Horizontal Real Stats Bar */}
                <div className="x54-profile-stats" role="group" aria-label="Profile statistics">
                  <button
                    type="button"
                    className="x54-stat-cell"
                    onClick={() => setTab("souls")}
                  >
                    <strong>{profile.counts.publishedSouls}</strong>
                    <span>Souls</span>
                  </button>
                  <button
                    type="button"
                    className="x54-stat-cell"
                    onClick={() => void openConnections("followers")}
                  >
                    <strong>{profile.counts.followers}</strong>
                    <span>Followers</span>
                  </button>
                  <button
                    type="button"
                    className="x54-stat-cell"
                    onClick={() => void openConnections("following")}
                  >
                    <strong>{profile.counts.following}</strong>
                    <span>Following</span>
                  </button>
                </div>

                {/* Inline Confirm Block / Report / QR Drawers */}
                {confirmBlock && !profile.isMe && (
                  <div className="x54-inline-panel" role="alertdialog" aria-label="Confirm block">
                    <p>
                      Block <strong>@{profile.handle}</strong>? They will be hidden
                      from your feed, search, and messages.
                    </p>
                    <div className="x1-actions">
                      <button
                        type="button"
                        className="x1-secondary"
                        onClick={() => setConfirmBlock(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="x54-btn-danger"
                        onClick={() => void handleBlock()}
                      >
                        Confirm block
                      </button>
                    </div>
                  </div>
                )}

                {reportOpen && !profile.isMe && (
                  <form className="x54-inline-panel" onSubmit={handleReportSubmit}>
                    <div className="x54-inline-panel-head">
                      <strong>Report @{profile.handle}</strong>
                      <button
                        type="button"
                        className="x54-mini-close"
                        aria-label="Cancel report"
                        onClick={() => setReportOpen(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <select
                      aria-label="Report reason"
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    >
                      <option value="MISLEADING_CLAIM">Misleading market claim</option>
                      <option value="IMPERSONATION">Impersonation</option>
                      <option value="HARASSMENT">Harassment or spam</option>
                      <option value="PRIVATE_DATA">Private data exposure</option>
                    </select>
                    <input
                      value={reportNote}
                      maxLength={280}
                      onChange={(e) => setReportNote(e.target.value)}
                      placeholder="Additional context…"
                    />
                    <div className="x1-actions">
                      <button type="submit" className="x54-btn-primary">
                        Submit report
                      </button>
                    </div>
                  </form>
                )}

                {qrOpen && (
                  <div className="x54-qr-panel">
                    <div className="x54-inline-panel-head">
                      <strong>Share @{profile.handle}</strong>
                      <button
                        type="button"
                        className="x54-mini-close"
                        aria-label="Close share panel"
                        onClick={() => setQrOpen(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {qrSvg && (
                      <div
                        className="x54-qr-frame"
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                    )}
                    <div className="x54-qr-link-row">
                      <code className="x54-qr-url">{profileUrl}</code>
                      <button
                        type="button"
                        className="x54-btn-ghost"
                        onClick={copyProfileLink}
                      >
                        {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedLink ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Content Tabs: Souls | Pinned | About */}
              <div className="x54-profile-tabs" role="tablist" aria-label="Profile sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "souls"}
                  className={"x54-profile-tab" + (tab === "souls" ? " is-active" : "")}
                  onClick={() => setTab("souls")}
                >
                  Souls ({profile.posts.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "pinned"}
                  className={"x54-profile-tab" + (tab === "pinned" ? " is-active" : "")}
                  onClick={() => setTab("pinned")}
                >
                  Pinned ({profile.pinnedSouls.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "about"}
                  className={"x54-profile-tab" + (tab === "about" ? " is-active" : "")}
                  onClick={() => setTab("about")}
                >
                  About
                </button>
              </div>

              <div className="x54-profile-tab-body">
                {(tab === "souls" || tab === "pinned") && (
                  visibleSouls.length > 0 ? (
                    <div className="x54-profile-soul-list">
                      {visibleSouls.map((post) => (
                        <article key={post.id} className="x54-profile-soul-card">
                          <div className="x54-profile-soul-top">
                            <strong>{post.title}</strong>
                            <div className="x54-profile-soul-badges">
                              {post.pinned && (
                                <span className="x54-mini-pill is-blue">Pinned</span>
                              )}
                              <span className="x54-mini-pill">
                                {post.mode} · {post.timeframe}
                              </span>
                            </div>
                          </div>
                          {post.summary && (
                            <p className="x54-profile-soul-summary">{post.summary}</p>
                          )}
                          <code className="x54-profile-soul-formula">{post.formula}</code>
                          {post.matchedSymbols.length > 0 && (
                            <div className="x54-profile-soul-symbols">
                              {post.matchedSymbols.slice(0, 6).map((sym) => (
                                <span key={sym} className="x54-sym-chip">
                                  {sym}
                                </span>
                              ))}
                              {post.matchedSymbols.length > 6 && (
                                <span className="x1-caption">
                                  +{post.matchedSymbols.length - 6} more
                                </span>
                              )}
                            </div>
                          )}
                          <div className="x54-profile-soul-foot">
                            <span className="x1-caption">
                              {moment(post.createdAt)} · {post.universeLabel} · {post.matchedSymbols.length} matched
                            </span>
                            <div className="x54-profile-soul-actions">
                              <button
                                type="button"
                                className="x54-tiny-btn"
                                onClick={() => void toggleSaveSoul(post)}
                              >
                                <Bookmark size={13} />
                                <span>{post.savedByMe ? "Saved" : "Save"} ({post.saveCount})</span>
                              </button>
                              <button
                                type="button"
                                className="x54-tiny-btn"
                                onClick={() => trySoulFormula(post)}
                              >
                                <Copy size={13} />
                                <span>Try this formula</span>
                              </button>
                              {post.isMine && (
                                <>
                                  <button
                                    type="button"
                                    className="x54-tiny-btn"
                                    onClick={() => void togglePinSoul(post)}
                                  >
                                    <Pin size={13} />
                                    <span>{post.pinned ? "Unpin" : "Pin"}</span>
                                  </button>
                                  {confirmDeleteId === post.id ? (
                                    <>
                                      <button
                                        type="button"
                                        className="x54-tiny-btn is-danger"
                                        onClick={() => void deleteSoul(post)}
                                      >
                                        Remove
                                      </button>
                                      <button
                                        type="button"
                                        className="x54-tiny-btn"
                                        onClick={() => setConfirmDeleteId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="x54-tiny-btn is-danger"
                                      aria-label={`Delete ${post.title}`}
                                      onClick={() => setConfirmDeleteId(post.id)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="x54-profile-empty">
                      <strong>
                        {tab === "pinned"
                          ? "No pinned Souls yet"
                          : "No published Souls yet"}
                      </strong>
                      <p>
                        {tab === "pinned"
                          ? profile.isMe
                            ? "Pin up to 3 published Souls from the Souls tab to highlight your core setups."
                            : `@${profile.handle} has not pinned any Souls yet.`
                          : profile.isMe
                            ? "Run a scan in Strategy and publish it to share your research methodology."
                            : `@${profile.handle} has not published public Souls yet.`}
                      </p>
                    </div>
                  )
                )}

                {tab === "about" && (
                  <div className="x54-profile-about">
                    <div className="x54-about-card">
                      <h4>Researcher Bio</h4>
                      <p>
                        {profile.bio || "No bio written yet."}
                      </p>
                    </div>
                    {profile.researchInterests.length > 0 && (
                      <div className="x54-about-card">
                        <h4>Focus Areas</h4>
                        <div className="x54-profile-tags">
                          {profile.researchInterests.map((tag) => (
                            <span key={tag} className="x54-interest-pill">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="x54-about-card">
                      <h4>Privacy Boundary</h4>
                      <p className="x1-caption" style={{ margin: 0 }}>
                        Public researcher profiles show only intentionally shared
                        identity details and published Souls. Portfolio values,
                        watchlists, Graveyard scans, email, and direct messages
                        stay strictly private.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Permitted Followers / Following Sub-Sheet */}
        {connectionsKind && profile && (
          <div
            className="x54-connections-drawer"
            role="dialog"
            aria-label={`${profile.handle} ${connectionsKind}`}
          >
            <header className="x54-profile-topbar">
              <button
                type="button"
                className="x54-icon-circle"
                aria-label="Back to profile"
                onClick={() => setConnectionsKind(null)}
              >
                <ArrowLeft size={18} />
              </button>
              <div className="x54-profile-topbar-title">
                {connectionsKind === "followers" ? "Followers" : "Following"} · @{profile.handle}
              </div>
              <span style={{ width: 40 }} aria-hidden="true" />
            </header>
            <div className="x54-connections-list">
              {connectionsBusy ? (
                <p className="x1-caption" style={{ padding: 16 }}>
                  Loading {connectionsKind}…
                </p>
              ) : connections.length === 0 ? (
                <div className="x54-profile-empty">
                  <strong>
                    No {connectionsKind} to show
                  </strong>
                  <p>
                    {connectionsKind === "followers"
                      ? `Nobody is following @${profile.handle} yet.`
                      : `@${profile.handle} is not following any public profiles yet.`}
                  </p>
                </div>
              ) : (
                connections.map((person) => (
                  <button
                    key={person.handle}
                    type="button"
                    className="x54-person-row"
                    onClick={() => {
                      setConnectionsKind(null);
                      onOpenProfile(person.handle);
                    }}
                  >
                    <AvatarBadge
                      avatarId={person.avatarId}
                      displayName={person.displayName}
                      size={42}
                    />
                    <div className="x54-person-meta">
                      <strong>{person.displayName}</strong>
                      <span className="x54-person-handle">@{person.handle}</span>
                      {person.bio && (
                        <span className="x54-person-bio">{person.bio}</span>
                      )}
                    </div>
                    {!person.isMe && person.followState === "ACTIVE" && (
                      <span className="x54-mini-pill is-blue">Following</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
