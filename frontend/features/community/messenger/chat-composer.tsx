"use client";
import { useEffect, useRef } from "react";
import { Check, Send, X } from "lucide-react";
import type { ChatMessage } from "./types";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  sending: boolean;
  placeholder?: string;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  shareSoul?: { id: string; revision: number; title: string } | null;
  onClearShare?: () => void;
};

export default function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  sending,
  placeholder = "Message…",
  editingMessage,
  onCancelEdit,
  shareSoul,
  onClearShare,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [value]);

  useEffect(() => {
    if (editingMessage) {
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  const canSend = !disabled && !sending && value.trim().length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    // Desktop: Enter sends, Shift+Enter inserts newline; touch/narrow mobile: Enter inserts newline naturally
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 769px) and (pointer: fine)").matches;
    if (isDesktop && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div className="x54-chat-composer-shell">
      {editingMessage && (
        <div className="x54-composer-banner">
          <div className="x54-composer-banner-text">
            <strong>Editing message</strong>
            <span>{editingMessage.text}</span>
          </div>
          <button
            type="button"
            className="x54-mini-close"
            aria-label="Cancel editing message"
            onClick={onCancelEdit}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {!editingMessage && shareSoul && (
        <div className="x54-composer-banner">
          <div className="x54-composer-banner-text">
            <strong>Shared Soul · {shareSoul.title}</strong>
            <span>Revision {shareSoul.revision} (permitted members only)</span>
          </div>
          <button
            type="button"
            className="x54-mini-close"
            aria-label="Remove attached Soul reference"
            onClick={onClearShare}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <form
        className="x54-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSubmit();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={4000}
          value={value}
          disabled={disabled}
          aria-label={editingMessage ? "Edit message" : "Message"}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="x54-send-btn"
          disabled={!canSend}
          aria-label={editingMessage ? "Save edited message" : "Send message"}
        >
          {editingMessage ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Send size={17} aria-hidden="true" />
          )}
        </button>
      </form>
    </div>
  );
}
