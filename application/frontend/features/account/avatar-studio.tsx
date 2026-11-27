"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  AVATAR_CATALOG,
  AVATAR_COLLECTIONS,
  resolveAvatarPreset,
  type AvatarCollectionId,
} from "../../../backend/services/profile/avatars";
import type { UserProfileSnapshot } from "../../../backend/services/profile/profile";
import { api } from "../../components/workspace/shared";
import AvatarBadge from "./avatar-badge";

type Props = {
  open: boolean;
  currentAvatarId: string;
  displayName: string;
  handle: string | null;
  onClose: () => void;
  onSaved: (profile: UserProfileSnapshot) => void;
};

/**
 * First-class 50-avatar gallery modal / mobile bottom sheet.
 * Single tap previews; explicit "Save avatar" persists strictly for the authenticated user.
 */
export default function AvatarStudio({
  open,
  currentAvatarId,
  displayName,
  handle,
  onClose,
  onSaved,
}: Props) {
  const [collection, setCollection] = useState<"all" | AvatarCollectionId>("all");
  const [selectedId, setSelectedId] = useState<string>(
    resolveAvatarPreset(currentAvatarId).id,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saveLock = useRef(false);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSelectedId(resolveAvatarPreset(currentAvatarId).id);
      setError("");
    });
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, [open, currentAvatarId]);

  const filtered = useMemo(
    () =>
      collection === "all"
        ? AVATAR_CATALOG
        : AVATAR_CATALOG.filter((item) => item.collection === collection),
    [collection],
  );

  const selectedPreset = resolveAvatarPreset(selectedId);
  const savedPreset = resolveAvatarPreset(currentAvatarId);
  const changed = selectedPreset.id !== savedPreset.id;

  async function handleSave() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        {
          action: "update-avatar",
          avatarPresetId: selectedPreset.id,
        },
      );
      onSaved(res.profile);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save avatar. Your previous avatar is intact; retry safely.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function handleGridKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex = -1;
    if (event.key === "ArrowRight") nextIndex = Math.min(filtered.length - 1, index + 1);
    else if (event.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
    else if (event.key === "ArrowDown") nextIndex = Math.min(filtered.length - 1, index + 5);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 5);
    if (nextIndex >= 0 && nextIndex !== index) {
      event.preventDefault();
      const target = filtered[nextIndex];
      setSelectedId(target.id);
      const grid = event.currentTarget.closest(".x6-avatar-grid");
      const buttons = grid?.querySelectorAll<HTMLButtonElement>("button[data-avatar-id]");
      buttons?.[nextIndex]?.focus();
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="x1-dialog x6-avatar-dialog x1-modal-enter"
      aria-label="Choose your avatar"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <header className="x6-avatar-dialog-head">
        <div>
          <h2>Choose your avatar</h2>
          <p className="x1-caption">
            60 original Strategic Souls emblems · 6 collections · switch anytime
          </p>
        </div>
        <button
          type="button"
          className="x1-icon-button"
          aria-label="Close avatar chooser"
          disabled={saving}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      <div className="x6-avatar-preview-stage">
        <div className="x6-avatar-preview-hero">
          <AvatarBadge
            avatarId={selectedPreset.id}
            size={84}
            ring
            alt={`${selectedPreset.name} preview`}
          />
          <div className="x6-avatar-preview-meta">
            <span className="x1-badge">
              {selectedPreset.code} · {selectedPreset.collectionLabel}
            </span>
            <h3>{selectedPreset.name}</h3>
            <p className="x1-caption">{selectedPreset.description}</p>
          </div>
        </div>

        <div className="x6-avatar-context-preview" aria-label="Local preview of how your avatar appears">
          <span className="x6-preview-label">Local preview</span>
          <div className="x6-preview-row">
            <AvatarBadge avatarId={selectedPreset.id} size={32} alt="" />
            <div>
              <strong>{displayName || "Researcher"}</strong>
              <small>{handle ? `@${handle}` : "@your_handle"} · Sample note</small>
            </div>
          </div>
        </div>
      </div>

      <div
        className="x6-avatar-collections"
        role="tablist"
        aria-label="Avatar collections"
      >
        {AVATAR_COLLECTIONS.map((col) => {
          const count =
            col.id === "all"
              ? AVATAR_CATALOG.length
              : AVATAR_CATALOG.filter((a) => a.collection === col.id).length;
          return (
            <button
              key={col.id}
              type="button"
              role="tab"
              aria-selected={collection === col.id}
              className="x6-collection-chip"
              onClick={() => setCollection(col.id)}
            >
              {col.label} ({count})
            </button>
          );
        })}
      </div>

      <div
        className="x6-avatar-grid"
        role="grid"
        aria-label="Selectable profile avatars"
      >
        {filtered.map((item, idx) => {
          const isSelected = item.id === selectedPreset.id;
          return (
            <button
              key={item.id}
              type="button"
              data-avatar-id={item.id}
              className={"x6-avatar-tile" + (isSelected ? " is-selected" : "")}
              aria-pressed={isSelected}
              aria-label={`${item.name} (${item.code}, ${item.collectionLabel})${isSelected ? ", selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(e) => handleGridKeyDown(e, idx)}
            >
              <AvatarBadge avatarId={item.id} size={56} alt="" />
              <span className="x6-avatar-tile-name">{item.name}</span>
              {isSelected && (
                <span className="x6-avatar-tile-check" aria-hidden="true">
                  <Check size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="x1-callout">
          <span>{error}</span>
        </div>
      )}

      <footer className="x6-avatar-dialog-foot">
        <button
          type="button"
          className="x1-secondary x1-motion-button"
          disabled={saving}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="x1-primary x1-motion-button"
          disabled={saving || !changed}
          aria-busy={saving}
          onClick={() => void handleSave()}
        >
          <Check size={16} />
          {saving
            ? "Saving avatar…"
            : changed
              ? "Save avatar"
              : "Current avatar"}
        </button>
      </footer>
    </dialog>
  );
}
