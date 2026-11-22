<p align="left">
  <img src="public/gvv-approved.jpg" width="96" alt="Global Vertex Vectors (GVV) eclipse logo" />
</p>

# Strategic Souls (SS)

**A calm, source-backed financial and geopolitical research terminal.**

Strategic Souls is an educational financial-market research workspace built by **Global Vertex Vectors (GVV)** combining a focused **Strategic Dashboard**, an enlarged interactive **3D Earth Globe**, an official **Economic Calendar**, deterministic **Soul Scan** & **Formula Lab** analytics, and a privacy-first **Community Research Network**. It is **not** a brokerage, order-execution terminal, or guaranteed-return system.

> **Final Goal:** "Strategic Souls aims to become a trustworthy, global, source-attributed financial and geopolitical research terminal where people move from market context to testable research, inspect uncertainty, and collaborate responsibly—without fabricated data or unsupported profit claims."

---

## Current Release Status (`X5.3` — The Focused Intelligence Terminal)

| Capability | Status | Details & Boundaries |
| --- | --- | --- |
| **Strategic Dashboard (4-Block Global Overview)** | **Live** | Centered `Strategic Dashboard` title + 9 customizable market cards (3×3), compact `My Portfolio` & `Watchlist`, enlarged 3D `Strategic Globe`, and redesigned `Economic Calendar`. |
| **Enlarged Zoomable 3D Earth (`Strategic Globe`)** | **Live** | True perspective WebGL camera (`1.0×`–`5.0×` zoom), drag with inertia, two-finger touch pinch, double-tap zoom, keyboard controls, NASA Blue/Black Marble historical textures, 24 exchange hubs, live USGS M4.5+ earthquakes & NASA EONET natural disasters. **Zero 2D geographical map in Global.** |
| **Economic Calendar & Market Vox** | **Live** | Redesigned timeline calendar (RBI, MoSPI, FOMC, BLS, BEA, EIA, ECB; IST/UTC/New York; verified through Mar 2027; zero impact badges) + `MARKET VOX` (`NIFTY & Gold community vote`) with server-enforced post-close open and pre-open cutoffs under `Market Intelligence / Economic Calendar`. |
| **Soul Scan, Formula Lab, Evidence & Graveyard** | **Live** | Classic (50 presets) & Advanced (Discover/Build/Draw) compiling to one deterministic AST, Formula Lab (Correlation Lab first, BSM/IV, CAGR, XIRR, Historical), compact results with collapsed-by-default match accordions, prominent `GRAVEYARD` archive, and honest SVG coverage/probability charts. |
| **Community Research Network** | **Live** | Standalone Cloudflare D1 email/password auth (optional Google OAuth), Body IDs (`@handle`), shared Souls, private/discoverable groups, opt-in DMs, moderation, zero public P&L leaderboards. |
| **Commercial News (`SS_NEWS_API_KEY`) & Global/NSE Quotes** | **Key-gated** | Adapters built and tested; display honest pending states + primary official agency portals until commercial keys & display licenses are configured in Cloudflare Worker Secrets. |
| **Owner-Only Angel One SmartAPI** | **Owner-gated** | Read-only owner gateway (`ENABLE_PRIVATE_BROKER_DATA`), requires founder credentials + static-IP egress relay; never redistributed publicly. |
| **Cloudflare R2 Custom Media Uploads** | **Account-disabled** | Fails closed (`403 code 10042` on Cloudflare account); 50 SVG avatars & 8 Obsidian portfolio backdrops work locally without R2. |

---

## The Three Primary Workspaces

1. **Global**
   - **Primary scroll (exact 4 blocks):** Centered **Strategic Dashboard** + **9 customizable market cards** (date-only source precision preserved) → compact **My Portfolio & Watchlist** summary (opens dedicated Portfolio ledger/allocation donut & Watchlists screens) → **ONE enlarged, zoomable 3D Strategic Globe** (direct 3D markers for exchanges, USGS earthquakes, NASA EONET disasters, countries, and configured conflicts; on-demand Explore/Briefing/Layers/Info overlays) → **Redesigned Economic Calendar** at the bottom.
   - **Top-left three-dot menu (exact 4 entries):**
     1. `Strategic Dashboard`
     2. `Market Intelligence / Economic Calendar` (compact internal tabs: `Headlines` | `Calendar` | `Market Vox`)
     3. `Heatmap` (curated NSE sector leaders, neutral-until-connected expandable heatmaps & Asset Comparison)
     4. `Strategic Globe` (immersive focus on the same 3D Earth renderer)
2. **Strategy**
   - Two full-width tabs: **Soul Scan** (`Classic` 50 deterministic presets · 8 runs/IST day; `Advanced` `Discover` / `Build` / `Draw` · 1 run/rolling 60 min) and **Formula Lab** (Correlation Lab, Options/Greeks, Implied Volatility, CAGR, XIRR, Historical Investment).
   - Compact scan results (`Matched / Evaluated / Failed / Unknown`), stacked SVG coverage bar, collapsed-by-default match rows, honest **Evidence & Probability** charts (`Insufficient verified observations` whenever sample gates are unmet), and a prominent **GRAVEYARD** immutable scan archive.
3. **Community**
   - Body IDs (`@handle`), QR profile cards, research Souls with server-validated redaction previews, pinned group research (max 3), opt-in discovery, blocking/reporting, and strict privacy boundaries (no private portfolio leaks, no personal win-rate scorecards).

---

## Five Ownership Areas & Mandatory Root Exceptions

```text
strategic-souls/
├── frontend/     1. UI workspaces (Global, Strategy, Community), shared shell, hooks, styles
├── backend/      2. Auth, security middleware, quant/scan/evidence engines, market & hazard adapters
├── database/     3. Cloudflare D1 Drizzle ORM schemas & server query helpers
├── public/       4. Approved GVV logo, self-hosted WOFF2 fonts, 50 avatars, NASA Earth textures
├── operations/   5. Active docs, deployment runbooks, verification scripts, examples & ONE archive/
│   ├── docs/        Active architecture, readiness, runbooks, X5.3 release & execution reports
│   ├── scripts/     Local preview, verification, secret scan, build & backup scripts
│   └── archive/     Single archive for verified obsolete files + archive manifest (README.md)
│
│   Mandatory Framework & Tooling Root Exceptions (keep at root for automatic discovery):
├── app/          Next.js / Vinext page routes and /api/* handlers
├── drizzle/      Applied chronological Cloudflare D1 SQL migrations (0000–0009 — immutable!)
├── tests/        Automated Node.js unit and integration test suites
├── .github/      GitHub Actions CI workflows (verify.yml, verify-v3.yml)
├── scripts/      CI pnpm installer hook referenced by package.json
├── supabase/     Optional separate V3 local PostgreSQL + RLS stack (inactive by default)
└── (root files)  README.md, AGENTS.md, package.json, pnpm-lock.yaml, tsconfig.json, vite.config.ts, etc.
```

Area guides: [`frontend/README.md`](frontend/README.md) · [`backend/README.md`](backend/README.md) · [`database/README.md`](database/README.md) · [`public/README.md`](public/README.md) · [`operations/docs/README.md`](operations/docs/README.md) · [`operations/archive/README.md`](operations/archive/README.md)

---

## Where Do I Edit?

| Task | Primary Path | Key Notes |
| --- | --- | --- |
| **Global 4-block layout & focused views** | `frontend/features/global/dashboard.tsx`, `market-grid.tsx` | Preserve exact 4-block Dashboard order; no 2D map. |
| **Global 4-item three-dot menu & shell** | `frontend/components/workspace/global-menu.ts`, `workspace.tsx` | Locked 4-entry contract; avoid remounting `<Global>`. |
| **3D Strategic Globe & camera zoom** | `frontend/features/global/strategic-globe.tsx`, `globe-canvas.tsx`, `backend/services/market-data/globe.ts` | Perspective zoom `1.0×`–`5.0×`; preserve NASA SHA-256 provenance. |
| **Economic Calendar** | `frontend/features/global/economic-calendar.tsx`, `backend/services/market-data/economic-calendar.ts` | Zero `HIGH/MEDIUM/LOW` impact UI; never synthesize release times. |
| **Market Vox (NIFTY & Gold polls)** | `frontend/features/global/daily-pulse.tsx`, `backend/services/market-data/daily-pulse.ts`, `app/api/polls/route.ts` | Enforces `opensAtUtc <= now < closesAtUtc` server-side; zero personal scorecards. |
| **Strategy, Graveyard & Evidence charts** | `frontend/features/strategy/workspace.tsx`, `controls.tsx`, `evidence-charts.tsx`, `backend/engines/evidence-stats.ts` | One canonical AST (`backend/engines/scan.ts`); never fake probabilities. |
| **Formula Lab & Quant Analytics** | `frontend/features/strategy/formula-lab.tsx`, `backend/engines/analytics.ts`, `backend/engines/math.ts` | Returns-based Pearson correlation, deterministic BSM/IV/CAGR/XIRR. |
| **Community & Profiles** | `frontend/features/community/`, `backend/services/community/`, `backend/services/profile/` | Server-enforced membership/privacy checks; zero portfolio exposure. |
| **Auth, CSRF & Security** | `backend/auth/session.ts`, `backend/middleware/` | Standalone D1 PBKDF2-SHA256 + `HttpOnly` hashed cookies; optional Google OAuth. |
| **API Routes** | `app/api/` | Keep thin; delegate validation and storage to `backend/`. |
| **Database Schemas & Migrations** | `database/schemas/`, `drizzle/` | Additive migrations only; **never** edit applied `0000`–`0009`. |
| **Styles & Canonical Colors** | `frontend/styles/x51.css`, `frontend/styles/globals.css` | **Never** modify the 6 canonical hex tokens in `globals.css`. |

---

## Local Setup & Commands (Windows PowerShell / VS Code)

- **Prerequisites:** Git, Node.js `>= 22.13.0`, `pnpm@11.25.0` (declared in `package.json`), optional `uv` for Python quant tests.
- **No `.env` file or commercial API keys are required to run locally.** Local preview uses an isolated `.wrangler/local-preview/` SQLite D1 database and never touches production D1.

```powershell
# 1. Install dependencies (PowerShell ExecutionPolicy-safe)
pnpm.cmd install --frozen-lockfile

# 2. Build, apply local D1 migrations (0000–0009), and serve locally
node operations/scripts/local-preview.mjs launch
# Open http://127.0.0.1:5173 (press Ctrl+C to stop)
```

| Purpose | Command |
| --- | --- |
| **Full TypeScript + ESLint + Node tests** | `node operations/scripts/check-x2-release.mjs` |
| **Production Cloudflare Worker build** | `node operations/scripts/run-framework.mjs build` |
| **Secret leak scan** | `node operations/scripts/scan-secrets.mjs` |
| **Source hygiene scan** | `node operations/scripts/scan-v3-source.mjs` |
| **Optional Python quant tests (29 tests)** | `uv run --project backend/quant pytest backend/quant/tests -q` |
| **Local preview (setup / serve)** | `node operations/scripts/local-preview.mjs setup` / `serve` |

---

## Provider Integration & Data Rights

- **Connected keyless official public feeds:** ECB daily Eurofxref FX, US Treasury daily par yields, USGS M4.5+ Earthquake GeoJSON, NASA EONET v3 natural events, NASA Blue/Black Marble historical textures (bundled locally).
- **Key-gated / commercial adapters (fail closed until provisioned in Cloudflare Worker Secrets):** `SS_NEWS_API_KEY` (Marketaux financial headlines), `SS_GLOBAL_QUOTES_API_KEY` (global indices/commodities), `UCDP_ACCESS_TOKEN` (armed conflict markers), owner-only Angel One SmartAPI (`ANGELONE_*` + static-IP relay), and Cloudflare R2 (`MEDIA_BUCKET`, currently account-disabled).
- Commercial equity/index redistribution requires licensed display rights; retail broker credentials are strictly owner-only and never redistributed to public visitors. See [`operations/docs/PROVIDER_INTEGRATION_READINESS.md`](operations/docs/PROVIDER_INTEGRATION_READINESS.md).

---

## Cloudflare Deployment Topology

- **Production Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)
- **Production D1 Database:** `ss` (binding `DB`, applied migrations `0000`–`0009`)
- **Deploy Pipeline:** Cloudflare Workers Builds watches `main` on `GVVKOTA/strategic-souls`. Feature branches run GitHub Actions CI only. Never create a replacement Worker or reset D1; verify `dist/server/wrangler.json` bindings, rollback version provenance, and live HTTP smoke checks after every release. See [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md).

---

## Security, Privacy & Accessibility

- Standalone D1 authentication (`PBKDF2-SHA256`, SHA-256 hashed `HttpOnly` cookies, CSRF protection, rate limiting, server-side consent & ownership checks).
- Explicit source timestamps (date-only preserved without synthetic wall-clock times), strict separation between verified observations, macro hypotheses, and simulated CSV datasets.
- Zero order execution, zero payments/ads, zero public P&L leaderboards or personal prediction scorecards.
- Keyboard-accessible controls, `prefers-reduced-motion` support, Eclipse Intro safety contract (`<= 1050ms`), and WCAG AA contrast tokens preserved in `frontend/styles/globals.css`.

---

## Known Limitations & Roadmap

- Public NSE/BSE and global equity/commodity live quotes remain `RESTRICTED` / `NOT_CONNECTED` until commercial web-display feeds are licensed and provisioned.
- Third-party live newswire headlines remain pending `SS_NEWS_API_KEY` (primary official agency press portals remain accessible).
- Economic Calendar official statutory schedules are currently verified through **March 2027** and require periodic schedule verification updates.
- Custom photo/backdrop uploads remain gated until Cloudflare R2 is enabled on the account.
- Optional `maplibre-gl` remains in `package.json` lockfile until a dedicated dependency-prune PR cleans lockfile hashes without disturbing frozen-lockfile CI; zero MapLibre code is imported or bundled in Global.

---

## Contributing & Documentation Index

- [`AGENTS.md`](AGENTS.md) — Engineering governance, palette/motion/evidence invariants, and archive policy
- [`operations/docs/README.md`](operations/docs/README.md) — Full documentation index (active X5.3 guides & archived history)
- [`operations/docs/X5_3_RELEASE_NOTES.md`](operations/docs/X5_3_RELEASE_NOTES.md) — X5.3 features, bug fixes & provider status
- [`operations/docs/X5_3_EXECUTION_REPORT.md`](operations/docs/X5_3_EXECUTION_REPORT.md) — Verified test results, visual QA & production deployment proof
- [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md) — Safe Cloudflare Workers Builds & rollback runbook

---

## Verifiable X5.3 Release Evidence

Full executed command logs, Node + Python test pass counts, multi-viewport visual QA screenshots (`320px`–`1440px`), build SHA, and live Cloudflare Worker deployment verification are recorded truthfully in [`operations/docs/X5_3_EXECUTION_REPORT.md`](operations/docs/X5_3_EXECUTION_REPORT.md).

> [!IMPORTANT]
> **Disclaimer:** Strategic Souls is strictly for financial education and quantitative research. It is not a registered investment adviser or brokerage, does not execute trades, and makes no guarantee of financial performance.
