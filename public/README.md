# Public Static Assets Area (`public/`)

**Owns:** Static files served directly at `/` by Cloudflare Workers Static Assets.

## Directory Map

| Path | Public URL | Responsibility & Rules |
| --- | --- | --- |
| `public/gvv-approved.jpg` | `/gvv-approved.jpg` | Official approved **Global Vertex Vectors (GVV)** silver-eclipse header mark. Do not replace without founder approval. |
| `public/favicon-x1.svg`, `public/favicon.svg` | `/favicon-x1.svg` | Active matte-black/silver favicon and retained legacy icon. |
| `public/data/` | `/data/*` | Authentic **NASA Blue Marble Next Generation (2004)** & **Black Marble (2016)** textures (`earth-day.jpg`, `earth-night.jpg`, `earth-clouds.jpg`, `earth-static.jpg`), Natural Earth 110m TopoJSON (`land-110m.json`), and SHA-256 provenance manifest (`earth-assets.json`). SHA-256 integrity is verified by `tests/unit/x1-globe.test.mjs`. Historical NASA imagery is never labelled as live satellite telemetry. |
| `public/fonts/` | `/fonts/*` | Self-hosted WOFF2 weights for **Space Grotesk**, **Inter**, and **IBM Plex Mono**, `fonts.css`, and SIL OFL licenses. Preserve every font filename referenced in `fonts.css` and `app/layout.tsx`. |
| `public/downloads/` | `/downloads/*` | Public offline reference copies (`README_Strategic_Souls_GVV.md`, `RELEASE_REVIEW_Strategic_Souls_GVV.md`, `Strategic_Souls_GVV_One_File_Reference.html`). Audited in X3: zero emails, zero credentials, zero private user rows. Never place private exports or keys here. |
