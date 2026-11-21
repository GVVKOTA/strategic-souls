# Strategic Souls — X4 Market Search, Canonical Discovery & Soul Scan 2.0 Architecture

- **Release:** `X4` (`4.0.0-x4`)
- **Primary Modules:**
  - `backend/services/market-data/instrument-registry.ts`
  - `backend/services/market-data/angelone/instrument-master.ts`
  - `backend/services/market-data/angelone/gateway.ts`
  - `backend/services/market-data/data-service.ts`
  - `backend/services/research/research.ts`
  - `backend/services/research/workspace.ts`
  - `backend/engines/scan.ts`
  - `app/api/market/instruments/route.ts`

---

## 1. Separation of Instrument Identity Discovery vs. Live Quote Entitlement

Strategic Souls X4 enforces a clean architectural boundary between **knowing what an instrument is** (canonical identity) and **serving live/historical exchange prices** (entitlement):

| Layer | Public / Signed-In Non-Owner User | Owner Session (`X2_OWNER_SUBJECT` + `ENABLE_PRIVATE_BROKER_DATA=true`) |
| :--- | :--- | :--- |
| **Canonical Instrument Discovery (`/api/market/instruments`, `UniversalSearch`, `Global`, `Strategy`)** | **Full Discovery (`PUBLIC_IDENTITY_ONLY`)** — Can search `HDFC`, `HDFC Bank`, `HDFCBANK`, `NSE:HDFCBANK`, `BSE:HDFCBANK`, `SBI`, `SBIN`, `RELIANCE`, `TCS`, `INFY`, `NIFTY`, `SENSEX`, `GOLD`, `CRUDEOIL`, and all 41 canonical registry assets. Never leaks private broker tokens or prices. | **Full Discovery (`LIVE_MASTER`)** — Searches merged live Angel One ScripMaster + 41 canonical registry entries (up to 50 results per query). |
| **Live Quotes & Intraday / Historical Broker Candles (`/api/market/quote`, `/api/market/candles`)** | **Fail-Closed (`401` / `403` / `PUBLIC_RESTRICTED`)** — Public redistribution of retail broker feeds remains disabled (`ENABLE_PUBLIC_EXCHANGE_QUOTES=false`). | **Entitled (`OWNER_PRIVATE`)** — Serves real-time and historical Angel One SmartAPI data when the owner's static-IP egress proxy is online. |
| **Official Reference Macro & FX (`ECB_REFERENCE_FX`, `MOSPI_CPI`)** | **Entitled (`PUBLIC_DELAYED`)** — Official European Central Bank daily FX pairs and MOSPI CPI series with exact source dates. | **Entitled (`PUBLIC_DELAYED`)** — Same official reference feeds. |
| **Private User CSV OHLCV Dataset (`customCsv`)** | **Entitled (`Personal Research Only`)** — Any authenticated user can evaluate Soul Scan 2.0 rules across up to 1,000 personal CSV OHLCV series (or use the 5-stock Indian equity `TEST DATA` fixture). | **Entitled (`Personal Research Only`)** — Same personal CSV evaluation capability. |

---

## 2. Canonical Instrument Registry & Deterministic Search Ranker

### 2.1 Expanded Canonical Registry (`X2_INSTRUMENTS` & `VERIFIED_SEED_INSTRUMENTS`)
- **`X2_INSTRUMENTS` (41 canonical instruments):**
  - **NSE Equities:** `NSE:HDFCBANK`, `NSE:SBIN`, `NSE:RELIANCE`, `NSE:TCS`, `NSE:INFY`, `NSE:ICICIBANK`, `NSE:BHARTIARTL`, `NSE:ITC`, `NSE:KOTAKBANK`, `NSE:LT`, `NSE:AXISBANK`, `NSE:BAJFINANCE`, `NSE:MARUTI`, `NSE:SUNPHARMA`, `NSE:TITAN`, `NSE:TATAMOTORS`, `NSE:ADANIENT`, `NSE:WIPRO`, `NSE:HCLTECH`, `NSE:ULTRACEMCO`, `NSE:NTPC`, `NSE:POWERGRID`, `NSE:ONGC`, `NSE:TATASTEEL`, `NSE:HINDUNILVR`
  - **BSE Equities:** `BSE:HDFCBANK`, `BSE:SBIN`, `BSE:RELIANCE`
  - **Indian Benchmarks (Indices):** `NSE:NIFTY`, `NSE:BANKNIFTY`, `BSE:SENSEX`
  - **MCX Commodity Futures (Generic & Dated Contracts):** `MCX:GOLD`, `MCX:GOLD04DEC26FUT`, `MCX:SILVER`, `MCX:CRUDEOIL`, `MCX:CRUDEOIL18DEC26FUT`
  - **Official ECB Daily Reference FX:** `FX:EURINR`, `FX:USDINR`, `FX:EURUSD`, `FX:GBPUSD`, `FX:USDJPY`
  - **Macro Benchmarks:** `MACRO:IN10Y`
- **`VERIFIED_SEED_INSTRUMENTS` (17 verified Angel One ScripMaster seed tokens):**
  - Includes `NSE:HDFCBANK` (`token: "1333"`), `BSE:HDFCBANK` (`token: "500180"`), `NSE:SBIN` (`token: "3045"`), `BSE:SBIN` (`token: "500112"`), `NSE:RELIANCE` (`token: "2885"`), `BSE:RELIANCE` (`token: "500325"`), `NSE:TCS` (`token: "11536"`), `NSE:INFY` (`token: "1594"`), `NSE:ICICIBANK` (`token: "4963"`), `NSE:BHARTIARTL` (`token: "10604"`), `NSE:ITC` (`token: "1660"`), `NSE:KOTAKBANK` (`token: "1922"`), `NSE:LT` (`token: "11483"`), `NSE:AXISBANK` (`token: "5900"`), `NSE:NIFTY` (`token: "99926000"`), `NSE:BANKNIFTY` (`token: "99926009"`), `BSE:SENSEX` (`token: "99919000"`), `MCX:GOLD04DEC26FUT`, `MCX:CRUDEOIL18DEC26FUT`.
  - Dynamic ScripMaster ingestion (`InstrumentMaster.ingestRawRows()`) indexes any non-seed NSE, BSE, or unexpired MCX futures contract (`NSE:ZOMATO`, `NSE:TRENT`, etc.) without restricting search to seed entries.

### 2.2 Common Indian Market Alias Dictionary (`COMMON_INSTRUMENT_ALIASES`)
Resolves colloquial Indian market queries deterministically:
- `HDFC`, `HDFC BANK`, `HDFCBANK`, `HDFCBANK-EQ` -> `NSE:HDFCBANK` (#1), `BSE:HDFCBANK` (#2)
- `SBI`, `STATE BANK`, `STATE BANK OF INDIA`, `SBIN` -> `NSE:SBIN` (#1), `BSE:SBIN` (#2)
- `RELIANCE`, `RIL`, `RELIANCE INDUSTRIES` -> `NSE:RELIANCE` (#1), `BSE:RELIANCE` (#2)
- `ICICI`, `ICICI BANK` -> `NSE:ICICIBANK`
- `AIRTEL`, `BHARTI`, `BHARTI AIRTEL` -> `NSE:BHARTIARTL`
- `KOTAK`, `KOTAK BANK` -> `NSE:KOTAKBANK`
- `L&T`, `LARSEN`, `LARSEN & TOUBRO` -> `NSE:LT`
- `HUL`, `HINDUSTAN UNILEVER` -> `NSE:HINDUNILVR`
- `NIFTY`, `NIFTY 50`, `NIFTY50` -> `NSE:NIFTY`
- `BANKNIFTY`, `NIFTY BANK` -> `NSE:BANKNIFTY`
- `SENSEX`, `BSE 30` -> `BSE:SENSEX`
- `GOLD`, `MCX GOLD`, `GOLD FUTURES` -> `MCX:GOLD` / `MCX:GOLD04DEC26FUT`
- `CRUDE`, `CRUDE OIL`, `CRUDEOIL` -> `MCX:CRUDEOIL` / `MCX:CRUDEOIL18DEC26FUT`

### 2.3 Deterministic Priority Scoring (`scoreCanonicalInstrument`)
`scoreCanonicalInstrument(query, item)` assigns deterministic scores with primary-listing tie-breakers (`NSE` preferred over `BSE` by `+4` when no exchange prefix is typed):

1. **Tier 1 (`1000`):** Exact canonical ID match (`NSE:HDFCBANK` === `NSE:HDFCBANK`).
2. **Tier 2 (`980`):** Exact exchange-prefixed alias match (`NSE:HDFC` -> `NSE:HDFCBANK`, `BSE:HDFC` -> `BSE:HDFCBANK`).
3. **Tier 3 (`960`):** Exact ticker symbol or tradingSymbol match (`HDFCBANK` or `HDFCBANK-EQ`).
4. **Tier 4 (`930`):** Exact alias match (`HDFC`, `HDFC BANK`, `SBI`, `RIL`, `L&T`, `HUL`).
5. **Tier 5 (`890`):** Symbol prefix match (`HDFC` prefix of `HDFCBANK`).
6. **Tier 6 (`850`):** Normalized full display name match (`HDFC Bank`).
7. **Tier 7 (`780`):** Display name word-boundary prefix match (`State Bank`).
8. **Tier 8 (`680`):** Substring match across symbol, display name, or alias list.

---

## 3. Soul Scan 2.0 Full-Universe Enumeration & Reconciled Accounting

### 3.1 Removal of Silent Truncation Caps
- Removed `.slice(0, 5)` from the owner Angel One branch in `researchUniverse()` (`backend/services/market-data/data-service.ts`).
- Removed `.slice(0, 20)` from the commercial provider branch in `researchUniverse()` (`backend/services/market-data/data-service.ts`).
- Raised `validateResearch()` `instrumentIds` limit from `100` to `1,000` (`backend/services/research/research.ts`).
- Raised `evaluateScan()` dataset cap (`LIMITS.datasets`) from `200` to `1,000` (`backend/engines/scan.ts`).

### 3.2 Reconciled Universe Accounting (`ScanUniverseAccounting`)
Every `preflightResearch()` and scan execution returns a reconciled `accounting` object satisfying:
$$\text{matched} + \text{notMatched} + \text{unknown} = \text{evaluated}$$
$$\text{evaluated} + \text{excluded} = \text{discovered}$$

- `discovered`: Total candidate instruments in the selected universe/filter (`datasets.length + sourceExclusions.length`).
- `authorized`: Datasets with `permitted !== false`.
- `eligible`: Datasets with sufficient point-in-time history and required fields to evaluate to `PASS` or `FAIL`.
- `evaluated`: Total datasets evaluated by the canonical rule engine (`result.total`).
- `matched`: Instruments evaluating to `PASS` (`result.matches`).
- `notMatched`: Instruments evaluating to `FAIL` (`result.failed`).
- `unknown`: Instruments evaluating to `UNKNOWN` (`result.unknown`).
- `excluded`: Candidate instruments excluded prior to evaluation with explicit per-instrument reasons.
- `coveragePct`: $\text{round}\left(\frac{\text{eligible}}{\text{discovered}} \times 100, 1\right)$.
- `batchPlan`: `{ totalCandidates, batchSize: 25, estimatedBatches, executionMode: "INLINE" | "BOUNDED_CHUNKED" }`.

---

## 4. Private User CSV OHLCV Dataset Importer (`parsePrivateCsvDataset`)

To ensure every researcher can test multi-stock technical rules (`sma`, `ema`, `rsi`, `macd`, `atr`, crossovers) on Indian equities even when public exchange redistribution is disabled:

- **Supported Schema:** `symbol,date,open,high,low,close,volume` (header required; `open`, `high`, `low`, `volume` optional for close-only formulas, required for OHLC/ATR formulas).
- **Strict Validation Rules:**
  - Maximum payload size: `512 KB`, up to `25,000` lines and `1,000` unique instruments.
  - Canonical symbol normalization (`HDFCBANK` -> `NSE:HDFCBANK`, or explicit `NSE:HDFCBANK`, `BSE:SBIN`, etc.).
  - Strict ISO calendar date validation (`YYYY-MM-DD`, verifying real month/day bounds so `2026-02-31` is rejected).
  - Future-date rejection (`barTime > nowMs + 86_400_000` fails closed).
  - Duplicate `(symbol, date)` detection (fails closed with line number).
  - Non-numeric, zero/negative price, negative volume, and impossible OHLC (`high < low`, `high < open`, `high < close`, `low > open`, `low > close`) rejection.
- **Provenance Labeling:** Tagged as `"Private User CSV (Personal Research Only)"` and never mixed into public market overview caches.
