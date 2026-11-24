"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Maximize2,
} from "lucide-react";
import {
  NSE_SECTOR_INDICES,
  buildSectorHeatmaps,
  type SectorHeatmapSummary,
} from "../../../backend/services/market-data/sectors-and-ecosystem";
import type {
  AssetComparisonResult,
  QuantitativeEnvelope,
} from "../../../backend/engines/analytics";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import { AssetPicker, useAssetCatalog } from "../../components/workspace/asset-picker";
import { Modal, api, number } from "../../components/workspace/shared";

type CompareApiResponse = {
  asOfUTC: string;
  requestedStart: string;
  comparison: QuantitativeEnvelope<AssetComparisonResult>;
};

type SectorQuote = {
  id: string; value: number | null; pctChange: number | null; unit: string;
  provider: string; timestamp: string | null; quality: string; volume: number | null; change: number | null;
  latestDate?: string; referenceDate?: string;
};

type Props = {
  data: MarketSnapshot | null;
  onOpenAsset: (id: string) => void;
};

function toneClass(tone: SectorHeatmapSummary["tiles"][number]["tone"]): string {
  if (tone === "FLAT") return "x52-hm-tile is-flat";
  if (tone === "UP_STRONG") return "x52-hm-tile is-up-strong";
  if (tone === "UP") return "x52-hm-tile is-up";
  if (tone === "DOWN_STRONG") return "x52-hm-tile is-down-strong";
  if (tone === "DOWN") return "x52-hm-tile is-down";
  return "x52-hm-tile";
}

function ComparisonSvgChart({ comp }: { comp: AssetComparisonResult }) {
  const pts = comp.points;
  if (pts.length < 2) return null;
  const vals = pts.flatMap((p) => [p.rebasedA, p.rebasedB]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min || 1) * 0.1;
  const lo = min - pad;
  const hi = max + pad;
  const w = 520;
  const h = 190;
  const x = (i: number) => 38 + (i / (pts.length - 1)) * (w - 52);
  const y = (v: number) => 16 + ((hi - v) / (hi - lo)) * (h - 38);

  const pathA = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rebasedA).toFixed(1)}`).join(" ");
  const pathB = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rebasedB).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={`Normalized base-100 comparison of ${comp.assetA.label} and ${comp.assetB.label}`}
    >
      <line x1="38" x2={w - 14} y1={y(100)} y2={y(100)} stroke="rgba(255,255,255,0.16)" strokeDasharray="4 4" />
      <text x="4" y={y(100) + 4} fill="#9AA3AE" fontSize="10">100</text>
      <text x="4" y="20" fill="#9AA3AE" fontSize="10">{hi.toFixed(1)}</text>
      <text x="4" y={h - 22} fill="#9AA3AE" fontSize="10">{lo.toFixed(1)}</text>
      <path d={pathA} fill="none" stroke="#76C0FF" strokeWidth="2.2" />
      <path d={pathB} fill="none" stroke="#6EE7B7" strokeWidth="2.2" strokeDasharray="5 3" />
      <text x="38" y={h - 5} fill="#9AA3AE" fontSize="10">{comp.startDate}</text>
      <text x={w - 14} y={h - 5} textAnchor="end" fill="#9AA3AE" fontSize="10">{comp.endDate}</text>
    </svg>
  );
}

/**
 * [16] NSE Sector Explorer + [17] Miniature & Full-Screen Expandable Heatmaps + [13] Asset Comparison Modal.
 * Zero fabricated quotes or fake colored heatmap tiles when licensed exchange quotes are pending.
 */
export default function SectorExplorer({ data, onOpenAsset }: Props) {
  const [expandedSectorId, setExpandedSectorId] = useState<string | null>(null);
  const [textMode, setTextMode] = useState(false);

  // [13] Quick Asset Comparison Modal state
  const [compareOpen, setCompareOpen] = useState(false);
  const [assetA, setAssetA] = useState("ECB:USDINR");
  const [assetB, setAssetB] = useState("ECB:EURUSD");
  const [compareRes, setCompareRes] = useState<CompareApiResponse | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareErr, setCompareErr] = useState("");
  const [compareMode, setCompareMode] = useState<"Assets" | "Sectors">("Assets");
  const [period, setPeriod] = useState("3M");
  const [sectorQuotes, setSectorQuotes] = useState<SectorQuote[]>([]);
  const [quoteStatus, setQuoteStatus] = useState("Loading sector quotes…");
  const [revision, refreshQuotes] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("performance");
  const [heatPeriod, setHeatPeriod] = useState("1D");
  const [historicQuotes, setHistoricQuotes] = useState<SectorQuote[]>([]);
  const [historicStatus, setHistoricStatus] = useState("");
  const { instruments, error: catalogError } = useAssetCatalog(compareOpen);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void api<{ quotes: SectorQuote[]; status: string | null }>("/api/market/sector-quotes", undefined,
        { signal: controller.signal, timeoutMs: 40_000 }).then((value) => {
          if (controller.signal.aborted) return;
          setSectorQuotes(value.quotes);
          setQuoteStatus(value.status ?? "");
        }).catch(() => {
          if (controller.signal.aborted) return;
          setSectorQuotes([]);
          setQuoteStatus("Sector quotes are temporarily unavailable.");
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 300_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [revision]);

  useEffect(() => {
    if (!expandedSectorId || heatPeriod === "1D") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ sector: expandedSectorId, period: heatPeriod });
    void api<{ quotes: SectorQuote[]; status: string | null }>(
      "/api/market/sector-quotes?" + params, undefined, { signal: controller.signal, timeoutMs: 60_000 },
    ).then((value) => {
      if (!controller.signal.aborted) { setHistoricQuotes(value.quotes); setHistoricStatus(value.status ?? ""); }
    }).catch(() => {
      if (!controller.signal.aborted) { setHistoricQuotes([]); setHistoricStatus("Historical sector data unavailable."); }
    });
    return () => controller.abort();
  }, [expandedSectorId, heatPeriod]);

  function changeHeatPeriod(period: string) {
    setHistoricQuotes([]);
    setHistoricStatus(period === "1D" ? "" : "Loading completed sector history…");
    setHeatPeriod(period);
  }

  const quoteMap = useMemo(() => {
    const map = new Map<
      string,
      { value: number | null; pctChange: number | null; unit: string; provider: string }
    >();
    for (const q of [...(data?.quotes ?? []), ...(data?.yields ?? [])]) {
      map.set(q.id.toUpperCase(), {
        value: q.value,
        pctChange: q.changeUnit === "%" ? q.change : null,
        unit: q.unit,
        provider: q.provider,
      });
    }
    for (const quote of sectorQuotes) map.set(quote.id, quote);
    return map;
  }, [data, sectorQuotes]);

  const heatmaps = useMemo(() => buildSectorHeatmaps(quoteMap), [quoteMap]);
  const expandedSector = useMemo(
    () => NSE_SECTOR_INDICES.find((s) => s.id === expandedSectorId) ?? null,
    [expandedSectorId],
  );
  const expandedHm = useMemo(
    () => (heatPeriod === "1D" ? heatmaps : buildSectorHeatmaps(new Map(historicQuotes.map((quote) => [quote.id, quote]))))
      .find((h) => h.sectorId === expandedSectorId) ?? null,
    [heatmaps, expandedSectorId, heatPeriod, historicQuotes],
  );

  const runCompare = useCallback(
    async (a: string, b: string, range: string, signal: AbortSignal) => {
      if (!a || !b || a === b) return;
      setCompareBusy(true);
      setCompareErr("");
      try {
        const params = new URLSearchParams({ a, b, period: range });
        const res = await api<CompareApiResponse>("/api/compare?" + params, undefined, { signal });
        if (!signal.aborted) setCompareRes(res);
      } catch (err) {
        if (!signal.aborted) setCompareErr((err as Error).message);
      } finally {
        if (!signal.aborted) setCompareBusy(false);
      }
    }, [],
  );

  useEffect(() => {
    if (!compareOpen) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void runCompare(assetA, assetB, period, controller.signal);
    });
    return () => controller.abort();
  }, [compareOpen, assetA, assetB, period, runCompare]);

  function resetComparison() {
    setCompareRes(null);
    setCompareErr("");
    setCompareBusy(false);
  }

  function openSectorComparison(id: string) {
    resetComparison();
    setCompareMode("Sectors");
    setAssetA(id);
    setAssetB("");
    setExpandedSectorId(null);
    changeHeatPeriod("1D");
    setCompareOpen(true);
  }

  const expandedTiles = [...(expandedHm?.tiles ?? [])].sort((a, b) =>
    sort === "symbol" ? a.symbol.localeCompare(b.symbol) :
      (b.pctChange ?? -Infinity) - (a.pctChange ?? -Infinity) || a.symbol.localeCompare(b.symbol));
  const latestQuote = sectorQuotes.map((quote) => quote.timestamp ?? "").sort().at(-1);

  return (
    <section aria-labelledby="x52-sectors-heading">
      <div className="x52-section-center">
        <h2 id="x52-sectors-heading">NSE Sector Explorer &amp; Heatmaps</h2>
        <p>
          Curated sector representatives · Equal-area tiles · Session change
        </p>
        <p role="status">{quoteStatus || (latestQuote
          ? "Latest quote · " + new Date(latestQuote).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
          : "Quote timestamp unavailable")}</p>
        <div className="x52-section-center-actions">
          <input type="search" aria-label="Search sectors or stocks" placeholder="Search sectors or stocks"
            value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="x1-secondary" onClick={() => refreshQuotes((value) => value + 1)}>Refresh</button>
          <button
            type="button"
            className="x1-secondary"
            style={{ minHeight: 38, fontSize: "0.84rem" }}
            onClick={() => setCompareOpen(true)}
          >
            <ArrowLeftRight size={14} />
            <span>Compare</span>
          </button>
        </div>
      </div>

      <div className="x52-sector-grid" role="list" aria-label="NSE sectoral benchmarks">
        {NSE_SECTOR_INDICES.filter((sector) => {
          const term = query.trim().toLowerCase();
          return !term || [sector.name, sector.shortName,
            ...sector.constituents.flatMap((stock) => [stock.symbol, stock.name])].some((value) => value.toLowerCase().includes(term));
        }).map((sec) => {
          const hm = heatmaps.find((h) => h.sectorId === sec.id)!;
          return (
            <article key={sec.id} className="x52-sector-card" role="listitem">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: "0.94rem" }}>{sec.name}</strong>
                  <div className="x1-caption">
                    {quoteMap.get(sec.id)?.pctChange == null
                      ? <span aria-label="Official index return unavailable">—</span>
                      : <span>{number(quoteMap.get(sec.id)!.pctChange!, 2)}% index</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="x52-search-icon-mini"
                  aria-label={`Expand ${sec.name} heatmap`}
                  onClick={() => setExpandedSectorId(sec.id)}
                >
                  <Maximize2 size={14} />
                </button>
              </div>

              {/* [17] Miniature Expandable Heatmap — neutral when quotes unavailable, colored ONLY from real % change */}
              <div
                role="button"
                tabIndex={0}
                className="x52-mini-hm"
                aria-label={`Open full-screen heatmap for ${sec.name}`}
                onClick={() => setExpandedSectorId(sec.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedSectorId(sec.id);
                  }
                }}
              >
                {hm.tiles.slice(0, 4).map((t) => (
                  <div key={t.id} className={toneClass(t.tone)} aria-label={t.pctChange === null ? t.symbol + " unavailable" : undefined}>
                    <span style={{ overflowWrap: "anywhere" }}>
                      {t.symbol}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {t.pctChange !== null
                        ? `${t.pctChange > 0 ? "+" : ""}${t.pctChange.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: "0.76rem",
                  color: "var(--x1-text-muted)",
                }}
              >
                <span>
                  {hm.connectedCount > 0 && hm.advancers !== null && hm.decliners !== null
                    ? `${hm.advancers}↑ ${hm.decliners}↓ ${hm.connectedCount - hm.advancers - hm.decliners} flat · ${hm.connectedCount}/${hm.totalCount}`
                    : "—"}
                </span>
                <a
                  href={sec.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--x1-title-blue)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span>NSE</span>
                  <ArrowUpRight size={12} />
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {/* [17] Full-Screen Accessible Expanded Heatmap Modal */}
      {expandedSector && expandedHm && (
        <Modal
          title={`${expandedSector.name} · Sector Heatmap & Constituents`}
          onClose={() => { setExpandedSectorId(null); changeHeatPeriod("1D"); }}
        >
          <p className="x1-caption" style={{ marginTop: 0 }}>
            {expandedSector.description} Source:{" "}
            <a
              href={expandedSector.sourceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--x1-title-blue)" }}
            >
              {expandedSector.sourceName}
            </a>{" "}
            (index review {expandedSector.reviewDate}).
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span className="x51-pill">
              {expandedHm.connectedCount > 0
                ? `${expandedHm.connectedCount}/${expandedHm.totalCount} with ${heatPeriod} change`
                : "Quotes unavailable"}
            </span>
            <label>Period
              <select value={heatPeriod} onChange={(event) => changeHeatPeriod(event.target.value)}>
                {["1D", "1W", "1M", "YTD"].map((period) => <option key={period}>{period}</option>)}
              </select>
            </label>
            <label>Sort
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="performance">Performance</option><option value="symbol">Symbol</option>
              </select>
            </label>
            <button type="button" className="x1-secondary" onClick={() => openSectorComparison(expandedSector.id)}>Compare sector</button>
            <button
              type="button"
              className="x51-chip"
              aria-pressed={textMode}
              onClick={() => setTextMode((v) => !v)}
            >
              {textMode ? "Tile View" : "Accessible Table"}
            </button>
          </div>

          {historicStatus && <p role="status" className="x1-caption">{historicStatus}</p>}
          {textMode ? (
            <table className="x6-accessible-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Company</th>
                  <th>% Change</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {expandedTiles.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.symbol}</strong></td>
                    <td>{t.name}</td>
                    <td>
                      {t.pctChange !== null
                        ? `${t.pctChange > 0 ? "+" : ""}${t.pctChange.toFixed(2)}%`
                        : "Unavailable"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="x1-text-button"
                        onClick={() => {
                          setExpandedSectorId(null);
                          onOpenAsset(t.id);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="x52-hm-expanded-grid">
              {expandedTiles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${toneClass(t.tone)} x52-hm-expanded-tile`}
                  onClick={() => {
                    setExpandedSectorId(null);
                    onOpenAsset(t.id);
                  }}
                >
                  <strong>{t.symbol}</strong>
                  <span className="x1-caption" style={{ fontSize: "0.74rem" }}>
                    {t.name}
                  </span>
                  {t.price !== null && <span>{number(t.price, 2)} {t.unit}</span>}
                  {(heatPeriod === "1D" ? sectorQuotes : historicQuotes).filter((quote) => quote.id === t.id).map((quote) =>
                    <small key={quote.id}>{quote.quality}{quote.referenceDate ? " · " + quote.referenceDate + " to " + quote.latestDate : ""}</small>
                  )}
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.9rem" }}>
                    {t.pctChange !== null
                      ? `${t.pctChange > 0 ? "+" : ""}${t.pctChange.toFixed(2)}%`
                      : "— Unavailable"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <span className="x1-caption">
              Key macro drivers: {expandedSector.macroDrivers.join(" · ")}
            </span>
          </div>
        </Modal>
      )}

      {/* [13] Asset Comparison Modal */}
      {compareOpen && (
        <Modal
          title="Compare performance"
          onClose={() => setCompareOpen(false)}
        >
          <div className="x1-form">
            <div className="x1-actions" aria-label="Comparison mode">
              {(["Assets", "Sectors"] as const).map((mode) => <button key={mode} type="button"
                className="x1-secondary" aria-pressed={mode === compareMode} onClick={() => {
                  if (compareMode === mode) return;
                  resetComparison(); setCompareMode(mode); setAssetA(""); setAssetB("");
                }}>{mode}</button>)}
              <button type="button" className="x1-secondary" disabled={!assetA || !assetB} onClick={() => {
                resetComparison(); setAssetA(assetB); setAssetB(assetA);
              }}>Swap</button>
              <button type="button" className="x1-secondary" onClick={() => {
                resetComparison(); setAssetA(""); setAssetB("");
              }}>Clear</button>
            </div>
            <div className="x1-form-grid">
              <AssetPicker label={compareMode + " A"} value={assetA} instruments={instruments}
                onlySectors={compareMode === "Sectors"} onChange={(id) => { resetComparison(); setAssetA(id); }} />
              <AssetPicker label={compareMode + " B"} value={assetB} instruments={instruments}
                onlySectors={compareMode === "Sectors"} onChange={(id) => { resetComparison(); setAssetB(id); }} />
              <label>Period
                <select value={period} onChange={(event) => { resetComparison(); setPeriod(event.target.value); }}>
                  {["1W", "1M", "3M", "6M", "YTD", "1Y"].map((range) => <option key={range}>{range}</option>)}
                </select>
              </label>
            </div>
            {catalogError && <p role="alert">{catalogError}</p>}
          </div>

          {!assetA || !assetB || assetA === assetB ? (
            <p className="x1-caption">Choose two different instruments.</p>
          ) : compareBusy ? (
            <p className="x1-caption">Aligning exact shared observation dates…</p>
          ) : compareErr ? (
            <p role="alert" className="x1-callout">{compareErr}</p>
          ) : compareRes?.comparison.status === "OK" && compareRes.comparison.value ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ComparisonSvgChart comp={compareRes.comparison.value} />
              <div className="x51-cal-metrics">
                <div className="x51-cal-metric">
                  <small>{compareRes.comparison.value.assetA.label}</small>
                  <strong>
                    {compareRes.comparison.value.totalReturnPctA > 0 ? "+" : ""}
                    {number(compareRes.comparison.value.totalReturnPctA, 2)}%
                  </strong>
                </div>
                <div className="x51-cal-metric">
                  <small>{compareRes.comparison.value.assetB.label}</small>
                  <strong>
                    {compareRes.comparison.value.totalReturnPctB > 0 ? "+" : ""}
                    {number(compareRes.comparison.value.totalReturnPctB, 2)}%
                  </strong>
                </div>
                <div className="x51-cal-metric">
                  <small>Relative Spread (n={compareRes.comparison.sampleSize})</small>
                  <strong>
                    {compareRes.comparison.value.spreadPct > 0 ? "+" : ""}
                    {number(compareRes.comparison.value.spreadPct, 2)}%
                  </strong>
                </div>
              </div>
              {compareRes.comparison.warnings.map((w, i) => (
                <p key={i} className="x1-caption" style={{ margin: 0 }}>
                  Note: {w}
                </p>
              ))}
              <p className="x1-caption" style={{ margin: 0 }}>
                Local-currency performance from {compareRes.comparison.value.startDate} to{" "}
                {compareRes.comparison.value.endDate} · Formula: 100 × (Pₜ / P₀ − 1) on
                exact shared dates · {compareRes.comparison.source}.
              </p>
            </div>
          ) : (
            <div className="x1-callout">
              <strong>Historical series unavailable for comparison.</strong>
              <p className="x1-caption" style={{ margin: "4px 0 0" }}>
                {compareRes?.comparison.warnings[0] ??
                  "History appears when both instruments have authorized observations on shared dates."}
              </p>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
