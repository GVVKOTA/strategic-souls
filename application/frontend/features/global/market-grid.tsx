"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Orbit,
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
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import { api, Modal, number, type Notice } from "../../components/workspace/shared";

type OverviewResponse = {
  asOf: string;
  layout: MarketLayoutRecord;
  cards: MarketOverviewCard[];
  disclosure: string;
};

type Props = {
  onReplayIntro?: () => void;
  authenticated: boolean;
  market: MarketSnapshot | null;
  onOpenAsset: (id: string) => void;
  onRequireAuth?: () => void;
  onCelebration?: (label: string, mutationId: string) => void;
  notify: Notice;
};

const GUEST_STORAGE_KEY = "ss-v3-guest-market-grid-v2";
const OVERVIEW_TIMEOUT_MS = 10_000;
const PUBLIC_REFERENCE_IDS = ["ECB:USDINR", "ECB:EURINR", "ECB:EURUSD", "UST:10Y"];

function guestMarketIds(): string[] {
  try {
    const saved = window.localStorage.getItem(GUEST_STORAGE_KEY) ??
      window.localStorage.getItem("ss-x51-guest-market-grid-v1");
    return reconcileGlobalMarketIds(saved ? JSON.parse(saved) : null);
  } catch {
    return [...DEFAULT_EIGHT_CARD_IDS];
  }
}

const LIVE_OBSERVATION_FRESHNESS_MS = 60_000;

function cardIsGenuinelyLive(card: MarketOverviewCard, checkedAt: string | null, clockMs: number): boolean {
  const observedAt = Date.parse(card.sourceObservedAtUTC ?? "");
  const retrievalTime = Date.parse(checkedAt ?? "");
  return (
    card.value !== null &&
    card.quality === "REAL_TIME" &&
    card.marketSession === "OPEN" &&
    card.isLive === true &&
    card.sourceObservedPrecision !== "DATE_ONLY" &&
    !!card.sourceObservedAtUTC?.includes("T") &&
    Number.isFinite(observedAt) &&
    Number.isFinite(retrievalTime) &&
    observedAt <= retrievalTime &&
    Math.max(retrievalTime, clockMs) - observedAt < LIVE_OBSERVATION_FRESHNESS_MS
  );
}

function formatPriceWithUnit(card: MarketOverviewCard): string {
  if (card.value === null || !Number.isFinite(card.value)) return "—";
  if (card.assetClass === "FX") {
    return `₹${number(card.value, 4)}`;
  }
  if (card.assetClass === "INDEX") {
    return number(card.value, 2);
  }
  if (card.currency === "USD") {
    return `$${number(card.value, 2)}`;
  }
  if (card.currency === "INR") {
    return `₹${number(card.value, 2)}`;
  }
  return number(card.value, 2);
}

function formatCompactObservation(
  card: MarketOverviewCard,
  serverNowIso: string | null,
  clockMs: number,
): { text: string; statusKind: "live" | "closed" | "delayed" | "reference" | "stale" | "unavailable"; statusText: string } {
  if (card.value === null || card.quality === "UNAVAILABLE" || card.quality === "NOT_CONNECTED" || card.quality === "RESTRICTED") {
    return {
      text: card.canonicalId === "GLOBAL:CLF27" ? "Unavailable · No authorized source" : "Quote unavailable",
      statusKind: "unavailable",
      statusText: "Unavailable",
    };
  }

  if (card.quality === "REFERENCE") {
    const rawDate = card.sourceObservedAtUTC
      ? card.sourceObservedAtUTC.slice(0, 10)
      : "";
    const shortDate = rawDate
      ? new Intl.DateTimeFormat("en-IN", {
          timeZone: "UTC",
          day: "numeric",
          month: "short",
        }).format(new Date(`${rawDate}T00:00:00Z`))
      : "";
    return {
        text: shortDate ? `As of ${shortDate} · ECB cross-rate` : "ECB cross-rate",
      statusKind: "reference",
      statusText: "Reference",
    };
  }

  const tz = card.marketTimezone || (["NSE", "BSE", "MCX"].includes(card.venue) ? "Asia/Kolkata" : "UTC");
  const tzTag = tz === "Asia/Kolkata" ? "IST" : tz === "America/New_York" ? "ET" : "";
  const rawObs = card.sourceObservedAtUTC;

  let obsLabel = "";
  if (rawObs) {
    if (card.sourceObservedPrecision === "DATE_ONLY" || !rawObs.includes("T")) {
      obsLabel = rawObs.slice(0, 10);
    } else {
      const obsDate = new Date(rawObs);
      if (!Number.isNaN(obsDate.getTime())) {
        const refDate = serverNowIso ? new Date(serverNowIso) : new Date();
        const dayFmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const sameDay =
          !Number.isNaN(refDate.getTime()) &&
          dayFmt.format(obsDate) === dayFmt.format(refDate);
        const timeStr = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(obsDate);
        if (sameDay) {
          obsLabel = tzTag ? `${timeStr} ${tzTag}` : timeStr;
        } else {
          const shortDay = new Intl.DateTimeFormat("en-IN", {
            timeZone: tz,
            day: "numeric",
            month: "short",
          }).format(obsDate);
          obsLabel = `${shortDay}, ${timeStr}`;
        }
      }
    }
  }

  if (cardIsGenuinelyLive(card, serverNowIso, clockMs)) {
    return {
      text: `As of ${obsLabel}`,
      statusKind: "live",
      statusText: "LIVE",
    };
  }
  if (card.quality === "REAL_TIME") {
    return {
      text: obsLabel ? `As of ${obsLabel}` : "Observation time unavailable",
      statusKind: "stale",
      statusText: "Last observation",
    };
  }
  if (card.quality === "DELAYED") {
    return {
      text: obsLabel ? `As of ${obsLabel} · Delayed` : "Delayed",
      statusKind: "delayed",
      statusText: "Delayed",
    };
  }
  if (card.quality === "STALE") {
    return {
      text: obsLabel ? `As of ${obsLabel} · Stale` : "Stale",
      statusKind: "stale",
      statusText: "Stale",
    };
  }
  if (card.quality === "PUBLISHED_EOD") {
    return {
      text: obsLabel ? `As of ${obsLabel} · EOD` : "EOD",
      statusKind: "closed",
      statusText: "EOD",
    };
  }
  // Closed or prior-session verified observation — displays truthful date/time + Closed/Holiday suffix
  const suffix = card.sessionLabel === "Holiday" ? "Holiday" : "Closed";
  return {
    text: obsLabel ? `As of ${obsLabel} · ${suffix}` : suffix,
    statusKind: "closed",
    statusText: suffix,
  };
}

function MiniSpark({
  values,
  windowReturnPct,
}: {
  values: number[];
  windowReturnPct: number | null;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const flat = max - min <= 1e-12;
  const span = flat ? 1 : max - min;
  const pts = clean
    .map((v, i) => {
      const px = (i / (clean.length - 1)) * 120;
      const py = flat ? 12 : 21 - ((v - min) / span) * 17;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  const delta =
    windowReturnPct !== null
      ? windowReturnPct
      : clean[clean.length - 1] - clean[0];
  const stroke =
    delta > 1e-9 ? "#42CF91" : delta < -1e-9 ? "#EF666A" : "#929CA7";
  return (
    <svg
      className="x51-mcard-spark ss-v3-colored-svg"
      viewBox="0 0 120 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Strategic Souls V3.1 — Strict 8-Tile Global Market Overview Grid.
 * Displays NIFTY 50, SENSEX, BANK NIFTY, Nifty Midcap Select, GOLD, SILVER MCX, CL Jan 2027, and USD/INR
 * in a balanced 2-col mobile / 4-col desktop grid with truthful timestamps and semantic sparklines.
 */
export default function MarketOverviewGrid({
  onReplayIntro,
  authenticated,
  market,
  onOpenAsset,
  onRequireAuth,
  onCelebration,
  notify,
}: Props) {
  const [cards, setCards] = useState<MarketOverviewCard[]>([]);
  const [loadedForAuthenticated, setLoadedForAuthenticated] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<MarketLayoutRecord>({
    ids: [...DEFAULT_EIGHT_CARD_IDS],
    version: 0,
    updatedAt: null,
    isDefault: true,
  });
  const [asOfUTC, setAsOfUTC] = useState<string | null>(null);
  const [quoteClock, setQuoteClock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([...DEFAULT_EIGHT_CARD_IDS]);
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveBadge, setSaveBadge] = useState("");
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const overviewRequest = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const deadlines = cards
      .filter((card) => cardIsGenuinelyLive(card, asOfUTC, quoteClock))
      .map((card) => Date.parse(card.sourceObservedAtUTC!) + LIVE_OBSERVATION_FRESHNESS_MS);
    if (!deadlines.length) return;
    const next = Math.min(...deadlines);
    const timer = window.setTimeout(() => setQuoteClock(Math.max(Date.now(), next)), Math.max(0, next - Date.now()));
    return () => window.clearTimeout(timer);
  }, [cards, asOfUTC, quoteClock]);

  useEffect(() => {
    if (!saveBadge) return;
    const timer = window.setTimeout(() => setSaveBadge(""), 4000);
    return () => window.clearTimeout(timer);
  }, [saveBadge]);

  const loadOverview = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const request = ++overviewRequest.current;
    setLoading(true);
    setError("");
    const guestIds = authenticated ? null : guestMarketIds();
    try {
      const res = await api<OverviewResponse>("/api/markets/overview", undefined, {
        signal: ctrl.signal,
        timeoutMs: OVERVIEW_TIMEOUT_MS,
      });
      if (request !== overviewRequest.current) return;
      const orderedIds = guestIds ?? reconcileGlobalMarketIds(res.layout.ids);
      const cardMap = new Map(res.cards.map((card) => [card.canonicalId, card]));
      const orderedCards = orderedIds.map((id) => cardMap.get(id));
      if (orderedCards.some((card) => !card)) throw new Error("Incomplete market overview.");
      setAsOfUTC(res.asOf);
      setQuoteClock(Date.now());
      setLayout({ ...res.layout, ids: orderedIds });
      setCards(orderedCards.filter((card): card is MarketOverviewCard => !!card));
      setLoadedForAuthenticated(authenticated);
      setDraftIds(orderedIds);
    } catch {
      if (request === overviewRequest.current && !ctrl.signal.aborted) {
        if (guestIds) {
          setLayout({ ids: guestIds, version: 0, updatedAt: null, isDefault: false });
          setLoadedForAuthenticated(false);
        }
        setCards([]);
        setAsOfUTC(null);
        setError("Market data unavailable. Try again in a moment.");
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
      abortRef.current?.abort();
      overviewRequest.current += 1;
    };
  }, [loadOverview]);

  const showQuotes = !error && loadedForAuthenticated === authenticated;
  const layoutIds = loadedForAuthenticated === authenticated ? layout.ids : DEFAULT_EIGHT_CARD_IDS;
  const hasExchangePrices = showQuotes && cards.some((card) =>
    card.canonicalId !== "ECB:USDINR" && card.value !== null,
  );
  const publicReferences = PUBLIC_REFERENCE_IDS.flatMap((id) => {
    const point = market?.quotes.find((quote) => quote.id === id) ??
      market?.yields.find((quote) => quote.id === id);
    return point && point.value !== null && point.sourceDate ? [point] : [];
  });

  function openCustomize() {
    setDraftIds([...layoutIds]);
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
        asOf: string;
      }>("/api/markets/overview", {
        action: isReset ? "reset" : "save",
        ids: cleanIds,
        expectedVersion: layout.version,
      });
      setLayout(res.layout);
      setCards(res.cards);
      setAsOfUTC(res.asOf);
      setQuoteClock(Date.now());
      setLoadedForAuthenticated(authenticated);
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
        <div className="ss-eclipse-horizon">
          <picture aria-hidden="true">
            <source media="(width < 768px)" srcSet="/eclipse-horizon-mobile.webp" />
            <img src="/eclipse-horizon.webp" width="1280" height="400" alt="" fetchPriority="high" />
          </picture>
          <h1 id="x53-dashboard-title" className="x53-dashboard-title ss-v31-page-title">
            Strategic Dashboard
          </h1>
          {onReplayIntro && <button className="ss-replay-eclipse" type="button" onClick={onReplayIntro}>
            <Orbit size={16} aria-hidden="true" /> Replay eclipse
          </button>}
        </div>
        <div className="x53-dashboard-bar">
          <div className="x53-dashboard-meta" aria-live="polite">
            {saveBadge ? (
              <span className="x54-ephemeral-pill ss-v31-teal-pill">{saveBadge}</span>
            ) : asOfUTC ? (
              <span className="x1-caption" title="Latest retrieval check time (distinct from quote observation time)">
                Checked{" "}
                {new Date(asOfUTC).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                })} IST
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
              className="x1-secondary x53-toolbar-btn ss-v31-teal-btn"
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
          <span>{error}</span>
          <button
            type="button"
            className="x1-text-button"
            onClick={() => void loadOverview()}
          >
            Retry
          </button>
        </div>
      )}

      {!hasExchangePrices && publicReferences.length > 0 && (
        <section className="x11-public-references" aria-labelledby="x11-public-reference-heading">
          <h2 id="x11-public-reference-heading">Public market references</h2>
          <div className="x11-reference-grid">
            {publicReferences.map((point) => (
              <button type="button" key={point.id} className="x11-reference-card" onClick={() => onOpenAsset(point.id)}>
                <span>{point.label}</span>
                <strong>{number(point.value, point.assetClass === "BOND_YIELD" ? 2 : 4)}{point.assetClass === "BOND_YIELD" ? "%" : ""}</strong>
                <small>{point.derivation ? "ECB cross-rate" : point.provider} · {point.sourceDate}{point.state === "STALE" ? " · Stale" : ""}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {!hasExchangePrices && <p className="x1-caption x11-exchange-coverage">
        Exchange and futures quotes appear when a permitted feed returns data.
      </p>}

      <div
        className={"x51-market-grid ss-v3-market-grid-8" + (showAllMarkets ? "" : " x11-markets-collapsed")}
        role="list"
        id="x11-market-cards"
        aria-label="Market overview tiles"
      >
        {layoutIds.map((id, idx) => {
          const card = showQuotes ? cards[idx] : undefined;
          if (!card) {
            return (
              <div
                key={id}
                className="x51-mcard ss-v3-mcard ss-v31-mcard"
                role="listitem"
                aria-busy={loading && !error}
              >
                <span className="x51-mcard-name">{registryInstrument(id)?.label ?? id}</span>
                <span className="x51-mcard-price">—</span>
                <span className="ss-v31-mcard-time">{loading && !error ? "Checking…" : "Unavailable"}</span>
              </div>
            );
          }

          const hasValue = card.value !== null && Number.isFinite(card.value);
          const deltaClass =
            card.percentChange === null
              ? "is-flat"
              : card.percentChange > 0
                ? "is-pos"
                : card.percentChange < 0
                  ? "is-neg"
                  : "is-flat";
          const obs = formatCompactObservation(card, asOfUTC, quoteClock);
          const sparkReturn = card.sparklineReturnPct ?? null;

          const venueInName = card.name.toUpperCase().includes(card.venue.toUpperCase());
          const cardTitle = `${card.name}${venueInName ? "" : ` (${card.venue})`}${card.contractLabel ? ` · ${card.contractLabel}` : ""} · ${obs.text}`;

          return (
            <button
              key={card.canonicalId}
              type="button"
              role="listitem"
              className="x51-mcard ss-v3-mcard ss-v31-mcard"
              onClick={() => onOpenAsset(card.canonicalId)}
              title={cardTitle}
            >
              <div className="x51-mcard-top">
                <div style={{ minWidth: 0 }}>
                  <div className="x51-mcard-name">{card.shortLabel}</div>
                  <div className="x51-mcard-venue">
                    {card.venue}
                    {card.contractLabel ? ` · ${card.contractLabel}` : ""}
                  </div>
                </div>
                {obs.statusKind === "live" && (
                  <span className="ss-v31-live-badge" aria-label="Live quote">
                    <span className="ss-v31-live-dot" aria-hidden="true" />
                    <span>LIVE</span>
                  </span>
                )}
              </div>

              <div className="x51-mcard-price ss-v31-mcard-price">
                {formatPriceWithUnit(card)}
              </div>

              <div className="ss-v31-mcard-mid">
                <span className={`x51-mcard-delta ss-v31-delta ${deltaClass}`}>
                  {card.percentChange !== null
                    ? `${card.percentChange > 0 ? "+" : ""}${card.percentChange.toFixed(2)}${card.changeUnit}`
                    : hasValue
                      ? "Change —"
                      : "—"}
                </span>
                {card.sparkline && card.sparkline.length >= 2 ? (
                  <div className="ss-v31-spark-wrap">
                    <MiniSpark
                      values={card.sparkline}
                      windowReturnPct={sparkReturn}
                    />
                  </div>
                ) : <span className="ss-v31-mcard-time">Chart data unavailable</span>}
              </div>

              <div className="ss-v31-mcard-foot">
                <span
                  className={
                    "ss-v31-mcard-time" +
                    (obs.statusKind === "unavailable" ? " is-muted" : "")
                  }
                >
                  {obs.text}
                </span>
                {card.sparklinePeriodLabel && card.sparkline && card.sparkline.length >= 2 && (
                  <span className="ss-v31-spark-period" aria-hidden="true">
                    {card.sparklinePeriodLabel}
                  </span>
                )}
              </div>
              {hasValue && card.quality !== "REFERENCE" && <span className="ss-v31-mcard-time">{card.provider}</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="x1-secondary x11-market-expand"
        aria-expanded={showAllMarkets}
        aria-controls="x11-market-cards"
        onClick={() => setShowAllMarkets((show) => !show)}
      >{showAllMarkets ? "Show fewer markets" : "Show all 8 markets"}</button>

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
                    "x51-slot-item" + (activeSlot === idx ? " is-selected ss-v31-teal-selected" : "")
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
