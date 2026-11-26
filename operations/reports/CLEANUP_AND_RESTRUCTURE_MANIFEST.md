# Cleanup & Five-Folder Consolidation Manifest

**Repository:** `GVVKOTA/strategic-souls`  
**Branch:** `refactor/five-folder-repository`  
**Base / Recovery Commit:** `6a569bdb289f0ac64f2fafceb83ebaa7f8b842f6` (`origin/main`, PR #16; local recovery ref: `recovery/pre-refactor-6a569bd`)  
**Date:** 26 November 2026  

---

## 1. Final Tracked Repository Tree

```text
strategic-souls/
├── .github/                  # CI workflows (2 files)
├── application/              # Vinext / Next App Router / Cloudflare Worker project root (375 files)
├── database/                 # Canonical 21 D1 SQL migrations + Drizzle meta + Supabase V3 stack (40 files)
├── documentation/            # Consolidated architecture, dev, market-data, rights, changelog & specs (10 files)
├── operations/               # Deployment runbook, operational scripts & this manifest (19 files)
└── README.md                 # Single tracked root file (1 file)
```

---

## 2. Before vs. After Tracked Repository Counts

| Metric | Baseline (`6a569bdb289f0ac64f2fafceb83ebaa7f8b842f6`) | Post-Consolidation |
| --- | ---: | ---: |
| Tracked files | `637` | `447` |
| Tracked subdirectories | `139` | `116` |
| Tracked top-level directories | `11` (`.github`, `app`, `backend`, `database`, `drizzle`, `frontend`, `operations`, `public`, `scripts`, `supabase`, `tests`) | **`5`** (`.github`, `application`, `database`, `documentation`, `operations`) |
| Tracked root-level files | `20` | **`1`** (`README.md`) |
| JS lockfiles | `1` (`pnpm-lock.yaml`) | `1` (`application/pnpm-lock.yaml`) |

---

## 3. Structural Path Mapping (Old -> New)

| Baseline Path | New Canonical Path | Notes |
| --- | --- | --- |
| `app/`, `frontend/`, `backend/`, `database/`, `public/`, `tests/` | `application/app/`, `application/frontend/`, `application/backend/`, `application/database/`, `application/public/`, `application/tests/` | Preserves Next/Vinext routing, `@/*` aliases, Worker entrypoint `./backend/middleware/index.ts`, and `/` static assets inside `application/`. |
| `scripts/install-pnpm.sh` | `application/scripts/install-pnpm.sh` | Preserves managed Sites fixed-path wrapper relative to `application/`, delegating to `application/tooling/install-pnpm.sh`. |
| `operations/scripts/{execution-profile,tool-environment,sites-env,run-framework,pnpm-install,local-preview,check-x2-release,ts-node-hooks}.mjs` + `{sites-env,build-verified,install-pnpm}.sh` | `application/tooling/*` | Co-locates build, preview, test-runner, and installer helpers inside the JS project root. |
| Root configs (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.json`, `vite.config.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `drizzle.config.ts`, `cloudflare-env.d.ts`, `AGENTS.md`, `.env.example`, `.dev.vars.example`) | `application/<file>` | Consolidated inside `application/`; scoped `application/.gitignore` and `application/.gitattributes` replace root `.gitignore`/`.gitattributes`. |
| `drizzle/` (`0000`–`0020` + `meta/`) | `database/migrations/` | Byte-for-byte preserved canonical D1 migration history; configured via `application/drizzle.config.ts` (`out: "../database/migrations"`). |
| `supabase/` (9 files) | `database/supabase/` | Retained V3 PostgreSQL/Supabase config & RLS migrations; invoked via `--workdir ../database` (or `--workdir database`). |
| `SOURCE_PROVENANCE.json` | `documentation/SOURCE_PROVENANCE.json` | Preserved historical provenance with added consolidation note. |
| `operations/docs/` + `operations/reports/` (selected specs) | `documentation/` (`ARCHITECTURE.md`, `DEVELOPMENT.md`, `MARKET_DATA.md`, `SECURITY_AND_DATA_RIGHTS.md`, `CHANGELOG.md`, `specs/*`) | Eliminates overlapping phase logs while retaining all current specs, compliance/legal gates, NASA Earth/Nifty500 provenance, and setup/capacity facts. |
| `operations/docs/DEPLOYMENT_RUNBOOK.md` | `operations/deployment/DEPLOYMENT_RUNBOOK.md` | Updated with `application/` build root & verification paths. |
| Remaining operational scripts (`check-production-release.mjs`, `scan-secrets.mjs`, `scan-v3-source.mjs`, `backup-*`, `verify-logical-backup.mjs`, `setup-broker-secrets.mjs`, `start-market-adapter.mjs`, `verify-angelone-live.mjs`, `test-supabase-local.mjs`, `write-local-env.mjs`, PowerShell/BAT helpers) | `operations/scripts/` (+ `repo-paths.mjs`, `check-repo-layout.mjs`) | Uses canonical `repo-paths.mjs` so scripts succeed regardless of invocation working directory. |

---

## 4. Removed Files & Categories (Evidence-Backed)

| Category / Path | Count | Verification Evidence & Removal Reason |
| --- | ---: | --- |
| `operations/archive/` | `73` | Marked historical non-authoritative in prior `archive/README.md`; superseded by active codebase and `documentation/CHANGELOG.md`. Recoverable in Git (`recovery/pre-refactor-6a569bd`). |
| Unused shadcn/ui template files (`frontend/components/ui/`, `components/utils.ts`, `hooks/use-mobile.ts`, `styles/vendor/`, `components.json`) | `61` | Zero imports across `app/`, `backend/`, `database/`, `tests/`, or active `frontend/` modules/CSS; excluded from active app bundle. |
| Overlapping/superseded docs & chronological reports (`operations/docs/*` + 13 `operations/reports/*.md` + `operations/README.md` + `SS_REORGANIZATION_MANIFEST.json`) | `48` | Chronological X1–X7/V3/public status ledgers and superseded reorganization veto report consolidated into `documentation/*`, `operations/deployment/DEPLOYMENT_RUNBOOK.md`, and this manifest. |
| `public/downloads/` + `operations/scripts/build-reference.mjs` + `/legacy` `Download README` link | `4` | Stale pre-X1 Nov-7 standalone reference HTML/Markdown exports unreferenced by active routes or tests. `/legacy` route & private account JSON export remain intact. |
| Obsolete npm-ci installers (`operations/scripts/install-ci.{sh,mjs}`, `npm-install.mjs`) | `3` | Referenced non-existent `package-lock.json`; project uses `pnpm@11.25.0` and `install-pnpm.sh` + `pnpm-install.mjs`. |
| `operations/examples/` (`d1/...`) | `2` | Broken reference snippet importing non-existent `../../../../../db`; excluded by `tsconfig.json` & `eslint.config.mjs`. |
| `X6_PROGRESS.md`, `scroll-tabs.tsx`, `export-coverage.mjs` | `3` | Obsolete scratchpad (`X6_PROGRESS.md`), zero-importer retired UI tab (`scroll-tabs.tsx`), and dead script writing into archived docs (`export-coverage.mjs`). |

*(Total removed tracked files above, net of new canonical docs/helpers/scripts: `637 -> 447`.)*

---

## 5. Explicitly Retained Subsystems & Rationale

| Component / Dependency | Evidence of Active Use | Decision |
| --- | --- | --- |
| **Angel One VPC Gateway (`backend/services/market-data/angelone/*`)** | Actively imported by `app/api/strategy/scan/route.ts`, `app/api/market/*`, `data-service.ts`, `nine-card-markets.ts`, `vite.config.ts` (`MARKET_DATA_ADAPTER`), and unit/integration suites. | **Retain** (owner-only gated). |
| **Legacy Workspace (`/legacy`, `frontend/features/legacy/*`, `backend/services/legacy/*`)** | Linked from `workspace.tsx` and `settings-view.tsx`; `backend/services/legacy/*` imported by active routes, instruments, and `notebook-repository.ts`. | **Retain** cleanly. |
| **Supabase V3 / API (`/api/v3/*`, `database/supabase/`, `frontend/features/v3/*`, `styles/v3.css`)** | `V3_LEGAL` used in `/legal/[slug]`; `v3-postgres.test.mjs` replays all 6 Supabase SQL RLS migrations via PGlite in `pnpm test`; `x1-palette.test.mjs` asserts against `v3.css` and `features/v3/workspace.tsx`. | **Retain** cleanly. |
| **Python Quant Package (`backend/quant/`)** | `29 / 29` pytest tests pass (`souls_quant` + `uv.lock`) and run in `verify-v3.yml`. | **Retain** cleanly. |
| **`maplibre-gl` + `regional-map.tsx`** | Actively imported by `frontend/features/global/regional-map.tsx` and dynamically loaded by `strategic-globe.tsx`. | **Retain** cleanly. |
| **20 unused shadcn transitive packages in `application/package.json`** (`@base-ui/react`, `@shadcn/react`, `recharts`, `zod`, `tw-animate-css`, etc.) | Pruning `pnpm-lock.yaml` offline failed on `ERR_PNPM_MISSING_TIME` under strict `pnpm-workspace.yaml` (`minimumReleaseAge: 10080`, `trustLockfile: false`) without online registry resolution. Per zero-upgrade constraint, kept `pnpm-lock.yaml` locked and unmodified. Safe candidate for a separate lockfile-pruning PR later. | **Retain locked** in this refactor. |

---

## 6. D1 Migration & Protected Asset Integrity (SHA-256 Verified: 41 / 41 Byte-Identical)

Every applied SQL migration (`0000`–`0020`), Drizzle `meta/_journal.json` + snapshots (`0000`–`0006`), Supabase migration (`20261114000100`–`20261114000600`), approved GVV logo, and NASA Earth asset matched baseline SHA-256 checksums (`checked=41, mismatched=0`):

| Migration / Asset | Preserved SHA-256 |
| --- | --- |
| `database/migrations/0000_bent_reptil.sql` | `f77f1d39da1d0315f32465c87043c29f0f82468df31a9a10f660c1397ecc5603` |
| `database/migrations/0001_early_hawkeye.sql` | `db271841696695849b8b9d69a66af54b4b37bf587837eb7c0bf35e4dee3f9728` |
| `database/migrations/0002_aberrant_nighthawk.sql` | `6d72fe67a65e34588e68c6847fc666d5c1e00d171c3f60a07c2dd09b9e84d1f1` |
| `database/migrations/0003_peaceful_smasher.sql` | `99a7d62975dcd1b2c20faa7d4e47763cb65c4d63537ebc35809024db9a4210ca` |
| `database/migrations/0004_thankful_talisman.sql` | `21d89c01979717afde036ceb4f0ab8c3f2468f71a4c4e488f290b1c1c30366f8` |
| `database/migrations/0005_x1_immutability.sql` | `90679107b5dda9b1b1c998157cf94ea81584353ef8d02c06925cc98ff2559228` |
| `database/migrations/0006_low_norrin_radd.sql` | `92cfd1b7d1294796b596a290aa6146fbb93fe5769775e241e6c9ee230e235b91` |
| `database/migrations/0007_standalone_auth.sql` | `bd9702f6c264b63550378d4e03ed478e8fa0503388699cabc8f29d7250e9374e` |
| `database/migrations/0008_x51_foundation.sql` | `f2bb80b202b1b170904685beb9fcaab9ea5a165734c62a16181b24ee62a04e2c` |
| `database/migrations/0009_x52_intelligence_and_pulse.sql` | `eae48cc02138ed59468f5442f58aedffaa8ba6f90c9eb6a224dd16520adde10e` |
| `database/migrations/0010_x56_profile_state_and_banner.sql` | `d3b050ac8d944ba7889989fea8acda83c04adba89620d1508d50458410391308` |
| `database/migrations/0011_v3_release_candidate.sql` | `0a0c3bc9456ab9d69937c75935d619232f8a057735934a79789bf83ee9fd47cf` |
| `database/migrations/0012_x78_market_scans.sql` | `dfe113b83d7a25066706713c15ce7b002895215d36056e8cbf1923b3d6c94437` |
| `database/migrations/0013_x8_shared_history.sql` | `7db1d39c4c29cb68a65cfdebbe0386f544dec6c1b63a8edc80ca7c7bc0fdecf5` |
| `database/migrations/0014_x1_constituent_grants.sql` | `49bf7b5e02d8f8ee8be8ae6244c78929d166d4f8d40aa228f074a168a5803cf2` |
| `database/migrations/0015_x1_price_alerts.sql` | `05be34454bcd7f20087e59cfc91dabef3554a1ef8a2423f96a2188002eea03c1` |
| `database/migrations/0016_x1_soul_deletion.sql` | `1c662c0d1f310d7b544e8e296f322092c302ec8b38e2b196edd740b44a990fc0` |
| `database/migrations/0017_x1_portfolio_corrections.sql` | `3fe5016036311ff54d77f21ec069ac72a46e3c67725ae3ddd8ab748dcfda2b56` |
| `database/migrations/0018_x1_company_reports.sql` | `4ac9c4da610f622e844e8e42b970922d81ee0286718f6e1e040e7572397d8deb` |
| `database/migrations/0019_x1_notice_entitlements.sql` | `401fa9c690ad02d61dbea7912801761a9a523100ff6f3de0156cfb12bfd747d8` |
| `database/migrations/0020_official_reference_cache.sql` | `7d7bc08846652d3e8ea749c26960fc761ee7d010edbcc6875a57b36a73584180` |
| `application/public/gvv-approved.jpg` | `7512003e8e05bf88c75ecb1b62b418000d61b9d4eedd560531017bc002288fab` |

*(Drizzle `meta/0000`–`0006_snapshot.json`, `meta/_journal.json`, 6 Supabase migrations, `earth-assets.json`, and 4 NASA Earth JPEGs also matched SHA-256 byte-for-byte.)*

---

## 7. Verification Comparison (Baseline `6a569bd` vs. Post-Change)

| Check | Baseline (`6a569bd`) | Post-Change (`refactor/five-folder-repository`) |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS (660 pkgs) | PASS inside `application/` (660 pkgs, offline) |
| TypeScript (`tsc --noEmit`) | PASS (0 errors) | PASS (0 errors) |
| ESLint (`app frontend backend database`) | PASS (0 errors, 12 warnings) | PASS (0 errors, 12 warnings) |
| Node unit + integration suite (`43` files) | `372 / 372` PASS (`0` skipped) | `372 / 372` PASS (`0` skipped) |
| Python quant `pytest` | `29 / 29` PASS | `29 / 29` PASS |
| Production Vinext/Worker build | PASS (5/5 envs) | PASS (5/5 envs, `dist/server/wrangler.json` bindings exact) |
| Release artifact SHA check (`check-production-release.mjs artifact`) | PASS | Verified after commit on clean `HEAD` |
| Secret & source hygiene scans | `0` findings (`scan-secrets.mjs` & `scan-v3-source.mjs`) | `0` findings |
| Repo root layout check (`check-repo-layout.mjs`) | N/A | PASS (strictly 5 root dirs + `README.md`, 1 lockfile) |
| Local D1 migration replay (`local-preview.mjs setup` + `verify-logical-backup.mjs`) | N/A | PASS (`0000`–`0020` applied; isolated restore + trigger checks PASS) |
| Compiled Worker loopback HTTP smoke (`local-preview.mjs serve`) | N/A | PASS (routes, assets, fail-closed `401`, CSRF `403`, removed `/downloads/*` `404`) |
| Full containerized Docker Supabase stack (`test-supabase-local.mjs`) | NOT RUN | NOT RUN (no `docker` binary in local Windows PATH; PGlite RLS tests PASS) |

---

## 8. Configuration Changes & Required External Action Before Merge

1. **Cloudflare Workers Builds Root Directory (EXTERNAL ACTION REQUIRED):**  
   - **Old Setting:** `/` (repository root)  
   - **New Required Setting:** `application` (in Cloudflare Dashboard -> Workers Builds trigger `0727e904-48ad-4e75-9b26-1d2123ec5063` before merging to `main`).  
   - **Build / Artifact Root:** `cd application && pnpm install --frozen-lockfile && pnpm run build`, producing `application/dist/server/wrangler.json`.
2. **No production deployment, `main` merge, or D1 write executed.** Local branch remains unmerged at `refactor/five-folder-repository`.

---

## 9. Safe Rollback Procedure

- **Pre-Refactor Git Recovery Point:** `recovery/pre-refactor-6a569bd` (`6a569bdb289f0ac64f2fafceb83ebaa7f8b842f6`, PR #16).  
- **To discard refactor locally:** Switch back to `main` or `recovery/pre-refactor-6a569bd`; remove local worktree `strategic-souls-refactor` if no longer needed.  
- **If merged later and rollback is needed:** Revert the merge commit via `git revert -m 1 <merge-sha>` on a PR (never force-push `main`), restore Workers Builds Root Directory back to `/`, and leave production D1 `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) intact.
