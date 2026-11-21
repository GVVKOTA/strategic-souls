"use client";
/**
 * Owner-only private Angel One NSE/BSE/MCX market-data board and public compliance fallback.
 * Strictly preserves Strategic Souls matte-black/silver/blue heading design system.
 * Never fabricates prices or shows LIVE on weekend/holiday/stale quotes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Lock, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type {
  ExchangeCode,
  InstrumentMasterEntry,
  MarketHealthResponse,
  MarketQuoteResponse,
  NormalizedMarketQuote,
} from "../../../backend/services/market-data/angelone/types";
import { Empty, Panel, SourceLink } from "../../components/workspace/shared";
import {
  MarketClientError,
  fetchMarketHealth,
  fetchMarketInstruments,
  fetchMarketQuotes,
  submitManualTotpUnlock,
} from "./private-market-client";

const formatInr = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);

const formatSigned = (value: number | null | undefined, suffix = "") => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatInr(value, 2)}${suffix}`;
};

type Props = {
  isOwner: boolean;
  authenticated: boolean;
  exchangeFilter?: "ALL" | "EQUITIES" | "MCX";
  compact?: boolean;
  openAsset: (id: string) => void;
  analyze?: (formula?: string, instrumentId?: string) => void;
  onRequireAuth?: () => void;
  notify?: (text: string, error?: boolean) => void;
};

const DEFAULT_EQUITY_IDS = [
  "NSE:NIFTY",
  "BSE:SENSEX",
  "NSE:SBIN",
  "NSE:RELIANCE",
  "BSE:SBIN",
  "BSE:RELIANCE",
];

const DEFAULT_MCX_IDS = ["MCX:GOLD04DEC26FUT", "MCX:CRUDEOIL18DEC26FUT"];

const DEFAULT_ALL_IDS = [...DEFAULT_EQUITY_IDS, ...DEFAULT_MCX_IDS];

export default function PrivateMarketPanel({
  isOwner,
  authenticated,
  exchangeFilter = "ALL",
  compact = false,
  openAsset,
  analyze,
  onRequireAuth,
  notify,
}: Props) {
  const [health, setHealth] = useState<MarketHealthResponse | null>(null);
  const [quoteData, setQuoteData] = useState<MarketQuoteResponse | null>(null);
  const [error, setError] = useState<{
    code: string;
    message: string;
    hint: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<"ALL" | ExchangeCode>(
    exchangeFilter === "MCX" ? "MCX" : "ALL",
  );
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InstrumentMasterEntry[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [trackedIds, setTrackedIds] = useState<string[]>(() =>
    exchangeFilter === "MCX"
      ? DEFAULT_MCX_IDS
      : exchangeFilter === "EQUITIES"
        ? DEFAULT_EQUITY_IDS
        : DEFAULT_ALL_IDS,
  );
  const [totp, setTotp] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const lastLoadMs = useRef(0);

  const loadFeed = useCallback(
    async (idsToFetch: readonly string[], force = false) => {
      if (!authenticated || !isOwner) return;
      const now = Date.now();
      if (!force && now - lastLoadMs.current < 1500) return;
      lastLoadMs.current = now;
      setLoading(true);
      setError(null);
      try {
        const [h, q] = await Promise.all([
          fetchMarketHealth(),
          fetchMarketQuotes(idsToFetch),
        ]);
        setHealth(h);
        setQuoteData(q);
      } catch (err) {
        try {
          setHealth(await fetchMarketHealth());
        } catch {
          /* ignore nested health failure */
        }
        if (err instanceof MarketClientError) {
          setError({
            code: err.errorCode,
            message: err.message,
            hint: err.actionHint,
          });
        } else {
          setError({
            code: "UPSTREAM_ERROR",
            message: "Unable to fetch private broker quotes.",
            hint: "Check local adapter health and retry.",
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [authenticated, isOwner],
  );

  useEffect(() => {
    if (!authenticated || !isOwner) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadFeed(trackedIds, true);
    });
    return () => {
      alive = false;
    };
  }, [authenticated, isOwner, loadFeed, trackedIds]);

  useEffect(() => {
    if (!authenticated || !isOwner || compact) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearchBusy(true);
      fetchMarketInstruments({
        q: trimmed,
        exchange:
          exchangeFilter === "MCX"
            ? "MCX"
            : selectedExchange === "ALL"
              ? "ALL"
              : selectedExchange,
        limit: 10,
      })
        .then((res) => {
          if (active) setSearchResults(res.instruments);
        })
        .catch(() => {
          if (active) setSearchResults([]);
        })
        .finally(() => {
          if (active) setSearchBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [authenticated, isOwner, compact, query, exchangeFilter, selectedExchange]);

  async function handleTotpUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (totpBusy) return;
    setTotpBusy(true);
    try {
      await submitManualTotpUnlock(totp.trim());
      setTotp("");
      notify?.("Private Angel One read-only session unlocked in memory.");
      await loadFeed(trackedIds, true);
    } catch (err) {
      notify?.((err as Error).message, true);
    } finally {
      setTotpBusy(false);
    }
  }

  const visibleQuotes = useMemo(() => {
    const list = quoteData?.quotes ?? [];
    return list.filter((q) => {
      if (exchangeFilter === "MCX") return q.exchange === "MCX";
      if (exchangeFilter === "EQUITIES") return q.exchange === "NSE" || q.exchange === "BSE";
      if (selectedExchange !== "ALL") return q.exchange === selectedExchange;
      return true;
    });
  }, [quoteData, exchangeFilter, selectedExchange]);

  // Public / non-owner experience: honest, calm compliance notice without breaking any public features.
  if (!authenticated || !isOwner) {
    if (compact) return null;
    return (
      <Panel
        title={
          exchangeFilter === "MCX"
            ? "MCX commodity futures · Licence gate"
            : "NSE & BSE exchange quotes · Licence gate"
        }
        kicker="Compliance & redistribution notice"
      >
        <Empty
          title="Public exchange distribution not yet licensed"
          action={
            !authenticated && onRequireAuth ? (
              <button className="x1-secondary" onClick={onRequireAuth}>
                <Lock size={15} />
                Sign in (workspace owner)
              </button>
            ) : undefined
          }
        >
          <p>
            NSE, BSE, and MCX broker-sourced quotes are currently restricted to
            the authenticated private workspace owner (
            <code>MARKET_DATA_MODE=private</code>,{" "}
            <code>ENABLE_PUBLIC_EXCHANGE_QUOTES=false</code>). A personal broker
            API feed does not grant commercial website display or redistribution
            rights.
          </p>
          <p className="x1-caption">
            Official ECB daily FX references, US Treasury yields, the 24-venue
            3D Earth, Soul Scan (ECB universe), Formula Lab, and Community
            remain fully available.
          </p>
          <div className="x1-actions">
            <SourceLink href="https://www.nseindia.com/static/market-data/nse-data-policy">
              NSE Data Policy
            </SourceLink>
            <SourceLink href="https://www.bseindia.com/markets/MarketInfo/MarketData.aspx">
              BSE Market Data
            </SourceLink>
            <SourceLink href="https://www.mcxindia.com/market-data/contract-specifications">
              MCX Specifications
            </SourceLink>
          </div>
        </Empty>
      </Panel>
    );
  }

  const addSymbolAndRefresh = (inst: InstrumentMasterEntry) => {
    setQuery("");
    setSearchResults([]);
    setTrackedIds((prev) => {
      const next = prev.includes(inst.id)
        ? prev
        : [inst.id, ...prev].slice(0, 16);
      return next;
    });
  };

  const renderQuoteCard = (q: NormalizedMarketQuote) => (
    <article key={q.id} className="x31-quote-card">
      <div className="x31-quote-head">
        <button
          type="button"
          className="x31-quote-title"
          onClick={() => openAsset(q.id)}
        >
          <strong>
            {q.tradingSymbol}
            <ArrowUpRight size={14} />
          </strong>
          <span>
            {q.exchange} · {q.segment} · Token {q.token}
            {q.expiry ? ` · Exp ${q.expiry}` : ""}
          </span>
        </button>
        <span
          className={
            "x1-badge x31-quality-badge" +
            (q.isLive ? " is-live" : "")
          }
          title={q.freshnessReason}
        >
          {q.qualityLabel}
        </span>
      </div>

      <div className="x31-quote-price-row">
        <strong className="x31-ltp">
          {q.ltp !== null ? `₹${formatInr(q.ltp)}` : "No price"}
        </strong>
        <span className="x31-change">
          {q.change !== null && q.changePct !== null
            ? `${formatSigned(q.change)} (${formatSigned(q.changePct, "%")})`
            : "Change unavailable"}
        </span>
      </div>

      <dl className="x31-quote-meta">
        <div>
          <dt>Prev close</dt>
          <dd>{q.prevClose !== null ? `₹${formatInr(q.prevClose)}` : "—"}</dd>
        </div>
        <div>
          <dt>Day H / L</dt>
          <dd>
            {q.high !== null && q.low !== null
              ? `${formatInr(q.high)} / ${formatInr(q.low)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>{q.volume !== null ? formatInr(q.volume, 0) : "—"}</dd>
        </div>
        {q.segment === "FUTURE" ? (
          <div>
            <dt>Open Int · Lot</dt>
            <dd>
              {q.openInterest !== null ? formatInr(q.openInterest, 0) : "—"} · Lot{" "}
              {q.lotSize}
            </dd>
          </div>
        ) : (
          <div>
            <dt>Unit</dt>
            <dd>{q.unit}</dd>
          </div>
        )}
      </dl>

      <p className="x1-caption x31-timestamps">
        <span>
          Observed: {q.exchangeTimestampIST ?? "Unavailable"} ({q.marketState})
        </span>
        <span>Retrieved: {q.retrievalTimestampIST}</span>
        <span>
          Source: {q.provider} ({q.sourceMode === "DEMO_SYNTHETIC" ? "DEMO / SYNTHETIC" : "Private Owner · Read-Only"})
        </span>
      </p>

      {!compact && (
        <div className="x31-quote-actions">
          <button
            type="button"
            className="x1-text-button"
            onClick={() => openAsset(q.id)}
          >
            Open candles &amp; chart
            <ArrowRight size={13} />
          </button>
          {analyze && (
            <button
              type="button"
              className="x1-text-button"
              onClick={() => analyze("close > sma(close, 20)", q.id)}
            >
              Scan in Soul Scan
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}
    </article>
  );

  return (
    <Panel
      title={
        exchangeFilter === "MCX"
          ? "MCX Dated Commodity Futures (Private Owner Feed)"
          : exchangeFilter === "EQUITIES"
            ? "NSE & BSE Read-Only Quotes (Private Owner Feed)"
            : "Indian Exchange Quotes · NSE / BSE / MCX (Private Owner)"
      }
      kicker="Read-only Angel One SmartAPI · Never redistributed publicly"
      action={
        <button
          type="button"
          className="x1-secondary"
          disabled={loading}
          aria-busy={loading}
          onClick={() => void loadFeed(trackedIds, true)}
        >
          <RefreshCw size={15} />
          {loading ? "Loading…" : "Refresh quotes"}
        </button>
      }
    >
      {quoteData?.sourceMode === "DEMO_SYNTHETIC" && (
        <div role="alert" className="x1-callout">
          <strong>DEMO / SYNTHETIC MODE ACTIVE:</strong> Values shown below are
          synthetic test placeholders, not real NSE/BSE/MCX exchange quotes.
        </div>
      )}

      {quoteData?.sessions && (
        <div className="x31-session-strip" aria-label="Exchange session status">
          {(["NSE", "BSE", "MCX"] as const)
            .filter((ex) =>
              exchangeFilter === "MCX"
                ? ex === "MCX"
                : exchangeFilter === "EQUITIES"
                  ? ex !== "MCX"
                  : true,
            )
            .map((ex) => {
              const s = quoteData.sessions[ex];
              return (
                <div key={ex} className="x31-session-pill">
                  <strong>{ex}</strong>
                  <span>{s.label}</span>
                  <small>
                    {s.localDateIST} {s.localTimeIST} IST
                  </small>
                </div>
              );
            })}
        </div>
      )}

      {!compact && (
        <div className="x31-toolbar">
          {exchangeFilter === "ALL" && (
            <div className="x1-segment" role="group" aria-label="Filter exchange">
              {(["ALL", "NSE", "BSE", "MCX"] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  aria-pressed={selectedExchange === ex}
                  onClick={() => setSelectedExchange(ex)}
                >
                  {ex === "ALL" ? "All" : ex}
                </button>
              ))}
            </div>
          )}
          <div className="x31-search-box">
            <label className="x1-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Add NSE, BSE, or MCX instrument"
                placeholder="Search NSE/BSE equity or MCX future (e.g. TCS, SBIN, GOLD)…"
                value={query}
                onChange={(e) => {
                  const next = e.target.value;
                  setQuery(next);
                  if (next.trim().length < 2) setSearchResults([]);
                }}
              />
            </label>
            {searchBusy && <p className="x1-caption">Searching instrument master…</p>}
            {searchResults.length > 0 && (
              <div className="x31-search-dropdown" role="listbox">
                {searchResults.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => addSymbolAndRefresh(inst)}
                  >
                    <strong>
                      {inst.id} ({inst.tradingSymbol})
                    </strong>
                    <span>
                      {inst.name} · Token {inst.token}
                      {inst.expiry ? ` · Exp ${inst.expiry}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="x31-error-box">
          <strong>
            Private feed state: {error.code.replaceAll("_", " ")}
          </strong>
          <p>{error.message}</p>
          <p className="x1-caption">{error.hint}</p>
          {(error.code === "BROKER_TOTP_REQUIRED" ||
            error.code === "BROKER_SESSION_EXPIRED") && (
            <form className="x31-totp-form" onSubmit={(e) => void handleTotpUnlock(e)}>
              <label>
                Enter 6-digit Angel One TOTP (never stored)
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </label>
              <button type="submit" className="x1-primary" disabled={totpBusy || totp.length !== 6}>
                {totpBusy ? "Unlocking…" : "Unlock read-only session"}
              </button>
            </form>
          )}
        </div>
      )}

      {loading && visibleQuotes.length === 0 ? (
        <p role="status" className="x1-caption">
          Fetching authenticated read-only quotes from private broker adapter…
        </p>
      ) : visibleQuotes.length > 0 ? (
        <div className="x31-quote-grid">
          {visibleQuotes.slice(0, compact ? 4 : 20).map(renderQuoteCard)}
        </div>
      ) : (
        !error && (
          <p className="x1-caption">
            No quotes loaded for the selected exchange filter yet. Click Refresh quotes.
          </p>
        )
      )}

      <div className="x31-footer-note">
        <ShieldCheck size={16} />
        <p className="x1-caption">
          Private owner-only read-only feed ({health?.enabledExchanges.length
            ? `active segments: ${health.enabledExchanges.join(", ")}`
            : "strictly read-only"}
          ). Zero order execution capabilities. Weekend, holiday, and after-hours
          quotes are explicitly labelled as prior-session prices, never LIVE.
        </p>
      </div>
    </Panel>
  );
}
