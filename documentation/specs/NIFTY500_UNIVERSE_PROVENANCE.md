# Strategic Souls — Nifty 500 Universe Provenance & Governance

**Audited:** 25 November 2026 IST  
**Database Table:** `x78_market_universes` (migrations [`database/migrations/0012_x78_market_scans.sql`](../../database/migrations/0012_x78_market_scans.sql) + [`database/migrations/0014_x1_constituent_grants.sql`](../../database/migrations/0014_x1_constituent_grants.sql))

---

## 1. Read-Only Official Source Metadata Inspection

A read-only metadata inspection of `https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv` was performed without storing or importing the file into production D1:

| Field | Observed Value |
| --- | --- |
| Source URL | `https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv` |
| HTTP `Last-Modified` | `Mon, 23 Nov 2026 17:50:11 GMT` |
| CSV Header Columns | `Company Name,Industry,Symbol,Series,ISIN Code` |
| Observed Data Row Count | **501** rows (not exactly 500!) |
| Series Breakdown | `EQ`: 496 · `RR`: 3 · `BE`: 2 |
| Legal Status (`https://www.niftyindices.com/terms-of-use`) | **BLOCKED WITHOUT WRITTEN PERMISSION**: *"No material from the Site may be copied, modified, reproduced, republished, uploaded, transmitted, posted or distributed in any form without prior written permission from the Company."* Official data subscription contact: `indices@nseids.co.in` (`https://www.niftyindices.com/offerings/data-subscription`). |
| Production Import Status | **NOT IMPORTED** (sentinel row `x8-scoped-v1` only remains in production D1 `ss`). |

---

## 2. Canonical Universe Architecture Implemented (`application/backend/services/market-data/nifty-500.ts`)

1. **No Hardcoded 500-Row Drop:**
   - Because official NSE Indices published constituent lists can contain >500 lines (e.g., `501` observed on 23 Nov 2026 across `EQ`, `BE`, and `RR` series, or temporary demerger/REIT/class entries), `validateNifty500()` accepts any documented official `expectedCount` in `[450, 550]` and verifies `input.length === expectedCount`.
   - Both `expectedCount` (official published count) and `distinctCount` (distinct validated tradable instruments) are surfaced cleanly in `niftyUniverse()` and `GET /api/strategy/universe`.
2. **Strict Constituent Validation:**
   - Canonical NSE identifier (`^NSE:[A-Z0-9][A-Z0-9&.-]{0,29}$`)
   - Valid Indian ISIN (`^IN[A-Z0-9]{9}[0-9]$`)
   - Non-empty company name (<= 160 chars) and industry classification (<= 100 chars)
   - Optional exchange `series` (`EQ`, `BE`, `RR`, `BZ`, `SM`, `ST`, etc.; `^[A-Z0-9]{1,8}$`)
   - Uniqueness enforced on both canonical symbol `id` and `isin` (zero ambiguous duplicates).
3. **Immutable Version Pinning & Rights Expiry:**
   - Each authorized snapshot is hashed via SHA-256 (`digest({ effectiveDate, constituents, provenance, expiresAt })`) into `version`.
   - Every completed durable market scan stores its exact `universeVersion` in `x78_market_scan_jobs` and `x1_scans`, preserving historical membership attribution across future index rebalances.
   - `niftyUniverseRightsActive(version)` is re-checked at read time in `scan-projection.ts`; if constituent rights expire, historical displays fail closed honestly.
4. **Owner-Only Import Path:**
   - `PUT /api/strategy/universe` requires authenticated `X2_OWNER_SUBJECT`, CSRF origin verification, rate limiting, explicit `rightsConfirmed: true`, `provenance` reference (12–280 chars), valid `effectiveDate`, and future `rightsExpiresAt`.
   - Non-owner accounts receive HTTP `404` on `PUT /api/strategy/universe`.
   - Read-only discovery (`GET /api/strategy/universe`) is safe for signed-in users and guests, exposing version, effective date, counts, coverage, eligible timeframes, rights mode, and readiness status with zero secrets or private contract text.
5. **Search & Asset Discovery Integration:**
   - `app/api/market/instruments/route.ts` and `data-service.ts#instrumentRegistry()` merge active authorized `niftyUniverse()` constituents into canonical NSE discovery so all members become searchable by symbol, company name, and ISIN immediately upon licensed import.
