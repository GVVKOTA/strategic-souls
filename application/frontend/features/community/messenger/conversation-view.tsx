"use client";
import "./messenger.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, MessageSquare, X } from "lucide-react";
import ChatHeader from "./chat-header";
import MessageBubble from "./message-bubble";
import ChatComposer from "./chat-composer";
import {
  dateDayKey,
  dateDividerLabel,
  mergeUniqueMessages,
  type ChatMessage,
  type ChatThread,
} from "./types";

type Props = {
  thread: ChatThread | null;
  hasActiveThread?: boolean;
  older: ChatMessage[];
  olderError?: string;
  initialMessageId?: string;
  loadingThread: boolean;
  busy: boolean;
  draft: string;
  onDraftChange: (text: string) => void;
  editingMessage: ChatMessage | null;
  onStartEdit: (m: ChatMessage) => void;
  onCancelEdit: () => void;
  onSubmitSend: () => void;
  onSubmitEdit: () => void;
  onRetract: (m: ChatMessage) => void;
  onReportMessage: (m: ChatMessage) => void;
  onReportPeer: () => void;
  onCopyText: (text: string) => void;
  onBack: () => void;
  onOpenProfile: (handle: string) => void;
  onOpenGroup: (groupId: string) => void;
  onToggleMute: () => void;
  onHideThread: () => void;
  onBlockPeer: () => void;
  onAcceptRequest: () => void;
  onDeclineRequest: () => void;
  onLoadEarlier: () => Promise<void>;
  onAutoMarkRead: (threadId: string, lastMessageId: string) => Promise<boolean>;
  shareSoul?: { id: string; revision: number; title: string } | null;
  onClearShare?: () => void;
};

export default function ConversationView({
  thread,
  hasActiveThread = false,
  older,
  olderError = "",
  initialMessageId = "",
  loadingThread,
  busy,
  draft,
  onDraftChange,
  editingMessage,
  onStartEdit,
  onCancelEdit,
  onSubmitSend,
  onSubmitEdit,
  onRetract,
  onReportMessage,
  onReportPeer,
  onCopyText,
  onBack,
  onOpenProfile,
  onOpenGroup,
  onToggleMute,
  onHideThread,
  onBlockPeer,
  onAcceptRequest,
  onDeclineRequest,
  onLoadEarlier,
  onAutoMarkRead,
  shareSoul,
  onClearShare,
}: Props) {
  const paneRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);
  const prevScrollHeightRef = useRef<number | null>(null);
  const confirmedReadRef = useRef<string>("");
  const lastThreadIdRef = useRef<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const messages = useMemo(
    () => (thread ? mergeUniqueMessages(older, thread.messages) : []),
    [older, thread],
  );

  // Sync Android Chrome / iOS visualViewport height & offset so virtual keyboard never obscures composer
  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const syncViewport = () => {
      el.style.setProperty("--x54-vv-height", `${Math.round(vv.height)}px`);
      el.style.setProperty("--x54-vv-top", `${Math.round(vv.offsetTop)}px`);
    };
    syncViewport();
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
    return () => {
      vv.removeEventListener("resize", syncViewport);
      vv.removeEventListener("scroll", syncViewport);
      el.style.removeProperty("--x54-vv-height");
      el.style.removeProperty("--x54-vv-top");
    };
  }, [thread?.id]);

  const lastMessageId = messages.at(-1)?.id ?? "";
  const resolvedMessage = useRef("");

  // Preserve scroll anchor on "Earlier messages", or smooth-scroll to latest when opening thread / at bottom
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log || !thread) return;
    const anchor = initialMessageId && resolvedMessage.current !== initialMessageId
      ? document.getElementById("ss-message-" + initialMessageId) : null;
    if (anchor && log.contains(anchor)) {
      resolvedMessage.current = initialMessageId;
      lastThreadIdRef.current = thread.id;
      stickBottomRef.current = false;
      prevScrollHeightRef.current = null;
      anchor.scrollIntoView({ block: "center" });
      return;
    }
    if (prevScrollHeightRef.current !== null) {
      const delta = log.scrollHeight - prevScrollHeightRef.current;
      log.scrollTop = Math.max(0, delta);
      prevScrollHeightRef.current = null;
      return;
    }
    const isNewThread = lastThreadIdRef.current !== thread.id;
    lastThreadIdRef.current = thread.id;
    if (isNewThread || stickBottomRef.current) {
      log.scrollTop = log.scrollHeight;
      stickBottomRef.current = true;
    }
  }, [thread, messages.length, lastMessageId, initialMessageId]);

  // Auto-mark read ONLY after server confirms, with visibility recovery and bounded backoff retry
  useEffect(() => {
    if (!thread) return;
    const lastIncoming = [...messages].reverse().find((m) => !m.isMine);
    if (!lastIncoming) return;
    const activeThreadId = thread.id;
    const incomingId = lastIncoming.id;
    const key = `${activeThreadId}:${incomingId}`;
    if (confirmedReadRef.current === key) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const delays = [2000, 6000, 15000];
    let attempt = 0;

    const tryMark = () => {
      if (cancelled || confirmedReadRef.current === key) return;
      if (document.visibilityState !== "visible") return;
      void onAutoMarkRead(activeThreadId, incomingId).then((ok) => {
        if (cancelled) return;
        if (ok) {
          confirmedReadRef.current = key;
        } else if (attempt < delays.length) {
          const delay = delays[attempt++];
          retryTimer = setTimeout(tryMark, delay);
        }
      });
    };

    tryMark();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        attempt = 0;
        tryMark();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [messages, onAutoMarkRead, thread]);

  function handleScroll() {
    const log = logRef.current;
    if (!log) return;
    const distFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
    stickBottomRef.current = distFromBottom < 80;
  }

  async function handleEarlierClick() {
    if (loadingOlder || !logRef.current) return;
    setLoadingOlder(true);
    prevScrollHeightRef.current = logRef.current.scrollHeight;
    try {
      await onLoadEarlier();
    } catch {
      // Preserve current reading scroll position on failure instead of jumping
      prevScrollHeightRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }

  if (!thread) {
    return (
      <div className="x54-chat-pane" ref={paneRef}>
        {hasActiveThread && (
          <header className="x54-chat-header">
            <button
              type="button"
              className="x54-chat-back-btn"
              aria-label="Back to chats"
              onClick={onBack}
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <div className="x54-chat-peer-meta">
              <strong>{loadingThread ? "Loading chat…" : "Conversation unavailable"}</strong>
            </div>
          </header>
        )}
        <div className="x54-chat-empty-pane">
          <MessageSquare size={28} aria-hidden="true" />
          <strong>
            {loadingThread ? "Loading messages…" : "Select a conversation"}
          </strong>
          <span>
            {loadingThread
              ? "Preparing your conversation."
              : "Pick a chat from the inbox or start one using a Body ID."}
          </span>
        </div>
      </div>
    );
  }

  const pendingIncomingRequest =
    thread.state === "REQUESTED" && !thread.requestedByMe;
  const pendingSentAlreadyOne =
    thread.state === "REQUESTED" &&
    thread.requestedByMe &&
    messages.some((m) => m.isMine);
  const composerDisabled =
    !editingMessage && (pendingIncomingRequest || pendingSentAlreadyOne);

  const composerPlaceholder = editingMessage
    ? "Edit message…"
    : pendingIncomingRequest
      ? "Accept request above to reply"
      : pendingSentAlreadyOne
        ? "Waiting for recipient to accept request…"
        : `Message @${thread.peer.handle}…`;

  return (
    <section
      className="x54-chat-pane"
      ref={paneRef}
      aria-label={`Chat with @${thread.peer.handle}`}
    >
      <ChatHeader
        thread={thread}
        busy={busy}
        onBack={onBack}
        onOpenProfile={onOpenProfile}
        onToggleMute={onToggleMute}
        onHideThread={onHideThread}
        onBlockPeer={onBlockPeer}
        onReportPeer={onReportPeer}
      />

      {thread.state === "REQUESTED" && (
        <div className="x54-chat-request-bar" role="status">
          <span>
            {thread.requestedByMe
              ? "Message request pending · 1 introductory message allowed until accepted."
              : `@${thread.peer.handle} sent a message request. Accept to reply.`}
          </span>
          {pendingIncomingRequest && (
            <div className="x54-chat-confirm-actions">
              <button
                type="button"
                className="x54-btn-primary"
                disabled={busy}
                onClick={onAcceptRequest}
              >
                <Check size={14} aria-hidden="true" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                className="x54-tiny-btn"
                disabled={busy}
                onClick={onDeclineRequest}
              >
                <X size={14} aria-hidden="true" />
                <span>Decline</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className="x54-chat-log"
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Direct messages"
        onScroll={handleScroll}
        onClick={(e) => {
          if (e.target === e.currentTarget && openMenuId) setOpenMenuId(null);
        }}
      >
        {thread.nextBefore && (
          <div className="x55-earlier-wrap">
            <button
              type="button"
              className="x54-earlier-btn"
              disabled={loadingOlder || busy}
              onClick={() => void handleEarlierClick()}
            >
              {loadingOlder
                ? "Loading…"
                : olderError
                  ? "Retry earlier messages"
                  : "Load earlier messages"}
            </button>
            {olderError && (
              <p className="x55-inline-error" role="alert">
                {olderError}
              </p>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <div className="x54-chat-empty-pane" style={{ padding: "24px 12px" }}>
            <span>Start the conversation with @{thread.peer.handle}.</span>
          </div>
        )}

        {messages.map((m, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const curDay = dateDayKey(m.createdAt);
          const prevDay = prev ? dateDayKey(prev.createdAt) : "";
          const showDate = curDay !== prevDay;
          const within3Min =
            prev !== null &&
            !showDate &&
            prev.isMine === m.isMine &&
            !prev.retractedAt &&
            !m.retractedAt &&
            Math.abs(Date.parse(m.createdAt) - Date.parse(prev.createdAt)) <
              180_000;

          return (
            <div key={m.id} style={{ display: "contents" }}>
              {showDate && (
                <div className="x54-date-divider" role="separator">
                  {dateDividerLabel(m.createdAt)}
                </div>
              )}
              <MessageBubble
                message={m}
                highlighted={m.id === initialMessageId}
                groupedWithPrev={within3Min}
                menuOpen={openMenuId === m.id}
                onOpenMenu={setOpenMenuId}
                onEdit={onStartEdit}
                onRetract={onRetract}
                onReport={onReportMessage}
                onCopy={onCopyText}
                onOpenGroup={onOpenGroup}
              />
            </div>
          );
        })}
      </div>

      <ChatComposer
        value={draft}
        onChange={onDraftChange}
        onSubmit={editingMessage ? onSubmitEdit : onSubmitSend}
        disabled={composerDisabled}
        sending={busy}
        placeholder={composerPlaceholder}
        editingMessage={editingMessage}
        onCancelEdit={onCancelEdit}
        shareSoul={shareSoul}
        onClearShare={onClearShare}
      />
    </section>
  );
}
