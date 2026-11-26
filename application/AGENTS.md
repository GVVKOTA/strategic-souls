# Strategic Souls Engineering Rules (`application/`)

## 1. Mission, Repository Split & Application Ownership Areas

Maintain the **Strategic Souls** financial research application for **Global Vertex Vectors (GVV)**. The repository keeps a strict five-folder root (`.github/`, `application/`, `database/`, `documentation/`, `operations/`, plus `README.md`), where **`application/`** is the JavaScript / Next App Router / Vinext / Cloudflare Worker project root:

- [`frontend/`](frontend/README.md): Workspace UIs under `frontend/features/` (`global/`, `strategy/`, `community/`, `account/`, `auth/`, plus retained `legacy/` and `v3/`), shared shell/motion controls in `frontend/components/`, client helpers in `frontend/lib/`, and stylesheets in `frontend/styles/`.
- [`backend/`](backend/README.md): Standalone Cloudflare D1 auth & optional PKCE Google OAuth (`backend/auth/`), deterministic canonical math/scan/backtest/portfolio/evidence engines (`backend/engines/`), application & market-data/intelligence services (`backend/services/`), integrations (`backend/integrations/`), Worker middleware/security (`backend/middleware/`), and optional Python quant worker (`backend/quant/`).
- [`database/`](database/README.md): Runtime Cloudflare D1 Drizzle schemas (`database/schemas/`) and query helpers (`database/queries/`). Applied D1 SQL migrations (`0000`–`0020`) and optional V3 Supabase migrations live at top-level [`../database/`](../database/README.md).
- [`public/`](public/README.md): Approved GVV logo (`public/gvv-approved.jpg`), favicons, self-hosted WOFF2 fonts & SIL OFL licenses (`public/fonts/`), 50 SVG avatars (`public/avatars/`), NASA Earth textures and MapLibre/asset provenance (`public/data/`).
- **`app/` & `tests/`**: Next/Vinext pages and `/api/*` route handlers (`app/`), plus Node unit & integration suites (`tests/`).
- **`tooling/` & `scripts/`**: App-local build, preview, installer (`tooling/`, `scripts/install-pnpm.sh`), and `ts-node-hooks.mjs`. Operational scripts, deployment runbook, and verification reports live in [`../operations/`](../operations/deployment/DEPLOYMENT_RUNBOOK.md), and consolidated docs/specs live in [`../documentation/`](../documentation/ARCHITECTURE.md).

Never duplicate canonical algorithms, provider adapters, or access checks inside frontend dashboards or route handlers. Keep one single lockfile (`pnpm-lock.yaml`); do not create a second Node lockfile or perform unsolicited upgrades.

## 2. Product, Visual & Evidence Invariants

- **ABSOLUTE UI TEXT COLOR INVARIANT:** Never change any canonical UI text color hex token in `frontend/styles/globals.css` (`--x1-text-primary: #E8EDF2`, `--x1-text-secondary: #CAD3DC`, `--x1-text-tertiary: #B9C3CE`, `--x1-text-muted: #A7B1BC`, `--x1-title-blue: #76C0FF`, `--x1-title-blue-alt: #94D0FF`) or recolor existing UI text. Improve silver readability through surface contrast, typography scale (`>=14px` interactive controls, `>=16px` mobile inputs), spacing, and layout.
- **X 1.0 Workspace Contract**
  - Main Global Overview displays four primary blocks in order: Strategic Dashboard with customizable market cards, My Portfolio and Watchlist, Strategic Globe, and Economic Calendar.
  - The Global drawer groups canonical destinations defined in `frontend/components/workspace/global-menu.ts`. Preserve deep links and browser history.
  - Strategic Globe defaults to the 3D Earth and opens the lazy regional map on zoom (`frontend/features/global/regional-map.tsx`). Preserve focus, attribution, useful fallback, and reduced-motion behavior.
- **Natural Full-Color 3D Earth:** The interactive WebGL globe (`frontend/features/global/globe-canvas.tsx`) and static fallback (`globe-visual.css`) render authentic NASA Blue/Black Marble historical textures in natural full color with approximate UTC solar lighting, translucent clouds, restrained Rayleigh blue rim, 24 exchange venues, USGS/NASA hazards, and honest historical/resolution disclosures. Never claim historical NASA imagery is live street-level satellite telemetry.
- **Market Vox & Calendar Honesty:** Market Vox (`NIFTY & Gold community vote`) enforces both `opensAtUtc <= serverNow < closesAtUtc` server-side with zero personal scorecards or leaderboards. Economic Calendar displays zero `HIGH/MEDIUM/LOW` impact controls/badges and never synthesizes missing announcement times.
- **Motion & Loading:** Keep `EclipseIntro` within its tested contract (`<=1050ms` React / `1100ms` CSS safety escape, once/session, skip-safe, reduced-motion aware). Respect `prefers-reduced-motion` and the optional System/Minimal motion preference. Loaders must reflect real async work, unblock on error/timeout, and never fabricate completion.
- **Evidence & Data Integrity:** X2+ has no crypto scope. Preserve date-only source precision (never append synthetic wall-clock times). Never invent `LIVE` values, volume, units, consensus/actuals, probabilities, or confidence intervals (`Insufficient verified observations` when sample gates are unmet). `NULL`/`UNKNOWN` is never silently treated as `0`/`FAIL`. An API key is separate from display, derived-display, non-display, cache, storage, and redistribution rights.
- **One Canonical Soul Scan Engine:** Classic (50 presets) and Advanced (`Discover` / `Build` / `Draw`) modes MUST compile to and execute through the ONE deterministic canonical AST (`backend/engines/scan.ts`). Preserve immutable executions, input digests, original cutoffs, censoring, deduplication, and `GRAVEYARD` history.
- **Standalone Auth & Access Control:** Authentication uses standalone Cloudflare D1 email/password (`PBKDF2-SHA256` + SHA-256 hashed `HttpOnly` session cookies + session rotation) and optional PKCE Google OAuth. **Never reintroduce OpenAI/ChatGPT user login.** Enforce current consent and server-side owner/participant/membership/role checks on every read and mutation. Group sharing never exposes private portfolios. Discovery is opt-in; keep blocks and rate limits; do not claim E2EE.
- **Migrations & Data Safety:** Keep D1 migrations in [`../database/migrations/`](../database/migrations/) (`0000`–`0020`) chronological, byte-identical once applied, and non-destructive. Never edit, squash, reset, or drop applied migrations or production D1 rows. Keep local `.env`, `.dev.vars`, `.secrets/`, `node_modules/`, `dist/`, `.wrangler/`, and `.sites-runtime/` inside `application/` (gitignored by `application/.gitignore`) and never at repo root.

## 3. Development, Testing & Verification

Run commands from **`application/`** (`cd application`):

- **Install:** `pnpm install --frozen-lockfile` (Windows PowerShell with execution policy restriction: `pnpm.cmd install --frozen-lockfile`)
- **Full verification:** `node tooling/check-x2-release.mjs` (or `pnpm run verify` — runs `typecheck`, `lint:app`, and all 43 Node unit/integration tests)
- **Production Worker build:** `node tooling/run-framework.mjs build` (or `pnpm run build`) + `node ../operations/scripts/check-production-release.mjs artifact`
- **Local isolated preview:** `node tooling/local-preview.mjs launch` (or `pnpm run dev`) -> open `http://127.0.0.1:5173`. Uses isolated `application/.wrangler/local-preview` D1 database and never touches production D1.
- **Secret scan & repo-layout check:** `node ../operations/scripts/scan-secrets.mjs` and `node ../operations/scripts/check-repo-layout.mjs`
- **Optional Python quant tests:** `uv run --project backend/quant pytest backend/quant/tests -q`

Report actual command outputs, test counts, warnings, and untested limits truthfully. Never weaken test assertions or bypass CI invariants.

## 4. Security, Teamwork & Cloudflare Releases

- **Zero Secret Leakage:** Never commit or print credentials, `.env`/`.dev.vars` values, cookies, session tokens, `X2_OWNER_SUBJECT`, provider keys, private user rows, or DB dumps. Store production secrets only in Cloudflare Worker Secrets.
- **Real Deployment Topology:** Production runs on Cloudflare Worker `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`) bound to physical Cloudflare D1 database `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) and VPC `MARKET_DATA_ADAPTER` (`01a2095b-f466-7c90-a813-4fad03735504`), deployed via GitHub-connected Cloudflare Workers Builds with **Root Directory = `application`**.
- **Release Safety:** Never create a replacement Worker or D1 database. Before any production release, verify `application/dist/server/wrangler.json` binds the exact existing Worker, D1 UUID, and VPC binding, confirm all local & CI checks pass, verify rollback version provenance, and independently verify the live URL after deployment.
- **Out-of-Scope Without Explicit Founder Approval:** Paid subscriptions, billing/checkout, advertising activation, live broker trading, destructive migrations, credential rotation, public launch announcements, or repository visibility changes.
