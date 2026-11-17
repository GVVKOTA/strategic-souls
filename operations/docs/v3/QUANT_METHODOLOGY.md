# Quantitative methodology and ten-capability status
All executed numerical checks used clearly identified software fixtures. No live price, historical exchange return, provider entitlement or investment edge is established.

| Required capability | Implementation and verification | Integration state |
|---|---|---|
| 1. Regime-tagged Graveyard | asof_value/regime joins event AND known-at cutoffs, versioned VIX thresholds 15/25, missing-data UNKNOWN | Local logic tested; no entitled Nifty/VIX history connected |
| 2. Walk-forward | Ordered rolling train/validation/test windows; mature-label purging, embargo, training-only frozen selection, OOS fold/aggregate manifests | Determinism/leakage tests passed; real evaluation blocked |
| 3. Git-style scan diffs | Immutable versions, parent/branch/author, typed field/array diffs, CAS and merge-decision research events; comparability gate | SQL and diff tests passed; real collaborative browser merge journey unverified |
| 4. Liquidity/impact | Average traded value, median turnover, delivery %, spread and impact thresholds with units, missing-measure abstention | Tested; provider provenance and frequencies needed for real measures |
| 5. Pre-publish guardrails | Explainable rules, private learning allowed, Team review gate, appeals queue, public fail-closed | PARTIAL: no trained/validated classifier, staffed reviewer or legal approval |
| 6. Corporate actions | Immutable raw bars, split/bonus factors, rights TERP from full terms, separate dividend proxy, point-in-time action replay and fill-unit adjustment | Tested; unresolved rights execution/merger/delisting paths abstain |
| 7. Factor attribution | OLS/HC3, n/rank/condition/leverage checks, intervals and missing-data abstention | Tested against independent arithmetic; real factors absent |
| 8. Vectorized cache | Immutable Parquet generations, bucket dependency hashes, DuckDB allowlisted compilation, atomic publication, checksum validation | Tested and benchmarked on explicit synthetic fixture |
| 9. Mobile command builder | Bounded grammar → editable typed conditions; unknown words and liquid/period/source ambiguities visible; separate run approval | Browser/validation tested; no costly screen executed |
| 10. Sector strength | Aligned 21/63/126-session sector-minus-benchmark returns and dated constituents | Tested; licensed sector histories absent |

## Equations and policies
A completed simulated long trade signals on a completed close and enters at a valid next open, after the signal became known. Missing, halted, zero-volume or unmapped execution observations never become stale-close fills. A fixed holding horizon exits at its declared close. Slippage applies to both sides; net return subtracts two fee-bps charges plus declared round-trip tax bps. Split/bonus share units change only while held. Cash dividends are excluded from price-return runs; a separately labelled gross reinvestment proxy is available for adjusted series.

Rights price factor = TERP / official cum-rights price, where TERP = (cum price + offered shares per old share × subscription price) / (1 + offered shares per old share). Rights volume is not blindly multiplied like a split. Missing terms or unresolved subscription execution abstain. Symbol changes, mergers and delistings require explicit point-in-time lineage.

SMA uses N completed observations and exposes N−1 unavailable values. RSI uses Wilder averages over N price changes and needs N+1 closes; a flat series is 50. ATR uses Wilder true-range smoothing. Volatility is sample standard deviation of completed log returns with a declared 252-session annualization convention, not universal market truth.

Win rate = profitable completed simulated trades / all completed simulated trades. Break-even observations remain in the denominator. N=0 returns null; the reporting rate is withheld below the product floor of 30 completed observations, while raw observed counts remain available for diagnostics. That floor does not establish power or validity. All-loss samples with adequate N have 0%; all-win profit factor is undefined, represented by null with a reason. Wilson intervals and fixed-seed IID bootstrap diagnostics do not resolve dependence or multiple testing.

Drawdown is computed only for a sequential, non-overlapping fixed-allocation return stream; overlapping portfolio trades require a separate capital-allocation model. Annualized return is not fabricated. Factor HC3 intervals are approximate and not serial-dependence adjusted; factors explain association, not causation.

## Time and data gates
Use explicit UTC offsets, publication/known-at times, identity mapping, finalized sessions, complete supplied calendars and historical membership intervals. Never substitute current constituents into historical tests or join a restatement by accounting period instead of publication availability. Cache generation cannot postdate its research cutoff. Rights are checked at current processing time; research cutoff is a different timestamp. EOD screening uses a conservative seven-day staleness ceiling in addition to the supplied session calendar.

## Complexity and benchmark
SMA/EMA/RSI/ATR are O(B) per instrument; volatility/median-window reference paths are bounded O(B×N). DuckDB executes allowed vectorized predicates over partitioned Parquet. Corporate-action replay reference evaluation can be O(B²×A) and is not claimed as a universal fast path. Cache bucket hashing is O(bytes); atomic publication keeps old generations readable.

On 14 November UTC / 15 November IST the Windows fixture benchmark used 41,600 generated rows, 160 instruments, 260 sessions each, one warmup and 12 paired repetitions. Cached end-to-end p50/p95: 213.01/232.86 ms. Uncached read/materialize/recompute p50/p95: 1252.27/1351.94 ms. Match identities agreed in every repetition. Timing excluded allocation tracing; cache build memory was measured separately with tracing. Hardware: 16 logical processors, worker Python 3.14.7. This is an instrumented laboratory software comparison, not field performance or a licensed financial-data benchmark. Exact results and limitations: evidence/quant-benchmark.json.
