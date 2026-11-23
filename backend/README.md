# Backend Ownership Area (`backend/`)

**Owns:** Server-side authentication, authorization, Worker security/observability middleware, deterministic financial/scan/evidence engines, market-data validation & entitlement contracts, and intelligence/community services (`X5.5`).

---

## 1. What Belongs Here vs. What Does Not

### What Belongs Here
- Standalone Cloudflare D1 authentication & optional PKCE Google OAuth (`backend/auth/`).
- Cloudflare Worker fetch entrypoint, security headers, CSRF, rate limiting, and low-noise `/api/*` observability (`backend/middleware/`).
- Deterministic math, Soul Scan AST/DSL, next-open backtest, Evidence & Probability, Formula Lab, and portfolio engines (`backend/engines/`).
- Domain services for market data, intelligence, Earth conflict normalizers, research presets/quotas, community/messenger, and user profiles (`backend/services/`).
- External widget allowlists (`backend/integrations/`) and the optional Python DuckDB/NumPy quant package (`backend/quant/`).

### What Does Not Belong Here
- Framework route entrypoints (`app/api/**/route.ts`) — route files must remain at root [`app/api/`](../app/api/) for Vinext / Next.js App Router discovery, and should remain thin wrappers delegating to `backend/`.
- React UI components or CSS stylesheets — these belong in [`frontend/`](../frontend/).
- Drizzle table declarations or applied SQL migration files — schemas belong in [`database/schemas/`](../database/schemas/) and applied migrations remain in root [`drizzle/`](../drizzle/).

---

## 2. Key Entrypoints & Directory Map

| Path | Responsibility |
| --- | --- |
| `backend/middleware/index.ts` | Cloudflare Worker entrypoint referenced by `vite.config.ts` (`main: "./backend/middleware/index.ts"`). Enforces CSP/HSTS/cache headers, emits `X-Request-Id` and `Server-Timing: app;dur=<ms>` on `/api/*`, and logs anonymous `ss_api_signal` JSON strictly for `5xx`, `429`, or slow `/api/* > 1500ms` (pathname only; zero query strings or PII). |
| `backend/middleware/security.ts` | CSRF (`protectMutation`), bounded JSON parsing, consent/ownership guards, and feature kill-lists. |
| `backend/auth/session.ts` | Standalone Cloudflare D1 email/password auth (`PBKDF2-SHA256`, SHA-256 hashed `HttpOnly` session cookies, constant-time compare, session rotation) and optional PKCE Google OAuth. |
| `backend/engines/scan.ts` | **Canonical Soul Scan Engine:** Deterministic DSL/AST parser, compiler, and 3-valued evaluator (`TRUE` / `FALSE` / `UNKNOWN`). Both Classic (50 presets) and Advanced (`Discover` / `Build` / `Draw`) execute through this single AST. |
| `backend/engines/evidence-stats.ts` & `backtest.ts` | Coverage %, Match %, empirical probability, Wilson 95% confidence interval, Brier score, zero-division `N/A` guards, and next-open backtest evaluation. |
| `backend/engines/math.ts` & `analytics.ts` | Formula Lab Black-Scholes-Merton (BSM) option pricing/Greeks, Implied Volatility, CAGR, XIRR, returns-based Pearson correlation, and portfolio allocation math. |
| `backend/services/market-data/providers.ts` | Unified `validateFeedBatchContract` & `evaluateFeedEntitlement` contracts enforcing canonical symbol/MIC/IANA timezone/OHLCV/futures/staleness/quota checks and fail-closed redistribution rights (`HTTP 200 != display/redistribution`). |
| `backend/services/market-data/` | ECB FX & US Treasury parsers (`market-data.ts`), 9-card overview & D1 layouts (`nine-card-markets.ts`), Market Vox NIFTY/Gold polling (`daily-pulse.ts`), statutory Economic Calendar (`economic-calendar.ts`), 24 exchange clocks (`exchanges.ts`), 3D perspective Globe camera & UTC solar math (`globe.ts`), NSE sector heatmaps (`sectors-and-ecosystem.ts`), and owner-gated Angel One SmartAPI adapter (`angelone/`). |
| `backend/services/intelligence/` & `earth/` | Keyless USGS M4.5+ & NASA EONET natural hazard parsers, Daily World Briefing, Country Profiles, Provider Readiness Matrix, `SS_NEWS_API_KEY` Marketaux adapter (`news-and-disasters.ts`), and optional UCDP/ACLED conflict normalizers (`conflicts.ts`). |
| `backend/services/research/` | Classic 50 presets (`classic-presets.ts`), Discover NL blueprint parser (`discover-parser.ts`), scan quotas (`scan-quota.ts`), calibration gates (`research.ts`), and D1 workspace persistence (`workspace.ts`). |
| `backend/services/community/` & `profile/` | Soul Network (`research-network.ts` with O(1) `getAuthorizedWebSoulById`, public researcher search, and visibility-enforced connection lists), direct messages & notifications (`social.ts` with monotonic message snapshots & scoped `mark-read`), Rooms (`community.ts`), 50 avatar presets, 8 Obsidian banners, and profile settings (`profile.ts`). |
| `backend/quant/` | Optional isolated Python package (`souls-quant`) with 29 pytest tests (`backend/quant/tests/`). |

---

## 3. Non-Negotiable Backend Invariants

1. **One canonical Soul Scan AST:** Classic and Advanced modes must compile through `backend/engines/scan.ts`.
2. **Preserve timestamp precision:** Never append synthetic wall-clock times (such as `T16:00:00.000Z`) onto date-only ECB/Treasury observations or unannounced Economic Calendar dates.
3. **Server-enforced Market Vox windows & authorization:** Reject votes outside `opensAtUtc <= serverNow < closesAtUtc` (`HTTP 409`); enforce single-row authorization (`getAuthorizedWebSoulById`) and block/consent checks on every read and mutation.
4. **Fail-closed entitlements & secret isolation:** Secrets never leave Worker `env` or gitignored `.secrets/angelone.env`; owner broker data is never redistributed publicly.

---

## 4. How to Verify Changes

```powershell
node operations/scripts/check-x2-release.mjs
uv run --project backend/quant pytest backend/quant/tests -q
node operations/scripts/scan-secrets.mjs
```
