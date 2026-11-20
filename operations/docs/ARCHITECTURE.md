# Strategic Souls Architecture

## Request Flow

1. **Routing (`app/`):** Vinext discovers Next.js-style page routes (`/`, `/workspace`, `/signin`, `/legacy`, `/asset/[label]`, `/legal/[slug]`, `/[slug]`) and API handlers (`/api/auth/*`, `/api/markets/public`, `/api/release`, `/api/x1/*`, `/api/x2/*`, `/api/v3/*`, `/api/[...path]`). Root `app/layout.tsx` loads stylesheets in strict canonical token order (`globals.css` -> `v3.css` -> `x1.css` -> `globe-visual.css` -> `motion.css` -> `x2.css`).
2. **Cloudflare Worker Entrypoint (`backend/middleware/index.ts`):** Delegates requests to Vinext and enforces strict CSP (`script-src 'self' 'unsafe-inline'`), HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `private, no-store` caching on personalized API endpoints.
3. **Standalone Authentication (`backend/auth/session.ts` & `app/api/auth/[...action]/route.ts`):**
   - Email/password accounts stored in D1 (`auth_users`, `auth_sessions`) with salted `PBKDF2-SHA256` password hashing (100,000 iterations), SHA-256 hashed `HttpOnly; SameSite=Lax; Secure` session cookies, constant-time token comparison, and automatic session rotation on sign-in.
   - Optional Google OAuth 2.0 + PKCE (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) with constant-time state verification, bounded 8s upstream fetch timeouts (`redirect: "manual"`), and cookie cleanup on error.
   - Zero OpenAI/ChatGPT login dependency.
4. **Server-Side Authorization & Services (`backend/middleware/security.ts`, `backend/services/`):** Every protected read and mutation enforces same-origin CSRF checks, bounded JSON payloads, active session authentication, current user consent, and resource-level ownership/group-role checks on the server.
5. **Persistence (`database/` & `drizzle/`):** Services access Cloudflare D1 (`env.DB`) through Drizzle ORM (`database/schemas/`, `database/queries/`). Applied chronological SQL migrations (`drizzle/0000` through `drizzle/0007`) enforce table structure and SQLite immutability triggers on scan snapshots, ledgers, and revision histories.
6. **Frontend Workspaces (`frontend/`):** React 19 + TypeScript workspace shell (`frontend/components/workspace/workspace.tsx`) renders three top-level tabs — **Global**, **Strategy**, and **Community** — with branded non-blocking skeleton loaders (`WorkspaceSkeleton`), System/Minimal motion preference, and preserved neutral matte-black/silver/blue UI text colors.

## Feature Ownership Map

| Feature | Frontend (`frontend/`) | API (`app/api/`) & Backend (`backend/`) |
| --- | --- | --- |
| **Shell, Navigation, Search, Onboarding, Auth UI** | `frontend/components/workspace/`, `frontend/features/auth/` | `app/api/auth/[...action]/route.ts`, `app/api/[...path]/route.ts`, `backend/auth/session.ts` |
| **Global:** Natural-color 3D Earth, 24 exchange clocks, ECB/Treasury feeds, watchlists, manual portfolios, Asset Terminal, owner Data Connections | `frontend/features/global/` (`dashboard.tsx`, `globe-canvas.tsx`, `asset-terminal.tsx`, `data-control.tsx`) | `app/api/markets/public/route.ts`, `app/api/x1/markets/route.ts`, `app/api/x2/data/route.ts`, `app/api/x2/providers/route.ts`, `backend/services/market-data/`, `backend/engines/portfolio.ts`, `backend/engines/chart-analytics.ts` |
| **Strategy:** 3-level Soul Scan (Beginner default / Intermediate / Advanced), Preflight, Scan History, Graveyard, Market Radar, Formula Lab, Research Glossary | `frontend/features/strategy/` (`workspace.tsx`, `controls.tsx`, `formula-lab.tsx`) | `app/api/x1/workspace/route.ts`, `backend/services/research/`, `backend/engines/scan.ts`, `backend/engines/backtest.ts`, `backend/engines/math.ts` |
| **Community:** Bodies, private/discoverable groups, invites, join requests, shared Souls & revision diffs, posts, Supers, comments, DMs, moderation | `frontend/features/community/` (`dashboard.tsx`, `social-workspace.tsx`) | `app/api/x1/community/route.ts`, `app/api/x2/social/route.ts`, `backend/services/community/` |
| **Legacy Notebook (`/legacy`)** | `frontend/features/legacy/` | `backend/services/legacy/`, `database/queries/notebook-repository.ts` |
| **Optional V3 Local Stack (Off by default)** | `frontend/features/v3/` | `app/api/v3/[...segments]/route.ts`, `backend/services/v3/`, `supabase/`, `backend/quant/` |

### Canonical Engine Guarantees

- **One Soul Scan AST:** Beginner presets (`BEGINNER_SCAN_PRESETS`), Intermediate nested `ALL`/`ANY`/`NOT` trees (`RuleEditor`), and Advanced formulas all compile through `backend/engines/scan.ts` into the exact same deterministic AST and 3-valued (`PASS` / `FAIL` / `UNKNOWN`) evaluator.
- **Provider Isolation:** Server-side adapters (`EODHD`, `TrueData`, and keyless `ECB`/`US Treasury`) live strictly in `backend/services/market-data/`. Secrets are read from Cloudflare Worker runtime `env` only — never committed, stored in D1, or sent to the browser. Display vs. derived-display vs. non-display/storage rights are enforced independently of key presence.
- **Natural-Color 3D Earth:** Raw WebGL2/WebGL1 shader in `frontend/features/global/globe-canvas.tsx` renders authentic NASA Blue Marble, Black Marble 2016 night lights, translucent historical cloud cover, ocean specular highlight, approximate UTC solar terminator (`solarDirection` in `backend/services/market-data/globe.ts`), and restrained blue Rayleigh Fresnel rim. Static fallback (`globe-visual.css`) renders in natural color with accessible exchange list and retry.

## Database & Production Deployment Topology

- **Production Cloudflare Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)
- **Production Cloudflare D1 Database:** `ss`, binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` (43 tables + 11 immutability triggers live across migrations `0000`–`0007`).
- **Schema & Migrations:** `database/schemas/` defines the Drizzle ORM model; root `drizzle/` holds the ordered applied D1 migrations. Never modify or reorder applied migrations.
- **Optional V3 Stack:** Root `supabase/` (PostgreSQL + RLS) and `backend/quant/` (Python + DuckDB/NumPy/PyArrow) remain strictly separate from core X2/X3 Cloudflare D1 persistence.
- **CI & Production Builds:**
  - `.github/workflows/verify.yml` runs on every push and pull request (`typecheck`, `lint:app`, `test`, `build`).
  - `.github/workflows/verify-v3.yml` is manual (`workflow_dispatch`) for the optional Python quant + local Docker/Supabase stack.
  - Production deploys via **Cloudflare Workers Builds** linked to GitHub `GVVKOTA/strategic-souls` branch `main` (build command: `pnpm run build`, deploy command: `npx wrangler deploy`). Generated config `dist/server/wrangler.json` is verified before release to preserve the exact existing Worker name and D1 UUID. See [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md).
