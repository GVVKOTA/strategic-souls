"use client";

import {
  CLASSIC_50_PRESETS,
  CLASSIC_CATEGORY_COUNTS,
  CLASSIC_PRESET_CATEGORIES,
  type ClassicPreset,
  type ClassicPresetCategory,
} from "../../../backend/services/research/classic-presets";
import { Modal } from "../../components/workspace/shared";
import { IconPin } from "../../components/workspace/ss-icons";

type Props = {
  open: boolean;
  onClose: () => void;
  formulaQuery: string;
  setFormulaQuery: (v: string) => void;
  formulaCategory: "ALL" | ClassicPresetCategory;
  setFormulaCategory: (v: "ALL" | ClassicPresetCategory) => void;
  filteredPresets: {
    pinned: ClassicPreset[];
    unpinned: ClassicPreset[];
    total: number;
  };
  classicPresetId: string;
  expandedFormulaId: string | null;
  setExpandedFormulaId: (v: string | null) => void;
  pinningId: string | null;
  onApplyPreset: (p: ClassicPreset) => void;
  onTogglePin: (id: string) => void;
};

export default function FormulaPickerModal({
  open,
  onClose,
  formulaQuery,
  setFormulaQuery,
  formulaCategory,
  setFormulaCategory,
  filteredPresets,
  classicPresetId,
  expandedFormulaId,
  setExpandedFormulaId,
  pinningId,
  onApplyPreset,
  onTogglePin,
}: Props) {
  if (!open) return null;

  const renderItem = (p: ClassicPreset, pinned: boolean) => {
    const isSelected = p.id === classicPresetId;
    const isExpanded = expandedFormulaId === p.id;
    return (
      <div
        key={(pinned ? "pin-" : "") + p.id}
        className={"x56-formula-item" + (isSelected ? " is-active" : "")}
      >
        <div className="x56-formula-item-top">
          <button
            type="button"
            className="x56-formula-select-btn"
            onClick={() => {
              onApplyPreset(p);
              onClose();
            }}
          >
            <div className="x56-formula-title-row">
              <span className="x54-formula-rank-badge">{p.rankCode}</span>
              <span className="x56-formula-title">{p.label}</span>
            </div>
            <p className="x56-formula-meaning">{p.shortDescription}</p>
          </button>
          <div className="x56-formula-actions-col">
            <button
              type="button"
              className={"ss-v3-pin-btn" + (pinned ? " is-pinned" : "")}
              style={{ minWidth: 36, minHeight: 36, padding: 0 }}
              aria-label={pinned ? `Unpin ${p.label}` : `Pin ${p.label}`}
              disabled={pinningId === p.id}
              onClick={() => onTogglePin(p.id)}
            >
              <IconPin size={16} active={pinned} />
            </button>
            <button
              type="button"
              className="x56-formula-details-btn"
              onClick={() => setExpandedFormulaId(isExpanded ? null : p.id)}
            >
              {isExpanded ? "Hide" : "Formula"}
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="x56-formula-drawer">
            <code className="x56-formula-drawer-code">{p.formula}</code>
            <div className="x56-formula-drawer-grid">
              <span>Min bars: {p.minBars}</span>
              <span>{p.ruleType}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal title="Browse all 50 Classic Formulas" onClose={onClose}>
      <div className="x56-formula-modal-shell">
        <div className="x56-formula-modal-subhead">
          <p className="x56-formula-modal-subtitle">
            Select any formula to load and customize its parameters. Pin favorites
            to keep them on top.
          </p>
          <span className="x56-formula-count-badge">
            {filteredPresets.total} of {CLASSIC_50_PRESETS.length}
          </span>
        </div>

        <div className="x56-formula-search-row">
          <input
            id="ss-v31-formula-picker-search"
            name="formulaSearch"
            type="search"
            className="x56-formula-search-input"
            aria-label="Search 50 Classic formulas"
            placeholder="Search RSI, EMA, MACD, Bollinger, Supertrend…"
            value={formulaQuery}
            onChange={(e) => setFormulaQuery(e.target.value)}
          />
          {formulaQuery && (
            <button
              type="button"
              className="x56-formula-search-clear"
              onClick={() => setFormulaQuery("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="x56-formula-chip-bar" role="group" aria-label="Formula categories">
          <button
            type="button"
            className={"x51-chip" + (formulaCategory === "ALL" ? " is-active" : "")}
            onClick={() => setFormulaCategory("ALL")}
          >
            All ({CLASSIC_50_PRESETS.length})
          </button>
          {CLASSIC_PRESET_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={"x51-chip" + (formulaCategory === cat ? " is-active" : "")}
              onClick={() => setFormulaCategory(cat)}
            >
              {cat} ({CLASSIC_CATEGORY_COUNTS[cat]})
            </button>
          ))}
        </div>

        <div className="x56-formula-list">
          {filteredPresets.pinned.length > 0 && (
            <>
              <small className="x1-caption" style={{ paddingLeft: 4 }}>
                Pinned ({filteredPresets.pinned.length})
              </small>
              {filteredPresets.pinned.map((p) => renderItem(p, true))}
              {filteredPresets.unpinned.length > 0 && (
                <small className="x1-caption" style={{ paddingLeft: 4, marginTop: 4 }}>
                  All Classic Formulas
                </small>
              )}
            </>
          )}

          {filteredPresets.unpinned.map((p) => renderItem(p, false))}

          {filteredPresets.total === 0 && (
            <div className="x56-formula-empty">
              <strong>No formulas matched</strong>
              <button
                type="button"
                className="x1-secondary"
                onClick={() => {
                  setFormulaQuery("");
                  setFormulaCategory("ALL");
                }}
              >
                Reset search
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
