# Strategic Souls — Public Shared Market Data Implementation

**Branch:** `feat/public-shared-market-data` (based on verified `main` `5ac5b5bdee274dec86e30085199a305199f4bb37`)  
**Date:** 25 November 2026 IST

---

## 1. Architecture Summary & Reconciliation

Instead of merging overlapping draft PRs (#5, #6, #7) wholesale — which would have deleted the founder's Angel One VPC adapter and reverted PRs #8–#13 (`0020_official_reference_cache.sql`, official reference caching, session hardening, and UI fixes) — this implementation reconciles one canonical shared-data and durable Nifty 500 scanning pipeline directly onto `main` `5ac5b5b`:

| File | Responsibility & Changes |
| --- | --- |
| `backend/services/market-data/data-types.ts` | Added `SharedRightsMode` (`DISPLAY_AND_DERIVED` \| `DERIVED_ONLY` \| `NONE`) and `SharedErrorCode` enum for structured non-blanket error reporting. |
| `backend/services/market-data/providers.ts` | Added `bharatStockEquityCandles()` (`GET /v1/stocks/{ticker}/prices` with strict OHLCV + `adjusted_close` + volume validation); preserved close-only `indianDailyPrices()` (never fabricates OHLC); raised `dailyCallLimit` cap to `30,000` (supports BharatStock Starter/Growth/Pro); separated derived-only shared validation from raw display/redistribution (`display: true` requires `redistribution: true`; derived-only allows `display: false, redistribution: false` when `verified && analysis && storage && derivedDisplay`). |
| `backend/services/market-data/nifty-500.ts` | Added optional `series` validation (`EQ`/`BE`/`RR`), exposed both `expectedCount` and `distinctCount`, preserved flexible `[450, 550]` official counts and SHA-256 version pinning. |
| `backend/services/market-data/shared-history.ts` | Separated `hasSharedDerivedRights()` from `hasSharedDisplayRights()` and `sharedRightsMode()`; updated `sharedHistoryGrants(now, purpose)` across `"research"`, `"display"`, `"dashboard"`, `"ingestion"`; enforced strict `hasSharedDisplayRights` on `readSharedDailyQuotes()` and display reads; added `sharedUniverseReadiness()` & `purgeExpiredSharedHistory()`; raised bounded cron cycle work to up to 6 tasks per 2-minute tick strictly bounded by `reserveProviderCall` and 25s wall-clock cap. |
| `backend/services/market-data/data-service.ts` | Wired `shared-history.ts` and `nifty-500.ts` into `exchangeScanAvailable()`, `canScanExchange()`, `scanScopeInstruments()`, `instrumentRegistry()`, `providerSettings()`, `configureProvider()` (`useNiftyUniverse` for `INDIANAPI` & `BHARATSTOCK`), `testProvider()`, `sourceResearch()`, `currentDisplayRights()`, `researchUniverse()`, and `loadExtendedMarketData()`, while preserving 100% of the owner-only Angel One VPC adapter path. |
| `backend/services/market-data/nine-card-markets.ts` | Preserved owner Angel One live/EOD quotes and public ECB USD/INR; added display-licensed fallback from `sharedHistoryGrants(now, "dashboard")` (strictly `isLive: false`, `PUBLISHED_EOD`/`STALE`, never substitutes for unavailable WTI/MCX/Sensex). |
| `backend/services/research/scan-retention.ts` | Keeps raw time-limited exchange bars out of immutable `x1_scans` archives (`isSharedExchangeDataset`, `archivalScanRows`). |
| `backend/services/research/scan-projection.ts` | Enforces read-time licence checks on every GRAVEYARD read (`currentDisplayRights` with `configVersion` + `niftyUniverseRightsActive`). Distinguishes `mode: "DERIVED_ONLY"` (keeps derived `PASS`/`FAIL`/`UNKNOWN` & `matched`/`unmatched`, strips raw OHLCV/metrics/datasets) from `mode: "WITHHELD"` (expired/revoked grant hides all outcomes). |
| `backend/services/research/scan-quota.ts` | Preserved Classic (20/IST day) and Advanced (1/rolling 60 min) rules; fixed IST-day rollover accounting for in-flight vs completed reservations. |
| `backend/services/research/market-scan-jobs.ts` | Durable D1 multi-batch scan engine (`x78_market_scan_jobs` / `x78_market_scan_batches`) supporting 500+ instruments in bounded 50-instrument cached D1 batches (`DEFAULT_BATCH_SIZE = 50`), atomic D1 leases, `ScanActionError` granular error codes, reload recovery (`listActiveMarketScans`), server-side cancellation (`cancelMarketScan`), inline bounded polling progression (`marketScanStatus(..., advanceInline=true)`), and atomic quota release on failed/partial/cancelled/blocked runs. |
| `backend/services/research/workspace.ts` | Removed hardcoded `NIFTY_500` 503 block; wired `sharedUniverseReadiness()` granular diagnostics and `scan-retention.ts` stripping. |
| `backend/middleware/index.ts` & `vite.config.ts` | Added Cloudflare Cron Triggers `["* * * * *", "*/2 * * * *"]` and `scheduled()` (`refreshSharedHistory()` + `clearExpiredReports()` on `*/2`; `processMarketScanBatch(undefined, 50)` on `*`) while preserving all existing bindings (`DB`, `MARKET_DATA_ADAPTER` VPC, `CF_VERSION_METADATA`, `ENABLE_PRIVATE_BROKER_DATA`, `INDIA_API_HOST`). Price alerts remain explicitly unactivated. |
| `app/api/strategy/scan/route.ts` | Added `GET` (status + active jobs list), `POST` durable routing (`202`), `cancel`, structured `{ error, errorCode, retryable, traceId, details }`, while keeping `preflight-scan`, `ECB_DAILY`, `CUSTOM_CSV`, and owner Angel One sync flows intact. |
| `app/api/strategy/universe/route.ts` | Replaced hardcoded `false`/`BLOCKED` response with live `sharedUniverseReadiness()` telemetry; kept `PUT` strictly `requireDataOwner`. |
| `app/api/market/health/route.ts` & `instruments/route.ts` | Preserved existing `gatewayHealth()` contract and attached `accountType` + `sharedMarketData` summary (owner-only provider breakdown); merged active Nifty 500 constituents into instrument search. |
| `frontend/features/strategy/workspace.tsx` & `market-scan-client.ts` | Added universe readiness fetch, durable job polling & reload recovery without duplicate quota reservations, server-side Cancel, honest warming banners, conditional Retry button (`scanErrorRetryable`), and derived-only UI/CSV raw-price suppression. |
| `frontend/features/global/data-control.tsx` | Preserved existing Angel One TOTP panel; added owner-only Nifty 500 snapshot importer (`PUT /api/strategy/universe`), `sharedHistory` JSON config, `useNiftyUniverse` toggle for `INDIANAPI`/`BHARATSTOCK`, `30,000` daily call cap, and shared scheduler progress readout. |
| `backend/services/market-data/angelone/redact.ts` & `tests/integration/x31-market-gateway.test.mjs` | Allowed `MARKET_ADAPTER_PORT="0"` (ephemeral loopback port) in test harness so integration tests never collide with a live local adapter on port 18799. |

---

## 2. Access-Control & Trust-Boundary Matrix

| Surface / Endpoint | Guest (Unauthenticated) | Ordinary Member (`isOwner = false`) | Owner (`X2_OWNER_SUBJECT`) |
| --- | --- | --- | --- |
| `GET /api/markets/overview` | ECB USD/INR + display-licensed public dashboard index EOD (if active); unavailable tiles honest `—` | Same as Guest (never sees owner Angel One quotes) | Private Angel One live/EOD quotes + ECB USD/INR |
| `GET /api/market/quote` & `/candles` | `401 UNAUTHENTICATED` | `403 PUBLIC_LICENSE_REQUIRED` (Angel One strictly isolated) | Private Angel One VPC quotes & candles |
| `GET /api/x2/providers` & `POST` | `401` | `404` (hidden) | Full metadata config & connection test (no secret values returned) |
| `GET /api/strategy/universe` | Non-sensitive readiness & counts only | Non-sensitive readiness, counts, rights mode & intervals | Readiness + `validatedAt` / `rightsExpiresAt` |
| `PUT /api/strategy/universe` | `401` | `404` (hidden) | Authorized Nifty 500 JSON snapshot import |
| `GET/POST /api/strategy/scan` | `401` | ECB FX, Private CSV, Watchlist, and Shared Nifty 500 (when licensed & ready; `DERIVED_ONLY` strips raw prices) | Same + private Angel One broker scans |
| `GET /api/x1/workspace` (GRAVEYARD) | `401` | Account-private scans only; read-time `projectResearchSnapshot` enforces `DERIVED_ONLY` / `WITHHELD` | Account-private scans only (cross-account IDOR -> `404`) |

---

## 3. Read-Time Enforcement & Cache Invariants

1. **Zero Secret Exposure:** Upstream provider secrets (`INDIA_API_KEY`, `BHARATSTOCK_API_KEY`, `X2_EODHD_API_TOKEN`, `X2_TRUEDATA_BEARER_TOKEN`, `MARKET_ADAPTER_AUTH_TOKEN`) are read exclusively inside the Cloudflare Worker runtime from encrypted bindings and never written to D1, browser responses, logs, or client bundles.
2. **Cross-Account Cache Reuse Without Privacy Leakage:** Identical licensed market snapshots in `x8_shared_history_snapshot` are shared across all authorized users, avoiding N-user upstream fanout; user scan definitions, watchlists, reservations, jobs (`x78_market_scan_jobs`), and GRAVEYARD records (`x1_scans`) remain strictly scoped by `subject`.
3. **Every Cached Read Re-Verifies Rights:** `readSharedHistoryBatch()`, `readSharedDailyQuotes()`, `currentDisplayRights()`, and `projectResearchSnapshot()` all re-check provider `version`, `enabled`, `rights.verified`, `rights.expiresAt`, `constituentGrant.expiresAt`, and secret presence on every read. Expiring or modifying a grant immediately stops reads and withholds restricted data without mutating immutable scan digests.
