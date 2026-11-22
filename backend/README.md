# Backend Ownership Area (`backend/`)

**Owns:** Server-side authentication, authorization, security middleware, deterministic financial/scan/evidence engines, market-data adapters, and intelligence feeds (`X5.3`).

## Directory Map

| Path | Responsibility |
| --- | --- |
| `backend/auth/` | Standalone Cloudflare D1 email/password auth (`PBKDF2-SHA256`, SHA-256 hashed `HttpOnly` session cookies, constant-time compare, session rotation) and optional PKCE Google OAuth (`session.ts`). |
| `backend/middleware/` | Cloudflare Worker entrypoint (`index.ts`) enforcing CSP/HSTS/cache headers, plus CSRF (`protectMutation`), bounded JSON parsing, consent/ownership guards, and feature kill-lists (`security.ts`). |
| `backend/engines/` | Deterministic engines: Soul Scan DSL/AST compiler & 3-valued evaluator (`scan.ts`), next-open backtest (`backtest.ts`), Correlation Lab / Portfolio Allocation / Asset Comparison / Event Window analytics (`analytics.ts`), Evidence & Probability statistics (`evidence-stats.ts`), Soul Genome (`soul-genome.ts`), pattern drawing similarity (`pattern-draw.ts`), Formula Lab BSM/Greeks/IV/CAGR/XIRR (`math.ts`), multi-currency manual ledger (`portfolio.ts`), chart analytics (`chart-analytics.ts`), and legacy archive engine (`engine.ts`). |
| `backend/services/market-data/` | ECB FX & US Treasury parsers (`market-data.ts`), 9-card overview & D1 layouts (`nine-card-markets.ts`, `nine-card-types.ts`), Market Vox NIFTY/Gold post-close polling (`daily-pulse.ts`), official Economic Calendar (`economic-calendar.ts`), 24 exchange clocks (`exchanges.ts`), 3D perspective Globe camera & UTC solar math (`globe.ts`), NSE curated sector heatmaps & geopolitics pathways (`sectors-and-ecosystem.ts`), instrument registry, and owner-gated Angel One SmartAPI adapter (`angelone/`). |
| `backend/services/intelligence/` | Keyless USGS M4.5+ & NASA EONET natural hazard parsers, Daily World Briefing builder, Country Profiles, Provider Integration Readiness Matrix, and `SS_NEWS_API_KEY` Marketaux adapter with canonical entity mapping (`news-and-disasters.ts`). |
| `backend/services/earth/` | Optional UCDP/ACLED conflict normalizers & fail-closed gate (`conflicts.ts`) and region lookup (`locations.ts`). |
| `backend/services/research/` | Classic 50 presets (`classic-presets.ts`), Discover NL blueprint parser (`discover-parser.ts`), scan quotas (`scan-quota.ts`), RuleTree <-> AST compiler & calibration gates (`research.ts`), entitlement projection (`scan-projection.ts`), and D1 workspace persistence (`workspace.ts`). |
| `backend/services/community/` & `backend/services/profile/` | Research Network & Community groups/pins/DMs/moderation, 50 avatar presets, 8 Obsidian banners, and private profile/preferences services. |
| `backend/services/user/` | Per-user search history & My Watch Regions D1 store (`preferences-store.ts`). |
| `backend/integrations/` & `backend/quant/` | Allowlisted TradingView widget helpers and optional Python DuckDB/NumPy quant package (`souls-quant`, 29 pytest tests). |

## Non-Negotiable Backend Rules

1. **One canonical Soul Scan AST:** Classic and Advanced modes all compile through `backend/engines/scan.ts`.
2. **Preserve timestamp precision:** Never append synthetic wall-clock timestamps onto date-only ECB/Treasury observations or Economic Calendar dates.
3. **Enforce server-side poll windows:** Market Vox rejects votes before `opensAtUtc` OR at/after `closesAtUtc` with HTTP `409`.
4. **Secrets never leave Worker `env`:** Fail closed on missing keys, display rights, or account entitlements.
