# Provider matrix — 17 November 2026

Verified endpoint/rights sources are linked in [X2_DATA_SETUP.md](../setup/X2_DATA_SETUP.md). No vendor price is invented: commercial display, non-display, derived display, retention, exchange charges, users, GST and redistribution need a written quote and actual agreement. Budget reserve is not evidence of affordable compliant access.

| Market / need | Adapter / exact product | Current status |
|---|---|---|
| FX daily references | Official ECB / derived cross references from same-date rates | REAL CONNECTED, published daily only, no OHLC/volume fiction, conservative retrieval known-at |
| US yield curve | Official US Treasury published daily yields | REAL CONNECTED, not an executable bond quote |
| NSE/BSE EOD | TrueData historical bearer endpoint or EODHD EOD with explicit mappings | KEY REQUIRED and ENTITLEMENT NOT VERIFIED; no authenticated vendor probe |
| MCX dated contracts | TrueData historical mapping with actual symbol/expiry/lot/tick/multiplier | KEY REQUIRED; generic MCX seeds require contract selection; no invented expiry or continuous-contract execution |
| Indices/global daily | Entitled vendor identity mapping, daily EOD endpoint | KEY REQUIRED; index fundamentals explicitly inapplicable |
| Company statements/news | EODHD financial statements and linked news under actual entitlement | KEY REQUIRED; missing filing currency/basis/known-at is not fabricated |
| Intraday/live exchange tick streaming | No live streaming adapter implemented | UNAVAILABLE; source key never turns EOD into LIVE |
| Options chains/Greeks/OI history/depth | Actual appropriate licensed source absent | UNAVAILABLE; theoretical Formula Lab remains separately labelled |
| PIT adjusted vintage history and calibration | Certified release-vintage, corporate-action and retention contract absent | DATA UNAVAILABLE / INSUFFICIENT EVIDENCE; model output suppressed |

Provider test success verifies an endpoint response only. Exchange/user/storage/display rights are owner-attested contract metadata and checked separately. Keys stay in named server secrets. Source routing never merges different providers into one historical series. Restricted snapshots are re-projected on each read after revocation; digest continues to refer to the complete lawful stored snapshot.
