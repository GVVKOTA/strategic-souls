# Strategic Souls V3.0 RC1 — Market Data Coverage, Product Specs & Launch Playbook

**Release Track:** `V3.0 RC1` (`Strategic Souls V3.0 (Release Candidate)`)  
**Target Launch Date:** 02 January 2027  
**Support Contact:** `strategicsoulsgvv@gmail.com`  
**Owner Organization:** Global Vertex Vectors (GVV)

---

## 1. Root Cause Analysis: Ordinary-User SoulScan Universe Failure

### Previous Defect
Before V3.0 RC1, an ordinary signed-in user opening Strategy and running a default Indian Market scan received:
> `"No authorized historical instruments are available for this universe."`

### Architectural Root Cause
1. The only connected NSE/BSE/MCX historical feed was an owner-only retail broker gateway (`ENABLE_PRIVATE_BROKER_DATA`), which **correctly** denies ordinary users to avoid violating retail brokerage redistribution rules.
2. No shared commercial NSE/BSE/MCX market-data provider (`TrueData` / `EODHD` in `x2_providers` with `redistribution: true`) was configured on the deployment.
3. The Strategy scan path did not unify NSE + BSE + active MCX futures under a single `MARKET` preset, lacked genuine `1h` completed-session candle ingestion for shared commercial providers, and surfaced a cryptic authorization string to ordinary users.

### V3.0 RC1 Fix & Lawful Boundary
- **Unified `MARKET` preset (`backend/services/research/research.ts`, `backend/services/market-data/data-service.ts`):** Evaluates eligible NSE equities/indices, BSE equities/indices, and active unexpired MCX futures from configured licensed shared commercial providers (`x2_providers` with verified `analysis`, `storage`, and `redistribution` rights).
- **Genuine `1h` completed-session candles (`backend/services/market-data/angelone/scan-history.ts`, `backend/services/market-data/providers.ts`):**
  - NSE/BSE regular hours `09:15–15:30 IST` (60-minute bars `09:15..14:15` plus terminal `15:15–15:30 IST` bar).
  - MCX DST-aware and partial-holiday-aware session hours (`09:00–23:30` summer / `23:55` winter IST).
  - Excludes developing, future, duplicate, or out-of-session bars.
  - **Never synthesizes `1h` bars from daily closes** and strictly rejects `30m` across preflight and scan execution without charging quota.
- **Fail-closed honesty without owner leakage:** Until a commercial shared market-data license & Worker secret are provisioned, ordinary users never receive owner-only broker data or synthetic prices; they see a calm vendor-neutral availability notice and **zero scan quota is deducted**.

---

## 2. Per-Exchange & Per-Timeframe Coverage Matrix

| Exchange / Source | Eligible Asset Types | `1 Hour (1h)` | `Daily (1d)` | `Weekly (1wk)` | `Monthly (1mo)` | Ordinary-User Live Status |
| --- | --- | --- | --- | --- | --- | --- |
| **NSE** | Equities, Indices | Genuine `60min`/`1h` completed session bars (`09:15–15:30 IST`) | Completed daily OHLCV | Aggregated completed weekly bars | Aggregated completed monthly bars | **Requires Licensed Commercial Secret** (`X2_TRUEDATA_BEARER_TOKEN` or `X2_EODHD_API_TOKEN` + `x2_providers` config) |
| **BSE** | Equities, Indices | Genuine `60min`/`1h` completed session bars (`09:15–15:30 IST`) | Completed daily OHLCV | Aggregated completed weekly bars | Aggregated completed monthly bars | **Requires Licensed Commercial Secret** |
| **MCX** | Active Unexpired Futures only (expired excluded) | Genuine `60min` completed session bars (`09:00–23:30/23:55 IST` DST/holiday-aware) | Completed daily OHLCV | Aggregated completed weekly bars | Aggregated completed monthly bars | **Requires Licensed Commercial Secret** (`X2_TRUEDATA_BEARER_TOKEN` + `x2_providers` config) |
| **ECB Reference FX (`ECB:USDINR`)** | Official Daily FX | Unsupported (never synthesized from daily) | Live Public EOD | Live Aggregated Weekly | Live Aggregated Monthly | **Live (Keyless Official Public Feed)** |
| **US Treasury (`UST:*`)** | Official Daily Yields | Unsupported | Live Public EOD | Live Aggregated Weekly | Live Aggregated Monthly | **Live (Keyless Official Public Feed)** |
| **NYMEX WTI Jan 2027 (`GLOBAL:CLF27`)** | Global Crude Tile | N/A (Dashboard tile) | Commercial Feed | N/A | N/A | **Requires an authorized NYMEX feed for CLF27** |

---

## 3. Strict 8-Tile Global Dashboard Allowlist & Symbol Mapping

Legacy 9-card D1/localStorage layouts (which previously contained `GLOBAL:SPX`, `GLOBAL:NDX`, `GLOBAL:N225`, `GLOBAL:BRENT`, `GLOBAL:XAUUSD`, `GLOBAL:XAGUSD`) are automatically reconciled onto this strict 8-tile allowlist by `reconcileGlobalMarketIds()` so removed tiles never resurrect.

| Slot | Canonical ID | Display Label | Venue | Asset Class | Unit / Mapping Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `NSE:NIFTY` | `NIFTY 50` | NSE | Index | Index points (INR) |
| 2 | `BSE:SENSEX` | `SENSEX` | BSE | Index | Index points (INR) |
| 3 | `NSE:BANKNIFTY` | `BANK NIFTY` | NSE | Index | Index points (INR) |
| 4 | `NSE:MIDCPNIFTY` | `Nifty Midcap Select` | NSE | Index | Nifty Midcap Select points (INR) |
| 5 | `MCX:GOLD` | `GOLD` | MCX | Commodity Future | Maps dynamically to nearest active unexpired MCX Gold contract when entitled |
| 6 | `MCX:SILVER` | `SILVER MCX` | MCX | Commodity Future | Maps dynamically to nearest active unexpired MCX Silver contract when entitled |
| 7 | `GLOBAL:CLF27` | `CL Jan 2027 Fut` | NYMEX | Crude Oil Future | WTI Crude Oil (USD/bbl) |
| 8 | `ECB:USDINR` | `USD/INR` | ECB | FX Reference | Official daily INR per USD (live keyless) |

---

## 4. Portfolio Accounting & Dual Banner Library Spec

- **Cost-Basis Accounting:** Portfolio holdings compute weighted-average cost basis strictly from user-recorded `BUY`/`SELL`/`DEPOSIT`/`WITHDRAW`/`DIVIDEND`/`FEE` ledger events. No broker connection or live MTM fabrication is claimed.
- **Clean Formatting:** Quantities omit `.0000` trailing noise (`formatQuantity`); INR values render cleanly (`₹10,049.00` via `formatCurrency`).
- **Single Calm Funding Disclosure:** When buys exceed recorded deposits, the UI displays **one** calm `"Funding not recorded"` notice with a direct `Record deposit` CTA — never duplicated error banners.
- **Allocation Donut:** Colored SVG (`.ss-v3-colored-svg`) exempt from legacy grayscale rules; single-holding 100% portfolios render a continuous full ring without SVG dash seams.
- **Independent Banner Libraries:**
  - **Portfolio Backdrop Library (`p01`–`p08`):** Vault-themed geometric backdrops edited via `Change Banner` modal inside My Portfolio.
  - **Profile Cover Banner Library (`b01`–`b08`):** Researcher cover artwork edited via `Settings → Edit Profile → Profile banner`.
  - Stored in distinct preference fields (`portfolioBackdrop.presetId` vs `bannerPresetId`); mutating one never affects the other.

---

## 5. Truthful Soul Post Metrics & Author-Only Post Insights

Backed by additive D1 tables (`drizzle/0011_v3_release_candidate.sql`):
- **Likes (`v3_post_likes`):** Composite PK `(post_id, subject)`; idempotent toggle with visibility + block enforcement.
- **Views (`v3_post_views`):** Composite PK `(post_id, viewer_key, day_bucket)` where `viewer_key` is a truncated SHA-256 hash (`u:<subject>` or `g:<ip|ua>`) and `day_bucket` is UTC `YYYY-MM-DD`. Triggered via `IntersectionObserver` (`>=50%` visible for `>=1.2s`). **Author self-views are strictly excluded** server-side and client-side.
- **Shares (`v3_post_shares`):** Recorded only after confirmed `navigator.share` or verified `copyTextSafe` write; rate-limited (`30/min`).
- **Author-Only Insights (`GET /api/community/network?view=insights&postId=...`):**
  - `401` for unauthenticated callers, `403` for any non-author caller.
  - Returns `{ views, likes, comments, saves, shares, engagementRatePct }` (`null` when `views === 0`). Never returns viewer identities or raw hashes.

---

## 6. Lawful Production Activation Checklist (Before Ordinary-User Live Market Scans)

1. **Apply Additive D1 Migration `0011`:**
   ```bash
   wrangler d1 migrations apply ss --remote
   ```
2. **Provision Commercial Shared NSE/BSE/MCX Market-Data Secret:**
   - Sign a commercial redistribution-permitting data agreement (e.g., TrueData for NSE + BSE + MCX `eod` & `60min`, or EODHD for NSE + BSE + Global `CL`).
   - Store the server-only secret in Cloudflare Worker Secrets:
     ```bash
     wrangler secret put X2_TRUEDATA_BEARER_TOKEN
     ```
   - Configure the verified `x2_providers` instrument catalog and redistribution rights via the owner-authenticated provider API.
3. **Provision Transactional Security Email Secret (Password Reset & Email Verification):**
   ```bash
   wrangler secret put RESEND_API_KEY
   wrangler secret put SS_EMAIL_FROM
   ```
   (Or `SS_EMAIL_WEBHOOK_URL` + `SS_EMAIL_WEBHOOK_TOKEN`.)
4. **Verify Live Ordinary-User Canary:**
   - Run an ordinary non-owner test account across `Market` (`1h`, `1d`, `1wk`, `1mo`) and `Watchlist`, confirm zero owner-broker calls, and verify `/api/release` reports zero vendor leaks.

---

## 7. Privacy-Safe Product Analytics Plan

- **Zero PII, zero private financial holdings, zero formula payloads in analytics events.**
- Collect only coarse, aggregated funnel counts (if opted in / server-side structured logs without user-identifying emails or amounts):
  - Onboarding funnel: `signup_completed` → `first_watchlist_created` → `first_scan_completed` → `first_soul_published`.
  - Feature adoption: `classic_vs_advanced_ratio`, `timeframe_distribution (1h/1d/1wk/1mo)`, `formula_pin_count`, `community_tab_switches`.
  - Reliability & latency: `soulscan_universe_diagnostic` (`failureCategory`, `authorizedCount`, `durationMs`).
- Never track third-party ad pixels, cross-site fingerprinting, or individual portfolio balances.

---

## 8. Launch Playbook (Target: 02 January 2027)

### Positioning (100% Honest & Compliant)
- **Core Promise:** *"A calm, transparent market research terminal — turn ideas into deterministic scans, preserve every hypothesis in GRAVEYARD, and study setups with a peer network. Zero hype, zero fabricated numbers, zero investment advice."*
- **Non-Negotiable Claims Policy:** Never promise profits, alpha, accuracy percentages, or real-time order execution. Clearly state data provenance and delay/as-of timestamps on every marketing screenshot.

### Phased Rollout Timeline
1. **T-6 Weeks (Late Nov 2026 — Commercial Data & Email Provisioning):** Activate commercial NSE/BSE/MCX license + transactional email secrets; complete multi-user staging soak test on `1h/1d/1wk/1mo` across market open/close transitions.
2. **T-3 Weeks (Mid Dec 2026 — Closed Researcher Cohort, 50–100 Invitees):** Onboard disciplined technical researchers and finance students; gather real feedback on Classic 50 presets, Formula Pinning, and Soul Feed discussion quality.
3. **T-1 Week (Late Dec 2026 — Public Launch Assets):** Publish verifiable walkthroughs of 3 real features (8-Tile Dashboard + 3D Globe, 1-Click Classic SoulScan + GRAVEYARD, Soul Feed + `Try this formula` workflow) using strictly authentic screenshots.
4. **Launch Day (02 January 2027):** Open free Research Beta registration with `strategicsoulsgvv@gmail.com` support desk monitoring, daily error/quota review, and weekly release notes.
