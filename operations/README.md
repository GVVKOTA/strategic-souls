# Operations, Documentation, Tooling & Archive (`operations/`)

**Owns:** How engineers develop, test, build, deploy, audit, back up, and understand Strategic Souls (`X5.5`), plus the single consolidated historical archive (`operations/archive/`).

---

## 1. What Belongs Here vs. What Does Not

### What Belongs Here
- **`operations/docs/`** — Authoritative active documentation: system architecture, repository map, developer setup, Cloudflare deployment & rollback runbooks, market-data provider & licensing matrices, security specs, and active `X5.3`–`X5.5` release reports.
- **`operations/scripts/`** — Build orchestration (`run-framework.mjs`, `build-verified.sh`), isolated local Worker + D1 preview (`local-preview.mjs`), full verification suite (`check-x2-release.mjs`), zero-leak secret/bundle scanners (`scan-secrets.mjs`, `scan-v3-source.mjs`), offline D1 logical backup/restore verification (`backup-x2.mjs`, `backup-v3.mjs`, `verify-logical-backup.mjs`), and private broker adapter runners (`setup-broker-secrets.mjs`, `start-market-adapter.mjs`, `verify-angelone-live.mjs`).
- **`operations/reports/`** — Machine-readable repository structure, inventory, and SHA-256 verification manifests (`SS_REORGANIZATION_MANIFEST.json`).
- **`operations/examples/`** — Reference D1 route/schema examples excluded from active production builds.
- **`operations/archive/`** — The single consolidated historical archive for verified obsolete/superseded reports and retired UI components, governed by [`operations/archive/README.md`](archive/README.md).

### What Does Not Belong Here
- Native GitHub Actions workflow YAML files (must remain at root [`.github/workflows/`](../.github/workflows/) for GitHub Actions auto-discovery).
- Root package manifests, lockfiles, and compiler/bundler configs (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `drizzle.config.ts`).
- Active application UI (`frontend/`), server engines/services (`backend/`), Drizzle schemas (`database/`), App Router entrypoints (`app/`), static assets (`public/`), or applied D1 SQL migrations (`drizzle/`).
- Live secrets, tokens, `.env` / `.dev.vars` files, or production user database dumps.

---

## 2. Key Entrypoints

| Path | Purpose |
| --- | --- |
| [`operations/docs/README.md`](docs/README.md) | Full index of active `X5.5` documentation and archived historical reports |
| [`operations/docs/REPOSITORY_MAP.md`](docs/REPOSITORY_MAP.md) | Directory-by-directory ownership matrix, root-exception evidence, and Mermaid request lifecycle diagram |
| [`operations/docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md`](docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md) | Latest verified `X5.5` release audit, defect register, bundle metrics, and test ledger |
| [`operations/docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md) | Safe Cloudflare Workers Builds deployment & `<1 min` Worker version rollback runbook |
| [`operations/scripts/check-x2-release.mjs`](scripts/check-x2-release.mjs) | Runs `tsc --noEmit`, `eslint app frontend backend database`, and all Node unit/integration tests |
| [`operations/scripts/local-preview.mjs`](scripts/local-preview.mjs) | Builds the Worker, applies local D1 migrations (`0000`–`0009`), and serves `http://127.0.0.1:5173` on an isolated local SQLite D1 database |
| [`operations/scripts/run-framework.mjs`](scripts/run-framework.mjs) | Cross-platform Vinext/Vite build & dev runner |
| [`operations/scripts/scan-secrets.mjs`](scripts/scan-secrets.mjs) | Scans tracked files, staged diffs, and `dist/` bundles for credential patterns and local secret leaks |
| [`operations/reports/SS_REORGANIZATION_MANIFEST.json`](reports/SS_REORGANIZATION_MANIFEST.json) | Machine-readable 554+ file classification inventory, SHA-256 baseline verification, and archive move ledger |
| [`operations/archive/README.md`](archive/README.md) | Historical archive manifest and reversible `git mv` restore ledger |

---

## 3. How to Verify Changes

```powershell
# 1. Run full TypeScript + ESLint + 333 Node unit & integration tests
node operations/scripts/check-x2-release.mjs

# 2. Build production Cloudflare Worker & verify dist/server/wrangler.json
node operations/scripts/run-framework.mjs build

# 3. Run zero-leak secret & bundle scanner
node operations/scripts/scan-secrets.mjs

# 4. Run optional Python quant test suite (29 tests)
uv run --project backend/quant pytest backend/quant/tests -q
```
