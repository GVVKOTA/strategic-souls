# Strategic Souls — X3 / X2 Upgrade Changelog

**Branch:** `feat/x3-strategic-souls-upgrade` (branched cleanly from `main` @ `af16aae5fb3f32ce7472b4071c85eb5119f1cf20`)
**Zero new npm or Python dependencies added.** `pnpm-lock.yaml`, `backend/quant/uv.lock`, and applied D1 migrations `drizzle/0000`–`0007` remain 100% untouched.

---

## Summary of Implemented Slices

### 1. Baseline Audit & Delivery Governance (`528f17d`)
- Added [`RESTRUCTURE_AUDIT.md`](RESTRUCTURE_AUDIT.md), [`X2_UPGRADE_AUDIT.md`](X2_UPGRADE_AUDIT.md), and [`X3_REQUIREMENTS_AND_BUG_REGISTER.md`](X3_REQUIREMENTS_AND_BUG_REGISTER.md) tracking all 30 checkpoints (`X3-01`–`X3-30`).

### 2. P0 Security & Standalone Auth Hardening (`072a312`)
- **`backend/auth/session.ts`:** Added `timingSafeEqualStrings` for constant-time token/state comparison.
- **`app/api/auth/[...action]/route.ts`:**
  - Enforced session rotation (`revokeSessionFromRequest`) on email/password `signin` and `google/callback` to prevent session fixation.
  - Updated `accounts.last_active` on every successful `signin`.
  - Added `clearOAuthCookies` cleanup on OAuth callback errors so stale state/PKCE cookies never linger.
  - Added `fetchBoundedOAuth` (8-second `AbortController` timeout + `redirect: "manual"` + 3xx rejection) and constant-time state verification for Google OAuth.
- **`app/api/[...path]/route.ts`:** Fixed `POST /api/consent` to preserve `user.displayName || "Researcher"` instead of overwriting with hardcoded `"Researcher"`.
- **`frontend/features/auth/auth-panel.tsx`, `frontend/styles/x1.css`, `frontend/styles/x2.css`:** Added synchronous `submitLock` ref to prevent double form submission; removed invalid `aria-pressed` on `role="tab"` (eliminating 2 ESLint `jsx-a11y` warnings) and styled active tabs via `[aria-selected="true"]`.
- **`tests/integration/auth.test.mjs`:** Added regression tests for session rotation and Google OAuth state-mismatch / cookie-clearing / redirect rejection.

### 3. Natural Full-Color Interactive 3D Earth (`09fff88`)
- **`backend/services/market-data/globe.ts`:** Added `solarDirection(at)` (approximate UTC subsolar vector) and `rotateToView(vec, yaw, pitch)`.
- **`frontend/features/global/globe-canvas.tsx`:** Replaced monochrome grayscale luminance shader with linear-space natural full-color NASA Blue Marble surface, ocean specular highlight, smooth approximate UTC day/night terminator, warm NASA Black Marble 2016 night city lights, translucent historical cloud layer, restrained blue Rayleigh Fresnel rim, sRGB tone-mapping, two-pointer touch pinch-to-zoom, `webglcontextrestored` recovery, and honest non-blocking loading stages (`preparing`/`loading`/`ready`/`failed`).
- **`frontend/components/workspace/globe-visual.css`:** Removed `filter: grayscale(1)` and `mix-blend-mode: screen` from `.x1-earth-static` so static/2D fallback renders in crisp natural color.
- **`frontend/features/global/dashboard.tsx`:** Added user-triggered **Explore Earth** 4-hub orbital tour (`XNSE` -> `XLON` -> `XNYS` -> `XTKS`) with **Stop tour** button and explicit approximate solar lighting + historical NASA imagery disclosures.
- **`tests/unit/x1-globe.test.mjs`:** Added solar-direction math tests, natural-color shader & static-fallback checks, and SHA-256 integrity checks confirming all 4 NASA assets in `public/data/earth-assets.json` are byte-unchanged.

### 4. Unchanged UI Text Colors, Silver Typography, Branded Loaders & Motion Preference (`8a57cb9`)
- **`frontend/styles/globals.css`:** **100% UNCHANGED** — all 12 canonical `:root` hex color tokens preserved identically.
- **`frontend/styles/x1.css`, `frontend/styles/x2.css`:** Removed cramped `12px !important` overrides on buttons/labels; upgraded primary interactive controls, tabs, forms, callouts, and table cells to `>= 14px` desktop; enforced `>= 16px` (`1rem`) on all mobile inputs/selects (`<= 680px`) to prevent auto-zoom; added subtle hover elevation and scoped X3 skeleton, journey, preset, glossary, and `[data-motion="minimal"]` styles using only canonical neutral tokens.
- **`frontend/components/workspace/shared.tsx`, `workspace.tsx`, `global/dashboard.tsx`, `community/dashboard.tsx`:** Added non-blocking `WorkspaceSkeleton` (`role="status"`, `aria-live="polite"`, `140ms` reveal delay) and optional **System (default) / Minimal** motion preference (`ss-motion-pref`) in Account and About modals.
- **`tests/unit/x1-palette.test.mjs`:** Added automated regression guard verifying unchanged color tokens alongside `>= 14px` desktop buttons and `>= 16px` mobile inputs.

### 5. Product Workflows: 3-Level Soul Scan, Research Journey, Glossary & Fault-Injection Tests (`3c7b1f7`)
- **`backend/services/research/research.ts`:** Added 6 keyless-ready `BEGINNER_SCAN_PRESETS` (compiling directly into the ONE canonical Soul Scan AST) and 6-term `RESEARCH_GLOSSARY` (RSI, ATR, OHLC, CAGR/XIRR, IV/BSM, PIT).
- **`frontend/features/strategy/workspace.tsx`:** Upgraded Soul Scan to **Beginner (default)** / **Intermediate** (nested `ALL`/`ANY`/`NOT` `RuleEditor`) / **Advanced** (canonical formula editor), all sharing ONE canonical AST and preserving `SIMPLE`/`ADVANCED` backend compatibility; added collapsible Research Glossary `<details>`.
- **`frontend/features/global/dashboard.tsx`, `frontend/components/workspace/workspace.tsx`:** Added skippable/dismissible 5-step **Start your research cycle** bar (`ss-journey-hidden`) linking Global -> Watchlists -> Strategy -> Evidence -> Community; fixed portfolio transaction modal date `defaultValue`/`max` fallback when market snapshot is null/offline.
- **`frontend/features/community/dashboard.tsx`:** Replaced stale `"This Site remains restricted to its existing audience."` copy with accurate private-groups privacy copy.
- **`tests/unit/x2-research.test.mjs` & `tests/integration/x2-data.test.mjs`:** Added Beginner preset AST round-trip & `UNKNOWN` insufficient-data tests, plus provider fault-injection tests (403, 500, 503, timeout, malformed JSON, stale candles, secret rotation cache bypass, and zero secret leakage).

### 6. Five-Area Maintainability & Documentation Consolidation (Slice 5)
- Removed obsolete duplicate root file `Read me.md` (`git rm`).
- Rewrote root [`README.md`](../../README.md) as a cousin-friendly five-area guide with verified Windows PowerShell/CMD commands, `http://127.0.0.1:5173`, tiny UI-vs-math example, safe GitHub PR workflow, and truthful Cloudflare Workers Builds overview.
- Reconciled [`AGENTS.md`](../../AGENTS.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md) to remove stale ChatGPT Sites / fictional-account claims.
- Added area READMEs: [`frontend/README.md`](../../frontend/README.md), [`backend/README.md`](../../backend/README.md), [`database/README.md`](../../database/README.md), [`public/README.md`](../../public/README.md), plus [`visual/STRATEGIC_SOULS_CINEMATIC_UPGRADE.md`](visual/STRATEGIC_SOULS_CINEMATIC_UPGRADE.md), [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md), and [`FUTURE_API_KEY_SETUP.md`](FUTURE_API_KEY_SETUP.md).

---

## Impact on Auth, Finance, Data & Existing Migrations

- **Authentication & Accounts:** Backward-compatible with existing `auth_users` and `auth_sessions` rows; strengthens session rotation and OAuth safety without invalidating existing stored password hashes.
- **Financial & Quantitative Semantics:** Zero changes to canonical math equations, 3-valued `UNKNOWN` handling, `INSUFFICIENT EVIDENCE` calibration gates, or fail-closed provider rights enforcement.
- **Cloudflare D1 Schema:** Zero schema changes; applied migrations `drizzle/0000`–`0007` untouched.
