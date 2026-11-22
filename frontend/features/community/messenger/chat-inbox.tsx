"use client";
import { useState } from "react";
import { BellOff, Info, MessageSquarePlus, Search, X } from "lucide-react";
import AvatarBadge from "../../account/avatar-badge";
import {
  inboxPreviewText,
  inboxTimeLabel,
  type InboxThread,
} from "./types";

type Props = {
  items: InboxThread[];
  activeThreadId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectThread: (threadId: string) => void;
  onOpenProfile: (handle: string) => void;
  onStartByHandle: (
    handle: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  busy: boolean;
};

export default function ChatInbox({
  items,
  activeThreadId,
  query,
  onQueryChange,
  onSelectThread,
  onOpenProfile,
  onStartByHandle,
  busy,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newChatError, setNewChatError] = useState("");

  const q = query.trim().replace(/^@+/, "").toLowerCase();
  const filtered = items.filter(
    (c) =>
      !q ||
      c.handle.toLowerCase().includes(q) ||
      c.displayName.toLowerCase().includes(q) ||
      (c.lastMessageText ?? "").toLowerCase().includes(q),
  );

  async function submitNewChat(e: React.FormEvent) {
    e.preventDefault();
    const clean = newHandle.trim().replace(/^@+/, "");
    if (!clean) return;
    setNewChatError("");
    const result = await onStartByHandle(clean);
    if (result?.ok) {
      setNewHandle("");
      setNewChatError("");
      setNewChatOpen(false);
    } else {
      setNewChatError(result?.error || "Unable to start chat. Check the Body ID and try again.");
    }
  }

  return (
    <aside className="x54-chat-inbox" aria-label="Direct message inbox">
      <div className="x54-inbox-head">
        <div className="x54-inbox-title-row">
          <h3>Chats</h3>
          <div className="x54-inbox-head-actions">
            <button
              type="button"
              className="x54-inbox-icon-btn"
              aria-label="Messaging privacy notice"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((v) => !v)}
            >
              <Info size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="x54-inbox-icon-btn"
              aria-label="Start new chat by Body ID"
              aria-expanded={newChatOpen}
              onClick={() => setNewChatOpen((v) => !v)}
            >
              <MessageSquarePlus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {infoOpen && (
          <div className="x54-inbox-info-box" role="note">
            <span>
              Messages are private to participants and server-authorized, but not
              end-to-end encrypted. Manage DM permissions in Account &amp; Preferences.
            </span>
            <button
              type="button"
              aria-label="Dismiss notice"
              onClick={() => setInfoOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {newChatOpen && (
          <div className="x55-new-chat-wrap">
            <form className="x54-new-chat-bar" onSubmit={submitNewChat}>
              <input
                value={newHandle}
                onChange={(e) => {
                  setNewHandle(e.target.value);
                  if (newChatError) setNewChatError("");
                }}
                placeholder="Enter @BodyID…"
                aria-label="Start chat with Body ID"
                autoFocus
              />
              <button
                type="submit"
                className="x54-btn-primary"
                disabled={busy || !newHandle.trim()}
              >
                Chat
              </button>
            </form>
            {newChatError && (
              <p className="x55-inline-error" role="alert">
                {newChatError}
              </p>
            )}
          </div>
        )}

        <div className="x54-inbox-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search chats…"
            aria-label="Filter direct message inbox"
          />
          {query && (
            <button
              type="button"
              className="x54-clear-input"
              aria-label="Clear chat search"
              onClick={() => onQueryChange("")}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="x54-inbox-list" role="list">
        {filtered.map((c) => {
          const isActive = activeThreadId === c.id;
          const stamp = inboxTimeLabel(c.lastMessageAt || c.updatedAt);
          const preview = inboxPreviewText(c);
          return (
            <div
              key={c.id}
              role="listitem"
              className={"x54-inbox-row" + (isActive ? " is-active" : "")}
            >
              <button
                type="button"
                className="x54-inbox-avatar-btn"
                aria-label={`Open @${c.handle} profile`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProfile(c.handle);
                }}
              >
                <AvatarBadge
                  avatarId={c.avatar}
                  displayName={c.displayName}
                  size={44}
                />
              </button>
              <button
                type="button"
                className="x54-inbox-main-btn"
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelectThread(c.id)}
              >
                <div className="x54-inbox-row-top">
                  <span className="x54-inbox-name-wrap">
                    <strong>{c.displayName || `@${c.handle}`}</strong>
                    <span className="x54-inbox-handle">@{c.handle}</span>
                  </span>
                  <span className="x54-inbox-time">{stamp}</span>
                </div>
                <div className="x54-inbox-row-bottom">
                  <span
                    className={
                      "x54-inbox-preview" +
                      (c.lastMessageRetracted ? " is-retracted" : "") +
                      (c.state === "REQUESTED" && !c.requestedByMe ? " is-request" : "")
                    }
                  >
                    {preview}
                  </span>
                  <span className="x54-inbox-badges">
                    {!!c.muted && (
                      <BellOff
                        size={13}
                        className="x54-muted-icon"
                        aria-label="Muted"
                      />
                    )}
                    {c.unread > 0 && (
                      <span
                        className="x54-unread-pill"
                        aria-label={`${c.unread} unread`}
                      >
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="x54-inbox-empty">
            {items.length === 0 ? (
              <>
                <strong>No direct messages yet</strong>
                <p>
                  Tap any researcher&apos;s @BodyID or use the new chat button above
                  to send a private message.
                </p>
              </>
            ) : (
              <>
                <strong>No matching chats</strong>
                <p>No conversation matched &ldquo;{query}&rdquo;.</p>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
