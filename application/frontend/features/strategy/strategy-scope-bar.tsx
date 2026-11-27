"use client";

import type { ScanUniversePreset } from "../../../backend/services/research/research";
import type { UniverseReadinessView } from "./market-scan-client";

export type X3Timeframe = "30m" | "1h" | "3h" | "6h" | "1d";

export const X3_TIMEFRAME_OPTIONS: readonly {
  readonly value: X3Timeframe;
  readonly label: string;
  readonly windowHint: string;
}[] = [
  { value: "30m", label: "30m", windowHint: "7 days" },
  { value: "1h", label: "1H", windowHint: "14 days" },
  { value: "3h", label: "3H", windowHint: "1 month" },
  { value: "6h", label: "6H", windowHint: "2 months" },
  { value: "1d", label: "24H", windowHint: "12 months" },
];

type WatchlistSummary = {
  id: string;
  name: string;
  payload: { items?: string[] };
};

type Props = {
  scanSource: ScanUniversePreset;
  onSelectSource: (next: "MARKET" | "MY_WATCHLIST") => void;
  interval: X3Timeframe;
  onSelectInterval: (next: X3Timeframe) => void;
  dailyOnlyScope: boolean;
  exchangeScopeUnavailable: boolean;
  universeReadiness: UniverseReadinessView | null;
  watchlists: WatchlistSummary[];
  activeWatchlist: WatchlistSummary | null;
  watchlistItemCount: number;
  onSelectWatchlistId: (id: string) => void;
  onOpenWatchlist?: () => void;
  authenticated: boolean;
};

export default function StrategyScopeBar({
  scanSource,
  onSelectSource,
  interval,
  onSelectInterval,
  dailyOnlyScope,
  exchangeScopeUnavailable,
  universeReadiness,
  watchlists,
  activeWatchlist,
  watchlistItemCount,
  onSelectWatchlistId,
  onOpenWatchlist,
  authenticated,
}: Props) {
  const isWatchlist = scanSource === "MY_WATCHLIST";
  const activeTfMeta =
    X3_TIMEFRAME_OPTIONS.find((t) => t.value === interval) ?? X3_TIMEFRAME_OPTIONS[4];

  return (
    <>
      <div className="x54-field-group">
        <div className="x54-field-label">
          <span>Source</span>
          <span className="x1-caption">
            {isWatchlist
              ? `${watchlistItemCount} instrument${watchlistItemCount === 1 ? "" : "s"}`
              : "Connected exchange universe"}
          </span>
        </div>

        <div className="ss-x3-source-grid-2" role="group" aria-label="Scan source">
          <button
            type="button"
            aria-pressed={!isWatchlist}
            className={"ss-v3-seg-btn" + (!isWatchlist ? " is-active" : "")}
            onClick={() => onSelectSource("MARKET")}
          >
            Markets
          </button>
          <button
            type="button"
            aria-pressed={isWatchlist}
            className={"ss-v3-seg-btn" + (isWatchlist ? " is-active" : "")}
            onClick={() => onSelectSource("MY_WATCHLIST")}
          >
            Watchlist
          </button>
        </div>

        {!isWatchlist && exchangeScopeUnavailable && authenticated && (
          <div className="x1-callout" role="status">
            <span>
              {universeReadiness?.reason ||
                "Connected Markets data is warming or awaiting an active exchange provider key."}
            </span>
          </div>
        )}

        {!isWatchlist && !exchangeScopeUnavailable && universeReadiness?.membership && (
          <p className="x1-caption" role="status" style={{ margin: "2px 0 0" }}>
            Markets ({universeReadiness.membership.effectiveDate} ·{" "}
            {universeReadiness.coverage?.ready ?? 0}/
            {universeReadiness.membership.distinctCount ?? universeReadiness.membership.count}{" "}
            ready)
            {universeReadiness.rightsMode === "DERIVED_ONLY"
              ? " · Derived scan outcomes only"
              : " · Completed bars"}
          </p>
        )}

        {isWatchlist && watchlists.length > 1 && (
          <select
            id="ss-v31-watchlist-select"
            name="watchlistId"
            aria-label="Choose watchlist"
            className="x54-name-input"
            value={activeWatchlist?.id ?? ""}
            onChange={(e) => onSelectWatchlistId(e.target.value)}
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.payload.items?.length ?? 0})
              </option>
            ))}
          </select>
        )}

        {isWatchlist && authenticated && watchlistItemCount === 0 && (
          <div className="x54-quota-popover" role="note">
            <div>Your Watchlist is empty. Add symbols or switch to Markets.</div>
            <div className="x1-actions" style={{ marginTop: 8, gap: 8 }}>
              <button
                type="button"
                className="x1-secondary"
                onClick={() => onSelectSource("MARKET")}
              >
                Use Markets
              </button>
              {onOpenWatchlist && (
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={onOpenWatchlist}
                >
                  Open Watchlist
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="x54-field-group">
        <div className="x54-field-label">
          <span>Timeframe</span>
          <span className="x1-caption">
            {dailyOnlyScope
              ? "24H daily bars only for current feed"
              : `${activeTfMeta.label} · ${activeTfMeta.windowHint} lookback`}
          </span>
        </div>
        <div className="ss-x3-tf-grid-5" role="group" aria-label="Scan timeframe">
          {X3_TIMEFRAME_OPTIONS.map((tf) => {
            const disabled = dailyOnlyScope && tf.value !== "1d";
            return (
              <button
                key={tf.value}
                type="button"
                disabled={disabled}
                aria-pressed={interval === tf.value}
                title={
                  disabled
                    ? `${tf.label} requires an intraday exchange feed`
                    : `${tf.label} (${tf.windowHint})`
                }
                className={"ss-v3-seg-btn" + (interval === tf.value ? " is-active" : "")}
                onClick={() => onSelectInterval(tf.value)}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
