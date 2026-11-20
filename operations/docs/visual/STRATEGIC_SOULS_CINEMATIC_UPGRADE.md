# Strategic Souls — Cinematic UI, Typography, Motion, Loader & Natural-Color Earth Upgrade

**Status:** Implemented & verified on feature branch `feat/x3-strategic-souls-upgrade` (see [`../X2_RELEASE_REPORT.md`](../X2_RELEASE_REPORT.md) for live deployment status).

---

## 1. Absolute UI Text Color Immutability Table

**Rule:** Zero existing UI text color hex tokens were altered. All readability gains come strictly from typography sizing, surface contrast, line height, spacing, and removal of cramped `12px !important` overrides. Verified automatically by `tests/unit/x1-palette.test.mjs` and browser `getComputedStyle` checks.

| CSS Custom Property (`frontend/styles/globals.css`) | Baseline (`af16aae`) | X3 Upgrade | Status |
| --- | --- | --- | --- |
| `--x1-bg` | `#070809` | `#070809` | **UNCHANGED** |
| `--x1-surface-1` | `#101215` | `#101215` | **UNCHANGED** |
| `--x1-surface-2` | `#191C20` | `#191C20` | **UNCHANGED** |
| `--x1-surface-3` | `#23272D` | `#23272D` | **UNCHANGED** |
| `--x1-divider` | `#3B424C` | `#3B424C` | **UNCHANGED** |
| `--x1-divider-strong` | `#677382` | `#677382` | **UNCHANGED** |
| `--x1-text-primary` | `#E8EDF2` | `#E8EDF2` | **UNCHANGED** |
| `--x1-text-secondary` | `#CAD3DC` | `#CAD3DC` | **UNCHANGED** |
| `--x1-text-tertiary` | `#B9C3CE` | `#B9C3CE` | **UNCHANGED** |
| `--x1-text-muted` | `#A7B1BC` | `#A7B1BC` | **UNCHANGED** |
| `--x1-title-blue` (headings `h1`/`h2`/`h3` only) | `#76C0FF` | `#76C0FF` | **UNCHANGED** |
| `--x1-title-blue-alt` (headings `h1`/`h2`/`h3` only) | `#94D0FF` | `#94D0FF` | **UNCHANGED** |

- Approved GVV silver-eclipse logo (`public/gvv-approved.jpg`) and matte-black aesthetic preserved intact.
- Zero `backdrop-filter`, zero `color-mix()`, zero text gradients/glows, and zero forbidden non-neutral accents added to UI chrome.

---

## 2. Silver Typography Scale & Mobile Form Usability

All fonts remain self-hosted WOFF2 in `public/fonts/`:
- **Display / Headings:** `Space Grotesk`
- **Body / Navigation / Forms:** `Inter`
- **Quotes / Tickers / Timestamps / Formula Stats:** `IBM Plex Mono` (`font-variant-numeric: tabular-nums`)

### Before vs. After Improvements (`frontend/styles/x1.css`, `frontend/styles/x2.css`)

| Element | Before (`af16aae`) | After (X3) | Why |
| --- | --- | --- | --- |
| Primary & secondary CTA buttons (`.x1-primary`, `.x1-secondary`) | `12px !important` | `14px` (no `!important` cascade) | Materially clearer silver button copy and cleaner tap targets (`>=44px` height). |
| Text buttons, form labels, sub-tabs, callout copy | `12px` / `13px` | `14px` desktop (`line-height: 1.55–1.6`) | Eliminates squint-inducing silver labels without recoloring text. |
| Mobile form inputs, selects & header search (`<= 680px`) | `12px`–`14px` | `16px` (`1rem`) minimum | Eliminates iOS Safari & Android Chrome automatic viewport zoom on input focus. |
| Table headers & data cells | `12px`–`13px` | `14px` cells with `tabular-nums` | Crisp numeric alignment in watchlists, ledgers, and scan evidence tables. |
| Regression gate | None for button/mobile input sizes | Enforced in `tests/unit/x1-palette.test.mjs` | Prevents future reintroduction of `12px !important` or `<16px` mobile inputs. |

---

## 3. Motion Design System & Branded Non-Blocking Loaders

### Preserved Signature Entry Contract (`frontend/components/workspace/eclipse-intro.tsx` & `motion.css`)
- **Duration:** `<= 1050ms` React lifetime + `1100ms` CSS safety escape animation (verified by `tests/unit/x1-motion.test.mjs`).
- **Behavior:** Plays at most once per browser session (`sessionStorage`), immediately skippable, non-blocking, honors `prefers-reduced-motion: reduce`, never replays across tab switches.

### X3 Motion Scale & User Preference
- Hover/tap feedback: `140ms` (`transform`/`border-color` only).
- Tab/card/modal entrances: preserved bounded durations (`180ms`–`280ms`, `transform`/`opacity` only, no perpetual flashing or 60 FPS React loops).
- **Motion Preference Toggle:** Optional **System (default)** / **Minimal** preference added in the Account & About modals (`localStorage` key `ss-motion-pref`, sets `data-motion="minimal"` on `.x1-app` to reduce non-essential transitions and animations cleanly without affecting `motion.css` unit assertions).

### Branded Real-State Loaders (`WorkspaceSkeleton` & Globe Loading Stages)
- **`WorkspaceSkeleton` (`frontend/components/workspace/shared.tsx`):** Non-blocking layout-matched matte-black shimmer skeleton (`role="status"`, `aria-live="polite"`) used in Suspense boundaries and active async fetches; waits `140ms` before revealing so instant cache/local responses never flash.
- **Earth Texture Loader (`frontend/features/global/globe-canvas.tsx`):** Reserves stable canvas height, displays static natural-color fallback while WebGL textures download, tracks honest lifecycle stages (`preparing` -> `loading` -> `ready` | `failed`), offers one-click retry on failure, and recovers cleanly on `webglcontextlost` / `webglcontextrestored`.
- **Server-Confirmed Mutations:** Auth forms (`submitLock` ref), watchlist/portfolio saves, and Community actions disable duplicate submission and only report success after real server HTTP confirmation.

---

## 4. Natural Full-Color Interactive 3D Earth Engineering

Upgraded raw WebGL2/WebGL1 renderer (`frontend/features/global/globe-canvas.tsx`) and spherical math (`backend/services/market-data/globe.ts`) without adding Three.js bundle bloat.

### Color Science & Rendering Pipeline
1. **Linear-Space NASA Blue Marble Day Layer:** Samples `/data/earth-day.jpg` and converts sRGB (`pow(c, 2.2)`) to linear light, preserving natural ocean blues, forested greens, arid browns, and polar ice — replacing the prior monochrome luminance shader.
2. **Approximate UTC Solar Terminator:** `solarDirection(at)` computes approximate Earth subsolar longitude/declination from UTC clock (`rotateToView` transforms into view space), yielding a physically smooth day/twilight/night terminator instead of an arbitrary static side-light. Explicitly disclosed in UI as an approximate solar lighting model.
3. **Ocean Mask & Specular Glint:** Derives ocean reflectance heuristic from linear Blue Marble chromaticity to apply restrained Blinn-Phong sunlight glint over water without plastic glare on continents.
4. **Warm Historical Night City Lights:** Samples `/data/earth-night.jpg` (NASA Black Marble 2016) masked strictly onto the night hemisphere with warm sodium/tungsten tint (`vec3(1.0, 0.78, 0.48)`).
5. **Translucent Historical Cloud Cover:** Composites `/data/earth-clouds.jpg` over day and twilight surfaces while keeping coastlines and geography clearly legible.
6. **Restrained Atmospheric Fresnel Rim:** Thin Rayleigh sky-blue rim weighted toward the sunlit limb — no electric neon halo.
7. **Tone-Mapping & Gamma:** Photographic exposure curve (`1.0 - exp(-col * 1.15)`) converted back to sRGB (`pow(..., 1.0 / 2.2)`).
8. **Natural-Color Static Fallback (`globe-visual.css`):** Removed `filter: grayscale(1)` and `mix-blend-mode: screen` from `.x1-earth-static` so devices without WebGL or in 2D compatibility mode see crisp full-color NASA Earth alongside the accessible 24-exchange list.
9. **Interactivity & Performance Safeguards:**
   - All 24 ISO 10383 MIC exchanges, co-located NSE/BSE cluster disambiguation, drag/tap/wheel, keyboard navigation, pause/resume, and two-pointer touch **pinch-to-zoom** preserved and enhanced.
   - User-triggered **Explore Earth** 4-hub orbital tour (`XNSE` -> `XLON` -> `XNYS` -> `XTKS`) with explicit **Stop tour** control (never auto-runs under `prefers-reduced-motion`).
   - Adaptive `devicePixelRatio` clamp (`<= 2`), automatic RAF pause when `document.hidden` or offscreen/idle, full resource disposal on unmount.

### Authentic NASA Asset Provenance & Integrity (Byte-Unchanged)

Verified by SHA-256 checksum test in `tests/unit/x1-globe.test.mjs` against `public/data/earth-assets.json`:

| Asset | File | Resolution | Bytes | Imagery Period | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Day surface | `/data/earth-day.jpg` | `2048x1024` | `266,599` | June–Sept 2001 NASA Blue Marble (2002) | `d4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e` |
| Night lights | `/data/earth-night.jpg` | `3600x1800` | `365,655` | 2016 NASA Black Marble (Suomi NPP VIIRS) | `4d2158f59123dadf0696a1cf8909c45018a1de8d0daab40da04122a5aa7f27c6` |
| Cloud composite | `/data/earth-clouds.jpg` | `2048x1024` | `829,367` | Historical NASA Blue Marble cloud composite | `daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793` |
| Static fallback | `/data/earth-static.jpg` | `2048x2048` | `536,295` | 2002 NASA Blue Marble eastern hemisphere | `3b47b77b49ccd18ecf0aa58610a2047cc68a2e06a1de2e224295a1346aa2dc95` |

*Attribution:* NASA GSFC / NASA Earth Observatory; no NASA endorsement. Explicitly disclosed as historical composites, never live satellite feeds or real-time weather/market telemetry.
