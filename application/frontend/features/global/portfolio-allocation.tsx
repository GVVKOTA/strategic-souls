"use client";
import { useMemo, useState } from "react";
import { Table2, PieChart } from "lucide-react";
import { computePortfolioAllocation } from "../../../backend/engines/analytics";
import { formatCurrency } from "../../components/workspace/shared";

const SLICE_PALETTE = [
  "#76C0FF",
  "#6EE7B7",
  "#A78BFA",
  "#FBBF24",
  "#38BDF8",
  "#F472B6",
  "#94A3B8",
];

type Props = {
  currency: string;
  cash: number;
  holdings: {
    symbol: string;
    quantity: number;
    basis: number;
  }[];
  onRecordDeposit?: () => void;
};

/**
 * Portfolio Cost-Basis Allocation — Interactive Vivid SVG Donut + Accessible Table Fallback.
 * Ensures 100% single-slice rings render full palette color (never grayscaled or hairline-gapped)
 * and keeps legend rows keyboard-accessible.
 */
export default function PortfolioAllocation({
  currency,
  cash,
  holdings,
}: Props) {
  const [groupBy, setGroupBy] = useState<"assetClass" | "sector" | "position">(
    "assetClass",
  );
  const [tableView, setTableView] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const report = useMemo(
    () =>
      computePortfolioAllocation({
        holdings,
        cash,
        currency,
      }),
    [holdings, cash, currency],
  );

  const slices = useMemo(() => {
    const val = report.value;
    if (!val) return [];
    if (groupBy === "sector") return val.bySector;
    if (groupBy === "position") return val.byPosition.slice(0, 8);
    return val.byAssetClass;
  }, [report, groupBy]);

  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    return slices.reduce<
      {
        key: string;
        label: string;
        amount: number;
        weightPct: number | null;
        holdingCount: number;
        color: string;
        isFullCircle: boolean;
        dashArray: string | undefined;
        dashOffset: number;
        _nextOffset: number;
      }[]
    >((acc, s, idx) => {
      const offset = acc.length > 0 ? acc[acc.length - 1]._nextOffset : 0;
      const frac = s.weightPct !== null ? Math.max(0, Math.min(1, s.weightPct / 100)) : 0;
      const isFullCircle = slices.length === 1 && frac >= 0.999;
      const len = frac * circumference;
      acc.push({
        ...s,
        color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
        isFullCircle,
        dashArray: isFullCircle
          ? undefined
          : `${len.toFixed(2)} ${Math.max(0, circumference - len).toFixed(2)}`,
        dashOffset: isFullCircle ? 0 : -offset,
        _nextOffset: offset + len,
      });
      return acc;
    }, []);
  }, [slices, circumference]);

  const activeSlice =
    segments.find((s) => s.key === hoveredKey) ?? segments[0] ?? null;

  return (
    <div className="x52-alloc-card" aria-label="Portfolio cost-basis allocation">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <strong style={{ fontSize: "0.96rem", color: "var(--x1-title-blue)" }}>
            Allocation
          </strong>{" "}
          <span className="x51-pill">Cost basis</span>
        </div>
        <div className="x51-chip-row">
          {(
            [
              ["assetClass", "Asset Class"],
              ["sector", "Sector"],
              ["position", "Position"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={"x51-chip" + (groupBy === id ? " is-active" : "")}
              aria-pressed={groupBy === id}
              onClick={() => setGroupBy(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="x51-chip"
            aria-pressed={tableView}
            onClick={() => setTableView((v) => !v)}
          >
            {tableView ? <PieChart size={13} /> : <Table2 size={13} />}
            <span style={{ marginLeft: 4 }}>{tableView ? "Chart" : "Table"}</span>
          </button>
        </div>
      </div>

      {report.status !== "OK" || !segments.length ? (
        <p className="x1-caption" style={{ margin: 0 }}>
          Record a holding purchase or cash deposit to view cost-basis
          allocation.
        </p>
      ) : tableView ? (
        <div style={{ overflowX: "auto" }}>
          <table className="x6-accessible-table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Cost Basis</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td>{formatCurrency(s.amount, currency)}</td>
                  <td>{s.weightPct !== null ? `${s.weightPct.toFixed(1)}%` : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="x52-alloc-body">
          <svg
            className="ss-v3-colored-svg"
            viewBox="0 0 160 160"
            width="156"
            height="156"
            role="img"
            aria-label="Cost-basis allocation donut chart"
          >
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="18"
            />
            <g transform="rotate(-90 80 80)">
              {segments.map((seg) => (
                <circle
                  key={seg.key}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={hoveredKey === seg.key ? 21 : 18}
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                  style={{ cursor: "pointer", transition: "stroke-width 140ms ease" }}
                  onMouseEnter={() => setHoveredKey(seg.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                />
              ))}
            </g>
            <text
              x="80"
              y="76"
              textAnchor="middle"
              fill="#F3F5F8"
              fontSize="15"
              fontWeight="700"
            >
              {activeSlice?.weightPct !== null && activeSlice
                ? `${activeSlice.weightPct.toFixed(1)}%`
                : "N/A"}
            </text>
            <text
              x="80"
              y="94"
              textAnchor="middle"
              fill="#9AA3AE"
              fontSize="10"
            >
              {activeSlice ? activeSlice.label.slice(0, 16) : "Cost Basis"}
            </text>
          </svg>

          <div className="x52-alloc-legend" role="list">
            {segments.map((seg) => (
              <div
                key={seg.key}
                role="listitem"
                tabIndex={0}
                className="x52-alloc-row"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(seg.key)}
                onBlur={() => setHoveredKey(null)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <span
                    className="x52-alloc-dot"
                    style={{ background: seg.color }}
                    aria-hidden="true"
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {seg.label}
                  </span>
                </span>
                <span style={{ flexShrink: 0 }}>
                  <strong>{seg.weightPct !== null ? `${seg.weightPct.toFixed(1)}%` : "N/A"}</strong>{" "}
                  <span className="x1-caption">
                    ({formatCurrency(seg.amount, currency)})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
