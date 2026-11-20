# Strategic Souls Engineering Rules

## 1. Mission & Five Ownership Areas

Maintain the **Strategic Souls** financial research application for **Global Vertex Vectors (GVV)** across five primary ownership areas while keeping framework-required root folders in place:

- [`frontend/`](frontend/README.md): Three workspaces under `frontend/features/` (`global/`, `strategy/`, `community/`, plus retained `legacy/` and `v3/`), shared shell/UI in `frontend/components/`, hooks in `frontend/hooks/`, and stylesheets in `frontend/styles/`.
- [`backend/`](backend/README.md): Standalone Cloudflare D1 auth & optional Google OAuth (`backend/auth/`), deterministic canonical math/scan/backtest/portfolio engines (`backend/engines/`), application & market-data services (`backend/services/`), integrations (`backend/integrations/`), Worker middleware/security (`backend/middleware/`), and optional Python quant worker (`backend/quant/`).
- [`database/`](database/README.md): Cloudflare D1 Drizzle schemas (`database/schemas/`) and query helpers (`database/queries/`).
- [`public/`](public/README.md): Approved GVV logo (`public/gvv-approved.jpg`), favicons, self-hosted WOFF2 fonts (`public/fonts/`), NASA Earth textures and provenance (`public/data/`), and offline reference files (`public/downloads/`).
- [`operations/`](operations/docs/README.md): Active architecture/visual/API/deployment docs (`operations/docs/`), build/verify/preview/backup scripts (`operations/scripts/`), and reference examples (`operations/examples/`).
- **Framework root exceptions (keep at root):** `app/` (Next.js/Vinext pages & `/api/*`), `drizzle/` (applied chronological D1 SQL migrations `0000`–`0007`), `supabase/` (optional separate V3 PostgreSQL RLS stack), `tests/`, `scripts/`, `.github/`, and root config/lockfiles.

Never duplicate canonical algorithms, provider adapters, or access checks inside frontend dashboards or route handlers. Keep `pnpm-lock.yaml` intact; do not create a second Node lockfile or perform unsolicited upgrades.

## 2. Product, Visual & Evidence Invariants

- **ABSOLUTE UI TEXT COLOR INVARIANT:** Never change any canonical UI text color hex token in `frontend/styles/globals.css` (`--x1-text-primary: #E8EDF2`, `--x1-text-secondary: #CAD3DC`, `--x1-text-tertiary: #B9C3CE`, `--x1-text-muted: #A7B1BC`, `--x1-title-blue: #76C0FF`, `--x1-title-blue-alt: #94D0FF`) or recolor existing UI text. Improve silver readability through surface contrast, typography scale (`>=14px` interactive controls, `>=16px` mobile inputs), spacing, and layout.
- **Natural Full-Color 3D Earth:** The interactive WebGL globe (`frontend/features/global/globe-canvas.tsx`) and static fallback (`globe-visual.css`) render authentic NASA Blue/Black Marble historical textures in natural full color with approximate UTC solar lighting, translucent clouds, restrained Rayleigh blue rim, 24 exchange venues, and honest historical/approximate disclosures. Never claim historical NASA imagery is live satellite telemetry.
- **Motion & Loading:** Keep `EclipseIntro` within its tested contract (`<=1050ms` React / `1100ms` CSS safety escape, once/session, skip-safe, reduced-motion aware). Respect `prefers-reduced-motion` and the optional System/Minimal motion preference. Loaders must reflect real async work, unblock on error/timeout, and never fabricate completion.
- **Evidence & Data Integrity:** X2 has no crypto scope. Keep labelled legacy/synthetic archives separate from current evidence. Never invent `LIVE` values, volume, units, publication/known-at times, FII/DII flows, or coverage. `NULL`/`UNKNOWN` is never silently treated as `0`/`FAIL`. An API key is separate from display, derived-display, non-display, cache, storage, and redistribution rights.
- **One Canonical Soul Scan Engine:** Beginner (default), Intermediate, and Advanced Soul Scan modes MUST compile to and execute through the ONE deterministic canonical AST (`backend/engines/scan.ts`). Preserve immutable executions, input digests, original cutoffs, censoring, deduplication, and `INSUFFICIENT EVIDENCE` gating when uncalibrated.
- **Standalone Auth & Access Control:** Authentication uses standalone Cloudflare D1 email/password (`PBKDF2-SHA256` + SHA-256 hashed `HttpOnly` session cookies + session rotation) and optional PKCE Google OAuth. **Never reintroduce OpenAI/ChatGPT user login.** Enforce current consent and server-side owner/participant/membership/role checks on every read and mutation. Group sharing never exposes private portfolios. Discovery is opt-in; keep blocks and rate limits; do not claim E2EE.
- **Migrations & Data Safety:** Keep D1 migrations in `drizzle/` chronological and non-destructive. Never edit, squash, reset, or drop applied migrations (`0000`–`0007`) or production D1 rows.

## 3. Development, Testing & Verification

- Create small, focused branches from `main`. Inspect `git status` and `git diff`, stage exact files, commit clearly, and open a PR. Never force-push or overwrite collaborator work. Do not weaken assertions to make checks pass.
- **Verified Commands:**
  - Install: `pnpm install --frozen-lockfile` (PowerShell restricted policy: `pnpm.cmd install --frozen-lockfile`)
  - Full verification: `node operations/scripts/check-x2-release.mjs` (runs `typecheck`, `lint:app`, and all Node unit/integration tests)
  - Production Worker build: `node operations/scripts/run-framework.mjs build` (or `npm.cmd run build`)
  - Local isolated preview on Windows: `node operations/scripts/local-preview.mjs launch` (or `npm.cmd run dev`) -> open `http://127.0.0.1:5173`. Uses an isolated `.wrangler/local-preview` D1 database and real standalone auth with disposable local accounts; never connects to production D1. Stop owned local helpers after QA.
  - Optional Python quant tests: `uv run --project backend/quant pytest backend/quant/tests -q`
- Report actual command outputs, test counts, warnings, and untested limits truthfully (`OBSERVED`, `REPRODUCED`, `CHANGED`, `TESTED-PASS`, `TESTED-FAIL`, `NOT-TESTED`, `BLOCKED`, `DEPLOYED-VERIFIED`).

## 4. Security, Teamwork & Cloudflare Releases

- **Zero Secret Leakage:** Never commit or print credentials, `.env`/`.dev.vars` values, cookies, session tokens, `X2_OWNER_SUBJECT`, provider keys, private user rows, or DB dumps. Store production secrets only in Cloudflare Worker Secrets. Scan diffs and history before pushing.
- **Real Deployment Topology:** Production runs on Cloudflare Worker `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`) bound to physical Cloudflare D1 database `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`), deployed via GitHub-connected Cloudflare Workers Builds on branch `main`.
- **Release Safety:** Never create a replacement Worker or D1 database. Before any production release, verify `dist/server/wrangler.json` binds the exact existing Worker and D1 UUID, confirm all local & CI checks pass, verify rollback version provenance, and independently verify the live URL after deployment. Pushing to a branch is NOT proof of deployment.
- **Out-of-Scope Without Explicit Founder Approval:** Paid subscriptions, billing/checkout, advertising activation, live broker trading, destructive migrations, credential rotation, public launch announcements, or repository visibility changes.
