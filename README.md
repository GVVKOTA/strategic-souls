<p align="left">
  <img src="public/gvv-approved.jpg" width="96" alt="Global Vertex Vectors (GVV) eclipse logo" />
</p>

# Strategic Souls (SS)

**A calm, source-attributed financial and geopolitical research terminal by Global Vertex Vectors (GVV).**

Strategic Souls combines a focused **Strategic Dashboard**, an enlarged interactive **3D Earth Globe (`Strategic Globe`)**, an official **Economic Calendar** & **Market Vox**, deterministic **Soul Scan** & **Formula Lab** analytics with an immutable **GRAVEYARD** research archive, and a privacy-first **Soul Network (`Soul Feed` · `Chats` · `Rooms`)**.

> **Mission:** "Strategic Souls aims to become a trustworthy, global, source-attributed financial and geopolitical research terminal where people move from market context to testable research, inspect uncertainty, and collaborate responsibly—without fabricated data or unsupported profit claims."

---

## 1. What the Application Actually Does (Three Primary Workspaces)

1. **Global (`frontend/features/global/`)**
   - **Primary scroll (exact 4 blocks in locked order):**
     1. Centered **Strategic Dashboard** title + **strict 8-tile Markets Grid** (`NIFTY 50`, `SENSEX`, `BANK NIFTY`, `NIFTY MIDCAP`, `GOLD`, `SILVER MCX`, `CL`, `USD/INR`; `2×4` on desktop, `2-column` equal-height grid on mobile; `Reorder` modal; neutral `"Data unavailable"` copy when a feed is not yet entitled; separate source `as-of` vs `Checked` timestamps).
     2. Dismissible First-Use Welcome Checklist + highlighted **My Portfolio** card (with vivid color Allocation Donut, clean INR & quantity formatting, single calm funding disclosure, and an independent 8-artwork Portfolio Backdrop Library `p01`–`p08`) beside **Watchlist**.
     3. **ONE enlarged, zoomable 3D `Strategic Globe`** (`1.0×`–`5.0×` true perspective WebGL camera, drag with inertia, pinch/double-tap/keyboard zoom, authentic historical NASA Blue/Black Marble textures, 24 exchange clocks, live USGS M4.5+ earthquakes & NASA EONET natural disasters; **zero 2D geographic map**).
     4. Redesigned **Economic Calendar** at the bottom (official RBI, MoSPI, FOMC, BLS, BEA, EIA, ECB schedules verified through March 2027; IST/UTC/New York timezones; inline skeleton/error/retry states; **zero `HIGH/MEDIUM/LOW` impact badges** and zero synthesized release times).
   - **Top-left three-dot drawer (exact 4 entries):**
     1. `Strategic Dashboard`
     2. `Market Intelligence / Economic Calendar` (internal tabs: `Headlines` | `Calendar` | `Market Vox`)
     3. `Heatmap` (curated NSE sector leaders, neutral-until-connected expandable heatmaps & Asset Comparison)
     4. `Strategic Globe` (immersive focus on the same 3D Earth renderer)

2. **Strategy (`frontend/features/strategy/`)**
   - Two full-width tabs: **Soul Scan** and **Formula Lab** (lazy-loaded Correlation Lab, Black-Scholes-Merton Options/Greeks, Implied Volatility, CAGR, XIRR, Historical Investment).
   - **Default-Ready in 1 Click & One Canonical Deterministic Engine (`backend/engines/scan.ts`):** **Classic** (50 deterministic presets with per-user D1 **Formula Pinning**, prefilled editable Soul name, 8 runs/IST day) and **Advanced** (initialized with a valid editable rule tree, `Rule Builder` / `Discover` / `Draw`, 1 run/rolling 60 min) compile to and evaluate through the same 3-valued AST (`TRUE` / `FALSE` / `UNKNOWN`).
   - Strictly **2 scan sources** (`Watchlist`, `Market` combining NSE + BSE + active MCX futures) and strictly **4 timeframes** (`1 Hour`, `Daily`, `Weekly`, `Monthly` — with genuine completed-session `1h` candles never synthesized from daily bars, and `30m` removed). Simplified **Scan Results** (`Matched` count + matching symbols + smooth scroll on explicit run) and standalone **GRAVEYARD** immediately below with immutable archived scans and one-click `Publish Soul`.

3. **Community — `Soul Network` (`frontend/features/community/`)**
   - Prominent blue `Community` header, compact `"My Profile"` strip, public researcher search by **Body ID** (`@handle`), and **enlarged, discoverable 3-column navigation** (`Soul Feed` · `Chats` with live real unread count badge · `Rooms`) with `28px` top / `22px` bottom separation and keyboard arrow support.
   - **Truthful Soul Post Metrics & Author-Only Insights:** Server-persisted `Likes`, `Comments`, `Saves`, `Shares`, daily-deduplicated `Views` (excluding author self-views), `Try this formula` handoff into Strategy Builder, and strictly **author-only `Post Insights`** (`403` for non-authors, zero viewer identity leaks).
   - **Canonical `PublicProfileSheet`:** Opens from every `@handle` surface and `?view=community&profile=<handle>` deep link with `Tab`/`Shift+Tab` modal focus trapping, independent 8-artwork Profile Cover Banner Library (`b01`–`b08`), 50 SVG avatar presets, `Souls | Followers | Following` drawers, `Share profile` (QR SVG), and `Try this formula`.
   - **Telegram-Like Compact `Chats` (`frontend/features/community/messenger/`):** Mobile full-screen conversation or inbox (`100dvh`, `visualViewport` keyboard sync) and desktop 2-pane layout, compact message bubbles with inline timestamps & server-confirmed read states, contextual message actions (`Edit`, `Retract`, `Copy`, `Report`), monotonic message merging, and cross-thread abort/sequence guards.
   - **Collaborative `Rooms`:** Private or discoverable research rooms, pinned group research (max 3), server-enforced membership/block/consent boundaries, zero private portfolio exposure, and zero public P&L leaderboards.

4. **Account, Profile & Security (`frontend/features/account/`, `backend/auth/`)**
   - Telegram-inspired Settings navigation (`Edit Profile`, `Password & Security`, `Privacy`, `Notifications`, `Active Sessions`, `Preferences`, `Help & Support`, `About Strategic Souls`, `Account & Data`, `Log Out`), selectable Research Focus chips, zero user-visible `"optional"` copy, verified support email (`strategicsoulsgvv@gmail.com`), authenticated password change with session rotation, non-enumerating single-use password reset flow, email change verification, and live **Active Sessions** device list & revocation.

---

## 2. Trust Boundaries & Non-Goals

- **Research & education only:** Strategic Souls is **not** a brokerage, trading platform, execution terminal, or registered investment adviser.
- **Zero order execution & zero guaranteed returns:** The application never places, routes, or automates trades and never claims predictive profit guarantees.
- **No fabricated market data:** Unconnected commercial feeds never display fake prices or `LIVE` badges. Date-only observations (e.g., ECB daily FX reference rates, US Treasury daily yield curves) never receive fabricated wall-clock timestamps. `NULL`/`UNKNOWN` data is never coerced to `0`.

---

## 3. Verified Current Feature Status (`V3.0 RC1`)

| Capability | Status | Verified Details & Boundaries |
| --- | --- | --- |
| **Strategic Dashboard (8-Tile Global Overview)** | **Live (Working)** | Strict 8-tile allowlist (`NIFTY 50`, `SENSEX`, `BANK NIFTY`, `NIFTY MIDCAP`, `GOLD`, `SILVER MCX`, `CL`, `USD/INR`), legacy 9-card D1 reconciliation, highlighted `My Portfolio` & `Watchlist`, enlarged 3D `Strategic Globe`, and bottom `Economic Calendar`. Data connectors and broker vendor names are completely hidden from user UI and public APIs. |
| **My Portfolio & Independent Banner Libraries** | **Live (Working)** | Vivid colored Allocation Donut SVG, clean INR/quantity formatting, single calm funding disclosure, and independent 8-artwork Portfolio Backdrop (`p01`–`p08`) vs Profile Cover (`b01`–`b08`) libraries. |
| **Enlarged Zoomable 3D Earth (`Strategic Globe`)** | **Live (Working)** | Perspective WebGL camera (`1.0×`–`5.0×` zoom), historical NASA Blue/Black Marble textures (SHA-256 verified), 24 exchange clocks, live keyless USGS M4.5+ earthquakes & NASA EONET events, `Set<WebGLBuffer>` cleanup, 15s texture timeout, reduced-quality cloud skip, and `prefers-reduced-motion` / minimal-motion throttling. |
| **Economic Calendar & Market Vox** | **Live (Working)** | Official statutory calendar verified through March 2027 (zero impact badges) + `MARKET VOX` (`NIFTY & Gold community vote`) with server-enforced post-close open / pre-open cutoff (`HTTP 409` outside window) and zero personal scorecards. |
| **Soul Scan (`Watchlist` / `Market`), `1h`–`1mo` & GRAVEYARD** | **Code Complete (Shared Commercial Key Required for Ordinary Live Market Scans)** | Default-ready 1-click Classic (50 presets + D1 Formula Pinning) & Advanced (`Rule Builder`/`Discover`/`Draw`), strictly `Watchlist` & `Market` sources, strictly `1 Hour / Daily / Weekly / Monthly` (`1h` genuine completed-session candles, `30m` removed), simplified Scan Results, standalone `GRAVEYARD`, and signature ember `GO!` feedback. Shared NSE/BSE/MCX commercial provider contract/secret (`X2_TRUEDATA_BEARER_TOKEN` or `X2_EODHD_API_TOKEN`) required before ordinary-user live Market scans are enabled in production. |
| **Soul Network (`Soul Feed` · `Chats` · `Rooms`) & Post Metrics** | **Live (Working)** | Enlarged discoverable 3-tab bar with live `Chats` unread count badge, server-backed `Likes`, `Comments`, `Saves`, `Shares`, daily-deduplicated `Views` (excluding author self-views), `Try this formula` handoff, and strictly author-only `Post Insights` (`403` for non-authors). |
| **Account Security, Password Recovery & Active Sessions** | **Live (Email Delivery Key-Gated)** | Telegram-style Settings, password change with session rotation, non-enumerating single-use password reset & email change verification (`v3_auth_tokens`), live Active Sessions list/revocation (`v3_session_meta`), and verified support contact `strategicsoulsgvv@gmail.com`. Outbound reset/verification email delivery requires `RESEND_API_KEY` or `SS_EMAIL_WEBHOOK_URL`. |
| **Keyless Official Public Feeds** | **Live (Working)** | ECB daily Eurofxref FX (`USD/INR`), US Treasury daily par yields, USGS M4.5+ Earthquake GeoJSON, and NASA EONET v3 natural events. |
| **Shared Commercial Equities & Commodities Feeds** | **Ready (License/Secret Required)** | Fails closed honestly with zero quota charged until a licensed commercial provider secret (`X2_TRUEDATA_BEARER_TOKEN` / `X2_EODHD_API_TOKEN`) and verified `x2_providers` redistribution config are provisioned. Owner-only private broker credentials are strictly isolated and never shared with ordinary users. |
| **Cloudflare R2 Custom Media Uploads** | **Disabled (Account-disabled)** | Fails closed cleanly; 50 built-in SVG avatars (`public/avatars/`) and 16 built-in curated banners (`b01`–`b08` Profile + `p01`–`p08` Portfolio) operate natively without R2. |
| **Optional V3 Local Supabase + Python Quant Stack** | **Optional (Local/CI)** | Python quant suite (`29 / 29` pytest tests in `backend/quant/`) runs locally; local Supabase PostgreSQL RLS stack (`supabase/`) is inactive in production D1 deployment. |

---

## 4. Technology Stack & High-Level Architecture

- **Runtime & Hosting:** Cloudflare Workers (`strategic-souls`, compatibility date `2026-05-15`, `nodejs_compat`) + Cloudflare Workers Static Assets (`dist/client`).
- **App Framework & Bundler:** Vinext (`1.0.0-beta.5`, Next.js App Router compatible RSC/SSR/Client pipeline) on Vite (`8.1.6`) + React (`19.2.9`) + TypeScript (`5.9.3`).
- **Database & ORM:** Cloudflare D1 SQLite (`ss`, binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) + Drizzle ORM (`0.45.2`) with 12 additive SQL migrations (`drizzle/0000`–`0011`) and database-level immutability triggers.
- **Styling:** Tailwind CSS (`4.2.1`) + canonical CSS custom properties (`frontend/styles/globals.css`, `frontend/styles/x51.css`, `frontend/styles/ss-v3.css`) + self-hosted WOFF2 typography (`Space Grotesk`, `Inter`, `IBM Plex Mono`).
- **Verification & Quant:** Node.js native test runner (`350` unit & integration tests across `tests/unit/` and `tests/integration/`), ESLint (`9.39.4`), zero-leak secret scanner (`operations/scripts/scan-secrets.mjs`), and Python `uv` / `pytest` quant package (`backend/quant/`, `29` tests).

See [`operations/docs/V3_MARKET_DATA_COVERAGE_AND_LAUNCH.md`](operations/docs/V3_MARKET_DATA_COVERAGE_AND_LAUNCH.md) for the V3 market-data coverage matrix, 8-tile symbol mapping, Soul Post metrics spec, privacy-safe analytics plan, and 02 January 2027 launch playbook.

**Request Lifecycle:**
`Browser UI (frontend/)` → `Cloudflare Worker Entrypoint & Security Headers (backend/middleware/index.ts)` → `CSRF / PBKDF2 Session Auth / Consent Check (backend/middleware/security.ts, backend/auth/session.ts)` → `App Router Handler (app/api/**/route.ts)` → `Domain Service & Deterministic Engine (backend/services/*, backend/engines/*)` → `Drizzle ORM & Cloudflare D1 (database/*, env.DB)` → `JSON / RSC Response (with X-Request-Id & Server-Timing)`.

See [`operations/docs/REPOSITORY_MAP.md`](operations/docs/REPOSITORY_MAP.md) for the full Mermaid lifecycle diagram and directory ownership matrix.

---

## 5. Repository Layout: Five Primary Ownership Areas & Mandatory Root Exceptions

All first-party domain code, static assets, operational scripts, documentation, and historical archives are organized across **five primary ownership areas**, while framework-, CI-, and tooling-mandated entrypoints remain at the repository root so GitHub Actions, GitHub's homepage README, Vinext/Next route discovery, Vite/Cloudflare static asset serving, Drizzle D1 migrations, and pnpm/TypeScript builds work with zero regressions.

> **Why a physical 5-folder-only root is not forced:** Moving `.github/workflows/` disables GitHub Actions auto-discovery; moving root `README.md` into `operations/` breaks automatic GitHub repository homepage rendering; moving `app/` or `public/` breaks Vinext route discovery and root static asset URLs (`/gvv-approved.jpg`, `/fonts/*`, `/data/earth-*`); moving `drizzle/` or `tests/` breaks 15 D1 integration test harnesses, backup scripts, and relative imports; and moving root manifests (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`) breaks `pnpm`, `tsc`, `eslint`, and Cloudflare Workers Builds.

### Tracked Repository Tree (Matches `git ls-files` — 557 Tracked Files)

```text
strategic-souls/
├── frontend/                       [Area 1: Frontend UI — 127 files]
│   ├── README.md                     Area guide: what belongs here, entrypoints, verification
│   ├── components/
│   │   ├── ui/                       Vendored shadcn/ui accessible primitives (56 files)
│   │   └── workspace/                App shell (workspace.tsx), 4-item global-menu.ts, eclipse-intro.tsx,
│   │                                 universal-search.tsx, private-ticker.tsx, shared.tsx, motion.css
│   ├── features/
│   │   ├── account/                  settings-view.tsx, account-quick-panel.tsx, avatar-studio.tsx, avatar-badge.tsx
│   │   ├── auth/                     auth-panel.tsx (standalone D1 email/password + optional Google OAuth)
│   │   ├── community/                research-network-shell.tsx, public-profile-sheet.tsx, social-workspace.tsx,
│   │   │   └── messenger/            chat-inbox.tsx, chat-header.tsx, conversation-view.tsx, message-bubble.tsx,
│   │   │                             chat-composer.tsx, types.ts, messenger.css
│   │   ├── global/                   dashboard.tsx, market-grid.tsx, strategic-globe.tsx, globe-canvas.tsx,
│   │   │                             economic-calendar.tsx, daily-pulse.tsx, market-intelligence.tsx,
│   │   │                             sector-explorer.tsx, portfolio-allocation.tsx, asset-terminal.tsx
│   │   ├── legacy/                   Retained /legacy research workspace
│   │   ├── strategy/                 workspace.tsx, controls.tsx, evidence-charts.tsx, formula-lab.tsx,
│   │   │                             draw-canvas.tsx, research.css, scanner-x54.css
│   │   └── v3/                       Optional V3 preview workspace
│   ├── hooks/                        use-mobile.ts
│   ├── lib/                          qr-svg.ts (self-contained QR SVG encoder)
│   └── styles/                       Canonical 6-color tokens (globals.css), x51.css, x1.css, x2.css, v3.css
│
├── backend/                        [Area 2: Server Auth, Engines & Services — 76 files]
│   ├── README.md                     Area guide: what belongs here, entrypoints, verification
│   ├── auth/                         session.ts (PBKDF2-SHA256 D1 auth, session rotation, optional Google OAuth)
│   ├── engines/                      scan.ts (canonical Soul Scan AST), evidence-stats.ts, backtest.ts,
│   │                                 math.ts, analytics.ts, portfolio.ts, soul-genome.ts, pattern-draw.ts
│   ├── integrations/                 tradingview.ts (allowlisted widget helpers)
│   ├── middleware/                   index.ts (Cloudflare Worker entrypoint & observability), security.ts (CSRF/guards)
│   ├── quant/                        Optional Python quant package (pyproject.toml, uv.lock, souls_quant/, tests/)
│   └── services/
│       ├── community/                research-network.ts, social.ts, community.ts
│       ├── earth/                    conflicts.ts, locations.ts
│       ├── intelligence/             news-and-disasters.ts (USGS M4.5+, NASA EONET, Marketaux entity mapper)
│       ├── legacy/                   Retained legacy notebook services
│       ├── market-data/              providers.ts (validation & entitlement contracts), market-data.ts,
│       │   │                         nine-card-markets.ts, daily-pulse.ts, economic-calendar.ts,
│       │   │                         exchanges.ts, globe.ts, sectors-and-ecosystem.ts, instrument-registry.ts
│       │   └── angelone/             Owner-gated read-only Angel One SmartAPI adapter & loopback server
│       ├── profile/                  profile.ts, avatar-presets.ts, banner-presets.ts
│       ├── research/                 classic-presets.ts (50 presets), discover-parser.ts, scan-quota.ts,
│       │                             research.ts, scan-projection.ts, workspace.ts
│       ├── user/                     preferences-store.ts
│       └── v3/                       Optional V3 Supabase/quant service layer
│
├── database/                       [Area 3: Cloudflare D1 Drizzle Schemas & Queries — 12 files]
│   ├── README.md                     Area guide: schemas, query helpers, migration rules
│   ├── queries/                      repository.ts, notebook-repository.ts
│   └── schemas/                      index.ts (getDb), schema.ts, x1-workspace.ts, x1-community.ts,
│                                     x2-data.ts, x2-social.ts, x51-research-network.ts, x52-intelligence.ts, profile.ts
│
├── public/                         [Area 4: Static Assets Served at / — 74 files]
│   ├── README.md                     Area guide: public URL contracts & SHA-256 asset provenance
│   ├── gvv-approved.jpg              Approved GVV eclipse logo mark
│   ├── favicon-x1.svg, favicon.svg   Application favicons
│   ├── avatars/                      50 researcher SVG avatars (a01.svg–a50.svg)
│   ├── data/                         NASA Blue/Black Marble textures (earth-day.jpg, earth-night.jpg,
│   │                                 earth-clouds.jpg, earth-static.jpg), land-110m.json, earth-assets.json
│   ├── downloads/                    Audited public offline reference files
│   └── fonts/                        Self-hosted Space Grotesk, Inter & IBM Plex Mono WOFF2 + SIL OFL licenses
│
├── operations/                     [Area 5: Docs, Scripts, Reports, Examples & Archive — 143 files]
│   ├── README.md                     Area guide: scripts, docs, reports, and archive governance
│   ├── docs/                         Active documentation (35 files): README.md, REPOSITORY_MAP.md,
│   │   │                             ARCHITECTURE.md, DEVELOPER_GUIDE.md, DEPLOYMENT_RUNBOOK.md,
│   │   │                             PROVIDER_INTEGRATION_READINESS.md, MARKET_DATA_*.md, FUTURE_API_KEY_SETUP.md,
│   │   │                             X5_5_THREE_PHASE_AUDIT_RELEASE.md, X5_4_SOCIAL_INTERFACE_AUDIT_AND_RELEASE.md,
│   │   │                             X5_3_RELEASE_NOTES.md, X5_3_EXECUTION_REPORT.md
│   │   ├── data-rights/              GLOBE_ASSET_RIGHTS_X1.md, X2_MARKET_PROVIDER_MATRIX.md
│   │   ├── product/                  X2_PROBABILITY_AND_GRAVEYARD_SPEC.md, X2_SCAN_AND_GRAVEYARD_SPEC.md
│   │   ├── security/                 X2_COMMUNITY_SECURITY.md
│   │   ├── setup/                    X2_DATA_SETUP.md
│   │   ├── v3/                       Optional V3 architecture, runbook, quant methodology & compliance docs
│   │   └── visual/                   STRATEGIC_SOULS_CINEMATIC_UPGRADE.md
│   ├── scripts/                      29 development, build, preview, verification, secret-scan & backup scripts
│   ├── reports/                      SS_REORGANIZATION_MANIFEST.json (machine-readable inventory & SHA-256 ledger)
│   ├── examples/                     Reference D1 example route & schema (2 files)
│   └── archive/                      Consolidated historical archive (73 files) + reversible restore ledger (README.md)
│       ├── README.md                 Historical archive manifest & git mv restore instructions
│       ├── docs/                     Archived pre-X1 (15), X1 (23), X2 (21), X3 (3), X4 (5) & status ledgers (3)
│       └── frontend/                 Retired X5.2 2D MapLibre world-conflict-map.tsx & earth-map.css (2 files)
│
│   ── Mandatory Framework, CI & Tooling Root Exceptions ──
├── app/                            Vinext / Next.js App Router pages & 27 /api/* route handlers (37 files)
├── drizzle/                        Applied chronological Cloudflare D1 SQL migrations 0000–0009 (18 files — immutable!)
├── tests/                          Automated Node.js test suites: tests/unit/ (22) & tests/integration/ (17) (39 files)
├── .github/workflows/              GitHub Actions CI: verify.yml (push/PR) & verify-v3.yml (manual) (2 files)
├── scripts/                        Managed CI installer shim: scripts/install-pnpm.sh (1 file)
├── supabase/                       Optional V3 local Supabase CLI config, OTP template & Postgres migrations (9 files)
└── (19 root config & doc files)    README.md, AGENTS.md, SOURCE_PROVENANCE.json, package.json, pnpm-lock.yaml,
                                    pnpm-workspace.yaml, .npmrc, tsconfig.json, vite.config.ts, next.config.ts,
                                    postcss.config.mjs, eslint.config.mjs, drizzle.config.ts, components.json,
                                    cloudflare-env.d.ts, .gitignore, .gitattributes, .env.example, .dev.vars.example
```

Area guides: [`frontend/README.md`](frontend/README.md) · [`backend/README.md`](backend/README.md) · [`database/README.md`](database/README.md) · [`public/README.md`](public/README.md) · [`operations/README.md`](operations/README.md) · [`operations/docs/README.md`](operations/docs/README.md) · [`operations/docs/REPOSITORY_MAP.md`](operations/docs/REPOSITORY_MAP.md) · [`operations/archive/README.md`](operations/archive/README.md)

---

## 6. Newcomer Guide: "Where Do I Edit X?"

| If You Want to Edit or Inspect... | Primary Path(s) | Critical Invariants & Guardrails |
| --- | --- | --- |
| **Global 4-block layout & market cards** | `frontend/features/global/dashboard.tsx`, `market-grid.tsx`, `backend/services/market-data/nine-card-markets.ts` | Keep exact 4-block order; preserve date-only timestamp precision; no 2D map. |
| **Global 4-item three-dot menu & shell** | `frontend/components/workspace/global-menu.ts`, `workspace.tsx` | Locked 4-entry menu contract (`tests/unit/x53-terminal-globe-evidence.test.mjs`). |
| **3D Strategic Globe & camera/shader math** | `frontend/features/global/strategic-globe.tsx`, `globe-canvas.tsx`, `backend/services/market-data/globe.ts`, `public/data/earth-assets.json` | Perspective zoom `1.0×`–`5.0×`; preserve NASA SHA-256 asset hashes (`tests/unit/x1-globe.test.mjs`). |
| **Economic Calendar & Market Vox polls** | `frontend/features/global/economic-calendar.tsx`, `daily-pulse.tsx`, `backend/services/market-data/economic-calendar.ts`, `daily-pulse.ts`, `app/api/polls/route.ts` | Zero `HIGH/MEDIUM/LOW` impact badges; never synthesize missing release times; enforce `opensAtUtc <= now < closesAtUtc` server-side. |
| **Authentication, sessions, CSRF & headers** | `backend/auth/session.ts`, `backend/middleware/index.ts`, `backend/middleware/security.ts`, `app/api/auth/[...action]/route.ts` | Standalone D1 `PBKDF2-SHA256` + hashed `HttpOnly` cookies; preserve `X-Request-Id` & `Server-Timing`; never log query strings or PII. |
| **Soul Scan engine, presets & quotas** | `backend/engines/scan.ts`, `backend/services/research/classic-presets.ts`, `discover-parser.ts`, `scan-quota.ts`, `research.ts`, `frontend/features/strategy/workspace.tsx` | All scan modes must compile to the single canonical AST (`scan.ts`); Soul name starts blank; standalone `GRAVEYARD` heading has zero subtitle. |
| **Evidence & Probability statistics** | `backend/engines/evidence-stats.ts`, `backtest.ts`, `frontend/features/strategy/evidence-charts.tsx`, `controls.tsx` | Display `Insufficient verified observations` when sample gates fail; never fabricate win rates. |
| **Formula Lab & quant calculations** | `frontend/features/strategy/formula-lab.tsx`, `backend/engines/math.ts`, `backend/engines/analytics.ts`, `backend/quant/` | Returns-based Pearson correlation, deterministic BSM/Greeks/IV/CAGR/XIRR. |
| **Community (`Soul Feed`, `Chats`, `Rooms`, Profiles)** | `frontend/features/community/research-network-shell.tsx`, `public-profile-sheet.tsx`, `messenger/*`, `dashboard.tsx`, `backend/services/community/research-network.ts`, `social.ts`, `community.ts`, `backend/services/profile/profile.ts` | Enforce O(1) `getAuthorizedWebSoulById`, block/consent isolation, `Tab` modal focus trap, and monotonic message merging; never expose private portfolios or emails. |
| **Market-data validation & entitlement contracts** | `backend/services/market-data/providers.ts`, `angelone/`, `operations/docs/PROVIDER_INTEGRATION_READINESS.md` | Fail-closed redistribution checks (`HTTP 200 != redistribution`); broker data is strictly owner-only. |
| **D1 database schemas & migrations** | `database/schemas/*`, `database/queries/*`, `drizzle/` | Additive migrations only; **never** edit, reorder, or delete applied `drizzle/0000`–`0009`. |
| **UI styles & canonical color tokens** | `frontend/styles/globals.css`, `frontend/styles/x51.css` | **Never** modify the 6 canonical text color hex tokens in `globals.css` (`tests/unit/x1-palette.test.mjs`). |
| **CI workflows & verification scripts** | `.github/workflows/verify.yml`, `verify-v3.yml`, `operations/scripts/check-x2-release.mjs`, `scan-secrets.mjs` | Keep `.github/workflows/` at root for native GitHub Actions discovery. |
| **Cloudflare Worker build & deployment config** | `vite.config.ts`, `operations/scripts/run-framework.mjs`, `operations/docs/DEPLOYMENT_RUNBOOK.md` | Preserve Worker `strategic-souls` and D1 binding `DB` (`ss`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`). |
| **Active documentation vs. archived history** | `operations/docs/README.md`, `operations/docs/REPOSITORY_MAP.md`, `operations/archive/README.md` | Keep active guides in `operations/docs/`; archive superseded reports in `operations/archive/` via `git mv`. |

---

## 7. Local Development Setup (Windows PowerShell / VS Code / Linux / macOS)

- **Supported Toolchain Versions:**
  - **Node.js:** `>= 22.13.0` (verified on `v22.16.0` / `v24.x` / `v26.13.1`)
  - **Package Manager:** `pnpm@11.25.0` (declared in `package.json` `packageManager`)
  - **Python Quant (Optional):** Python `>= 3.12` + `uv` (verified on `uv 0.13.9`)
- **Zero `.env` or commercial API keys required:** Local preview compiles the Worker, applies all 10 D1 migrations (`drizzle/0000`–`0009`) to an **isolated local SQLite database** under `.wrangler/local-preview/`, and runs real standalone email/password signup & sign-in locally. It **never** connects to production Cloudflare D1.

```powershell
# 1. Install locked dependencies (use pnpm.cmd on Windows PowerShell if script execution policy is Restricted)
pnpm.cmd install --frozen-lockfile

# 2. Build the Worker, apply local D1 migrations (0000–0009), and launch local preview
node operations/scripts/local-preview.mjs launch
# Open http://127.0.0.1:5173 in your browser (press Ctrl+C to stop both owned processes)
```

---

## 8. Test, Verification & Security Commands

| Verification Gate | Exact Command | What It Verifies |
| --- | --- | --- |
| **Full Release Gate (`typecheck` + `lint` + `test`)** | `node operations/scripts/check-x2-release.mjs` | Runs `tsc --noEmit`, `eslint app frontend backend database`, and all `333` Node unit/integration tests. |
| **TypeScript Typecheck Only** | `npm.cmd run typecheck` | Verifies strict TypeScript compilation (`tsc --noEmit`). |
| **Application ESLint Only** | `npm.cmd run lint:app` | Lints `app/`, `frontend/`, `backend/`, and `database/`. |
| **Node Unit & Integration Tests Only** | `npm.cmd test` | Executes all `333` tests across `tests/unit/*.test.mjs` and `tests/integration/*.test.mjs`. |
| **Production Cloudflare Worker Build** | `npm.cmd run build` (or `node operations/scripts/run-framework.mjs build`) | Builds all 5 Vinext environments and generates `dist/server/wrangler.json` + `dist/client/`. |
| **Zero-Leak Secret & Bundle Scanner** | `node operations/scripts/scan-secrets.mjs` | Scans all tracked files, staged git diffs, and built `dist/` bundles for credential literals and local secret values. |
| **Source Hygiene Scanner** | `node operations/scripts/scan-v3-source.mjs` | Pattern-scans tracked and non-ignored source files. |
| **Optional Python Quant Test Suite** | `npm.cmd run test:quant` (or `uv run --project backend/quant pytest backend/quant/tests -q`) | Runs all `29` pytest tests for the DuckDB/NumPy quant package. |
| **Dependency Vulnerability Audit** | `pnpm.cmd audit --audit-level high` | Audits locked dependencies for high/critical advisories. |
| **Whitespace & Diff Hygiene** | `git diff --check` | Checks for conflict markers or trailing whitespace errors. |

### Secret-Handling Rules
- **Never commit `.env`, `.dev.vars`, `.secrets/*`, API tokens, session cookies, or private database dumps.**
- Production secrets belong exclusively in **Cloudflare Worker Secrets**.
- Owner-only local Angel One broker credentials belong exclusively in gitignored `.secrets/angelone.env` (never in Worker secrets or `.dev.vars`).

---

## 9. Financial Data Licensing, Entitlements & Attribution

- **Keyless official public feeds (active):**
  - **European Central Bank (ECB):** Daily Eurofxref reference exchange rates (date-only precision preserved).
  - **U.S. Department of the Treasury:** Daily Treasury Par Yield Curve rates (date-only precision preserved).
  - **U.S. Geological Survey (USGS):** Real-time M4.5+ Earthquake GeoJSON feed.
  - **NASA Earth Observatory Natural Event Tracker (EONET v3):** Active natural hazard events.
  - **NASA Visible Earth / Goddard Space Flight Center:** Historical Blue Marble Next Generation (2004) & Black Marble (2016) textures (`public/data/`, attribution in [`operations/docs/data-rights/GLOBE_ASSET_RIGHTS_X1.md`](operations/docs/data-rights/GLOBE_ASSET_RIGHTS_X1.md)).
- **Commercial & exchange data licensing boundary:**
  - Technical API access (`HTTP 200`) **does not** grant public web-display, derived-display, caching, or redistribution rights.
  - `evaluateFeedEntitlement` (`backend/services/market-data/providers.ts`) fails closed whenever public display rights or redistribution licenses are absent or expired.
  - Retail broker APIs (such as Angel One SmartAPI) are strictly restricted to authenticated owner-only private inspection and are **never** redistributed to public visitors. See [`operations/docs/PROVIDER_INTEGRATION_READINESS.md`](operations/docs/PROVIDER_INTEGRATION_READINESS.md) and [`operations/docs/MARKET_DATA_LICENSES.md`](operations/docs/MARKET_DATA_LICENSES.md).

---

## 10. Deployment & Rollback Overview

- **Production Cloudflare Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)
- **Production Cloudflare D1 Database:** `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, applied migrations `0000`–`0009`)
- **CI & Deployment Pipeline:**
  - Every push and pull request runs `.github/workflows/verify.yml` (`pnpm install --frozen-lockfile` → `npm run verify` → `npm run build` → `node operations/scripts/scan-secrets.mjs`).
  - Cloudflare Workers Builds deploys from `main` on `GVVKOTA/strategic-souls`.
  - **Safety rules:** Never create a replacement Worker or reset D1 `ss`. Always confirm `dist/server/wrangler.json` bindings before release and verify `GET /api/release` (`"release": "X5.5"`) after release.
- **Instant `< 1 Minute` Rollback:** Because `X5.5` introduces zero destructive D1 migrations, Worker rollback is immediate via Cloudflare Dashboard (**Workers & Pages → `strategic-souls` → Deployments → Rollback**) or `npx wrangler rollback --name strategic-souls`. Full instructions live in [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md).

---

## 11. Known Limitations & External Dependencies

1. **Commercial live quotes & newswires not connected:** Public NSE/BSE/MCX and global equity/commodity live quotes (`SS_GLOBAL_QUOTES_API_KEY`), third-party financial news (`SS_NEWS_API_KEY`), and armed-conflict event feeds (`UCDP_ACCESS_TOKEN`) remain fail-closed (`RESTRICTED` / `NOT_CONNECTED`) until commercial display agreements and keys are provisioned.
2. **Economic Calendar schedule horizon:** Statutory schedules are currently verified through **March 2027** and require periodic schedule updates as central banks publish future calendars.
3. **Cloudflare R2 custom media uploads disabled (`403 code 10042`):** Custom binary avatar/banner uploads remain gated at the Cloudflare account level; all 50 built-in SVG avatars and 8 Obsidian banners work without R2.
4. **Google OAuth & payments dormant:** Email/password D1 authentication is active; Google OAuth remains dormant until client credentials are configured, and zero billing/payment/ad SDKs are installed.
5. **Retained unused `maplibre-gl` lockfile entry:** `maplibre-gl` remains in `package.json` / `pnpm-lock.yaml` to avoid lockfile churn; zero MapLibre code is imported or bundled in the active application (`tests/unit/x53-terminal-globe-evidence.test.mjs`).

---

## 12. Contributing & Documentation Index

- [`AGENTS.md`](AGENTS.md) — Engineering governance, canonical 6-color text palette, motion/evidence invariants, and archive policy
- [`operations/README.md`](operations/README.md) — Operations area guide (scripts, reports, docs, archive)
- [`operations/docs/README.md`](operations/docs/README.md) — Full active documentation index
- [`operations/docs/REPOSITORY_MAP.md`](operations/docs/REPOSITORY_MAP.md) — Path ownership matrix, root-exception proofs & Mermaid request lifecycle diagram
- [`operations/docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md`](operations/docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md) — Verified `X5.5` release audit, defect register, bundle metrics, D1 query plans & 333-test verification ledger
- [`operations/docs/X5_4_SOCIAL_INTERFACE_AUDIT_AND_RELEASE.md`](operations/docs/X5_4_SOCIAL_INTERFACE_AUDIT_AND_RELEASE.md) — `X5.4` canonical `PublicProfileSheet`, Telegram-like `Chats` & Soul Scanner audit
- [`operations/docs/X5_3_RELEASE_NOTES.md`](operations/docs/X5_3_RELEASE_NOTES.md) & [`operations/docs/X5_3_EXECUTION_REPORT.md`](operations/docs/X5_3_EXECUTION_REPORT.md) — `X5.3` focused 4-block Global terminal & 3D perspective Globe release documentation
- [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md) — Safe Cloudflare Workers Builds & rollback runbook
- [`operations/archive/README.md`](operations/archive/README.md) — Consolidated historical archive & reversible `git mv` restore ledger

> [!IMPORTANT]
> **Disclaimer:** Strategic Souls is strictly for financial education and quantitative research. It is not a registered investment adviser or brokerage, does not execute trades, and makes no guarantee of financial performance.
