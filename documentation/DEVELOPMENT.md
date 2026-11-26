# Development Guide

All Node/JavaScript dependencies, build configurations, and framework routes live inside **`application/`**. Execute install, lint, typecheck, test, build, and preview commands from inside `application/` unless explicitly running an operational script from the repository root.

---

## 1. Prerequisites

| Tool | Version / Requirement | Notes |
| --- | --- | --- |
| **Node.js** | `>= 22.13.0` (CI uses Node 24) | Native `--experimental-strip-types` and `node:sqlite` support required |
| **pnpm** | `11.25.0` | Enforced via `packageManager` and `pnpm-workspace.yaml` (`corepack enable`) |
| **Python + `uv`** | Python `>= 3.11`, `uv` | Optional/supported for `application/backend/quant` tests |
| **Docker / WSL2 + Supabase CLI** | Optional | Needed only for running full local Supabase Postgres/Auth container journeys (`verify-v3.yml`); unit Postgres RLS tests run via PGlite in Node with no Docker |

---

## 2. Standard Local Setup & Verification

```powershell
cd application
corepack enable
pnpm install --frozen-lockfile
```

Run the core verification suite (typecheck, ESLint across `app frontend backend database`, and all Node test suites):

```powershell
pnpm run verify
# Equivalent JSON-logged runner:
pnpm run verify:x2
```

Run production Vite/Vinext Worker build, generated Wrangler artifact verification, layout/monitor unit tests, and secret scan:

```powershell
pnpm run build
node ../operations/scripts/check-production-release.mjs artifact
node ../operations/scripts/check-repo-layout.mjs
node ../operations/scripts/scan-secrets.mjs
node --test ../operations/scripts/check-repo-layout.test.mjs ../operations/monitoring/monitor.test.mjs
```

Run Python quant tests:

```powershell
uv sync --project backend/quant --frozen
pnpm run test:quant
```

---

## 3. Running Local Previews

### Option A: Isolated Compiled Cloudflare Worker + Local D1 (Recommended)
Compiles the production bundle inside `application/dist/`, applies all 21 D1 migrations from `../database/migrations/` into isolated `application/.wrangler/local-preview`, and serves over loopback `http://127.0.0.1:5173/`:

```powershell
cd application
pnpm run dev
# Or step by step after a build:
pnpm run local:setup
pnpm run local:serve
```

### Option B: Fast Vite/Vinext HMR Server
```powershell
cd application
pnpm run dev:hmr
```

---

## 4. Environment Files, Ignores & Local Git Safeguards

- Copy templates only inside `application/` (`application/.env.example`, `application/.dev.vars.example`) to gitignored `.env` or `.dev.vars` when needed locally. **Never** create `.env`, `.dev.vars`, `.secrets/`, or runtime databases at the Git repository root.
- Scoped `.gitignore` files live inside `application/`, `database/`, `database/supabase/`, and `operations/` — there is intentionally **no root `.gitignore`** in order to keep the repository root strictly limited to 6 directories (`archive/` included) + `README.md`.
- CI runs on GitHub Actions using Node `24` (`.github/actions/setup-app`), deriving the `pnpm` version from `application/package.json` and caching the `pnpm` store under `$RUNNER_TEMP/pnpm-store` via `SITES_PNPM_SHARED_STORE`.
- Recommended local developer safeguard against accidental root-level untracked clutter: add local patterns to your non-tracked `.git/info/exclude` (inside `.git/`, never committed), and rely on `.github/workflows/verify.yml` + `operations/scripts/scan-secrets.mjs` to fail CI if any forbidden root entry, secret, or build artifact is tracked.
- Shell line endings (`*.sh text eol=lf`) are enforced via [`application/.gitattributes`](../application/.gitattributes).

---

## 5. Package Scripts & Operational Utilities

### Inside `application/` (`package.json`)
- `pnpm test`: Run all 43 unit and integration tests using `node --experimental-strip-types --experimental-vm-modules --test "tests/**/*.test.mjs"`.
- `pnpm run typecheck`: `tsc --noEmit`.
- `pnpm run lint:app`: ESLint across `app frontend backend database`.
- `pnpm run db:generate`: Generate additive Drizzle SQL migrations into `../database/migrations/`.
- `pnpm run db:start` / `pnpm run db:migrate:local`: Run local Supabase with `--workdir ../database`.
- `pnpm run broker:setup` / `broker:adapter` / `broker:verify`: Manage/run owner-only local Angel One adapter (delegating to `../operations/scripts/`).
- `pnpm run scan:secrets`: Run comprehensive secret/bundle scanner (`../operations/scripts/scan-secrets.mjs`).

### Root Operational Scripts (`operations/scripts/`)
All operational scripts import [`operations/scripts/repo-paths.mjs`](../operations/scripts/repo-paths.mjs), resolving `repoRoot`, `appRoot`, `databaseMigrationsDir`, `databaseSupabaseWorkdir`, and `documentationRoot` cleanly regardless of whether invoked from the Git root or `application/`.
