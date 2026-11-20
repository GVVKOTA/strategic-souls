"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Plus,
  Users,
  UserRound,
  Heart,
  MessageSquare,
  Send,
  History,
  ShieldCheck,
  Copy,
  Check,
  ArrowUpRight,
  Flag,
  Pencil,
} from "lucide-react";
import { compileFormula } from "../../../backend/engines/scan";
import { Panel, Empty, Modal, WorkspaceSkeleton, api, moment, type Notice } from "../../components/workspace/shared";
import {
  SocialWorkspace,
  GroupNetworkPanel,
  type SocialView,
} from "./social-workspace";
import "./social.css";
type Body = {
  handle: string;
  displayName: string;
  bio: string;
  avatar: string;
};
type Group = {
  id: string;
  name: string;
  description: string;
  role: string;
  ownerHandle: string;
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
  text: string;
  createdAt: string;
  isMine: boolean;
  deletedAt: string | null;
};
type CommunityState = {
  body: Body | null;
  groups: Group[];
  selectedGroup: Group | null;
  members: {
    handle: string;
    displayName: string;
    role: string;
    avatar: string;
  }[];
  souls: Soul[];
  revisions: Revision[];
  posts: Post[];
  comments: Comment[];
  invitations: {
    id: string;
    invitedHandle: string;
    role: string;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
  }[];
  capabilities: { canEdit: boolean; canPublish: boolean; canInvite: boolean };
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
export default function Community({
  authenticated = true,
  onRequireAuth,
  notify,
  sharedFormula,
}: {
  authenticated?: boolean;
  onRequireAuth?: () => void;
  notify: Notice;
  sharedFormula: string;
}) {
  const [networkView, setNetworkView] = useState<"Groups" | SocialView>(
    "Groups",
  );
  const [networkQuery, setNetworkQuery] = useState("");
  const [networkShare, setNetworkShare] = useState<{
    id: string;
    revision: number;
    title: string;
  } | null>(null);
  const mutationLock = useRef(false);
  const [superFeedback, setSuperFeedback] = useState<{
    id: string;
    active: boolean;
  } | null>(null);
  const [data, setData] = useState<CommunityState | null>(null),
    [groupId, setGroupId] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<
      "profile" | "group" | "invite" | "join" | "members" | null
    >(null),
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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      if (params.get("q") || params.get("handle")) {
        setNetworkQuery(params.get("q") || "");
        setNetworkView("Discover");
      }
      if (params.get("group")) {
        setGroupId(params.get("group")!);
        setNetworkView("Groups");
      }
    });
    const searchEvent = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value === "string") {
        setNetworkQuery(value.slice(0, 80));
        setNetworkView("Discover");
      }
    };
    window.addEventListener("x2-community-search", searchEvent);
    return () => window.removeEventListener("x2-community-search", searchEvent);
  }, []);
  async function reload(selected = groupId, before = cursor) {
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
  }
  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => {
        setLoading(false);
        setData(null);
        setError("");
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
  }, [authenticated, groupId, cursor]);
  async function mutate(
    input: Record<string, unknown>,
    success = "Saved privately.",
  ) {
    if (mutationLock.current) return null;
    mutationLock.current = true;
    setBusy(true);
    try {
      const result = await api<Record<string, unknown>>(
        input.action === "remove-member"
          ? "/api/x2/social"
          : "/api/x1/community",
        input,
      );
      if (typeof result.groupId === "string") {
        setGroupId(result.groupId);
        setCursor("");
        await reload(result.groupId, "");
      } else await reload();
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
  const body = data?.body,
    group = data?.selectedGroup;
  if (!authenticated) {
    return (
      <>
        <header className="x1-page-title">
          <div>
            <h1>Research community</h1>
          </div>
        </header>
        <Panel
          title="Private research collaboration"
          kicker="Sign in required"
        >
          <Empty
            title="Join or create private research groups"
            action={
              <button
                className="x1-primary x1-motion-button"
                onClick={() => onRequireAuth?.()}
              >
                Sign in or create account
                <ArrowRight size={16} />
              </button>
            }
          >
            Sign in to create your Body profile, share versioned Souls, review
            revisions, and collaborate in private groups without exposing
            personal portfolios.
          </Empty>
        </Panel>
      </>
    );
  }
  return (
    <>
      <header className="x1-page-title">
        <div>
          <h1>Research community</h1>
        </div>
        <button
          className="x1-secondary x1-motion-button"
          onClick={() => setModal("profile")}
        >
          <UserRound size={16} />
          {body ? "Edit your Body" : "Create your Body"}
        </button>
      </header>
      <nav className="x2-community-tabs" aria-label="Community sections">
        {(
          [
            "Groups",
            "Discover",
            "Messages",
            "Saved",
            "Notifications",
            "Privacy",
          ] as const
        ).map((item) => (
          <button
            key={item}
            aria-pressed={networkView === item}
            onClick={() => setNetworkView(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && (
        <div className="x1-callout" role="alert">
          {error}
          <button className="x1-text-button" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {networkView !== "Groups" ? (
        <SocialWorkspace
          key={body?.handle || "new-body"}
          view={networkView}
          onView={setNetworkView}
          notify={notify}
          query={networkQuery}
          shareSoul={networkShare}
          onClearShare={() => setNetworkShare(null)}
          onOpenGroup={(id) => {
            setGroupId(id);
            setCursor("");
            setNetworkView("Groups");
          }}
        />
      ) : (
        <div className="x1-community-grid">
          <aside>
            <Panel
              title={body ? body.displayName : "Your research identity"}
              kicker="Your Body"
            >
              <div
                className={
                  "x1-profile-avatar x1-avatar-" + (body?.avatar || "mint")
                }
              >
                {body?.displayName?.slice(0, 2).toUpperCase() || "GV"}
              </div>
              <h3>
                {body ? "@" + body.handle : "A name for your perspective"}
              </h3>
              <p>
                {body?.bio ||
                  "Create a unique @Body, add a short bio, then build a private research group."}
              </p>
              <button
                className="x1-text-button"
                onClick={() => setModal("profile")}
              >
                {body ? "Edit profile" : "Set up your Body"}
                <ArrowRight size={15} />
              </button>
            </Panel>
            <Panel
              title="Your groups"
              action={
                <button
                  className="x1-icon-button"
                  disabled={!body}
                  aria-label="Create private group"
                  onClick={() => setModal("group")}
                >
                  <Plus size={17} />
                </button>
              }
            >
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
                      <small>{g.role.toLowerCase()} · private</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              {!data?.groups.length && (
                <p className="x1-muted">
                  Your first group starts with a shared question.
                </p>
              )}
              <div className="x1-actions">
                <button
                  className="x1-text-button"
                  disabled={!body}
                  onClick={() => setModal("group")}
                >
                  Create a group
                  <Plus size={14} />
                </button>
                <button
                  className="x1-text-button"
                  disabled={!body}
                  onClick={() => setModal("join")}
                >
                  Accept an invite
                  <ArrowRight size={14} />
                </button>
              </div>
            </Panel>
            <div className="x1-source-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Private by design</strong>
                <p>
                  Group publication stays inside current membership. This Site
                  remains restricted to its existing audience. Public posting
                  and payments are disabled.
                </p>
              </div>
            </div>
          </aside>
          <div className="x1-community-main">
            {loading && !data ? (
              <WorkspaceSkeleton
                label="Opening your private Community…"
                kind="panel"
              />
            ) : group ? (
              <>
                <Panel
                  title={group.name}
                  kicker="Private research group"
                  action={
                    <button
                      className="x1-secondary x1-motion-button"
                      onClick={() => setModal("members")}
                    >
                      <Users size={16} />
                      {data.members.length} members
                    </button>
                  }
                >
                  <p>
                    {group.description ||
                      "A private place to build and review a shared method."}
                  </p>
                  <div className="x1-actions">
                    {data.capabilities.canEdit && (
                      <button
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
                        Build a group Soul
                      </button>
                    )}
                    {data.capabilities.canInvite && (
                      <button
                        className="x1-secondary x1-motion-button"
                        onClick={() => setModal("invite")}
                      >
                        Invite a Body
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </Panel>
                <GroupNetworkPanel
                  key={group.id}
                  groupId={group.id}
                  notify={notify}
                />
                <Panel
                  title="The shared workbench"
                  kicker="One Soul, multiple authors"
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
                          Latest contribution by @{s.authorHandle}
                        </p>
                        <div className="x1-actions">
                          {data.capabilities.canEdit && (
                            <button
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
                              Contribute a revision
                            </button>
                          )}
                          <button
                            className="x1-text-button"
                            onClick={() => setRevisionSoul(s)}
                          >
                            <History size={15} />
                            Version history
                          </button>
                          <button
                            className="x1-text-button"
                            onClick={() => {
                              setNetworkShare({
                                id: s.id,
                                revision: s.revision,
                                title: s.title,
                              });
                              setNetworkView("Messages");
                            }}
                          >
                            Share in message
                          </button>
                          {data.capabilities.canPublish && (
                            <button
                              className="x1-text-button"
                              onClick={() => setPublish(s)}
                            >
                              Publish to group
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
                      A group Soul preserves its formula, summary, revisions and
                      each contributor’s attribution.
                    </Empty>
                  )}
                </Panel>
                <Panel
                  title="Group conversation"
                  kicker="Authentic research, genuine responses"
                >
                  {data.posts.length ? (
                    data.posts.map((post) => (
                      <article
                        className={
                          "x1-post " + (post.hiddenAt ? "x1-post-hidden" : "")
                        }
                        key={post.id}
                      >
                        <div className="x1-post-author">
                          <span className="x1-avatar-small">
                            {post.authorHandle.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong>@{post.authorHandle}</strong>
                            <span>
                              {moment(post.createdAt)} · revision{" "}
                              {post.revision}
                            </span>
                          </div>
                          <span className="x1-badge">Group only</span>
                        </div>
                        <h3>{post.title}</h3>
                        <p>{post.summary}</p>
                        <code className="x1-inline-code">{post.formula}</code>
                        <div className="x1-post-actions">
                          <button
                            className={post.supered ? "x1-super-active" : ""}
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
                              {" "}
                              <Heart
                                size={17}
                                fill={post.supered ? "currentColor" : "none"}
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
                          {data.capabilities.canPublish && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                mutate(
                                  {
                                    action: "moderate",
                                    postId: post.id,
                                    hidden: !post.hiddenAt,
                                  },
                                  post.hiddenAt
                                    ? "Post restored."
                                    : "Post hidden from group feed.",
                                )
                              }
                            >
                              {post.hiddenAt ? "Restore post" : "Hide post"}
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
                                <div>
                                  <strong>@{c.authorHandle}</strong>
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
                                          onClick={() => setCommentEdit(c)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          className="x1-text-button"
                                          onClick={() =>
                                            mutate(
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
                      An owner or administrator can publish an exact Soul
                      revision to this group. Your private portfolio and scan
                      snapshots are never attached.
                    </Empty>
                  )}
                  {data.pagination.nextPostBefore && (
                    <button
                      className="x1-secondary x1-motion-button"
                      onClick={() =>
                        setCursor(data.pagination.nextPostBefore || "")
                      }
                    >
                      Older group posts
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
                  {data.pagination.commentsTruncated && (
                    <p className="x1-callout">
                      This view reached the 200-comment limit. Full comment
                      pagination is not yet implemented; request an operator
                      export for a complete thread.
                    </p>
                  )}
                </Panel>
              </>
            ) : (
              <Panel title="Private group research">
                <Empty
                  title={
                    body
                      ? "Create a group around a question"
                      : "Begin with your Body"
                  }
                  action={
                    <button
                      className="x1-primary x1-motion-button"
                      onClick={() => setModal(body ? "group" : "profile")}
                    >
                      {body ? "Create a private group" : "Create your Body"}
                      <ArrowRight size={16} />
                    </button>
                  }
                >
                  Draft a shared methodology, invite an eligible Body, and keep
                  every revision and discussion in one private place.
                </Empty>
              </Panel>
            )}
          </div>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "profile"
              ? "Your Body"
              : modal === "group"
                ? "Create a private group"
                : modal === "invite"
                  ? "Invite a Body"
                  : modal === "join"
                    ? "Accept a group invitation"
                    : "Group members and roles"
          }
          onClose={() => setModal(null)}
        >
          {modal === "members" ? (
            <>
              <div className="x1-member-list">
                {data?.members.map((m) => (
                  <div key={m.handle}>
                    <div>
                      <strong>{m.displayName}</strong>
                      <span>
                        @{m.handle} · {m.role}
                      </span>
                    </div>
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
                            mutate(
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
                            mutate(
                              {
                                action: "remove-member",
                                groupId,
                                handle: m.handle,
                              },
                              "Member removed. Future group reads are denied.",
                            )
                          }
                        >
                          Remove member
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
                  Leave group
                </button>
              )}
              <p className="x1-caption">
                Owner/Admin approve group publication. Editors contribute
                revisions. Viewers can read and discuss. Existing Site access is
                required separately.
              </p>
            </>
          ) : (
            <form
              className="x1-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const action =
                  modal === "profile"
                    ? "profile"
                    : modal === "group"
                      ? "create-group"
                      : modal === "invite"
                        ? "invite"
                        : "accept-invite";
                const input: Record<string, unknown> = { action };
                for (const [key, value] of f) input[key] = value;
                if (modal === "invite") input.groupId = groupId;
                const result = await mutate(
                  input,
                  modal === "profile"
                    ? "Your Body is saved."
                    : "Saved to your private Community.",
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
                  <div
                    className={
                      "x1-profile-avatar x1-avatar-" + (body?.avatar || "mint")
                    }
                  >
                    {body?.displayName.slice(0, 2).toUpperCase() || "GV"}
                  </div>
                  <label>
                    Unique Body handle
                    <input
                      name="handle"
                      required
                      minLength={3}
                      maxLength={24}
                      pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                      defaultValue={body?.handle}
                      placeholder="your_body"
                      autoCapitalize="none"
                    />
                  </label>
                  <label>
                    Display name
                    <input
                      name="displayName"
                      required
                      maxLength={60}
                      defaultValue={body?.displayName}
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
                  <label>
                    Avatar style
                    <select name="avatar" defaultValue={body?.avatar || "mint"}>
                      {["mint", "silver", "slate", "sky", "lavender"].map(
                        (a) => (
                          <option key={a} value={a}>
                            {
                              {
                                mint: "Silver I",
                                silver: "Silver II",
                                slate: "Silver III",
                                sky: "Silver IV",
                                lavender: "Silver V",
                              }[a]
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <p className="x1-caption">
                    Initials avatars are stored. Profile photo uploads require
                    private file storage and are not enabled.
                  </p>
                </>
              ) : modal === "group" ? (
                <>
                  <label>
                    Group name
                    <input
                      name="name"
                      required
                      maxLength={80}
                      placeholder="Your research circle"
                    />
                  </label>
                  <label>
                    Shared research focus
                    <textarea name="description" maxLength={500} />
                  </label>
                  <p className="x1-callout">
                    Private group. Only authorized members can read its Souls,
                    posts and discussions.
                  </p>
                </>
              ) : modal === "invite" ? (
                <>
                  <label>
                    Invited Body handle
                    <input
                      name="handle"
                      required
                      maxLength={24}
                      placeholder="their_body"
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
                    The invitation is bound to this exact Body and expires after
                    7 days. It does not grant access to this restricted Site. No
                    message is sent automatically.
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
                    ? "Save Body"
                    : modal === "group"
                      ? "Create private group"
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
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value })
                }
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
            <p className="x1-callout">
              This publishes no data. The same safe rule parser validates
              personal and group Souls. If another author saves first, your
              stale revision is rejected and your draft stays visible.
            </p>
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
          title="Publish to this private group"
          onClose={() => setPublish(null)}
        >
          <p>
            Publish <strong>{publish.title}</strong>, revision{" "}
            {publish.revision}, to current members of{" "}
            <strong>{group?.name}</strong>.
          </p>
          <p className="x1-callout">
            Only the method, summary and attribution will appear in the group
            feed. Private portfolios, scan input snapshots and raw licensed data
            are not attached.
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
                "Exact revision published to the private group.",
              );
              if (result) setPublish(null);
            }}
          >
            Publish to group
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {inviteCode && (
        <Modal
          title="Your one-time invitation"
          onClose={() => setInviteCode("")}
        >
          <p>
            Share this code directly with the named Body. It does not grant Site
            access.
          </p>
          <code className="x1-invite-code">{inviteCode}</code>
          <button
            className="x1-secondary x1-motion-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteCode);
                notify("Invitation code copied.");
              } catch {
                notify(
                  "Copy is unavailable in this browser. Select the code manually.",
                  true,
                );
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
            reply.parentId ? "Reply to @" + reply.label : "Add a group comment"
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
                "Comment saved to this group thread.",
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
              Post to this group
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
                  "Comment updated with edit timestamp.",
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
        <Modal title="Report a group post" onClose={() => setReport(null)}>
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
                  "Report recorded for group administrators.",
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
              This private report goes to the group’s owner and admins. No
              outside message is sent.
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
