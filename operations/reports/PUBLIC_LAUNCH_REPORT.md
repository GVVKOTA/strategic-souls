# Public Market Data & Shared Scanning — Launch Report

Date: 2026-11-25 IST
Product: Strategic Souls (`https://strategic-souls.vishnukota20071005.workers.dev/`)
Repository: `https://github.com/GVVKOTA/strategic-souls`
Policy Reference: Master Execution Prompt Phase 9.7 & Phase 10

---

## 1. Executive Verdict

- **PRODUCTION VERDICT: `PUBLIC NSE DAILY SCANNING = BLOCKED`**
- **Safe Infrastructure, Durable 500-Symbol Scanner, Cron Scheduler & UX Release:** **VERIFIED IN STAGING / READY FOR PRODUCTION PROMOTION (without falsely activating restricted public market feeds)**

### Exact External Blockers Preventing Live Public Nifty 500 Activation
1. **Indian API (`stock.indianapi.in`) — Free Plan Capacity & Schema Limit:** Verified Free tier allows `500` requests/month (`1 req/s`), returns **close + volume only** (no Open/High/Low, no batch endpoint), and does not convey an NSE exchange display sublicense. A single 501-constituent fill exceeds the entire monthly quota on Day 1.
2. **BharatStock (`bharatstockapi.com`) — Free Tier Terms & Quota Limit:** Verified Free tier allows `60` requests/day and its published Terms of Service (`bharatstockapi.com/terms`) explicitly forbid caching/storing data or serving third-party/public end-users. Upgrading to a paid tier (Starter `1,000/day` or Growth `5,000/day`) unlocks full OHLCV + `adjusted_close` (`GET /v1/stocks/{ticker}/prices`) and explicitly permits server caching and public **Customer Derivatives** (`DERIVED_ONLY` mode — already built and tested in this release).
3. **Nifty 500 Constituent List (`ind_nifty500list.csv`) — Licensing Gate:** Live read-only inspection on 25 Nov 2026 observed `501` constituents (`EQ: 496`, `RR: 3`, `BE: 2`, `Last-Modified: 23 Nov 2026`), but `niftyindices.com/terms-of-use` prohibits copying, modifying, or republishing index constituent lists without prior written permission or a data subscription (`indices@nseids.co.in`).

Per **Phase 9.7**, production D1 remains completely clean (`x2_providers = 0`, `x78_market_universes = 1` sentinel only), zero fabricated grants or scraped constituent rows were inserted, and gated public NSE/BSE/MCX paths remain honestly unavailable until the owner completes the finite activation checklist in Section 5.

---

## 2. Deployment, Bindings & Rollback Metadata

- **Pre-Change Production Baseline (Rollback Point):**
  - Git `main` SHA: `5ac5b5bdee274dec86e30085199a305199f4bb37`
  - Cloudflare Worker Version ID: `c14d457e-c3b7-4389-a106-91d936759d5c` (Version #45, deployment `458fe546-a80a-4dcd-b9da-cbb5f091a1eb`, 100% traffic, `2026-11-25T12:01:52 IST`)
  - D1 Database: `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, APAC, migrations `0000`–`0020` applied, `70` tables, `6,705,152` bytes)
  - D1 Time Travel Rollback Bookmark: `00000153-00000000-0000512e-8076d162e011331b3ae49f6640000c7d`
  - Pre-Change User Data Counts: `accounts = 5`, `x1_scans = 30`, `x2_providers = 0`, `x78_market_universes = 1` (sentinel)
- **Cloudflare Worker Bindings (Names Only — Zero Secret Values Logged):**
  - D1 Database: `DB` -> `ss`
  - VPC Service Binding: `MARKET_DATA_ADAPTER`
  - Version Metadata: `CF_VERSION_METADATA`
  - Plaintext Vars: `ENABLE_PRIVATE_BROKER_DATA`, `INDIA_API_HOST`
  - Encrypted Secrets: `BHARATSTOCK_API_KEY`, `INDIA_API_KEY`, `MARKET_ADAPTER_AUTH_TOKEN`, `X2_OWNER_SUBJECT`
  - Cron Triggers Configured: `["* * * * *", "*/2 * * * *"]` (`processMarketScanBatch` every minute; `refreshSharedHistory` + `clearExpiredReports` every 2 minutes; price alerts NOT activated)
- **D1 Schema Migrations:** Zero destructive or new migrations required (`0000`–`0020` already contain all `x78_market_*` tables and columns).
- **Post-Deployment Live SHA, Worker Version ID & IST Timestamp:** Recorded verbatim in the release completion output after `main` merge, exact-SHA build, 0% candidate smoke, and 100% traffic promotion via `operations/scripts/check-production-release.mjs`.

---

## 3. One-Row-Per-Requirement Status Register

Allowed statuses: `VERIFIED_PRODUCTION` | `VERIFIED_STAGING` | `CODE_COMPLETE_NOT_DEPLOYED` | `BLOCKED` | `NOT_TESTED`

| Req ID | Requirement Summary | Status | Evidence / Blocker |
| --- | --- | --- | --- |
| `REQ-01` | Baseline audit & exact reproduction of ordinary-account Market+Daily failure (`0` quota charged) | `VERIFIED_STAGING` | `PUBLIC_MARKET_ACCESS_BASELINE.md`; `5ac5b5b` trace `0dd98c58-1bd6-4887-a580-233db6aed832` (HTTP `503`, `20/20` quota) |
| `REQ-02` | Provider legal rights & quota matrix (separating verbal owner claim from published ToS & derived vs display rights) | `VERIFIED_PRODUCTION` | `PUBLIC_PROVIDER_RIGHTS_MATRIX.md`; verified live ToS URLs + Free-tier limits |
| `REQ-03` | Reconcile PRs #5/#6/#7 onto `main` without regressing hotfixes #8–#11, owner Angel One VPC, or 6 canonical CSS tokens | `VERIFIED_STAGING` | `check-x2-release.mjs` (`367/367` tests), `pytest` (`29/29`), empty `git diff frontend/styles/`, VPC binding verified in `dist/server/wrangler.json` |
| `REQ-04` | Canonical AST/indicator engine preserved (`crossesabove` event semantics, `UNKNOWN` never coerced, no invented OHLC) | `VERIFIED_STAGING` | `public-shared-market-data.test.mjs` + `29/29` Python quant tests + real Chromium `ECB` scan (`ATR(14) = —`) |
| `REQ-05` | Classic (`20/IST day`) & Advanced (`1/rolling 60m`) quota integrity + atomic release on failure/cancel/unready/intraday | `VERIFIED_STAGING` | `scan-quota.ts` IST-day rollover fix + `market-scan-jobs.ts` atomic release + Chromium QA (`0` charged on blocked Market scan, `19/20` on Classic, `0/1` on Advanced) |
| `REQ-06` | Versioned Nifty 500 constituent importer supporting flexible official counts (`450`–`550`, `EQ`/`BE`/`RR`) | `VERIFIED_STAGING` | `nifty-500.ts` + owner UI JSON importer (`data-control.tsx`) + `INT-03` (501-member import test) |
| `REQ-07` | Live production import of authorized Nifty 500 constituent list | `BLOCKED` | `niftyindices.com/terms-of-use` requires written permission/subscription (`indices@nseids.co.in`) before importing `ind_nifty500list.csv` (`501` rows) |
| `REQ-08` | Shared server-side provider adapter supporting BharatStock full OHLCV (`/v1/stocks/{ticker}/prices`) & Indian API close-only | `VERIFIED_STAGING` | `providers.ts`, `shared-history.ts`, `data-service.ts`, `INT-01` |
| `REQ-09` | Granular read-time rights projection (`DERIVED_ONLY` vs `DISPLAY_AND_DERIVED` vs `WITHHELD`) on cache & GRAVEYARD | `VERIFIED_STAGING` | `scan-projection.ts`, `shared-history.ts`, `INT-02`, `INT-06` |
| `REQ-10` | Durable multi-batch 500-symbol scanner (`50`/batch), D1 leases, reload recovery, cancel, and cross-account cache reuse (`0` duplicate upstream fanout) | `VERIFIED_STAGING` | `market-scan-jobs.ts`, `app/api/strategy/scan/route.ts`, `INT-04` (two concurrent ordinary users scanning 501 cached symbols with `0` upstream calls) |
| `REQ-11` | Cloudflare Cron Triggers (`* * * * *`, `*/2 * * * *`) for bounded shared-history refresh, durable scan worker & expired-data purge | `VERIFIED_STAGING` | `backend/middleware/index.ts`, `vite.config.ts`, verified in `dist/server/wrangler.json` |
| `REQ-12` | Granular non-blanket error codes (`NIFTY_UNIVERSE_UNAVAILABLE`, `PENDING_INITIAL_INGEST`, `INTRADAY_NOT_SUPPORTED`, `DATA_EXPIRED`, etc.) & conditional Retry button | `VERIFIED_STAGING` | `scan-error.ts`, `workspace.tsx`, Chromium QA `BRW-02` (`hasRetryOnMarketBlocker: false`) |
| `REQ-13` | Public discoverable `/api/strategy/universe` & extended `/api/market/health` (`accountType`, `sharedMarketData`, zero secret exposure) | `VERIFIED_STAGING` | `universe/route.ts`, `health/route.ts`, Chromium QA `BRW-02` |
| `REQ-14` | Global 8 cards preservation (ECB USD/INR intact, WTI unavailable, zero fake `LIVE` badge, owner Angel One separate) | `VERIFIED_STAGING` | `nine-card-markets.ts`, Chromium QA `BRW-01` (`8` cards, `USD/INR ₹92.9189`, `hasFakeLiveBadge: false`) |
| `REQ-15` | Mobile responsiveness at `320`, `360`, `375`, `390`, `412`, `430` CSS px (zero horizontal overflow) | `VERIFIED_STAGING` | Chromium QA `BRW-05` (`scrollWidth === innerWidth`, `offenders: []` across all 6 widths) |
| `REQ-16` | Cross-account isolation (ordinary A vs ordinary B GRAVEYARD, quotas, `/api/x2/providers` `404`, `/api/market/quote` `403`) | `VERIFIED_STAGING` | Chromium QA `BRW-06` + `INT-07` |
| `REQ-17` | Live production ordinary-user NSE / Nifty 500 Daily scan | `BLOCKED` | Blocked externally by Free-tier data plans (Indian API 500/mo; BharatStock 60/day no-cache/no-public ToS) & Nifty 500 constituent license |
| `REQ-18` | Live production BSE / MCX / Intraday / WTI public feeds | `BLOCKED` | No licensed commercial public BSE, MCX, intraday, or NYMEX WTI feed exists in current credentials |
| `REQ-19` | Cost, D1 storage, and `100` / `1,000` / `10,000` registered-user capacity analysis | `VERIFIED_PRODUCTION` | `PUBLIC_PROVIDER_CAPACITY.md` |
| `REQ-20` | Full secret scan (`0` findings), source policy scan (`0` findings), zero lost user data | `VERIFIED_STAGING` | `scan-secrets.mjs` (`0` across `870` files + `dist/`), `scan-v3-source.mjs` (`0` across `533` files) |

---

## 4. Unresolved Gaps, Owners & Next Actions

| Gap | Current State | Owner | Exact Next Action |
| --- | --- | --- | --- |
| **NSE Nifty 500 Daily Provider Capacity & Public Rights** | `BLOCKED` (Free keys only) | Founder / GVV | Upgrade `BHARATSTOCK_API_KEY` to **Starter** (`1,000` req/day, `DERIVED_ONLY` mode) or **Growth** (`5,000` req/day) — or obtain a written commercial display+redistribution license from an NSE-authorized vendor — and update Cloudflare secret `BHARATSTOCK_API_KEY`. |
| **Nifty 500 Constituent Delivery License** | `BLOCKED` (`501` rows unimported) | Founder / GVV | Obtain written permission or NSE Indices data subscription (`indices@nseids.co.in`) for `ind_nifty500list.csv`, then import the JSON payload via the owner-only Data Connections -> Nifty 500 Universe importer. |
| **Raw Price / Chart Display for Public NSE Equities** | `BLOCKED` (Paid BharatStock permits Customer Derivatives only, not raw redistribution) | Founder / GVV | Launch public NSE screening in `DERIVED_ONLY` mode first; acquire an NSE exchange display/redistribution license before setting `rights.display = true` or `rights.redistribution = true`. |
| **BSE / MCX / Intraday (`30m`/`1h`) / NYMEX WTI** | `BLOCKED` (No licensed feed) | Founder / GVV | Keep explicitly disabled/labeled unavailable until segment-specific licensed feeds exist. |

---

## 5. Finite Owner Activation Checklist (Zero Code Changes Needed Once Licenses Are Obtained)

Once external rights and capacity are in place, activating live public Nifty 500 Daily scanning requires **zero further code changes**:
1. **Upgrade Provider Key:** Upgrade BharatStock to Starter (`1,000/day`) or Growth (`5,000/day`) and update the encrypted Cloudflare secret `BHARATSTOCK_API_KEY` (via `wrangler secret put BHARATSTOCK_API_KEY`).
2. **Import Licensed Nifty 500 Constituents:** Sign in as the workspace owner (`X2_OWNER_SUBJECT`), open **Data Connections**, and import the licensed official Nifty 500 constituent JSON (preserving exact published count, e.g., `501` with `EQ`/`BE`/`RR`, effective date, source provenance, and rights expiry).
3. **Register Provider Grant (`DERIVED_ONLY`):** In **Data Connections**, configure `BHARATSTOCK` with `useNiftyUniverse = true`, `datasets = ["candles"]`, `dailyCallLimit = 900` (Starter) or `4500` (Growth), and `rights = { verified: true, analysis: true, storage: true, derivedDisplay: true, display: false, redistribution: false }` with exact contract reference and expiry date.
4. **Verify Automated Cron Warm-Up:** Confirm Cloudflare Cron `*/2 * * * *` warms the 501 daily snapshots (`~167` minutes cold start at `6` symbols/2 min; `~1` full daily refresh/day afterwards) and monitor `/api/strategy/universe` until `status === "READY"`.
5. **Run Production Two-Account Acceptance:** Verify two ordinary signed-in accounts complete a full `NIFTY_500` Daily scan (`close > 0`), confirm `DERIVED_ONLY` strips raw prices while persisting derived outcomes in GRAVEYARD, and confirm `0` duplicate upstream API calls on the second account.
