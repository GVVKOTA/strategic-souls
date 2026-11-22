"use client";
import {
  computeCoveragePct,
  computeMatchPct,
  formatStatPct,
} from "../../../backend/engines/evidence-stats";

/**
 * Responsive SVG stacked coverage bar for Soul Scan results (PASS / FAIL / UNKNOWN).
 * Never turns UNKNOWN into FAIL and never divides by zero.
 */
export function ScanCoverageChart({
  passed,
  failed,
  unknown,
  sourceLabel,
}: {
  passed: number;
  failed: number;
  unknown: number;
  sourceLabel?: string;
}) {
  const safePass = Math.max(0, Math.floor(passed));
  const safeFail = Math.max(0, Math.floor(failed));
  const safeUnknown = Math.max(0, Math.floor(unknown));
  const eligible = safePass + safeFail;
  const total = eligible + safeUnknown;
  const coveragePct = computeCoveragePct(eligible, total);
  const matchPct = computeMatchPct(safePass, eligible);
  const missingPct =
    total > 0 ? Math.round(((100 * safeUnknown) / total) * 10) / 10 : null;

  if (total === 0) {
    return (
      <div className="x53-chart-empty" role="status">
        <strong>No instruments evaluated</strong>
        <span className="x1-caption">
          Coverage: N/A · Match rate: N/A
        </span>
      </div>
    );
  }

  const w = 360;
  const passW = (safePass / total) * w;
  const failW = (safeFail / total) * w;
  const unkW = Math.max(0, w - passW - failW);

  return (
    <div className="x53-evidence-chart">
      <div className="x53-evidence-chart-head">
        <span>
          Coverage <strong>{formatStatPct(coveragePct)}</strong> · Match rate{" "}
          <strong>{formatStatPct(matchPct)}</strong> · Unknown{" "}
          <strong>{formatStatPct(missingPct)}</strong>
        </span>
        {sourceLabel && <span className="x1-caption">{sourceLabel}</span>}
      </div>
      <svg
        viewBox={`0 0 ${w} 14`}
        className="x53-stacked-svg"
        role="img"
        aria-label={`Scan coverage: ${safePass} matched, ${safeFail} failed, ${safeUnknown} unknown out of ${total} examined`}
      >
        <rect x="0" y="2" width={w} height="10" rx="5" fill="#181c22" />
        {passW > 0 && (
          <rect x="0" y="2" width={passW} height="10" rx="4" fill="#34d399" />
        )}
        {failW > 0 && (
          <rect x={passW} y="2" width={failW} height="10" fill="#64748b" />
        )}
        {unkW > 0 && (
          <rect
            x={passW + failW}
            y="2"
            width={unkW}
            height="10"
            rx="4"
            fill="#f59e0b"
          />
        )}
      </svg>
      <div className="x53-chart-legend">
        <span>
          <i style={{ background: "#34d399" }} aria-hidden="true" />
          Matched ({safePass})
        </span>
        <span>
          <i style={{ background: "#64748b" }} aria-hidden="true" />
          Did not match ({safeFail})
        </span>
        <span>
          <i style={{ background: "#f59e0b" }} aria-hidden="true" />
          Unknown ({safeUnknown})
        </span>
      </div>
    </div>
  );
}

/**
 * Responsive empirical outcome & Wilson 95% confidence interval visualization.
 * Renders probability bars ONLY when genuine calibrated empirical data exists;
 * otherwise displays an honest compact empty state ("Insufficient verified observations").
 */
export function EmpiricalProbabilityChart({
  status,
  probability,
  interval,
  resolvedN,
  datesCount,
  labels,
}: {
  status: string;
  probability: number | null;
  interval: readonly [number, number] | null;
  resolvedN: number;
  datesCount: number;
  labels: Record<string, number>;
}) {
  const entries = Object.entries(labels).filter(([, n]) => n > 0);
  const totalLabeled = entries.reduce((sum, [, n]) => sum + n, 0);
  const hasCalibrated =
    probability !== null &&
    Number.isFinite(probability) &&
    probability >= 0 &&
    probability <= 1 &&
    resolvedN > 0 &&
    !/insufficient/i.test(status);

  if (!hasCalibrated) {
    return (
      <div className="x53-chart-empty" role="status">
        <strong>Insufficient verified observations</strong>
        <p className="x1-caption" style={{ margin: 0 }}>
          {resolvedN} resolved comparable {resolvedN === 1 ? "case" : "cases"}{" "}
          across {datesCount} {datesCount === 1 ? "date" : "dates"}. No
          calibrated probability curve or confidence band is synthesized when
          sample gates are unmet.
        </p>
        {totalLabeled > 0 && (
          <div className="x53-label-bars" aria-label="Observed case status counts">
            {entries.map(([k, count]) => (
              <div key={k} className="x53-label-bar-row">
                <span className="x1-caption">{k.toLowerCase()}</span>
                <div className="x53-label-bar-track">
                  <div
                    className="x53-label-bar-fill"
                    style={{
                      width: `${Math.max(4, Math.round((count / totalLabeled) * 100))}%`,
                    }}
                  />
                </div>
                <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.8rem" }}>
                  {count}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const pPct = Math.round(probability * 1000) / 10;
  const lo = interval ? Math.max(0, Math.min(1, interval[0])) : probability;
  const hi = interval ? Math.max(lo, Math.min(1, interval[1])) : probability;
  const loPct = Math.round(lo * 1000) / 10;
  const hiPct = Math.round(hi * 1000) / 10;

  const w = 360;
  const padL = 26;
  const padR = 14;
  const span = w - padL - padR;
  const xOf = (prob: number) => padL + prob * span;

  return (
    <div className="x53-evidence-chart">
      <div className="x53-evidence-chart-head">
        <span>
          Empirical rate <strong>{pPct.toFixed(1)}%</strong> (95% CI{" "}
          {loPct.toFixed(1)}%–{hiPct.toFixed(1)}%)
        </span>
        <span className="x1-caption">
          n = {resolvedN} · {datesCount} dates
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} 68`}
        className="x53-prob-svg"
        role="img"
        aria-label={`Empirical conditional frequency ${pPct.toFixed(1)} percent with 95 percent interval ${loPct.toFixed(1)} to ${hiPct.toFixed(1)} percent across ${resolvedN} resolved cases`}
      >
        {/* Axis ticks 0%, 25%, 50%, 75%, 100% */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={xOf(t)}
              x2={xOf(t)}
              y1="10"
              y2="46"
              stroke="rgba(185,195,206,0.18)"
              strokeDasharray={t === 0.5 ? "3 3" : undefined}
            />
            <text
              x={xOf(t)}
              y="60"
              textAnchor="middle"
              fill="#A7B1BC"
              fontSize="10"
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {/* Base track */}
        <rect x={padL} y="23" width={span} height="10" rx="5" fill="#181c22" />
        {/* 95% confidence interval band */}
        <rect
          x={xOf(lo)}
          y="21"
          width={Math.max(4, xOf(hi) - xOf(lo))}
          height="14"
          rx="4"
          fill="rgba(118,192,255,0.28)"
          stroke="#76C0FF"
          strokeWidth="1.2"
        />
        {/* Point estimate marker */}
        <circle cx={xOf(probability)} cy="28" r="5" fill="#76C0FF" />
      </svg>
      <details className="x1-small-details">
        <summary>Accessible statistical table</summary>
        <table className="x6-accessible-table" style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Empirical conditional frequency</td>
              <td>{pPct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td>95% confidence interval</td>
              <td>
                {loPct.toFixed(1)}% – {hiPct.toFixed(1)}%
              </td>
            </tr>
            <tr>
              <td>Resolved sample size (n)</td>
              <td>
                {resolvedN} cases across {datesCount} dates
              </td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}
