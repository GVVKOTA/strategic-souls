# Strategic Souls — Market-Data Setup Guide (Windows & Cloudflare)

**Version:** X3.1 (21 November 2026) | **Timezone:** `Asia/Kolkata` (IST) | **Scope:** Strictly Read-Only (Zero Order Execution)

This step-by-step guide is written for a non-expert Windows user to safely run, verify, re-authenticate, and deploy the private Angel One SmartAPI NSE/BSE/MCX read-only integration inside Strategic Souls.

---

## 1. Know Your URLs & Two Modes

| Environment | URL | Who Sees NSE / BSE / MCX Broker Quotes? |
| --- | --- | --- |
| **Local Isolated Preview** | `http://127.0.0.1:5173/` | Authenticated local owner account (`X2_OWNER_SUBJECT`) when local adapter is running |
| **Local Private Broker Adapter** | `http://127.0.0.1:8791` (loopback-only; service-token gated) | Internal only — never open directly in a browser |
| **Live Production Site** | `https://strategic-souls.vishnukota20071005.workers.dev/` | Public visitors see ECB FX, US Treasury yields, 3D Earth, Soul Scan (ECB), Formula Lab, Community. Private owner broker quotes require remote adapter tunnel + Worker secrets. |

---

## 2. First-Time Local Secret Entry on Windows (Zero Chat / Zero Git)

> [!CAUTION]
> **Never paste your Angel One API Key, Trading Client ID, MPIN, or TOTP secret into AI chat, screenshots, Git commits, `.env.example`, or Cloudflare public variables.** If credentials were ever shared in chat, rotate your API key, MPIN, and TOTP authenticator in the Angel One SmartAPI portal immediately.

1. Open **PowerShell** inside `D:\Project SS\strategic-souls`.
2. Run the concealed credential setup helper (input is masked with `*` and never written to shell history):
   ```powershell
   node operations/scripts/setup-broker-secrets.mjs
   ```
3. Enter when prompted:
   - **SmartAPI Key** (from [smartapi.angelone.in](https://smartapi.angelone.in/) -> My Apps)
   - **Trading Client ID** (your Angel One login client code — **not** your 16-digit Demat BO/DP ID)
   - **Trading MPIN** (4-digit PIN)
   - **Optional TOTP seed**: Press **Enter** to leave blank (recommended — you will enter a fresh 6-digit authenticator code once per trading day via Data Control Center). Only store a Base32 TOTP seed locally if you explicitly opt in.
4. What this script creates (both are **gitignored** and restricted via Windows `icacls` permissions):
   - `.secrets/angelone.env` — holds Angel One credentials + auto-generated 256-bit `MARKET_ADAPTER_AUTH_TOKEN`.
   - `.dev.vars` — holds ONLY local Cloudflare Worker gateway flags and `MARKET_ADAPTER_AUTH_TOKEN` (**zero** Angel One MPIN/TOTP!).

---

## 3. Verify Your Outbound IPv4 Address (Static IP Check)

Angel One's April 1, 2026 Static IP rules require checking your registered IPv4 on [smartapi.angelone.in](https://smartapi.angelone.in/). Note that a home broadband / Reliance Jio / Airtel laptop IP is usually **dynamic or CGNAT**, not a guaranteed static IPv4.

Check your current public IPv4 in PowerShell:
```powershell
(Invoke-RestMethod -Uri "https://api4.ipify.org?format=json").ip
```
- Compare that IPv4 with the Primary Static IPv4 registered on your SmartAPI app.
- Remember: **A Cloudflare Tunnel controls inbound traffic (Cloudflare -> your laptop), NOT your laptop's outbound IPv4 toward Angel One.**
- If Angel One returns HTTP `403` (`BROKER_STATIC_IP_BLOCKED`), verify your static IPv4 registration with your ISP / SmartAPI portal or use an approved fixed-IPv4 host (see `MARKET_DATA_ARCHITECTURE.md`).

---

## 4. Run Strategic Souls Locally With Real NSE / BSE / MCX Data

Open **two** PowerShell windows in `D:\Project SS\strategic-souls`:

**Terminal 1 — Start the loopback-only Private Angel One Adapter (`127.0.0.1:8791`):**
```powershell
node --experimental-strip-types operations/scripts/start-market-adapter.mjs
```
You should see JSON output with `"status": "LISTENING"` and `"bind": "http://127.0.0.1:8791"`.

**Terminal 2 — Start the Isolated Local Strategic Souls Worker (`http://127.0.0.1:5173`):**
```powershell
node operations/scripts/local-preview.mjs launch
```
1. Open `http://127.0.0.1:5173/` in Chrome/Edge.
2. Sign up or sign in to your local disposable account and accept the workspace research notices.
3. Set `X2_OWNER_SUBJECT` in `.dev.vars` to your local `usr_...` user ID (from local D1 `auth_users` table) and restart Terminal 2 so the server grants owner-only access.
4. Click **Global -> Market Explorer -> Markets** (NSE & BSE quotes) or **Commodities** (MCX dated futures) or open **Data Control Center** (gear icon) to verify adapter health or submit a fresh 6-digit TOTP!
5. Click any symbol (e.g. `SBIN-EQ`, `SBIN`, `GOLD04DEC26FUT`) to inspect real daily OHLCV candles in **Asset Terminal** or send it to **Strategy -> Soul Scan**.

---

## 5. Run Automated Tests, Secret Scan & Live Read-Only Smoke Test

```powershell
# 1. Typecheck, ESLint, and all unit/integration tests (mocked, no creds needed)
node operations/scripts/check-x2-release.mjs

# 2. Zero-leak secret & bundle scan
node operations/scripts/scan-secrets.mjs

# 3. Read-only live Angel One smoke test (NSE + BSE + MCX quotes & candles, zero secrets printed)
node --experimental-strip-types operations/scripts/verify-angelone-live.mjs
```

---

## 6. Remote Production Connectivity

The production Worker connects to the loopback adapter through the named
`strategic-souls-angelone` Cloudflare Tunnel and the `MARKET_DATA_ADAPTER`
Workers VPC service binding in `vite.config.ts`. The service routes HTTP to
`127.0.0.1:8791` on the adapter host. It has no public hostname. The Worker
requires the verified owner account via `X2_OWNER_SUBJECT` and authenticates
each adapter request with `MARKET_ADAPTER_AUTH_TOKEN`. Store both as encrypted
Worker secrets. Keep the SmartAPI login credentials on the adapter host.

After a host reboot, start the adapter with `npm run broker:adapter` and its
Cloudflare connector with the protected tunnel token file:

```powershell
& .\.sites-runtime\cloudflared.exe tunnel --protocol quic run --token-file .secrets/cloudflared-angelone.token
```

In Cloudflare, verify the named tunnel is healthy. In the signed-in owner
session, verify that Data Control Center reports a reachable, authenticated
adapter and that Market Explorer loads a quote. The feed pauses if the host
sleeps or either process stops.

### Alternate configuration with a Cloudflare Access hostname

> [!WARNING]
> **Never use a temporary unauthenticated `cloudflared` Quick Tunnel for production.** Public exchange quotes remain locked off (`ENABLE_PUBLIC_EXCHANGE_QUOTES=false`) until formal exchange display/redistribution licences exist.

To connect the deployed Cloudflare Worker (`https://strategic-souls.vishnukota20071005.workers.dev/`) to your private broker adapter for **owner-only** remote viewing:
1. Add a custom DNS zone/domain to Cloudflare and enable **Cloudflare Zero Trust / Access** (free tier supports up to 50 users).
2. Install `cloudflared` on the adapter host and create a **Named Tunnel** pointing e.g. `broker-adapter.yourdomain.com` -> `http://127.0.0.1:8791`.
3. Protect that hostname with a **Cloudflare Access Service Token** policy (`CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`).
4. In Cloudflare Dashboard -> **Workers & Pages -> `strategic-souls` -> Settings -> Variables and Secrets**, add ONLY these gateway values (never Angel One MPIN or TOTP!):
   - `X2_OWNER_SUBJECT` (your production Strategic Souls `usr_...` account ID)
   - `MARKET_DATA_MODE=private`
   - `ENABLE_PRIVATE_BROKER_DATA=true`
   - `ENABLE_PUBLIC_EXCHANGE_QUOTES=false`
   - `MARKET_DATA_ADAPTER_URL=https://broker-adapter.yourdomain.com`
   - `MARKET_ADAPTER_AUTH_TOKEN` (Encrypted Secret matching `.secrets/angelone.env`)
   - `CF_ACCESS_CLIENT_ID` & `CF_ACCESS_CLIENT_SECRET` (Encrypted Secrets)
5. Remember: If the adapter runs on your laptop, live owner quotes pause cleanly with `ADAPTER_OFFLINE` whenever the laptop sleeps, while the main Strategic Souls site stays 100% online.

---

## 7. Common Error Codes & Instant Fixes

| Error Code | Meaning | Exact Fix |
| --- | --- | --- |
| `PUBLIC_LICENSE_REQUIRED` | Signed-in user is not `X2_OWNER_SUBJECT` and public exchange redistribution is locked off. | Expected for all non-owner/public visitors. Only the owner sees personal broker quotes. |
| `ADAPTER_OFFLINE` | Worker cannot reach the private broker adapter (laptop sleeping or adapter stopped). | Start Terminal 1 (`npm run broker:adapter`) or verify your Named Tunnel. |
| `BROKER_TOTP_REQUIRED` / `BROKER_SESSION_EXPIRED` | Angel One daily session expired (resets around midnight IST) or needs fresh 6-digit MFA. | Open **Data Control Center** or **Market Explorer** and enter your current 6-digit authenticator code. |
| `BROKER_STATIC_IP_BLOCKED` | Angel One rejected your outbound IPv4 with HTTP `403`. | Check your public IPv4 vs. registered Primary Static IPv4 in SmartAPI portal. |
| `RATE_LIMITED` | Local safety guard or Angel One per-second/minute limit hit. | Wait 5–15 seconds and click Refresh once. |
| `SEGMENT_NOT_ENTITLED` | Requested exchange (e.g., MCX) is not active on your Angel One account. | Verify segment activation in Angel One profile; NSE/BSE continue working independently. |

## 8. Soul Scan candle coverage

Use **Check coverage** to verify historical candles for the selected symbols and timeframe. An available dashboard quote only verifies the quote path. Soul Scan requests a separate candle window for Classic presets, up to 365 calendar days. Coverage shows the preset's minimum and the available bars when there is too little history.

Broker scans exclude developing daily bars and the current calendar week or month from grouped history. The first weekly or monthly group is also omitted because the request can start partway through it. An owner scan requests up to 24 broker instruments at a time and lists any deferred symbols. The 30-minute and hourly Soul Scan options remain unavailable.
## Public references in Global and Soul Scan

Guests and standard accounts can open dated ECB and US Treasury references from Global. Standard accounts start Soul Scan on ECB FX when their workspace has no configured exchange history. Choosing Indian markets preserves that scope. If it is unavailable, the user can explicitly switch to ECB FX or use their own permitted daily CSV.

Apply `drizzle/0020_official_reference_cache.sql` before promoting this feature. The shared D1 cache stores up to two validated official source documents and reuses them for 15 minutes across Worker instances. It retains original retrieval timestamps and labels stale display data. Soul Scan excludes stale history. Existing private quotes, account records, requests and provider credentials stay outside this cache.

## 9. Shared Public Market Data & Nifty 500 Activation (Owner-Only Setup)

Ordinary signed-in members never supply API keys and never touch the owner's private Angel One SmartAPI adapter. Shared NSE daily scanning for ordinary accounts requires **two** independently verified owner steps inside **Data Connections**:

1. **Authorized Nifty 500 Constituent Snapshot (`PUT /api/strategy/universe`):**
   - Obtain a licensed constituent list from NSE Indices Ltd. (`indices@nseids.co.in` / `https://www.niftyindices.com/offerings/data-subscription`) or an authorized redistribution vendor. Do **not** scrape `ind_nifty500list.csv` without prior written permission.
   - Upload the validated JSON snapshot (including `effectiveDate`, exact `expectedCount` in `[450, 550]` — e.g. `501` if official list includes `EQ`/`BE`/`RR` lines, `provenance`, `rightsExpiresAt`, and `constituents` array) in **Data Connections -> Nifty 500 constituent snapshot**.
2. **Verified Shared Provider Grant (`POST /api/x2/providers`):**
   - Install the paid server-only key via Cloudflare Worker encrypted secrets (`BHARATSTOCK_API_KEY` or `INDIA_API_KEY` + plan-matching `INDIA_API_HOST`). Never paste keys into code, chat, or D1.
   - **Recommended lawful path (Derived-Only Full OHLCV):** Upgrade BharatStock to a Paid tier (Starter `1,000 req/day` or Growth `5,000 req/day`), enable `Map the current licensed Nifty 500 snapshot as NSE equities`, set `sharedHistory` (`intervals: ["1d"]`, verified `creditWindow`, `retentionHours <= 48`, `attribution`), and configure **Derived-Only** rights: `verified: true`, `analysis: true`, `storage: true`, `derivedDisplay: true`, **`display: false`**, **`redistribution: false`**.
   - In `DERIVED_ONLY` mode, ordinary accounts run full Nifty 500 Classic and Advanced Daily/Weekly/Monthly scans using real OHLCV history and persist private derived `PASS`/`FAIL`/`UNKNOWN` outcomes to GRAVEYARD, while raw exchange prices, charts, raw metrics, and raw CSV price exports remain strictly withheld until a direct NSE display/redistribution license is recorded.
3. **Cloudflare Cron Triggers:**
   - `*/2 * * * *` runs `refreshSharedHistory()` (bounded incremental D1 ingestion respecting `creditWindow`, `dailyCallLimit`, and `Retry-After` backoff, plus expired snapshot/report purging).
   - `* * * * *` runs `processMarketScanBatch()` to advance durable multi-batch Nifty 500 jobs (`x78_market_scan_jobs`) even if users close their browser tab.
   - Monitor readiness at `GET /api/strategy/universe` and `GET /api/market/health`.

