# Deployment & Rollback Runbook (GitHub + Cloudflare Workers & D1)

This runbook documents the **exact verified production infrastructure** for **Strategic Souls** (`Global Vertex Vectors`) and how changes move safely from a developer's Windows PC to Cloudflare.

---

## 1. Verified Production Identity (NEVER Recreate or Replace)

| Resource | Exact Verified Value |
| --- | --- |
| **GitHub Repository** | `https://github.com/GVVKOTA/strategic-souls` (default branch: `main`) |
| **Live Production URL** | `https://strategic-souls.vishnukota20071005.workers.dev/` |
| **Cloudflare Account ID** | `2aebd1ad7593f7bba045eb56d9cabd58` |
| **Cloudflare Worker Name** | `strategic-souls` (script tag: `b0ad3e732c704e84a7aad4eff2aef4da`) |
| **Cloudflare D1 Database Name** | `ss` |
| **Cloudflare D1 Runtime Binding** | `DB` |
| **Cloudflare D1 Physical UUID** | `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` (43 tables, 11 immutability triggers, applied `drizzle/0000`–`0007`) |
| **Cloudflare Workers Builds Trigger** | `0727e904-48ad-4e75-9b26-1d2123ec5063` (GitHub `GVVKOTA/strategic-souls`, branch `main`) |
| **Known-Good Pre-X3 Rollback Version** | Version #4 `87d2108e-eb02-49c9-a361-3b6eb6fceb3c` (deployment `e623be58-b199-4952-84bb-c9171a65cce6`, commit `af16aae5fb3f32ce7472b4071c85eb5119f1cf20`) |

> **CRITICAL:** Never create a new Worker, never create a new D1 database, never replace UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` with `00000000-0000-4000-8000-000000000000`, and never edit or re-run applied migrations `0000`–`0007` destructively on production D1.

---

## 2. How Production Deployment Works in This Repo

1. **Primary Pipeline (Single Authoritative Path): Cloudflare Workers Builds on `main`**
   - Pushing to a **feature branch** runs `.github/workflows/verify.yml` CI only (does **not** deploy production).
   - Merging a reviewed PR into **`main`** triggers Cloudflare Workers Builds trigger `0727e904-48ad-4e75-9b26-1d2123ec5063`:
     - **Build command:** `pnpm run build` *(cleaned up from historical duplicate `npm run build\npnpm run build`)*
     - **Deploy command:** `npx wrangler deploy` (uses Vite/Cloudflare plugin generated `dist/server/wrangler.json`)
2. **Manual Fallback (Only if Workers Builds is unavailable and operator is authenticated with `wrangler login`):**
   - Never run bare `wrangler deploy` without first building (`npm.cmd run build`) and inspecting `dist/server/wrangler.json` to confirm:
     - `"name": "strategic-souls"`
     - `d1_databases[0].binding === "DB"`
     - `d1_databases[0].database_name === "ss"`
     - `d1_databases[0].database_id === "1cda2b05-6b99-4d04-896f-b3542ad2ce7f"`
   - Deploy strictly against that generated config: `npx wrangler deploy --config dist/server/wrangler.json`.

---

## 3. Mandatory Pre-Release Checklist (Every Gate Must Pass)

Before merging any branch into `main`:

1. **Secret & Hygiene Scan:**
   ```powershell
   node operations/scripts/scan-v3-source.mjs
   git diff --check
   git status
   ```
   Confirm zero `.env`, `.dev.vars`, API keys, tokens, cookies, or private DB dumps are tracked or staged.
2. **Automated Verification:**
   ```powershell
   node operations/scripts/check-x2-release.mjs
   pnpm.cmd audit --audit-level high
   uv run --project backend/quant pytest backend/quant/tests -q
   ```
3. **Production Worker Build & Generated Binding Check:**
   ```powershell
   node operations/scripts/run-framework.mjs build
   ```
   Verify `dist/server/wrangler.json` matches Worker `strategic-souls`, binding `DB`, DB `ss`, and UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`.
4. **Local Isolated Compiled-Worker Preview QA:**
   Launch `node operations/scripts/local-preview.mjs launch`, open `http://127.0.0.1:5173`, verify 0 console errors, natural-color 3D Earth, unchanged UI text colors, mobile responsiveness (`320px`–`1440px`), standalone auth, watchlists, portfolios, 3-level Soul Scan, and Community. Stop server (`Ctrl + C`) when done.
5. **CI & Review:** Push branch (`git push -u origin <branch>`), verify `.github/workflows/verify.yml` passes on GitHub, and respect branch protections/reviews before merging to `main`.

---

## 4. Post-Deployment Verification (Do NOT Skip)

A `git push` or merge is **NOT** proof of deployment. After Workers Builds finishes:

1. Confirm the Cloudflare Workers Build status is `success` and record the new **Version ID**, **Deployment ID**, **Build UUID**, and **UTC timestamp**.
2. Verify read-only public routes return `HTTP 200` with CSP and HSTS headers at `https://strategic-souls.vishnukota20071005.workers.dev`:
   - Pages: `/`, `/workspace`, `/signin`, `/product`, `/how-it-works`, `/methodology`, `/pricing`, `/trust`, `/terms`, `/help`, `/legal/compliance`
   - Public JSON & static assets: `/api/release`, `/api/markets/public`, `/api/auth/session`, `/data/earth-assets.json`, `/gvv-approved.jpg`
3. Verify private endpoints fail closed with `HTTP 401` and `Cache-Control: private, no-store`:
   - `/api/x1/workspace`
   - `/api/x2/providers`
4. Verify rendered HTML/assets reflect the newly released bundle and check browser console/mobile layout without creating spam accounts in live D1.

---

## 5. Secrets Management

Production secrets are stored **only** in Cloudflare Worker Secrets (`Workers & Pages -> strategic-souls -> Settings -> Variables and Secrets`, or `wrangler secret put <NAME>`):

| Secret Name | Purpose | Required Today? |
| --- | --- | --- |
| `X2_OWNER_SUBJECT` | Verified owner account ID authorizing owner-only Data Connections | Optional (fail-closed if unset) |
| `X2_EODHD_API_TOKEN` | Licensed EODHD market-data API token | Optional (keyless fallback active) |
| `X2_TRUEDATA_BEARER_TOKEN` | Licensed TrueData historical bearer token | Optional (keyless fallback active) |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth 2.0 client ID | Optional (email/password active) |
| `GOOGLE_CLIENT_SECRET` | Optional Google OAuth 2.0 client secret | Optional (email/password active) |

- Never commit secret values, never store them in D1 tables, and never paste them in chat or PRs.
- Cloudflare Worker observability `redact_query_string` should remain enabled (`true`) so URL query parameters are not logged in plaintext.

---

## 6. Instant Rollback & Cloudflare D1 Recovery

### Worker Code Rollback (Zero Data Loss, < 1 Minute)
If a new release introduces any regression:
1. **Cloudflare Dashboard:** Go to **Workers & Pages -> `strategic-souls` -> Deployments**, select the previous known-good version (e.g., Version #4 `87d2108e-eb02-49c9-a361-3b6eb6fceb3c`), and click **Rollback to this version**.
2. **Or via Wrangler CLI:**
   ```powershell
   npx wrangler rollback --name strategic-souls
   ```
3. Immediately re-run the Section 4 smoke checks. **Never reset or drop D1 during a Worker rollback.**

### D1 Database Backup & Recovery
- **Cloudflare Time Travel:** Cloudflare D1 (`ss`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) supports point-in-time Time Travel bookmarks (`wrangler d1 time-travel info ss` / `restore`). Record a bookmark before any future approved additive migration (`0008+`).
- **Logical Export Backup:** Before any future approved schema migration, export an encrypted/private local backup via `wrangler d1 export ss --remote --output <private-untracked-path>.sql` (kept strictly outside Git) and verify logical restore compatibility using `operations/scripts/verify-logical-backup.mjs`.
