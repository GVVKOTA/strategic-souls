# Database Migrations & Lifecycle (`database/`)

This top-level directory owns the persistent schema migration histories and database operational procedures for **Strategic Souls**, separated cleanly from runtime TypeScript Drizzle schema definitions inside [`application/database/`](../application/database/).

---

## Directory Structure

| Path | Ownership & Contents | Tooling / Configuration |
| --- | --- | --- |
| `database/migrations/` | Canonical **21 Cloudflare D1 SQLite migrations** (`0000_bent_reptil.sql` through `0020_official_reference_cache.sql`) + `meta/` (`_journal.json` and `0000`–`0006` snapshots). | Configured in [`application/drizzle.config.ts`](../application/drizzle.config.ts) (`out: "../database/migrations"`), resolved by [`application/tooling/local-preview.mjs`](../application/tooling/local-preview.mjs), backup scripts in [`operations/scripts/`](../operations/scripts/), and 19 integration test suites. |
| `database/supabase/` | Retained optional V3 local **Supabase PostgreSQL** stack: `config.toml` (`strategic-souls-v3-local`), 6 RLS/research/worker-queue SQL migrations (`20261114000100`–`20261114000600`), HTML OTP template, and scoped `.gitignore`. | Run Supabase CLI with `--workdir database` (from repo root) or `--workdir ../database` (from `application/`). PGlite SQLite/Postgres RLS tests run via `tests/integration/v3-postgres.test.mjs`. |
| `database/.gitignore` | Blocks local SQLite files (`*.db`, `*.sqlite*`), dumps, backups, `.wrangler/`, and `.temp`/`.branches` from being staged under `database/`. | Paired with CI tracked-artifact checks in [`.github/workflows/verify.yml`](../.github/workflows/verify.yml). |

> **Separation rule:** Executable TypeScript Drizzle tables and D1 repositories belong in [`application/database/schemas/`](../application/database/schemas/) and [`application/database/queries/`](../application/database/queries/). Applied historical SQL files in `database/migrations/` are immutable — never rewrite, renumber, or delete applied migrations.

---

## Production Cloudflare D1 Identity

- **Database Name:** `ss`
- **Runtime Binding:** `DB` (defined in [`application/vite.config.ts`](../application/vite.config.ts))
- **Physical UUID:** `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`
- **Migrations (`0000`–`0020`):**
  - `0000_bent_reptil.sql` .. `0002_aberrant_nighthawk.sql`: Initial core tables (`accounts`, `souls`, `ownership`, `rate_limits`, `outcomes`, `support_requests`, `workspace_records`).
  - `0003_peaceful_smasher.sql` .. `0006_low_norrin_radd.sql`: Research notebook, immutability triggers (`0005_x1_immutability.sql`), community & X1/X2 foundations.
  - `0007_standalone_auth.sql` .. `0011_v3_release_candidate.sql`: Standalone email/password + optional Google OAuth auth, X5.1/X5.2/X5.6 profile/messenger/intelligence, and V3 compliance/release tables.
  - `0012_x78_market_scans.sql` .. `0020_official_reference_cache.sql`: Durable Nifty 500 scan queue (`x78_*`), shared history snapshots (`x8_*`), constituent grants, price alerts, soul deletion, portfolio corrections, company reports, notice entitlements, and 15-minute ECB/Treasury official reference cache (`0020`).

---

## Local Verification, Backup & Restore Procedures

All commands assume dependencies are installed in `application/` (`cd application && pnpm install --frozen-lockfile`). Never run resets or unapproved writes against remote production D1.

### 1. Fresh Local D1 Replay & Isolated Preview
```powershell
cd application
pnpm run build
pnpm run local:setup   # Applies database/migrations/* to isolated local D1 (.wrangler/local-preview)
```

### 2. Full Test Replay (SQLite D1 + PGlite Postgres RLS)
```powershell
cd application
pnpm test              # Replays all 21 D1 migrations + 6 Supabase RLS migrations in memory
```

### 3. Production Backup & Offline Restore Verification
1. **Cloudflare Time Travel bookmark (before any future additive migration):**
   ```powershell
   npx --prefix application wrangler d1 time-travel info ss
   ```
2. **Logical SQL export (store strictly outside the repository checkout):**
   ```powershell
   npx --prefix application wrangler d1 export ss --remote --output ..\private-recovery\ss-backup.sql
   ```
3. **Offline logical restore verification (never writes hosted D1):**
   ```powershell
   node operations/scripts/backup-x2.mjs <external-recovery-dir> <prior-snapshot.json>
   node operations/scripts/backup-v3.mjs <external-recovery-dir>
   node operations/scripts/verify-logical-backup.mjs <external-recovery-dir>
   ```
   All backup outputs **must live outside the Git working tree** and are never committed.

### 4. Schema Changes (Drizzle Kit)
```powershell
cd application
npx drizzle-kit generate   # Writes additive SQL to ../database/migrations/
```
Review generated SQL manually, confirm append-only triggers/constraints are preserved, verify SHA-256 of existing `0000`–`0020` migrations remain untouched, and test upgrade replay on an isolated SQLite copy before staging.
