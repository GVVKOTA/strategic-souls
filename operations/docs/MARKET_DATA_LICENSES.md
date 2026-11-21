# Strategic Souls — Market-Data Licensing & Exchange Rights Matrix

**Reviewed Date:** 2026-11-21 | **Enforcement Status:** `ENABLE_PUBLIC_EXCHANGE_QUOTES=false` (HARD DEPLOYMENT GATE)

> [!IMPORTANT]
> **A working personal Angel One SmartAPI connection does NOT grant commercial display, derived-scanner, storage, or public website redistribution rights for NSE, BSE, or MCX data.** Public users of Strategic Souls are blocked server-side from broker-sourced exchange data until documented exchange/vendor licences are acquired.

---

## 1. Private Owner vs. Public Website Permissions Matrix

| Exchange / Source | Data Class | Private Personal Owner Use (`MARKET_DATA_MODE=private`) | Public Strategic Souls Website (`ENABLE_PUBLIC_EXCHANGE_QUOTES`) | Verification / Licence Requirement |
| --- | --- | --- | --- | --- |
| **ECB Daily Reference FX** | Official published daily rates & cross rates | **PERMITTED** | **PERMITTED (Active)** | Free reuse with source attribution per [ECB Disclaimer](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html). |
| **US Treasury Yield Curve** | Official published daily par yields | **PERMITTED** | **PERMITTED (Active)** | US federal factual publication ([17 U.S.C. § 105](https://www.copyright.gov/title17/92chap1.html#105)). |
| **Angel One SmartAPI — NSE Cash & Indices** | Real-time/last quotes, daily OHLCV candles, derived scans | **OWNER-ONLY PILOT** (subject to personal SmartAPI terms & static IP policy) | **BLOCKED (`false`)** | Requires NSE Data & Analytics Ltd. display + non-display + derived-data agreement (or authorized commercial data vendor redistribution contract). |
| **Angel One SmartAPI — BSE Cash & Indices** | Real-time/last quotes, daily OHLCV candles, derived scans | **OWNER-ONLY PILOT** (subject to personal SmartAPI terms & static IP policy) | **BLOCKED (`false`)** | Requires BSE market data display / vendor redistribution agreement. |
| **Angel One SmartAPI — MCX Dated Futures** | Contract quotes (`FUTCOM`), expiry/lot/OI, daily OHLCV candles | **OWNER-ONLY PILOT** (subject to personal SmartAPI terms & active `mcx_fo` segment) | **BLOCKED (`false`)** | Requires MCX commercial market data distribution / vendor agreement. Continuous/invented spot prices remain prohibited. |
| **Derived Scanner Signals / Snapshots** | Soul Scan results computed from NSE/BSE/MCX series | **OWNER-ONLY PRIVATE** (automatically withheld if `ENABLE_PRIVATE_BROKER_DATA` disabled) | **BLOCKED (`false`)** | Exchange non-display & derived-data policies can restrict public display of derived indicators/signals; never assume "derived = unrestricted". |

---

## 2. Angel One Static IP Policy Verification (Checked 2026-11-21)

| Primary Source | Source Date | Checked Date | Documented Policy & Empirical Finding |
| --- | --- | --- | --- |
| [Angel One SmartAPI April 2026 Static IP Notice](https://www.angelone.in/news/market-updates/what-s-changing-in-angel-one-s-smartapi-access-from-april-1-2026) | March 2026 (effective 1 April 2026) | 2026-11-21 | Announces mandatory registered Primary Static IPv4 for SmartAPI **order placement/modification/cancellation** under SEBI/NSE retail algo guidelines; IPv4 only, 1 client per IP, editable max once per calendar week. |
| [Angel One SmartAPI Forum Topic #5671](https://smartapi.angelone.in/smartapi/forum/topic/5671/asking-for-static-ip-for-getting-api-for-historical-data) | Post-March 2026 moderator clarification | 2026-11-21 | Forum moderators clarify that the SmartAPI developer portal enforces Primary Static IPv4 configuration across **all app types**, including historical/market-data apps. |
| **Empirical Read-Only Probe (This Owner App)** | Live test | 2026-11-21 | From local host IPv4 `49.43.221.217` (Reliance Jio Infocomm ASN 55836), read-only `loginByPassword`, `getProfile`, `market/v1/quote/` (NSE, BSE, MCX), `getCandleData` (NSE, BSE, MCX), and `generateTokens` **all returned HTTP 200 SUCCESS**. Order endpoints were never called or implemented. Because residential broadband IPs can change dynamically, confirm static IPv4 registration with ISP / Angel One support if Angel One tightens read-only IP enforcement. |

---

## 3. Primary Exchange & Vendor References (Checked 2026-11-21)

- **NSE Data Policy & Non-Display Policy:**
  - `https://www.nseindia.com/static/market-data/nse-data-policy`
  - `https://www.nseindia.com/static/market-data/non-display-data`
- **BSE Market Data Products & Redistribution:**
  - `https://www.bseindia.com/markets/MarketInfo/MarketData.aspx`
- **MCX Market Data & Contract Specifications:**
  - `https://www.mcxindia.com/market-data/contract-specifications`
- **Angel One SmartAPI Documentation & SDKs:**
  - `https://smartapi.angelone.in/`
  - `https://github.com/angel-one/smartapi-python`
  - `https://github.com/angel-one/smartapi-javascript`

---

## 4. Path to Licensed Public Indian Market Data (Future — User Approval Required)

Before setting `MARKET_DATA_MODE=public_licensed` and `ENABLE_PUBLIC_EXCHANGE_QUOTES=true`:
1. Obtain a written commercial quote and signed redistribution agreement covering web display, derived indicators/scans, storage/caching, and user volume from an exchange-empanelled vendor (e.g., **TrueData** commercial web feed, **Global Datafeeds**, **EODHD** commercial EOD redistribution, or direct **NSE Data & Analytics / BSE / MCX** agreements).
2. Note: Retail personal plans (typically INR 1,000–3,000/month) generally **do not** cover multi-user public website redistribution.
3. Never scrape NSE/BSE/MCX websites, reuse stolen broker session cookies, spoof static IPs, or display synthetic demo prices as live market quotes.
