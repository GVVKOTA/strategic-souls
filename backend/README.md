# Backend Ownership Area (`backend/`)

**Owns:** Server-side authentication, authorization, security middleware, deterministic financial/scan engines, and external market-data adapters.

## Directory Map

| Path | Responsibility |
| --- | --- |
| `backend/auth/` | Standalone Cloudflare D1 email/password auth (`PBKDF2-SHA256`, SHA-256 hashed `HttpOnly` session cookies, constant-time token compare, session rotation) and optional PKCE Google OAuth (`session.ts`). Zero OpenAI/ChatGPT auth. |
| `backend/middleware/` | Cloudflare Worker entrypoint (`index.ts`) enforcing CSP/HSTS/cache headers, plus CSRF (`protectMutation`), bounded JSON parsing, consent/ownership guards, and feature kill-lists (`security.ts`). |
| `backend/engines/` | Canonical deterministic engines: Soul Scan DSL/AST compiler & 3-valued (`PASS`/`FAIL`/`UNKNOWN`) evaluator (`scan.ts`), next-open backtest simulator (`backtest.ts`), entitlement-gated chart indicators (`chart-analytics.ts`), Formula Lab BSM/Greeks/IV/CAGR/XIRR (`math.ts`), multi-currency manual portfolio moving-average ledger (`portfolio.ts`), and isolated legacy synthetic engine (`engine.ts`). |
| `backend/services/market-data/` | Keyless official ECB FX & US Treasury parsers (`market-data.ts`), server-side EODHD & TrueData adapters (`providers.ts`), unified X2 data orchestrator (`data-service.ts`), 24 ISO 10383 MIC exchange clocks (`exchanges.ts`), 3D globe & UTC solar lighting math (`globe.ts`), instrument registries, and fail-closed quote contracts. |
| `backend/services/research/` | Beginner guided scan presets, Research Glossary, nested `RuleTree` <-> formula compiler, Wilson/Brier/ECE OOS calibration gates (`research.ts`), read-time entitlement projection (`scan-projection.ts`), and D1 workspace persistence (`workspace.ts`). |
| `backend/services/community/` | X1 Community D1 service (Bodies, groups, invites, shared Souls, revisions, posts, Supers, comments, reports) and X2 Social service (opt-in discovery, DMs, join requests, discussions, bookmarks, blocks, notifications, export/erasure). |
| `backend/services/legacy/` & `backend/services/v3/` | Retained `/legacy` notebook/content/gates and optional V3 Supabase service. |
| `backend/integrations/` | Allowlisted on-request TradingView embed URLs (`tradingview.ts`) and connector context helpers. |
| `backend/quant/` | Optional Python 3.11+ DuckDB/NumPy/PyArrow quant package (`souls-quant`, 29 pytest tests). |

## Non-Negotiable Backend Rules

1. **One canonical Soul Scan AST:** Beginner, Intermediate, and Advanced modes all compile through `backend/engines/scan.ts`.
2. **Secrets never leave Worker `env`:** Never log, return, store in D1, or bundle `X2_EODHD_API_TOKEN`, `X2_TRUEDATA_BEARER_TOKEN`, `GOOGLE_CLIENT_SECRET`, or `X2_OWNER_SUBJECT`.
3. **Fail closed on missing keys or rights:** An HTTP 200 or present key never implies display, derived-display, storage, or redistribution rights.
4. **Enforce auth, consent, and resource ownership on the server** for every protected read and mutation.
