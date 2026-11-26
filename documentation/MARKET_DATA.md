# Market Data Architecture, Setup & Capacity

Strategic Souls separates **keyless public reference feeds**, **owner-only private broker connectivity**, and **future commercially licensed public equities** with strict fail-closed server gates. Zero synthetic market prices are fabricated when an upstream provider is unconfigured or unentitled.

---

## 1. Current Keyless Capability vs. Gated Feeds

| Feed / Domain | Active Today? | Data Boundary | Storage & Cache |
| --- | --- | --- | --- |
| **ECB Daily FX (`ECB:*`, 13 pairs)** | **Yes (Keyless Public)** | Official published reference rates (`REFERENCE`); no invented OHLCV | 15-min shared D1 cache (`0020_official_reference_cache.sql`) |
| **US Treasury Yield Curve (`UST:*`)** | **Yes (Keyless Public)** | Official published daily par yields (`REFERENCE`) | 15-min shared D1 cache (`0020`) |
| **TradingView Embeds** | **Yes (User-Opt-In)** | Vendor-hosted human viewing widgets with visible attribution; no raw scraping | Client widget mount after consent |
| **Angel One SmartAPI (`NSE/BSE/MCX`)** | **Owner-Only Pilot** | Strict `X2_OWNER_SUBJECT` + `MARKET_DATA_ADAPTER` VPC; read-only endpoints only | Ephemeral process memory only (zero D1/disk persistence) |
| **Public NSE / Nifty 500 Daily Scan** | **Gated (`BLOCKED` externally)** | Built & verified in code (`DERIVED_ONLY` + `DISPLAY_AND_DERIVED`), requires paid licensed key + authorized Nifty 500 constituent list | D1 `x78_*`, `x8_shared_history_snapshot`, `x2_providers` (`0` active rows in production) |
| **BSE / MCX / Intraday (`30m`/`1h`) Public** | **Disabled** | No licensed public commercial feed connected | Returns explicit `UNAVAILABLE` / `INTRADAY_NOT_SUPPORTED` |

---

## 2. Private Owner Broker Gateway (`Angel One SmartAPI` via VPC)

### Decision Summary (Loopback Adapter + Workers VPC)
Cloudflare Workers run on shared dynamic edge IPs, while Angel One SmartAPI enforces Static IPv4 policies and requires long-lived API Key/MPIN secrets. To avoid putting trading credentials on shared edge hosting or spoofing static IPs, the read-only adapter runs strictly on loopback `127.0.0.1:8791` on the owner's adapter host (`application/backend/services/market-data/angelone/`).

- **Credential Isolation:** `ANGELONE_API_KEY`, `ANGELONE_CLIENT_ID`, `ANGELONE_MPIN`, and optional `ANGELONE_TOTP_SECRET` stay strictly inside gitignored `application/.secrets/angelone.env` (Windows `icacls` / POSIX `0600` ACL). Session JWTs (`jwtToken`, `refreshToken`, `feedToken`) stay exclusively in adapter RAM until midnight IST reset.
- **Worker Access Control:** Cloudflare Worker stores only `X2_OWNER_SUBJECT` and `MARKET_ADAPTER_AUTH_TOKEN` (verified via constant-time comparison). Ordinary authenticated users receive `403 PUBLIC_LICENSE_REQUIRED`; when the adapter host sleeps, the main site remains online and owner quotes degrade cleanly to `503 ADAPTER_OFFLINE`.

### Local Windows Setup & Verification
Run from inside `application/` (or from repo root pointing at `operations/scripts/`):

```powershell
cd application
# 1. Enter credentials via concealed stdin (never echoes secrets)
pnpm run broker:setup

# 2. Terminal 1 — Start loopback read-only adapter (127.0.0.1:8791)
pnpm run broker:adapter

# 3. Terminal 2 — Start isolated Worker + D1 preview (http://127.0.0.1:5173)
pnpm run dev

# Optional: Read-only live NSE/BSE/MCX smoke probe
pnpm run broker:verify
```

**Remote Tunnel Mode:** Connect the production Worker (`strategic-souls`) through the named Cloudflare Tunnel (`strategic-souls-angelone`) / VPC binding (`MARKET_DATA_ADAPTER` UUID `01a2095b-f466-7c90-a813-4fad03735504`). Never run an unauthenticated `cloudflared` Quick Tunnel for production.

---

## 3. Shared Public Market Data & Capacity Model (`Nifty 500`)

### Architecture & Quota Economics
- **`O(1)` Upstream Fanout:** `reserveProviderCall()` enforces per-minute (`callsPerMinute`), daily (`dailyCallLimit`), and subscription window (`creditWindow`) budgets atomically in D1. Running a full 501-symbol Nifty 500 scan for 10 or 1,000 concurrent users executes **0** extra upstream calls once daily snapshots populate `x8_shared_history_snapshot`.
- **Snapshot & Durable Batch Bounds:**
  - Full OHLCV (~250 daily bars/symbol): `~32–38 KB`/symbol -> `~17.5 MB` active (`~35 MB` with 48h overlap, `< 1%` of D1 Paid `10 GB` limit).
  - Durable batches (`DEFAULT_BATCH_SIZE = 50`): 501 symbols = 11 batches under a single global D1 lease (`x78_market_scan_jobs`), completing interactively in ~12–18s or via `* * * * *` cron in ~1–2 min.
  - Derived GRAVEYARD rows (`x1_scans`): raw shared prices stripped via `isSharedExchangeDataset()` & `archivalScanRows()` (`~65–85 KB` per saved scan, capped at `1.5 MB`).
- **Load Projections (Registered vs. Daily Active):**

| Scenario | Registered | Daily Active (10%) | Peak Simultaneous Scans (1m) | Daily Scans | Upstream Calls/Day | Est. D1 Reads/Day | Est. D1 Writes/Day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Small** | 100 | 10 | 1 | 20 | 501 (fixed) | ~45,000 | ~5,000 |
| **Medium** | 1,000 | 100 | 2 | 200 | 501 (fixed) | ~180,000 | ~12,000 |
| **Scale** | 10,000 | 1,000 | 20 | 2,000 | 501 (fixed) | ~1,400,000 | ~70,000 |

### Finite Owner Checklist to Activate Public Nifty 500 Derived Screening (Zero Code Edits)
1. **Upgrade Provider Plan:** Indian API Free (`500 req/month`, close-only) and BharatStock Free (`60 req/day`, caching/public forbidden by ToS) are blocked. Upgrade `BHARATSTOCK_API_KEY` to Starter (`1,000/day`) or Growth (`5,000/day`) and update the encrypted Worker secret.
2. **Import Authorized Constituent Snapshot:** Obtain written permission / subscription from NSE Indices Ltd. (`indices@nseids.co.in`) for `ind_nifty500list.csv` (`501` constituents) and upload via owner **Data Connections** (`PUT /api/strategy/universe`).
3. **Register Provider Grant (`DERIVED_ONLY`):** Configure `rights = { verified: true, analysis: true, storage: true, derivedDisplay: true, display: false, redistribution: false }`, valid contract reference, expiry, and conservative `dailyCallLimit` (`900` Starter / `4500` Growth).
4. **Verify Cron Warm-up & Two-Account Separation:** Monitor `/api/strategy/universe` (`status === "READY"`) and verify two ordinary signed-in accounts run full scans receiving derived `PASS`/`FAIL`/`UNKNOWN` outcomes with raw prices withheld.

### Additional Implemented Adapter Skeletons (`EODHD`, `TrueData`)
Server adapters for `X2_EODHD_API_TOKEN` and `X2_TRUEDATA_BEARER_TOKEN` exist in `application/backend/services/market-data/providers.ts` and remain disabled until encrypted Worker secrets and valid multi-user commercial redistribution grants are supplied via owner Data Connections.
