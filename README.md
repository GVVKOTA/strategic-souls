<p align="left">
  <img src="public/gvv-approved.jpg" width="96" alt="Global Vertex Vectors (GVV) eclipse logo" />
</p>

# Strategic Souls (SS)

**Research into evidence.**

Strategic Souls is an educational financial-market research and strategy workspace built by **Global Vertex Vectors (GVV)** so independent investors and beginners can explore global markets on an interactive 3D Earth, turn trading ideas into structured rules (**Soul Scan**), inspect transparent evidence, and collaborate in opt-in research groups — all in one connected app.

> [!NOTE]
> **Current Status (X4 Release — Soul Scan 2.0, Canonical Instrument Discovery & Community Onboarding):**
> - **Works today without any commercial API key:** Standalone email/password sign-in on Cloudflare D1 (plus optional Google OAuth when Worker secrets are configured), interactive full-color NASA Blue/Black Marble 3D Earth with 24 exchange clocks, **Canonical Instrument Discovery** across 41+ Indian equities, indices, dated MCX futures, FX, and macro benchmarks (`HDFC`, `HDFCBANK`, `SBIN`, `RELIANCE`, `TCS`, `INFY`, `NIFTY`, `SENSEX`, `GOLD`, `CRUDEOIL`), official daily ECB Euro FX and MOSPI CPI feeds, manual watchlists and multi-currency portfolios, **Soul Scan 2.0** (3-level **Beginner** / **Intermediate** / **Advanced** rules across up to 1,000 instruments with 5 preset market universes including **Private User CSV OHLCV Dataset** and a 1-click 5-stock Indian equity `TEST DATA` loader), Formula Lab, and **3-Concept Community Onboarding** (**Body**, **Group**, **Soul**) with step-1 `@handle` discoverability opt-in.
> - **Owner-only / Key-gated until licensed:** Owner-authenticated live/historical **Angel One SmartAPI** (`ANGELONE_SMARTAPI`) and commercial **EODHD** / **TrueData** feeds remain safely fail-closed for public visitors (`PUBLIC_RESTRICTED` / `PUBLIC_IDENTITY_ONLY`) until owner-configured Cloudflare Worker Secrets and attested data rights are active. See [`operations/docs/X4_MARKET_SEARCH_AND_SCANNER.md`](operations/docs/X4_MARKET_SEARCH_AND_SCANNER.md) and [`operations/docs/FUTURE_API_KEY_SETUP.md`](operations/docs/FUTURE_API_KEY_SETUP.md).
> - **Not active / out of scope:** No live broker order placement (`ZERO-ORDER SAFETY GUARD`), no billing/payments/ads, no crypto scope, and no OpenAI/ChatGPT user login.

---

## The Five Ownership Areas (Cousin's 1-Minute Map)

Think of Strategic Souls as **five clear areas**, plus a small set of framework-required root folders that Next.js/Vinext, Drizzle, and GitHub expect at the top level:

```text
strategic-souls/
├── frontend/     1. What users see & click (Global, Strategy, Community, shared UI, styles)
├── backend/      2. Server rules, auth, Soul Scan math, market-data adapters, security
├── database/     3. Cloudflare D1 table schemas (Drizzle ORM) and query helpers
├── public/       4. Static images (GVV logo, NASA Earth textures), self-hosted fonts, downloads
├── operations/   5. Docs, runbooks, verification scripts, local preview launcher, examples
│
│   Framework & Tooling Root Exceptions (keep at root so tools discover them automatically):
├── app/          Next.js / Vinext page routes (/, /workspace, /signin) and /api/* entrypoints
├── drizzle/      Applied chronological Cloudflare D1 SQL migrations (0000–0007 — never edit!)
├── supabase/     Optional separate V3 local Supabase/PostgreSQL RLS stack (off by default)
├── tests/        Automated Node.js unit and integration test suites
├── scripts/      CI pnpm installer hook referenced by package.json
├── .github/      GitHub Actions CI workflows (verify.yml, verify-v3.yml)
└── (root files)  package.json, pnpm-lock.yaml, vite.config.ts, drizzle.config.ts, AGENTS.md, etc.
```

Each primary area has its own short guide:
[`frontend/README.md`](frontend/README.md) · [`backend/README.md`](backend/README.md) · [`database/README.md`](database/README.md) · [`public/README.md`](public/README.md) · [`operations/docs/README.md`](operations/docs/README.md)

---

## Where Do I Edit This?

| If you want to change... | Go here first | Notes |
| --- | --- | --- |
| **Global workspace** (3D Earth, markets, watchlists, portfolio, charts) | `frontend/features/global/` | Earth WebGL is in `globe-canvas.tsx`; dashboard UI is in `dashboard.tsx`. |
| **Strategy workspace** (Soul Scan Beginner/Intermediate/Advanced, Formula Lab) | `frontend/features/strategy/` | All three modes compile to one canonical AST in `backend/engines/scan.ts`. |
| **Community workspace** (Bodies, private groups, shared Souls, DMs) | `frontend/features/community/` | Server permissions live in `backend/services/community/`. |
| **Shared shell, nav, search, modals, skeletons, intro** | `frontend/components/workspace/` | Keep `eclipse-intro.tsx` and `motion.css` within tested timing contracts. |
| **Colors, fonts, layout spacing** | `frontend/styles/` | **Never change UI text color hex tokens** in `globals.css`. |
| **Page URLs or HTTP API endpoints** | `app/` and `app/api/` | Keep handlers thin; delegate real logic to `backend/`. |
| **Soul Scan math, Formula Lab, backtest, portfolio math** | `backend/engines/` | Always add or update tests in `tests/unit/`. |
| **Login, sessions, Google OAuth, CSRF, security** | `backend/auth/` & `backend/middleware/` | Passwords use PBKDF2-SHA256; sessions are hashed `HttpOnly` cookies in D1. |
| **Market-data adapters (ECB, Treasury, EODHD, TrueData)** | `backend/services/market-data/` | Never put API keys in code or frontend bundles. |
| **Cloudflare D1 tables & queries** | `database/schemas/` & `database/queries/` | Never modify existing applied SQL files in `drizzle/0000`–`0007`. |
| **Logos, NASA Earth images, local fonts** | `public/` | Preserve approved `public/gvv-approved.jpg` and NASA provenance in `public/data/earth-assets.json`. |
| **Automated tests** | `tests/unit/` & `tests/integration/` | Run via `node operations/scripts/check-x2-release.mjs` or `npm.cmd test`. |
| **Docs, local launcher, release & Cloudflare deployment** | `operations/docs/` & `operations/scripts/` | See [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md). |

### Tiny Example: UI Button vs. Scan Math

- **Changing a Strategy button label (UI only):** Edit `frontend/features/strategy/workspace.tsx` (for example, the `"Run scan"` button text), rebuild/restart local preview, and verify the screen on desktop and mobile. No backend or database change is needed.
- **Changing how an RSI or SMA scan rule calculates (core math):** Edit the canonical rule compiler/evaluator in `backend/engines/scan.ts` (and presets/validation in `backend/services/research/research.ts`), then add a deterministic test in `tests/unit/x1-scan.test.mjs` or `tests/unit/x2-research.test.mjs` so Beginner, Intermediate, and Advanced modes stay 100% consistent.

---

## Quick Start on Windows (VS Code)

Frontend, backend APIs, and the isolated local D1 database all run together through one command. **No `.env` file or paid API keys are needed to run locally.**

### Prerequisites

- **Git**
- **Node.js** `>= 22.13.0` (verified on `22.16.0` and `26.13.1`)
- **pnpm** `11.25.0` (declared in `package.json` `packageManager`)

> [!TIP]
> **Windows PowerShell note:** If Windows PowerShell shows `running scripts is disabled on this system` when running `pnpm` or `npm`, use `pnpm.cmd` / `npm.cmd` (or run `node ...` directly, or use Command Prompt `cmd`). You do **not** need to change system-wide Windows policies.

### 1. Open, Install & Start

Open the repository folder (the one containing `package.json` and `.git`) in VS Code (`File -> Open Folder`), open a terminal (`Terminal -> New Terminal`), and run:

```powershell
# PowerShell (safe even with restricted ExecutionPolicy)
pnpm.cmd install --frozen-lockfile
npm.cmd run dev
```

Or equivalently using Node directly:

```powershell
node operations/scripts/local-preview.mjs launch
```

When Wrangler prints `Ready on http://127.0.0.1:8787` and the local proxy reports ready, open **`http://127.0.0.1:5173`** in your browser. Press **`Ctrl + C`** to stop.

- Local preview uses an **isolated local SQLite D1 database** in ignored `.wrangler/local-preview/` — it never touches production Cloudflare D1.
- Create a disposable local test account (e.g., `tester@example.test`) right in the app; never enter real production passwords in local dev.
- After editing code on Windows, press `Ctrl + C` and re-run `npm.cmd run dev` (recommended over `dev:hmr` on Windows).

### 2. Everyday Commands

| Goal | Command (PowerShell / CMD) | What it does |
| --- | --- | --- |
| **Run locally** | `npm.cmd run dev` | Builds the Cloudflare Worker, applies local D1 migrations `0000`–`0007`, and serves at `http://127.0.0.1:5173`. |
| **Full check** | `node operations/scripts/check-x2-release.mjs` | Runs TypeScript `typecheck`, ESLint `lint:app`, and all Node unit + integration tests. |
| **Tests only** | `npm.cmd test` | Runs all Node.js tests under `tests/unit/` and `tests/integration/`. |
| **Build Worker** | `npm.cmd run build` | Builds the real Cloudflare Worker bundle (`dist/server/wrangler.json` + static assets). |
| **Security audit** | `pnpm.cmd audit --audit-level high` | Checks npm dependencies for high/critical vulnerabilities. |
| **Optional Python quant tests** | `npm.cmd run test:quant` | Runs the 29 optional Python quant tests in `backend/quant/tests/` (requires `uv`). |
| **Stop local server** | `Ctrl + C` | Cleanly stops the local preview proxy and Wrangler worker. |

---

## Safe Collaboration on GitHub

1. **Use separate personal GitHub accounts** — never share a GitHub password, personal access token, Cloudflare API token, or `.dev.vars` / `.env` file.
2. **Always branch from `main`:**
   ```powershell
   git switch main
   git pull --ff-only
   git switch -c feat/my-small-change
   ```
3. **Verify before pushing:** Run `node operations/scripts/check-x2-release.mjs` and `npm.cmd run build`, then inspect `git status` and `git diff` to confirm no secrets or temporary files are staged.
4. **Push & open a Pull Request:**
   ```powershell
   git push -u origin feat/my-small-change
   ```
   Open a Pull Request on GitHub against `main`, wait for `.github/workflows/verify.yml` CI to pass, and have changes reviewed before merging.

---

## How Code Reaches Cloudflare

- **Live Cloudflare Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)
- **Live Cloudflare D1 Database:** `ss` bound as `DB` (applied migrations `0000`–`0007` live)
- **Pipeline:** Cloudflare **Workers Builds** is connected to the GitHub `main` branch of `GVVKOTA/strategic-souls`.
  - Pushing to a **feature branch** runs GitHub Actions CI only — it does **not** deploy production.
  - Merging to **`main`** triggers a Cloudflare Workers Build on the existing `strategic-souls` Worker. Even after merging, a Git push alone is **not** proof of deployment — always verify the Cloudflare build status, new deployment version ID, and live URL health checks.
- **Full step-by-step release & rollback guide:** [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md)

---

## Deep Documentation

- [`AGENTS.md`](AGENTS.md) — Engineering governance, non-negotiable invariants, and rules for AI coding agents
- [`operations/docs/ARCHITECTURE.md`](operations/docs/ARCHITECTURE.md) — Request flow, auth, workspaces, D1 vs optional V3 architecture
- [`operations/docs/DEVELOPER_GUIDE.md`](operations/docs/DEVELOPER_GUIDE.md) — Local Windows/VS Code workflow and common fixes
- [`operations/docs/DEPLOYMENT_RUNBOOK.md`](operations/docs/DEPLOYMENT_RUNBOOK.md) — Cloudflare Workers Builds, Wrangler checks, secrets, rollback, D1 backup
- [`operations/docs/FUTURE_API_KEY_SETUP.md`](operations/docs/FUTURE_API_KEY_SETUP.md) — Keyless operation today, adding licensed market-data keys later, planned Free/Premium cost matrix (inactive)
- [`operations/docs/visual/STRATEGIC_SOULS_CINEMATIC_UPGRADE.md`](operations/docs/visual/STRATEGIC_SOULS_CINEMATIC_UPGRADE.md) — Unchanged UI text color contract, silver typography scale, motion & loader specs, natural-color 3D Earth engineering
- [`operations/docs/X3_REQUIREMENTS_AND_BUG_REGISTER.md`](operations/docs/X3_REQUIREMENTS_AND_BUG_REGISTER.md) — Full X3 requirements & bug verification register (`X3-01`–`X3-30`)
- [`operations/docs/X2_RELEASE_REPORT.md`](operations/docs/X2_RELEASE_REPORT.md) — Truthful verification, CI, and deployment evidence report

---

> [!IMPORTANT]
> **Disclaimer:** Strategic Souls is strictly for **financial education and research**. It is **not** a broker or registered investment adviser, does **not** execute trades, and does **not** guarantee investment outcomes. Market data may be delayed, incomplete, unavailable, or subject to licensing restrictions. Research outputs and historical simulations are not personalized investment advice.

**Strategic Souls · Global Vertex Vectors (GVV)**
*Analyze with evidence. Build with purpose.*
