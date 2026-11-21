"use client";
import { useState } from "react";
import { EyeOff, Lock, Pause, Play } from "lucide-react";
import type { WorkspaceState } from "./shared";
import { number } from "./shared";

type Props = {
  enabled: boolean;
  mode: "HOLDINGS" | "WATCHLIST";
  authenticated: boolean;
  workspace: WorkspaceState | null;
  onOpenAsset: (symbol: string) => void;
  onHide: () => void;
};

type TickerItem = {
  symbol: string;
  detail: string;
  tag: string;
};

/**
 * Private opt-in Holdings / Watchlist Ticker Strip.
 * - OFF by default (controlled by user's D1 preference privateTickerEnabled).
 * - Visible ONLY to the authenticated owner across Global, Strategy, and Community.
 * - Never fabricates live prices: displays recorded cost basis/quantity or watchlist tracking status.
 * - Pauses on hover, focus, or Pause button; static under prefers-reduced-motion / minimal motion.
 */
export default function PrivateHoldingsTicker({
  enabled,
  mode,
  authenticated,
  workspace,
  onOpenAsset,
  onHide,
}: Props) {
  const [paused, setPaused] = useState(false);

  if (!authenticated || !enabled || !workspace) return null;

  const items: TickerItem[] = [];
  if (mode === "HOLDINGS") {
    for (const portfolio of workspace.portfolios ?? []) {
      const currency = portfolio.summary.currency || "INR";
      for (const holding of portfolio.summary.holdings ?? []) {
        if (holding.quantity <= 0) continue;
        items.push({
          symbol: holding.symbol,
          detail: `${number(holding.quantity, 2)} qty · avg ${currency} ${number(holding.averageCost, 2)}`,
          tag: "Manual ledger",
        });
      }
    }
  } else {
    const watchlists = (workspace.records ?? []).filter(
      (r) => r.kind === "watchlist",
    );
    const seen = new Set<string>();
    for (const wl of watchlists) {
      for (const sym of wl.payload?.items ?? []) {
        if (!seen.has(sym)) {
          seen.add(sym);
          items.push({
            symbol: sym,
            detail: wl.name,
            tag: "Watchlist",
          });
        }
      }
    }
  }

  if (items.length === 0) {
    return (
      <div
        className="x51-ticker-bar is-paused"
        role="region"
        aria-label="Private holdings ticker"
      >
        <span className="x51-ticker-label">
          <Lock size={11} aria-hidden="true" />
          Private {mode === "HOLDINGS" ? "Holdings" : "Watchlist"}
        </span>
        <span className="x1-caption" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mode === "HOLDINGS"
            ? "No manual holdings logged yet. Add transactions in My Portfolio to stream your private cost-basis strip."
            : "No watchlist symbols saved yet. Add symbols to a watchlist to display them here."}
        </span>
        <div className="x51-ticker-controls">
          <button
            type="button"
            className="x51-ticker-ctrl"
            title="Hide private ticker"
            aria-label="Hide private ticker"
            onClick={onHide}
          >
            <EyeOff size={13} />
          </button>
        </div>
      </div>
    );
  }

  // Duplicate list once for seamless CSS marquee loop when not paused
  const looped = items.length >= 2 ? [...items, ...items] : items;

  return (
    <div
      className={"x51-ticker-bar" + (paused || items.length < 2 ? " is-paused" : "")}
      role="region"
      aria-label="Private holdings ticker"
    >
      <span className="x51-ticker-label">
        <Lock size={11} aria-hidden="true" />
        Private · {mode === "HOLDINGS" ? "Manual Ledger" : "Watchlist"}
      </span>
      <div className="x51-ticker-viewport">
        <div className="x51-ticker-track">
          {looped.map((item, idx) => (
            <button
              key={`${item.symbol}-${idx}`}
              type="button"
              className="x51-ticker-chip"
              onClick={() => onOpenAsset(item.symbol)}
              title={`Open ${item.symbol} (${item.tag})`}
            >
              <strong>{item.symbol}</strong>
              <span className="x1-caption">{item.detail}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="x51-ticker-controls">
        {items.length >= 2 && (
          <button
            type="button"
            className="x51-ticker-ctrl"
            title={paused ? "Resume ticker" : "Pause ticker"}
            aria-label={paused ? "Resume ticker" : "Pause ticker"}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        )}
        <button
          type="button"
          className="x51-ticker-ctrl"
          title="Hide private ticker"
          aria-label="Hide private ticker"
          onClick={onHide}
        >
          <EyeOff size={13} />
        </button>
      </div>
    </div>
  );
}
