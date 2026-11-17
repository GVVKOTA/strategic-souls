"use client";
import { useState } from "react";
import { ArrowRight, FlaskConical } from "lucide-react";
import {
  bsm,
  cagr,
  xirr,
  impliedVolatility,
  type OptionInput,
} from "../../../backend/engines/math";
import { Panel, Empty, number, type Notice } from "../../components/workspace/shared";
export default function FormulaLab({ notify }: { notify: Notice }) {
  const [calculator, setCalculator] = useState("Options & Greeks"),
    [option, setOption] = useState<OptionInput>({
      spot: 100,
      strike: 100,
      years: 1,
      rate: 0.05,
      dividendYield: 0,
      volatility: 0.2,
    }),
    [result, setResult] = useState<ReturnType<typeof bsm> | null>(null),
    [growth, setGrowth] = useState<string | null>(null);
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
      } else
        setGrowth(
          "Unavailable: no licensed, corporate-action-adjusted historical equity series is connected. Splits, dividends, delisted securities, FX and inflation cannot be inferred. No result calculated.",
        );
    } catch (error) {
      setGrowth(null);
      notify((error as Error).message, true);
    }
  };
  return (
    <div className="x1-work-grid">
      <Panel title="Choose the mathematics" kicker="User-entered assumptions">
        <div className="x1-chip-row">
          {[
            "Options & Greeks",
            "Implied volatility",
            "CAGR",
            "XIRR",
            "Historical investment",
          ].map((c) => (
            <button
              key={c}
              aria-pressed={calculator === c}
              onClick={() => {
                setCalculator(c);
                setGrowth(null);
                setResult(null);
              }}
            >
              {c}
            </button>
          ))}
        </div>
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
              <label>
                Historical research question
                <input
                  name="question"
                  defaultValue="What if I invested ₹100 in SBI in 2000?"
                  maxLength={200}
                />
              </label>
              <p className="x1-callout">
                Corporate-action-adjusted prices, total-return history and the
                requested interval must be verified before calculating.
              </p>
            </>
          )}
          <button className="x1-primary x1-motion-button" type="submit">
            {calculator === "Historical investment"
              ? "Check data availability"
              : "Calculate"}
            <ArrowRight size={16} />
          </button>
        </form>
      </Panel>
      <Panel title="Calculation result" kicker="Educational mathematics">
        {result ? (
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
