# Strategic Souls — Engineering Changelog & Architecture Decisions

Consolidates the milestone decisions and structural transitions previously scattered across chronological release logs. Full historical commits and raw phase archives remain recoverable in Git history (`recovery/pre-refactor-6a569bd` prior to the five-folder consolidation).

---

## 2026-11-26 — Hardening, CI Fix, Dead Code Pruning & Live UX Release (`main`)
- **CI & Lint (`verify.yml`, `verify-v3.yml`):** Installed `pnpm/action-setup@v4` (`11.25.0`) before `actions/setup-node@v4` cache setup, added `scan-v3-source.mjs` to `verify.yml`, and resolved all 12 ESLint warnings across backend services and UI components (0 errors, 0 warnings).
- **Safe Pruning & Auth Surface:** Confirmed production D1 holds zero Google OAuth accounts and removed unused Google OAuth routes, panel flows, env definitions, and CSS while keeping first-party D1 email/password authentication and migrations `0000`–`0020` intact. Removed orphaned `frontend/features/v3/{workspace,portfolio}.tsx`, deduplicated 4 identical font files, and pruned 20 unused packages (`-134` lockfile entries) under strict `pnpm-workspace.yaml` policy.
- **Bundle & Live UI Fixes:** Made `maplibre-gl` dynamically client-only and bounded regional markers to viewport extents; fixed `upcoming` Economic Calendar filtering to exclude released events; decoded HTML entities in NASA EONET titles; enabled default respectful Earth auto-rotation (`prefers-reduced-motion` compliant); aligned Formula Lab initial ready state and Advanced Soul Scan default formula tree sync/bounds; added `/[slug]` route metadata/navigation links, mobile dock `safe-area-inset-bottom` clearance, and `/legal/compliance` footer link.

## 2026-11-26 — Five-Folder Repository Consolidation (`refactor/five-folder-repository`)
- **Decision:** Reorganized 637 tracked files (11 root directories, 20 root files) into strictly five tracked top-level directories (`.github/`, `application/`, `database/`, `documentation/`, `operations/`) + a single root `README.md`, with zero functional changes to routes, APIs, UI tokens, security boundaries, or D1 schema identity.
- **Architectural boundary:** Placed the complete Next/Vinext/Cloudflare Worker JavaScript project root inside `application/` (preserving `app/`, `public/`, `frontend/`, `backend/`, `database/`, `tests/`, configs, lockfile, and `AGENTS.md`) while consolidating SQL migration history (`0000`–`0020` byte-for-byte + `supabase/`) under top-level `database/`.
- **Evidence-based removals:** Retired historical `operations/archive/` (73 files), `X6_PROGRESS.md`, broken `operations/examples/` (2 files), unused `frontend/components/ui/` shadcn template scaffold (56 files + `utils.ts`, `use-mobile.ts`, `vendor/`, `components.json`), unreferenced `scroll-tabs.tsx`, obsolete Nov-7 `public/downloads/` + `build-reference.mjs` + `export-coverage.mjs`, legacy `npm-ci` installers (`install-ci.*`, `npm-install.mjs`), and overlapping chronological audit markdowns.
- **Explicitly retained subsystems:** Angel One read-only VPC gateway, `/legacy` workspace & services, optional V3 local Supabase + Python quant (`backend/quant/`), MapLibre `regional-map.tsx`, and all 43 test suites (all confirmed actively referenced and passing).

## 2026-11-25 — Public Shared Market Data, Durable 500-Symbol Scanner & Official Reference Cache (`X7` / Public Launch Baseline)
- **Durable Nifty 500 Scanner (`0012`–`0019`):** Added batch job queue (`x78_market_scan_jobs`, `x78_market_scan_batches`), shared historical snapshot store (`x8_shared_history_snapshot`), versioned Nifty 500 universe registry (`x78_market_universes`), and read-time `DERIVED_ONLY` vs `DISPLAY_AND_DERIVED` enforcement (`scan-projection.ts`).
- **Official Keyless Reference Cache (`0020`):** Added shared 15-minute D1 cache for ECB daily FX and US Treasury yields with retrieval/publication timestamps.
- **External Rights Verification:** Documented that free Indian API (`500 req/mo`, close-only) and free BharatStock (`60 req/day`, no caching/public ToS) block live public Nifty 500 activation; production D1 `x2_providers` stays clean (`0` rows) pending paid BharatStock (`DERIVED_ONLY`) and authorized constituent delivery.

## 2026-11-21 – 2026-11-24 — X3.1 Private Broker Gateway & X5.1–X5.6 Workspace / Social / UI Polish
- **X3.1 Angel One VPC Gateway (`backend/services/market-data/angelone/`):** Built strictly read-only loopback adapter (`127.0.0.1:8791`) + Workers VPC gateway (`MARKET_DATA_ADAPTER`, `X2_OWNER_SUBJECT`), keeping trading credentials out of edge Worker code and Cloudflare D1.
- **X5.1–X5.6 Terminal, Messenger, Profile & Formulas:** Consolidated 50 Classic Soul Scan presets, desktop/mobile responsive grids (`320px+` zero overflow), canonical profiles, 50 SVG avatars, custom banners, and 15-second polled private group research & DM flows.
- **X11 / V3.1 Release Verification:** Verified `/api/release` provenance separation (no secret/vendor token leakage in public APIs or asset terminal subtitles) and maintained the `#070809`/`#101215`/`#76C0FF` Obsidian Eclipse palette.

## 2026-11-14 – 2026-11-17 — X1, X2 & V3 Foundations
- **X1 Obsidian Eclipse & 3D Earth:** Introduced exact neutral design tokens in `globals.css`, self-hosted SIL OFL fonts, WebGL NASA Blue/Black Marble globe across 24 ISO 10383 MIC exchanges, and `EclipseIntro` one-shot motion.
- **X2 Formula Lab, GRAVEYARD & Social Security:** Added deterministic Soul Scan AST engine, probability/outcome accountability records, opt-in Body discovery, and atomic invite/membership checks.
- **V3 Optional Local Stack (`database/supabase/`, `backend/quant/`):** Delivered PostgreSQL RLS schema (`000100`–`000600`), `/api/v3/[...segments]` handler, and Python DuckDB/Parquet evaluation library (`souls_quant`).
