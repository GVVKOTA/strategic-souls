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
import { Modal, api, number } from "../../components/workspace/shared";

type CompareApiResponse = {
  asOfUTC: string;
  availableSeries: { id: string; label: string; currency: string; source: string; observations: number }[];
  comparison: QuantitativeEnvelope<AssetComparisonResult>;
};

type Props = {
  data: MarketSnapshot | null;
  onOpenAsset: (id: string) => void;
};

function toneClass(tone: SectorHeatmapSummary["tiles"][number]["tone"]): string {
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
    return map;
  }, [data]);

  const heatmaps = useMemo(() => buildSectorHeatmaps(quoteMap), [quoteMap]);
  const expandedSector = useMemo(
    () => NSE_SECTOR_INDICES.find((s) => s.id === expandedSectorId) ?? null,
    [expandedSectorId],
  );
  const expandedHm = useMemo(
    () => heatmaps.find((h) => h.sectorId === expandedSectorId) ?? null,
    [heatmaps, expandedSectorId],
  );

  const runCompare = useCallback(
    async (a: string, b: string) => {
      setCompareBusy(true);
      setCompareErr("");
      try {
        const res = await api<CompareApiResponse>(
          `/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
        );
        setCompareRes(res);
      } catch (err) {
        setCompareErr(
          err instanceof Error ? err.message : "Could not run asset comparison.",
        );
      } finally {
        setCompareBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!compareOpen) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) void runCompare(assetA, assetB);
    });
    return () => {
      alive = false;
    };
  }, [compareOpen, assetA, assetB, runCompare]);

  return (
    <section aria-labelledby="x52-sectors-heading">
      <div className="x52-section-center">
        <h2 id="x52-sectors-heading">NSE Sector Explorer &amp; Heatmaps</h2>
        <p>
          Curated NSE sector leaders (reference subset, not complete real-time
          index composition) · Neutral tiles shown until licensed NSE quotes
          connect
        </p>
        <div className="x52-section-center-actions">
          <button
            type="button"
            className="x1-secondary"
            style={{ minHeight: 38, fontSize: "0.84rem" }}
            onClick={() => setCompareOpen(true)}
          >
            <ArrowLeftRight size={14} />
            <span>Compare 2 Assets</span>
          </button>
        </div>
      </div>

      <div className="x52-sector-grid" role="list" aria-label="NSE sectoral benchmarks">
        {NSE_SECTOR_INDICES.map((sec) => {
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
                    {sec.constituents.length} leaders · Rev {sec.reviewDate}
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
                  <div key={t.id} className={toneClass(t.tone)}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                    ? `Breadth: ${hm.advancers}↑ / ${hm.decliners}↓`
                    : "Quotes awaiting NSE feed"}
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
          onClose={() => setExpandedSectorId(null)}
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
                ? `${expandedHm.connectedCount}/${expandedHm.totalCount} constituents live`
                : "Licensed NSE quote feed not connected — neutral tiles shown"}
            </span>
            <button
              type="button"
              className="x51-chip"
              aria-pressed={textMode}
              onClick={() => setTextMode((v) => !v)}
            >
              {textMode ? "Tile View" : "Accessible Table"}
            </button>
          </div>

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
                {expandedHm.tiles.map((t) => (
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
              {expandedHm.tiles.map((t) => (
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
          title="Asset Comparison (Normalized Base = 100)"
          onClose={() => setCompareOpen(false)}
        >
          <div className="x1-form-grid" style={{ marginBottom: 12 }}>
            <label>
              Asset A
              <select value={assetA} onChange={(e) => setAssetA(e.target.value)}>
                {(compareRes?.availableSeries ?? [
                  { id: "ECB:USDINR", label: "USD / INR" },
                  { id: "ECB:EURUSD", label: "EUR / USD" },
                  { id: "ECB:GBPUSD", label: "GBP / USD" },
                  { id: "ECB:USDJPY", label: "USD / JPY" },
                ]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.id})
                  </option>
                ))}
                <option value="NSE:NIFTY">NIFTY 50 (NSE — Pending feed)</option>
                <option value="GLOBAL:XAUUSD">Gold XAU/USD (Pending feed)</option>
              </select>
            </label>
            <label>
              Asset B
              <select value={assetB} onChange={(e) => setAssetB(e.target.value)}>
                {(compareRes?.availableSeries ?? [
                  { id: "ECB:EURUSD", label: "EUR / USD" },
                  { id: "ECB:USDINR", label: "USD / INR" },
                  { id: "ECB:GBPUSD", label: "GBP / USD" },
                  { id: "ECB:USDJPY", label: "USD / JPY" },
                ]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.id})
                  </option>
                ))}
                <option value="NSE:NIFTY">NIFTY 50 (NSE — Pending feed)</option>
                <option value="GLOBAL:XAUUSD">Gold XAU/USD (Pending feed)</option>
              </select>
            </label>
          </div>

          {compareBusy ? (
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
                Window: {compareRes.comparison.value.startDate} to{" "}
                {compareRes.comparison.value.endDate} · Formula: 100 × (Pₜ / P₀ − 1) on
                exact shared dates · {compareRes.comparison.source}.
              </p>
            </div>
          ) : (
            <div className="x1-callout">
              <strong>Historical series unavailable for comparison.</strong>
              <p className="x1-caption" style={{ margin: "4px 0 0" }}>
                {compareRes?.comparison.warnings[0] ??
                  "Select two connected ECB reference series to compare exact aligned observations."}
              </p>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
