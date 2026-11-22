# Strategic Souls — Provider Integration Readiness Matrix (Founder Private Guide)

> **Security rule:** This document records **environment variable / secret NAMES only**. Never commit live secret values, tokens, passwords, TOTP seeds, or API keys to git. Always provision secrets via `wrangler secret put <NAME>` or the Cloudflare Dashboard (Workers → `strategic-souls` → Settings → Variables and Secrets).

## 1. Active Keyless Official Public Providers (Connected Today)

| Provider | Features Powered | Secrets Needed | Cost / License | Current Status |
|---|---|---|---|---|
| **ECB Eurofxref Daily & 90d XML** | `[04],[13],[14],[27]` Daily FX quotes, Asset Comparison, Correlation Lab | None | Free public attribution | **CONNECTED** |
| **US Treasury Daily Par Yield XML** | `[04],[13]` 3M / 2Y / 5Y / 10Y / 30Y daily yields | None | US Gov public domain | **CONNECTED** |
| **USGS Earthquake Hazards GeoJSON (`4.5_week`)** | `[20],[21],[23]` Daily World Briefing & 2D/3D seismic layer | None | US Gov public domain | **CONNECTED** |
| **NASA EONET v3 Open Natural Events** | `[20],[21],[23]` Cyclones, wildfires, volcanoes, storms | None | NASA public domain | **CONNECTED** |
| **NASA GIBS Blue Marble & Black Marble** | `[21]` 3D Earth & 2D World Satellite basemap (with bundled `/data/earth-day.jpg` offline fallback) | None | NASA public domain | **CONNECTED** |

## 2. Ready Adapters Awaiting Founder API Keys / Licenses (Zero Fabrication While Pending)

| Provider | Features Unlocked | Cloudflare Secret Names | Commercial / Compliance Notes | Activation Smoke Test |
|---|---|---|---|---|
| **Marketaux / Licensed Financial News** | `[15]` Market Intelligence News live headlines | `SS_NEWS_API_KEY` | Requires active API key with display rights for headlines/snippets + publisher deep links. | `GET /api/intelligence` → `news.status === "CONNECTED"` & `news.articles.length > 0` |
| **Angel One SmartAPI (Owner Read-Only)** | Owner-only NSE/BSE/MCX quote panel & terminal snapshot | `ANGELONE_API_KEY`, `ANGELONE_CLIENT_CODE`, `ANGELONE_MPIN`, `ANGELONE_TOTP_SECRET` | **STRICT OWNER-ONLY** (retail broker terms forbid public redistribution). **Static IP constraint:** Angel One enforces static egress IP allowlisting; Cloudflare Workers default egress IPs are dynamic — connect via a founder-controlled static-IP relay (`ANGELONE_RELAY_URL`) before enabling `ENABLE_PRIVATE_BROKER_DATA=true`. | Owner `GET /api/x2/providers` → Angel One healthy |
| **Commercial Indian Exchange Feed (NSE/BSE)** | `[16],[17],[19]` Public live NSE Sector breadth, colored Heatmaps, NIFTY 50 settlement | `SS_NSE_COMMERCIAL_API_KEY` (planned commercial adapter) | Public redistribution of NSE/BSE prices requires a signed commercial NSE Data & Analytics / authorized redistributor agreement. Never proxy retail broker quotes to public users. | `GET /api/markets/overview` → `NSE:NIFTY` `quality !== "RESTRICTED"` |
| **Commercial Global Indices & Commodities** | `[13],[17],[19],[27]` SPX, NDX, N225, Gold (XAU/USD), Silver, Brent historical + daily close | `SS_GLOBAL_QUOTES_API_KEY` | Requires commercial web display entitlement (e.g., Twelve Data / Polygon / EODHD commercial tier). | `GET /api/markets/overview` → `GLOBAL:XAUUSD` numeric price & `USD/oz` |
| **UCDP GED Conflict Dataset** | `[21],[22]` Sourced armed conflict markers on Strategic Globe | `UCDP_ACCESS_TOKEN` | Free research registration token from Uppsala Conflict Data Program (`CC BY 4.0`). | `GET /api/earth/conflicts?period=30d` → `status === "CONNECTED"` |
| **Cloudflare R2 Object Storage** | `[08]` Custom profile photo & portfolio backdrop file uploads | Bind bucket `MEDIA_BUCKET` in `wrangler.jsonc` | Currently disabled on Cloudflare account (`403 code 10042`). Requires founder opt-in in Cloudflare Dashboard (free tier 10 GB/mo; card on file required by Cloudflare). Upload validator (`/api/media/upload`) already enforces magic-byte sniffing, SVG/HTML rejection, and size limits. | Authenticated `POST /api/media/upload` with valid PNG → `200 OK` |

## 3. Production Worker & Database Bindings (Never Replace)

- **Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)
- **D1 Database:** `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`)
- **Workers Builds CI Trigger:** `0727e904-48ad-4e75-9b26-1d2123ec5063` (watches `main`)
