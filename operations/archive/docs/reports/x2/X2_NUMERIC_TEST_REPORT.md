# Numeric verification — 17 November 2026

The integrated test suite passes 244 tests, zero failures/skips. Pure maths are checked with explicit independent expected arithmetic; service/API tests additionally use isolated SQLite and deterministic labelled fixtures. This is software verification, not a third-party model audit or live P&L proof.

- Chart analytics: SMA/seeded EMA warmup and null propagation, Wilder RSI flat/up/down boundaries, population Bollinger variance, Wilder ATR seed, MACD, close drawdown, matching-date normalized comparison and weekly/monthly aggregation. Daily-data VWAP is unavailable; no invented session volume is supplied.
- Statements/ratios: negative earnings and zero denominators yield unavailable P/E/P/B/ROE; FCF/capex sign and same fiscal/unit/basis comparison verified. Missing/blank/bool is not zero, genuine zero retained; future/impossible filing dates rejected.
- Scan logic: canonical ALL/ANY/NOT equivalence, actual source→strict engine DATE/known-at contract, source-missing UNKNOWN distinct from FAIL, explicit partial policy, bounded DSL and exact identity scope.
- Outcome/evidence: adjusted return and costs, observable opening-gap barrier order, same-bar ambiguity, censoring, future-knowledge exclusion, Wilson analytic boundaries/50-of-100 reference, Brier/ECE, purged chronological holdouts and baseline/drift gates.
- Simulation: next-open entry, non-overlap, costs/slippage, conservative labelled ambiguity scenario, close-based drawdown and insolvency/censoring guards. Current real sources cannot execute historical model output because PIT prerequisites fail.
- Existing portfolio arithmetic: moving-average basis, fees/cash/dividends, fractional oversell prevention and authoritative same-millisecond transaction order remain covered.

Source files: `tests/x2-data.test.mjs` (25), `tests/x2-research.test.mjs` (16), `tests/x2-backtest.test.mjs` (5), `tests/x1-workspace.test.mjs` (30), plus original scan/portfolio/API/privacy/security/UI suites. Saved raw test output accompanies the release. No fixture rows are inserted into hosted market history.
