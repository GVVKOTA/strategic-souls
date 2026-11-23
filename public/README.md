# Public Static Assets Area (`public/`)

**Owns:** Static files served directly at `/` by Vite / Vinext and Cloudflare Workers Static Assets (`X5.5`).

---

## 1. What Belongs Here vs. What Does Not

### What Belongs Here
- Official approved Global Vertex Vectors (GVV) brand mark (`public/gvv-approved.jpg`) and favicons (`public/favicon-x1.svg`, `public/favicon.svg`).
- Self-hosted WOFF2 fonts (`Space Grotesk`, `Inter`, `IBM Plex Mono`), `public/fonts/fonts.css`, and SIL Open Font License (`OFL`) files (`public/fonts/`).
- 50 deterministic SVG researcher avatar presets (`public/avatars/a01.svg`–`a50.svg`).
- Authentic historical NASA Blue Marble (2004) & Black Marble (2016) Earth textures, Natural Earth 110m TopoJSON, and SHA-256 provenance manifest (`public/data/earth-assets.json`).
- Audited offline public reference downloads (`public/downloads/`).

### What Does Not Belong Here
- Any private user data, database backups, credentials, API keys, or `.env`/`.dev.vars` values — files in `public/` are publicly downloadable by any web visitor.
- TypeScript/React components or server code — these belong in [`frontend/`](../frontend/) and [`backend/`](../backend/).

---

## 2. Key Entrypoints & Directory Map

| Path | Public URL | Responsibility & Integrity Rules |
| --- | --- | --- |
| `public/gvv-approved.jpg` | `/gvv-approved.jpg` | Official approved **Global Vertex Vectors (GVV)** silver-eclipse mark (`SHA-256: 7512003e8e05bf88c75ecb1b62b418000d61b9d4eedd560531017bc002288fab`). Embedded by `README.md` and top bar; never replace without founder approval. |
| `public/favicon-x1.svg`, `public/favicon.svg` | `/favicon-x1.svg` | Active matte-black/silver favicon and retained legacy icon. |
| `public/avatars/a01.svg`–`a50.svg` | `/avatars/a01.svg`–`a50.svg` | 50 built-in researcher avatar SVGs verified by `tests/unit/x6-avatars-and-earth.test.mjs` (work without Cloudflare R2). |
| `public/data/` | `/data/*` | **NASA Blue Marble Next Generation (2004)** & **Black Marble (2016)** textures (`earth-day.jpg`, `earth-night.jpg`, `earth-clouds.jpg`, `earth-static.jpg`), Natural Earth 110m TopoJSON (`land-110m.json`), and SHA-256 provenance manifest (`earth-assets.json`). Verified by `tests/unit/x1-globe.test.mjs`. Never claim historical NASA textures are live satellite imagery. |
| `public/fonts/` | `/fonts/*` | Self-hosted WOFF2 weights for **Space Grotesk**, **Inter**, and **IBM Plex Mono**, `fonts.css`, and SIL OFL licenses (`SpaceGrotesk-OFL.txt`, `Inter-OFL.txt`, `IBMPlexMono-OFL.txt`). |
| `public/downloads/` | `/downloads/*` | Public offline reference copies (`README_Strategic_Souls_GVV.md`, `RELEASE_REVIEW_Strategic_Souls_GVV.md`, `Strategic_Souls_GVV_One_File_Reference.html`). Scanned by `operations/scripts/scan-secrets.mjs`. |

---

## 3. Why `public/` Must Remain at Repository Root

1. Vite, Vinext, and Cloudflare Workers Static Assets serve `<root>/public/*` at root URL paths (`/gvv-approved.jpg`, `/fonts/fonts.css`, `/avatars/a01.svg`, `/data/earth-day.jpg`).
2. `tests/unit/x1-globe.test.mjs` verifies SHA-256 checksums directly against `public/data/earth-assets.json` and `public/data/earth-*.jpg`.
3. `tests/unit/x6-avatars-and-earth.test.mjs` resolves all 50 avatar SVG files directly from `resolve('public', preset.assetPath)`.
4. Root `README.md` renders `<img src="public/gvv-approved.jpg" ... />` on the GitHub repository homepage.

---

## 4. How to Verify Changes

```powershell
node --experimental-strip-types --experimental-vm-modules --test tests/unit/x1-globe.test.mjs tests/unit/x6-avatars-and-earth.test.mjs
node operations/scripts/scan-secrets.mjs
```
