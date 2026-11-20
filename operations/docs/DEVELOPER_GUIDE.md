# Developer Guide (Windows, VS Code & Local Workflow)

This guide explains how to run, test, edit, and contribute to **Strategic Souls** safely on Windows (or macOS/Linux) without affecting production Cloudflare data.

## 1. Open the Right Folder in VS Code

1. Open VS Code -> **File -> Open Folder** and choose the repository root containing `package.json` and `.git` (for example, `D:\Project SS\strategic-souls`).
   - *Watch out for nested unzip folders* (such as `ss/strategic-souls-main`): run `git status` and check `Test-Path package.json` before running commands.
2. Open a terminal (**Terminal -> New Terminal**).

## 2. Check Toolchain & Install Dependencies

Verified on Windows with Node `>= 22.13.0` (tested on `22.16.0` and `26.13.1`) and `pnpm 11.25.0`.

> **Windows PowerShell tip:** If PowerShell blocks `.ps1` shims (`running scripts is disabled on this system`), use **`pnpm.cmd`** and **`npm.cmd`** (or run `node ...` directly, or switch the terminal profile to Command Prompt `cmd`).

```powershell
node --version
pnpm.cmd --version
pnpm.cmd install --frozen-lockfile
```

Never run `npm install` (which creates a conflicting `package-lock.json`) — always use `pnpm` with `--frozen-lockfile`.

## 3. Start & Stop the Local Preview

```powershell
npm.cmd run dev
# equivalent direct command:
node operations/scripts/local-preview.mjs launch
```

- Wait until Wrangler prints `Ready on http://127.0.0.1:8787` and the launcher prints the local URL **`http://127.0.0.1:5173`**.
- Open **`http://127.0.0.1:5173`** in your browser.
- **Isolated local database:** `local-preview.mjs` builds the real Cloudflare Worker, applies D1 migrations `0000`–`0007` to `.wrangler/local-preview/` (gitignored), and starts an isolated local Worker. It **never** connects to production Cloudflare D1.
- **Standalone local accounts:** Register a disposable test account (e.g., `qa@example.test`) in the browser UI or `/signin`, then accept the research consent checkboxes to test watchlists, portfolios, Soul Scans, and Community groups. Never use real production passwords in local dev.
- **Restart after edits:** Press **`Ctrl + C`** to stop, then run `npm.cmd run dev` again. On Windows, `local-preview.mjs` is recommended over `npm.cmd run dev:hmr` due to upstream Vinext/Vite HMR path issues on Windows.
- **Fast restart when only restarting the server:** If `dist/` is already fresh and local D1 is migrated, run `node operations/scripts/local-preview.mjs serve`.

### Common Local Fixes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm.ps1 cannot be loaded` in PowerShell | Default Windows ExecutionPolicy | Use `npm.cmd`, `pnpm.cmd`, or `node operations/scripts/...` directly. |
| `ECONNREFUSED 127.0.0.1:5173` | Server not started yet, wrong folder, or port occupied | Confirm `package.json` is in current folder; check if ports `5173` or `8787` are already in use (`netstat -ano \| findstr ":5173 :8787"`); launch `node operations/scripts/local-preview.mjs launch`. |
| `no such table: auth_users` locally | Stale `.wrangler/local-preview` state before migration `0007` | Stop server and re-run `node operations/scripts/local-preview.mjs setup` (applies `0000`–`0007` to local SQLite only). |
| Missing commercial market prices locally | Normal keyless mode (`EODHD`/`TrueData` keys unset) | Official ECB FX and US Treasury feeds work keyless; commercial markets intentionally show `UNAVAILABLE` / `KEY REQUIRED`. |

## 4. Where to Edit (Five Ownership Areas)

| Want to change... | Start in... |
| --- | --- |
| Global, Strategy, or Community UI | `frontend/features/global/`, `frontend/features/strategy/`, `frontend/features/community/` |
| Shared shell, search, modals, skeletons, intro | `frontend/components/workspace/` |
| Typography, spacing, surfaces (never UI text hex colors) | `frontend/styles/` (`x1.css`, `x2.css`, `globe-visual.css`) |
| Page routes or `/api/*` HTTP handlers | `app/` |
| Auth, security, Soul Scan math, Formula Lab, market providers | `backend/` |
| Cloudflare D1 Drizzle schemas or SQL queries | `database/` (do not modify applied `drizzle/0000`–`0007`) |
| Static assets, GVV logo, NASA Earth images, local fonts | `public/` |
| Docs, scripts, runbooks, verification helpers | `operations/` |
| Unit & integration regression tests | `tests/unit/`, `tests/integration/` |

## 5. Run Verification Before Committing

```powershell
# Full verification (TypeScript + ESLint on app/frontend/backend/database + all Node tests)
node operations/scripts/check-x2-release.mjs

# Production Cloudflare Worker build
node operations/scripts/run-framework.mjs build

# High-severity dependency audit
pnpm.cmd audit --audit-level high

# Secret & provenance hygiene scan
node operations/scripts/scan-v3-source.mjs

# Optional Python quant suite (requires uv)
uv run --project backend/quant pytest backend/quant/tests -q
```

> **Optional V3 local Supabase stack:** Full `operations/scripts/test-supabase-local.mjs` requires Docker + `supabase start` (not needed for core Cloudflare D1 development). The embedded PGlite RLS tests (`tests/integration/v3-postgres.test.mjs`) run automatically inside `npm.cmd test` without Docker.

## 6. Contribute Safely on GitHub

```powershell
git switch main
git pull --ff-only
git switch -c feat/your-task
# ... make small focused edits and run verification ...
git status
git diff --check
git add <exact-paths>
git commit -m "feat(scope): clear description of change"
git push -u origin feat/your-task
```

Open a Pull Request on GitHub against `main`, include what changed and which commands/screens you tested, and wait for CI (`verify.yml`) and review. Follow [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) for production releases to Cloudflare.
