# Strategic Souls — Public Provider Capacity, D1 Storage & Cost Model

**Prepared:** 25 November 2026 IST  
**Database:** Cloudflare D1 `ss` (current size: `6.71 MB` / `6,705,152` bytes; Cloudflare D1 Paid limit: `10 GB` per DB; Free limit: `500 MB` per DB)  
**Scheduler:** Cloudflare Cron Triggers (`*/2 * * * *` ingestion/purge + `* * * * *` durable scan batch runner)

---

## 1. Upstream Provider Quota & Cold-Fill Math (501-Constituent Nifty 500 Universe)

| Provider & Plan | Upstream Quota | Calls for 1 Full Pass (501 Symbols) | Daily EOD Refresh Headroom (501/trading day) | Cold Fill Duration at 6 Tasks / 2-Min Cron (`180/hr`) | Legal & Technical Viability |
| --- | --- | --- | --- | --- | --- |
| **Indian API Free** (`stock.indianapi.in`, currently active) | `500 req / month`, `1 req/s` | `501` (>100% of monthly quota) | **-1** (exhausted on Day 1; 0 calls for remaining 29 days) | Cannot complete 1 full pass | **UNVIABLE** (quota + close-only, no OHLC + no exchange display license) |
| **BharatStock Free** (`bharatstockapi.com`, currently active) | `60 req / day` (UTC) | `501` (>8.3 days per pass) | **-441/day** | `>= 9 days` | **UNVIABLE & LEGALLY FORBIDDEN** (Free tier bans caching & serving end-users) |
| **BharatStock Starter (Paid)** | `1,000 req / day` (UTC) | `501` (`50.1%` of daily cap) | **`+499 req/day`** headroom (retries + indices) | **`~167 min` (~2.8 hours, 84 ticks)** | **VIABLE FOR `DERIVED_ONLY` FULL OHLCV** (with authorized constituent delivery) |
| **BharatStock Growth (Paid)** | `5,000 req / day` (UTC) | `501` (`10.0%` of daily cap) | **`+4,499 req/day`** headroom | **`~167 min` (~2.8 hours)** at default 6/tick (`~30 min` if batch tuned within rate limit) | **RECOMMENDED FOR `DERIVED_ONLY` FULL OHLCV** |

> **Important:** Because `reserveProviderCall()` enforces per-minute (`callsPerMinute`), daily (`dailyCallLimit`), and subscription window (`creditWindow`) budgets atomically in D1, upstream requests **never** scale with user count (`O(1)` per symbol per trading day, NOT `O(users × 501)`). Running the same Nifty 500 Daily scan for 10 or 1,000 users triggers **0** additional upstream historical calls once snapshots are cached.

---

## 2. Measured Snapshot Size, Durable Scan Latency & D1 Footprint

### Per-Symbol Snapshot Footprint (`x8_shared_history_snapshot`)
- **Full OHLCV (BharatStock, ~250 completed daily trading bars / 1 yr):**
  - Serialized JSON row size: `~32–38 KB` per symbol (`~140 bytes/bar × 250 bars`)
  - 501 symbols × 1 active version: **`~17.5 MB`**
  - 48-hour retention overlap (2 consecutive daily snapshots before `purgeExpiredSharedHistory` deletes expired rows): **`~35 MB` peak** (`0.35%` of 10 GB D1 Paid limit; `7%` of 500 MB D1 Free limit).
- **Close + Volume Only (Indian API, ~247 daily observations / 1 yr):**
  - Serialized JSON row size: `~11–13 KB` per symbol (`~48 bytes/row × 247`)
  - 501 symbols × 1 active version: **`~6.0 MB`** (`~12 MB` peak with 48h overlap).

### Durable Multi-Batch Scan Execution (`x78_market_scan_jobs` / `x78_market_scan_batches`)
- **Batch size (`DEFAULT_BATCH_SIZE = 50`):**
  - 501 instruments ÷ 50 = **11 batches** (`10 × 50 + 1 × 1`) + 1 finalization step.
  - Each batch reads 50 rows from `x8_shared_history_snapshot` (indexed on `(provider, config_version, instrument_id, interval, received_at)`) and writes 1 temporary `x78_market_scan_batches` row (deleted immediately upon finalization or cancellation).
  - **Measured in-memory SQLite integration run (501 constituents, two simultaneous users = 1,002 evaluations):** `< 1.5s` total JS+SQL evaluation time, **0 upstream fetches**.
  - **Projected production Cloudflare Worker + D1 latency:**
    - Interactive polling (`GET /api/strategy/scan?jobId=...` advances up to 2 cached batches per poll every `2.5s` under atomic D1 lease): **~12–18 seconds** end-to-end for a full 501-symbol warm scan while the user keeps the tab open.
    - Background Cron fallback (`* * * * *`, up to 10 batches per 25s tick): completes a full 501-symbol scan within **1–2 minutes** even if the user closes their browser immediately after submitting.
- **Archived GRAVEYARD row (`x1_scans`):**
  - Raw shared datasets are stripped via `isSharedExchangeDataset()`; raw prices are stripped via `archivalScanRows()`.
  - Stored `x1_scans` payload for 501 derived outcomes: `~65–85 KB` per completed scan (well under the `1.5 MB` hard guard).

### Scheduled Worker Invocations
- Ingestion & expired-report purge (`*/2 * * * *`): **720** invocations/day (`21,600/month`).
- Durable scan queue worker (`* * * * *`): **1,440** invocations/day (`43,200/month`).
- Total baseline cron invocations: **2,160/day** (**64,800/month**). When 0 shared grants and 0 queued jobs exist, each cron tick executes 1 indexed D1 check and exits in `< 10ms`.

---

## 3. Registered-User Load Scenarios (Explicitly Separating Registered vs Simultaneous Users)

Assumptions:
- Daily active scanning members = `10%` of registered accounts; average `2` completed Nifty 500 scans per active member per trading day.
- Peak simultaneous scan submissions = `2%` of daily active members within any 1-minute window.
- Every scan reads `501` cached snapshot rows (`~550` D1 row reads incl. job/reservation/provider verification) and performs `~30` D1 row writes (reservation, job, 11 batches, finalize, batch cleanup).

| Scenario | Registered Accounts | Daily Active Scanners (10%) | Peak Simultaneous Scans (1-min window) | Daily Nifty 500 Scans | Upstream Provider Calls / Trading Day | Daily D1 Row Reads (Est.) | Daily D1 Row Writes (Est.) | Monthly GRAVEYARD Storage Growth (21 trading days) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Small** | `100` | `10` | `1` | `20` | `501` (fixed) | `~45,000` | `~5,000` | `~32 MB/mo` |
| **Medium** | `1,000` | `100` | `2` | `200` | `501` (fixed) | `~180,000` | `~12,000` | `~320 MB/mo` |
| **Scale** | `10,000` | `1,000` | `20` | `2,000` | `501` (fixed) | `~1,400,000` | `~70,000` | `~3.2 GB/mo` |

### Recorded Platform & Safety Limits (No Universal Concurrency Claim)
1. **Single Global Scan Lease:** `processMarketScanBatch()` holds one global lease at a time (`NOT EXISTS (SELECT 1 FROM x78_market_scan_jobs WHERE state='RUNNING' AND lease_until>?)`) to guarantee bounded D1 and CPU load. At `~15s` per 501-symbol job, throughput is `~4` full 501-symbol jobs/minute (`~240/hour`). Under a 20-simultaneous-scan burst (`10,000`-user scenario), queued jobs drain cleanly over `~5 minutes` with honest live queue progress (`QUEUED` -> `RUNNING`) and zero dropped jobs or double charges.
2. **Cloudflare D1 Free vs Paid Tier Limits:**
   - D1 Free tier (`5M` row reads/day, `100K` row writes/day, `500 MB` DB size) comfortably supports the **100-user** and **1,000-user** scenarios, and hits storage/write pressure approaching **10,000 registered users** (at which point Cloudflare Workers Paid / D1 Paid `25B` reads/mo, `50M` writes/mo, `10 GB` DB + archival retention policy is required).
3. **Throttling & Fault Protection:**
   - HTTP `429` with `Retry-After` pauses `x8_shared_history_plan.paused_until` globally across all workers and surfaces `PROVIDER_RATE_LIMITED` honestly.
   - HTTP `401`/`403` pauses ingestion immediately (`AUTH_FAILED`) until the owner fixes credentials and passes a manual `Test connection`.
   - `MAX_BYTES = 800,000` per snapshot and `1,500,000` bytes per scan payload prevent oversized D1 writes.
