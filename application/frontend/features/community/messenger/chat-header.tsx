"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  EyeOff,
  Flag,
  MoreVertical,
  ShieldBan,
  User,
} from "lucide-react";
import AvatarBadge from "../../account/avatar-badge";
import type { ChatThread } from "./types";

type Props = {
  thread: ChatThread;
  busy: boolean;
  onBack: () => void;
  onOpenProfile: (handle: string) => void;
  onToggleMute: () => void;
  onHideThread: () => void;
  onBlockPeer: () => void;
  onReportPeer: () => void;
};

export default function ChatHeader({
  thread,
  busy,
  onBack,
  onOpenProfile,
  onToggleMute,
  onHideThread,
  onBlockPeer,
  onReportPeer,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"hide" | "block" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="x54-chat-header">
        <button
          type="button"
          className="x54-chat-back-btn"
          aria-label="Back to chats"
          onClick={onBack}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="x54-chat-peer-btn"
          aria-label={`Open @${thread.peer.handle} public profile`}
          onClick={() => onOpenProfile(thread.peer.handle)}
        >
          <AvatarBadge
            avatarId={thread.peer.avatar}
            displayName={thread.peer.displayName}
            size={38}
          />
          <span className="x54-chat-peer-meta">
            <strong>{thread.peer.displayName || `@${thread.peer.handle}`}</strong>
            <span>
              @{thread.peer.handle}
              {thread.preferences.muted ? " · Muted" : ""}
            </span>
          </span>
        </button>

        <div className="x54-chat-menu-anchor" ref={menuRef}>
          <button
            type="button"
            className="x54-chat-menu-btn"
            aria-label="Conversation options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            disabled={busy}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={19} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="x54-dropdown-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenProfile(thread.peer.handle);
                }}
              >
                <User size={15} aria-hidden="true" />
                <span>View profile</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleMute();
                }}
              >
                {thread.preferences.muted ? (
                  <Bell size={15} aria-hidden="true" />
                ) : (
                  <BellOff size={15} aria-hidden="true" />
                )}
                <span>{thread.preferences.muted ? "Unmute" : "Mute notifications"}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmKind("hide");
                }}
              >
                <EyeOff size={15} aria-hidden="true" />
                <span>Hide conversation</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onReportPeer();
                }}
              >
                <Flag size={15} aria-hidden="true" />
                <span>Report @{thread.peer.handle}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmKind("block");
                }}
              >
                <ShieldBan size={15} aria-hidden="true" />
                <span>Block @{thread.peer.handle}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {confirmKind && (
        <div
          className="x54-chat-confirm-bar"
          role="alertdialog"
          aria-label={confirmKind === "block" ? "Confirm block" : "Confirm hide"}
        >
          <span>
            {confirmKind === "block"
              ? `Block @${thread.peer.handle}? They won't be able to message you.`
              : "Hide this chat from your inbox? Existing messages stay saved on server."}
          </span>
          <div className="x54-chat-confirm-actions">
            <button
              type="button"
              className="x54-tiny-btn"
              onClick={() => setConfirmKind(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={confirmKind === "block" ? "x54-btn-danger" : "x54-btn-primary"}
              disabled={busy}
              onClick={() => {
                const action = confirmKind;
                setConfirmKind(null);
                if (action === "block") onBlockPeer();
                else onHideThread();
              }}
            >
              {confirmKind === "block" ? "Block" : "Hide"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
