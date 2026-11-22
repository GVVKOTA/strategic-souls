# Strategic Souls X5.3 — Release Notes (`The Focused Intelligence Terminal`)

**Release Date:** 22 November 2026 (IST)  
**Target Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)  
**Target D1 Database:** `ss` (binding `DB`, applied migrations `0000`–`0009` preserved untouched)

## 1. Key Product & Architecture Changes

### Global — Focused 4-Block Strategic Dashboard & Exact 4-Item Menu
- **Exact 4-block Global Overview (`DASHBOARD`):**
  1. Big, centered `#76C0FF` **`Strategic Dashboard`** title + 9 customizable market cards (3×3 responsive; date-only source precision preserved without synthetic `T16:00:00.000Z` timestamps).
  2. Compact **`My Portfolio` & `Watchlist`** summary section (links cleanly to dedicated full Portfolio ledger/allocation donut and Watchlists screens).
  3. **ONE enlarged, truly zoomable 3D `Strategic Globe`**.
  4. **Redesigned `Economic Calendar`** at the bottom.
- **Exact 4-item Top-Left Three-Dot Global Menu (`frontend/components/workspace/global-menu.ts`):**
  1. `Strategic Dashboard`
  2. `Market Intelligence / Economic Calendar` (focused view with internal tabs `[Headlines | Calendar | Market Vox]`)
  3. `Heatmap` (focused NSE Sector Explorer / expandable neutral-until-connected Heatmaps + Asset Comparison)
  4. `Strategic Globe` (immersive focus on the same ONE 3D Earth renderer)
- Removed legacy 9-item drawer, redundant horizontal `Overview | Watchlists | Portfolio | Market Explorer` rail, and `<Global key={...}>` remount churn.

### Strategic Globe — Enlarged 1.0×–5.0× Perspective 3D Earth & Complete 2D Map Removal
- **Removed all 2D geographical maps from Global:** Eliminated `WorldConflictMap` / MapLibre imports, `earth-map.css` from `app/layout.tsx`, `"Globe | List"` switcher, `"Investigate on 2D map"`, and `"2D compatibility view"`. Archived legacy 2D files cleanly in `operations/archive/frontend/features/earth/`.
- **Perspective 3D camera & multi-level zoom (`1.0×`–`5.0×`):** Upgraded `backend/services/market-data/globe.ts` (`projectPerspective`, `unprojectScreenToLatLon`, `globeCameraParams`) and `frontend/features/global/globe-canvas.tsx` with true perspective projection, smooth zoom interpolation, zero near/far clipping, circular silhouette across all aspect ratios, adaptive drag inertia, two-finger touch pinch, double-tap/click zoom-to-point, keyboard controls (`Arrows`, `+`/`−`, `0`/`Home`), and lazy/offscreen-paused WebGL lifecycle.
- **Direct 3D surface markers & on-demand overlays:** 24 exchanges, live USGS M4.5+ earthquakes, live NASA EONET natural disasters, 8 macro country anchors, and configured conflicts render directly on the 3D sphere with horizon occlusion, zoom-accurate picking, compact Explore/Briefing/Layers popovers, on-demand contextual drawer, and Info/Accessibility resolution disclosures.

### Economic Calendar & Market Vox (Fixed Post-Close Timing)
- **Economic Calendar visual redesign:** Flat timeline rows with compact date/time chip, subtle dividers, minimal status icons, crisp `IST / UTC / New York` timezone select (`>=16px` mobile input, zero `"Zon/e"` wrap), `"Time not announced"` for date-only releases, verified coverage disclosure through Mar 2027, and zero `HIGH/MEDIUM/LOW` impact UI.
- **Market Vox (`NIFTY & Gold community vote`):** Renamed user-facing `"Daily Market Pulse"` → **`MARKET VOX`** and relocated under `Market Intelligence / Economic Calendar` → `Market Vox`.
- **Fixed X5.2 poll timing defect (`backend/services/market-data/daily-pulse.ts`):** Server now enforces **both** `opensAtUtc <= serverNow < closesAtUtc` on `GET` and `POST`:
  - **NIFTY 50:** Opens at `15:30 IST` (`10:00 UTC`) after prior NSE close and closes at `09:15 IST` (`03:45 UTC`) before next NSE trading session opens (skipping weekends & 2026 NSE holidays). Rejects votes during live NSE hours (`09:15–15:30 IST`) and after cutoff with HTTP `409`.
  - **Gold (`GLOBAL:XAUUSD` OTC Spot Benchmark — explicitly NOT MCX Gold futures):** Opens `21:00 UTC` after NY close and closes `07:00 UTC` before London session.
  - Existing D1 votes in `x52_market_poll_votes` are preserved intact; legacy schedule rows self-heal on read/write.

### Strategy Builder — Compact Results, Bold GRAVEYARD & Truthful Evidence Charts
- Compact responsive result summary (`Matched`, `Evaluated`, `Failed`, `Unknown`), concise formula/method bar with copyable digest behind Details, **collapsed-by-default** match accordions, and collapsed `Coverage & Exclusions (N)`.
- Added **`ScanCoverageChart`** (stacked SVG `PASS / FAIL / UNKNOWN` bar) and **`EmpiricalProbabilityChart`** (`frontend/features/strategy/evidence-charts.tsx` + `backend/engines/evidence-stats.ts`) displaying calibrated Wilson 95% intervals only when real verified trials exist, and an honest `"Insufficient verified observations"` state otherwise.
- Prominent bold **`GRAVEYARD`** archive section with archive badge, blue-accent border, compact cards, and immutable post-mortem / Post Soul actions.

### Repository Organization & Documentation
- Consolidated verified obsolete/superseded files into the single archive location **`operations/archive/`** with full manifest in [`operations/archive/README.md`](../archive/README.md).
- Rebuilt root [`README.md`](../../README.md), [`AGENTS.md`](../../AGENTS.md), and area READMEs (`frontend/`, `backend/`, `database/`, `operations/docs/`) for X5.3.

## 2. Current Provider Status (Truthful Disclosure)
- **Connected (Keyless Official):** ECB Eurofxref daily FX, US Treasury daily par yields, USGS M4.5+ Earthquake GeoJSON, NASA EONET v3 open natural events, NASA Blue/Black Marble historical textures.
- **Key-Gated / Pending License:** `SS_NEWS_API_KEY` (Marketaux live headlines — adapter now extracts canonical `relatedAssets` honoring `.NS`/`.BO` suffixes), `SS_GLOBAL_QUOTES_API_KEY`, commercial NSE/BSE feed, `UCDP_ACCESS_TOKEN`, owner-only Angel One SmartAPI (`ANGELONE_*` + static-IP relay).
- **Account-Disabled:** Cloudflare R2 (`403 code 10042`).
