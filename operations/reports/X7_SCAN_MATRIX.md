# X7 scan acceptance matrix

“Fixture” means isolated synthetic or mocked provider data. “Production baseline” means the deployed X5.6 revision on 24 November 2026 IST or the expressly dated owner check in X6_PROGRESS.md. X7 is a draft.

| Case | Result | Expected and observed |
| --- | --- | --- |
| U1 | Code inspected | New Strategy forms initialize to NSE/BSE. The production baseline still initialized to ECB FX. An X7 browser run is open. |
| U2 | Fixture | NSE:SBIN was eligible. The index NSE:NIFTY and MCX futures request were excluded. A version 2 NSE/ECB mismatch returned 400 before any broker call. |
| U3 | Fixture and earlier owner baseline | The MCX preset rejects NSE symbols. The broker resolver checks dated contract expiry. The prior real authorized gold future supplied 32 Daily candles in 45 calendar days. |
| U4 | Fixture and public baseline | ECB groups used the final reference date of each closed period. The production public endpoint returned 13 official FX series at 02:08 IST. |
| U5 | Fixture | Only saved member IDs ran. A caller could neither use an unowned watchlist ID nor silently substitute a default universe for an empty watchlist. |
| U6 | Code inspected | Scope changes clear results and abort stale coverage. A timed browser race test remains open. |
| U7 | Fixture | Canonical instrument search and alias tests exercise HDFC/HDFCBANK, SBIN, RELIANCE, and exchange-qualified identity. |
| U8 | Fixture and public baseline | Member fixture makes no private adapter request. Guest production NSE candle request returned 401. |
| S1 | Fixture | Positive close rule passes eligible OHLC input. Current X7 PR has no corresponding live owner run. |
| S2 | Fixture | Wilder RSI from gains 3 and losses 7 reaches 30; adding the 16th bar crosses above. On the previous cutoff the result is UNKNOWN. |
| S3 | Fixture | The following bar stays above 30 without crossing again and produces a legitimate non-match. |
| S4 | Fixture | Golden Cross reports 201 required and 124 available on the short-history series. |
| S5 | Fixture and earlier owner baseline | The real X5.6 scan evaluated 1 NSE:SBIN, with 0 matches and 0 unknowns. No probability was synthesized. |
| S6 | Fixture | No eligible observations block persistence. Injecting a quota-update failure also rolls back the scan insert. |
| S7 | Fixture and code inspected | Connected 30-minute preflight and Daily CSV submitted as hourly are blocked without candle calls. Scanner execution uses the same scope gate. |
| S8 | Fixture | Broker Daily close boundary and developing weekly/monthly groups are covered. Official FX does not include the current group. |
| S9 | Fixture | The suite covers duplicated and out-of-order timestamps, impossible OHLC, missing data, and invalid evaluation inputs. |
| S10 | Fixture and earlier owner baseline | Golden Cross ran on 215 fixture bars. X5.6 returned 233 real NSE:SBIN bars over a 345-calendar-day window. Extended X7-worker/adapter windows still need live validation. |
| S11 | Fixture | Each of 25, 51, 501, and 1,000 explicit candidates triggered 24 broker requests. The remainder was counted as deferred. |
| S12 | Partial | Licensed source configuration is verified after fetching. New UI aborts stale preflight. Live permission change during fetch remains open. |
| S13 | Fixture and earlier owner baseline | Saved rows are scoped to their owner. Same-key replay returns the same scan ID. The earlier real owner scan survived browser reload. |
| S14 | Fixture and baseline | With no resolved observations, evidence remains insufficient and probability is withheld. |
| S15 | Partial | The two POST routes call the same workspace service. Classic and Advanced formula inputs use the canonical AST. Draw retains its distinct pattern-matching objective. |
| S16 | Fixture | One eligible out of three explicit requests reconciles with two excluded and 33.3% selected-scope coverage. An unavailable scope without candidates displays zero candidates. |
| E1 | Partial | Earlier real desktop owner scan through GRAVEYARD passed. X7 mobile and desktop click-throughs remain open. |
| E2 | Production baseline | The 23 November 23:58–23:59 IST owner check found real quotes and 233/30/32 Daily bars across NSE/BSE/MCX, and saved one Classic scan. See X6_PROGRESS.md. |
| E3 | Fixture and public baseline | Guest live access failed closed with 401. Native identity, consent, cross-account, and broker isolation checks passed in fixtures. |
| E4 | Blocked for X7 | The live release still identified as X5.6. The draft was not deployed. |
| E5 | Partial | Error, timeout, provider authentication, and rate-limit fixtures are covered. Real browser scope-switch race and live provider disconnect were not simulated. |
| E6 | See fix log | Full-suite commands and results are recorded with the final checkpoint. |
| E7 | Production baseline | Read-only public and owner-history smoke ran at about 02:08 IST. No additional X7 live scan was submitted. |
