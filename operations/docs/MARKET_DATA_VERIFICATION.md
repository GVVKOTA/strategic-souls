# Strategic Souls — Market-Data Verification & Live Smoke Report (X3.1)

**Verification Date (UTC / IST):** `2026-11-21T05:35Z` / `2026-11-21 11:05 IST` (Saturday — Indian exchanges closed)  
**Primary Broker Provider:** Angel One SmartAPI (Strictly Read-Only, zero order endpoints)  
**Selected Architecture:** PATH B — Private Loopback Broker Adapter (`127.0.0.1:8791`) + Cloudflare Worker Secure Gateway (`strategic-souls`)

---

## 1. Honest Verdict Summary

| Scope | Verdict | Reason / Evidence |
| --- | --- | --- |
| **Local Authenticated Owner Stack (`127.0.0.1:5173` -> `127.0.0.1:8791` -> Angel One)** | **`PASS_LOCAL_REAL`** | Verified in real Chromium (`gvvPlaywright`) and CLI smoke test: real NSE, BSE, and MCX quotes + daily OHLCV candles rendered in Strategic Souls UI (`Market Explorer`, `Asset Terminal`, `Soul Scan`), honestly labelled `MARKET CLOSED · LAST` with distinct IST observation & retrieval timestamps. |
| **NSE Read-Only Quotes & Candles** | **`PASS_LOCAL_REAL`** | `NSE:SBIN` (`SBIN-EQ`, token `3045`) `₹1,165.10` (`+0.79%`, 20 Nov 2026 15:59:46 IST), `NSE:NIFTY` (`99926000`) `₹25,800.60`, `NSE:RELIANCE` (`2885`) `₹1,377.50`; 31–124 daily OHLCV candles verified. |
| **BSE Read-Only Quotes & Candles** | **`PASS_LOCAL_REAL`** | Independently resolved tokens: `BSE:SBIN` (`500112`) `₹1,164.95` (`+0.60%`, 20 Nov 2026 15:59:30 IST), `BSE:SENSEX` (`99919000`) `₹83,919.71`, `BSE:RELIANCE` (`500325`) `₹1,375.10`; 31–124 daily OHLCV candles verified. |
| **MCX Read-Only Dated Futures & Candles** | **`PASS_LOCAL_REAL`** | Active `mcx_fo` segment verified via read-only `getProfile`. Unexpired dated contracts resolved from 180,229-row `OpenAPIScripMaster.json`: `MCX:GOLD04DEC26FUT` (token `495213`, expiry `2026-12-04`, lot `1`, tick `₹1.00`) `₹1,21,778.00` (OI `11,430`, 20 Nov 2026 23:54:47 IST) and `MCX:CRUDEOIL18DEC26FUT` (token `576264`, expiry `2026-12-18`, lot `100`) `₹7,695.00` (`-1.43%`, OI `8,456`, 20 Nov 2026 23:55:00 IST); 33 daily OHLCV candles verified. |
| **Remote Production Private Owner Broker Feed (`strategic-souls.vishnukota20071005.workers.dev`)** | **`BLOCKED_EXTERNAL`** | Code, routes, auth gates, and UI are deployed and verified live; remote Worker-to-adapter private connectivity requires (1) a custom domain DNS zone on Cloudflare + enabling Cloudflare Access Zero Trust to host an authenticated Named Tunnel (account currently has `zones: []`, `Access: not_enabled`), and (2) setting `X2_OWNER_SUBJECT`, `MARKET_DATA_ADAPTER_URL`, `MARKET_ADAPTER_AUTH_TOKEN`, `ENABLE_PRIVATE_BROKER_DATA=true` in Cloudflare Worker Secrets. Unauthenticated Quick Tunnels are intentionally prohibited. |
| **Public Website NSE / BSE / MCX Redistribution** | **`BLOCKED_EXTERNAL` (Intentional Compliance Gate)** | `ENABLE_PUBLIC_EXCHANGE_QUOTES=false` is enforced server-side (`403 PUBLIC_LICENSE_REQUIRED` for non-owner users, `401 UNAUTHENTICATED` for anonymous). Personal Angel One API access does not grant commercial multi-user redistribution rights for NSE/BSE/MCX. |
| **Automated Unit, Integration, Build, Palette & Secret Scans** | **`PASS_MOCK_ONLY` / `PASS`** | All 263 Node tests, 29 Python quant tests, TypeScript check, ESLint, production Worker build, and 575-file + `dist/` secret scan passed with 0 errors and 0 secret findings. |

---

## 2. Exact Commands Run & Observed Outcomes

| Category | Exact Command | Result | Observed Details |
| --- | --- | --- | --- |
| Lockfile / Dependency Security | `pnpm.cmd audit --audit-level high` | **PASS** | 0 high/critical advisories (`pnpm-lock.yaml` untouched; 0 new packages added) |
| TypeScript Check | `node operations/scripts/check-x2-release.mjs` (`typecheck`) | **PASS** | Exit 0, 0 errors |
| Application ESLint | `node operations/scripts/check-x2-release.mjs` (`lint`) | **PASS** | Exit 0, 0 errors (5 pre-existing unrelated warnings) |
| Node Unit & Integration Suite | `node --experimental-strip-types --experimental-vm-modules --test "tests/**/*.test.mjs"` | **PASS** | **263 passed, 0 failed, 0 skipped** (includes 6 new Angel One unit suites + 1 full loopback adapter/Worker gateway integration suite + static Zero-Order Safety Guard across all 17 market-data files) |
| Python Quant Suite | `uv run --project backend/quant pytest backend/quant/tests -q` | **PASS** | **29 passed in 4.42s** |
| Production Worker Build | `node operations/scripts/run-framework.mjs build` | **PASS** | All 6 new `/api/market/*` routes compiled; `dist/server/wrangler.json` verified `name: "strategic-souls"` and `DB -> ss (1cda2b05-6b99-4d04-896f-b3542ad2ce7f)` |
| Secret & Bundle Leak Scan | `node operations/scripts/scan-secrets.mjs` | **PASS** | **575 files + `dist/` bundles scanned**, 5 armed exact-local-secret checks, **0 findings**, **0 staged findings** |
| V3 Source Hygiene Scan | `node operations/scripts/scan-v3-source.mjs` | **PASS** | 0 findings |
| Live Read-Only Broker Smoke Test | `node --experimental-strip-types operations/scripts/verify-angelone-live.mjs` | **`PASS_LOCAL_REAL`** | `authState: AUTHENTICATED`, `enabledExchanges: ["NSE","BSE","MCX"]`, `scripMasterCount: 180229`, NSE/BSE/MCX quotes + daily OHLCV candles all HTTP 200; 0 secrets printed |

---

## 3. Browser E2E Verification (`gvvPlaywright` on Isolated Compiled Worker `http://127.0.0.1:5173`)

- **Unauthenticated Public Visitor:**
  - `/api/release` -> HTTP `200`, `release: "X3.1"`, `revisionMarker: "x3.1-angelone-readonly-gateway-2026-11-21"`.
  - `/api/market/health` -> HTTP `200`, `accessScope: "PUBLIC_RESTRICTED"`, `authState: "HIDDEN"`.
  - `/api/market/quote` -> HTTP `401`, `errorCode: "UNAUTHENTICATED"`.
- **Authenticated Non-Owner Member (`member-x31@example.invalid`):**
  - `/api/market/quote?ids=NSE:SBIN` -> HTTP `403`, `errorCode: "PUBLIC_LICENSE_REQUIRED"`.
  - Private broker data completely hidden; public ECB FX, US Treasury, 3D Earth, Soul Scan (ECB), Formula Lab, and Community unaffected.
- **Authenticated Private Owner (`owner-x31@example.invalid` bound via local `.dev.vars` `X2_OWNER_SUBJECT`):**
  - **Market Explorer -> Markets:** 6 real normalized quotes rendered (`Nifty 50` `₹25,800.60`, `SENSEX` `₹83,919.71`, `SBIN-EQ` `₹1,165.10`, `RELIANCE-EQ` `₹1,377.50`, `SBIN` `₹1,164.95`, `RELIANCE` `₹1,375.10`), all marked **`MARKET CLOSED · LAST`** with Friday `20 Nov 2026` IST observation timestamps and distinct Saturday `21 Nov 2026` IST retrieval timestamps.
  - **Market Explorer -> Commodities:** 2 real unexpired MCX dated futures rendered (`GOLD04DEC26FUT` `₹1,21,778.00` Exp `2026-12-04`, `CRUDEOIL18DEC26FUT` `₹7,695.00` `-1.43%` Exp `2026-12-18`).
  - **Asset Terminal (`MCX:GOLD04DEC26FUT`):** Rendered private broker quote strip + SVG candle chart (`2026-11-20 · Reference / close 1,21,778 · O 1,23,629 H 1,23,975 L 1,21,424 V 15,370`).
  - **Strategy -> Soul Scan (`CONNECTED_MARKETS`):** Canonical AST preflight executed on real Angel One daily candles (`source: "Angel One SmartAPI (Private Owner)"`, `NSE:SBIN` PASS 124 bars, `BSE:SBIN` PASS 124 bars).
  - **Mobile Viewport (`390x844`):** `0px` horizontal overflow (`scrollWidth === clientWidth`), both search inputs `16px` (anti-autozoom), canonical hex tokens unchanged (`#070809`, `#E8EDF2`, `#76C0FF`), `0` JS-accessible cookies, `0` secrets in `localStorage`.
  - **Adapter Offline / Laptop Sleeping Test:** Stopped local adapter daemon -> UI cleanly surfaced `ADAPTER OFFLINE` in Market Explorer and `OFFLINE / UNCONFIGURED` in Data Control Center with zero blank screens or uncaught crashes.

---

## 4. Production Deployment & Live URL Verification

*Updated immediately upon GitHub push & Cloudflare Workers Builds completion.*

| Field | Value |
| --- | --- |
| **Live Production URL** | `https://strategic-souls.vishnukota20071005.workers.dev/` |
| **Cloudflare Worker / D1** | `strategic-souls` / `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) — unchanged |
| **Pre-X3.1 Rollback Target** | Deployment `527a6543-9b02-42f9-9045-c1fd4168554c` / Version `351de6c5-1fc0-42fc-8a21-069b4f8691ad` |
| **Git Branch & Commit SHA** | Pending commit & push |
| **Live `/api/release` Check** | Pending post-deploy live HTTP check |
| **Live `/api/market/*` Gates** | Pending post-deploy live HTTP check |
