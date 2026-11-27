# Database Migrations & Lifecycle (`database/`)

This top-level directory owns the persistent schema migration histories and database operational procedures for **Strategic Souls X 3.0**, separated cleanly from runtime TypeScript Drizzle schema definitions inside [`application/database/`](../application/database/).

---

## Directory Structure

| Path | Ownership & Contents | Tooling / Configuration |
| --- | --- | --- |
| `database/migrations/` | Canonical **22 Cloudflare D1 SQLite migrations** (`0000_bent_reptil.sql` through `0021_x3_soul_memory_and_repro.sql`) + `meta/` (`_journal.json` and snapshots). | Configured in [`application/drizzle.config.ts`](../application/drizzle.config.ts) (`out: "../database/migrations"`), resolved by [`application/tooling/local-preview.mjs`](../application/tooling/local-preview.mjs), verified across all 73+ schema tables by [`operations/scripts/verify-logical-backup.mjs`](../operations/scripts/verify-logical-backup.mjs). |
| `database/supabase/` | Retained optional V3 local **Supabase PostgreSQL** test reference stack. | Tested via `tests/integration/v3-postgres.test.mjs`. |
| `database/.gitignore` | Blocks local SQLite files (`*.db`, `*.sqlite*`), dumps, backups, `.wrangler/`, and `.temp`/`.branches` from being staged under `database/`. | Paired with CI tracked-artifact checks in [`.github/workflows/verify.yml`](../.github/workflows/verify.yml). |

> **Separation rule:** Executable TypeScript Drizzle tables and D1 repositories belong in [`application/database/schemas/`](../application/database/schemas/) and [`application/database/queries/`](../application/database/queries/). Applied historical SQL files in `database/migrations/` are immutable — never rewrite, renumber, or delete applied migrations.

---

## Production Cloudflare D1 Identity

- **Database Name:** `ss`
- **Runtime Binding:** `DB` (defined in [`application/vite.config.ts`](../application/vite.config.ts))
- **Physical UUID:** `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`
- **Migrations (`0000`–`0021`):**
  - `0000_bent_reptil.sql` .. `0002_aberrant_nighthawk.sql`: Initial core tables (`accounts`, `souls`, `ownership`, `rate_limits`, `outcomes`, `support_requests`, `workspace_records`).
  - `0003_peaceful_smasher.sql` .. `0006_low_norrin_radd.sql`: Research notebook, immutability triggers (`0005_x1_immutability.sql`), community & X1/X2 foundations.
  - `0007_standalone_auth.sql` .. `0011_v3_release_candidate.sql`: Standalone email/password auth, profile/messenger/intelligence, and V3 compliance/release tables.
  - `0012_x78_market_scans.sql` .. `0020_official_reference_cache.sql`: Durable market scan queue (`x78_*`), shared history snapshots (`x8_*`), constituent grants, price alerts, soul deletion, portfolio corrections, company reports, notice entitlements, and official reference cache (`0020`).
  - `0021_x3_soul_memory_and_repro.sql` (**X 3.0 additive**): Reproducible scan lineage (`x9_scan_lineage`), SOUL MEMORY daily observations & frozen state (`x9_soul_memory_observations`, `x9_soul_memory_daily_state`), and scheduled cron heartbeats (`x9_system_heartbeats`).

---

## Local Verification, Full-Schema Backup & Restore Procedures

All commands assume dependencies are installed in `application/` (`cd application && pnpm install --frozen-lockfile`). Never run resets or unapproved writes against remote production D1.

### 1. Fresh Local D1 Replay & Isolated Preview
```powershell
cd application
pnpm run build
pnpm run local:setup   # Applies database/migrations/0000..0021 to isolated local D1 (.wrangler/local-preview)
```

### 2. Full Test Replay
```powershell
cd application
pnpm test              # Replays all 22 D1 migrations + Postgres RLS reference tests in memory
```

### 3. Production Backup & Full-Schema Offline Restore Verification (Canonical X 3.0 Procedure)
1. **Record a Cloudflare Time Travel bookmark before any additive migration (`0021+`):**
   ```powershell
   npx --prefix application wrangler d1 time-travel info ss
   ```
2. **Export the full production SQL dump strictly outside the Git repository checkout:**
   ```powershell
   npx --prefix application wrangler d1 export ss --remote --output ..\private-recovery\ss-backup.sql
   ```
3. **Verify full-schema restore integrity across ALL 73+ tables, indexes, triggers, foreign keys, and immutability rules:**
   ```powershell
   node operations/scripts/verify-logical-backup.mjs ..\private-recovery\ss-backup.sql ..\private-recovery\restore-check
   ```
4. **Run a self-contained offline full-schema restore drill (no remote credentials required):**
   ```powershell
   node operations/scripts/verify-logical-backup.mjs --drill ..\private-recovery\drill-check
   ```
   All backup dumps and restored SQLite files **must live outside the Git working tree** and are never committed.

> **Deprecated legacy scripts:** `operations/scripts/backup-v3.mjs` and `operations/scripts/backup-x2.mjs` only covered the original 9 legacy tables and are **obsolete** for the current 73+ table schema; use `wrangler d1 export` + `operations/scripts/verify-logical-backup.mjs` instead.

### 4. Additive Schema Changes (Drizzle Kit)
Review new SQL migrations manually, confirm append-only triggers/constraints are preserved, verify SHA-256 of existing `0000`–`0020` migrations remain untouched, and run `--drill` restore verification before staging.
