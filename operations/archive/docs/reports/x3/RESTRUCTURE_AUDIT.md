# Strategic Souls — Five-Area Restructure Audit (X3 Baseline)

**Recorded:** 2026-11-21 IST
**Repository:** `https://github.com/GVVKOTA/strategic-souls.git`
**Baseline `main` HEAD:** `af16aae5fb3f32ce7472b4071c85eb5119f1cf20`
**Working Branch:** `feat/x3-strategic-souls-upgrade`
**Local Checkout Verified:** `D:\Project SS\strategic-souls` (clean working tree at audit start)

---

## 1. Five Primary Ownership Areas (Verified at Current HEAD)

The repository was previously reorganized in PR #1 (`112a451`, merged `dcde139`) into the five primary development ownership areas. No cosmetic mass moves are required or advisable; existing paths, aliases (`@/*`), D1 migration chronology, and framework discovery hooks are already aligned.

| Ownership Area | Path | Owner Scope & Contents |
| :--- | :--- | :--- |
| **1. Frontend** | `frontend/` | User interface, workspaces (`features/global`, `features/strategy`, `features/community`, `features/auth`, `features/legacy`, `features/v3`), shared primitives (`components/ui`, `components/workspace`), hooks (`hooks/`), and canonical styles (`styles/`). |
| **2. Backend** | `backend/` | Standalone Cloudflare D1 auth & optional PKCE Google OAuth (`auth/`), Worker fetch/security middleware (`middleware/`), deterministic research/math/portfolio/scan/backtest engines (`engines/`), domain services (`services/market-data`, `services/research`, `services/community`, `services/legacy`, `services/v3`), external embeds (`integrations/`), and optional Python quant worker (`quant/`). |
| **3. Database** | `database/` | Drizzle ORM Cloudflare D1 SQLite schemas (`schemas/`) and parameterized query helpers (`queries/`). |
| **4. Public** | `public/` | Framework-served static assets: approved GVV eclipse logo (`gvv-approved.jpg`), favicons, self-hosted WOFF2 fonts + SIL OFL licenses (`fonts/`), NASA Blue/Black Marble historical textures + provenance JSON (`data/`), and legacy offline downloads (`downloads/`). |
| **5. Operations** | `operations/` | Architecture, security, developer, visual, release, and API setup docs (`docs/`), build/preview/release/backup scripts (`scripts/`), and reference examples (`examples/`). |

---

## 2. Legitimate Root & Framework Exceptions (Preserved In Place)

These root directories and files MUST stay at the repository root to preserve framework discovery, CI, and applied D1 migration chronology:

| Root Path | Why It Stays at Root | Migration / Impact |
| :--- | :--- | :--- |
| `app/` | Vinext / Next.js App Router file-based page & API route discovery (`/`, `/workspace`, `/signin`, `/[slug]`, `/asset/[label]`, `/legal/[slug]`, `/api/*`). | Keep at root; routes stay thin and delegate to `frontend/` and `backend/`. |
| `drizzle/` | Applied Cloudflare D1 SQL migrations (`0000` through `0007`) and Drizzle journal/snapshots. All 43 tables and 11 immutability triggers are already applied on production D1 `ss`. | **NEVER** reorder, squash, edit, or relocate applied migrations. |
| `supabase/` | Optional V3 local Supabase CLI configuration, email OTP template (`templates/code.html`), and 6 PostgreSQL RLS migrations. | Keep at root so `supabase start` and `.github/workflows/verify-v3.yml` continue resolving paths. |
| `.github/` | GitHub Actions workflows (`verify.yml`, `verify-v3.yml`). | Required by GitHub Actions discovery. |
| `tests/` | Automated Node.js test runner discovery (`tests/unit/*.test.mjs`, `tests/integration/*.test.mjs`; 250 baseline tests). | Retained at root for `package.json` `test` and `verify:x2` scripts. |
| `scripts/` | Fixed-path installer shim (`scripts/install-pnpm.sh`) delegating to `operations/scripts/install-pnpm.sh`. | Preserved for compatibility. |
| Root config files | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `vite.config.ts`, `next.config.ts`, `tsconfig.json`, `drizzle.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `cloudflare-env.d.ts`, `.env.example`, `.gitignore`, `.gitattributes`, `README.md`, `AGENTS.md`, `SOURCE_PROVENANCE.json`. | Required by Vite, Vinext, TypeScript, Drizzle Kit, ESLint, pnpm, and Wrangler. |

---

## 3. Structural Defects & Cleanup Plan (Before -> After Map)

| Current Path | Planned Action | Rationale & Risk |
| :--- | :--- | :--- |
| `Read me.md` | **Remove** (after verifying all valid content is covered in `README.md`) | Duplicate obsolete plain-text draft superseded by `README.md`. Zero code imports reference it (`git grep` verified). Low risk. |
| `README.md` | **Rewrite / Consolidate** | Still contains stale ChatGPT Sites deployment text (`reconcile reviewed GitHub changes into the hosted ChatGPT Sites release pipeline`) and lacks Windows PowerShell `pnpm.cmd`/`npm.cmd` execution-policy guidance and a cousin-friendly 1-minute map. |
| `AGENTS.md` | **Update truthfully** | Still claims `GitHub push does not deploy` and references ChatGPT Sites project `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0` as the release target instead of the verified Cloudflare Worker `strategic-souls` + D1 `ss`. |
| `operations/docs/ARCHITECTURE.md` | **Update truthfully** | Still claims `Private handlers read native ChatGPT identity` and Sites deployment. Reconcile with actual D1 auth (`backend/auth/session.ts`) and Cloudflare Workers Builds. |
| `operations/docs/DEVELOPER_GUIDE.md` | **Update truthfully** | Still claims local preview uses a `fictional account`; actual `local-preview.mjs` runs real standalone D1 signup/sign-in on an isolated local database. Add PowerShell `npm.cmd`/`pnpm.cmd` guidance. |
| `frontend/README.md`, `backend/README.md`, `database/README.md`, `public/README.md` | **Add concise area guides** | Makes each of the five ownership areas immediately self-documenting for the owner's cousin without moving source files or breaking imports. |
| `public/downloads/*` | **Preserve (verified clean)** | Automated scan confirmed `0` email addresses and `0` secret patterns across all three legacy download files. |

---

## 4. Import, Migration, and CI Risk Matrix

- **Import aliases:** Zero TypeScript/CSS file moves in `app/`, `frontend/`, `backend/`, or `database/`; zero risk of broken imports or route 404s.
- **D1 migration chronology:** `drizzle/0000`–`0007` untouched; zero schema drift against production D1 `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`).
- **CI impact:** `.github/workflows/verify.yml` runs `npm run verify` (`typecheck`, `lint:app`, `test`) and `npm run build`. All new regression tests will be picked up automatically under `tests/unit/` and `tests/integration/`.
