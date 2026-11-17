# Strategic Souls X1 — canonical scan and mathematics contract

Implemented and checked 17 November 2026 in the existing Site's source checkout. This document describes the code in `lib/x1/scan.ts` and `lib/x1/math.ts`; it does not establish that a licensed equity feed, hosted scan persistence, or production execution is configured.

## One rule engine

`compileFormula(text, optionalNumericParameters)` and `compileRules(blocks, join)` produce the same `CanonicalRule` shape:

```ts
{
  version: 'x1-rule-1',
  ast: Ast,
  formula: string,       // normalized representation, preserving semantics
  dependencies: string[],
  categories: Category[]
}
```

A Simple block is `{field, op, value}`, optionally with a UI-only `id`. Valid comparison operators are `> >= < <= == !=`; the join is `ALL` or `ANY`. Aliases are `sma20`, `ema20`, `rsi14`, `macd`, `atr14`, and `changePct`. Text is case-insensitive for field/function names. `toSimpleRules(rule)` returns a lossless flat block representation or `null`; callers must retain the Advanced rule when conversion is unsupported.

Examples:

```text
ALL(close > sma(close, 20), rsi(close, 14) < 70)
close / sma(close, 20) > 1.02 AND volume > 100000
ANY(crossesabove(close, sma(close, 20)), within(rsi14 < 30, 5))
NOT(pe > 30) AND revenueGrowth > 10
```

Numeric parameters are validated and resolved into immutable literals at compilation. Changing an input parameter object afterwards cannot change a saved method. Unknown functions, property access, assignments, code, invalid units, and unsupported syntax are rejected with line and column. There is no `eval`, `Function`, SQL interpolation, or interpreter for a general-purpose language.

## Supported mathematics and types

Arithmetic: `+ - * /`, unary minus, parentheses, numeric comparisons, `AND/OR/NOT` (also `&&`, `||`, `!`), and `all/any/not`. Functions: `sma`, `ema`, `rsi`, `macd`, `atr`, `abs`, `min`, `max`, `lag`, `change`, `range`, `within`, `crossesabove`, `crossesbelow`.

- SMA includes the selected observation and requires the full window.
- EMA uses an initial arithmetic average of the first `n` eligible observations, followed by alpha `2/(n+1)` over subsequent eligible observations.
- RSI and ATR use Wilder smoothing with full initial windows. Flat RSI is explicitly defined as 50; no losses with positive gains yields 100; no gains with positive losses yields 0.
- MACD is the fast EMA minus slow EMA, with independently seeded windows. It is the MACD line, not a signal line or histogram.
- `change(series,n)` is a percentage-point return `(current/prior-1)*100` over `n` observations; a zero denominator yields UNKNOWN.
- Crosses require both current and previous observations. `within(condition,n)` means any of the most recent `n` eligible observations, including the selected observation.
- Different units cannot be directly added or compared: `close + volume` and `close > rsi14` are errors. Literal numeric thresholds and constant arithmetic adopt the compared measurement's unit. Dividing compatible prices produces a scalar.

Seven categories are represented: Technical, Fundamental, Derivatives, Macroeconomic, Events, Sentiment, Custom. Fundamental/derivative/macro/event/sentiment fields have no default data; unconnected fields remain UNKNOWN. Registered percentage fields such as `roe`, `iv`, `cpi`, and `yield10y` are percentage numbers (e.g. 5 means 5%), not decimal fractions. `pe`, `pb`, `debtEquity`, `delta`, and sentiment are scalars; option rates and volatility in Formula Lab are separately documented annual decimals.

Missing categories are structural contracts, not a claim of seven connected data products. Bollinger bands, MACD signal/histogram, user-defined recursive functions, statistical probability, and backtesting are not implemented by this module.

## Data eligibility, UNKNOWN, and provenance

`evaluateScan(rule, datasets, asOf)` takes explicit instrument datasets:

```ts
{
  instrumentId: 'provider:venue:contract',
  currency: 'USD', source: 'Verified provider / dataset', permitted: true,
  frequency: 'DAILY', maxAgeMs: optionalExplicitFreshnessBudget,
  observations: [{eventAt, knownAt, close, open?, high?, low?, volume?, fields?}]
}
```

Both timestamps must include a timezone and valid calendar date. Event times must be unique and increasing; availability must be at or after the event. Only observations with `eventAt <= asOf` AND `knownAt <= asOf` are eligible. A later publication of an older observation is excluded until publication, avoiding release-time look-ahead. This does not by itself construct point-in-time fundamentals from restated modern filings; the adapter must supply the correct historical dataset.

`permitted` comes from trusted server configuration and rights checks, never a user's browser checkbox. Supplying a public webpage or TradingView widget does not create analysis rights. Duplicate instrument IDs are rejected; spot/futures/share-class contracts require distinct identities. Missing/invalid values, insufficient history, non-finite arithmetic, a zero denominator, invalid observation order, missing rights, or exceeded freshness/budget produce UNKNOWN with a reason.

Three-valued boolean semantics are deliberate: `ALL(FALSE, UNKNOWN)` is FALSE; `ANY(TRUE, UNKNOWN)` is TRUE; `NOT(UNKNOWN)` remains UNKNOWN. UNKNOWN is counted separately from evaluated failures. Results return total, eligible, matches, failed, unknown, source, selected event time, and numeric comparison explanations. No BUY/SELL, ranking by expected profit, fake probability, or recommendation is produced.

For an immutable saved run, the server integration must store the canonical rule/version, as-of, exact dataset snapshot or immutable version/digest, provenance/rights, results, and timestamps together. This module performs pure evaluation; its caller owns persistence, per-account authorization, credits, retry idempotency, history, and Graveyard state. Every scan belongs in Scan History; only a separately reviewed/retired/invalidated methodology belongs in Graveyard. No collective aggregate or probability calculation is enabled here.

Resource limits: formula 4,000 characters, 1,000 tokens, 256 AST nodes, depth 24, lookback 250, 32 flat Simple blocks, 32 numeric parameters, 200 datasets, 5,000 observations per dataset, and 250,000 evaluation steps per dataset. API request/body/universe limits should be narrower where the hosting budget requires. These bounds are deterministic rejection limits, not performance certification on low-end devices.

## Formula Lab

`bsm` supports an object `{spot,strike,years,rate,dividendYield,volatility}` or the same six positional values. Rates and volatility are annual decimals: 0.05 = 5%, volatility 0.2 = 20%. Results contain call/put, call/put delta, gamma, vega, call/put theta, and call/put rho.

The model assumes European exercise, continuous yield and compounding, constant volatility/rates, and no fees/taxes. It does not price early exercise or arbitrary discrete dividends. Vega/rho are price changes per one percentage point; theta is per calendar day using 365 days. Put-call parity reconstructs the in-the-money option from the out-of-the-money side to limit tail cancellation. At zero expiry the result is intrinsic value; gamma/theta are `null` (undefined), and at-the-money delta uses the disclosed midpoint convention. At zero volatility the deterministic discounted-payoff limit is explicit, with undefined kink Greeks and the right-hand volatility derivative for vega.

`impliedVolatility(input, marketPrice, 'call'|'put')` validates discounted no-arbitrage bounds, rejects expiry, and bisects within 0–500% annual volatility for at most 160 iterations. It returns volatility, iterations, residual. Prices at the discounted lower bound have zero volatility under the model; a quote requiring higher volatility is rejected rather than clamped.

`cagr(begin,end,years)` returns a decimal annual growth rate. A positive beginning amount and positive duration are required; a zero terminal value gives -100%. `xirr(flows,guess?)` combines same-day cash flows, validates real `YYYY-MM-DD` dates, and uses ACT/365 and a bounded log-rate bracket search/bisection. Multiple detected roots are errors; cash flows with more than one sign change carry a uniqueness warning even when one root is detected. It returns rate, iterations, actual residual, method, and warning. No convergence is guessed or claimed beyond the bracketed range.

`historicalInvestment` requires a positive amount, verified adjusted prices, named source, analysis rights, explicit split/dividend adjustment mode, corporate-action verification, and delisting coverage confirmation. Missing history is an error. Non-session start/end dates use the first observation on/after start and last on/before end, limited to seven-day boundary gaps and with actual chosen dates returned. Output is a retrospective adjusted-series scenario with fractional mathematical units, excluding fees, taxes, inflation, and FX conversion. It never invents SBI prices from 2000 or assumes that a raw close series includes dividends.

## Verification actually run

Local Windows, Node v22.16.0, 17 November 2026:

```text
node --experimental-strip-types --test tests/x1-scan.test.mjs tests/x1-math.test.mjs
22 tests / 22 pass / 0 fail / 0 skip (exit 0)
```

Meaningful cases include 80 varied Simple/Advanced equivalence scenarios, 48 IV call/put recoveries, dividend put-call parity over multiple inputs, finite-difference delta/gamma/vega/rho/theta comparisons, expiry/zero-volatility/deep tails, irregular-flow XIRR benchmark and multiple roots, missing/unsourced historical prices, tri-state truth tables, date/release look-ahead, stale/no-rights data, unit/resource/code injection rejection, and category gaps.

```text
node node_modules/typescript/bin/tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --skipLibCheck lib/x1/scan.ts lib/x1/math.ts
exit 0
node node_modules/eslint/bin/eslint.js lib/x1/scan.ts lib/x1/math.ts
exit 0
```

These are local engine/mathematics tests with clearly named fixtures. They do not prove production feeds, a live scan API, database persistence, browser workflows, cross-user permissions, or deployment. The lead integration report must supply that separate evidence.
