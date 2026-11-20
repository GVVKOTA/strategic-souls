# Strategic Souls — X2 / X3 Baseline Product, Security & Visual Audit

**Recorded:** 2026-11-21 IST
**Baseline `main` HEAD:** `af16aae5fb3f32ce7472b4071c85eb5119f1cf20`
**Live Production URL:** `https://strategic-souls.vishnukota20071005.workers.dev/`
**Cloudflare Worker:** `strategic-souls` (tag `b0ad3e732c704e84a7aad4eff2aef4da`, version #4 `87d2108e-eb02-49c9-a361-3b6eb6fceb3c`, deployed `2026-11-20T15:27:13Z` from commit `af16aae`)
**Cloudflare D1 Database:** `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`), bound as `DB` (43 tables + 11 immutability triggers confirmed present)

---

## 1. Baseline Automated Verification Evidence

| Check | Exact Command | Result | Observed Details |
| :--- | :--- | :--- | :--- |
| TypeScript check | `node operations/scripts/check-x2-release.mjs` (`tsc --noEmit`) | **PASS** | 0 errors (6.6s) |
| Application lint | `eslint app frontend backend database` | **PASS (7 warnings)** | 0 errors; 2 `jsx-a11y/role-supports-aria-props` warnings in `auth-panel.tsx`, 4 `no-img-element` warnings, 1 `no-location-assign` in `legacy/workspace.tsx` |
| Node unit + integration tests | `node --experimental-strip-types --experimental-vm-modules --test "tests/**/*.test.mjs"` | **PASS** | 250 passed, 0 failed, 0 skipped (3.1s) |
| Optional Python quant tests | `uv run --project backend/quant pytest backend/quant/tests -q` | **PASS** | 29 passed (6.5s) |
| Dependency audit | `pnpm.cmd audit --audit-level high` | **PASS** | 0 critical, 0 high; 2 moderate advisories |
| Source secret scan | `node operations/scripts/scan-v3-source.mjs` | **PASS** | 327 files scanned, 0 findings |
| Local compiled Worker preview | `node operations/scripts/local-preview.mjs launch` | **PASS** | Served at `http://127.0.0.1:5173` (proxying local Wrangler on `127.0.0.1:8787`, isolated `.wrangler/local-preview` D1) |
| Live Worker read-only smoke | Node `fetch` against `https://strategic-souls.vishnukota20071005.workers.dev` | **PASS** | `/`, `/workspace`, `/signin`, `/product`, `/how-it-works`, `/methodology`, `/pricing`, `/trust`, `/terms`, `/help`, `/legal/compliance`, `/api/release`, `/api/markets/public`, `/api/auth/session` all 200 with CSP + HSTS; `/api/x1/workspace` and `/api/x2/providers` return 401 (`private, no-store`) |

---

## 2. Historical Defect Leads — Confirmed vs Already Resolved

| Historical Lead | Current HEAD Status | Evidence |
| :--- | :--- | :--- |
| 1. D1 placeholder UUID `00000000-...` | **ALREADY RESOLVED IN SOURCE & PROD** | `vite.config.ts` and live Worker `strategic-souls` both bind `DB` to real D1 `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`). Local preview intentionally uses isolated placeholder UUID with `--local`. |
| 2. Local Windows launch / PowerShell failure | **REPRODUCED (PARTIAL)** | Default Windows PowerShell execution policy blocks `npm.ps1` (`PSSecurityException`). `npm.cmd`, `pnpm.cmd`, and `node operations/scripts/local-preview.mjs launch` work cleanly and serve `http://127.0.0.1:5173`. Needs explicit Windows PowerShell guidance in README. |
| 3. Cloud duplicate build command | **REPRODUCED (LIVE TRIGGER)** | Cloudflare Workers Builds trigger `0727e904-48ad-4e75-9b26-1d2123ec5063` has `build_command: "npm run build\npnpm run build"` — builds the Worker twice on every push to `main`. |
| 4. GitHub-to-live disconnect | **RESOLVED / VERIFIED** | Cloudflare Workers Builds IS connected to `GVVKOTA/strategic-souls` branch `main` and automatically deployed `af16aae` as version #4. Stale docs still falsely claim ChatGPT Sites manual deploy. |
| 5. Legacy OpenAI/ChatGPT login | **RESOLVED IN CODE; STALE IN DOCS** | `backend/auth/session.ts` and `app/api/auth/[...action]/route.ts` implement standalone D1 PBKDF2-SHA256 + SHA-256 cookie auth + optional PKCE Google OAuth. No OpenAI auth remains in runtime routes; stale references remain in `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `DEVELOPER_GUIDE.md`, and `community/dashboard.tsx` copy. |
| 6. V3 CI / local-stack | **HISTORICALLY RESOLVED** | Per `RESTRUCTURING_REPORT.md`, commit `feaa301` resolved local Supabase template/redirect/Mailpit issues; Python quant suite passes 29/29 locally. Local Docker/Supabase stack not run in this session (not installed/required for X2). |
| 7. Stuck loading / intro overlay | **AUDITED — IMPROVE SKELETONS** | `EclipseIntro` has hard 1050ms React / 1100ms CSS deadlines and `pointer-events: none`. However, route/dashboard Suspense fallbacks and asset/community loading states render bare text strings instead of layout-matched non-blocking branded skeletons, and globe lacks explicit `failed`/retry texture recovery states before WebGL failure. |
| 8. UI readability / silver & mobile typography | **REPRODUCED IN BROWSER** | Live Playwright inspection at 1440px and 390px confirmed: desktop primary/secondary buttons forced to `12px !important` (`x1.css:506`); mobile `Universal search` input and `Exchange region` select render at `12px` (<16px mobile auto-zoom floor); `x1.css` contains multiple `12px !important` overrides. Canonical hex tokens are intact and exceed WCAG 4.5:1 statically. |
| 9. Grayscale WebGL Globe | **REPRODUCED IN CODE & SCREENSHOT** | `frontend/features/global/globe-canvas.tsx:19` converts NASA Blue Marble RGB to grayscale via `luminance(...)` and `vec3(value)`. `globe-visual.css:47` applies `filter: grayscale(1)` to static fallback `earth-static.jpg`. |
| 10. Strategy 3-level scan UX | **GAP CONFIRMED** | `frontend/features/strategy/workspace.tsx` exposes only 2 modes (`Simple`, `Advanced`) instead of Beginner (default guided presets) / Intermediate (structured nested AND/OR) / Advanced (typed formula editor) sharing one canonical AST. |
| 11. Security / Observability / Auth edge cases | **REPRODUCED** | (a) Live Cloudflare Worker `observability.redact_query_string` is `false`. (b) `POST /api/consent` in `app/api/[...path]/route.ts:135` hardcodes alias `"Researcher"` instead of `user.displayName`. (c) `POST /api/auth/signin` and `google/callback` do not revoke an existing session cookie before issuing a new session (session rotation). (d) Google OAuth fetches lack `AbortController` timeout and `redirect: "manual"`. (e) `auth-panel.tsx` lacks a ref-based double-submit lock and triggers 2 `jsx-a11y` warnings (`aria-pressed` on `role="tab"`). |
| 12. Portfolio modal date default offline | **REPRODUCED IN CODE** | `frontend/features/global/dashboard.tsx:1237` uses `data?.asOf.slice(0, 10)` with no fallback when `data` is unavailable/loading. |

---

## 3. Baseline Browser Telemetry (`http://127.0.0.1:5173/`)

- **Console errors / warnings:** `0` errors, `0` warnings.
- **Horizontal overflow (`scrollWidth - innerWidth`):** `0 px` at `1440x900` and `390x844`.
- **Canonical `:root` text & surface tokens observed in DOM:**
  - `--x1-bg: #070809`, `--x1-surface-1: #101215`, `--x1-surface-2: #191c20`, `--x1-surface-3: #23272d`
  - `--x1-text-primary: #e8edf2`, `--x1-text-secondary: #cad3dc`, `--x1-text-tertiary: #b9c3ce`, `--x1-text-muted: #a7b1bc`
  - `--x1-title-blue: #76c0ff`, `--x1-title-blue-alt: #94d0ff`
- **Computed UI measurements (before):**
  - `h1` (`Strategic Souls`): `rgb(118, 192, 255)`, `33.6px`, Space Grotesk
  - `.x1-secondary` (`Sign in`): `rgb(202, 211, 220)`, `12px` (too small — target `14px` without changing color)
  - Mobile `390px` inputs under `16px`: `Universal search` (`12px`), `Exchange region` (`12px`)
  - WebGL Globe: active (`renderer="webgl"`, `textureWidth="2048"`, `satellite="day"`, `clouds="historical-composite"`, `nightLights="historical-2016"`), rendered in grayscale.
- **Worker bundle baseline (from production build log):** `1401.00 KiB` total upload (`410.48 KiB` gzip), Worker startup time `19 ms`.

---

## 4. Prioritized Execution Plan (Risk-Ranked Vertical Slices)

1. **Slice 1 (P0 Security & Auth Hardening):** Session rotation on `signin`/`google/callback`, OAuth fetch timeouts + `redirect: "manual"` + cookie clearing on error, `POST /api/consent` display-name preservation, `auth-panel.tsx` double-submit lock + ARIA fix, unit/integration security regression tests.
2. **Slice 2 (P1 Realistic Full-Color 3D Earth):** Upgrade `globe-canvas.tsx` WebGL shader to true-color NASA Blue Marble + warm Black Marble night lights + approximate UTC solar terminator + subtle ocean specular + translucent clouds + restrained blue Rayleigh Fresnel rim + two-finger pinch zoom + `webglcontextrestored` recovery + optional user-triggered Explore Earth hub tour with Stop button; remove grayscale CSS from static fallback; preserve all 24 exchanges, clustering, hit projection, and SHA-256 asset provenance; add regression tests.
3. **Slice 3 (P1 Typography, Unchanged Text Colors, Branded Loaders & Motion):** Remove cramped `12px !important` button/tab/mobile-input overrides while keeping all `:root` hex color tokens 100% byte-identical; enforce `>= 16px` mobile form inputs; add structured non-blocking branded skeleton loaders, optional System/Minimal motion preference, and subtle restrained interactive transitions; add automated text-color immutability & typography regression tests.
4. **Slice 4 (P1 Product Workflows — Global, Strategy 3-Level Scan, Community & API Readiness):** Add skippable first-run 5-step Research Journey guide on Global, offline-safe Portfolio date fallback, Beginner (default guided presets) / Intermediate (structured AND/OR) / Advanced (formula code) Soul Scan modes compiling to ONE canonical AST, contextual financial glossary (CAGR/XIRR/RSI/ATR/OHLC/IV/PIT), honest Community privacy copy, and comprehensive provider fault-injection regression tests (401/403/429/5xx/timeout/malformed/stale/redistribution).
5. **Slice 5 (P1 Five-Area Documentation & Cousin-Friendly Runbooks):** Consolidate `README.md`, delete obsolete `Read me.md`, update `AGENTS.md`, `ARCHITECTURE.md`, `DEVELOPER_GUIDE.md`, add 4 missing area READMEs, and author `STRATEGIC_SOULS_CINEMATIC_UPGRADE.md`, `DEPLOYMENT_RUNBOOK.md`, `FUTURE_API_KEY_SETUP.md`, `X2_UPGRADE_CHANGELOG.md`, `X2_RELEASE_REPORT.md`, and final `X3_REQUIREMENTS_AND_BUG_REGISTER.md`.
6. **Slice 6 (Verification, Browser QA, GitHub & Controlled Cloudflare Release):** Run full automated suites + build + secret scan + multi-viewport Playwright E2E QA (`320`–`1440px`, signed-out & synthetic local signed-in journeys) + capture AFTER screenshots; push branch to GitHub; evaluate release gates for Cloudflare build trigger fix (`pnpm run build`), query-string redaction, and authorized production deployment verification.
