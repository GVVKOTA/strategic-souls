"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Send,
  Bookmark,
  ShieldCheck,
  MessageSquare,
  X,
  ArrowRight,
} from "lucide-react";
import {
  api,
  copyTextSafe,
  Empty,
  Modal,
  Panel,
  moment,
  type Notice,
} from "../../components/workspace/shared";
import AvatarBadge from "../account/avatar-badge";
import ChatInbox from "./messenger/chat-inbox";
import ConversationView from "./messenger/conversation-view";
import {
  mergeUniqueMessages,
  type ChatBody,
  type ChatMessage,
  type ChatThread,
  type InboxThread,
  type SharedSoulRef,
} from "./messenger/types";

export type SocialView =
  | "Discover"
  | "Messages"
  | "Saved"
  | "Notifications"
  | "Privacy";

type Group = {
  id: string;
  name: string;
  description: string;
  handle: string;
  joined: number;
};

type SearchResult = {
  bodies: ChatBody[];
  groups: Group[];
  souls: SharedSoulRef[];
  nextBody: string | null;
};

type Preferences = {
  discoverable: boolean;
  messages: string;
  receipts: boolean;
  notifications: boolean;
};

type Home = {
  body: ChatBody | null;
  preferences: Preferences;
  inbox: InboxThread[];
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
  bookmarks: {
    kind: string;
    body?: ChatBody;
    soul?: SharedSoulRef;
    createdAt: string;
  }[];
  blocked: ChatBody[];
};

const endpoint = "/api/x2/social";
const newId = () => crypto.randomUUID();

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

function Identity({ body }: { body: ChatBody }) {
  return (
    <span className="x2-social-identity">
      <AvatarBadge avatarId={body.avatar} size={36} ring alt="" />
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
  initialThreadId = "",
  initialMessageId = "",
  onClearInitialThread,
  onOpenProfile,
  onOpenGroup,
  onOpenNotification,
  shareSoul,
  onClearShare,
  onMobileChatActive,
}: {
  view: SocialView;
  onView: (view: SocialView) => void;
  notify: Notice;
  query?: string;
  initialThreadId?: string;
  initialMessageId?: string;
  onClearInitialThread?: () => void;
  onOpenProfile?: (handle: string) => void;
  onOpenGroup: (id: string) => void;
  onOpenNotification?: (id: string) => void;
  shareSoul?: { id: string; revision: number; title: string } | null;
  onClearShare?: () => void;
  onMobileChatActive?: (active: boolean) => void;
}) {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(query);
  const [kind, setKind] = useState("all");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [threadId, setThreadId] = useState(initialThreadId || "");
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [threadSearch, setThreadSearch] = useState("");
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [report, setReport] = useState<{ kind: string; targetId: string } | null>(
    null,
  );
  const lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const mounted = useRef(true);
  const pushedMobileHistoryRef = useRef(false);
  const activeThreadIdRef = useRef(initialThreadId || "");
  const inboxFetchSeqRef = useRef(0);
  const threadFetchSeqRef = useRef(0);
  const olderFetchSeqRef = useRef(0);
  const threadAbortRef = useRef<AbortController | null>(null);
  const olderAbortRef = useRef<AbortController | null>(null);
  const inFlightMarkReadRef = useRef<Set<string>>(new Set());

  const selectThread = useCallback((nextId: string) => {
    const prevId = activeThreadIdRef.current;
    activeThreadIdRef.current = nextId;
    if (nextId !== prevId) {
      threadAbortRef.current?.abort();
      olderAbortRef.current?.abort();
      threadFetchSeqRef.current += 1;
      olderFetchSeqRef.current += 1;
      setThread(null);
      setOlder([]);
      setOlderError("");
      setEditing(null);
      setEditText("");
      setError("");
    }
    setThreadId(nextId);
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++inboxFetchSeqRef.current;
    const next = await read<Home>({ view: "home" });
    if (!mounted.current || seq !== inboxFetchSeqRef.current) return;
    setHome(next);
    setError("");
    setLoading(false);
    const unreadNotifications = next.notifications.filter((n) => !n.readAt).length;
    const unreadChats = next.inbox.reduce(
      (sum, t) => sum + Math.max(0, Number(t.unread || 0)),
      0,
    );
    window.dispatchEvent(
      new CustomEvent("ss-unread-synced", { detail: unreadNotifications }),
    );
    window.dispatchEvent(
      new CustomEvent("ss-chat-unread-synced", { detail: unreadChats }),
    );
  }, []);

  const refreshThread = useCallback(async (targetId?: string) => {
    const activeId = targetId ?? activeThreadIdRef.current;
    if (!activeId) return;
    threadAbortRef.current?.abort();
    const controller = new AbortController();
    threadAbortRef.current = controller;
    const seq = ++threadFetchSeqRef.current;
    try {
      const next = await read<ChatThread>(
        { view: "thread", threadId: activeId },
        controller.signal,
      );
      if (
        !mounted.current ||
        controller.signal.aborted ||
        seq !== threadFetchSeqRef.current ||
        activeThreadIdRef.current !== activeId ||
        next.id !== activeId
      ) {
        return;
      }
      setThread((prev) => {
        if (!prev || prev.id !== next.id) return next;
        // Preserve deeper nextBefore cursor if earlier pages are already loaded
        return {
          ...next,
          nextBefore: prev.nextBefore === null ? null : next.nextBefore,
          messages: mergeUniqueMessages(
            prev.messages.filter((m) => next.messages.some((nm) => nm.id === m.id)),
            next.messages,
          ),
        };
      });
      // Synchronize already-loaded older pages with monotonic merge (never downgrading edits/retractions/receipts)
      setOlder((prev) => {
        if (prev.length === 0) return prev;
        const latestIds = new Set(next.messages.map((m) => m.id));
        const overlappingLatest = next.messages.filter((m) =>
          prev.some((o) => o.id === m.id),
        );
        if (overlappingLatest.length === 0) return prev;
        const merged = mergeUniqueMessages(prev, overlappingLatest);
        return merged.filter((m) => prev.some((o) => o.id === m.id) || latestIds.has(m.id));
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || controller.signal.aborted) {
        return;
      }
      throw e;
    }
  }, []);

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
      threadAbortRef.current?.abort();
      olderAbortRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!initialThreadId) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      selectThread(initialThreadId);
      onClearInitialThread?.();
    });
    return () => {
      alive = false;
    };
  }, [initialThreadId, onClearInitialThread, selectThread]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setSearch(query);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  // Load selected thread with abort + sequence + activeThreadId verification
  useEffect(() => {
    activeThreadIdRef.current = threadId;
    if (!threadId) {
      threadAbortRef.current?.abort();
      olderAbortRef.current?.abort();
      let alive = true;
      queueMicrotask(() => {
        if (!alive) return;
        setThread(null);
        setOlder([]);
        setOlderError("");
        setEditing(null);
        setLoadingThread(false);
      });
      return () => {
        alive = false;
      };
    }
    threadAbortRef.current?.abort();
    olderAbortRef.current?.abort();
    const controller = new AbortController();
    threadAbortRef.current = controller;
    const seq = ++threadFetchSeqRef.current;
    const requestedId = threadId;
    queueMicrotask(() => {
      if (!controller.signal.aborted && activeThreadIdRef.current === requestedId) {
        setLoadingThread(true);
        setOlderError("");
      }
    });
    read<ChatThread>({ view: "thread", threadId: requestedId }, controller.signal)
      .then((s) => {
        if (
          !mounted.current ||
          controller.signal.aborted ||
          seq !== threadFetchSeqRef.current ||
          activeThreadIdRef.current !== requestedId ||
          s.id !== requestedId
        ) {
          return;
        }
        setThread(s);
        setError("");
        setOlder([]);
        setOlderError("");
      })
      .catch((e) => {
        if (
          controller.signal.aborted ||
          (e as Error)?.name === "AbortError" ||
          activeThreadIdRef.current !== requestedId
        ) {
          return;
        }
        setError((e as Error).message);
      })
      .finally(() => {
        if (
          mounted.current &&
          !controller.signal.aborted &&
          seq === threadFetchSeqRef.current
        ) {
          setLoadingThread(false);
        }
      });
    return () => controller.abort();
  }, [threadId]);

  // Mobile single-pane full-screen active chat state + browser Back handling + bottom nav hide
  useEffect(() => {
    const active = view === "Messages" && !!threadId;
    onMobileChatActive?.(active);
    window.dispatchEvent(
      new CustomEvent("x54-mobile-chat-active", { detail: active }),
    );
    return () => {
      onMobileChatActive?.(false);
      window.dispatchEvent(
        new CustomEvent("x54-mobile-chat-active", { detail: false }),
      );
    };
  }, [onMobileChatActive, threadId, view]);

  useEffect(() => {
    if (view !== "Messages" || !threadId) return;
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && !pushedMobileHistoryRef.current) {
      try {
        window.history.pushState({ x54ChatThread: threadId }, "", window.location.href);
        pushedMobileHistoryRef.current = true;
      } catch {
        /* History API optional */
      }
    }
    const onPop = (e: PopStateEvent) => {
      // If returning from a nested PublicProfileSheet back to this open chat thread, stay in the thread!
      if (
        e.state &&
        typeof e.state === "object" &&
        (e.state as { x54ChatThread?: string }).x54ChatThread === threadId
      ) {
        return;
      }
      pushedMobileHistoryRef.current = false;
      selectThread("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [selectThread, threadId, view]);

  // Background refresh while tab is visible + immediate sync on foreground return
  useEffect(() => {
    if (view !== "Messages" && view !== "Notifications") return;
    const syncNow = () => {
      if (document.visibilityState !== "visible" || lock.current) return;
      Promise.all([refresh(), refreshThread()]).catch(() => {
        /* Visible refresh remains available; never simulate incoming status. */
      });
    };
    const timer = setInterval(syncNow, 12000);
    document.addEventListener("visibilitychange", syncNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", syncNow);
    };
  }, [view, refresh, refreshThread]);

  // Discover search
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

  async function mutate(
    input: Record<string, unknown>,
    success?: string,
    targetThreadId?: string,
  ): Promise<Record<string, unknown> | null> {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    const activeTargetId = targetThreadId ?? activeThreadIdRef.current;
    try {
      const result = await api<Record<string, unknown>>(endpoint, input);
      // Immediately merge server-confirmed message snapshot so state stays consistent even if follow-up poll fails
      const confirmedMsg = result.message as
        | (ChatMessage & { threadId?: string })
        | undefined;
      if (
        confirmedMsg &&
        typeof confirmedMsg.id === "string" &&
        activeThreadIdRef.current &&
        (!confirmedMsg.threadId ||
          confirmedMsg.threadId === activeThreadIdRef.current)
      ) {
        const cleanMsg: ChatMessage = {
          id: confirmedMsg.id,
          text: confirmedMsg.text,
          authorHandle: confirmedMsg.authorHandle,
          isMine: confirmedMsg.isMine,
          createdAt: confirmedMsg.createdAt,
          editedAt: confirmedMsg.editedAt,
          retractedAt: confirmedMsg.retractedAt,
          version: confirmedMsg.version,
          status: confirmedMsg.status,
          reference: confirmedMsg.reference ?? null,
        };
        setThread((prev) =>
          prev && prev.id === activeThreadIdRef.current
            ? { ...prev, messages: mergeUniqueMessages(prev.messages, [cleanMsg]) }
            : prev,
        );
        setOlder((prev) =>
          prev.some((m) => m.id === cleanMsg.id)
            ? mergeUniqueMessages(prev, [cleanMsg])
            : prev,
        );
      }
      if (typeof result.unreadNotifications === "number") {
        window.dispatchEvent(
          new CustomEvent("ss-unread-synced", {
            detail: result.unreadNotifications,
          }),
        );
      }
      // Best-effort follow-up refresh — never roll back or falsely report failure of an already committed mutation
      try {
        await refresh();
        if (activeTargetId && activeThreadIdRef.current === activeTargetId) {
          await refreshThread(activeTargetId);
        }
      } catch {
        /* Confirmed write stands; next sync or manual retry refreshes full state. */
      }
      if (success) notify(success);
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

  const autoMarkRead = useCallback(
    async (activeThreadId: string, lastMessageId: string): Promise<boolean> => {
      const key = `${activeThreadId}:${lastMessageId}`;
      if (inFlightMarkReadRef.current.has(key)) return false;
      inFlightMarkReadRef.current.add(key);
      try {
        const res = await api<{
          saved?: boolean;
          unread?: number;
          unreadNotifications?: number;
        }>(endpoint, {
          action: "mark-read",
          threadId: activeThreadId,
          lastMessageId,
        });
        if (!mounted.current) return true;
        const authoritativeUnread =
          typeof res.unread === "number" ? Math.max(0, res.unread) : 0;
        setHome((prev) => {
          if (!prev) return prev;
          const nextInbox = prev.inbox.map((item) =>
            item.id === activeThreadId
              ? { ...item, unread: authoritativeUnread }
              : item,
          );
          const totalUnread = nextInbox.reduce(
            (sum, t) => sum + Math.max(0, Number(t.unread || 0)),
            0,
          );
          window.dispatchEvent(
            new CustomEvent("ss-chat-unread-synced", { detail: totalUnread }),
          );
          return {
            ...prev,
            inbox: nextInbox,
          };
        });
        if (typeof res.unreadNotifications === "number") {
          window.dispatchEvent(
            new CustomEvent("ss-unread-synced", {
              detail: res.unreadNotifications,
            }),
          );
        }
        return true;
      } catch {
        return false;
      } finally {
        inFlightMarkReadRef.current.delete(key);
      }
    },
    [],
  );

  async function startChatByHandle(
    handle: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const clean = handle.trim().replace(/^@+/, "");
    if (!clean) return { ok: false, error: "Enter a Body ID." };
    if (lock.current) return { ok: false, error: "Please wait for the current action to finish." };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api<Record<string, unknown>>(endpoint, {
        action: "start-thread",
        handle: clean,
      });
      try {
        await refresh();
      } catch {
        /* Inbox refreshes on next poll if transient network hiccup occurs */
      }
      if (typeof r?.threadId === "string") {
        selectThread(r.threadId);
        onView("Messages");
        return { ok: true };
      }
      return { ok: false, error: "Unable to open chat with that Body ID." };
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      notify(message, true);
      return { ok: false, error: message };
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function closeThreadToInbox() {
    selectThread("");
    if (pushedMobileHistoryRef.current) {
      pushedMobileHistoryRef.current = false;
      try {
        window.history.back();
      } catch {
        /* Ignore */
      }
    }
  }

  async function handleSend() {
    const targetId = activeThreadIdRef.current;
    if (!targetId || lock.current) return;
    const text = (drafts[targetId] || "").trim();
    if (!text) return;
    const signature = targetId + "\n" + text + JSON.stringify(shareSoul);
    if (!retry.current || retry.current.signature !== signature) {
      retry.current = { signature, key: newId() };
    }
    const res = await mutate(
      {
        action: "send",
        threadId: targetId,
        text,
        soulId: shareSoul?.id,
        revision: shareSoul?.revision,
        requestId: retry.current.key,
      },
      undefined,
      targetId,
    );
    if (res) {
      setDrafts((previous) => ({ ...previous, [targetId]: "" }));
      retry.current = null;
      onClearShare?.();
    }
  }

  async function handleSaveEdit() {
    if (!editing || lock.current) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    const res = await mutate(
      {
        action: "edit-message",
        messageId: editing.id,
        version: editing.version,
        text: trimmed,
      },
      "Message edited.",
    );
    if (res) {
      setEditing(null);
      setEditText("");
    }
  }

  function openCanonicalProfile(handle: string) {
    if (onOpenProfile) {
      onOpenProfile(handle);
    }
  }

  function bookmark(kindName: "BODY" | "SOUL", targetId: string, active = true) {
    return mutate(
      { action: "bookmark", kind: kindName, targetId, active },
      active ? "Saved." : "Removed from Saved.",
    );
  }

  const unread =
    home?.notifications.filter((n) => !n.readAt).length ?? 0;

  return (
    <section
      className="x2-social"
      aria-label="Direct messages and community connections"
    >
      {error && (
        <div className="x1-callout" role="alert" style={{ marginBottom: 10 }}>
          <strong>{error}</strong>{" "}
          <button
            type="button"
            className="x1-text-button"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Retry
          </button>
        </div>
      )}

      {loading && !home ? (
        <Panel title="Loading chats…">
          <div className="x55-feed-skeleton" aria-busy="true">
            <div className="x55-skel-card" style={{ height: 64 }} />
            <div className="x55-skel-card" style={{ height: 64 }} />
          </div>
        </Panel>
      ) : !home?.body ? (
        <Panel title="Create a Body ID to start chatting">
          <Empty title="Create a Body ID to message researchers">
            Your Body ID is your unique public identity. Create Souls, publish
            research, and connect with other researchers in Account &amp; Preferences.
          </Empty>
        </Panel>
      ) : (
        <>
          {view === "Messages" && (
            <div
              className={
                "x54-messenger-shell" + (threadId ? " has-active-thread" : "")
              }
            >
              <ChatInbox
                items={home.inbox}
                activeThreadId={threadId}
                query={threadSearch}
                onQueryChange={setThreadSearch}
                onSelectThread={(idToOpen) => {
                  selectThread(idToOpen);
                }}
                onOpenProfile={openCanonicalProfile}
                onStartByHandle={startChatByHandle}
                busy={busy}
              />

              <ConversationView
                thread={thread}
                initialMessageId={threadId === initialThreadId ? initialMessageId : ""}
                hasActiveThread={!!threadId}
                older={older}
                olderError={olderError}
                loadingThread={loadingThread}
                busy={busy}
                draft={editing ? editText : drafts[threadId] || ""}
                onDraftChange={(val) => {
                  if (editing) setEditText(val);
                  else setDrafts((prev) => ({ ...prev, [threadId]: val }));
                }}
                editingMessage={editing}
                onStartEdit={(m) => {
                  setEditing(m);
                  setEditText(m.text);
                }}
                onCancelEdit={() => {
                  setEditing(null);
                  setEditText("");
                }}
                onSubmitSend={() => void handleSend()}
                onSubmitEdit={() => void handleSaveEdit()}
                onRetract={(m) =>
                  void mutate(
                    {
                      action: "retract-message",
                      messageId: m.id,
                      version: m.version,
                    },
                    "Message retracted.",
                  )
                }
                onReportMessage={(m) =>
                  setReport({ kind: "MESSAGE", targetId: m.id })
                }
                onReportPeer={() => {
                  if (thread) {
                    setReport({ kind: "BODY", targetId: thread.peer.handle });
                  }
                }}
                onCopyText={(txt) => {
                  void copyTextSafe(txt).then((ok) => {
                    notify(
                      ok
                        ? "Copied message text."
                        : "Unable to copy to clipboard on this browser.",
                      !ok,
                    );
                  });
                }}
                onBack={closeThreadToInbox}
                onOpenProfile={openCanonicalProfile}
                onOpenGroup={onOpenGroup}
                onToggleMute={() => {
                  if (!thread) return;
                  void mutate(
                    {
                      action: "thread-view",
                      threadId: thread.id,
                      muted: !thread.preferences.muted,
                      hidden: false,
                    },
                    thread.preferences.muted
                      ? "Conversation unmuted."
                      : "Conversation muted.",
                  );
                }}
                onHideThread={async () => {
                  if (!thread) return;
                  if (
                    await mutate(
                      {
                        action: "thread-view",
                        threadId: thread.id,
                        muted: !!thread.preferences.muted,
                        hidden: true,
                      },
                      "Hidden from inbox.",
                    )
                  ) {
                    closeThreadToInbox();
                  }
                }}
                onBlockPeer={async () => {
                  if (!thread) return;
                  if (
                    await mutate(
                      {
                        action: "block",
                        handle: thread.peer.handle,
                        active: true,
                      },
                      `Blocked @${thread.peer.handle}.`,
                    )
                  ) {
                    closeThreadToInbox();
                  }
                }}
                onAcceptRequest={() =>
                  void mutate(
                    { action: "accept-thread", threadId },
                    "Message request accepted.",
                  )
                }
                onDeclineRequest={async () => {
                  if (
                    await mutate(
                      { action: "decline-thread", threadId },
                      "Message request declined.",
                    )
                  ) {
                    closeThreadToInbox();
                  }
                }}
                onLoadEarlier={async () => {
                  const requestedId = activeThreadIdRef.current;
                  if (!requestedId || !thread || thread.id !== requestedId || !thread.nextBefore) {
                    return;
                  }
                  olderAbortRef.current?.abort();
                  const controller = new AbortController();
                  olderAbortRef.current = controller;
                  const seq = ++olderFetchSeqRef.current;
                  setOlderError("");
                  const beforeCursor = older.length
                    ? older[0].createdAt + "|" + older[0].id
                    : thread.nextBefore;
                  try {
                    const page = await read<ChatThread>(
                      {
                        view: "thread",
                        threadId: requestedId,
                        before: beforeCursor,
                      },
                      controller.signal,
                    );
                    if (
                      !mounted.current ||
                      controller.signal.aborted ||
                      seq !== olderFetchSeqRef.current ||
                      activeThreadIdRef.current !== requestedId ||
                      page.id !== requestedId
                    ) {
                      return;
                    }
                    setOlder((previous) => mergeUniqueMessages(page.messages, previous));
                    setThread((current) =>
                      current && current.id === requestedId
                        ? { ...current, nextBefore: page.nextBefore }
                        : current,
                    );
                  } catch (e) {
                    if (
                      controller.signal.aborted ||
                      (e as Error)?.name === "AbortError" ||
                      activeThreadIdRef.current !== requestedId
                    ) {
                      return;
                    }
                    const msg =
                      (e as Error).message || "Could not load earlier messages.";
                    setOlderError(msg);
                    throw e;
                  }
                }}
                onAutoMarkRead={autoMarkRead}
                shareSoul={shareSoul}
                onClearShare={onClearShare}
              />
            </div>
          )}

          {view === "Discover" && (
            <Panel title="Directory">
              <div className="x2-social-search">
                <Search size={16} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={80}
                  aria-label="Search public profiles, rooms and shared Souls"
                  placeholder="Search Body ID or Rooms"
                />
                <select
                  aria-label="Directory category"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="bodies">Profiles</option>
                  <option value="groups">Rooms</option>
                  <option value="souls">Shared Souls</option>
                </select>
              </div>
              {searching && <p className="x1-caption">Searching…</p>}
              {results && (
                <div className="x2-social-results">
                  {results.bodies.map((b) => (
                    <article className="x2-social-card" key={b.handle}>
                      <button
                        type="button"
                        className="x54-search-row-tap"
                        onClick={() => openCanonicalProfile(b.handle)}
                      >
                        <Identity body={b} />
                      </button>
                      <p>{b.bio || "Public researcher profile."}</p>
                      <div className="x1-actions">
                        <button
                          type="button"
                          onClick={() => openCanonicalProfile(b.handle)}
                        >
                          Profile
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void startChatByHandle(b.handle)}
                        >
                          <MessageSquare size={14} /> Message
                        </button>
                      </div>
                    </article>
                  ))}
                  {results.groups.map((g) => (
                    <article className="x2-social-card" key={g.id}>
                      <strong>{g.name}</strong>
                      <small>@{g.handle} · Research room</small>
                      <p>{g.description || "Private research room."}</p>
                      <div className="x1-actions">
                        {g.joined ? (
                          <button
                            type="button"
                            onClick={() => onOpenGroup(g.id)}
                          >
                            Open Room <ArrowRight size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                { action: "request-join", groupId: g.id },
                                "Join request sent.",
                              )
                            }
                          >
                            Request to join
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  {results.souls.map((s) => (
                    <article className="x2-social-card" key={s.id}>
                      <strong>{s.title}</strong>
                      <small>
                        Revision {s.revision}
                        {s.authorHandle ? ` · @${s.authorHandle}` : ""}
                      </small>
                      <p>{s.summary}</p>
                      <div className="x1-actions">
                        <button
                          type="button"
                          onClick={() => onOpenGroup(s.groupId)}
                        >
                          Open in Room
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void bookmark("SOUL", s.id)}
                        >
                          <Bookmark size={14} /> Save
                        </button>
                      </div>
                    </article>
                  ))}
                  {!results.bodies.length &&
                    !results.groups.length &&
                    !results.souls.length && (
                      <Empty title="No matching results">
                        Try another Body ID or Room name.
                      </Empty>
                    )}
                </div>
              )}
            </Panel>
          )}

          {view === "Saved" && (
            <Panel title="Saved">
              <div className="x2-social-results">
                {home.bookmarks.map((b) => (
                  <article
                    className="x2-social-card"
                    key={b.kind + (b.body?.handle || b.soul?.id)}
                  >
                    {b.body ? (
                      <>
                        <button
                          type="button"
                          className="x54-search-row-tap"
                          onClick={() => openCanonicalProfile(b.body!.handle)}
                        >
                          <Identity body={b.body} />
                        </button>
                        <p>{b.body.bio}</p>
                        <div className="x1-actions">
                          <button
                            type="button"
                            onClick={() => openCanonicalProfile(b.body!.handle)}
                          >
                            Open profile
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void bookmark("BODY", b.body!.handle, false)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : b.soul ? (
                      <>
                        <strong>{b.soul.title}</strong>
                        <p>{b.soul.summary}</p>
                        <div className="x1-actions">
                          <button
                            type="button"
                            onClick={() => onOpenGroup(b.soul!.groupId)}
                          >
                            Open Room
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void bookmark("SOUL", b.soul!.id, false)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : null}
                  </article>
                ))}
                {!home.bookmarks.length && (
                  <Empty title="Nothing saved yet">
                    Save researchers or shared Souls to return to them quickly.
                  </Empty>
                )}
              </div>
            </Panel>
          )}

          {view === "Notifications" && (
            <Panel
              title="Notifications"
              action={
                unread > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        { action: "read-notifications" },
                        "Notifications marked read.",
                      )
                    }
                  >
                    Mark all read
                  </button>
                ) : undefined
              }
            >
              {home.invitations.map((inv) => (
                <article className="x2-social-card" key={inv.id}>
                  <strong>Room invitation · {inv.name}</strong>
                  <small>
                    Role {inv.role} · expires {moment(inv.expiresAt)}
                  </small>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await mutate(
                          { action: "accept-invitation", invitationId: inv.id },
                          "Joined Research Room.",
                        )
                      ) {
                        onOpenGroup(inv.groupId);
                      }
                    }}
                  >
                    Accept invitation
                  </button>
                </article>
              ))}
              {home.notifications.map((n) => (
                <article
                  className={
                    "x2-social-card" + (n.readAt ? "" : " is-unread")
                  }
                  key={n.id}
                >
                  <strong>{n.kind.replaceAll("_", " ")}</strong>
                  <small>{moment(n.createdAt)}</small>
                  {onOpenNotification ? <button type="button" onClick={() => onOpenNotification(n.id)}>Open</button> :
                  n.kind === "MESSAGE" || n.kind === "MESSAGE_REQUEST" ? (
                    <button
                      type="button"
                      onClick={() => {
                        selectThread(n.targetId);
                        onView("Messages");
                      }}
                    >
                      Open chat
                    </button>
                  ) : n.kind === "NEW_FOLLOWER" ||
                    n.kind === "FOLLOW_REQUEST" ||
                    n.kind === "FOLLOW_APPROVED" ? (
                    <button
                      type="button"
                      onClick={() => openCanonicalProfile(n.targetId)}
                    >
                      View @{n.targetId}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenGroup(n.targetId)}
                    >
                      Open Room
                    </button>
                  )}
                </article>
              ))}
              {!home.invitations.length && !home.notifications.length && (
                <Empty title="All caught up">
                  Direct message alerts, follow activity, and room invitations
                  appear here.
                </Empty>
              )}
            </Panel>
          )}

          {view === "Privacy" && (
            <Panel title="Messaging Privacy & Blocks">
              <form
                key={JSON.stringify(home.preferences)}
                className="x1-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await mutate(
                    {
                      action: "preferences",
                      discoverable: home.preferences.discoverable,
                      messages: f.get("messages"),
                      receipts: f.has("receipts"),
                      notifications: f.has("notifications"),
                    },
                    "Messaging privacy saved.",
                  );
                }}
              >
                <label>
                  Who can send message requests
                  <select
                    name="messages"
                    defaultValue={home.preferences.messages}
                  >
                    <option value="REQUESTS">
                      Anyone via message request (approval required)
                    </option>
                    <option value="GROUPS">Shared Research Room members only</option>
                    <option value="NONE">Nobody</option>
                  </select>
                </label>
                <label className="x1-checkbox">
                  <input
                    name="receipts"
                    type="checkbox"
                    defaultChecked={home.preferences.receipts}
                  />
                  Share read receipts when I view a conversation
                </label>
                <label className="x1-checkbox">
                  <input
                    name="notifications"
                    type="checkbox"
                    defaultChecked={home.preferences.notifications}
                  />
                  Enable in-app notifications
                </label>
                <button disabled={busy} type="submit">
                  <ShieldCheck size={15} /> Save preferences
                </button>
              </form>
              <h3>Blocked accounts</h3>
              {home.blocked.map((b) => (
                <div className="x2-social-block" key={b.handle}>
                  <Identity body={b} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        { action: "block", handle: b.handle, active: false },
                        `Unblocked @${b.handle}.`,
                      )
                    }
                  >
                    Unblock
                  </button>
                </div>
              ))}
              {!home.blocked.length && (
                <p className="x1-caption">No blocked profiles.</p>
              )}
            </Panel>
          )}
        </>
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
              ) {
                setReport(null);
              }
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
                placeholder="Describe what happened…"
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
  authorAvatar?: string | null;
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
  onOpenProfile,
}: {
  groupId: string;
  notify: Notice;
  onOpenProfile?: (handle: string) => void;
}) {
  const [data, setData] = useState<GroupNetwork | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState<Discussion | null>(null);
  const [text, setText] = useState("");
  const lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);

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
    <Panel title="Room discussion" className="x2-social-group">
      <div aria-busy={busy}>
        {error && (
          <p className="x1-callout" role="alert">
            {error}{" "}
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
                  "Research Room directory saved.",
                );
              }}
            >
              <label>
                Unique Research Room handle
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
                List Research Room name and description in directory
              </label>
              <label>
                Pinned Soul ID
                <input
                  name="pinnedSoul"
                  defaultValue={data?.settings?.pinnedSoul || ""}
                  placeholder="Permitted Soul ID"
                />
              </label>
              <button disabled={busy} type="submit">
                Save directory
              </button>
              <small>
                Discovery exposes metadata only. Membership is still required
                for content.
              </small>
            </form>
            {data?.requests.map((r) => (
              <div className="x2-social-block" key={r.handle}>
                <button
                  type="button"
                  className="x1-text-button"
                  onClick={() => onOpenProfile?.(r.handle)}
                >
                  @{r.handle}
                </button>
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
              <small
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <AvatarBadge avatarId={d.authorAvatar} size={22} alt="" />
                <button
                  type="button"
                  className="x1-text-button"
                  style={{ fontSize: "inherit", padding: 0 }}
                  onClick={() => onOpenProfile?.(d.authorHandle)}
                >
                  @{d.authorHandle}
                </button>
                <span>
                  · {moment(d.createdAt)}
                  {d.parentId ? " · reply" : ""}
                </span>
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
              const requestedGroupId = groupId;
              try {
                const page = await read<GroupNetwork>({
                  view: "group",
                  groupId: requestedGroupId,
                  before: data.nextBefore!,
                });
                setData((old) =>
                  old && old.group.id === requestedGroupId
                    ? {
                        ...page,
                        discussions: [...page.discussions, ...old.discussions],
                      }
                    : old,
                );
              } catch (e) {
                setError((e as Error).message || "Unable to load earlier discussion.");
              }
            }}
          >
            Earlier discussion
          </button>
        )}
        {!data?.discussions.length && (
          <p className="x1-caption">
            Discuss a method, share a permitted research summary, or mention a
            room member with @handle.
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
              retry.current = { signature, key: newId() };
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
