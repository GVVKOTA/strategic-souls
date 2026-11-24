"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import {
  DEFAULT_EIGHT_CARD_IDS,
  reconcileGlobalMarketIds,
  type MarketLayoutRecord,
  type MarketOverviewCard,
} from "../../../backend/services/market-data/nine-card-types";
import { registryInstrument } from "../../../backend/services/market-data/instrument-registry";
import { api, Modal, number, type Notice } from "../../components/workspace/shared";

type OverviewResponse = {
  asOf: string;
  layout: MarketLayoutRecord;
  cards: MarketOverviewCard[];
  disclosure: string;
};

type Props = {
  authenticated: boolean;
  onOpenAsset: (id: string) => void;
  onRequireAuth?: () => void;
  onCelebration?: (label: string, mutationId: string) => void;
  notify: Notice;
};

const GUEST_STORAGE_KEY = "ss-v3-guest-market-grid-v2";

function qualityBadgeLabel(quality: MarketOverviewCard["quality"]): string {
  switch (quality) {
    case "REAL_TIME":
      return "Live";
    case "DELAYED":
      return "Delayed";
    case "LAST_AVAILABLE":
      return "Last available";
    case "PUBLISHED_EOD":
      return "EOD";
    case "REFERENCE":
      return "Daily reference";
    case "STALE":
      return "Stale";
    case "RESTRICTED":
    case "NOT_CONNECTED":
    default:
      return "Data unavailable";
  }
}

function formatObservedShort(card: MarketOverviewCard): string {
  if (!card.sourceObservedAtUTC) return "";
  if (
    card.sourceObservedPrecision === "DATE_ONLY" ||
    !card.sourceObservedAtUTC.includes("T")
  ) {
    return card.sourceObservedAtUTC;
  }
  const d = new Date(card.sourceObservedAtUTC);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      className="x51-mcard-spark ss-v3-colored-svg"
      viewBox="0 0 120 22"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={positive ? "#6ee7b7" : "#a7b1bc"}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Strategic Souls V3 — Strict 8-Tile Global Market Overview Grid.
 * Displays NIFTY 50, SENSEX, BANK NIFTY, NIFTY MIDCAP, GOLD, SILVER MCX, CL, and USD/INR
 * in a balanced 2-col mobile / 4-col desktop grid with equal card heights and honest data states.
 */
export default function MarketOverviewGrid({
  authenticated,
  onOpenAsset,
  onRequireAuth,
  onCelebration,
  notify,
}: Props) {
  const [cards, setCards] = useState<MarketOverviewCard[]>([]);
  const [layout, setLayout] = useState<MarketLayoutRecord>({
    ids: [...DEFAULT_EIGHT_CARD_IDS],
    version: 0,
    updatedAt: null,
    isDefault: true,
  });
  const [asOfUTC, setAsOfUTC] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([...DEFAULT_EIGHT_CARD_IDS]);
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveBadge, setSaveBadge] = useState("");
  const overviewRequest = useRef(0);

  useEffect(() => {
    if (!saveBadge) return;
    const timer = window.setTimeout(() => setSaveBadge(""), 4000);
    return () => window.clearTimeout(timer);
  }, [saveBadge]);

  const loadOverview = useCallback(async () => {
    const request = ++overviewRequest.current;
    setLoading(true);
    setError("");
    try {
      const res = await api<OverviewResponse>("/api/markets/overview");
      if (request !== overviewRequest.current) return;
      setAsOfUTC(res.asOf);
      setLayout(res.layout);
      if (!authenticated) {
        try {
          const saved =
            window.localStorage.getItem(GUEST_STORAGE_KEY) ??
            window.localStorage.getItem("ss-x51-guest-market-grid-v1");
          if (saved) {
            const parsed = JSON.parse(saved) as unknown;
            const reconciled = reconcileGlobalMarketIds(parsed);
            const cardMap = new Map(res.cards.map((c) => [c.canonicalId, c]));
            const reordered = reconciled
              .map((id) => cardMap.get(id))
              .filter((c): c is MarketOverviewCard => !!c);
            if (reordered.length === DEFAULT_EIGHT_CARD_IDS.length) {
              setCards(reordered);
              setDraftIds(reconciled);
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
      if (request === overviewRequest.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load market overview.",
        );
      }
    } finally {
      if (request === overviewRequest.current) setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadOverview();
    });
    return () => {
      alive = false;
      overviewRequest.current += 1;
    };
  }, [loadOverview]);

  function openCustomize() {
    setDraftIds(
      cards.length === DEFAULT_EIGHT_CARD_IDS.length
        ? cards.map((c) => c.canonicalId)
        : [...DEFAULT_EIGHT_CARD_IDS],
    );
    setActiveSlot(0);
    setEditOpen(true);
  }

  function swapSlots(from: number, to: number) {
    const maxIdx = DEFAULT_EIGHT_CARD_IDS.length - 1;
    if (from === to || from < 0 || to < 0 || from > maxIdx || to > maxIdx) return;
    setDraftIds((prev) => {
      const next = [...prev];
      const temp = next[from];
      next[from] = next[to];
      next[to] = temp;
      return next;
    });
    setActiveSlot(to);
  }

  async function saveLayout(idsToSave: string[], isReset = false) {
    if (saving) return;
    const cleanIds = reconcileGlobalMarketIds(idsToSave);
    if (!authenticated) {
      try {
        window.localStorage.removeItem("ss-x51-guest-market-grid-v1");
        if (isReset) {
          window.localStorage.removeItem(GUEST_STORAGE_KEY);
        } else {
          window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(cleanIds));
        }
      } catch {
        /* Storage unavailable */
      }
      setEditOpen(false);
      setSaveBadge(isReset ? "Reset locally" : "Order saved");
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
        ids: cleanIds,
        expectedVersion: layout.version,
      });
      setLayout(res.layout);
      setCards(res.cards);
      setDraftIds(res.layout.ids);
      setSaveBadge(isReset ? "Reset to defaults" : "Order saved");
      setEditOpen(false);
      onCelebration?.(
        isReset ? "Grid reset" : "Market order saved",
        `market-layout-${res.layout.version}-${Date.now()}`,
      );
      notify(isReset ? "Market tiles reset to defaults." : "Market tile order saved.");
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
              aria-label="Refresh market tiles"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="x51-accent-btn x53-toolbar-btn"
              onClick={openCustomize}
              aria-label="Reorder 8 market tiles"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Reorder</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="x1-callout" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div
        className="x51-market-grid ss-v3-market-grid-8"
        role="list"
        aria-label="Eight market overview tiles"
      >
        {(cards.length === DEFAULT_EIGHT_CARD_IDS.length
          ? cards
          : Array.from({ length: DEFAULT_EIGHT_CARD_IDS.length }, () => null)
        ).map((card, idx) => {
          if (!card) {
            return (
              <div
                key={`skeleton-${idx}`}
                className="x51-mcard ss-v3-mcard"
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
          const digits = card.assetClass === "FX" ? 4 : 2;
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
          const observedShort = formatObservedShort(card);

          return (
            <button
              key={card.canonicalId}
              type="button"
              role="listitem"
              className="x51-mcard ss-v3-mcard"
              onClick={() => onOpenAsset(card.canonicalId)}
              title={`${card.name} (${card.venue}) · ${qualityBadgeLabel(card.quality)}${observedShort ? ` · As of ${observedShort}` : ""}`}
            >
              <div className="x51-mcard-top">
                <div style={{ minWidth: 0 }}>
                  <div className="x51-mcard-name">{card.shortLabel}</div>
                  <div className="x51-mcard-venue">{card.venue}</div>
                </div>
                {observedShort && (
                  <span className="ss-v3-mcard-asof">{observedShort}</span>
                )}
              </div>

              <div className="x51-mcard-price">
                {hasValue ? number(card.value, digits) : "—"}
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
        })}
      </div>

      {editOpen && (
        <Modal
          title="Reorder Market Tiles"
          onClose={() => setEditOpen(false)}
        >
          <p className="x1-caption" style={{ marginTop: 0 }}>
            Drag tiles or use the arrows to arrange your 8 Global market tiles.
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

          <div
            className="x51-slot-grid ss-v3-slot-grid-8"
            role="list"
            aria-label="8 reorderable market tiles"
          >
            {draftIds.map((id, idx) => {
              const info = registryInstrument(id);
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
                      fontSize: "0.82rem",
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
                      fontSize: "0.72rem",
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
                      aria-label={`Move ${info?.label ?? id} earlier`}
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
                      aria-label={`Move ${info?.label ?? id} later`}
                      disabled={idx === DEFAULT_EIGHT_CARD_IDS.length - 1}
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

          <div
            className="x1-actions"
            style={{ justifyContent: "space-between", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="x1-secondary"
              disabled={saving}
              onClick={() =>
                void saveLayout([...DEFAULT_EIGHT_CARD_IDS], true)
              }
            >
              <RotateCcw size={14} />
              <span>Reset Order</span>
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
                {saving ? "Saving…" : "Save Order"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
