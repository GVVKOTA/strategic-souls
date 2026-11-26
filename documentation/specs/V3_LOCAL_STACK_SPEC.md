# V3 Optional Local Stack & Quantitative Worker Specification

The V3 stack provides an optional PostgreSQL/Supabase backend (`database/supabase/`, `/api/v3/[...segments]`) and an offline vectorized Python evaluator (`application/backend/quant/`, `souls_quant`). Production traffic continues to run on Cloudflare Workers + D1, while `/legal/[slug]` and unit/integration suites actively exercise V3 models and Postgres RLS migrations.

---

## 1. Local Supabase PostgreSQL Stack (`database/supabase/`)

- **Project ID:** `strategic-souls-v3-local` (`database/supabase/config.toml`)
- **Migrations (`database/supabase/migrations/`):**
  1. `20261114000100_v3_research.sql`
  2. `20261114000200_v3_guards_and_privacy.sql`
  3. `20261114000300_v3_worker_queue.sql`
  4. `20261114000400_v3_avatars.sql`
  5. `20261114000500_v3_manual_portfolio.sql`
  6. `20261114000600_v3_entitlement_scope.sql`
- **Verification Coverage:**
  - `application/tests/integration/v3-postgres.test.mjs` replays all 6 PostgreSQL migrations inside embedded `@electric-sql/pglite` during `pnpm test` (no Docker needed).
  - `application/tests/integration/v3-model-api.test.mjs` exercises validation and `/api/v3/*` handlers with mocked Auth transport.
  - Full Docker/WSL local integration (`operations/scripts/test-supabase-local.mjs`) tests real loopback Supabase OTP + Mailpit persistence (`http://127.0.0.1:54321`, `:54323` Studio, `:54324` Mailpit).

### Running Locally on Windows / Linux / CI
From repo root or `application/`:
```powershell
# Run CLI pointing explicitly at top-level database/
cd application
pnpm exec supabase --workdir ../database start
pnpm exec supabase --workdir ../database migration up --local
pnpm exec supabase --workdir ../database status --output json | node ../operations/scripts/write-local-env.mjs
pnpm run dev:hmr
# In another shell:
node ../operations/scripts/test-supabase-local.mjs
```
On Windows with Rancher Desktop / WSL2 Moby, inspect prerequisites via `operations/scripts/setup-windows-v3.ps1` and launch via `operations/scripts/start-v3-local.ps1` (or `START_V3_LOCAL.bat`).

---

## 2. Quantitative Python Library (`application/backend/quant/`)

- **Package:** `strategic-souls-quant` (`souls_quant`), dependencies: `duckdb`, `numpy`, `pyarrow` (`pyproject.toml` + `uv.lock`).
- **Verification:**
  ```powershell
  cd application
  uv sync --project backend/quant --frozen
  uv run --project backend/quant pytest backend/quant/tests -q
  ```
- **CLI Commands (`souls-quant`):** `ingest`, `cache`, `screen`, and `work-once` operating over operator-reviewed local datasets, partitioned Parquet generations, and DuckDB allowlisted scan predicates (zero live exchange feeds bundled; `V3_QUANT_ENABLED` defaults to `0`).

### Quantitative Guarantees & Methodology Summary
1. **Execution Discipline:** Signals evaluate on completed closes and enter at the next valid open after `known_at`; missing/halted/zero-volume bars never become stale-close fills.
2. **Corporate Actions & Rights:** Maintains immutable raw bars; computes rights price factor via `TERP / cum_rights_price` without blind volume scaling; abstains when terms are incomplete.
3. **Indicators & Reporting Floors:** SMA (`N` completed bars, `N-1` leading nulls), Wilder RSI (`N+1` closes; flat = `50`), Wilder ATR, annualized volatility (`252`-session convention clearly labeled). Win rate keeps break-even observations in the denominator and withholds reporting below `30` completed observations (`null` with diagnostic raw counts).
4. **Vectorized Cache:** Immutable Parquet generations, content-hashed buckets, atomic pointer publication, preserving prior generations if checksum or writer lock fails.
5. **Strict Publication Boundary:** `/legacy` preserves the owner research workspace; public financial recommendations, leaderboards, ads, payments, and live trading remain permanently disabled or compliance-blocked (`SECURITY_AND_DATA_RIGHTS.md`).
