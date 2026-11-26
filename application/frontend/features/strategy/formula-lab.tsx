"use client";
import { useEffect, useRef, useState } from "react";
import { AssetPicker, useAssetCatalog } from "../../components/workspace/asset-picker";
import { ArrowRight, FlaskConical } from "lucide-react";
import {
  bsm,
  cagr,
  xirr,
  impliedVolatility,
  manualHistoricalInvestment,
  type ManualHistoricalInvestmentResult,
  type OptionInput,
} from "../../../backend/engines/math";
import type {
  CorrelationLabResult,
  QuantitativeEnvelope,
  ReturnMethod,
} from "../../../backend/engines/analytics";
import {
  Panel,
  Empty,
  api,
  number,
  type Notice,
} from "../../components/workspace/shared";

type CompareApiPayload = {
  correlation: QuantitativeEnvelope<CorrelationLabResult>;
  requestedStart: string;
  frequency: string;
  instruments: { id: string; label: string; basis: string; source: string; dataState: string; latestDate: string | null }[];
};

const FORMULA_LAB_TOOLS = [
  "Correlation Lab",
  "Options & Greeks",
  "Implied volatility",
  "CAGR",
  "XIRR",
  "Historical investment",
] as const;

export default function FormulaLab({ notify }: { notify: Notice }) {
  const [calculator, setCalculator] = useState<string>("Correlation Lab"),
    [option, setOption] = useState<OptionInput>({
      spot: 100,
      strike: 100,
      years: 1,
      rate: 0.05,
      dividendYield: 0,
      volatility: 0.2,
    }),
    [result, setResult] = useState<ReturnType<typeof bsm> | null>(null),
    [manualHist, setManualHist] =
      useState<ManualHistoricalInvestmentResult | null>(null),
    [growth, setGrowth] = useState<string | null>(null),
    // [27] Correlation Lab state
    [corrA, setCorrA] = useState("ECB:USDINR"),
    [corrB, setCorrB] = useState("ECB:EURUSD"),
    [corrMethod, setCorrMethod] = useState<ReturnMethod>("simple"),
    [corrWindow, setCorrWindow] = useState<20 | 60 | 120>(20),
    [corrData, setCorrData] = useState<CompareApiPayload | null>(null),
    [corrBusy, setCorrBusy] = useState(false);

  const [period, setPeriod] = useState("3M");
  const [frequency, setFrequency] = useState("1d");
  const [corrError, setCorrError] = useState("");
  const request = useRef<AbortController | null>(null);
  const { instruments, error: catalogError } = useAssetCatalog(calculator === "Correlation Lab" || calculator === "Historical investment");
  const [historicalAsset, setHistoricalAsset] = useState("");
  const [historicalFrom, setHistoricalFrom] = useState("");
  const [historicalTo, setHistoricalTo] = useState("");
  const [historicalStatus, setHistoricalStatus] = useState("");
  const [historicalResult, setHistoricalResult] = useState<{
    label: string; basis: string; source: string; currency: string;
    from: string; to: string; returnPct: number;
  } | null>(null);
  const historyRequest = useRef<AbortController | null>(null);

  useEffect(() => () => { request.current?.abort(); historyRequest.current?.abort(); }, []);

  function clearHistorical() {
    historyRequest.current?.abort();
    setHistoricalStatus("");
    setHistoricalResult(null);
  }

  async function loadHistorical() {
    clearHistorical();
    if (!historicalAsset || !historicalFrom || historicalFrom >= historicalTo) {
      setHistoricalStatus("Choose an instrument and enter a start date before the end date.");
      return;
    }
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoricalStatus("Loading completed history…");
    try {
      const params = new URLSearchParams({ history: historicalAsset, from: historicalFrom, to: historicalTo });
      const value = await api<NonNullable<typeof historicalResult>>("/api/compare?" + params, undefined, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setHistoricalResult(value);
      setHistoricalStatus("");
    } catch (error) {
      if (!controller.signal.aborted) setHistoricalStatus((error as Error).message);
    }
  }

  function clearCorrelation() {
    request.current?.abort();
    setCorrBusy(false);
    setCorrData(null);
    setCorrError("");
  }

  async function runCorrelation() {
    if (!corrA || !corrB || corrA === corrB) return;
    clearCorrelation();
    const controller = new AbortController();
    request.current = controller;
    setCorrBusy(true);
    try {
      const params = new URLSearchParams({
        a: corrA, b: corrB, method: corrMethod, window: String(corrWindow), period, frequency,
      });
      const value = await api<CompareApiPayload>("/api/compare?" + params, undefined, { signal: controller.signal });
      if (!controller.signal.aborted) setCorrData(value);
    } catch (err) {
      if (!controller.signal.aborted) setCorrError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setCorrBusy(false);
    }
  }

  const calculate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      if (calculator === "Options & Greeks") {
        const p = {
          spot: Number(f.get("spot")),
          strike: Number(f.get("strike")),
          years: Number(f.get("years")),
          rate: Number(f.get("rate")) / 100,
          dividendYield: Number(f.get("dividendYield")) / 100,
          volatility: Number(f.get("volatility")) / 100,
        };
        setOption(p);
        setResult(bsm(p));
      } else if (calculator === "Implied volatility") {
        const p = {
          spot: Number(f.get("spot")),
          strike: Number(f.get("strike")),
          years: Number(f.get("years")),
          rate: Number(f.get("rate")) / 100,
          dividendYield: Number(f.get("dividendYield")) / 100,
        };
        const iv = impliedVolatility(
          p,
          Number(f.get("marketPrice")),
          f.get("type") as "call" | "put",
        );
        setGrowth(
          `${number(iv.volatility * 100, 4)}% annual IV · ${iv.iterations} iterations · residual ${iv.residual.toExponential(2)}`,
        );
      } else if (calculator === "CAGR") {
        setGrowth(
          `${number(cagr(Number(f.get("start")), Number(f.get("end")), Number(f.get("years"))) * 100, 4)}% annual compound growth`,
        );
      } else if (calculator === "XIRR") {
        const flows = String(f.get("flows"))
          .trim()
          .split("\n")
          .map((line) => {
            const [date, amount] = line.split(",");
            return { date: date.trim(), amount: Number(amount) };
          });
        const r = xirr(flows);
        setGrowth(
          `${number(r.rate * 100, 4)}% annual XIRR. ${r.warning || r.method}`,
        );
      } else {
        const res = manualHistoricalInvestment({
          amount: Number(f.get("amount")),
          buyPrice: Number(f.get("buyPrice")),
          sellPrice: Number(f.get("sellPrice")),
          buyDate: String(f.get("buyDate") || ""),
          sellDate: String(f.get("sellDate") || ""),
          fees: Number(f.get("fees") || 0),
        });
        setManualHist(res);
        setGrowth(null);
      }
    } catch (error) {
      setGrowth(null);
      setManualHist(null);
      notify((error as Error).message, true);
    }
  };
  return (
    <div className="x1-work-grid">
      <Panel title="Formula Lab" kicker="Quantitative models & cross-asset correlation">
        <div className="x52-formula-grid" role="tablist" aria-label="Formula Lab tools">
          {FORMULA_LAB_TOOLS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              className="x52-formula-tab"
              aria-selected={calculator === c}
              onClick={() => {
                clearCorrelation();
                clearHistorical();
                setCalculator(c);
                setGrowth(null);
                setResult(null);
                setManualHist(null);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {calculator === "Correlation Lab" ? (
          <div className="x1-form">
            <div className="x1-form-grid">
              <AssetPicker label="Asset A" value={corrA} instruments={instruments}
                onChange={(id) => { clearCorrelation(); setCorrA(id); }} />
              <AssetPicker label="Asset B" value={corrB} instruments={instruments}
                onChange={(id) => { clearCorrelation(); setCorrB(id); }} />
              <label>Analysis period
                <select value={period} onChange={(event) => { clearCorrelation(); setPeriod(event.target.value); }}>
                  {["1M", "3M", "6M", "YTD", "1Y"].map((range) => <option key={range}>{range}</option>)}
                </select>
              </label>
              <label>Observation frequency
                <select value={frequency} onChange={(event) => { clearCorrelation(); setFrequency(event.target.value); }}>
                  <option value="1d">Daily</option><option value="1wk">Weekly</option><option value="1mo">Monthly</option>
                </select>
              </label>
              <label>
                Return definition
                <select
                  value={corrMethod}
                  onChange={(e) => { clearCorrelation(); setCorrMethod(e.target.value as ReturnMethod); }}
                >
                  <option value="simple">Simple returns (Pₜ/Pₜ₋₁ − 1)</option>
                  <option value="log">Log returns ln(Pₜ/Pₜ₋₁)</option>
                </select>
              </label>
              <label>
                Rolling window
                <select
                  value={corrWindow}
                  onChange={(e) => { clearCorrelation(); setCorrWindow(Number(e.target.value) as 20 | 60 | 120); }}
                >
                  <option value={20}>20 paired returns</option>
                  <option value={60}>60 paired returns</option>
                  <option value={120}>120 paired returns</option>
                </select>
              </label>
            </div>
            {catalogError && <p role="alert">{catalogError}</p>}
            <div className="x1-actions">
              <button type="button" className="x1-secondary" disabled={!corrA || !corrB} onClick={() => {
                clearCorrelation(); setCorrA(corrB); setCorrB(corrA);
              }}>Swap</button>
              <button type="button" className="x1-secondary" onClick={() => {
                clearCorrelation(); setCorrA(""); setCorrB("");
              }}>Clear</button>
            </div>
            {corrA && corrA === corrB && <p role="status">Choose two different instruments.</p>}
            <button
              type="button"
              className="x1-primary x1-motion-button"
              disabled={corrBusy || !corrA || !corrB || corrA === corrB}
              onClick={() => void runCorrelation()}
            >
              {corrBusy ? "Computing correlation…" : "Compute Correlation"}
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
        <form key={calculator} className="x1-form" onSubmit={calculate}>
          {calculator === "Options & Greeks" ||
          calculator === "Implied volatility" ? (
            <>
              <div className="x1-form-grid">
                {[
                  ["spot", "Underlying value", 100],
                  ["strike", "Strike", 100],
                  ["years", "Time in years", 1],
                  ["rate", "Annual rate (%)", 5],
                  ["dividendYield", "Dividend yield (%)", 0],
                  ...(calculator === "Options & Greeks"
                    ? [["volatility", "Annual volatility (%)", 20]]
                    : [["marketPrice", "Observed option price", 10]]),
                ].map(([key, label, value]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      step="any"
                      name={String(key)}
                      defaultValue={value}
                      required
                    />
                  </label>
                ))}
              </div>
              {calculator === "Implied volatility" && (
                <label>
                  Option type
                  <select name="type">
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </label>
              )}
            </>
          ) : calculator === "CAGR" ? (
            <div className="x1-form-grid">
              <label>
                Beginning value
                <input
                  type="number"
                  name="start"
                  step="any"
                  min=".000001"
                  required
                  defaultValue="100"
                />
              </label>
              <label>
                Ending value
                <input
                  type="number"
                  name="end"
                  step="any"
                  min="0"
                  required
                  defaultValue="150"
                />
              </label>
              <label>
                Duration in years
                <input
                  type="number"
                  name="years"
                  step="any"
                  min=".000001"
                  required
                  defaultValue="5"
                />
              </label>
            </div>
          ) : calculator === "XIRR" ? (
            <label>
              Cash flows (YYYY-MM-DD, signed amount)
              <textarea
                className="x1-code-editor"
                name="flows"
                required
                defaultValue={"2025-01-01,-1000\n2026-01-01,1100"}
              />
            </label>
          ) : (
            <>
              <fieldset className="x1-form">
                <legend>Historical price performance</legend>
                <AssetPicker label="Historical instrument" value={historicalAsset} instruments={instruments}
                  onChange={(id) => { clearHistorical(); setHistoricalAsset(id); }} />
                <div className="x1-form-grid">
                  <label>From<input type="date" value={historicalFrom} onChange={(event) => {
                    clearHistorical(); setHistoricalFrom(event.target.value);
                  }} /></label>
                  <label>To<input type="date" value={historicalTo} onChange={(event) => {
                    clearHistorical(); setHistoricalTo(event.target.value);
                  }} /></label>
                </div>
                <button className="x1-secondary" type="button" onClick={() => void loadHistorical()}>Load historical return</button>
                {historicalStatus && <p role="status">{historicalStatus}</p>}
                {historicalResult && <p role="status">
                  {historicalResult.label} · {number(historicalResult.returnPct, 2)}% · {historicalResult.from} to {historicalResult.to}.
                  {" "}{historicalResult.basis} in {historicalResult.currency}. Source {historicalResult.source}.
                  {" "}Price performance excludes fees, taxes, and investor-specific FX conversion.
                </p>}
              </fieldset>
              <p className="x1-caption" style={{ marginTop: 0 }}>
                Enter your own buy/sell prices, dates, and fees. Does NOT infer
                splits, bonus issues, dividends, or tax. Automatic historical
                corporate-action lookup remains gated until a licensed dataset
                is connected.
              </p>
              <div className="x1-form-grid">
                <label>
                  Invested amount
                  <input
                    type="number"
                    name="amount"
                    step="any"
                    min="0.01"
                    defaultValue="10000"
                    required
                  />
                </label>
                <label>
                  Buy price / unit
                  <input
                    type="number"
                    name="buyPrice"
                    step="any"
                    min="0.0001"
                    defaultValue="250"
                    required
                  />
                </label>
                <label>
                  Sell / current price
                  <input
                    type="number"
                    name="sellPrice"
                    step="any"
                    min="0"
                    defaultValue="425"
                    required
                  />
                </label>
                <label>
                  Total fees / costs
                  <input
                    type="number"
                    name="fees"
                    step="any"
                    min="0"
                    defaultValue="25"
                  />
                </label>
                <label>
                  Buy date
                  <input
                    type="date"
                    name="buyDate"
                    defaultValue="2023-01-02"
                    required
                  />
                </label>
                <label>
                  Sell / ending date
                  <input
                    type="date"
                    name="sellDate"
                    defaultValue="2026-01-02"
                    required
                  />
                </label>
              </div>
            </>
          )}
          <button className="x1-primary x1-motion-button" type="submit">
            Calculate
            <ArrowRight size={16} />
          </button>
        </form>
        )}
      </Panel>
      <Panel title="Calculation result" kicker="Educational mathematics">
        {calculator === "Correlation Lab" ? (
          corrBusy ? (
            <p className="x1-caption">Aligning paired returns and computing Pearson ρ…</p>
          ) : corrError ? <p role="alert" className="x1-callout">{corrError}</p> : corrData?.correlation.status === "OK" && corrData.correlation.value ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="x1-result-summary">
                <div>
                  <strong>{corrData.correlation.value.pearsonRho.toFixed(4)}</strong>
                  <span>Full-sample Pearson ρ ({corrData.correlation.value.pairedReturnCount} pairs)</span>
                </div>
                <div>
                  <strong>{corrData.correlation.value.rollingSeries.at(-1)?.rho?.toFixed(4) ?? "—"}</strong>
                  <span>Latest rolling Pearson ρ ({corrWindow} pairs)</span>
                </div>
                <div>
                  <strong>{(corrData.correlation.value.rSquared * 100).toFixed(1)}%</strong>
                  <span>R² ({corrData.correlation.value.returnMethod} returns)</span>
                </div>
              </div>
              <dl className="x1-details">
                <div>
                  <dt>Window</dt>
                  <dd>
                    {corrData.correlation.value.startDate} → {corrData.correlation.value.endDate}
                  </dd>
                </div>
                <div>
                  <dt>{corrData.correlation.value.assetA.label} sample volatility</dt>
                  <dd>{corrData.correlation.value.sampleVolPctA.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>{corrData.correlation.value.assetB.label} sample volatility</dt>
                  <dd>{corrData.correlation.value.sampleVolPctB.toFixed(2)}%</dd>
                </div>
              </dl>
              {corrData.correlation.value.rollingSeries.length >= 2 && (
                <RollingCorrelationChart
                  points={corrData.correlation.value.rollingSeries}
                  windowDays={corrData.correlation.value.rollingWindow}
                />
              )}
              {corrData.correlation.warnings.map((w, i) => (
                <p key={i} className="x1-caption" style={{ margin: 0 }}>
                  Warning: {w}
                </p>
              ))}
              <p className="x1-caption" style={{ margin: 0 }}>
                Common observation dates and local-currency returns. Market closing and FX fixing times can differ.
              </p>
              {corrData.instruments.map((asset) => <p key={asset.id} className="x1-caption">
                {asset.label} · {asset.source} · {asset.basis} · {asset.latestDate ?? "History unavailable"} · {asset.dataState}
              </p>)}
              <p className="x1-caption">
                Requested from {corrData.requestedStart}. Returns span each consecutive pair of shared observation dates.
              </p>
            </div>
          ) : (
            <div className="x1-callout">
              <strong>
                {!corrData
                  ? "Ready to compute"
                  : corrData.correlation.status === "UNDEFINED_CONSTANT_SERIES"
                    ? "Correlation undefined (zero variance)"
                    : "Insufficient aligned coverage"}
              </strong>
              <p className="x1-caption" style={{ margin: "4px 0 0" }}>
                {corrData?.correlation.warnings[0] ??
                  "Choose two instruments and compute correlation from their shared observations."}
              </p>
            </div>
          )
        ) : result ? (
          <>
            <div className="x1-result-summary">
              <div>
                <strong>{number(result.call, 4)}</strong>
                <span>Theoretical call</span>
              </div>
              <div>
                <strong>{number(result.put, 4)}</strong>
                <span>Theoretical put</span>
              </div>
            </div>
            <dl className="x1-details">
              {[
                ["Call delta", result.callDelta],
                ["Put delta", result.putDelta],
                ["Gamma", result.gamma],
                ["Vega / 1 vol point", result.vega],
                ["Call theta / day", result.callTheta],
                ["Put theta / day", result.putTheta],
                ["Call rho / 1 rate point", result.callRho],
                ["Put rho / 1 rate point", result.putRho],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>
                    {typeof v === "number"
                      ? number(v, 6)
                      : "Undefined at this limit"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="x1-caption">{result.assumptions}</p>
            <OptionPayoff input={option} result={result} />
            <p className="x1-caption">
              Inputs: S={option.spot}, K={option.strike}, T={option.years}, σ=
              {number(option.volatility * 100)}%. Monetary outputs use your
              input denomination.
            </p>
          </>
        ) : manualHist ? (
          <div role="status">
            <div className="x1-result-summary">
              <div>
                <strong>{number(manualHist.netValue, 2)}</strong>
                <span>Net ending value</span>
              </div>
              <div>
                <strong>
                  {manualHist.netReturnPct >= 0 ? "+" : ""}
                  {number(manualHist.netReturnPct, 2)}%
                </strong>
                <span>Net return</span>
              </div>
            </div>
            <dl className="x1-details">
              <div>
                <dt>Units purchased</dt>
                <dd>{number(manualHist.units, 4)}</dd>
              </div>
              <div>
                <dt>Gross value</dt>
                <dd>{number(manualHist.grossValue, 2)}</dd>
              </div>
              <div>
                <dt>Net profit / loss</dt>
                <dd>{number(manualHist.netProfit, 2)}</dd>
              </div>
              <div>
                <dt>Annualized CAGR</dt>
                <dd>
                  {manualHist.annualizedCagrPct !== null
                    ? `${number(manualHist.annualizedCagrPct, 2)}%`
                    : "Undefined"}
                </dd>
              </div>
              <div>
                <dt>Holding period</dt>
                <dd>
                  {Math.round(manualHist.holdingDays)} days (
                  {number(manualHist.holdingYears, 2)} yrs)
                </dd>
              </div>
              <div>
                <dt>Explicit fees</dt>
                <dd>{number(manualHist.fees, 2)}</dd>
              </div>
            </dl>
            <ul className="x1-caption" style={{ paddingLeft: 18 }}>
              {manualHist.limitations.map((lim) => (
                <li key={lim}>{lim}</li>
              ))}
            </ul>
          </div>
        ) : growth ? (
          <div role="status" className="x1-calculation-result">
            {growth}
          </div>
        ) : (
          <Empty title="Make the assumptions explicit">
            Enter values and calculate. Defaults are educational examples, not
            current market prices.
          </Empty>
        )}
        <div className="x1-source-note">
          <FlaskConical size={19} />
          <p>
            No trading, historical performance or investment recommendation is
            generated.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function OptionPayoff({
  input,
  result,
}: {
  input: OptionInput;
  result: ReturnType<typeof bsm>;
}) {
  const upper = Math.max(
      input.spot * 2,
      input.strike * 2,
      (input.strike + result.call) * 1.15,
    ),
    points = Array.from({ length: 41 }, (_, i) => {
      const at = (upper * i) / 40;
      return {
        at,
        call: Math.max(at - input.strike, 0) - result.call,
        put: Math.max(input.strike - at, 0) - result.put,
      };
    }),
    values = points.flatMap((p) => [p.call, p.put]),
    low = Math.min(0, ...values),
    high = Math.max(0, ...values),
    span = high - low || 1,
    y = (v: number) => 160 - ((v - low) / span) * 140,
    path = (type: "call" | "put") =>
      points.map((p) => `${20 + (p.at / upper) * 360},${y(p[type])}`).join(" ");
  return (
    <div className="x1-option-payoff">
      <h3>Illustrative long-option payoff</h3>
      <p className="x1-caption">
        Profit / loss at expiry per unit, using the calculated theoretical
        premium. No fees, tax or funding cost.
      </p>
      <svg
        viewBox="0 0 400 195"
        role="img"
        aria-label="User-input expiry scenarios: long call as a solid silver line and long put as a dashed gray line, with the horizontal zero-profit line."
      >
        <line
          x1="20"
          x2="380"
          y1={y(0)}
          y2={y(0)}
          stroke="var(--x1-divider-strong)"
          strokeDasharray="4 4"
        />
        <polyline
          points={path("call")}
          fill="none"
          stroke="var(--x1-text-primary)"
          strokeWidth="2"
        />
        <polyline
          points={path("put")}
          fill="none"
          stroke="var(--x1-text-tertiary)"
          strokeDasharray="5 4"
          strokeWidth="2"
        />
        <text x="20" y="186" fill="var(--x1-text-tertiary)" fontSize="12">
          0
        </text>
        <text
          x="380"
          y="186"
          textAnchor="end"
          fill="var(--x1-text-tertiary)"
          fontSize="12"
        >
          {number(upper, 0)} underlying
        </text>
      </svg>
      <div className="x1-caption">
        Solid: long call · Dashed: long put · Maximum loss: the paid premium.
      </div>
      <dl className="x1-details">
        <div>
          <dt>Long call break-even</dt>
          <dd>{number(input.strike + result.call, 4)}</dd>
        </div>
        <div>
          <dt>Long put break-even</dt>
          <dd>
            {input.strike >= result.put
              ? number(input.strike - result.put, 4)
              : "No non-negative break-even"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RollingCorrelationChart({
  points,
  windowDays,
}: {
  points: { date: string; rho: number | null }[];
  windowDays: number;
}) {
  const valid = points.filter((p): p is { date: string; rho: number } => p.rho !== null);
  if (valid.length < 2) return null;
  const w = 400;
  const h = 155;
  const x = (i: number) => 34 + (i / (points.length - 1)) * (w - 46);
  const y = (rho: number) => 16 + ((1 - rho) / 2) * (h - 38);
  const d = points
    .map((p, i) => p.rho === null ? "" :
      `${i > 0 && points[i - 1].rho !== null ? "L" : "M"}${x(i).toFixed(1)},${y(p.rho).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <strong style={{ fontSize: "0.86rem" }}>
        Rolling {windowDays}-pair Pearson correlation (ρ ∈ [−1, +1])
      </strong>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto", display: "block", marginTop: 6 }}
        role="img"
        aria-label={`Rolling ${windowDays}-pair Pearson correlation chart`}
      >
        {([1, 0, -1] as const).map((lvl) => (
          <g key={lvl}>
            <line
              x1="34"
              x2={w - 12}
              y1={y(lvl)}
              y2={y(lvl)}
              stroke={lvl === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)"}
              strokeDasharray={lvl === 0 ? "4 3" : undefined}
            />
            <text x="4" y={y(lvl) + 4} fill="#9AA3AE" fontSize="10">
              {lvl > 0 ? "+1" : String(lvl)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#76C0FF" strokeWidth="2" />
        {points.map((point, i) => point.rho === null ? null : <circle key={point.date}
          cx={x(i)} cy={y(point.rho)} r="3" fill="transparent">
          <title>{point.date} · {point.rho.toFixed(4)} · {windowDays} pairs</title>
        </circle>)}
        <text x="34" y={h - 4} fill="#9AA3AE" fontSize="10">
          {valid[0].date}
        </text>
        <text x={w - 12} y={h - 4} textAnchor="end" fill="#9AA3AE" fontSize="10">
          {valid[valid.length - 1].date}
        </text>
      </svg>
    </div>
  );
}
