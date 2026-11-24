# Strategic Souls Consolidated Archive (`operations/archive/`)

> **HISTORICAL / NON-AUTHORITATIVE ARCHIVE:** Everything in `operations/archive/` is retained for historical provenance and reversible auditability only. None of the files in this directory are authoritative for the active `X5.5` product or runtime. For active documentation, start at root [`README.md`](../../README.md), [`operations/README.md`](../README.md), and [`operations/docs/README.md`](../docs/README.md).

---

## 1. What Belongs Here vs. What Does Not

### What Belongs Here
- Superseded release reports, historical audits, and working progress ledgers (`pre-X1`, `X1`, `X2`, `X3`, `X4`, `X5.1`, `X5.2`, and the completed `X5.5` progress scratchpad).
- Retired UI components explicitly removed by founder directive (`operations/archive/frontend/features/earth/world-conflict-map.tsx` and `earth-map.css` from the X5.3 2D map removal).

### What Must NEVER Be Placed Here
- Active application source (`app/`, `frontend/`, `backend/`, `database/`).
- Active automated tests or fixtures (`tests/`, `backend/quant/tests/`).
- Build, bundler, linter, or workspace configuration (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `drizzle.config.ts`).
- Applied Cloudflare D1 SQL migrations (`drizzle/0000`–`0009`) or V3 Supabase migrations (`supabase/migrations/`).
- Runtime static assets, fonts, SIL OFL licenses, or NASA Earth textures (`public/`).
- Root provenance, legal, or active operational runbooks (`SOURCE_PROVENANCE.json`, `AGENTS.md`, `README.md`, `operations/docs/DEPLOYMENT_RUNBOOK.md`).
- Any credentials, secrets, `.env`/`.dev.vars` files, or private user/database snapshots.

---

## 2. Reversible Restore Ledger

Every item below was relocated using `git mv` to preserve full Git history after a full-repository dependency scan (`git grep`, AST/import check, `tsc --noEmit`, `eslint`, Node test runner, and production Vinext build).

### X 1.0 retired market adapter

The former owner-only adapter code, setup scripts and adapter-specific tests are under `retired-market-adapter/`. The archive preserves historical evidence of the old runtime. Current exchange-calendar, session-boundary, permission and data integrity checks live in the active suite.

### Batch B — X5.5 Documentation & Archive Consolidation (`2026-11-23 IST`)

| Old Path | New Path | Reason | Dependency Scan Evidence | Relocation Date | Risk | Restore Command |
| --- | --- | --- | --- | --- | --- | --- |
| `operations/docs/X2_RELEASE_REPORT.md` | `operations/archive/docs/reports/x2/X2_RELEASE_REPORT.md` | Historical X2/X3 release report superseded by [`operations/docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md`](../docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md) | `0` code, test, script, or CI references (`git grep` verified); relative doc link in `visual/STRATEGIC_SOULS_CINEMATIC_UPGRADE.md` updated | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x2/X2_RELEASE_REPORT.md operations/docs/X2_RELEASE_REPORT.md` |
| `operations/docs/X2_UPGRADE_AUDIT.md` | `operations/archive/docs/reports/x2/X2_UPGRADE_AUDIT.md` | Historical X2/X3 upgrade audit superseded by X5.3–X5.5 audits | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x2/X2_UPGRADE_AUDIT.md operations/docs/X2_UPGRADE_AUDIT.md` |
| `operations/docs/X2_UPGRADE_CHANGELOG.md` | `operations/archive/docs/reports/x2/X2_UPGRADE_CHANGELOG.md` | Historical X2/X3 changelog superseded by X5.3–X5.5 release notes | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x2/X2_UPGRADE_CHANGELOG.md operations/docs/X2_UPGRADE_CHANGELOG.md` |
| `operations/docs/X3_REQUIREMENTS_AND_BUG_REGISTER.md` | `operations/archive/docs/reports/x3/X3_REQUIREMENTS_AND_BUG_REGISTER.md` | Historical X3 bug register superseded by X5.4 & X5.5 defect registers | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x3/X3_REQUIREMENTS_AND_BUG_REGISTER.md operations/docs/X3_REQUIREMENTS_AND_BUG_REGISTER.md` |
| `operations/docs/RESTRUCTURE_AUDIT.md` | `operations/archive/docs/reports/x3/RESTRUCTURE_AUDIT.md` | Historical X3 structure audit superseded by [`operations/docs/REPOSITORY_MAP.md`](../docs/REPOSITORY_MAP.md) | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x3/RESTRUCTURE_AUDIT.md operations/docs/RESTRUCTURE_AUDIT.md` |
| `operations/docs/RESTRUCTURING_REPORT.md` | `operations/archive/docs/reports/x3/RESTRUCTURING_REPORT.md` | Historical PR #1 restructuring summary superseded by [`operations/docs/REPOSITORY_MAP.md`](../docs/REPOSITORY_MAP.md) | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x3/RESTRUCTURING_REPORT.md operations/docs/RESTRUCTURING_REPORT.md` |
| `operations/docs/X4_DEPLOYMENT_REPORT.md` | `operations/archive/docs/reports/x4/X4_DEPLOYMENT_REPORT.md` | Historical X4 deployment report superseded by X5.3–X5.5 release reports | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x4/X4_DEPLOYMENT_REPORT.md operations/docs/X4_DEPLOYMENT_REPORT.md` |
| `operations/docs/X4_FULL_AUDIT.md` | `operations/archive/docs/reports/x4/X4_FULL_AUDIT.md` | Historical X4 audit superseded by X5.3–X5.5 audits | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x4/X4_FULL_AUDIT.md operations/docs/X4_FULL_AUDIT.md` |
| `operations/docs/X4_MARKET_SEARCH_AND_SCANNER.md` | `operations/archive/docs/reports/x4/X4_MARKET_SEARCH_AND_SCANNER.md` | Historical X4 search/scanner note superseded by X5.4/X5.5 scanner specs | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x4/X4_MARKET_SEARCH_AND_SCANNER.md operations/docs/X4_MARKET_SEARCH_AND_SCANNER.md` |
| `operations/docs/X4_PRODUCT_UX_SPEC.md` | `operations/archive/docs/reports/x4/X4_PRODUCT_UX_SPEC.md` | Historical X4 UX draft (contained pre-X5.3 2D map notes) superseded by X5.3–X5.5 specs | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x4/X4_PRODUCT_UX_SPEC.md operations/docs/X4_PRODUCT_UX_SPEC.md` |
| `operations/docs/X4_TEST_REPORT.md` | `operations/archive/docs/reports/x4/X4_TEST_REPORT.md` | Historical X4 test report superseded by X5.5 verification ledger | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/reports/x4/X4_TEST_REPORT.md operations/docs/X4_TEST_REPORT.md` |
| `operations/docs/X5_5_PROGRESS_LEDGER.md` | `operations/archive/docs/status/X5_5_PROGRESS_LEDGER.md` | Completed X5.5 working progress log superseded by [`operations/docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md`](../docs/X5_5_THREE_PHASE_AUDIT_RELEASE.md) | `0` code, test, script, or CI references (`git grep` verified) | `2026-11-23` | Low | `git mv operations/archive/docs/status/X5_5_PROGRESS_LEDGER.md operations/docs/X5_5_PROGRESS_LEDGER.md` |

### Batch A — X5.3 Consolidation (`2026-11-22 IST`)

| Old Path | New Path | Reason | Dependency Scan Evidence | Relocation Date | Risk | Restore Command |
| --- | --- | --- | --- | --- | --- | --- |
| `frontend/features/earth/world-conflict-map.tsx` | `operations/archive/frontend/features/earth/world-conflict-map.tsx` | X5.3 founder directive removing all 2D geographical maps and MapLibre runtime UI from Global (replaced by `frontend/features/global/strategic-globe.tsx` + `globe-canvas.tsx`) | `0` runtime imports; enforced by `tests/unit/x53-terminal-globe-evidence.test.mjs`; excluded in `tsconfig.json` & `eslint.config.mjs` | `2026-11-22` | Low | `git mv operations/archive/frontend/features/earth/world-conflict-map.tsx frontend/features/earth/world-conflict-map.tsx` |
| `frontend/features/earth/earth-map.css` | `operations/archive/frontend/features/earth/earth-map.css` | Stylesheet exclusively used by retired 2D MapLibre world map (replaced by `.x53-globe-*` in `frontend/styles/x51.css`) | `0` runtime imports; enforced by `tests/unit/x53-terminal-globe-evidence.test.mjs` | `2026-11-22` | Low | `git mv operations/archive/frontend/features/earth/earth-map.css frontend/features/earth/earth-map.css` |
| `operations/docs/archive/pre-x1/*` (15 files) | `operations/archive/docs/pre-x1/*` | Historical pre-X1 architecture, audit, and legal gate snapshots consolidated into single archive area | Referenced only by `operations/scripts/export-coverage.mjs` (`INSTRUMENT_COVERAGE.md`, `instrument-registry.json`) at this exact path | `2026-11-22` | Low | `git mv operations/archive/docs/pre-x1/<file> operations/docs/archive/pre-x1/<file>` |
| `operations/docs/archive/x1/*` (23 files) | `operations/archive/docs/x1/*` | Historical X1 specs, audits, and release reports consolidated into single archive area | `0` runtime/test dependencies | `2026-11-22` | Low | `git mv operations/archive/docs/x1/<file> operations/docs/archive/x1/<file>` |
| `operations/docs/reports/x2/*` (18 files) | `operations/archive/docs/reports/x2/*` | Historical X2 QA, baseline, and verification snapshots superseded by X5.3–X5.5 | `0` runtime/test dependencies | `2026-11-22` | Low | `git mv operations/archive/docs/reports/x2/<file> operations/docs/reports/x2/<file>` |
| `operations/docs/X4_PROGRESS.md` | `operations/archive/docs/status/X4_PROGRESS.md` | Superseded X4 working progress log | `0` runtime/test dependencies | `2026-11-22` | Low | `git mv operations/archive/docs/status/X4_PROGRESS.md operations/docs/X4_PROGRESS.md` |
| `operations/docs/X5_1_EXECUTION_STATUS.md` | `operations/archive/docs/status/X5_1_EXECUTION_STATUS.md` | Superseded X5.1 execution status tracker | `0` runtime/test dependencies | `2026-11-22` | Low | `git mv operations/archive/docs/status/X5_1_EXECUTION_STATUS.md operations/docs/X5_1_EXECUTION_STATUS.md` |

---

## 3. Why `operations/archive/` Remains Inside `operations/` (Instead of a 6th Root Directory `z_archive/`)

1. `tsconfig.json` (`exclude: ["operations/archive"]`) and `eslint.config.mjs` (`globalIgnores(["operations/archive/**"])`) explicitly exclude `operations/archive/` so that archived `.tsx` reference code (`world-conflict-map.tsx`) does not break `npm run typecheck` or `npm run lint`.
2. `operations/scripts/export-coverage.mjs` writes directly to `operations/archive/docs/pre-x1/INSTRUMENT_COVERAGE.md` and `operations/archive/docs/pre-x1/instrument-registry.json`.
3. `.gitignore` explicitly ignores `/operations/archive/docs/pre-x1/evidence/`.
4. `AGENTS.md` establishes `operations/archive/` as the repository's single canonical archive location, avoiding adding an extra top-level directory to the root tree.

---

## 4. How to Verify Changes to the Archive

```powershell
node operations/scripts/check-x2-release.mjs
node operations/scripts/scan-secrets.mjs
git diff --check
```
