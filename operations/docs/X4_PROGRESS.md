# Strategic Souls — X4 Execution Progress & Checkpoint Register

- **Release:** `X4` (`4.0.0-x4`)
- **Active Working Branch:** `feat/x4-reliability-scan-search-ux` (merged to `main` after full local + CI verification)
- **Target Live Worker:** `https://strategic-souls.vishnukota20071005.workers.dev/`

---

## 1. Phase-by-Phase Execution Checklist

- [x] **Phase A — Deep Product, Code, Data, UX & Live Audit**
  - [x] Verified local Git state (`D:\Project SS\strategic-souls`), GitHub repository (`GVVKOTA/strategic-souls`), Cloudflare Worker (`strategic-souls`), and D1 database `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, 43 tables + 11 immutability triggers across migrations `0000`–`0007`).
  - [x] Confirmed exact root causes of all P0 complaints (`.slice(0, 5)` and `.slice(0, 20)` in `data-service.ts`, `100` limit in `research.ts`, `200` limit in `scan.ts`, missing `HDFCBANK` in `X2_INSTRUMENTS` and `VERIFIED_SEED_INSTRUMENTS`, default `discoverable = 0` with no step-1 opt-in in Community Body creation, stale `"About X2"` labels).
  - [x] Authored [`operations/docs/X4_FULL_AUDIT.md`](X4_FULL_AUDIT.md).

- [x] **Phase B — Canonical Instrument Discovery & Search (`HDFC` / `HDFCBANK` Fix)**
  - [x] Expanded `X2_INSTRUMENTS` to 41 canonical assets (`NSE:HDFCBANK`, `BSE:HDFCBANK`, `NSE:SBIN`, `BSE:SBIN`, `NSE:RELIANCE`, `BSE:RELIANCE`, `NSE:TCS`, `NSE:INFY`, `NSE:ICICIBANK`, `NSE:BHARTIARTL`, `NSE:ITC`, `NSE:KOTAKBANK`, `NSE:LT`, `NSE:AXISBANK`, `NSE:BAJFINANCE`, `NSE:MARUTI`, `NSE:SUNPHARMA`, `NSE:TITAN`, `NSE:TATAMOTORS`, `NSE:ADANIENT`, `NSE:WIPRO`, `NSE:HCLTECH`, `NSE:ULTRACEMCO`, `NSE:NTPC`, `NSE:POWERGRID`, `NSE:ONGC`, `NSE:TATASTEEL`, `NSE:HINDUNILVR`, indices, dated MCX futures, ECB FX, and macro benchmarks).
  - [x] Added `COMMON_INSTRUMENT_ALIASES`, `scoreCanonicalInstrument()`, and `searchCanonicalInstruments()` with deterministic priority tiers.
  - [x] Upgraded `InstrumentMaster` (`instrument-master.ts`), `gatewaySearchInstruments` (`gateway.ts`), `/api/market/instruments` (`route.ts`), `UniversalSearch` (`universal-search.tsx`), `Global` (`dashboard.tsx`), and `Strategy` (`workspace.tsx`).

- [x] **Phase C — Soul Scan 2.0 Full-Universe Enumeration & Private CSV OHLCV Import**
  - [x] Removed silent `.slice(0, 5)` and `.slice(0, 20)` truncation in `researchUniverse()` (`data-service.ts`).
  - [x] Raised `validateResearch()` `instrumentIds` limit and `evaluateScan()` dataset cap to `1,000`.
  - [x] Implemented reconciled `ScanUniverseAccounting` (`discovered`, `authorized`, `eligible`, `evaluated`, `matched`, `notMatched`, `unknown`, `excluded`, `withheld`, `errors`, `coveragePct`) and `ScanBatchPlan`.
  - [x] Implemented `parsePrivateCsvDataset()` (`research.ts` + `workspace.ts`) with strict calendar-date, future-date, duplicate-row, negative-price, and OHLC-consistency validation.
  - [x] Built the 4-step Soul Scan 2.0 wizard and 5 **"Where should we scan?"** preset cards (including the 1-click 5-stock Indian equity `TEST DATA` loader) in `frontend/features/strategy/workspace.tsx`.

- [x] **Phase D — Community First-Time UX & `@handle` Discovery Fix**
  - [x] Added 10-second 3-concept onboarding card (**Body**, **Group**, **Soul**) and 1-click `@handle` copy button in `frontend/features/community/dashboard.tsx`.
  - [x] Added `"Let other members find my Body"` step-1 checkbox in the Create/Edit Body modal and wired `saveProfile()` (`backend/services/community/community.ts`) to upsert `x2_social_preferences.discoverable`.
  - [x] Updated `searchSocial()` (`backend/services/community/social.ts`) for case-insensitive handle search, exact-`@handle`-first sorting, and `callerHasBody` flag while preserving zero-leak privacy.
  - [x] Added 1-click `"Let other members find my Body"` banner in `Discover People & Groups` when the signed-in user's Body is hidden.

- [x] **Phase E & F — Global Dashboard Redesign, Stale `"About X2"` Removal & CI Hardening**
  - [x] Added primary **Run a Soul Scan** CTA and **Quick Instrument Discovery & Research Bar** on `Global -> Overview`.
  - [x] Replaced stale `"About X2"` / `"Strategic Souls X2"` copy with `"About Strategic Souls"` (`X4`) and updated `/api/release` to `release: "X4"`.
  - [x] Added `node operations/scripts/scan-secrets.mjs` to `.github/workflows/verify.yml`.

- [x] **Phase G & H — Automated Tests, Local Compiled-Worker Playwright Verification & Deployment**
  - [x] Added `tests/unit/x4-search-and-scanner.test.mjs` and expanded `tests/integration/x31-market-gateway.test.mjs`.
  - [x] Verified `typecheck` (`0` errors), `lint:app` (`0` errors), Node unit + integration tests (`267/267` pass), Python quant tests (`29/29` pass), `pnpm audit --audit-level high` (`0` vulnerabilities), and `scan-secrets.mjs` (`0` findings).

---

## 2. External Blockers & Honest Disclosure

- **Live Cloud Angel One Broker Quotes (`BLOCKED_EXTERNAL` until owner tunnel is active):**
  - The Cloudflare Worker is deployed and enforces fail-closed owner-only access (`PUBLIC_RESTRICTED` for anonymous/non-owner visitors).
  - Serving live Angel One quotes in production requires the owner's static-IP egress proxy (`MARKET_DATA_ADAPTER_URL`) and Cloudflare Worker secrets (`ANGELONE_API_KEY`, `ANGELONE_CLIENT_ID`, `ANGELONE_MPIN`, `ANGELONE_TOTP_SECRET`, `X2_OWNER_SUBJECT`, `ENABLE_PRIVATE_BROKER_DATA=true`).
- **Public Exchange Quote Redistribution (`BLOCKED_EXTERNAL` by exchange licensing):**
  - `ENABLE_PUBLIC_EXCHANGE_QUOTES=false` remains default because retail broker APIs prohibit public redistribution. Public visitors receive full canonical instrument identity discovery (`PUBLIC_IDENTITY_ONLY`), official ECB/MOSPI data, and Private User CSV OHLCV multi-stock scanning.
