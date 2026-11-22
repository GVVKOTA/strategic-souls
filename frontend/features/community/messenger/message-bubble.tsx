"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Flag,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  shortClockTime,
  type ChatMessage,
  type SharedSoulRef,
} from "./types";

function ResearchAttachment({
  reference,
  onOpenGroup,
}: {
  reference: SharedSoulRef;
  onOpenGroup: (groupId: string) => void;
}) {
  if (reference.unavailable) {
    return (
      <div className="x54-msg-ref is-unavailable">
        Research reference no longer available.
      </div>
    );
  }
  return (
    <div className="x54-msg-ref">
      <div className="x54-msg-ref-title">
        <strong>{reference.title}</strong>
        <span>rev {reference.revision}</span>
      </div>
      {reference.summary && (
        <p className="x54-msg-ref-summary">{reference.summary}</p>
      )}
      <button
        type="button"
        className="x54-msg-ref-link"
        onClick={() => onOpenGroup(reference.groupId)}
      >
        <span>Open research reference</span>
        <ExternalLink size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

type Props = {
  message: ChatMessage;
  groupedWithPrev: boolean;
  menuOpen: boolean;
  onOpenMenu: (id: string | null) => void;
  onEdit: (message: ChatMessage) => void;
  onRetract: (message: ChatMessage) => void;
  onReport: (message: ChatMessage) => void;
  onCopy: (text: string) => void;
  onOpenGroup: (groupId: string) => void;
};

export default function MessageBubble({
  message,
  groupedWithPrev,
  menuOpen,
  onOpenMenu,
  onEdit,
  onRetract,
  onReport,
  onCopy,
  onOpenGroup,
}: Props) {
  const [confirmRetract, setConfirmRetract] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showConfirmRetract = menuOpen && confirmRetract;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setConfirmRetract(false);
        onOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmRetract(false);
        onOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onOpenMenu]);

  function clearLongPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    startPos.current = null;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (message.retractedAt) return;
    if (e.pointerType !== "touch") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = window.setTimeout(() => {
      onOpenMenu(message.id);
      pressTimer.current = null;
    }, 480);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!startPos.current) return;
    if (
      Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y) >
      10
    ) {
      clearLongPress();
    }
  }

  const time = shortClockTime(message.createdAt);

  // Single compact tombstone for retracted messages — never duplicated!
  if (message.retractedAt) {
    return (
      <div
        className={
          "x54-msg-row" +
          (message.isMine ? " is-mine" : " is-peer") +
          (groupedWithPrev ? " is-grouped" : "")
        }
        data-message-id={message.id}
      >
        <div className="x54-msg-tombstone">
          <span>Message retracted</span>
          <time dateTime={message.createdAt}>{time}</time>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "x54-msg-row" +
        (message.isMine ? " is-mine" : " is-peer") +
        (groupedWithPrev ? " is-grouped" : "") +
        (menuOpen ? " is-menu-open" : "")
      }
      data-message-id={message.id}
    >
      <div
        className="x54-msg-bubble-wrap"
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(menuOpen ? null : message.id);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
      >
        <div className={"x54-msg-bubble" + (message.isMine ? " is-mine" : " is-peer")}>
          {message.reference && (
            <ResearchAttachment
              reference={message.reference}
              onOpenGroup={onOpenGroup}
            />
          )}
          <span className="x54-msg-text">{message.text}</span>
          <span className="x54-msg-meta">
            {message.editedAt && <span className="x54-msg-edited">edited</span>}
            <time dateTime={message.createdAt}>{time}</time>
            {message.isMine && (
              <span
                className={
                  "x54-msg-state" + (message.status === "READ" ? " is-read" : "")
                }
                title={
                  message.status === "READ"
                    ? "Read receipt shared"
                    : "Saved on server"
                }
              >
                <Check size={12} aria-hidden="true" />
                {message.status === "READ" && <span>Read</span>}
              </span>
            )}
          </span>
        </div>

        <div className="x54-msg-menu-anchor" ref={menuRef}>
          <button
            type="button"
            className="x54-msg-trigger"
            aria-label="Message actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => onOpenMenu(menuOpen ? null : message.id)}
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              className={
                "x54-msg-menu" + (message.isMine ? " is-align-right" : " is-align-left")
              }
              role="menu"
            >
              {showConfirmRetract ? (
                <div className="x54-msg-confirm">
                  <span>Retract message?</span>
                  <div className="x54-msg-confirm-btns">
                    <button
                      type="button"
                      onClick={() => setConfirmRetract(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => {
                        onOpenMenu(null);
                        onRetract(message);
                      }}
                    >
                      Retract
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onCopy(message.text);
                      onOpenMenu(null);
                    }}
                  >
                    <Copy size={14} aria-hidden="true" />
                    <span>Copy</span>
                  </button>
                  {message.isMine ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onOpenMenu(null);
                          onEdit(message);
                        }}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={() => setConfirmRetract(true)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <span>Retract</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        onOpenMenu(null);
                        onReport(message);
                      }}
                    >
                      <Flag size={14} aria-hidden="true" />
                      <span>Report</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
