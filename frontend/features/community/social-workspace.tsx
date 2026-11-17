"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Send,
  Bookmark,
  ShieldCheck,
  MessageSquare,
  X,
  Flag,
  Pencil,
  Check,
  ArrowRight,
} from "lucide-react";
import { api, Empty, Modal, Panel, moment, type Notice } from "../../components/workspace/shared";

export type SocialView =
  "Discover" | "Messages" | "Saved" | "Notifications" | "Privacy";
type Body = {
  handle: string;
  displayName: string;
  avatar: string;
  bio: string;
};
type Soul = {
  id: string;
  title: string;
  summary: string;
  formula?: string;
  groupId: string;
  revision: number;
  authorHandle?: string;
  unavailable?: boolean;
};
type Group = {
  id: string;
  name: string;
  description: string;
  handle: string;
  joined: number;
};
type SearchResult = {
  bodies: Body[];
  groups: Group[];
  souls: Soul[];
  nextBody: string | null;
};
type Inbox = {
  id: string;
  handle: string;
  displayName: string;
  state: string;
  requestedByMe: number;
  unread: number;
  muted: number;
  updatedAt: string;
};
type Message = {
  id: string;
  text: string;
  authorHandle: string;
  isMine: boolean;
  createdAt: string;
  editedAt: string | null;
  retractedAt: string | null;
  version: number;
  status: string;
  reference: Soul | null;
};
type Thread = {
  id: string;
  state: string;
  requestedByMe: boolean;
  peer: Body;
  preferences: { muted: number; hidden: number };
  messages: Message[];
  nextBefore: string | null;
};
type Preferences = {
  discoverable: boolean;
  messages: string;
  receipts: boolean;
  notifications: boolean;
};
type Home = {
  body: Body | null;
  preferences: Preferences;
  inbox: Inbox[];
  groups?: { id: string; name: string; role: string }[];
  invitations: {
    id: string;
    groupId: string;
    name: string;
    role: string;
    expiresAt: string;
  }[];
  notifications: {
    id: string;
    kind: string;
    targetId: string;
    createdAt: string;
    readAt: string | null;
  }[];
  bookmarks: { kind: string; body?: Body; soul?: Soul; createdAt: string }[];
  blocked: Body[];
};
type Profile = {
  body: Body;
  isMe: boolean;
  canMessage: boolean;
  groups: Group[];
  souls: Soul[];
};
const endpoint = "/api/x2/social";
const id = () => crypto.randomUUID();
const stateLabel = (s: string) =>
  s === "READ"
    ? "Read receipt shared"
    : s === "RECEIVED"
      ? "Received"
      : s === "RETRACTED"
        ? "Retracted"
        : "Sent to server";
async function read<T>(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), 20000);
  try {
    const response = await fetch(endpoint + "?" + new URLSearchParams(params), {
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(result.error || "Research network is unavailable.");
    return result as T;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted)
      throw new Error(
        "Research network timed out. Your draft is retained; retry when connected.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function Identity({ body }: { body: Body }) {
  return (
    <span className="x2-social-identity">
      <span aria-hidden="true" className="x2-social-avatar">
        {body.displayName.slice(0, 2).toUpperCase()}
      </span>
      <span>
        <strong>{body.displayName}</strong>
        <small>@{body.handle}</small>
      </span>
    </span>
  );
}
export function SocialWorkspace({
  view,
  onView,
  notify,
  query = "",
  onOpenGroup,
  shareSoul,
  onClearShare,
}: {
  view: SocialView;
  onView: (view: SocialView) => void;
  notify: Notice;
  query?: string;
  onOpenGroup: (id: string) => void;
  shareSoul?: { id: string; revision: number; title: string } | null;
  onClearShare?: () => void;
}) {
  const [home, setHome] = useState<Home | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(query),
    [kind, setKind] = useState("all"),
    [results, setResults] = useState<SearchResult | null>(null),
    [searching, setSearching] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [threadId, setThreadId] = useState(""),
    [thread, setThread] = useState<Thread | null>(null),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [threadSearch, setThreadSearch] = useState(""),
    [older, setOlder] = useState<Message[]>([]),
    [edit, setEdit] = useState<Message | null>(null),
    [report, setReport] = useState<{ kind: string; targetId: string } | null>(
      null,
    );
  const lock = useRef(false),
    retry = useRef<{ signature: string; key: string } | null>(null),
    mounted = useRef(true);
  const refresh = useCallback(async () => {
    const next = await read<Home>({ view: "home" });
    if (mounted.current) {
      setHome(next);
      setError("");
      setLoading(false);
    }
  }, []);
  const refreshThread = useCallback(async () => {
    if (!threadId) return;
    const next = await read<Thread>({ view: "thread", threadId });
    if (mounted.current) setThread(next);
  }, [threadId]);
  useEffect(() => {
    mounted.current = true;
    refresh().catch((e) => {
      if (mounted.current) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setSearch(query);
    });
    return () => {
      alive = false;
    };
  }, [query]);
  useEffect(() => {
    if (!threadId) return;
    const controller = new AbortController();
    read<Thread>({ view: "thread", threadId }, controller.signal)
      .then((s) => {
        setThread(s);
        setError("");
        setOlder([]);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [threadId]);
  useEffect(() => {
    if (view !== "Messages" && view !== "Notifications") return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || lock.current) return;
      Promise.all([refresh(), refreshThread()]).catch(() => {
        /* Visible refresh remains available; never simulate incoming status. */
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [view, refresh, refreshThread]);
  useEffect(() => {
    if (view !== "Discover") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      read<SearchResult>({ view: "search", q: search, kind }, controller.signal)
        .then(setResults)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, kind, view]);
  async function mutate(input: Record<string, unknown>, success = "Saved.") {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<Record<string, unknown>>(endpoint, input);
      await refresh();
      await refreshThread();
      notify(success);
      return result;
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, true);
      return null;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function openProfile(handle: string) {
    if (lock.current) return;
    setLoading(true);
    try {
      setProfile(await read<Profile>({ view: "profile", handle }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function message(handle: string) {
    const r = await mutate(
      { action: "start-thread", handle },
      "Conversation ready.",
    );
    if (typeof r?.threadId === "string") {
      setProfile(null);
      setThreadId(r.threadId);
      onView("Messages");
    }
  }
  async function bookmark(
    kind: "BODY" | "SOUL",
    targetId: string,
    active = true,
  ) {
    await mutate(
      { action: "bookmark", kind, targetId, active },
      active ? "Bookmark saved." : "Bookmark removed.",
    );
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const controller = new AbortController();
    if (params.get("handle"))
      read<Profile>(
        { view: "profile", handle: params.get("handle")! },
        controller.signal,
      )
        .then(setProfile)
        .catch((error) => {
          if (error.name !== "AbortError") setError(error.message);
        });
    return () => controller.abort();
  }, []);
  return (
    <section className="x2-social" aria-busy={busy || loading}>
      {error && (
        <div className="x1-callout" role="alert">
          {error}
          <button
            className="x1-text-button"
            disabled={busy}
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Retry
          </button>
        </div>
      )}
      {loading && <p role="status">Loading research network…</p>}
      {home && !home.body ? (
        <Empty title="Create your Body first">
          Use Create your Body above to establish your research identity.
          Discovery is off until you choose it.
        </Empty>
      ) : (
        <>
          {view === "Discover" && (
            <Panel title="Discover research">
              <form
                className="x2-social-search"
                onSubmit={(e) => e.preventDefault()}
              >
                <label>
                  <Search size={17} />
                  <input
                    aria-label="Search Bodies groups and Souls"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="@Body, group or Soul"
                    maxLength={80}
                  />
                </label>
                <select
                  aria-label="Research search type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">All research</option>
                  <option value="bodies">Bodies</option>
                  <option value="groups">Groups</option>
                  <option value="souls">Souls</option>
                </select>
              </form>
              {searching && <p role="status">Searching permitted research…</p>}
              <details className="x2-social-info">
                <summary>ⓘ Search privacy</summary>
                <p>
                  Only opted-in Bodies and group directories appear. Souls
                  require current group membership. A private profile is not
                  revealed by search. This does not expand the Site audience.
                </p>
              </details>
              {results && (
                <div className="x2-social-results">
                  {results.bodies.map((b) => (
                    <article key={b.handle}>
                      <button
                        className="x2-social-profile-link"
                        onClick={() => openProfile(b.handle)}
                      >
                        <Identity body={b} />
                      </button>
                      <p>{b.bio}</p>
                      <div className="x1-actions">
                        <button
                          disabled={busy}
                          onClick={() => message(b.handle)}
                        >
                          <MessageSquare size={15} />
                          Message
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => bookmark("BODY", b.handle)}
                        >
                          <Bookmark size={15} />
                          Save researcher
                        </button>
                      </div>
                    </article>
                  ))}
                  {results.groups.map((g) => (
                    <article key={g.id}>
                      <h3>{g.name}</h3>
                      <small>
                        @{g.handle} · {g.joined ? "Member" : "Directory only"}
                      </small>
                      <p>{g.description}</p>
                      {g.joined ? (
                        <button onClick={() => onOpenGroup(g.id)}>
                          Open group
                          <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              { action: "request-join", groupId: g.id },
                              "Join request saved. An administrator must accept.",
                            )
                          }
                        >
                          Request to join
                        </button>
                      )}
                    </article>
                  ))}
                  {results.souls.map((s) => (
                    <article key={s.id}>
                      <h3>{s.title}</h3>
                      <small>
                        Revision {s.revision} · @{s.authorHandle}
                      </small>
                      <p>{s.summary}</p>
                      <div className="x1-actions">
                        <button onClick={() => onOpenGroup(s.groupId)}>
                          Open shared Soul
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => bookmark("SOUL", s.id)}
                        >
                          <Bookmark size={15} />
                          Save Soul
                        </button>
                      </div>
                    </article>
                  ))}
                  {!searching &&
                    !results.bodies.length &&
                    !results.groups.length &&
                    !results.souls.length && (
                      <p className="x1-caption">
                        {search.trim()
                          ? "No permitted matches. Try an exact handle or group name."
                          : "Search for a Body, group or shared Soul."}
                      </p>
                    )}
                  {results.nextBody && (
                    <button
                      disabled={searching}
                      onClick={async () => {
                        setSearching(true);
                        try {
                          const page = await read<SearchResult>({
                            view: "search",
                            q: search,
                            kind: "bodies",
                            before: results.nextBody!,
                          });
                          setResults((old) =>
                            old
                              ? {
                                  ...old,
                                  bodies: [...old.bodies, ...page.bodies],
                                  nextBody: page.nextBody,
                                }
                              : page,
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setSearching(false);
                        }
                      }}
                    >
                      More Bodies
                    </button>
                  )}
                </div>
              )}
            </Panel>
          )}
          {view === "Messages" && (
            <div className="x2-social-messages">
              {shareSoul && !thread && (
                <p role="status" className="x2-social-share-pending">
                  Sharing {shareSoul.title}, revision {shareSoul.revision}.
                  Choose a conversation, or find a recipient in Discover.
                </p>
              )}
              <Panel title="Messages">
                <input
                  type="search"
                  aria-label="Search existing conversations"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Find a conversation"
                  maxLength={80}
                />
                <div className="x2-social-thread-list">
                  {home?.inbox
                    .filter((c) =>
                      (c.handle + " " + c.displayName)
                        .toLowerCase()
                        .includes(threadSearch.toLowerCase()),
                    )
                    .map((c) => (
                      <button
                        key={c.id}
                        aria-pressed={threadId === c.id}
                        onClick={() => {
                          setThreadId(c.id);
                          setThread(null);
                        }}
                      >
                        <strong>@{c.handle}</strong>
                        <span>
                          {c.state === "REQUESTED"
                            ? c.requestedByMe
                              ? "Request sent"
                              : "Message request"
                            : moment(c.updatedAt)}
                          {c.unread > 0 ? ` · ${c.unread} unread` : ""}
                          {c.muted ? " · muted" : ""}
                        </span>
                      </button>
                    ))}
                  {!home?.inbox.length && (
                    <p className="x1-caption">
                      Find a researcher in Discover to start a conversation.
                    </p>
                  )}
                </div>
              </Panel>
              {thread ? (
                <Panel
                  title={"@" + thread.peer.handle}
                  action={
                    <button
                      className="x1-icon-button"
                      aria-label="Close conversation"
                      onClick={() => {
                        setThreadId("");
                        setThread(null);
                      }}
                    >
                      <X size={17} />
                    </button>
                  }
                >
                  <div className="x1-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          {
                            action: "thread-view",
                            threadId: thread.id,
                            muted: !thread.preferences.muted,
                            hidden: false,
                          },
                          thread.preferences.muted
                            ? "Conversation unmuted."
                            : "Conversation muted.",
                        )
                      }
                    >
                      {thread.preferences.muted ? "Unmute" : "Mute"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await mutate(
                            {
                              action: "thread-view",
                              threadId: thread.id,
                              muted: !!thread.preferences.muted,
                              hidden: true,
                            },
                            "Hidden from your inbox. Messages are not deleted.",
                          )
                        ) {
                          setThreadId("");
                          setThread(null);
                        }
                      }}
                    >
                      Hide
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await mutate(
                            {
                              action: "block",
                              handle: thread.peer.handle,
                              active: true,
                            },
                            "Body blocked.",
                          )
                        ) {
                          setThreadId("");
                          setThread(null);
                        }
                      }}
                    >
                      Block
                    </button>
                  </div>
                  {thread.state === "REQUESTED" && (
                    <div className="x1-callout">
                      <p>
                        {thread.requestedByMe
                          ? "Request sent. One introductory message is allowed before acceptance."
                          : "Accept this request to allow replies."}
                      </p>
                      {!thread.requestedByMe && (
                        <div className="x1-actions">
                          <button
                            disabled={busy}
                            onClick={() =>
                              mutate(
                                { action: "accept-thread", threadId },
                                "Message request accepted.",
                              )
                            }
                          >
                            <Check size={15} />
                            Accept
                          </button>
                          <button
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await mutate(
                                  { action: "decline-thread", threadId },
                                  "Message request declined.",
                                )
                              ) {
                                setThreadId("");
                                setThread(null);
                              }
                            }}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {thread.nextBefore && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const page = await read<Thread>({
                          view: "thread",
                          threadId,
                          before: older.length
                            ? older[0].createdAt + "|" + older[0].id
                            : thread.nextBefore!,
                        });
                        setOlder((previous) => [...page.messages, ...previous]);
                        setThread((current) =>
                          current
                            ? { ...current, nextBefore: page.nextBefore }
                            : current,
                        );
                      }}
                    >
                      Earlier messages
                    </button>
                  )}
                  <div
                    className="x2-social-message-log"
                    role="log"
                    aria-label="Private conversation"
                  >
                    {[...older, ...thread.messages].map((m) => (
                      <article className={m.isMine ? "is-mine" : ""} key={m.id}>
                        <small>
                          @{m.authorHandle} · {moment(m.createdAt)}
                        </small>
                        <p>{m.retractedAt ? "Message retracted." : m.text}</p>
                        {m.reference && (
                          <div className="x2-social-reference">
                            {m.reference.unavailable ? (
                              "Research reference is no longer available to you."
                            ) : (
                              <>
                                <strong>
                                  {m.reference.title} · revision{" "}
                                  {m.reference.revision}
                                </strong>
                                <p>{m.reference.summary}</p>
                                <button
                                  onClick={() =>
                                    onOpenGroup(m.reference!.groupId)
                                  }
                                >
                                  Open permitted reference
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        <small>
                          {stateLabel(m.status)}
                          {m.editedAt && !m.retractedAt ? " · edited" : ""}
                        </small>
                        <div className="x1-actions">
                          {m.isMine && !m.retractedAt ? (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => setEdit(m)}
                              >
                                <Pencil size={13} />
                                Edit
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  mutate(
                                    {
                                      action: "retract-message",
                                      messageId: m.id,
                                      version: m.version,
                                    },
                                    "Message retracted.",
                                  )
                                }
                              >
                                Retract
                              </button>
                            </>
                          ) : (
                            !m.isMine && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  setReport({ kind: "MESSAGE", targetId: m.id })
                                }
                              >
                                <Flag size={13} />
                                Report
                              </button>
                            )
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  {thread.messages.length > 0 && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          {
                            action: "mark-read",
                            threadId,
                            lastMessageId: thread.messages.at(-1)!.id,
                          },
                          "Conversation marked read.",
                        )
                      }
                    >
                      Mark read
                    </button>
                  )}
                  <form
                    className="x2-social-composer"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (lock.current) return;
                      const text = drafts[threadId] || "",
                        signature =
                          threadId + "\n" + text + JSON.stringify(shareSoul);
                      if (
                        !retry.current ||
                        retry.current.signature !== signature
                      )
                        retry.current = { signature, key: id() };
                      if (
                        await mutate(
                          {
                            action: "send",
                            threadId,
                            text,
                            soulId: shareSoul?.id,
                            revision: shareSoul?.revision,
                            requestId: retry.current.key,
                          },
                          "Message saved on server.",
                        )
                      ) {
                        setDrafts((previous) => ({
                          ...previous,
                          [threadId]: "",
                        }));
                        retry.current = null;
                        onClearShare?.();
                      }
                    }}
                  >
                    {shareSoul && (
                      <div className="x2-social-reference">
                        <strong>
                          {shareSoul.title} · revision {shareSoul.revision}
                        </strong>
                        <p>
                          Reference only. Both participants must still belong to
                          its group.
                        </p>
                        <button type="button" onClick={onClearShare}>
                          Remove reference
                        </button>
                      </div>
                    )}
                    <label htmlFor="x2-message-compose">Message</label>
                    <textarea
                      id="x2-message-compose"
                      value={drafts[threadId] || ""}
                      onChange={(e) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [threadId]: e.target.value,
                        }))
                      }
                      maxLength={4000}
                      rows={3}
                      placeholder="Write a private research message"
                    />
                    <button
                      type="submit"
                      disabled={
                        busy ||
                        !(drafts[threadId] || "").trim() ||
                        thread.state === "DECLINED" ||
                        (thread.state === "REQUESTED" &&
                          (!thread.requestedByMe || thread.messages.length > 0))
                      }
                    >
                      <Send size={16} />
                      {busy ? "Sending…" : "Send"}
                    </button>
                    <small>
                      Private to both participants. No end-to-end encryption
                      claim. Read receipts are off by default.
                    </small>
                  </form>
                </Panel>
              ) : (
                <Empty title="Your research conversations">
                  Select a thread or find a Body in Discover. No simulated
                  online status or typing activity.
                </Empty>
              )}
            </div>
          )}
          {view === "Saved" && (
            <Panel title="Saved research">
              <div className="x2-social-results">
                {home?.bookmarks.map((b, i) => (
                  <article key={b.kind + ":" + i}>
                    {b.body ? (
                      <button
                        className="x2-social-profile-link"
                        onClick={() => openProfile(b.body!.handle)}
                      >
                        <Identity body={b.body} />
                      </button>
                    ) : (
                      b.soul && (
                        <>
                          <h3>{b.soul.title}</h3>
                          <p>{b.soul.summary}</p>
                          <button onClick={() => onOpenGroup(b.soul!.groupId)}>
                            Open Soul
                          </button>
                        </>
                      )
                    )}
                    <button
                      disabled={busy}
                      onClick={() =>
                        bookmark(
                          b.kind as "BODY" | "SOUL",
                          b.body?.handle || b.soul!.id,
                          false,
                        )
                      }
                    >
                      Remove bookmark
                    </button>
                  </article>
                ))}
              </div>
              {!home?.bookmarks.length && (
                <p className="x1-caption">
                  Save a permitted researcher or Soul from Discover. Revoked
                  content is hidden automatically.
                </p>
              )}
            </Panel>
          )}
          {view === "Notifications" && (
            <Panel title="Notifications">
              <div className="x2-social-results">
                {home?.invitations.map((i) => (
                  <article key={i.id}>
                    <h3>Invitation · {i.name}</h3>
                    <p>
                      {i.role} · expires {moment(i.expiresAt)}
                    </p>
                    <div className="x1-actions">
                      <button
                        disabled={busy}
                        onClick={async () => {
                          const r = await mutate(
                            { action: "accept-invitation", invitationId: i.id },
                            "Invitation accepted.",
                          );
                          if (typeof r?.groupId === "string")
                            onOpenGroup(r.groupId);
                        }}
                      >
                        Accept invitation
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            {
                              action: "decline-invitation",
                              invitationId: i.id,
                            },
                            "Invitation declined.",
                          )
                        }
                      >
                        Decline
                      </button>
                    </div>
                  </article>
                ))}
                {home?.notifications.map((n) => (
                  <article key={n.id}>
                    <h3>{n.kind.replaceAll("_", " ").toLowerCase()}</h3>
                    <small>
                      {moment(n.createdAt)} · {n.readAt ? "Read" : "Unread"}
                    </small>
                    <div className="x1-actions">
                      <button
                        onClick={() => {
                          if (n.kind === "MESSAGE") {
                            setThreadId(n.targetId);
                            onView("Messages");
                          } else onOpenGroup(n.targetId);
                        }}
                      >
                        Open
                      </button>
                      <button
                        disabled={busy || !!n.readAt}
                        onClick={() =>
                          mutate(
                            {
                              action: "read-notification",
                              notificationId: n.id,
                            },
                            "Notification marked read.",
                          )
                        }
                      >
                        Mark read
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!home?.invitations.length && !home?.notifications.length && (
                <p className="x1-caption">
                  Actual messages, invitations and group mentions appear here.
                </p>
              )}
            </Panel>
          )}
          {view === "Privacy" && home && (
            <Panel title="Research privacy">
              <form
                key={JSON.stringify(home.preferences)}
                className="x1-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await mutate(
                    {
                      action: "preferences",
                      discoverable: f.has("discoverable"),
                      receipts: f.has("receipts"),
                      notifications: f.has("notifications"),
                      messages: f.get("messages"),
                    },
                    "Privacy preferences saved.",
                  );
                }}
              >
                <label className="x1-checkbox">
                  <input
                    name="discoverable"
                    type="checkbox"
                    defaultChecked={home.preferences.discoverable}
                  />
                  Allow my Body in Site discovery
                </label>
                <label>
                  Who may start messages?
                  <select
                    name="messages"
                    defaultValue={home.preferences.messages}
                  >
                    <option value="REQUESTS">Allow message requests</option>
                    <option value="GROUPS">Shared group members only</option>
                    <option value="NONE">No incoming messages</option>
                  </select>
                </label>
                <label className="x1-checkbox">
                  <input
                    name="receipts"
                    type="checkbox"
                    defaultChecked={home.preferences.receipts}
                  />
                  Share explicit read receipts
                </label>
                <label className="x1-checkbox">
                  <input
                    name="notifications"
                    type="checkbox"
                    defaultChecked={home.preferences.notifications}
                  />
                  In-app message and group notifications
                </label>
                <button disabled={busy} type="submit">
                  <ShieldCheck size={16} />
                  {busy ? "Saving…" : "Save privacy"}
                </button>
              </form>
              <details className="x2-social-info">
                <summary>ⓘ Retention and privacy</summary>
                <p>
                  Text is stored in the existing Site database. Hide affects
                  only your inbox; Retract removes your message text for both
                  participants. Editing is allowed for 15 minutes. Block
                  prevents discovery and new messages in either direction.
                  Account erasure deletes its paired conversations; no
                  end-to-end encryption is claimed.
                </p>
              </details>
              <h3>Blocked Bodies</h3>
              {home.blocked.map((b) => (
                <div className="x2-social-block" key={b.handle}>
                  <span>@{b.handle}</span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        { action: "block", handle: b.handle, active: false },
                        "Body unblocked.",
                      )
                    }
                  >
                    Unblock
                  </button>
                </div>
              ))}
              {!home.blocked.length && (
                <p className="x1-caption">No blocked Bodies.</p>
              )}
            </Panel>
          )}
        </>
      )}
      {profile && (
        <Modal
          title={"@" + profile.body.handle}
          onClose={() => setProfile(null)}
        >
          <Identity body={profile.body} />
          <p>{profile.body.bio}</p>
          <div className="x1-actions">
            {profile.canMessage && (
              <button
                disabled={busy}
                onClick={() => message(profile.body.handle)}
              >
                <MessageSquare size={15} />
                Message
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => bookmark("BODY", profile.body.handle)}
            >
              <Bookmark size={15} />
              Save researcher
            </button>
            {!profile.isMe && (
              <>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await mutate(
                        {
                          action: "block",
                          handle: profile.body.handle,
                          active: true,
                        },
                        "Body blocked.",
                      )
                    )
                      setProfile(null);
                  }}
                >
                  Block
                </button>
                <button
                  onClick={() =>
                    setReport({ kind: "BODY", targetId: profile.body.handle })
                  }
                >
                  Report
                </button>
              </>
            )}
          </div>
          {!profile.isMe &&
            home?.groups?.some((g) => ["OWNER", "ADMIN"].includes(g.role)) && (
              <form
                className="x1-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  await mutate(
                    {
                      action: "invite-body",
                      handle: profile.body.handle,
                      groupId: f.get("groupId"),
                    },
                    "Viewer invitation saved in the recipient’s inbox.",
                  );
                }}
              >
                <label>
                  Invite to a group
                  <select name="groupId">
                    {home.groups
                      .filter((g) => ["OWNER", "ADMIN"].includes(g.role))
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button disabled={busy} type="submit">
                  Invite
                </button>
              </form>
            )}
          <p>
            <a
              href={
                "/?view=community&handle=" +
                encodeURIComponent(profile.body.handle)
              }
            >
              Profile link
            </a>
          </p>
          <h3>Research shared with you</h3>
          {profile.souls.map((s) => (
            <article className="x2-social-profile-soul" key={s.id}>
              <strong>
                {s.title} · revision {s.revision}
              </strong>
              <p>{s.summary}</p>
              <button
                onClick={() => {
                  setProfile(null);
                  onOpenGroup(s.groupId);
                }}
              >
                Open shared Soul
              </button>
            </article>
          ))}
          {!profile.souls.length && (
            <p className="x1-caption">
              No research is available in your current shared memberships.
              Public publishing remains disabled.
            </p>
          )}
        </Modal>
      )}
      {edit && (
        <Modal title="Edit message" onClose={() => setEdit(null)}>
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "edit-message",
                    messageId: edit.id,
                    version: edit.version,
                    text: f.get("text"),
                  },
                  "Message edit saved.",
                )
              )
                setEdit(null);
            }}
          >
            <label>
              Message
              <textarea
                name="text"
                defaultValue={edit.text}
                maxLength={4000}
                required
                rows={4}
              />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save edit"}
            </button>
            <small>
              15-minute edit window. Concurrent changes are rejected.
            </small>
          </form>
        </Modal>
      )}
      {report && (
        <Modal title="Report research conduct" onClose={() => setReport(null)}>
          <form
            className="x1-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  { action: "report", ...report, reason: f.get("reason") },
                  "Report saved privately for review.",
                )
              )
                setReport(null);
            }}
          >
            <label>
              Reason
              <textarea
                name="reason"
                minLength={10}
                maxLength={1000}
                required
                rows={4}
              />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Saving…" : "Submit report"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

type Discussion = {
  id: string;
  text: string;
  parentId: string | null;
  sourceUrl: string | null;
  sourceAsOf: string | null;
  createdAt: string;
  deletedAt: string | null;
  authorHandle: string;
  isMine: number;
};
type GroupNetwork = {
  group: { id: string; name: string; role: string };
  settings: {
    handle: string;
    discoverable: number;
    pinnedSoul: string | null;
  } | null;
  discussions: Discussion[];
  requests: { handle: string; displayName: string; createdAt: string }[];
  nextBefore: string | null;
};
export function GroupNetworkPanel({
  groupId,
  notify,
}: {
  groupId: string;
  notify: Notice;
}) {
  const [data, setData] = useState<GroupNetwork | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reply, setReply] = useState<Discussion | null>(null),
    [text, setText] = useState("");
  const lock = useRef(false),
    retry = useRef<{ signature: string; key: string } | null>(null);
  const refresh = useCallback(
    async () => setData(await read<GroupNetwork>({ view: "group", groupId })),
    [groupId],
  );
  useEffect(() => {
    const controller = new AbortController();
    read<GroupNetwork>({ view: "group", groupId }, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [groupId]);
  async function mutate(input: Record<string, unknown>, success: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(endpoint, input);
      await refresh();
      notify(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const admin = data && ["OWNER", "ADMIN"].includes(data.group.role);
  return (
    <Panel title="Group discussion" className="x2-social-group">
      <div aria-busy={busy}>
        {error && (
          <p className="x1-callout" role="alert">
            {error}
            <button onClick={() => refresh().catch((e) => setError(e.message))}>
              Retry
            </button>
          </p>
        )}
        {admin && (
          <details className="x2-social-info">
            <summary>Directory, pinned Soul and join requests</summary>
            <form
              key={data?.settings?.handle}
              className="x1-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await mutate(
                  {
                    action: "group-directory",
                    groupId,
                    handle: f.get("handle"),
                    discoverable: f.has("discoverable"),
                    pinnedSoul: f.get("pinnedSoul") || undefined,
                  },
                  "Group directory saved.",
                );
              }}
            >
              <label>
                Unique group handle
                <input
                  name="handle"
                  defaultValue={data?.settings?.handle || ""}
                  pattern="[A-Za-z][A-Za-z0-9_]{2,29}"
                  required
                  maxLength={30}
                />
              </label>
              <label className="x1-checkbox">
                <input
                  name="discoverable"
                  type="checkbox"
                  defaultChecked={!!data?.settings?.discoverable}
                />
                List group name and description inside this Site
              </label>
              <label>
                Pinned Soul ID
                <input
                  name="pinnedSoul"
                  defaultValue={data?.settings?.pinnedSoul || ""}
                  placeholder="Optional permitted Soul ID"
                />
              </label>
              <button disabled={busy} type="submit">
                Save directory
              </button>
              <small>
                Discovery exposes metadata only. Membership is still required
                for content. Accepted join requests receive Viewer access.
              </small>
            </form>
            {data?.requests.map((r) => (
              <div className="x2-social-block" key={r.handle}>
                <span>@{r.handle}</span>
                <div className="x1-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        {
                          action: "review-join",
                          groupId,
                          handle: r.handle,
                          accept: true,
                        },
                        "Join request accepted.",
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        {
                          action: "review-join",
                          groupId,
                          handle: r.handle,
                          accept: false,
                        },
                        "Join request declined.",
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </details>
        )}
        <div className="x2-social-discussions">
          {data?.discussions.map((d) => (
            <article key={d.id} className={d.parentId ? "is-reply" : ""}>
              <small>
                @{d.authorHandle} · {moment(d.createdAt)}
                {d.parentId ? " · reply" : ""}
              </small>
              <p>{d.deletedAt ? "Discussion removed." : d.text}</p>
              {d.sourceUrl && (
                <a href={d.sourceUrl} target="_blank" rel="noreferrer noopener">
                  Source{d.sourceAsOf ? " · " + d.sourceAsOf : ""}
                </a>
              )}
              <div className="x1-actions">
                {!d.deletedAt && (
                  <button disabled={busy} onClick={() => setReply(d)}>
                    Reply
                  </button>
                )}
                {!d.deletedAt && (d.isMine || admin) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        {
                          action: "remove-discussion",
                          groupId,
                          discussionId: d.id,
                        },
                        "Discussion removed.",
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {data?.nextBefore && (
          <button
            disabled={busy}
            onClick={async () => {
              const page = await read<GroupNetwork>({
                view: "group",
                groupId,
                before: data.nextBefore!,
              });
              setData((old) =>
                old
                  ? {
                      ...page,
                      discussions: [...page.discussions, ...old.discussions],
                    }
                  : page,
              );
            }}
          >
            Earlier discussion
          </button>
        )}
        {!data?.discussions.length && (
          <p className="x1-caption">
            Discuss a method, share a permitted research summary, or mention a
            current member with @Body. Do not paste restricted raw data.
          </p>
        )}
        <form
          className="x2-social-composer"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              sourceUrl = String(f.get("sourceUrl") || ""),
              sourceAsOf = String(f.get("sourceAsOf") || ""),
              signature = [
                groupId,
                text,
                reply?.id,
                sourceUrl,
                sourceAsOf,
              ].join("|");
            if (!retry.current || retry.current.signature !== signature)
              retry.current = { signature, key: id() };
            if (
              await mutate(
                {
                  action: "discussion",
                  groupId,
                  parentId: reply?.id,
                  text,
                  sourceUrl: sourceUrl || undefined,
                  sourceAsOf: sourceAsOf || undefined,
                  requestId: retry.current.key,
                },
                "Discussion saved.",
              )
            ) {
              setText("");
              setReply(null);
              retry.current = null;
            }
          }}
        >
          {reply && (
            <p>
              Reply to @{reply.authorHandle}
              <button
                type="button"
                aria-label="Cancel discussion reply"
                onClick={() => setReply(null)}
              >
                <X size={13} />
              </button>
            </p>
          )}
          <label htmlFor={"x2-discussion-" + groupId}>
            Research discussion
          </label>
          <textarea
            id={"x2-discussion-" + groupId}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            required
            placeholder="A question, methodology or permitted analysis summary"
          />
          <details className="x2-social-info">
            <summary>Add source and observation date</summary>
            <label>
              HTTPS source
              <input
                name="sourceUrl"
                type="url"
                placeholder="https://…"
                maxLength={1000}
              />
            </label>
            <label>
              Observation date
              <input
                name="sourceAsOf"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
          </details>
          <button type="submit" disabled={busy || !text.trim()}>
            <Send size={15} />
            {busy ? "Saving…" : "Post discussion"}
          </button>
        </form>
      </div>
    </Panel>
  );
}
