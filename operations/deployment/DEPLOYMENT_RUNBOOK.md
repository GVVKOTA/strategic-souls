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
| **Cloudflare D1 Physical UUID** | `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` (live `0000`–`0020`; additive `0021_x3_soul_memory_and_repro.sql` staged for X 3.0) |
| **Cloudflare VPC Binding** | `MARKET_DATA_ADAPTER` (`01a2095b-f466-7c90-a813-4fad03735504`) |
| **Cloudflare Workers Builds Trigger** | `0727e904-48ad-4e75-9b26-1d2123ec5063` (GitHub `GVVKOTA/strategic-souls`, branch `main`) |
| **Workers Builds Configuration** | Updated to `root_directory: "/application"`, `build_command: "pnpm run build"`, `deploy_command: "node ../operations/scripts/check-production-release.mjs stage"` |
| **Known-Good Rollback Anchors** | Version #4 `87d2108e-eb02-49c9-a361-3b6eb6fceb3c` (pre-X3, `af16aae5fb3f32ce7472b4071c85eb5119f1cf20`); Version #45 `c14d457e-c3b7-4389-a106-91d936759d5c` (pre-consolidation `5ac5b5b`); pre-consolidation baseline `6a569bdb289f0ac64f2fafceb83ebaa7f8b842f6` (PR #16) |

> **CRITICAL:** Never create a new Worker, never create a new D1 database, never replace UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` with `00000000-0000-4000-8000-000000000000`, and never edit or re-run applied migrations `0000`–`0020` destructively on production D1.

---

## 2. How Production Deployment Works in This Repo

1. Merge the reviewed, green PR into `main` only after confirming Cloudflare Workers Builds Root Directory is set to `application`. Feature branches run GitHub verification and do not change production traffic.
2. On the existing Cloudflare Workers Builds trigger (with root `application`), run `pnpm run build` (inside `application/`), then run `node operations/scripts/check-production-release.mjs stage` (from repo root, or `node ../operations/scripts/check-production-release.mjs stage` inside `application/`). The stage command checks the clean build SHA, D1, VPC service, assets, version metadata and persistent variables. It uploads a `main-<sha>` version and emits its UUID, binding inventory and Cloudflare build UUID. An upload leaves production traffic unchanged.
3. Check out that exact `main` commit. Record the current deployment and the single version receiving 100% of traffic. Make the candidate available at 0%, verify the public host through the Cloudflare version override, and run authenticated smoke tests. Use version UUIDs from the deployment list and the stage record.

   ```powershell
   npx --prefix application wrangler deployments list --config application/dist/server/wrangler.json --json
   npx --prefix application wrangler versions deploy "$previous@100%" "$candidate@0%" --config application/dist/server/wrangler.json --yes
   node operations/scripts/check-production-release.mjs candidate $candidate
   ```

4. Confirm the same `main` SHA, verification checks, and expected version allocation immediately before promotion. Promote the verified candidate, then verify the public host without a version override.

   ```powershell
   npx --prefix application wrangler versions deploy "$candidate@100%" --config application/dist/server/wrangler.json --yes
   node operations/scripts/check-production-release.mjs live $candidate
   ```

   The live check records the commit, deployment, version, UTC time, traffic and public smoke results. Run owner, ordinary-user and mobile browser checks before closing the release. If Checks fail, restore `$previous@100%` and verify its identity. Keep the prior version available. A diagnostic version's tag cannot pass the candidate gate.

5. If Workers Builds is unavailable, build from the clean current remote `main` and run the same `stage`, `candidate`, and `live` checks with an authenticated Wrangler session. Keep the existing Worker and D1 bindings.

---

## 3. Mandatory Pre-Release Checklist (Every Gate Must Pass)

Before merging any branch into `main`:

1. **Repository Layout, Secret & Hygiene Scan (from repo root):**
   ```powershell
   node operations/scripts/check-repo-layout.mjs
   node --test operations/scripts/check-repo-layout.test.mjs operations/monitoring/monitor.test.mjs
   node operations/scripts/scan-secrets.mjs
   node operations/scripts/scan-v3-source.mjs
   git diff --check
   git status
   ```
   Confirm strictly six tracked root directories (`.github/`, `application/`, `archive/`, `database/`, `documentation/`, `operations/`) + `README.md`, non-runtime `archive/` isolation, and zero `.env`, `.dev.vars`, API keys, tokens, cookies, or private DB dumps tracked or staged.
2. **Automated Verification (from `application/`):**
   ```powershell
   cd application
   node tooling/check-x2-release.mjs
   pnpm.cmd audit --audit-level high
   uv run --project backend/quant pytest backend/quant/tests -q
   ```
3. **Production Worker Build & Generated Binding Check:**
   ```powershell
   cd application
   node tooling/run-framework.mjs build
   node ../operations/scripts/check-production-release.mjs artifact
   ```
   The artifact check verifies Worker `strategic-souls`, D1 `ss`, the existing VPC service (`MARKET_DATA_ADAPTER`), version provenance, generated assets, and the India API host inside `application/dist/server/wrangler.json`.
4. **Local Isolated Compiled-Worker Preview QA:**
   Launch `cd application && node tooling/local-preview.mjs launch`, open `http://127.0.0.1:5173`, verify 0 console errors, natural-color 3D Earth, unchanged UI text colors, mobile responsiveness (`320px`–`1440px`), standalone auth, watchlists, portfolios, 3-level Soul Scan, and Community. Stop server (`Ctrl + C`) when done.
5. **CI & Review:** Push branch (`git push -u origin <branch>`), verify `.github/workflows/verify.yml` passes on GitHub, and respect branch protections/reviews before merging to `main`.

---

## 4. Post-Deployment Verification (Do NOT Skip)

A `git push` or merge is **NOT** proof of deployment. After Workers Builds finishes:

1. Confirm the Cloudflare Workers Build status is `success` and record the new **Version ID**, **Deployment ID**, **Build UUID**, and **UTC timestamp**.
2. Verify read-only public routes return `HTTP 200` with CSP and HSTS headers at `https://strategic-souls.vishnukota20071005.workers.dev`:
   - Pages: `/`, `/workspace`, `/signin`, `/product`, `/how-it-works`, `/methodology`, `/pricing`, `/trust`, `/terms`, `/help`, `/legal/compliance`
   - Public JSON & static assets: `/api/health`, `/api/release`, `/api/markets/public`, `/api/auth/session`, `/data/earth-assets.json`, `/gvv-approved.jpg`
3. Verify private endpoints fail closed with `HTTP 401` and `Cache-Control: private, no-store`:
   - `/api/x1/workspace`
   - `/api/x2/providers`
4. Verify rendered HTML/assets reflect the newly released bundle and check browser console/mobile layout without creating spam accounts in live D1. See [`operations/monitoring/MONITORING_RUNBOOK.md`](../monitoring/MONITORING_RUNBOOK.md) for scheduled monitoring probes and GitHub Issues incident handling.

---

## 5. Secrets Management

Production secrets are stored **only** in Cloudflare Worker Secrets (`Workers & Pages -> strategic-souls -> Settings -> Variables and Secrets`, or `wrangler secret put <NAME>`):

| Secret Name | Purpose | Required Today? |
| --- | --- | --- |
| `X2_OWNER_SUBJECT` | Verified owner account ID authorizing owner-only Data Connections | Optional (fail-closed if unset) |
| `MARKET_ADAPTER_AUTH_TOKEN` | Owner-only VPC adapter credential | Required in production |
| `MARKET_DATA_API_KEY` | Universal X 3.0 provider-neutral commercial market-data API key | Recommended for universal gateway (falls back cleanly to provider-specific keys) |
| `BHARATSTOCK_API_KEY` | Encrypted BharatStock credential | Preserved by the release gate |
| `INDIA_API_KEY` | Encrypted Indian API credential | Preserved by the release gate |
| `X2_EODHD_API_TOKEN` | Licensed EODHD market-data API token | Optional (keyless fallback active) |
| `X2_TRUEDATA_BEARER_TOKEN` | Licensed TrueData historical bearer token | Optional (keyless fallback active) |
| `RESEND_API_KEY` | Outbound transactional email delivery (password reset & email verification) | Required to enable live email delivery (or use `SS_EMAIL_WEBHOOK_URL`) |
| `SS_EMAIL_WEBHOOK_URL` | Alternative HTTPS webhook transport for transactional auth emails | Optional alternative to `RESEND_API_KEY` |

- Never commit secret values, never store them in D1 tables, and never paste them in chat or PRs.
- Authentication uses first-party Cloudflare D1 email/password accounts only; Google OAuth routes and secrets are retired.
- `INDIA_API_HOST=stock.indianapi.in` is a server variable tracked in `vite.config.ts`.
- App middleware logs `pathname` only (never query strings), `auth-panel.tsx` strips `?reset_token=` on load, and Cloudflare Workers Logs query-string redaction should remain enabled in the Cloudflare Dashboard for `strategic-souls`.
- Scheduled Cron Triggers (`30 18 * * *` for 00:00 IST SOUL MEMORY reset + `*/15 * * * *` for scan job reaper & reference cache refresh) record heartbeats in `x9_system_heartbeats`, surfaced by `/api/health` and checked by `operations/monitoring/monitor.mjs`.

---

## 6. Instant Rollback & Cloudflare D1 Recovery

### Worker Code Rollback (Zero Data Loss, < 1 Minute)
If a new release introduces any regression:
1. **Cloudflare Dashboard:** Go to **Workers & Pages -> `strategic-souls` -> Deployments**, select the previous known-good version (e.g., Version #60 `c40e4906-23d7-4924-bfe3-69c5ec95159f`, or Version #45 `c14d457e-c3b7-4389-a106-91d936759d5c`), and click **Rollback to this version**.
2. **Or via Wrangler CLI:**
   ```powershell
   npx wrangler rollback --name strategic-souls
   ```
3. Immediately re-run the Section 4 smoke checks. **Never reset or drop D1 during a Worker rollback.** Additive X 3.0 tables (`0021_x3_soul_memory_and_repro.sql`) are strictly backward-compatible with previous Worker versions (rolling back code safely ignores the new `x9_*` tables without breaking older queries).

### D1 Database Backup & Recovery
- **Cloudflare Time Travel:** Cloudflare D1 (`ss`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) supports point-in-time Time Travel bookmarks (`npx --prefix application wrangler d1 time-travel info ss` / `restore`). Record a bookmark before applying `0021_x3_soul_memory_and_repro.sql` or any future additive migration.
- **Logical Export Backup & Full-Schema Restore Verification:** Before any migration, export a full SQL backup strictly outside Git (`npx --prefix application wrangler d1 export ss --remote --output <private-untracked-path>.sql`) and verify all 73+ schema tables, indexes, triggers, foreign keys, and immutability rules using `node operations/scripts/verify-logical-backup.mjs <private-untracked-path>.sql <private-untracked-restore-dir>`.
