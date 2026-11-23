# Strategic Souls — X4 Full Product & Architecture Audit

- **Release:** `X4` (`4.0.0-x4`)
- **Repository:** `https://github.com/GVVKOTA/strategic-souls`
- **Baseline Audited (`main` pre-X4):** `e3526a628581a81ae61c76778699ca64297189ed` (X3.1)
- **Cloudflare Worker / D1:** Worker `strategic-souls` (Account `2aebd1ad7593f7bba045eb56d9cabd58`), D1 `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, 43 tables + 11 immutability triggers across migrations `0000`–`0007`)

---

## 1. Confirmed Root Causes of P0 User Complaints

### A. Soul Scan Only Scanned ~5 Currencies or Stopped After 5 / 20 Assets

| Finding | Pre-X4 File & Lines | Confirmed Root Cause | X4 Resolution |
| :--- | :--- | :--- | :--- |
| **Silent 5-instrument slice on owner broker universe** | `backend/services/market-data/data-service.ts:272` | `VERIFIED_SEED_INSTRUMENTS.slice(0, 5)` silently truncated the owner Angel One scan universe to the first 5 seed rows, without warning or accounting for the remaining verified seeds. | Removed `.slice(0, 5)`. `researchUniverse()` now traverses all `VERIFIED_SEED_INSTRUMENTS` in bounded chunks of 6 with `Promise.allSettled`, honouring `maxLimit` (default 500, up to 1,000) and recording explicit `excluded` notices if `maxLimit` is reached. |
| **Silent 20-instrument slice on commercial provider universe** | `backend/services/market-data/data-service.ts:238` | `catalog.filter(...).slice(0, 20)` silently truncated `CONNECTED_MARKETS` scans to 20 instruments even when a larger universe was requested. | Removed `.slice(0, 20)`. Replaced with configurable `maxLimit` (`Math.min(1000, Math.max(1, options.maxLimit ?? 500))`), explicit `out.excluded` logging when capped, and `discoveredCount` / `authorizedCount` tracking. |
| **100-instrument validation cap in research engine** | `backend/services/research/research.ts:219` | `validateResearch()` threw `"Watchlist filter exceeds 100 instruments"` whenever `instrumentIds.length > 100`, preventing 100+ or 1,000-instrument batch scans. | Raised `instrumentIds` validation limit to `1,000` (`MAX_SCAN_INSTRUMENTS = 1000`) and added deterministic `batchPlan` (`batchSize: 50`, `totalBatches`) plus reconciled `accounting` (`discovered`, `authorized`, `eligible`, `evaluated`, `matched`, `notMatched`, `unknown`, `excluded`, `withheld`, `errors`, `coveragePct`). |
| **Confusing default scan source (`ECB_REFERENCE_FX` = 5 FX pairs)** | `frontend/features/strategy/workspace.tsx:308–317` | The default scan provider was `ECB_REFERENCE_FX` (which has 5 official ECB reference FX pairs: `FX:EURINR`, `FX:USDINR`, `FX:EURUSD`, `FX:GBPUSD`, `FX:USDJPY`). Users selecting or leaving the default thought the scanner could only scan 5 currencies, while switching to `CONNECTED_MARKETS` without a public data licence returned 0 datasets. | Added a 5-card **"Where should we scan?"** selector (`Indian Equities & Indices`, `MCX Commodity Futures`, `My Watchlist`, `Currencies (Official ECB Daily FX)`, `Private User CSV OHLCV Dataset` with a 1-click 5-stock Indian equity `TEST DATA` loader). Never silently substitutes currencies when equities or futures are selected. |

---

### B. Instrument Search Failed for `HDFC`, `HDFC Bank`, `HDFCBANK`, and `NSE:HDFCBANK`

| Finding | Pre-X4 File & Lines | Confirmed Root Cause | X4 Resolution |
| :--- | :--- | :--- | :--- |
| **`HDFCBANK` omitted from `X2_INSTRUMENTS` and `VERIFIED_SEED_INSTRUMENTS`** | `backend/services/market-data/instrument-registry.ts:15–31`, `backend/services/market-data/angelone/instrument-master.ts:36–134` | `X2_INSTRUMENTS` contained only 15 instruments (`NSE:NIFTY`, `NSE:BANKNIFTY`, `BSE:SENSEX`, `NSE:RELIANCE`, `NSE:TCS`, `NSE:INFY`, `MCX:GOLD`, `MCX:SILVER`, `MCX:CRUDEOIL`, 5 FX pairs, and `MACRO:IN10Y`). `VERIFIED_SEED_INSTRUMENTS` had 10 rows (`RELIANCE`, `TCS`, `INFY`, `SBIN`, `NIFTY`, `BANKNIFTY`, `SENSEX`, `GOLD05JUN26FUT`, `SILVER03JUL26FUT`, `CRUDEOIL19MAY26FUT`). `HDFCBANK` was completely absent from both registries. | Expanded `X2_INSTRUMENTS` to **41 canonical instruments** (including `NSE:HDFCBANK`, `BSE:HDFCBANK`, `NSE:SBIN`, `BSE:SBIN`, `NSE:RELIANCE`, `BSE:RELIANCE`, `NSE:TCS`, `NSE:INFY`, `NSE:ICICIBANK`, `NSE:BHARTIARTL`, `NSE:ITC`, `NSE:KOTAKBANK`, `NSE:LT`, `NSE:AXISBANK`, `NSE:BAJFINANCE`, `NSE:MARUTI`, `NSE:SUNPHARMA`, `NSE:TITAN`, `NSE:TATAMOTORS`, `NSE:ADANIENT`, `NSE:WIPRO`, `NSE:HCLTECH`, `NSE:ULTRACEMCO`, `NSE:NTPC`, `NSE:POWERGRID`, `NSE:ONGC`, `NSE:TATASTEEL`, `NSE:HINDUNILVR`, indices, and dated MCX futures) and expanded `VERIFIED_SEED_INSTRUMENTS` to 17 verified seed tokens. |
| **Substring-only search without alias dictionary or deterministic ranking** | `frontend/features/global/dashboard.tsx:96–101`, `backend/services/market-data/angelone/instrument-master.ts:242–268` | Global search used `.includes(q)` over only 15 items; `UniversalSearch` did not search market instruments at all (it only searched `Bodies`, `Groups`, `Souls`, and `Threads`); `InstrumentMaster.search()` capped results at `Math.min(25, ...)` without alias ranking. | Implemented `COMMON_INSTRUMENT_ALIASES`, `scoreCanonicalInstrument()`, and `searchCanonicalInstruments()` with deterministic priority tiers (1000 exact canonical ID -> 960 exact symbol -> 930 alias primary match -> 890 symbol prefix -> 850 normalized name match -> 780 token prefix -> 680 substring). Integrated into `/api/market/instruments`, `UniversalSearch`, `Global -> Overview`, and `Strategy -> Soul Scan`. |
| **Identity vs. live quote entitlement conflation** | `app/api/market/instruments/route.ts` | Public users could not discover canonical equity/commodity metadata consistently across all search surfaces with clear availability badges. | Separated **instrument identity discovery** (`PUBLIC_IDENTITY_ONLY` / `IDENTIFIED_ONLY` — zero private broker prices leaked) from **live quote/candle entitlement** (`OWNER_PRIVATE` when owner-authenticated and `ENABLE_PRIVATE_BROKER_DATA=true`, or `PUBLIC_DELAYED` for ECB FX / MOSPI CPI). |

---

### C. Community Page Was Hard to Understand for First-Time Users & `@handle` Search Failed

| Finding | Pre-X4 File & Lines | Confirmed Root Cause | X4 Resolution |
| :--- | :--- | :--- | :--- |
| **Bodies defaulted to `discoverable = 0` at creation with no opt-in in Step 1** | `drizzle/0001_x2_research_social.sql:196`, `backend/services/community/community.ts:276–306`, `frontend/features/community/dashboard.tsx:266–310` | `x2_social_preferences.discoverable` defaulted to `0` (`false`). Creating a Body in `dashboard.tsx` (`action: "profile"`) only inserted into `x1_community_profiles` and never offered or saved a `discoverable` setting. Users had to open a separate modal (`Social Workspace -> Safety & Privacy`) and click save before anyone could find their `@handle`. | Added `"Let other members find my Body in Community search"` checkbox (checked by default for explicit opt-in) directly inside the **Create / Edit Your Body** modal (`dashboard.tsx`), wired to `saveProfile()` (`community.ts`) which atomically upserts `x2_social_preferences.discoverable`. Also added a 1-click **"Let other members find my Body"** banner in `Discover People & Groups` whenever the signed-in user's Body is currently hidden. |
| **`searchSocial()` returned raw `handle ASC` without prioritizing exact `@handle` matches or indicating whether caller has a Body** | `backend/services/community/social.ts:448–503` | Searching `@handle` stripped `@` on the backend, matched case-sensitively on `b.handle LIKE ?` in SQLite when case differed, ordered purely alphabetically (`b.handle ASC`), and did not tell the UI whether the caller had created a Body yet. | Updated `searchSocial()` to match `lower(b.handle)` case-insensitively, sort exact handle matches (`lower(b.handle) = ?`) first on page 1 while preserving keyset pagination and zero-leak privacy (`!JSON.stringify(data).includes("subject")`), and return `callerHasBody: boolean`. |
| **Overwhelming 13+ button controls and unexplained jargon (`Body`, `Group`, `Soul`)** | `frontend/features/community/dashboard.tsx`, `frontend/features/community/social-workspace.tsx` | First-time visitors saw 7 sub-tabs + 6 modal action buttons without a plain-language explanation of what a **Body**, **Group**, or **Soul** is. | Added a concise 10-second 3-concept onboarding header (**1. Body (`@handle`)**, **2. Group**, **3. Soul**), a 1-click `@handle` copy pill, and clearer tab labels (`Discover People & Groups`, `My Groups`, `Inbox`, `Saved`, `Notifications`, `Privacy & Safety`). |

---

### D. Global Dashboard Lacked a Fast Way to Search Any Instrument or Launch a Scan

| Finding | Pre-X4 File & Lines | Confirmed Root Cause | X4 Resolution |
| :--- | :--- | :--- | :--- |
| **No direct Soul Scan CTA or quick instrument lookup on `Global -> Overview`** | `frontend/features/global/dashboard.tsx:167–238` | `Global -> Overview` only showed a category strip and macro cards; users had to switch to `Asset Terminal` to search or navigate to `Strategy -> Soul Scan` to run a scan. Furthermore, `assetName()` only knew 15 hardcoded labels. | Added a prominent **Run a Soul Scan** CTA in the Global header, a **Quick Instrument Discovery & Research Bar** (`Discover any instrument or run a strategy scan` with 1-click pills for `HDFC Bank`, `SBI`, `Reliance`, `Nifty 50`, `Gold Futures`, `USD/INR`, and `Launch Soul Scan ->`), and upgraded `assetName()` to resolve canonical titles via `registryInstrument(id)`. |

---

### E. Stale `"About X2"` / `"Strategic Souls X2"` Copy in Workspace Chrome

| Finding | Pre-X4 File & Lines | Confirmed Root Cause | X4 Resolution |
| :--- | :--- | :--- | :--- |
| **Hardcoded X2 release strings in `workspace.tsx` and `/api/release`** | `frontend/components/workspace/workspace.tsx:488, 608`, `app/api/release/route.ts:5` | The top navigation link read `"About X2"`, the Guide card subtitle read `"Strategic Souls X2 · Verified research, backtesting & community"`, and `/api/release` returned `release: "X3"`. | Updated navigation and guide labels to `"About Strategic Souls"` (`X4 · Research intelligence, Soul Scan 2.0 & community`) and updated `/api/release` to return `release: "X4"`. |

---

### F. CI Secret Scan Not Enforced in GitHub Actions `verify.yml`

| Finding | Pre-X4 File & Lines | Confirmed Root Cause | X4 Resolution |
| :--- | :--- | :--- | :--- |
| **`scan-secrets.mjs` existed locally but was not a step in `.github/workflows/verify.yml`** | `.github/workflows/verify.yml:52–61` | `verify.yml` ran `check-x2-release.mjs`, `build`, `audit`, and `pytest`, but did not run `node operations/scripts/scan-secrets.mjs`. | Added `- run: node operations/scripts/scan-secrets.mjs` to `.github/workflows/verify.yml`. |

---

## 2. X4 Master Risk & Truthfulness Register

| Subsystem / Capability | Status Classification | Evidence & Operational Notes |
| :--- | :--- | :--- |
| **Canonical Instrument Discovery (`HDFC`, `HDFCBANK`, `SBIN`, `RELIANCE`, `NIFTY`, `GOLD`, `CRUDEOIL`, 41 canonical + ScripMaster)** | `VERIFIED_WORKING` | Deterministic ranker (`scoreCanonicalInstrument` / `searchCanonicalInstruments`) verified in unit tests (`tests/unit/x4-search-and-scanner.test.mjs`), integration tests (`tests/integration/x31-market-gateway.test.mjs`), local compiled Worker preview, and live `/api/market/instruments?q=HDFC`. |
| **Soul Scan 2.0 Universe Accounting & Scale (0, 1, 5, 20, 21, 100, 1,000 candidates)** | `VERIFIED_WORKING` | Hidden `.slice(0, 5)` and `.slice(0, 20)` removed; `validateResearch` supports up to 1,000 instruments; reconciled `accounting` and `batchPlan` verified across 0, 1, 5, 20, 21, 100, and 1,000 candidate universes in `tests/unit/x4-search-and-scanner.test.mjs`. |
| **Soul Scan 2.0 Private User CSV OHLCV Dataset & 5-Stock Indian Equity Fixture** | `VERIFIED_WORKING` | `parsePrivateCsvDataset()` validates dates, rejects future dates / duplicate symbol+date bars / negative prices / impossible OHLC (`high < low`), and enables any signed-in user to run multi-stock equity scans (`NSE:HDFCBANK`, `NSE:SBIN`, `NSE:RELIANCE`, `NSE:TCS`, `NSE:INFY`) without redistributing exchange feeds. |
| **Community 3-Concept Onboarding & Opt-In `@handle` Discovery** | `VERIFIED_WORKING` | Step-1 `"Let other members find my Body"` toggle, case-insensitive exact-handle-first ranking, `callerHasBody` flag, and 1-click discovery banner verified with zero `subject`/email leaks (`tests/integration/x2-social.test.mjs`). |
| **Official Public Macro & FX Feeds (ECB Daily FX, MOSPI CPI)** | `VERIFIED_WORKING` | Live and cached official reference series remain available to all users with full source attribution and staleness indicators. |
| **Owner-Only Angel One SmartAPI Adapter (`ANGELONE_SMARTAPI`)** | `TESTED_WITH_MOCK` / `BLOCKED_EXTERNAL` (Live Cloud Quotes) | Adapter parsing, TOTP, ScripMaster resolution, historical candle normalization, and owner-only fail-closed gates (`PUBLIC_RESTRICTED` / `401` / `403`) are verified in `tests/unit/x31-angelone-adapter.test.mjs` and `tests/integration/x31-market-gateway.test.mjs`. Live cloud quotes require the owner's external static-IP egress proxy (`ANGELONE_BASE_URL`) and Worker secrets (`ANGELONE_API_KEY`, `ANGELONE_CLIENT_CODE`, `ANGELONE_PIN`, `ANGELONE_TOTP_SECRET`, `X2_OWNER_SUBJECT`, `ENABLE_PRIVATE_BROKER_DATA=true`). |
| **Public Redistribution of Licensed NSE/BSE/MCX Live Quotes** | `BLOCKED_EXTERNAL` | Intentionally disabled by default (`ENABLE_PUBLIC_EXCHANGE_QUOTES=false`) because retail broker APIs forbid public redistribution. Public users receive canonical instrument identity (`PUBLIC_IDENTITY_ONLY`) plus official ECB/MOSPI data and private CSV research import. |
