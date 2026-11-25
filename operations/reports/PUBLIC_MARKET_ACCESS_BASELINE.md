# Strategic Souls — Public Market Access Baseline

**Recorded:** 25 November 2026 IST  
**Repository:** `https://github.com/GVVKOTA/strategic-souls`  
**Production URL:** `https://strategic-souls.vishnukota20071005.workers.dev/`

---

## 1. Live Production State Prior to Changes

| Component | Verified Baseline Value |
| --- | --- |
| Git `origin/main` HEAD SHA | `5ac5b5bdee274dec86e30085199a305199f4bb37` (PR #13 merged `2026-11-25T06:29:21Z` / `11:59:21 IST`) |
| Production Worker | `strategic-souls` (script tag `b0ad3e732c704e84a7aad4eff2aef4da`) |
| Active Worker Version | Version #45 `c14d457e-c3b7-4389-a106-91d936759d5c` (deployment `458fe546-a80a-4dcd-b9da-cbb5f091a1eb`, 100% traffic, `2026-11-25T06:31:52Z` / `12:01:52 IST`) |
| Live `/api/release` Match | `buildCommit: "5ac5b5bdee274dec86e30085199a305199f4bb37"`, `releaseName: "Strategic Souls X 1.1 Workspace"` |
| Cron Triggers | `[]` (none deployed prior to this work) |
| Production D1 Database | `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, APAC, `6,705,152` bytes, 70 tables) |
| Applied D1 Migrations | All 21 migrations `0000` through `0020_official_reference_cache.sql` applied |
| Pre-Change D1 Time Travel Bookmark | `00000153-00000000-0000512e-8076d162e011331b3ae49f6640000c7d` |

### Active Cloudflare Worker Bindings (Names Only — Zero Secret Values)
- D1 Binding: `DB` -> `ss`
- VPC Service Binding: `MARKET_DATA_ADAPTER` -> `01a2095b-f466-7c90-a813-4fad03735504`
- Version Metadata Binding: `CF_VERSION_METADATA`
- Plain-Text Vars: `ENABLE_PRIVATE_BROKER_DATA="true"`, `INDIA_API_HOST="stock.indianapi.in"`
- Encrypted Secret Bindings Present: `BHARATSTOCK_API_KEY`, `INDIA_API_KEY`, `MARKET_ADAPTER_AUTH_TOKEN`, `X2_OWNER_SUBJECT`

---

## 2. Production D1 Read-Only Audit

### Existing User Data (Protected — Never Modified or Reset)
- `accounts`: 5 | `auth_users`: 5 | `auth_sessions`: 8
- `x1_scans`: 30 | `x51_scan_reservations`: 44 | `x1_records`: 6 | `x1_ledger`: 1 | `x1_bodies`: 3
- `x51_web_souls`: 2 | `x2_conversations`: 2 | `x2_messages`: 12 | `official_reference_cache`: 2

### Shared-Data & Universe State Prior to Changes
- `x2_providers`: **0 rows** (no shared provider grant configured)
- `x2_provider_audit`: **0 rows**
- `x8_shared_history_plan`: **0 rows** | `x8_shared_history_task`: **0 rows** | `x8_shared_history_snapshot`: **0 rows**
- `x78_market_scan_jobs`: **0 rows** | `x78_market_scan_batches`: **0 rows**
- `x78_market_universes`: **1 sentinel row only** (`sequence=1`, `version="x8-scoped-v1"`, `effective_date="1900-01-01"`, `constituents="[]"`, `expected_count=500`, `rights_expires_at=NULL`)

### Root-Cause Classification of Baseline Ordinary-User Failure
1. **Absent provider grant (`x2_providers = 0`)**: Although `INDIA_API_KEY` and `BHARATSTOCK_API_KEY` secrets were installed, no verified grant row existed (and both accounts were confirmed on Free tiers; see `PUBLIC_PROVIDER_RIGHTS_MATRIX.md`).
2. **Missing authorized Nifty 500 constituent roster**: Only the `x8-scoped-v1` empty sentinel existed in `x78_market_universes`.
3. **Code gaps on `main` (`5ac5b5b`)**:
   - `data-service.ts` did not invoke `shared-history.ts` or support `INDIANAPI`/`BHARATSTOCK` shared snapshots.
   - `providers.ts` and `shared-history.ts` enforced an all-or-nothing rights check requiring `display && redistribution` even for derived-only screening.
   - Durable `market-scan-jobs.ts`, `scan-retention.ts`, Cloudflare Cron triggers (`scheduled()`), and dynamic `/api/strategy/universe` readiness were absent from `main`.
   - `workspace.ts:575` hardcoded an unconditional HTTP 503 for `NIFTY_500`.

---

## 3. Open PR Reconciliation Audit

| Branch / PR | Head Commit | Key Contents | Disposition vs `main` (`5ac5b5b`) |
| --- | --- | --- | --- |
| PR #5 (`feat/x7-8-strategic-souls`) | `7f3b49c` | Early X7.8 market scan jobs & workspace hardening | Superseded by PR #6/#7 and production PRs #8–#13; do not merge wholesale. |
| PR #6 (`feat/x8-shared-market-data`) | `236dadf` | Shared history snapshot store (`0013`) & durable jobs | Schema `0013` already applied on `main`; superseded by PR #7 updates. |
| PR #7 (`feat/strategic-souls-x1`) | `25a7d7b` | Durable `market-scan-jobs.ts`, `scan-retention.ts`, `shared-history.ts` wiring, cron triggers, `data-control.tsx` importer | **Cannot merge wholesale**: PR #7 removes the owner Angel One VPC adapter (`backend/services/market-data/angelone/*`, `vpc_services`, `ENABLE_PRIVATE_BROKER_DATA`) and drops PR #13 (`0020_official_reference_cache.sql` / `official-references.ts`). Selective, reconciled port performed onto `main` `5ac5b5b` preserving all PR #8–#13 fixes and owner Angel One VPC. |

---

## 4. Exact Ordinary-Account Failure Reproduction (Baseline `5ac5b5b`, Isolated Local Preview)

Executed against isolated local Cloudflare Worker + local D1 (`http://127.0.0.1:5173`, exact `5ac5b5b` build) using a newly registered disposable ordinary account (`isOwner: false`, `accepted: true`):

| Test Case | Endpoint & Scope | HTTP Status | `X-Scan-Trace-Id` | Observed Response / Result | Quota Accounting |
| --- | --- | --- | --- | --- | --- |
| Ordinary `MARKET` + `1d` + `close > 0` | `POST /api/strategy/scan` (`MARKET`, `1d`) | `503` | `0dd98c58-1bd6-4887-a580-233db6aed832` | `{"error":"Shared NSE, BSE, and MCX market history is not yet active for standard accounts on this deployment. Your scan quota was not charged."}` | `20/20` remaining (`0` charged) |
| Ordinary `NIFTY_500` + `1d` + `close > 0` | `POST /api/strategy/scan` (`NIFTY_500`, `1d`) | `503` | `359fcac4-70d4-43a6-a20f-d5e8d1a292d4` | `{"error":"Nifty 500 is unavailable. An authorized constituent snapshot and eligible historical coverage are required. No scan allowance was used."}` | `20/20` remaining (`0` charged) |
| Ordinary `ECB_DAILY` + `1d` + `close > 0` | `POST /api/strategy/scan` (`ECB_DAILY`, `1d`) | `200` | `01d4a49c-af15-4a50-99e2-5aab30f2e687` | `13` matched / `13` eligible (`asOf: 2026-11-25T06:48:29.297Z`), reloaded cleanly from GRAVEYARD (`7a617c67-36c8-4931-ba88-5d5ed8762b90`) | `19/20` remaining (`1` charged) |
| Ordinary private broker quote | `GET /api/market/quote?ids=NSE:SBIN` | `403` | N/A | `errorCode: "PUBLIC_LICENSE_REQUIRED"` | N/A |
| Ordinary provider config | `GET /api/x2/providers` | `404` | N/A | Owner-only settings hidden | N/A |

### Live Production Read-Only Endpoint Baseline (`5ac5b5b`)
- `GET /api/strategy/universe`: `{"universe":"NIFTY_500","membership":null,"scanReadiness":{"owner":false,"signedIn":false},"eligibleHistory":null,"eligibleTimeframes":[],"status":"BLOCKED_BY_UNIVERSE"}`
- `GET /api/market/health` (public): `accessScope: "PUBLIC_RESTRICTED"`, `authState: "HIDDEN"`, `errorCode: "PUBLIC_LICENSE_REQUIRED"`
- `GET /api/markets/overview` (public): 8 cards returned; only `ECB:USDINR` populated (`92.9189...`); remaining 7 cards `UNAVAILABLE`.
