"use client";
import { useEffect, useState } from "react";
import { Copy, Plus, MoveUp, MoveDown, Trash2, Info } from "lucide-react";
import {
  type RuleTree,
  type ResearchDefinition,
  type OutcomeDefinition,
  type assessEvidence,
} from "../../../backend/services/research/research";
import type { SimpleRule } from "../../../backend/engines/scan";
import type { backtestResearch } from "../../../backend/engines/backtest";
import { api, Panel, number, moment, type ScanRun } from "../../components/workspace/shared";
import { EmpiricalProbabilityChart } from "./evidence-charts";

export function ResearchInfo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="x2-research-info">
      <summary aria-label={label}>
        <Info size={15} />
        <span>{label}</span>
      </summary>
      <div>{children}</div>
    </details>
  );
}
const fields = [
  ["close", "Latest close/reference"],
  ["sma20", "SMA (20)"],
  ["ema20", "EMA (20)"],
  ["rsi14", "Wilder RSI (14)"],
  ["changepct", "Change (%)"],
  ["macd", "MACD (12,26)"],
  ["volume", "Volume"],
  ["atr14", "ATR (14)"],
  ["pe", "P/E"],
  ["pb", "P/B"],
  ["roe", "ROE (%)"],
  ["roce", "ROCE (%)"],
  ["revenuegrowth", "Revenue growth (%)"],
  ["debtequity", "Debt / equity"],
  ["openinterest", "Open interest"],
  ["iv", "IV (%)"],
  ["earningsindays", "Days to earnings"],
  ["yield10y", "10Y yield (%)"],
];
const leaf = (): RuleTree => ({
  kind: "condition",
  rule: { field: "close", op: ">", value: 0 },
});
export function RuleEditor({
  tree,
  onChange,
  path = "1",
  depth = 0,
}: {
  tree: RuleTree;
  onChange: (value: RuleTree) => void;
  path?: string;
  depth?: number;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  function reorder(from: number, to: number) {
    if (
      (tree.kind !== "ALL" && tree.kind !== "ANY") ||
      to < 0 ||
      to >= tree.children.length
    )
      return;
    const children = [...tree.children],
      item = children.splice(from, 1)[0];
    children.splice(to, 0, item);
    onChange({ ...tree, children });
  }
  return (
    <div className={"x2-rule-node x2-rule-" + tree.kind.toLowerCase()}>
      {tree.kind === "condition" ? (
        <div className="x2-condition-fields">
          <label>
            <span className="x1-sr-only">Rule {path} field</span>
            <select
              aria-label={`Rule ${path} field`}
              value={tree.rule.field}
              onChange={(e) =>
                onChange({
                  ...tree,
                  rule: { ...tree.rule, field: e.target.value },
                })
              }
            >
              {fields.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="x1-sr-only">Rule {path} comparison</span>
            <select
              value={tree.rule.op}
              aria-label={`Rule ${path} comparison`}
              onChange={(e) =>
                onChange({
                  ...tree,
                  rule: {
                    ...tree.rule,
                    op: e.target.value as SimpleRule["op"],
                  },
                })
              }
            >
              {[">", ">=", "<", "<=", "==", "!="].map((op) => (
                <option key={op}>{op}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="x1-sr-only">Rule {path} threshold</span>
            <input
              type="number"
              step="any"
              aria-label={`Rule ${path} threshold`}
              value={Number.isFinite(tree.rule.value) ? tree.rule.value : ""}
              onChange={(e) =>
                onChange({
                  ...tree,
                  rule: {
                    ...tree.rule,
                    value: e.target.value === "" ? NaN : Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </div>
      ) : tree.kind === "NOT" ? (
        <>
          <div className="x2-rule-group-title">
            <strong>NOT</strong>
            <button
              type="button"
              className="x1-text-button"
              onClick={() => onChange(tree.child)}
            >
              Remove NOT
            </button>
          </div>
          <RuleEditor
            tree={tree.child}
            onChange={(child) => onChange({ kind: "NOT", child })}
            path={path + ".not"}
            depth={depth + 1}
          />
        </>
      ) : (
        <>
          <div className="x2-rule-group-title">
            <label>
              Group{" "}
              <select
                aria-label={`Group ${path} match`}
                value={tree.kind}
                onChange={(e) =>
                  onChange({ ...tree, kind: e.target.value as "ALL" | "ANY" })
                }
              >
                <option value="ALL">ALL / AND</option>
                <option value="ANY">ANY / OR</option>
              </select>
            </label>
            <span>{tree.children.length} rules</span>
          </div>
          {tree.children.map((child, i) => (
            <div
              key={i}
              className="x2-rule-child"
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) reorder(drag, i);
                setDrag(null);
              }}
            >
              <RuleEditor
                tree={child}
                onChange={(next) =>
                  onChange({
                    ...tree,
                    children: tree.children.map((c, j) => (i === j ? next : c)),
                  })
                }
                path={path + "." + (i + 1)}
                depth={depth + 1}
              />
              <div className="x2-rule-tools">
                <button
                  type="button"
                  className="x1-icon-button"
                  disabled={!i}
                  aria-label={`Move rule ${path}.${i + 1} up`}
                  onClick={() => reorder(i, i - 1)}
                >
                  <MoveUp size={14} />
                </button>
                <button
                  type="button"
                  className="x1-icon-button"
                  disabled={i === tree.children.length - 1}
                  aria-label={`Move rule ${path}.${i + 1} down`}
                  onClick={() => reorder(i, i + 1)}
                >
                  <MoveDown size={14} />
                </button>
                <button
                  type="button"
                  className="x1-icon-button"
                  disabled={tree.children.length >= 12}
                  aria-label={`Duplicate rule ${path}.${i + 1}`}
                  onClick={() => onChange({
                    ...tree, children: [...tree.children.slice(0, i + 1),
                      structuredClone(child), ...tree.children.slice(i + 1)],
                  })}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className="x1-icon-button"
                  disabled={tree.children.length === 1}
                  aria-label={`Delete rule ${path}.${i + 1}`}
                  onClick={() =>
                    onChange({
                      ...tree,
                      children: tree.children.filter((_, j) => i !== j),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <div className="x1-actions">
            <button
              type="button"
              className="x1-text-button"
              disabled={tree.children.length >= 12}
              onClick={() =>
                onChange({ ...tree, children: [...tree.children, leaf()] })
              }
            >
              <Plus size={14} />
              Add rule
            </button>
            <button
              type="button"
              className="x1-text-button"
              disabled={depth >= 5 || tree.children.length >= 12}
              onClick={() =>
                onChange({
                  ...tree,
                  children: [
                    ...tree.children,
                    { kind: "ANY", children: [leaf()] },
                  ],
                })
              }
            >
              Add group
            </button>
          </div>
        </>
      )}
      {tree.kind !== "NOT" && depth < 6 && (
        <button
          type="button"
          className="x1-text-button x2-negate"
          onClick={() => onChange({ kind: "NOT", child: tree })}
        >
          Negate {tree.kind === "condition" ? "rule" : "group"}
        </button>
      )}
    </div>
  );
}
export function OutcomeControls({
  value,
  onChange,
}: {
  value: OutcomeDefinition;
  onChange: (value: OutcomeDefinition) => void;
}) {
  return (
    <details className="x2-outcome-controls">
      <summary>
        Outcome ·{" "}
        {value.family === "POSITIVE_RETURN"
          ? "Positive return"
          : "Target before stop"}{" "}
        · {value.horizon} sessions
      </summary>
      <div className="x2-research-form-grid">
        <label>
          Outcome
          <select
            value={value.family}
            onChange={(e) =>
              onChange({
                ...value,
                family: e.target.value as OutcomeDefinition["family"],
              })
            }
          >
            <option value="POSITIVE_RETURN">Positive adjusted return</option>
            <option value="FIRST_BARRIER">Target before stop</option>
          </select>
        </label>
        <label>
          Horizon (sessions)
          <input
            type="number"
            min={1}
            max={250}
            value={value.horizon}
            onChange={(e) =>
              onChange({ ...value, horizon: Number(e.target.value) })
            }
          />
        </label>
        {value.family === "POSITIVE_RETURN" ? (
          <label>
            Return threshold (%)
            <input
              type="number"
              step="any"
              value={value.threshold}
              onChange={(e) =>
                onChange({ ...value, threshold: Number(e.target.value) })
              }
            />
          </label>
        ) : (
          <>
            <label>
              Target (%)
              <input
                type="number"
                min="0.01"
                step="any"
                value={value.target}
                onChange={(e) =>
                  onChange({ ...value, target: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Stop (%)
              <input
                type="number"
                min="0.01"
                max={99}
                step="any"
                value={value.stop}
                onChange={(e) =>
                  onChange({ ...value, stop: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
        <label>
          Round-trip cost assumption (bps)
          <input
            type="number"
            min={0}
            max={1000}
            value={value.costBps}
            onChange={(e) =>
              onChange({ ...value, costBps: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <p className="x1-caption">
        Hypothesis settings, not trade instructions. One bar touching both
        barriers is ambiguous. A horizon without a barrier touch is a
        non-success; unmatured cases remain censored.
      </p>
    </details>
  );
}
type EvidenceResponse = {
  score: ReturnType<typeof assessEvidence>;
  reusePersonal: boolean;
  similar: {
    id: string;
    name: string;
    created_at: string;
    compatibility: string;
  }[];
  limitation: string;
  historyLimitReached: boolean;
};
export function EvidencePanel({
  scanId,
  selectRun,
}: {
  scanId: string;
  selectRun: (id: string) => void;
}) {
  const [data, setData] = useState<EvidenceResponse | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) {
        setData(null);
        setError("");
      }
    });
    api<EvidenceResponse>(
      "/api/x1/workspace?researchEvidence=" + encodeURIComponent(scanId),
    )
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [scanId, nonce]);
  async function preference(value: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/x1/workspace", {
        action: "research-preferences",
        reusePersonal: value,
      });
      setNonce((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Evidence & probability"
      kicker="Defined outcome · permission-scoped history"
    >
      {error ? (
        <p role="alert">
          {error}
          <button
            className="x1-text-button"
            onClick={() => setNonce((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      ) : !data ? (
        <p role="status">Retrieving permitted evidence…</p>
      ) : (
        <>
          <div className="x2-evidence-state">
            <strong>{data.score.status}</strong>
            {data.score.probability !== null && (
              <p>
                {number(data.score.probability * 100, 1)}% estimated conditional
                frequency · 95% interval{" "}
                {number(data.score.interval![0] * 100, 1)}–
                {number(data.score.interval![1] * 100, 1)}%
              </p>
            )}
            <span>
              {data.score.descriptive.n} resolved comparable cases ·{" "}
              {data.score.descriptive.dates} dates
            </span>
          </div>
          <EmpiricalProbabilityChart
            status={data.score.status}
            probability={data.score.probability}
            interval={data.score.interval}
            resolvedN={data.score.descriptive.n}
            datesCount={data.score.descriptive.dates}
            labels={data.score.descriptive.labels}
          />
          <details className="x1-small-details">
            <summary>Why this evidence state?</summary>
            <ul>
              {data.score.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>{data.limitation}</p>
            <p>{data.score.scope}</p>
            <p>{data.score.split.policy}</p>
            <p>
              Train {data.score.split.training} · validation{" "}
              {data.score.split.validation} · holdout {data.score.split.holdout}
            </p>
            <p>{data.score.drift}</p>
            {Object.entries(data.score.exclusions).map(([why, n]) => (
              <p key={why}>
                {why}: {n}
              </p>
            ))}
          </details>
          {data.score.calibration.holdout && (
            <details>
              <summary>Held-out reliability</summary>
              <p>
                Brier {number(data.score.calibration.holdout.brier, 4)} · ECE{" "}
                {number(data.score.calibration.holdout.ece, 4)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Bin</th>
                    <th>n</th>
                    <th>Predicted</th>
                    <th>Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.score.calibration.holdout.bins
                    .filter((b) => b.n)
                    .map((b) => (
                      <tr key={b.lower}>
                        <td>
                          {number(b.lower, 1)}–{number(b.upper, 1)}
                        </td>
                        <td>{b.n}</td>
                        <td>{number(b.probability, 3)}</td>
                        <td>{number(b.observed, 3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          )}
          <label className="x2-privacy-toggle">
            <input
              type="checkbox"
              checked={data.reusePersonal}
              disabled={busy}
              onChange={(e) => preference(e.target.checked)}
            />
            Use my own eligible history for evidence comparisons
          </label>
          <p className="x1-caption">
            Cross-user learning remains disabled. Sharing with a group does not
            opt you in.
          </p>
          <details className="x1-small-details">
            <summary>Similar permitted history ({data.similar.length})</summary>
            {data.similar.length ? (
              data.similar.map((row) => (
                <button
                  className="x1-asset-button"
                  key={row.id}
                  onClick={() => selectRun(row.id)}
                >
                  <strong>{row.name}</strong>
                  <span>
                    {moment(row.created_at)} · {row.compatibility}
                  </span>
                </button>
              ))
            ) : (
              <p>
                No compatible personal cases yet. Negative-only scan reviews do
                not form a probability denominator.
              </p>
            )}
            {data.historyLimitReached && (
              <p>
                Retrieval covers the latest 100 historical runs; older cohorts
                need an operator export.
              </p>
            )}
          </details>
        </>
      )}
    </Panel>
  );
}
type RichRun = ScanRun & {
  payload: ScanRun["payload"] & {
    description?: string;
    research?: ResearchDefinition;
    backtest?: ReturnType<typeof backtestResearch>;
    replay?: {
      status: string;
      reasons: string[];
      summary: null | {
        n: number;
        median: number | null;
        minimum: number | null;
        maximum: number | null;
        bins: { label: string; n: number }[];
      };
      cases: {
        id: string;
        signalAt: string;
        endAt: string;
        label: string;
        returnPct: number | null;
      }[];
    };
  };
};
export function ReplayPanel({ run }: { run: ScanRun }) {
  const value = (run as RichRun).payload.replay,
    [index, setIndex] = useState(0);
  const at = value?.cases[Math.min(index, (value?.cases.length ?? 1) - 1)];
  const simulation = (run as RichRun).payload.backtest,
    curve = simulation?.curve ?? [];
  const low = Math.min(1, ...curve.map((p) => p.equity)),
    high = Math.max(1.01, ...curve.map((p) => p.equity)),
    start = curve[0] ? Date.parse(curve[0].at) : 0,
    end = curve.at(-1) ? Date.parse(curve.at(-1)!.at) : 1;
  const equityPath = curve
    .map(
      (p) =>
        `${30 + ((Date.parse(p.at) - start) / Math.max(1, end - start)) * 330},${140 - ((p.equity - low) / Math.max(0.001, high - low)) * 115}`,
    )
    .join(" ");
  return (
    <Panel title="Replay & backtest" kicker="Point-in-time lineage required">
      {!value || !value.summary ? (
        <>
          <strong>DATA UNAVAILABLE</strong>
          <p className="x1-caption">
            {value?.reasons.join(" ") ||
              "This older scan has no registered outcome replay. Preserve it; create a named X2 version to preflight the new evidence contract."}
          </p>
        </>
      ) : (
        <>
          <p>
            {value.summary.n} sourced event outcomes · median{" "}
            {number(value.summary.median)}% · range{" "}
            {number(value.summary.minimum)}% to {number(value.summary.maximum)}%
          </p>
          <label>
            Event ruler
            <input
              aria-label="Replay event"
              type="range"
              min={0}
              max={Math.max(0, value.cases.length - 1)}
              value={Math.min(index, value.cases.length - 1)}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
          </label>
          {at && (
            <p>
              {at.signalAt.slice(0, 10)} → {at.endAt.slice(0, 10)} · {at.label}{" "}
              · {number(at.returnPct)}%
            </p>
          )}
          <div className="x2-distribution">
            {value.summary.bins.map((bin) => (
              <div key={bin.label}>
                <span>{bin.label}</span>
                <meter min={0} max={value.summary!.n || 1} value={bin.n} />
                <strong>{bin.n}</strong>
              </div>
            ))}
          </div>
          <p className="x1-caption">{value.reasons.join(" ")}</p>
        </>
      )}
      {simulation?.summary && (
        <details className="x1-small-details">
          <summary>Hypothetical strategy simulation</summary>
          <p>
            {simulation.summary.trades} non-overlapping trades · total return{" "}
            {number(simulation.summary.totalReturnPct)}% · close-based drawdown{" "}
            {number(simulation.summary.maxDrawdownPct)}%
          </p>
          <p>
            {simulation.summary.ambiguous} ambiguous stop-first scenarios ·{" "}
            {simulation.summary.unresolved} censored signals ·{" "}
            {simulation.summary.costBps} bps costs +{" "}
            {simulation.summary.slippageBps} bps slippage assumed.
          </p>
          {curve.length > 0 && (
            <svg
              viewBox="0 0 390 175"
              role="img"
              aria-label="Hypothetical normalized equity over sourced observation dates; starts at one. No actual investment return is claimed."
            >
              <line
                x1="30"
                x2="360"
                y1="140"
                y2="140"
                stroke="var(--x1-divider-strong)"
              />
              <polyline
                points={equityPath}
                fill="none"
                stroke="var(--x1-text-primary)"
                strokeWidth="2"
              />
              <text x="2" y="25" fill="var(--x1-text-tertiary)" fontSize="12">
                {number(high, 2)}
              </text>
              <text x="2" y="145" fill="var(--x1-text-tertiary)" fontSize="12">
                {number(low, 2)}
              </text>
              <text x="30" y="166" fill="var(--x1-text-tertiary)" fontSize="12">
                {curve[0].at.slice(0, 10)}
              </text>
              <text
                x="360"
                y="166"
                textAnchor="end"
                fill="var(--x1-text-tertiary)"
                fontSize="12"
              >
                {curve.at(-1)!.at.slice(0, 10)}
              </text>
            </svg>
          )}
          <p>
            Same-window benchmark:{" "}
            {simulation.summary.benchmarkReturnPct === null
              ? "Unavailable — compatible entitled benchmark not supplied"
              : number(simulation.summary.benchmarkReturnPct) + "%"}
          </p>
          <details>
            <summary>Trades and assumptions</summary>
            {simulation.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            <div className="x1-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Outcome</th>
                    <th>Model return</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.trades.map((trade, i) => (
                    <tr key={i}>
                      <td>{trade.entryAt.slice(0, 10)}</td>
                      <td>{trade.exitAt.slice(0, 10)}</td>
                      <td>{trade.label}</td>
                      <td>{number(trade.returnPct)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </details>
      )}
    </Panel>
  );
}
export function Comparison({ runs }: { runs: ScanRun[] }) {
  const [first, setFirst] = useState(""),
    [second, setSecond] = useState("");
  const a = runs.find((r) => r.id === first) ?? runs[0],
    b = runs.find((r) => r.id === second) ?? runs[1];
  return (
    <details className="x2-comparison">
      <summary>Compare research versions</summary>
      {runs.length < 2 ? (
        <p>
          Run or save two genuine scans to compare their methods and coverage.
        </p>
      ) : (
        <>
          <div className="x2-research-form-grid">
            <label>
              First scan
              <select value={a?.id} onChange={(e) => setFirst(e.target.value)}>
                {runs.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name} · {moment(r.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Second scan
              <select value={b?.id} onChange={(e) => setSecond(e.target.value)}>
                {runs.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name} · {moment(r.created_at)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="x2-compare-grid">
            {[a, b].filter(Boolean).map((run, i) => (
              <article key={i}>
                <h3>{run.name}</h3>
                <p>
                  {(run as RichRun).payload.description ||
                    "Legacy scan: no description was recorded."}
                </p>
                <code>{run.payload.rule.formula}</code>
                <dl className="x1-details">
                  <div>
                    <dt>As of</dt>
                    <dd>{moment(run.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Universe / matched / unknown</dt>
                    <dd>
                      {run.payload.results.total} /{" "}
                      {run.payload.results.matches ?? "Withheld"} /{" "}
                      {run.payload.results.unknown ?? "Withheld"}
                    </dd>
                  </div>
                  <div>
                    <dt>Outcome horizon</dt>
                    <dd>
                      {(run as RichRun).payload.research?.outcome.horizon ??
                        "Not registered"}
                    </dd>
                  </div>
                </dl>
                <p className="x1-caption">{run.payload.knownAtPolicy}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
