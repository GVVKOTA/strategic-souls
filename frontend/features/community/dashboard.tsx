"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Compass,
  Copy,
  Flag,
  Heart,
  History,
  Mail,
  MessageSquare,
  Pencil,
  Pin,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { compileFormula } from "../../../backend/engines/scan";
import {
  Panel,
  Empty,
  Modal,
  WorkspaceSkeleton,
  api,
  moment,
  type Notice,
} from "../../components/workspace/shared";
import AvatarBadge from "../account/avatar-badge";
import type { SettingsSection } from "../account/account-quick-panel";
import {
  SocialWorkspace,
  GroupNetworkPanel,
  type SocialView,
} from "./social-workspace";
import "./social.css";

type ResearcherProfile = {
  handle: string;
  displayName: string;
  bio: string;
  avatar: string;
};
type ResearchRoom = {
  id: string;
  name: string;
  description: string;
  role: string;
  ownerHandle: string;
};
type PublicRoomDirectoryItem = {
  id: string;
  name: string;
  description: string;
  handle: string;
  memberCount: number;
  soulCount: number;
  createdAt: string;
};
type Soul = {
  id: string;
  title: string;
  formula: string;
  summary: string;
  revision: number;
  authorHandle: string;
  state: string;
};
type Revision = {
  id: string;
  soulId: string;
  title: string;
  formula: string;
  summary: string;
  revision: number;
  authorHandle: string;
  changeNote: string;
  createdAt: string;
};
type Post = {
  id: string;
  title: string;
  formula: string;
  summary: string;
  authorHandle: string;
  authorAvatar?: string | null;
  revision: number;
  createdAt: string;
  superCount: number;
  commentCount: number;
  supered: boolean;
  hiddenAt: string | null;
};
type Comment = {
  id: string;
  postId: string;
  parentId: string | null;
  authorHandle: string;
  authorAvatar?: string | null;
  text: string;
  createdAt: string;
  isMine: boolean;
  deletedAt: string | null;
};
type CommunityState = {
  body: ResearcherProfile | null;
  groups: ResearchRoom[];
  selectedGroup: ResearchRoom | null;
  members: {
    handle: string;
    displayName: string;
    role: string;
    avatar: string;
  }[];
  souls: Soul[];
  revisions: Revision[];
  posts: Post[];
  pinnedItems?: {
    targetKind: "POST" | "SOUL";
    targetId: string;
    position: number;
    pinnedAt: string;
    pinnedByHandle: string | null;
  }[];
  comments: Comment[];
  invitations: {
    id: string;
    invitedHandle: string;
    role: string;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
  }[];
  capabilities: { canEdit: boolean; canPublish: boolean; canInvite: boolean; canPin?: boolean };
  pagination: { nextPostBefore: string | null; commentsTruncated?: boolean };
};
type Editor = {
  id?: string;
  baseRevision?: number;
  title: string;
  formula: string;
  summary: string;
  changeNote: string;
};
type PublicProfileSheet = {
  body: ResearcherProfile;
  isMe: boolean;
  canMessage: boolean;
  souls: { id: string; title: string; summary: string; groupId: string; revision: number }[];
};

type CommunityTab = "explore" | "rooms" | "saved";

const TOPIC_CHIPS = [
  { id: "all", label: "All" },
  { id: "indian", label: "Indian Stocks" },
  { id: "mcx", label: "MCX" },
  { id: "fx", label: "FX" },
  { id: "macro", label: "Macro" },
] as const;

export default function Community({
  authenticated = true,
  onRequireAuth,
  notify,
  sharedFormula,
  currentUserAvatarId,
  currentUserDisplayName,
  profileRevision = 0,
  initialTab,
  initialRoom = "",
  initialAnchor = "",
  tabNonce = 0,
  onOpenSettings,
  onOpenProfile,
}: {
  authenticated?: boolean;
  onRequireAuth?: () => void;
  notify: Notice;
  sharedFormula: string;
  currentUserAvatarId?: string | null;
  currentUserDisplayName?: string | null;
  profileRevision?: number;
  initialTab?: CommunityTab;
  initialRoom?: string;
  initialAnchor?: string;
  tabNonce?: number;
  onOpenSettings?: (section: SettingsSection) => void;
  onOpenProfile?: (handle: string) => void;
}) {
  const [tab, setTab] = useState<CommunityTab>(
    initialTab || (authenticated ? "rooms" : "explore"),
  );
  const [roomSection, setRoomSection] = useState<"research" | "discussion">(
    initialRoom && initialAnchor ? "discussion" : "research",
  );
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [publicRooms, setPublicRooms] = useState<PublicRoomDirectoryItem[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [networkQuery, setNetworkQuery] = useState("");
  const [networkShare, setNetworkShare] = useState<{
    id: string;
    revision: number;
    title: string;
  } | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfileSheet | null>(
    null,
  );
  const mutationLock = useRef(false);
  const [superFeedback, setSuperFeedback] = useState<{
    id: string;
    active: boolean;
  } | null>(null);
  const [data, setData] = useState<CommunityState | null>(null),
    [groupId, setGroupId] = useState(initialRoom),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<
      "profile" | "room" | "invite" | "join" | "members" | null
    >(null),
    [createStep, setCreateStep] = useState<1 | 2>(1),
    [createTopic, setCreateTopic] = useState("Macro & Multi-Asset"),
    [createDiscoverable, setCreateDiscoverable] = useState(false),
    [createName, setCreateName] = useState(""),
    [createDesc, setCreateDesc] = useState(""),
    [createHandle, setCreateHandle] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [revisionSoul, setRevisionSoul] = useState<Soul | null>(null),
    [inviteCode, setInviteCode] = useState(""),
    [reply, setReply] = useState<{
      postId: string;
      parentId?: string;
      label?: string;
    } | null>(null),
    [report, setReport] = useState<Post | null>(null),
    [commentEdit, setCommentEdit] = useState<Comment | null>(null),
    [publish, setPublish] = useState<Soul | null>(null),
    [cursor, setCursor] = useState(""),
    commentRetry = useRef<{ signature: string; id: string } | null>(null);

  // Sync external deep-link tab changes (e.g., "Saved Research" in AccountQuickPanel)
  useEffect(() => {
    if (!initialTab || tabNonce <= 0) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) setTab(initialTab);
    });
    return () => {
      alive = false;
    };
  }, [initialTab, tabNonce]);

  // URL params and omnibar search event
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      if (params.get("q") || params.get("handle")) {
        setNetworkQuery(params.get("q") || "");
        setTab("explore");
      }
      if (params.get("group")) {
        setGroupId(params.get("group")!);
        setTab("rooms");
      }
    });
    const searchEvent = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value === "string") {
        setNetworkQuery(value.slice(0, 80));
        setTab("explore");
      }
    };
    window.addEventListener("x2-community-search", searchEvent);
    return () => window.removeEventListener("x2-community-search", searchEvent);
  }, []);

  // Load public discoverable Research Rooms directory (works for guests & members)
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/community/public", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { rooms: [] }))
      .then((payload) => {
        const parsed = payload as { rooms?: PublicRoomDirectoryItem[] };
        if (!controller.signal.aborted && Array.isArray(parsed.rooms)) {
          setPublicRooms(parsed.rooms);
        }
      })
      .catch(() => {
        /* Directory stays empty honestly on network failure. */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPublic(false);
      });
    return () => controller.abort();
  }, [profileRevision]);

  const reload = useCallback(
    async (selected = groupId, before = cursor) => {
      if (!authenticated) return;
      setLoading(true);
      try {
        const state = await api<CommunityState>(
          "/api/x1/community" +
            (selected
              ? "?groupId=" +
                encodeURIComponent(selected) +
                (before ? "&before=" + encodeURIComponent(before) : "")
              : ""),
        );
        setData(state);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [authenticated, cursor, groupId],
  );

  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => {
        setLoading(false);
        setData(null);
        setError("");
        setTab("explore");
      });
      return;
    }
    let alive = true;
    api<CommunityState>(
      "/api/x1/community" +
        (groupId
          ? "?groupId=" +
            encodeURIComponent(groupId) +
            (cursor ? "&before=" + encodeURIComponent(cursor) : "")
          : ""),
    )
      .then((s) => {
        if (alive) {
          setData(s);
          if (!groupId && s.groups.length) setGroupId(s.groups[0].id);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authenticated, groupId, cursor, profileRevision]);

  async function mutate(
    input: Record<string, unknown>,
    success = "Saved privately.",
  ) {
    if (mutationLock.current) return null;
    mutationLock.current = true;
    setBusy(true);
    try {
      const result = await api<Record<string, unknown>>(
        input.action === "remove-member" ||
          input.action === "request-join" ||
          input.action === "group-directory"
          ? "/api/x2/social"
          : "/api/x1/community",
        input,
      );
      if (typeof result.groupId === "string") {
        setGroupId(result.groupId);
        setCursor("");
        await reload(result.groupId, "");
      } else {
        await reload();
      }
      notify(success);
      return result;
    } catch (e) {
      notify((e as Error).message, true);
      return null;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function openPublicProfile(handle: string) {
    if (onOpenProfile) {
      onOpenProfile(handle);
      return;
    }
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      const profile = await api<PublicProfileSheet>(
        `/api/x2/social?view=profile&handle=${encodeURIComponent(handle)}`,
      );
      setPublicProfile(profile);
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "This profile is private or unavailable.",
        true,
      );
    }
  }

  function openCreateRoomFlow() {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (!data?.body) {
      setModal("profile");
      return;
    }
    setCreateStep(1);
    setCreateTopic("Macro & Multi-Asset");
    setCreateDiscoverable(false);
    setCreateName("");
    setCreateDesc("");
    setCreateHandle("");
    setModal("room");
  }

  async function handleCreateRoomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    try {
      const fullDesc = createDesc.trim()
        ? `${createTopic} · ${createDesc.trim()}`
        : createTopic;
      const created = await api<{ groupId?: string }>("/api/x1/community", {
        action: "create-group",
        name: createName.trim(),
        description: fullDesc.slice(0, 500),
      });
      if (created.groupId && createDiscoverable) {
        const safeHandle = (
          createHandle.trim() ||
          createName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^[^a-z]+/, "room_")
            .slice(0, 26)
        ).padEnd(4, "0");
        try {
          await api("/api/x2/social", {
            action: "group-directory",
            groupId: created.groupId,
            handle: safeHandle,
            discoverable: true,
          });
        } catch {
          /* Room is still created privately if handle collides. */
        }
      }
      if (created.groupId) {
        setGroupId(created.groupId);
        setCursor("");
        setTab("rooms");
        await reload(created.groupId, "");
      } else {
        await reload();
      }
      setModal(null);
      notify("Research Room created.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create room.", true);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  const filteredPublicRooms = useMemo(() => {
    if (topicFilter === "all") return publicRooms;
    const matchers: Record<string, RegExp> = {
      indian: /nse|bse|india|nifty|sensex|equity|stock/i,
      mcx: /mcx|gold|crude|silver|commodity|future/i,
      fx: /fx|currency|ecb|usd|eur|inr|forex/i,
      macro: /macro|yield|treasury|rate|earth|geo|global/i,
    };
    const re = matchers[topicFilter];
    if (!re) return publicRooms;
    return publicRooms.filter((r) => re.test(`${r.name} ${r.description}`));
  }, [publicRooms, topicFilter]);

  const body = data?.body;
  const group = data?.selectedGroup;
  const joinedIds = useMemo(
    () => new Set((data?.groups ?? []).map((g) => g.id)),
    [data?.groups],
  );

  const resolveAvatarForHandle = (handle: string, fallback?: string | null) => {
    if (body && handle.toLowerCase() === body.handle.toLowerCase() && currentUserAvatarId) {
      return currentUserAvatarId;
    }
    return fallback || "a01";
  };

  return (
    <>
      <header className="x6-comm-topbar">
        <div>
          <h1 style={{ margin: 0 }}>Research Community</h1>
          <p className="x1-caption" style={{ margin: "4px 0 0" }}>
            Collaborative Research Rooms &amp; versioned Souls · Private portfolios never shared
          </p>
        </div>
        <div className="x1-actions">
          <button
            type="button"
            className="x1-primary x1-motion-button"
            onClick={openCreateRoomFlow}
          >
            <Plus size={16} />
            <span>Create Room</span>
          </button>
          {authenticated && (
            <>
              <button
                type="button"
                className="x1-secondary"
                onClick={() => setInboxOpen(true)}
              >
                <Mail size={15} />
                <span>Messages</span>
              </button>
              <button
                type="button"
                className="x1-secondary"
                onClick={() =>
                  onOpenSettings ? onOpenSettings("profile") : setModal("profile")
                }
              >
                <Settings size={15} />
                <span>{body ? `@${body.handle}` : "Set @handle"}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* EXACTLY THREE TOP-LEVEL TABS: Explore | My Rooms | Saved */}
      <nav className="x6-comm-tabs" aria-label="Community views" style={{ marginBottom: 16 }}>
        {(
          [
            ["explore", "Explore"],
            ["rooms", "My Rooms"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="x1-callout" role="alert">
          {error}
          <button className="x1-text-button" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      {/* TAB 1: EXPLORE — Guest & Member Browsable Discoverable Research Rooms + Search */}
      {tab === "explore" && (
        <>
          <Panel
            title="Discoverable Research Rooms"
            kicker="Opt-in public room directories · real rooms only"
          >
            <div className="x6-comm-chip-rail" role="group" aria-label="Filter rooms by topic">
              {TOPIC_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="x6-map-chip"
                  aria-pressed={topicFilter === c.id}
                  onClick={() => setTopicFilter(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {loadingPublic ? (
              <WorkspaceSkeleton label="Loading Research Room directory…" kind="panel" />
            ) : filteredPublicRooms.length > 0 ? (
              <div className="x6-comm-room-grid">
                {filteredPublicRooms.map((r) => {
                  const isMember = joinedIds.has(r.id);
                  return (
                    <article key={r.id} className="x6-comm-room-card">
                      <div>
                        <div className="x6-comm-room-meta">
                          <span>@{r.handle}</span>
                          <span>
                            {r.memberCount} {r.memberCount === 1 ? "member" : "members"} ·{" "}
                            {r.soulCount} {r.soulCount === 1 ? "Soul" : "Souls"}
                          </span>
                        </div>
                        <h3 style={{ marginTop: 6 }}>{r.name}</h3>
                        <p style={{ marginTop: 6 }}>
                          {r.description || "Collaborative research room."}
                        </p>
                      </div>
                      <div className="x1-actions">
                        {isMember ? (
                          <button
                            type="button"
                            className="x1-secondary"
                            onClick={() => {
                              setGroupId(r.id);
                              setTab("rooms");
                            }}
                          >
                            Open Room
                            <ArrowRight size={14} />
                          </button>
                        ) : authenticated ? (
                          <button
                            type="button"
                            className="x1-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (!body) {
                                setModal("profile");
                                return;
                              }
                              void mutate(
                                { action: "request-join", groupId: r.id },
                                "Join request sent to the room administrator.",
                              );
                            }}
                          >
                            Request to join
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="x1-secondary"
                            onClick={() => onRequireAuth?.()}
                          >
                            Sign in to join
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="No discoverable Research Rooms yet"
                action={
                  <button
                    type="button"
                    className="x1-primary x1-motion-button"
                    onClick={openCreateRoomFlow}
                  >
                    <Plus size={15} />
                    {authenticated ? "Create the first discoverable Room" : "Sign in to create a Room"}
                  </button>
                }
              >
                {topicFilter !== "all"
                  ? "No discoverable room matches this topic filter yet. Try switching to All or start a new Research Room."
                  : "Rooms stay private unless their owner opts into directory discovery. Zero placeholder rooms are invented."}
              </Empty>
            )}
          </Panel>

          {authenticated ? (
            <SocialWorkspace
              key={`${body?.handle || "new"}-${profileRevision}`}
              view="Discover"
              onView={(v: SocialView) => {
                if (v === "Messages") setInboxOpen(true);
                else if (v === "Saved") setTab("saved");
                else if (v === "Privacy" && onOpenSettings) onOpenSettings("privacy");
              }}
              notify={notify}
              query={networkQuery}
              shareSoul={networkShare}
              onClearShare={() => setNetworkShare(null)}
              onOpenProfile={(h) => void openPublicProfile(h)}
              onOpenGroup={(id) => {
                setGroupId(id);
                setCursor("");
                setTab("rooms");
              }}
            />
          ) : (
            <Panel title="Search researchers & shared Souls" kicker="Member feature">
              <Empty
                title="Sign in to search researchers & collaborate"
                action={
                  <button
                    type="button"
                    className="x1-primary x1-motion-button"
                    onClick={() => onRequireAuth?.()}
                  >
                    Sign in or create account
                    <ArrowRight size={15} />
                  </button>
                }
              >
                Signed-in members can find opt-in researchers by @handle,
                create Research Rooms, co-author versioned Souls, and exchange
                direct research messages.
              </Empty>
            </Panel>
          )}
        </>
      )}

      {/* TAB 2: MY ROOMS — Active Research Rooms + Clean Research / Discussion Tabs */}
      {tab === "rooms" && (
        <>
          {!authenticated ? (
            <Panel title="Your Research Rooms" kicker="Sign in required">
              <Empty
                title="Your research circle starts here"
                action={
                  <div className="x1-actions">
                    <button
                      type="button"
                      className="x1-primary x1-motion-button"
                      onClick={() => onRequireAuth?.()}
                    >
                      Sign in or create account
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={() => setTab("explore")}
                    >
                      <Compass size={15} />
                      Explore Rooms
                    </button>
                  </div>
                }
              >
                Create invite-only or discoverable Research Rooms to version
                Soul Scan formulas and discuss evidence without exposing private
                portfolios.
              </Empty>
            </Panel>
          ) : (
            <div className="x1-community-grid">
              <aside>
                <Panel
                  title="Your Research Rooms"
                  action={
                    <button
                      type="button"
                      className="x1-icon-button"
                      aria-label="Create Research Room"
                      onClick={openCreateRoomFlow}
                    >
                      <Plus size={17} />
                    </button>
                  }
                >
                  {!body && (
                    <div className="x1-callout" style={{ marginBottom: 12 }}>
                      <span>Set a @handle in Profile before creating or joining a Room.</span>
                      <button
                        type="button"
                        className="x1-secondary"
                        onClick={() =>
                          onOpenSettings ? onOpenSettings("profile") : setModal("profile")
                        }
                      >
                        Set @handle
                      </button>
                    </div>
                  )}
                  <div className="x1-group-list">
                    {data?.groups.map((g) => (
                      <button
                        key={g.id}
                        aria-pressed={groupId === g.id}
                        onClick={() => {
                          setLoading(true);
                          setCursor("");
                          setGroupId(g.id);
                        }}
                      >
                        <span className="x1-group-symbol">
                          <Users size={16} />
                        </span>
                        <span>
                          <strong>{g.name}</strong>
                          <small>{g.role.toLowerCase()} · Research Room</small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                  {!data?.groups.length && (
                    <p className="x1-muted">
                      No rooms joined yet. Explore discoverable rooms or create your own.
                    </p>
                  )}
                  <div className="x1-actions">
                    <button
                      type="button"
                      className="x1-text-button"
                      onClick={openCreateRoomFlow}
                    >
                      Create a Room
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="x1-text-button"
                      disabled={!body}
                      onClick={() => setModal("join")}
                    >
                      Accept invite code
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </Panel>

                <div className="x1-source-note">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Private by design</strong>
                    <p>
                      Room posts stay inside current membership. Your private
                      watchlists, portfolios, and email are never exposed.
                    </p>
                    {onOpenSettings && (
                      <button
                        type="button"
                        className="x1-text-button"
                        onClick={() => onOpenSettings("privacy")}
                      >
                        Privacy settings
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </aside>

              <div className="x1-community-main">
                {loading && !data ? (
                  <WorkspaceSkeleton label="Opening your Research Rooms…" kind="panel" />
                ) : group ? (
                  <>
                    <Panel
                      title={group.name}
                      kicker="Research Room"
                      action={
                        <button
                          type="button"
                          className="x1-secondary x1-motion-button"
                          onClick={() => setModal("members")}
                        >
                          <Users size={16} />
                          {data.members.length}{" "}
                          {data.members.length === 1 ? "member" : "members"}
                        </button>
                      }
                    >
                      <p>
                        {group.description ||
                          "A collaborative room to build and review shared research methods."}
                      </p>
                      <div className="x1-actions" style={{ marginBottom: 12 }}>
                        {data.capabilities.canEdit && (
                          <button
                            type="button"
                            className="x1-primary x1-motion-button"
                            onClick={() =>
                              setEditor({
                                title: "",
                                formula: sharedFormula || "close > sma(close, 20)",
                                summary: "",
                                changeNote: "",
                              })
                            }
                          >
                            <Plus size={16} />
                            Create shared Soul
                          </button>
                        )}
                        {data.capabilities.canInvite && (
                          <button
                            type="button"
                            className="x1-secondary x1-motion-button"
                            onClick={() => setModal("invite")}
                          >
                            Invite researcher
                            <ArrowRight size={15} />
                          </button>
                        )}
                      </div>

                      <div className="x1-segment" role="group" aria-label="Room detail sections">
                        <button
                          type="button"
                          aria-pressed={roomSection === "research"}
                          onClick={() => setRoomSection("research")}
                        >
                          Research ({data.souls.length})
                        </button>
                        <button
                          type="button"
                          aria-pressed={roomSection === "discussion"}
                          onClick={() => setRoomSection("discussion")}
                        >
                          Discussion ({data.posts.length})
                        </button>
                      </div>
                    </Panel>

                    {roomSection === "research" ? (
                      <Panel
                        title="Shared Soul Workbench"
                        kicker="Versioned hypotheses with contributor attribution"
                      >
                        {data.souls.length ? (
                          data.souls.map((s) => (
                            <article className="x1-soul-card" key={s.id}>
                              <div className="x1-panel-head">
                                <h3>{s.title}</h3>
                                <span className="x1-badge">
                                  Revision {s.revision} · {s.state}
                                </span>
                              </div>
                              <p>{s.summary}</p>
                              <code className="x1-inline-code">{s.formula}</code>
                              <p className="x1-caption">
                                Latest contribution by{" "}
                                <button
                                  type="button"
                                  className="x1-text-button"
                                  style={{ display: "inline", padding: 0 }}
                                  onClick={() => void openPublicProfile(s.authorHandle)}
                                >
                                  @{s.authorHandle}
                                </button>
                              </p>
                              <div className="x1-actions">
                                {data.capabilities.canEdit && (
                                  <button
                                    type="button"
                                    className="x1-text-button"
                                    onClick={() =>
                                      setEditor({
                                        id: s.id,
                                        baseRevision: s.revision,
                                        title: s.title,
                                        formula: s.formula,
                                        summary: s.summary,
                                        changeNote: "",
                                      })
                                    }
                                  >
                                    <Pencil size={15} />
                                    Contribute revision
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="x1-text-button"
                                  onClick={() => setRevisionSoul(s)}
                                >
                                  <History size={15} />
                                  Version history
                                </button>
                                <button
                                  type="button"
                                  className="x1-text-button"
                                  onClick={() => {
                                    setNetworkShare({
                                      id: s.id,
                                      revision: s.revision,
                                      title: s.title,
                                    });
                                    setInboxOpen(true);
                                  }}
                                >
                                  Share in message
                                </button>
                                {data.capabilities.canPublish && (
                                  <button
                                    type="button"
                                    className="x1-text-button"
                                    onClick={() => setPublish(s)}
                                  >
                                    Publish to room
                                    <ArrowUpRight size={15} />
                                  </button>
                                )}
                              </div>
                            </article>
                          ))
                        ) : (
                          <Empty
                            title="Start with the method"
                            action={
                              data.capabilities.canEdit ? (
                                <button
                                  type="button"
                                  className="x1-secondary x1-motion-button"
                                  onClick={() =>
                                    setEditor({
                                      title: "",
                                      formula:
                                        sharedFormula || "close > sma(close, 20)",
                                      summary: "",
                                      changeNote: "",
                                    })
                                  }
                                >
                                  Create a shared Soul
                                  <Plus size={16} />
                                </button>
                              ) : undefined
                            }
                          >
                            A shared Soul preserves its formula, summary,
                            revisions, and each contributor’s attribution.
                          </Empty>
                        )}
                      </Panel>
                    ) : (
                      <>
                        <Panel
                          title="Published Room Feed"
                          kicker="Peer-reviewed revisions & threaded comments"
                        >
                          {/* [29] Pinned Group Research Strip (max 3 moderator pins) */}
                          {(data.pinnedItems?.length ?? 0) > 0 && (
                            <div
                              style={{
                                marginBottom: 14,
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid var(--x51-blue-border)",
                                background: "var(--x51-blue-soft)",
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                              }}
                              aria-label="Pinned group research"
                            >
                              <strong style={{ fontSize: "0.86rem", color: "var(--x1-title-blue)" }}>
                                <Pin size={13} style={{ marginRight: 5, verticalAlign: "middle" }} />
                                Pinned Research ({data.pinnedItems!.length}/3)
                              </strong>
                              {data.pinnedItems!.map((pin) => {
                                const matchedPost = data.posts.find((p) => p.id === pin.targetId);
                                const matchedSoul = data.souls.find((s) => s.id === pin.targetId);
                                const label = matchedPost?.title ?? matchedSoul?.title ?? pin.targetId;
                                return (
                                  <div
                                    key={`${pin.targetKind}:${pin.targetId}`}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 8,
                                      fontSize: "0.84rem",
                                    }}
                                  >
                                    <span>
                                      <strong>{label}</strong>{" "}
                                      <span className="x1-caption">
                                        {pin.pinnedByHandle ? `· pinned by @${pin.pinnedByHandle}` : ""}
                                      </span>
                                    </span>
                                    {data.capabilities.canPin && (
                                      <button
                                        type="button"
                                        className="x1-text-button"
                                        disabled={busy}
                                        onClick={() =>
                                          void mutate(
                                            {
                                              action: "unpin-group-item",
                                              groupId: group.id,
                                              targetKind: pin.targetKind,
                                              targetId: pin.targetId,
                                            },
                                            "Unpinned from group.",
                                          )
                                        }
                                      >
                                        Unpin
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {data.posts.length ? (
                            data.posts.map((post) => (
                              <article
                                className={
                                  "x1-post " +
                                  (post.hiddenAt ? "x1-post-hidden" : "")
                                }
                                key={post.id}
                              >
                                <div className="x1-post-author">
                                  <button
                                    type="button"
                                    className="x6-comm-author-btn"
                                    onClick={() =>
                                      void openPublicProfile(post.authorHandle)
                                    }
                                  >
                                    <AvatarBadge
                                      avatarId={resolveAvatarForHandle(
                                        post.authorHandle,
                                        post.authorAvatar,
                                      )}
                                      size={34}
                                      ring
                                      alt=""
                                    />
                                    <div>
                                      <strong>@{post.authorHandle}</strong>
                                      <span style={{ display: "block", fontSize: 12 }}>
                                        {moment(post.createdAt)} · revision{" "}
                                        {post.revision}
                                      </span>
                                    </div>
                                  </button>
                                  <span className="x1-badge">Room only</span>
                                </div>
                                <h3>{post.title}</h3>
                                <p>{post.summary}</p>
                                <code className="x1-inline-code">
                                  {post.formula}
                                </code>
                                <div className="x1-post-actions">
                                  <button
                                    className={
                                      post.supered ? "x1-super-active" : ""
                                    }
                                    aria-pressed={post.supered}
                                    disabled={busy || !!post.hiddenAt}
                                    onClick={async () => {
                                      const confirmed = await mutate(
                                        {
                                          action: "super",
                                          postId: post.id,
                                          active: !post.supered,
                                        },
                                        post.supered
                                          ? "Super removed."
                                          : "Super saved.",
                                      );
                                      if (confirmed)
                                        setSuperFeedback({
                                          id: post.id,
                                          active: confirmed.active === true,
                                        });
                                    }}
                                  >
                                    <span
                                      className={
                                        superFeedback?.id === post.id
                                          ? superFeedback.active
                                            ? "x1-super-confirmed"
                                            : "x1-super-cleared"
                                          : ""
                                      }
                                    >
                                      <Heart
                                        size={17}
                                        fill={
                                          post.supered ? "currentColor" : "none"
                                        }
                                      />
                                    </span>
                                    {post.superCount} Super
                                    {post.superCount === 1 ? "" : "s"}
                                  </button>
                                  <button
                                    disabled={!!post.hiddenAt}
                                    onClick={() => setReply({ postId: post.id })}
                                  >
                                    <MessageSquare size={17} />
                                    {post.commentCount} comments
                                  </button>
                                  <button
                                    aria-label={"Report " + post.title}
                                    onClick={() => setReport(post)}
                                  >
                                    <Flag size={15} />
                                  </button>
                                  {data.capabilities.canPin && !post.hiddenAt && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        const isPinned = (data.pinnedItems ?? []).some(
                                          (p) => p.targetKind === "POST" && p.targetId === post.id,
                                        );
                                        void mutate(
                                          {
                                            action: isPinned
                                              ? "unpin-group-item"
                                              : "pin-group-item",
                                            groupId: group.id,
                                            targetKind: "POST",
                                            targetId: post.id,
                                          },
                                          isPinned
                                            ? "Unpinned from group."
                                            : "Pinned to top of group (max 3).",
                                        );
                                      }}
                                    >
                                      <Pin size={14} />
                                      {(data.pinnedItems ?? []).some(
                                        (p) => p.targetKind === "POST" && p.targetId === post.id,
                                      )
                                        ? "Unpin"
                                        : "Pin"}
                                    </button>
                                  )}
                                  {data.capabilities.canPublish && (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        void mutate(
                                          {
                                            action: "moderate",
                                            postId: post.id,
                                            hidden: !post.hiddenAt,
                                          },
                                          post.hiddenAt
                                            ? "Post restored."
                                            : "Post hidden from room feed.",
                                        )
                                      }
                                    >
                                      {post.hiddenAt
                                        ? "Restore post"
                                        : "Hide post"}
                                    </button>
                                  )}
                                </div>
                                <div className="x1-comments">
                                  {data.comments
                                    .filter((c) => c.postId === post.id)
                                    .map((c) => (
                                      <div
                                        key={c.id}
                                        className={
                                          "x1-comment " +
                                          (c.parentId ? "x1-comment-reply" : "")
                                        }
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <button
                                            type="button"
                                            className="x6-comm-author-btn"
                                            onClick={() =>
                                              void openPublicProfile(c.authorHandle)
                                            }
                                          >
                                            <AvatarBadge
                                              avatarId={resolveAvatarForHandle(
                                                c.authorHandle,
                                                c.authorAvatar,
                                              )}
                                              size={24}
                                              alt=""
                                            />
                                            <strong>@{c.authorHandle}</strong>
                                          </button>
                                          <span>{moment(c.createdAt)}</span>
                                        </div>
                                        {c.parentId && (
                                          <p className="x1-caption">
                                            Reply to @
                                            {data.comments.find(
                                              (p) => p.id === c.parentId,
                                            )?.authorHandle || "a prior comment"}
                                          </p>
                                        )}
                                        <p>{c.text}</p>
                                        {!c.deletedAt && (
                                          <div className="x1-actions">
                                            <button
                                              className="x1-text-button"
                                              onClick={() =>
                                                setReply({
                                                  postId: post.id,
                                                  parentId: c.id,
                                                  label: c.authorHandle,
                                                })
                                              }
                                            >
                                              Reply
                                            </button>
                                            {!!c.isMine && (
                                              <>
                                                <button
                                                  className="x1-text-button"
                                                  onClick={() =>
                                                    setCommentEdit(c)
                                                  }
                                                >
                                                  Edit
                                                </button>
                                                <button
                                                  className="x1-text-button"
                                                  onClick={() =>
                                                    void mutate(
                                                      {
                                                        action: "delete-comment",
                                                        commentId: c.id,
                                                      },
                                                      "Your comment was removed; its thread remains.",
                                                    )
                                                  }
                                                >
                                                  Remove
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </article>
                            ))
                          ) : (
                            <Empty title="Publish when the method is ready">
                              An owner or administrator can publish an exact
                              Soul revision from the Research tab. Private
                              portfolios are never attached.
                            </Empty>
                          )}
                          {data.pagination.nextPostBefore && (
                            <button
                              className="x1-secondary x1-motion-button"
                              onClick={() =>
                                setCursor(data.pagination.nextPostBefore || "")
                              }
                            >
                              Older room posts
                              <ArrowRight size={15} />
                            </button>
                          )}{" "}
                          {cursor && (
                            <button
                              className="x1-text-button"
                              onClick={() => setCursor("")}
                            >
                              Return to newest posts
                            </button>
                          )}
                        </Panel>
                        <GroupNetworkPanel
                          key={`${group.id}-${profileRevision}`}
                          groupId={group.id}
                          initialDiscussionId={group.id === initialRoom ? initialAnchor : ""}
                          notify={notify}
                          onOpenProfile={(h) => void openPublicProfile(h)}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <Panel title="Your research circle starts here">
                    <Empty
                      title={
                        body
                          ? "Create or join a Research Room"
                          : "Choose your @handle to start collaborating"
                      }
                      action={
                        <div className="x1-actions">
                          <button
                            type="button"
                            className="x1-primary x1-motion-button"
                            onClick={openCreateRoomFlow}
                          >
                            {body ? "Create a Room" : "Set up your Profile"}
                            <ArrowRight size={16} />
                          </button>
                          <button
                            type="button"
                            className="x1-secondary"
                            onClick={() => setTab("explore")}
                          >
                            <Compass size={15} />
                            Explore Rooms
                          </button>
                        </div>
                      }
                    >
                      Draft a shared methodology, invite peers by @handle, and
                      keep every Soul revision and discussion in one private
                      Research Room.
                    </Empty>
                  </Panel>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 3: SAVED — Bookmarked Souls & Researchers */}
      {tab === "saved" && (
        <>
          {authenticated ? (
            <SocialWorkspace
              key={`saved-${body?.handle || "new"}-${profileRevision}`}
              view="Saved"
              onView={(v: SocialView) => {
                if (v === "Messages") setInboxOpen(true);
                else if (v === "Discover") setTab("explore");
              }}
              notify={notify}
              onOpenProfile={(h) => void openPublicProfile(h)}
              onOpenGroup={(id) => {
                setGroupId(id);
                setCursor("");
                setTab("rooms");
              }}
            />
          ) : (
            <Panel title="Saved Research" kicker="Sign in required">
              <Empty
                title="Save Souls and researchers for quick return"
                action={
                  <button
                    type="button"
                    className="x1-primary x1-motion-button"
                    onClick={() => onRequireAuth?.()}
                  >
                    Sign in to view Saved
                    <ArrowRight size={15} />
                  </button>
                }
              >
                Bookmark shared Souls and discoverable researchers once signed
                in.
              </Empty>
            </Panel>
          )}
        </>
      )}

      {/* DIRECT MESSAGES DRAWER MODAL */}
      {inboxOpen && authenticated && (
        <Modal
          title="Direct Research Messages"
          onClose={() => setInboxOpen(false)}
        >
          <SocialWorkspace
            key={`inbox-${body?.handle || "new"}-${profileRevision}`}
            view="Messages"
            onView={(v: SocialView) => {
              if (v === "Discover") {
                setInboxOpen(false);
                setTab("explore");
              }
            }}
            notify={notify}
            onOpenProfile={(h) => {
              setInboxOpen(false);
              void openPublicProfile(h);
            }}
            shareSoul={networkShare}
            onClearShare={() => setNetworkShare(null)}
            onOpenGroup={(id) => {
              setInboxOpen(false);
              setGroupId(id);
              setCursor("");
              setTab("rooms");
            }}
          />
        </Modal>
      )}

      {/* PUBLIC-SAFE RESEARCHER PROFILE SHEET (Never exposes private email or settings) */}
      {publicProfile && (
        <Modal
          title={`@${publicProfile.body.handle}`}
          onClose={() => setPublicProfile(null)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <AvatarBadge
              avatarId={resolveAvatarForHandle(
                publicProfile.body.handle,
                publicProfile.body.avatar,
              )}
              size={58}
              ring
              alt={`${publicProfile.body.displayName} avatar`}
            />
            <div>
              <strong style={{ fontSize: 17, display: "block" }}>
                {publicProfile.body.displayName}
              </strong>
              <span className="x1-caption">@{publicProfile.body.handle}</span>
            </div>
          </div>
          {publicProfile.body.bio && <p>{publicProfile.body.bio}</p>}
          <div className="x1-actions" style={{ marginBottom: 14 }}>
            {publicProfile.canMessage && (
              <button
                type="button"
                className="x1-primary"
                disabled={busy}
                onClick={async () => {
                  const res = await api<{ threadId?: string }>("/api/x2/social", {
                    action: "start-thread",
                    handle: publicProfile.body.handle,
                  });
                  if (res.threadId) {
                    setPublicProfile(null);
                    setInboxOpen(true);
                    notify("Conversation ready.");
                  }
                }}
              >
                <MessageSquare size={15} />
                Message
              </button>
            )}
            <button
              type="button"
              className="x1-secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  await api("/api/x2/social", {
                    action: "bookmark",
                    kind: "BODY",
                    targetId: publicProfile.body.handle,
                    active: true,
                  });
                  notify("Researcher saved.");
                } catch (err) {
                  notify(err instanceof Error ? err.message : "Could not save.", true);
                }
              }}
            >
              <Bookmark size={15} />
              Save researcher
            </button>
            {publicProfile.isMe && onOpenSettings && (
              <button
                type="button"
                className="x1-secondary"
                onClick={() => {
                  setPublicProfile(null);
                  onOpenSettings("profile");
                }}
              >
                <Settings size={15} />
                Edit my Profile
              </button>
            )}
          </div>
          <h3>Shared Souls in common rooms</h3>
          {publicProfile.souls.length ? (
            publicProfile.souls.map((s) => (
              <article className="x2-social-profile-soul" key={s.id}>
                <strong>
                  {s.title} · revision {s.revision}
                </strong>
                <p>{s.summary}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPublicProfile(null);
                    setGroupId(s.groupId);
                    setTab("rooms");
                  }}
                >
                  Open in Room
                </button>
              </article>
            ))
          ) : (
            <p className="x1-caption">
              No shared Souls in common Research Rooms yet. Private portfolios
              and emails remain hidden.
            </p>
          )}
        </Modal>
      )}

      {/* MODALS: 2-step Create Room, Set @handle Profile, Invite, Accept Invite, Members */}
      {modal && (
        <Modal
          title={
            modal === "profile"
              ? "Set your Community Profile (@handle)"
              : modal === "room"
                ? `Create a Research Room · Step ${createStep} of 2`
                : modal === "invite"
                  ? "Invite a researcher"
                  : modal === "join"
                    ? "Accept a Research Room invitation"
                    : "Research Room members & roles"
          }
          onClose={() => setModal(null)}
        >
          {modal === "members" ? (
            <>
              <div className="x1-member-list">
                {data?.members.map((m) => (
                  <div key={m.handle}>
                    <button
                      type="button"
                      className="x6-comm-author-btn"
                      onClick={() => {
                        setModal(null);
                        void openPublicProfile(m.handle);
                      }}
                    >
                      <AvatarBadge
                        avatarId={resolveAvatarForHandle(m.handle, m.avatar)}
                        size={34}
                        ring
                        alt=""
                      />
                      <div>
                        <strong>{m.displayName}</strong>
                        <span style={{ display: "block", fontSize: 12 }}>
                          @{m.handle} · {m.role}
                        </span>
                      </div>
                    </button>
                    {group?.role === "OWNER" && m.role !== "OWNER" && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await mutate({
                            action: "set-role",
                            groupId,
                            handle: m.handle,
                            role: f.get("role"),
                          });
                        }}
                      >
                        <select
                          name="role"
                          aria-label={"Role for " + m.handle}
                          defaultValue={m.role}
                        >
                          {["ADMIN", "EDITOR", "VIEWER"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <button className="x1-text-button" disabled={busy}>
                          Save role
                        </button>
                        <button
                          type="button"
                          className="x1-text-button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              {
                                action: "transfer-owner",
                                groupId,
                                handle: m.handle,
                              },
                              "Ownership transferred to @" + m.handle + ".",
                            )
                          }
                        >
                          Transfer ownership
                        </button>
                        <button
                          type="button"
                          className="x1-text-button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              {
                                action: "remove-member",
                                groupId,
                                handle: m.handle,
                              },
                              "Member removed. Future room reads are denied.",
                            )
                          }
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
              {group?.role !== "OWNER" && (
                <button
                  className="x1-secondary x1-motion-button"
                  disabled={busy}
                  onClick={async () => {
                    const result = await mutate({
                      action: "leave-group",
                      groupId,
                    });
                    if (result) {
                      setGroupId("");
                      setModal(null);
                    }
                  }}
                >
                  Leave Research Room
                </button>
              )}
            </>
          ) : modal === "room" ? (
            <form className="x1-form" onSubmit={handleCreateRoomSubmit}>
              {createStep === 1 ? (
                <>
                  <label>
                    Research topic
                    <select
                      value={createTopic}
                      onChange={(e) => setCreateTopic(e.target.value)}
                    >
                      <option value="Indian Equities & Indices">
                        Indian Equities &amp; Indices (NSE / BSE)
                      </option>
                      <option value="MCX Commodities">
                        MCX Commodities &amp; Futures
                      </option>
                      <option value="Global FX & Rates">
                        Global FX &amp; Sovereign Yields
                      </option>
                      <option value="Macro & Multi-Asset">
                        Macro, Geopolitics &amp; Multi-Asset
                      </option>
                    </select>
                  </label>
                  <label className="x1-checkbox">
                    <input
                      type="checkbox"
                      checked={createDiscoverable}
                      onChange={(e) => setCreateDiscoverable(e.target.checked)}
                    />
                    List room name &amp; description in Explore directory (members
                    still require approval to join)
                  </label>
                  <p className="x1-caption">
                    {createDiscoverable
                      ? "Others can see this room’s name and request to join; its Souls and discussions remain private to approved members."
                      : "Invite-only Research Room. Hidden from Explore and accessible only via one-time invitation."}
                  </p>
                  <button
                    type="button"
                    className="x1-primary x1-motion-button"
                    onClick={() => setCreateStep(2)}
                  >
                    Next: Name your Room
                    <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <>
                  <label>
                    Research Room name
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      required
                      maxLength={80}
                      placeholder="e.g. Nifty Momentum Study"
                      autoFocus
                    />
                  </label>
                  <label>
                    One-line purpose
                    <textarea
                      value={createDesc}
                      onChange={(e) => setCreateDesc(e.target.value)}
                      maxLength={400}
                      rows={3}
                      placeholder="What hypothesis or market regime does this room study?"
                    />
                  </label>
                  {createDiscoverable && (
                    <label>
                      Directory handle
                      <input
                        value={createHandle}
                        onChange={(e) =>
                          setCreateHandle(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_]/g, ""),
                          )
                        }
                        maxLength={28}
                        placeholder="nifty_momentum"
                      />
                    </label>
                  )}
                  <div className="x1-actions">
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={() => setCreateStep(1)}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="x1-primary x1-motion-button"
                      disabled={busy || !createName.trim()}
                    >
                      {busy ? "Creating…" : "Create Research Room"}
                      <Check size={15} />
                    </button>
                  </div>
                </>
              )}
            </form>
          ) : (
            <form
              className="x1-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const action =
                  modal === "profile"
                    ? "profile"
                    : modal === "invite"
                      ? "invite"
                      : "accept-invite";
                const input: Record<string, unknown> = { action };
                for (const [key, value] of f) input[key] = value;
                if (modal === "profile") {
                  input.avatar = currentUserAvatarId || body?.avatar || "a01";
                }
                if (modal === "invite") input.groupId = groupId;
                const result = await mutate(
                  input,
                  modal === "profile"
                    ? "Your Community Profile is saved."
                    : "Saved to your Research Room.",
                );
                if (result) {
                  if (typeof result.code === "string")
                    setInviteCode(result.code);
                  setModal(null);
                }
              }}
            >
              {modal === "profile" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AvatarBadge
                      avatarId={currentUserAvatarId || body?.avatar}
                      size={52}
                      ring
                      alt=""
                    />
                    <span className="x1-caption">
                      Change your avatar anytime from Settings → Profile (50 presets).
                    </span>
                  </div>
                  <label>
                    Unique @handle
                    <input
                      name="handle"
                      required
                      minLength={3}
                      maxLength={24}
                      pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                      defaultValue={body?.handle}
                      placeholder="your_handle"
                      autoCapitalize="none"
                    />
                  </label>
                  <label>
                    Display name
                    <input
                      name="displayName"
                      required
                      maxLength={60}
                      defaultValue={body?.displayName || currentUserDisplayName || ""}
                    />
                  </label>
                  <label>
                    Bio
                    <textarea
                      name="bio"
                      maxLength={320}
                      defaultValue={body?.bio}
                      placeholder="The questions and markets you study."
                    />
                  </label>
                  <p className="x1-caption" style={{ margin: 0 }}>
                    Your Body ID is your unique public identity. Create Souls,
                    publish research, and connect with other researchers. Direct
                    messages, portfolios, drafts, and email stay strictly private.
                  </p>
                </>
              ) : modal === "invite" ? (
                <>
                  <label>
                    Invited researcher @handle
                    <input
                      name="handle"
                      required
                      maxLength={24}
                      placeholder="researcher_handle"
                    />
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option value="EDITOR">
                        Editor — contribute to shared Souls
                      </option>
                      <option value="VIEWER">Viewer — read and discuss</option>
                      {group?.role === "OWNER" && (
                        <option value="ADMIN">
                          Admin — invite and publish
                        </option>
                      )}
                    </select>
                  </label>
                  <p className="x1-caption">
                    Bound to this exact @handle and expires after 7 days.
                  </p>
                </>
              ) : (
                <label>
                  One-time invitation code
                  <textarea
                    name="code"
                    required
                    minLength={64}
                    maxLength={64}
                    autoCapitalize="none"
                  />
                </label>
              )}
              <button className="x1-primary x1-motion-button" disabled={busy}>
                {busy
                  ? "Saving…"
                  : modal === "profile"
                    ? "Save Profile"
                    : modal === "invite"
                      ? "Create invitation code"
                      : "Accept invitation"}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Modal>
      )}

      {editor && (
        <Modal
          title={editor.id ? "Contribute a revision" : "Create a shared Soul"}
          onClose={() => setEditor(null)}
        >
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                compileFormula(editor.formula);
              } catch (error) {
                notify((error as Error).message, true);
                return;
              }
              const result = await mutate(
                {
                  action: editor.id ? "revise-soul" : "create-soul",
                  groupId,
                  soulId: editor.id,
                  baseRevision: editor.baseRevision,
                  title: editor.title,
                  formula: editor.formula,
                  summary: editor.summary,
                  changeNote: editor.changeNote,
                },
                "Revision saved with contributor attribution.",
              );
              if (result) setEditor(null);
            }}
          >
            <label>
              Title
              <input
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                required
                maxLength={100}
              />
            </label>
            <label>
              Methodology and limitations
              <textarea
                value={editor.summary}
                onChange={(e) =>
                  setEditor({ ...editor, summary: e.target.value })
                }
                required
                minLength={10}
                maxLength={2000}
              />
            </label>
            <label>
              Canonical Soul formula
              <textarea
                className="x1-code-editor"
                value={editor.formula}
                onChange={(e) =>
                  setEditor({ ...editor, formula: e.target.value })
                }
                required
                maxLength={4000}
              />
            </label>
            {editor.id && (
              <label>
                What changed, and why?
                <textarea
                  value={editor.changeNote}
                  onChange={(e) =>
                    setEditor({ ...editor, changeNote: e.target.value })
                  }
                  required
                  minLength={3}
                  maxLength={500}
                />
              </label>
            )}
            <button className="x1-primary x1-motion-button" disabled={busy}>
              Save {editor.id ? "revision" : "shared draft"}
              <Check size={16} />
            </button>
          </form>
        </Modal>
      )}

      {revisionSoul && (
        <Modal
          title={revisionSoul.title + " · version history"}
          onClose={() => setRevisionSoul(null)}
        >
          {data?.revisions
            .filter((r) => r.soulId === revisionSoul.id)
            .map((r) => (
              <article className="x1-revision" key={r.id}>
                <div className="x1-panel-head">
                  <h3>Revision {r.revision}</h3>
                  <span className="x1-caption">
                    @{r.authorHandle} · {moment(r.createdAt)}
                  </span>
                </div>
                <strong>{r.title}</strong>
                <p>{r.changeNote}</p>
                <code className="x1-inline-code">{r.formula}</code>
                <p>{r.summary}</p>
                {data.capabilities.canEdit &&
                  r.revision !== revisionSoul.revision && (
                    <button
                      className="x1-text-button"
                      disabled={busy}
                      onClick={async () => {
                        const result = await mutate(
                          {
                            action: "restore-revision",
                            soulId: revisionSoul.id,
                            revision: r.revision,
                            baseRevision: revisionSoul.revision,
                          },
                          "Prior content restored as a new attributable revision.",
                        );
                        if (result) setRevisionSoul(null);
                      }}
                    >
                      Restore as a new revision
                      <History size={14} />
                    </button>
                  )}
              </article>
            ))}
        </Modal>
      )}

      {publish && (
        <Modal
          title="Publish to this Research Room"
          onClose={() => setPublish(null)}
        >
          <p>
            Publish <strong>{publish.title}</strong>, revision{" "}
            {publish.revision}, to current members of{" "}
            <strong>{group?.name}</strong>.
          </p>
          <p className="x1-callout">
            Only the method, summary, and attribution appear in the room feed.
            Private portfolios and scan snapshots are never attached.
          </p>
          <button
            className="x1-primary x1-motion-button"
            disabled={busy}
            onClick={async () => {
              const result = await mutate(
                {
                  action: "publish",
                  soulId: publish.id,
                  revision: publish.revision,
                  visibility: "GROUP",
                },
                "Exact revision published to the Research Room.",
              );
              if (result) {
                setPublish(null);
                setRoomSection("discussion");
              }
            }}
          >
            Publish to Room
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}

      {inviteCode && (
        <Modal
          title="Your one-time invitation"
          onClose={() => setInviteCode("")}
        >
          <p>Share this code directly with the invited researcher.</p>
          <code className="x1-invite-code">{inviteCode}</code>
          <button
            className="x1-secondary x1-motion-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteCode);
                notify("Invitation code copied.");
              } catch {
                notify("Select the code manually to copy.", true);
              }
            }}
          >
            <Copy size={16} />
            Copy invitation
          </button>
        </Modal>
      )}

      {reply && (
        <Modal
          title={
            reply.parentId ? "Reply to @" + reply.label : "Add a room comment"
          }
          onClose={() => setReply(null)}
        >
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                text = String(f.get("text")),
                signature = JSON.stringify({
                  postId: reply.postId,
                  parentId: reply.parentId,
                  text,
                });
              if (commentRetry.current?.signature !== signature)
                commentRetry.current = { signature, id: crypto.randomUUID() };
              const result = await mutate(
                {
                  action: "comment",
                  postId: reply.postId,
                  parentId: reply.parentId,
                  text,
                  requestId: commentRetry.current.id,
                },
                "Comment saved to this room thread.",
              );
              if (result) {
                commentRetry.current = null;
                setReply(null);
              }
            }}
          >
            <label>
              Your research comment
              <textarea name="text" required maxLength={2000} autoFocus />
            </label>
            <button className="x1-primary x1-motion-button" disabled={busy}>
              Post comment
              <Send size={15} />
            </button>
          </form>
        </Modal>
      )}

      {commentEdit && (
        <Modal title="Edit your comment" onClose={() => setCommentEdit(null)}>
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "edit-comment",
                    commentId: commentEdit.id,
                    text: f.get("text"),
                  },
                  "Comment updated.",
                )
              )
                setCommentEdit(null);
            }}
          >
            <label>
              Comment
              <textarea
                name="text"
                required
                maxLength={2000}
                defaultValue={commentEdit.text}
              />
            </label>
            <button className="x1-primary x1-motion-button" disabled={busy}>
              Save edit
              <Check size={15} />
            </button>
          </form>
        </Modal>
      )}

      {report && (
        <Modal title="Report a room post" onClose={() => setReport(null)}>
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "report",
                    postId: report.id,
                    reason: f.get("reason"),
                  },
                  "Report recorded for room administrators.",
                )
              )
                setReport(null);
            }}
          >
            <label>
              Reason
              <textarea name="reason" required minLength={5} maxLength={500} />
            </label>
            <p className="x1-caption">
              Recorded privately for the room’s owner and administrators.
            </p>
            <button className="x1-primary x1-motion-button" disabled={busy}>
              Record report
              <Flag size={15} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
