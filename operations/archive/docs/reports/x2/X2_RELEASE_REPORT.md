# Strategic Souls — X3 / X2 Release Report

**Release Date (UTC / IST):** `2026-11-20T20:32:10Z` / `2026-11-21 02:02 IST`  
**Status:** **DEPLOYED-VERIFIED** on the exact original Cloudflare Worker URL and physical D1 database.

---

## 1. Source Control & CI Provenance

| Field | Verified Value |
| --- | --- |
| **Repository** | `https://github.com/GVVKOTA/strategic-souls` (public, default branch `main`, `main_protected: false`) |
| **Pre-X3 Baseline `main` SHA** | `af16aae5fb3f32ce7472b4071c85eb5119f1cf20` |
| **Feature Branch** | `feat/x3-strategic-souls-upgrade` (pushed to `origin` @ `12a9f556735521ee29f81b0df9c49f559762c4bc`) |
| **Merged `main` Release SHA** | `def29dca877d6c3c76fcc2d8986a67f14dfb8bae` |
| **Slice Commits** | `528f17d` (audit/register), `072a312` (P0 auth hardening), `09fff88` (natural-color 3D Earth), `8a57cb9` (unchanged text colors, silver typography, skeletons & motion pref), `3c7b1f7` (3-level Soul Scan, journey, glossary, fault tests), `c3628da` (five-area cousin-friendly docs), `12a9f55` (mobile `12px !important` input fix) |
| **Feature Branch CI (`verify.yml`)** | Run [`44811798005`](https://github.com/GVVKOTA/strategic-souls/actions/runs/44811798005) — **PASS** (`conclusion: "success"`) on `12a9f55` |
| **Merged `main` CI (`verify.yml`)** | Run [`44812087145`](https://github.com/GVVKOTA/strategic-souls/actions/runs/44812087145) — **PASS** (`conclusion: "success"`) on `def29dc` |
| **Optional V3 CI (`verify-v3.yml`)** | Manual `workflow_dispatch`; `backend/quant` pytest passed locally (`29/29`), while Docker/Supabase `real-local-stack` was **NOT-TESTED** locally (no Docker daemon on Windows host). Embedded PGlite RLS tests (`v3-postgres.test.mjs`) passed inside `npm test`. |

---

## 2. Cloudflare Deployment & Binding Verification

| Field | Verified Value |
| --- | --- |
| **Live URL (Unchanged)** | `https://strategic-souls.vishnukota20071005.workers.dev/` |
| **Cloudflare Account** | `2aebd1ad7593f7bba045eb56d9cabd58` |
| **Cloudflare Worker (Unchanged)** | `strategic-souls` (tag `b0ad3e732c704e84a7aad4eff2aef4da`) |
| **Cloudflare D1 Database (Unchanged)** | `ss`, binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` (43 tables + 11 immutability triggers live; applied migrations `drizzle/0000`–`0007` untouched) |
| **Workers Builds Trigger (Hardened)** | `0727e904-48ad-4e75-9b26-1d2123ec5063` — updated `build_command` from duplicate `npm run build\npnpm run build` to single `pnpm run build` (`deploy_command: "npx wrangler deploy"`, `branch_includes: ["main"]`) |
| **Observability Hardening** | Enabled `observability.redact_query_string: true` on Worker `strategic-souls` |
| **Cloudflare Build UUID** | `7f26941f-d39c-474e-85b6-d0c2f699419a` (`build_outcome: "success"`, `2026-11-20T20:31:10Z` -> `2026-11-20T20:32:12Z`, 61s) |
| **Cloudflare Deployment ID** | `e8011e35-5223-4b7b-b27e-a94a913bf25a` (`2026-11-20T20:32:10.127893Z`, 100% traffic) |
| **Cloudflare Worker Version** | Version #5 `646fbf63-3e01-4d13-887b-65e5c6739c92` (verified `bindings: [{ name: "DB", type: "d1", id: "1cda2b05-6b99-4d04-896f-b3542ad2ce7f" }]`) |
| **Instant Rollback Target** | Previous known-good Version #4 `87d2108e-eb02-49c9-a361-3b6eb6fceb3c` (deployment `e623be58-b199-4952-84bb-c9171a65cce6`, commit `af16aae`) |

---

## 3. Automated & Browser Verification Summary

| Check | Exact Command / Tool | Result | Notes |
| --- | --- | --- | --- |
| TypeScript check | `node operations/scripts/check-x2-release.mjs` (`typecheck`) | **PASS** | 0 errors |
| Application ESLint | `node operations/scripts/check-x2-release.mjs` (`lint`) | **PASS** | 0 errors, 5 warnings (reduced from 7 baseline warnings) |
| Node unit & integration suite | `node --experimental-strip-types --experimental-vm-modules --test tests/unit/*.test.mjs tests/integration/*.test.mjs` | **PASS** | **256 passed, 0 failed, 0 skipped** (up from 250 baseline) |
| Optional Python quant suite | `uv run --project backend/quant pytest backend/quant/tests -q` | **PASS** | **29 passed in 0.63s** |
| High-severity security audit | `pnpm.cmd audit --audit-level high` | **PASS** | 0 high/critical (2 moderate pre-existing transitive advisories) |
| Secret & source hygiene scan | `node operations/scripts/scan-v3-source.mjs` | **PASS** | 337 files scanned, 0 findings; `public/downloads/*` verified 0 emails / 0 secrets |
| Production Worker build | `node operations/scripts/run-framework.mjs build` | **PASS** | `dist/server/wrangler.json` verified `name: "strategic-souls"`, `DB` -> `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) |
| Isolated compiled-Worker Playwright QA | `http://127.0.0.1:5173` via `gvvPlaywright` Chromium | **PASS** | 0 console errors on normal navigation (`/`, `/signin`), 0px horizontal overflow across all 9 tested viewports (`320x720`, `360x800`, `390x844`, `430x932`, `768x1024`, `1024x768`, `1280x800`, `1440x900`, `844x390`), 0 mobile inputs `<16px`, unchanged `:root` hex color tokens confirmed via `getComputedStyle`, natural full-color 3D Earth visually verified via screenshot, synthetic-account register/duplicate-409/wrong-pw-401/member-provider-404/consent-alias-preservation/Strategy 3-level Soul Scan/Glossary/Community/Universal Search/Motion preference/Sign-out-401 verified |

---

## 4. Independent Live Production Smoke Verification

Executed directly against `https://strategic-souls.vishnukota20071005.workers.dev/` after Version #5 went live:

- **All 11 HTML routes (`HTTP 200`, CSP + HSTS + `no-store, must-revalidate`):** `/`, `/workspace`, `/signin`, `/product`, `/how-it-works`, `/methodology`, `/pricing`, `/trust`, `/terms`, `/help`, `/legal/compliance`.
- **Public APIs (`HTTP 200`):** `/api/release`, `/api/markets/public` (live ECB FX & US Treasury daily reference snapshots), `/api/auth/session` (`authenticated: false`, `billing: false`, `ads: false`, `googleEnabled: false`).
- **Protected APIs fail closed (`HTTP 401`, `Cache-Control: private, no-store`):** `/api/x1/workspace`, `/api/x2/providers`.
- **Static assets (`HTTP 200`):** `/data/earth-assets.json`, `/data/earth-day.jpg`, `/data/earth-night.jpg`, `/data/earth-clouds.jpg`, `/data/earth-static.jpg`, `/gvv-approved.jpg`.
- **Live X3 Asset Proof:**
  - Served SSR HTML contains `"Start your research cycle"` and `"Explore Earth"`.
  - Served CSS (`/_next/static/css/layout.UGO6-83g.css`, `159,164` bytes) contains unchanged canonical `:root` hex tokens (`#070809`, `#E8EDF2`, `#76C0FF`), `.x3-journey`, `.x3-skeleton`, `.x3-preset-grid`, `[data-motion="minimal"]`, and confirms `.x1-earth-static` has no `grayscale(1)`.

---

## 5. Security, Cost & Unverified Limits Disclosure

- **Zero New Paid Services or Dependencies:** `0` paid subscriptions, `0` new Workers/D1 databases, `0` billing/ads/broker-execution activation, `0` new npm/Python dependencies (`pnpm-lock.yaml` unchanged).
- **Secrets Untouched:** Production Worker Secrets remain empty (`[]`) as before; zero real credentials were committed, printed, or stored in D1.
- **Explicitly Unverified / External Limits:**
  1. **Live Google OAuth Sign-In (`NOT-TESTED`):** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are not configured in Cloudflare Worker Secrets; safe negative/fallback/state-mismatch/cookie-clear behavior is verified via automated integration tests (`tests/integration/auth.test.mjs`).
  2. **Commercial Market-Data Feeds (`NOT-TESTED` Live / Keyless by Design):** `X2_EODHD_API_TOKEN`, `X2_TRUEDATA_BEARER_TOKEN`, and `X2_OWNER_SUBJECT` are unconfigured; fail-closed and fault-injection behavior is verified via deterministic synthetic integration tests (`tests/integration/x2-data.test.mjs`).
  3. **Physical Android Hardware & Docker V3 Supabase Stack (`NOT-TESTED`):** Responsive checks used Playwright desktop Chromium viewport emulation (`320px`–`1440px`), not physical Android GPU hardware; Docker is not installed on the local Windows host so `verify-v3.yml` `real-local-stack` was not executed locally.
  4. **Production Write Flows (`NOT-TESTED` by Policy):** Per release safety rules, no spam accounts or test mutations were written to live production D1; all authenticated write E2E tests ran on the isolated local Worker D1 database.

## 6. Rollback Procedure

To immediately revert to pre-X3 production with zero D1 impact:
- Cloudflare Dashboard -> **Workers & Pages -> `strategic-souls` -> Deployments -> Version #4 (`87d2108e-eb02-49c9-a361-3b6eb6fceb3c`) -> Rollback**, or run `npx wrangler rollback --name strategic-souls`. Never reset or drop D1 `ss`.
