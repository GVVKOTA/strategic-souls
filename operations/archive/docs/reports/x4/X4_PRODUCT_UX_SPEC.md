# Strategic Souls — X4 Product & UX Specification

- **Release:** `X4` (`4.0.0-x4`)
- **Theme Contract:** Canonical X1/X2/X3/X4 dark obsidian palette (`--bg-obsidian: #07060a`, `--text-primary: #f6f3ee`, `--text-secondary: #cbbfb2`, `--text-muted: #998e82`, `--accent-ember: #c86432`, `--accent-gold: #e0a341`). **Zero text-color hex tokens modified in `frontend/styles/globals.css` or `frontend/styles/motion.css`.**

---

## 1. Information Architecture & Top-Level Workspace Navigation

Strategic Souls X4 organizes user workflows into 6 clear top-level sections:

1. **Global (`Global`)** — Live Macro & Market Pulse, **Quick Instrument Discovery & Research Bar**, Asset Terminal, and Calendar & Events.
2. **Watchlist (`Watchlist`)** — Personal multi-asset portfolios, notes, alerts, and 1-click handoff to Asset Terminal or Soul Scan.
3. **Strategy (`Strategy`)** — **Soul Scan 2.0** (4-step scanner wizard with 5 dataset presets & private CSV OHLCV import), Backtest Lab, Paper Portfolio, Risk & Sizing, Calculators & Option Chain, and Alerts & Journal.
4. **Community (`Community`)** — **3-Concept First-Time Onboarding** (**Body**, **Group**, **Soul**), Discover People & Groups, My Groups, Inbox, Saved, Notifications, and Privacy & Safety.
5. **Private Broker (`Private Broker`)** — Owner-only Angel One SmartAPI status, ScripMaster inspection, and fail-closed entitlement diagnostics.
6. **About Strategic Souls (`Guide`)** — Plain-language 3-step workspace guide, release provenance (`X4`), and data ethics disclosures (replacing stale `"About X2"` / `"Strategic Souls X2"` labels).

---

## 2. Global Dashboard Redesign (`frontend/features/global/dashboard.tsx`)

### 2.1 Header & Primary Action Hierarchy
- **Primary CTA:** **Run a Soul Scan** (accent button in the Global header that opens `Strategy -> Soul Scan` immediately).
- **Sub-view Segmented Control:**
  - `Overview` (default)
  - `Asset Terminal` (displays the currently selected canonical instrument name & symbol, e.g., `Asset Terminal (HDFC Bank (NSE))`)
  - `Calendar & Events`

### 2.2 Quick Instrument Discovery & Research Bar (`Overview`)
- Located directly at the top of `Global -> Overview` so users never have to hunt for instrument search or Soul Scan.
- **Quick-Jump Instrument Pills:**
  - `HDFC Bank` (`NSE:HDFCBANK`)
  - `SBI` (`NSE:SBIN`)
  - `Reliance` (`NSE:RELIANCE`)
  - `Nifty 50` (`NSE:NIFTY`)
  - `Gold Futures` (`MCX:GOLD`)
  - `USD/INR` (`FX:USDINR`)
  - `Launch Soul Scan ->` (navigates directly to `Strategy -> Soul Scan`)
- **Inline Canonical Search Input:**
  - Accepts company names (`HDFC Bank`, `State Bank of India`), common abbreviations (`HDFC`, `SBI`, `Nifty`), ticker symbols (`HDFCBANK`, `SBIN`, `RELIANCE`, `GOLD`), or exchange-qualified IDs (`NSE:HDFCBANK`, `BSE:SENSEX`).
  - Displays up to 8 ranked matches with canonical title, exchange badge, canonical ID, and 1-click transition into `Asset Terminal`.

---

## 3. Universal Search Overlay (`frontend/components/workspace/universal-search.tsx`)

### 3.1 Multi-Domain Search Input & Category Scopes
- Accessible from the top header (`Search assets (HDFC, SBIN, NIFTY, GOLD), @Bodies, Groups, Souls...`).
- **9 Category Scope Filters:**
  1. `All` (default — searches canonical market instruments AND community records simultaneously)
  2. `All Assets`
  3. `Stocks` (`EQ`)
  4. `Indices` (`INDEX`)
  5. `Futures` (`FUT`)
  6. `FX & Yields` (`FX`, `MACRO`)
  7. `People (@Body)`
  8. `Groups`
  9. `Souls`

### 3.2 Keyboard Accessibility & Availability Badges
- **Keyboard Navigation:** `ArrowDown` / `ArrowUp` move active selection across combined asset + community results; `Enter` opens the highlighted instrument in `Global -> Asset Terminal` or opens the highlighted community record in `Community`; `Escape` closes the results popover.
- **Race-Free Debouncing:** Uses `200 ms` debounce + `AbortController` to cancel superseded `/api/market/instruments` requests.
- **Honest Availability Badges on Every Asset Row:**
  - `Public Live/Daily` (`PUBLIC_DELAYED`) — ECB Reference FX & MOSPI CPI.
  - `Owner Live` (`OWNER_PRIVATE`) — Owner-authenticated Angel One feed.
  - `Identity Verified · Quote Restricted` (`IDENTIFIED_ONLY` / `PUBLIC_IDENTITY_ONLY`) — Canonical NSE/BSE/MCX instrument identity verified; live broker quote withheld on public sessions without fake numbers.

---

## 4. Soul Scan 2.0 UX (`frontend/features/strategy/workspace.tsx`)

### 4.1 4-Step Visual Workflow Strip
1. **1. Choose Market Universe** — Pick stocks/indices, commodity futures, watchlist, official ECB FX, or private CSV OHLCV bars.
2. **2. Define Rule** — Use 1-click Beginner presets, Intermediate rule cards, or Advanced canonical formula AST (`close > sma(close, 20)`).
3. **3. Check Coverage (Preflight)** — Verify discovered, authorized, eligible, and unknown counts before persisting.
4. **4. Run & Inspect** — Execute the scan and sort/filter results (`PASS`, `FAIL`, `UNKNOWN`) with full bar-date provenance.

### 4.2 "Where Should We Scan?" 5-Preset Source Selector
- **Indian Equities & Indices** (`CONNECTED_MARKETS`) — Canonical NSE/BSE stocks & indices (`NSE:HDFCBANK`, `NSE:SBIN`, `NSE:RELIANCE`, `NSE:TCS`, `NSE:INFY`, `NSE:NIFTY`, etc.). Never silently substitutes currencies.
- **MCX Commodity Futures** (`CONNECTED_MARKETS`) — Gold, Silver, and Crude Oil futures (`MCX:GOLD05JUN26FUT`, `MCX:SILVER03JUL26FUT`, `MCX:CRUDEOIL19MAY26FUT`).
- **My Watchlist** — Narrows the scan to the user's active watchlist instruments (plus an inline canonical search bar to add/remove specific instruments such as `NSE:HDFCBANK` or `NSE:SBIN`).
- **Currencies (Official ECB Daily FX)** (`ECB_DAILY`) — 5 official European Central Bank daily reference FX pairs (`FX:EURINR`, `FX:USDINR`, `FX:EURUSD`, `FX:GBPUSD`, `FX:USDJPY`). Works keyless for all users.
- **Private User CSV OHLCV Dataset** — Allows any user to paste or load personal daily OHLCV CSV rows (`symbol,date,open,high,low,close,volume`) up to 1,000 instruments, including a **1-click 5-Stock Indian Equity `TEST DATA` Loader** (`NSE:HDFCBANK`, `NSE:SBIN`, `NSE:RELIANCE`, `NSE:TCS`, `NSE:INFY` across 25 daily bars) for immediate multi-stock indicator evaluation (`sma`, `ema`, `rsi`, `macd`, `atr`).

### 4.3 Reconciled Universe Accounting & Results Explorer
- Every preflight and executed scan displays:
  - **Discovered**, **Eligible**, **Evaluated**, **Matched (`PASS`)**, **Not Matched (`FAIL`)**, **Insufficient Data (`UNKNOWN`)**, **Coverage %**, and **Execution Mode** (`INLINE` vs `BOUNDED_CHUNKED`).
- Result cards display human-readable canonical titles alongside canonical IDs (`HDFC Bank (NSE) · NSE:HDFCBANK`), support status filtering (`ALL`, `PASS`, `FAIL`, `UNKNOWN`), and support deterministic sorting (`Matched (PASS) first` vs `Symbol (A–Z)`).

---

## 5. Community First-Time Onboarding & `@handle` Discovery UX (`frontend/features/community/`)

### 5.1 10-Second 3-Concept Onboarding Banner
Displayed at the top of `Community` (`dashboard.tsx`):
1. **1. Your Body (`@handle`)** — Your personal researcher profile and handle (for example `@vishnu`). Create your Body first and enable *"Let other members find my Body"* so peers can search your `@handle`.
2. **2. Groups** — Topic rooms where members discuss macro regimes, equities, commodities, and methodology.
3. **3. Souls** — Published, versioned research templates (scan rules + assumptions + risk notes) that anyone can inspect or clone into Strategy.

### 5.2 Step-1 Discoverability Opt-In & 1-Click Fix Banner
- **Step-1 Create/Edit Body Modal:** Includes a clearly explained checkbox:
  - *"Let other members find my Body in Community search (`@handle` & display name). You can change this anytime in Privacy & Safety."* (checked by default for explicit opt-in during creation).
- **1-Click `@handle` Copy Button:** Once a Body is created, the header displays `@handle · Copy @handle` so users can share their exact handle immediately.
- **Hidden-Body Warning Banner in `Discover People & Groups`:** If a user's Body currently has `discoverable = false`, a prominent banner explains: *"Your Body (@handle) is currently hidden from Community search"* with a 1-click **"Let other members find my Body"** button.

### 5.3 Simplified Community Navigation Labels
- `Discover People & Groups` (formerly `Discover`)
- `My Groups` (formerly `Groups`)
- `Inbox`
- `Saved`
- `Notifications`
- `Privacy & Safety` (formerly `Safety & Privacy`)

---

## 6. Responsive Viewport & Accessibility Matrix

- **Desktop (`1440×900`) & Laptop (`1280×800`):** Full workspace chrome, multi-column Soul Scan preset grid, and inline quick lookup.
- **Tablet (`768×1024`) & Mobile (`390×844`, `320×720`):** Single-column cards, touch-friendly controls (`>= 44 px` height on primary actions), zero horizontal page overflow (`overflowX === 0`), and full keyboard navigation.
