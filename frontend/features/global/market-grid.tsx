"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  DEFAULT_NINE_CARD_IDS,
  type MarketLayoutRecord,
  type MarketOverviewCard,
} from "../../../backend/services/market-data/nine-card-types";
import {
  X2_INSTRUMENTS,
  searchCanonicalInstruments,
} from "../../../backend/services/market-data/instrument-registry";
import { api, Modal, number, type Notice } from "../../components/workspace/shared";

type OverviewResponse = {
  asOfUTC: string;
  layout: MarketLayoutRecord;
  cards: MarketOverviewCard[];
  disclosure: string;
};

type Props = {
  authenticated: boolean;
  onOpenAsset: (id: string) => void;
  onRequireAuth?: () => void;
  notify: Notice;
};

const GUEST_STORAGE_KEY = "ss-x51-guest-market-grid-v1";

function qualityBadgeLabel(quality: MarketOverviewCard["quality"]): string {
  switch (quality) {
    case "REAL_TIME":
      return "Live";
    case "DELAYED":
      return "Delayed";
    case "PUBLISHED_EOD":
      return "EOD";
    case "REFERENCE":
      return "Daily reference";
    case "STALE":
      return "Stale";
    case "RESTRICTED":
      return "Restricted";
    case "NOT_CONNECTED":
      return "Not connected";
    default:
      return "Unavailable";
  }
}

function formatObservedLabel(card: MarketOverviewCard): string {
  if (!card.sourceObservedAtUTC) return "";
  if (
    card.sourceObservedPrecision === "DATE_ONLY" ||
    !card.sourceObservedAtUTC.includes("T")
  ) {
    return ` · Ref date ${card.sourceObservedAtUTC}`;
  }
  return ` · Observed ${card.sourceObservedAtUTC}`;
}

function MiniSpark({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * 120).toFixed(1)},${(20 - ((v - min) / span) * 16).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="x51-mcard-spark"
      viewBox="0 0 120 22"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={positive ? "var(--x51-green)" : "var(--x1-text-muted)"}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Nine customizable market overview cards (3x3 on tablet/desktop; 2-col + full-width 9th card on narrow phones).
 * Supports drag-and-drop AND accessible keyboard reordering, canonical catalog swap,
 * D1 optimistic-concurrency persistence (409 conflict recovery), and honest quote-quality badges.
 */
export default function MarketOverviewGrid({
  authenticated,
  onOpenAsset,
  onRequireAuth,
  notify,
}: Props) {
  const [cards, setCards] = useState<MarketOverviewCard[]>([]);
  const [layout, setLayout] = useState<MarketLayoutRecord>({
    ids: [...DEFAULT_NINE_CARD_IDS],
    version: 0,
    updatedAt: null,
    isDefault: true,
  });
  const [asOfUTC, setAsOfUTC] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([...DEFAULT_NINE_CARD_IDS]);
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveBadge, setSaveBadge] = useState("");

  useEffect(() => {
    if (!saveBadge) return;
    const timer = window.setTimeout(() => setSaveBadge(""), 4000);
    return () => window.clearTimeout(timer);
  }, [saveBadge]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<OverviewResponse>("/api/markets/overview");
      setAsOfUTC(res.asOfUTC);
      setLayout(res.layout);
      if (!authenticated) {
        try {
          const saved = window.localStorage.getItem(GUEST_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as string[];
            if (Array.isArray(parsed) && parsed.length === 9) {
              const cardMap = new Map(res.cards.map((c) => [c.canonicalId, c]));
              const reordered = parsed.map((id) => {
                const found = cardMap.get(id);
                if (found) return found;
                const meta = X2_INSTRUMENTS.find((x) => x.id === id);
                return {
                  canonicalId: id,
                  shortLabel: meta?.label ?? id,
                  name: meta?.name ?? id,
                  venue: meta?.market ?? "GLOBAL",
                  assetClass: meta?.assetClass ?? "EQUITY",
                  currency: meta?.currency ?? "USD",
                  quoteUnit: meta?.currency ?? "USD",
                  value: null,
                  absoluteChange: null,
                  percentChange: null,
                  previousClose: null,
                  changeUnit: "%" as const,
                  sparkline: null,
                  provider: "Local guest layout",
                  sourceUrl: "",
                  sourceObservedAtUTC: null,
                  ingestedAtUTC: res.asOfUTC,
                  quality: "NOT_CONNECTED" as const,
                  marketSession: "UNKNOWN" as const,
                  sessionLabel: "Sign in to sync",
                  reasonCode: "GUEST_LOCAL_PREVIEW",
                  redistributable: false,
                };
              });
              setCards(reordered);
              setDraftIds(parsed);
              setLoading(false);
              return;
            }
          }
        } catch {
          /* Ignore invalid local storage */
        }
      }
      setCards(res.cards);
      setDraftIds(res.layout.ids);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load 9-card market overview.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadOverview();
    });
    return () => {
      alive = false;
    };
  }, [loadOverview]);

  const catalogMatches = useMemo(() => {
    const q = catalogQuery.trim();
    if (!q) return X2_INSTRUMENTS.slice(0, 28);
    return searchCanonicalInstruments(q, X2_INSTRUMENTS, { limit: 24 });
  }, [catalogQuery]);

  function openCustomize() {
    setDraftIds(cards.length === 9 ? cards.map((c) => c.canonicalId) : [...DEFAULT_NINE_CARD_IDS]);
    setActiveSlot(0);
    setCatalogQuery("");
    setEditOpen(true);
  }

  function swapSlots(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= 9 || to >= 9) return;
    setDraftIds((prev) => {
      const next = [...prev];
      const temp = next[from];
      next[from] = next[to];
      next[to] = temp;
      return next;
    });
    setActiveSlot(to);
  }

  function replaceSlot(slotIndex: number, canonicalId: string) {
    setDraftIds((prev) => {
      const next = [...prev];
      const existingAt = next.indexOf(canonicalId);
      if (existingAt >= 0 && existingAt !== slotIndex) {
        // Auto-swap cleanly so 9 unique slots are always preserved
        const displaced = next[slotIndex];
        next[slotIndex] = canonicalId;
        next[existingAt] = displaced;
      } else {
        next[slotIndex] = canonicalId;
      }
      return next;
    });
  }

  async function saveLayout(idsToSave: string[], isReset = false) {
    if (saving) return;
    if (!authenticated) {
      try {
        if (isReset) {
          window.localStorage.removeItem(GUEST_STORAGE_KEY);
        } else {
          window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(idsToSave));
        }
      } catch {
        /* Storage optional */
      }
      setEditOpen(false);
      setSaveBadge(isReset ? "Reset locally" : "Saved locally");
      notify("Saved locally in this browser. Sign in to sync across devices.");
      await loadOverview();
      return;
    }

    setSaving(true);
    try {
      const res = await api<{
        ok: boolean;
        layout: MarketLayoutRecord;
        cards: MarketOverviewCard[];
      }>("/api/markets/overview", {
        action: isReset ? "reset" : "save",
        ids: idsToSave,
        expectedVersion: layout.version,
      });
      setLayout(res.layout);
      setCards(res.cards);
      setDraftIds(res.layout.ids);
      setSaveBadge(isReset ? "Reset to defaults" : "Layout saved");
      setEditOpen(false);
      notify(isReset ? "Market cards reset to defaults." : "Market layout saved.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not save market grid.";
      notify(msg, true);
      if (/updated elsewhere|409|conflict/i.test(msg)) {
        await loadOverview();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="x53-dashboard-hero" aria-labelledby="x53-dashboard-title">
      <div className="x53-dashboard-head">
        <h1 id="x53-dashboard-title" className="x53-dashboard-title">
          Strategic Dashboard
        </h1>
        <div className="x53-dashboard-bar">
          <div className="x53-dashboard-meta" aria-live="polite">
            {saveBadge ? (
              <span className="x54-ephemeral-pill">{saveBadge}</span>
            ) : asOfUTC ? (
              <span className="x1-caption">
                Checked{" "}
                {new Date(asOfUTC).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>
          <div className="x1-actions x53-dashboard-actions">
            <button
              type="button"
              className="x1-secondary x53-toolbar-btn"
              onClick={() => void loadOverview()}
              disabled={loading}
              aria-label="Refresh market cards"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="x51-accent-btn x53-toolbar-btn"
              onClick={openCustomize}
              aria-label="Customize 9 market cards"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Customize</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="x1-callout" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div className="x51-market-grid" role="list" aria-label="Nine market overview cards">
        {(cards.length === 9 ? cards : Array.from({ length: 9 }, () => null)).map(
          (card, idx) => {
            if (!card) {
              return (
                <div
                  key={`skeleton-${idx}`}
                  className="x51-mcard"
                  role="listitem"
                  aria-busy="true"
                >
                  <span className="x51-mcard-name">Loading…</span>
                  <span className="x51-mcard-price">—</span>
                  <span className="x51-mcard-badge">Checking</span>
                </div>
              );
            }

            const hasValue = card.value !== null && Number.isFinite(card.value);
            const digits =
              card.assetClass === "FX"
                ? 4
                : card.assetClass === "BOND_YIELD"
                  ? 2
                  : 2;
            const deltaClass =
              card.percentChange === null
                ? "is-flat"
                : card.percentChange > 0
                  ? "is-pos"
                  : card.percentChange < 0
                    ? "is-neg"
                    : "is-flat";
            const isOfficial =
              card.quality === "REFERENCE" ||
              card.quality === "REAL_TIME" ||
              card.quality === "PUBLISHED_EOD";

            return (
              <button
                key={card.canonicalId}
                type="button"
                role="listitem"
                className="x51-mcard"
                onClick={() => onOpenAsset(card.canonicalId)}
                title={`${card.name} (${card.venue}) · ${qualityBadgeLabel(card.quality)} · ${card.provider}${formatObservedLabel(card)}`}
              >
                <div className="x51-mcard-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="x51-mcard-name">{card.shortLabel}</div>
                    <div className="x51-mcard-venue">{card.venue}</div>
                  </div>
                </div>

                <div className="x51-mcard-price">
                  {hasValue
                    ? `${number(card.value, digits)}${card.assetClass === "BOND_YIELD" ? "%" : ""}`
                    : "—"}
                </div>

                {card.sparkline && card.sparkline.length >= 2 && (
                  <MiniSpark
                    values={card.sparkline}
                    positive={(card.percentChange ?? 0) >= 0}
                  />
                )}

                <div className={`x51-mcard-delta ${deltaClass}`}>
                  {card.percentChange !== null
                    ? `${card.percentChange > 0 ? "+" : ""}${card.percentChange.toFixed(2)}${card.changeUnit}`
                    : card.sessionLabel}
                </div>

                <div className="x51-mcard-foot">
                  <span
                    className={
                      "x51-mcard-badge" + (isOfficial ? " is-official" : "")
                    }
                  >
                    {qualityBadgeLabel(card.quality)}
                  </span>
                </div>
              </button>
            );
          },
        )}
      </div>

      {editOpen && (
        <Modal
          title="Customize 9-Card Market Grid (3×3)"
          onClose={() => setEditOpen(false)}
        >
          <p className="x1-caption" style={{ marginTop: 0 }}>
            Drag cards or use arrows to reorder your 9 slots. Select any slot
            below and pick a canonical instrument from the catalog to swap it in.
            {!authenticated && (
              <>
                {" "}
                <button
                  type="button"
                  className="x1-text-button"
                  onClick={() => {
                    setEditOpen(false);
                    onRequireAuth?.();
                  }}
                >
                  Sign in to sync across devices
                </button>
                .
              </>
            )}
          </p>

          <div className="x51-slot-grid" role="list" aria-label="9 editable grid slots">
            {draftIds.map((id, idx) => {
              const info = X2_INSTRUMENTS.find((x) => x.id === id);
              return (
                <div
                  key={`${id}-${idx}`}
                  role="listitem"
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) swapSlots(dragIndex, idx);
                    setDragIndex(null);
                  }}
                  className={
                    "x51-slot-item" + (activeSlot === idx ? " is-selected" : "")
                  }
                  onClick={() => setActiveSlot(idx)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 4,
                    }}
                  >
                    <span className="x1-caption">#{idx + 1}</span>
                    <GripVertical size={13} aria-hidden="true" />
                  </div>
                  <strong
                    style={{
                      fontSize: "0.8rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {info?.label ?? id}
                  </strong>
                  <span
                    className="x1-caption"
                    style={{
                      fontSize: "0.7rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {info?.market ?? "GLOBAL"}
                  </span>
                  <div className="x51-slot-controls">
                    <button
                      type="button"
                      aria-label={`Move slot ${idx + 1} earlier`}
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        swapSlots(idx, idx - 1);
                      }}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move slot ${idx + 1} later`}
                      disabled={idx === 8}
                      onClick={(e) => {
                        e.stopPropagation();
                        swapSlots(idx, idx + 1);
                      }}
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="x51-catalog-filter"
              className="x1-caption"
              style={{ display: "block", marginBottom: 6 }}
            >
              Choose an instrument for slot {activeSlot + 1} (current:{" "}
              <strong>{draftIds[activeSlot]}</strong>):
            </label>
            <div className="x51-body-search" style={{ maxWidth: "100%" }}>
              <Search size={15} aria-hidden="true" />
              <input
                id="x51-catalog-filter"
                type="search"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Search NIFTY, SENSEX, S&P 500, Gold, USD/INR, HDFCBANK, US 10Y…"
              />
            </div>
            <div
              className="x51-preset-list"
              style={{ marginTop: 8, maxHeight: 180 }}
            >
              {catalogMatches.map((inst) => {
                const inGridIdx = draftIds.indexOf(inst.id);
                return (
                  <button
                    key={inst.id}
                    type="button"
                    className={
                      "x51-preset-option" +
                      (inGridIdx === activeSlot ? " is-active" : "")
                    }
                    onClick={() => replaceSlot(activeSlot, inst.id)}
                  >
                    <span>
                      <strong>{inst.name}</strong>{" "}
                      <span className="x1-caption">({inst.id})</span>
                    </span>
                    <span className="x1-caption">
                      {inGridIdx >= 0
                        ? `Slot #${inGridIdx + 1} (swap)`
                        : inst.market}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="x1-actions"
            style={{ justifyContent: "space-between", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="x1-secondary"
              disabled={saving}
              onClick={() =>
                void saveLayout([...DEFAULT_NINE_CARD_IDS], true)
              }
            >
              <RotateCcw size={14} />
              <span>Reset to Defaults</span>
            </button>
            <div className="x1-actions">
              <button
                type="button"
                className="x1-secondary"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="x1-primary x1-motion-button"
                disabled={saving}
                onClick={() => void saveLayout(draftIds, false)}
              >
                {saving ? "Saving…" : "Save 9-Card Grid"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
