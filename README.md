<p align="left">
  <img src="public/gvv-approved.jpg" width="96" alt="Global Vertex Vectors (GVV) eclipse logo" />
</p>

# Strategic Souls (SS)

**Research into evidence.**

Strategic Souls is a financial-market research and strategy workspace developed by **Global Vertex Vectors (GVV)**. It is built to help independent investors and market researchers explore global markets, turn trading ideas into structured rules, inspect transparent evidence, and collaborate in one connected platform.

> [!NOTE]
> **Project Status — Active Development (X2):**
> The core X2 web application, local Cloudflare Worker + D1 preview, canonical Soul Scan engine, Formula Lab, 3D exchange globe, official ECB/US Treasury data feeds, and Community workflows are implemented and verified with automated tests (`245` Node tests + `29` optional Python quant tests). Commercial NSE/BSE/MCX and global equity data feeds require licensed provider API keys (`EODHD`, `TrueData`) before live or historical market data is unlocked.

---

## Contents

- [At a Glance](#at-a-glance)
- [Mission & Vision](#mission--vision)
- [How Strategic Souls Works](#how-strategic-souls-works)
- [What Works Today vs. Optional & Key-Gated Features](#what-works-today-vs-optional--key-gated-features)
- [Repository Structure & Complete File Guide](#repository-structure--complete-file-guide)
- [Tech Stack](#tech-stack)
- [Quick Start (Run Locally)](#quick-start-run-locally)
- [Product Principles](#product-principles)
- [Development Priorities](#development-priorities)
- [Contributing & Releases](#contributing--releases)
- [Important Disclaimer](#important-disclaimer)

---

## At a Glance

| Item | Details |
| --- | --- |
| **Product** | Strategic Souls (SS) |
| **Developer** | Global Vertex Vectors (GVV) |
| **Stage** | Active Development — X2 (`2.0.0-x2`) |
| **Core Focus** | Financial research, custom market scanning, transparent evidence, and collaborative analysis |
| **Core Workspaces** | **Global** · **Strategy** · **Community** |
| **Markets in Scope** | NSE, BSE, MCX, and major global indices *(crypto is out of scope in X2)* |
| **Primary Stack** | React 19, TypeScript, Next.js conventions via Vinext + Vite, Cloudflare Workers + D1 (Drizzle ORM) |

---

## Mission & Vision

- **Mission:** Make professional-quality financial research easier to use, understand, and afford — for both beginners and experienced market researchers.
- **Vision:** Build a daily-use financial intelligence ecosystem where anyone can discover opportunities, test ideas against credible data, review historical evidence, and collaborate with other researchers in one organized workspace.

---

## How Strategic Souls Works

Strategic Souls is organized into **three connected workspaces** instead of disconnected tools.

### 1. Global — Understand the Markets

Explore market structure, sessions, and assets before forming a hypothesis.

- **Interactive 3D Satellite Globe:** Tracks 24 global stock exchanges with real-time IANA timezone & DST-aware open/closed session clocks using NASA Blue/Black Marble imagery.
- **Official Macro Feeds:** Live daily **ECB Euro FX reference rates** and **US Treasury par yields** with source, timestamp, and freshness labels.
- **Indian & Global Context:** Registry for NSE, BSE, MCX, and major global indices, paired with on-request TradingView display widgets and per-asset research terminals.
- **Watchlists & Manual Portfolios:** Track symbols and maintain a multi-currency manual transaction ledger (10 currencies with moving-average cost basis).

<br />

### 2. Strategy — Turn an Idea into a Soul

In Strategic Souls, a **Soul** is a named, structured market hypothesis built from testable rules.

**The Soul Scan Workflow:**

1. **Choose scope** — Select instruments, market coverage, and timeframe.
2. **Name your Soul** — Describe the market hypothesis you want to test.
3. **Build rules** — Use either the **Simple** visual rule builder or the **Advanced** canonical formula editor (SMA, EMA, Wilder RSI, MACD, ATR, crosses, and percent changes).
4. **Run preflight checks** — Verify data availability, provider entitlements, and limitations before execution.
5. **Inspect evidence** — Review matches, exclusions, and missing values clearly (`PASS`, `FAIL`, or `UNKNOWN` — missing data is never silently treated as `0`).
6. **Learn & iterate** — Save versions, inspect **Scan History**, and study retired or failed ideas in the **Graveyard**.

**Additional Strategy Tools:**

- **Formula Lab:** Educational calculators for Black-Scholes-Merton pricing & analytic Greeks, Implied Volatility, CAGR, and XIRR.
- **Market Radar & Financial Calendar:** High-level research context and event tracking.
- **Point-in-Time Replay & Contextual Backtesting:** Single-instrument, next-open simulation with strict calibration and out-of-sample evidence gates.

<br />

### 3. Community — Research Together

Collaborate with other researchers while keeping private portfolios and credentials protected.

- **Body Profiles:** Your researcher identity (`Body`) with opt-in discovery.
- **Research Groups:** Private or discoverable groups with role-based permissions (`OWNER`, `ADMIN`, `EDITOR`, `REVIEWER`, `VIEWER`), invitations, and admin-approved join requests.
- **Shared Souls & Revisions:** Share strategy versions with clear revision diffs without exposing your private holdings.
- **Discussions, Posts & Direct Messages:** Publish research notes, react with **Supers**, comment in threads, bookmark findings, and message peers with built-in blocking, rate limits, and reporting.

<br />

### The Strategic Souls Research Cycle

```text
   GLOBAL                   STRATEGY                         COMMUNITY
Explore markets  ──▶   Build a Soul  ──▶  Review  ──▶   Share research
       ▲                     │                                 │
       └────────── Refine your hypothesis ◀── Discuss findings ┘
```

**In short:** `Explore` → `Define` → `Scan` → `Review` → `Collaborate` → `Refine`

---

## What Works Today vs. Optional & Key-Gated Features

To keep expectations clear, here is the exact status of every capability in this repository:

| Category | Capabilities |
| --- | --- |
| **Working Out of the Box (Local Preview)** | 3D 24-exchange globe, live official ECB FX & US Treasury daily rates, canonical Soul Scan AST builder/evaluator, Formula Lab, watchlists, manual multi-currency portfolio ledger, X1/X2 Community & Social workflows, on-request TradingView display widgets, local Cloudflare Worker + D1 persistence (`http://127.0.0.1:5173`). |
| **Implemented — Requires Commercial Keys & Licences** | NSE, BSE, MCX, and global equity OHLC, fundamentals, statements, and news via **EODHD** (`X2_EODHD_API_TOKEN`) and **TrueData** (`X2_TRUEDATA_BEARER_TOKEN`). Until licensed and configured, adapters fail closed with clear `KEY REQUIRED` / `UNAVAILABLE` states. |
| **Optional / Retained Source (Off by Default)** | Legacy owner research notebook (`/legacy`), plus optional **V3** local stack: Supabase Auth/PostgreSQL RLS (`supabase/`) and Python DuckDB/NumPy/PyArrow quant worker (`backend/quant/`). |
| **Explicitly Out of Scope / Disabled** | No crypto scope in X2, no fabricated quotes or forward probabilities (`INSUFFICIENT EVIDENCE` when uncalibrated), no broker order execution, no payments/billing/ads, and GitHub pushes do **not** auto-deploy to production. |

---

## Repository Structure & Complete File Guide

This repository contains **374 files** organized cleanly by responsibility.

### High-Level Folder Map

| Path | Files | What Lives Here |
| --- | :---: | --- |
| **[`app/`](app/)** | 17 | Next.js / Vinext page routes (`/`, `/workspace`, `/legacy`, `/asset/[label]`, `/legal/[slug]`) and API endpoints (`/api/x1/*`, `/api/x2/*`, `/api/v3/*`). |
| **[`backend/`](backend/)** | 49 | Server-side auth, deterministic scan/math/backtest/portfolio engines, market-data adapters, community & research services, middleware, and the optional Python quant worker (`backend/quant/`). |
| **[`database/`](database/)** | 8 | Cloudflare D1 (SQLite) Drizzle ORM table schemas and database query helpers. |
| **[`drizzle/`](drizzle/)** | 15 | Chronological D1 SQL migrations (`0000`–`0006`) and Drizzle schema snapshots. |
| **[`frontend/`](frontend/)** | 95 | UI components, shared workspace shell, Global / Strategy / Community / Legacy / V3 dashboards, hooks, and stylesheets. |
| **[`public/`](public/)** | 23 | Approved GVV logo, favicons, NASA globe textures, self-hosted fonts, and reference downloads. |
| **[`operations/`](operations/)** | 113 | Developer & architecture guides, security/product specs, local preview & backup scripts, Vite plugins, examples, and historical audit reports. |
| **[`scripts/`](scripts/)** | 1 | Managed Sites installer entrypoint (`install-pnpm.sh`). |
| **[`supabase/`](supabase/)** | 9 | Optional V3 local Supabase config, email OTP template, and 6 PostgreSQL RLS migrations. |
| **[`tests/`](tests/)** | 22 | Automated Node.js unit and integration test suites (`245` tests). |
| **[`.github/workflows/`](.github/workflows/)** | 2 | GitHub Actions CI workflows (`verify.yml` and manual `verify-v3.yml`). |
| **[`.openai/`](.openai/)** | 1 | ChatGPT Sites hosting manifest (`hosting.json`) preserving D1 binding and project ID. |
| **Root Directory** | 19 | Project configuration, lockfiles, documentation, and engineering rules. |

---

### Detailed File-by-File Breakdown

Click any section below to view an explanation of every file inside that folder.

<details>
<summary><strong>1. Root Configuration & Project Files (19 files)</strong></summary>

| File | Purpose |
| --- | --- |
| [`README.md`](README.md) | Main project overview, setup guide, and complete repository documentation (this file). |
| [`AGENTS.md`](AGENTS.md) | Engineering governance rules: folder ownership, matte-black/silver/blue UI & evidence invariants, security rules, and release policy. |
| [`SOURCE_PROVENANCE.json`](SOURCE_PROVENANCE.json) | Machine-readable export manifest recording source provenance, verification checks, omitted generated logs, and SHA-256 asset/lockfile hashes. |
| [`package.json`](package.json) | Package metadata (`2.0.0-x2`), `pnpm@11.25.0`, scripts (`dev`, `build`, `verify:x2`, `test`, `test:quant`), and dependencies. |
| [`pnpm-lock.yaml`](pnpm-lock.yaml) | Exact pinned dependency graph for reproducible installs (`pnpm install --frozen-lockfile`). |
| [`pnpm-workspace.yaml`](pnpm-workspace.yaml) | Standalone pnpm workspace policy, minimum release age, allowed native builds, and security overrides. |
| [`.env.example`](.env.example) | Template listing optional X2 provider secrets (`X2_OWNER_SUBJECT`, `X2_EODHD_API_TOKEN`, `X2_TRUEDATA_BEARER_TOKEN`) and optional V3 Supabase/quant variables. |
| [`vite.config.ts`](vite.config.ts) | Vite + Vinext + Cloudflare Worker plugin setup wiring `backend/middleware/index.ts`, D1 bindings, and local preview workers. |
| [`tsconfig.json`](tsconfig.json) | Strict TypeScript compiler configuration, `@/*` path alias, and Cloudflare Workers types. |
| [`next.config.ts`](next.config.ts) | Minimal Next.js configuration stub used alongside Vinext. |
| [`drizzle.config.ts`](drizzle.config.ts) | Drizzle Kit configuration pointing to `database/schemas/schema.ts` and outputting SQL migrations to `drizzle/`. |
| [`components.json`](components.json) | shadcn/ui (`new-york`, Tailwind v4) component and import alias configuration. |
| [`eslint.config.mjs`](eslint.config.mjs) | ESLint 9 flat config extending `eslint-config-next`, with relaxed rules for vendored `frontend/components/ui/` primitives. |
| [`postcss.config.mjs`](postcss.config.mjs) | PostCSS configuration loading `@tailwindcss/postcss`. |
| [`cloudflare-env.d.ts`](cloudflare-env.d.ts) | TypeScript ambient declarations for Cloudflare Worker `Env` bindings (`DB`, `BUCKET`). |
| [`.gitignore`](.gitignore) | Keeps `node_modules`, build artifacts (`dist/`, `.vinext/`, `.next/`), secrets (`.env*`, `.dev.vars*`), local DB state (`.wrangler/`), and backups out of Git. |
| [`.gitattributes`](.gitattributes) | Enforces LF line endings on `*.sh` shell scripts. |
| [`.npmrc`](.npmrc) | Disables noisy audit/fund/update-notifier prompts during package installs. |
| [`Read me.md`](Read%20me.md) | Older duplicate plain-text README draft kept in the root directory *(superseded by `README.md`)*. |

</details>

<details>
<summary><strong>2. Application Pages & API Routes — <code>app/</code> (17 files)</strong></summary>

**Pages (8 files):**

| File | Purpose |
| --- | --- |
| `app/layout.tsx` | Root HTML layout loading CSS stylesheets in strict token order, preloading local Inter & Space Grotesk fonts, and setting `noindex/nofollow`. |
| `app/page.tsx` | Primary landing route (`/`) rendering the main `X1Workspace` shell. |
| `app/home/page.tsx` | Redirects `/home` to `/`. |
| `app/workspace/page.tsx` | Direct workspace route (`/workspace`) rendering `X1Workspace`. |
| `app/legacy/page.tsx` | Authenticated legacy owner workspace (`/legacy`) for the retained pre-X1 research notebook. |
| `app/[slug]/page.tsx` | Informational and auth routes (`/product`, `/how-it-works`, `/methodology`, `/pricing`, `/trust`, `/terms`, `/help`, `/signin`). |
| `app/asset/[label]/page.tsx` | Authenticated per-instrument detail page rendering an allowlisted on-request TradingView display widget. |
| `app/legal/[slug]/page.tsx` | Trust Center and legal/compliance pages (`/legal/<slug>`, `/legal/compliance`) with release gates and official source links. |

**API Routes (9 files):**

| File | Purpose |
| --- | --- |
| `app/api/release/route.ts` | `GET /api/release` — returns release metadata, dashboard list, 24 exchange venues, and data-scope disclosure. |
| `app/api/[...path]/route.ts` | Core account & legacy catch-all API (`session`, `consent`, `export`, `erase`, `notebooks`, `workspace`, `souls`, `profile`, `support`). |
| `app/api/x1/markets/route.ts` | `GET /api/x1/markets` — returns live official ECB FX reference rates and US Treasury par yield snapshots. |
| `app/api/x1/workspace/route.ts` | `GET/POST /api/x1/workspace` — watchlists, manual portfolios, Soul Scan drafts/runs/history, Graveyard reviews, and evidence queries. |
| `app/api/x1/community/route.ts` | `GET/POST /api/x1/community` — Bodies, research groups, invitations, shared Souls & revisions, posts, Supers, comments, and reports. |
| `app/api/x2/data/route.ts` | `GET/POST /api/x2/data` — extended market overview, instrument registry, per-asset OHLC/fundamentals/news, and private chart layouts. |
| `app/api/x2/providers/route.ts` | `GET/POST /api/x2/providers` — owner-only configuration, entitlement tracking, and health probes for `EODHD` and `TrueData`. |
| `app/api/x2/social/route.ts` | `GET/POST /api/x2/social` — opt-in discovery, direct messages, group directory/join requests, threaded discussions, bookmarks, notifications, blocks, and reports. |
| `app/api/v3/[...segments]/route.ts` | Optional V3 API proxying Auth (Email OTP/Google), Teams, Souls, Runs, Moderation, and Export/Erase to Supabase via HttpOnly cookies. |

</details>

<details>
<summary><strong>3. Backend Auth, Engines, Services & Optional Quant — <code>backend/</code> (49 files)</strong></summary>

**Authentication & Middleware (3 files):**

| File | Purpose |
| --- | --- |
| `backend/auth/chatgpt-auth.ts` | Reads trusted native ChatGPT Sites identity headers and enforces authenticated access (`getChatGPTUser`, `requireChatGPTUser`). |
| `backend/middleware/index.ts` | Cloudflare Worker fetch entrypoint delegating requests to Vinext within the connector request context. |
| `backend/middleware/security.ts` | `HttpError`, same-origin CSRF guard (`protectMutation`), bounded JSON reader, ownership/consent checks, and disabled-feature kill-list. |

**Core Research & Math Engines (6 files):**

| File | Purpose |
| --- | --- |
| `backend/engines/scan.ts` | Deterministic Soul Scan DSL parser, AST compiler, Simple ↔ Advanced round-tripper, and 3-valued (`PASS`/`FAIL`/`UNKNOWN`) rule evaluator. |
| `backend/engines/backtest.ts` | Single-instrument, unlevered, next-open simulation engine with PIT/adjustment gates, slippage/cost bps, and barrier censoring. |
| `backend/engines/chart-analytics.ts` | Entitlement-gated indicators & analytics (`sma`, `ema`, `rsi`, `bollinger`, `macd`, `atr`, intraday `vwap`, drawdown, relative strength, ratios). |
| `backend/engines/math.ts` | Formula Lab calculators: Black-Scholes-Merton (`bsm`) + analytic Greeks, bisection Implied Volatility, CAGR, ACT/365 XIRR, and gated historical calculations. |
| `backend/engines/portfolio.ts` | Multi-currency (10 currencies) manual transaction ledger validator and moving-average cost-basis calculator. |
| `backend/engines/engine.ts` | Retained legacy synthetic scenario generator (`gvv-synthetic-v1`), strictly isolated for legacy reference and unit tests. |

**External Integrations (6 files):**

| File | Purpose |
| --- | --- |
| `backend/integrations/tradingview.ts` | Allowlisted TradingView embed URLs and configs (`overview`, `chart`, `calendar`) blocking arbitrary symbol injection. |
| `backend/integrations/sites/connector-context.ts` | Request-scoped `AsyncLocalStorage` store for Sites connector bindings. |
| `backend/integrations/sites/connector-contract.mts` | TypeScript contract and runtime wrapper for server-side Sites connector calls. |
| `backend/integrations/sites/connector-errors.mts` | Zod-validated connector error formatting and recovery instructions. |
| `backend/integrations/sites/connector-preview.d.ts` | Ambient types for local `virtual:sites-connector-preview` connector bindings. |
| `backend/integrations/sites/connectors.ts` | Per-request helper (`connectorsForRequest`) binding connector context to the contract. |

**Application Services (`backend/services/`, 23 files):**

| Folder & Files | Purpose |
| --- | --- |
| `community/` (`community-model.ts`, `community.ts`, `social.ts`) | Body/group validation schemas, X1 Community D1 service (groups, invites, shared Souls, revisions, posts, Supers, comments), and X2 Social service (opt-in discovery, DMs, join requests, discussions, bookmarks, blocks, notifications, export/erasure). |
| `market-data/` (`data-types.ts`, `market-data.ts`, `providers.ts`, `data-service.ts`, `exchanges.ts`, `globe.ts`, `instrument-registry.ts`, `instruments.ts`, `quotes.ts`) | Shared market data types; live official ECB FX & US Treasury XML parsers (with 15-min caching and staleness checks); server-side `EODHD` & `TrueData` adapters; unified X2 data orchestrator; 24-exchange ISO 10383 MIC venue registry; 3D globe math; X2/legacy instrument registries; and fail-closed quote contracts. |
| `research/` (`research.ts`, `scan-projection.ts`, `workspace.ts`) | Nested visual `RuleTree` ↔ formula compiler, Wilson confidence intervals, Brier/ECE calibration & OOS evidence release gates, read-time entitlement projection for stored scans, and D1 workspace persistence (watchlists, portfolios, scans, Graveyard). |
| `legacy/` (`content.ts`, `gates.ts`, `notebook.ts`, `research.ts`) | Legal/product/compliance page copy, frozen `RELEASE_GATES` flags, immutable legacy notebook validator, and original 28-instrument legacy watchlist/DSL helpers. |
| `v3/` (`legal.ts`, `model.ts`, `scan-presets.ts`, `supabase.ts`) | Optional V3 local legal copy, V3 domain/moderation validators, starter scan presets, and server-side Supabase Auth/REST/RPC client. |

**Optional Python Quantitative Worker (`backend/quant/`, 11 files):**

| File | Purpose |
| --- | --- |
| `backend/quant/pyproject.toml` & `uv.lock` | Python `>=3.11` package manifest (`duckdb`, `numpy`, `pyarrow`, `pytest`, CLI `souls-quant`) and locked dependency graph. |
| `backend/quant/souls_quant/__init__.py` | Package metadata and version (`3.0.0`). |
| `backend/quant/souls_quant/cli.py` | Offline CLI (`souls-quant`) for provenance-gated EOD ingest, cache publish, and screening. |
| `backend/quant/souls_quant/core.py` | Rights gates, indicators, point-in-time corporate-action back-adjustment, VIX regime tagging, OLS + HC3 attribution, bootstrapping, and purged walk-forward folds. |
| `backend/quant/souls_quant/evaluation.py` | Causal signal evaluation, next-open simulation with delisting handling, and walk-forward OOS evaluation. |
| `backend/quant/souls_quant/pipeline.py` | Immutable raw Parquet ingestion, atomic cache swaps, DuckDB bounded predicate screening, and exchange-calendar verification. |
| `backend/quant/souls_quant/worker.py` | Restricted HTTPS RPC job worker polling Supabase (`v3_worker_claim` / `complete`) against an operator dataset catalog. |
| `backend/quant/tests/` (`conftest.py`, `test_core.py`, `benchmark_worker.py`) | Pytest local temp fixture, `29` core quant/causality/DuckDB tests, and a synthetic software throughput benchmark. |

</details>

<details>
<summary><strong>4. Database Schemas & Migrations — <code>database/</code>, <code>drizzle/</code>, <code>supabase/</code> (32 files)</strong></summary>

**Cloudflare D1 Drizzle Schemas & Queries (`database/`, 8 files):**

| File | Purpose |
| --- | --- |
| `database/schemas/index.ts` | `getDb()` helper binding Drizzle ORM to Cloudflare `env.DB`. |
| `database/schemas/schema.ts` | Core tables (`accounts`, `souls`, `ownership`, `outcomes`, `support_requests`, `rate_limits`, `workspace_records`, `notebook_souls`, `notebook_events`) + X1/X2 re-exports. |
| `database/schemas/x1-workspace.ts` | X1/X2 workspace tables (`x1_records`, `x1_ledger`, `x1_scans`, `x1_scan_events`). |
| `database/schemas/x1-community.ts` | X1 community tables (`x1_bodies`, `x1_groups`, `x1_memberships`, `x1_invitations`, `x1_group_souls`, `x1_soul_revisions`, `x1_group_posts`, `x1_supers`, `x1_comments`, `x1_reports`). |
| `database/schemas/x2-data.ts` | X2 market-data tables (`x2_providers`, `x2_provider_audit`, `x2_chart_layouts`). |
| `database/schemas/x2-social.ts` | X2 social tables (`x2_social_preferences`, `x2_blocks`, `x2_conversations`, `x2_conversation_views`, `x2_messages`, `x2_notifications`, `x2_bookmarks`, `x2_social_reports`, `x2_group_directory`, `x2_join_requests`, `x2_discussions`). |
| `database/queries/repository.ts` | Core D1 account, atomic rate-limit, history, ownership, and retention query helpers. |
| `database/queries/notebook-repository.ts` | SHA-256 digest helper and legacy immutable notebook CRUD queries. |

**Chronological D1 SQL Migrations (`drizzle/`, 15 files):**

| File(s) | Purpose |
| --- | --- |
| `drizzle/0000_bent_reptil.sql` | Initial core tables + immutability triggers on `souls` and `outcomes`. |
| `drizzle/0001_early_hawkeye.sql` | Adds unique `semantic_key` index on `ownership`. |
| `drizzle/0002_aberrant_nighthawk.sql` | Adds `workspace_records` table and deduplication index. |
| `drizzle/0003_peaceful_smasher.sql` | Adds `notebook_souls`, `notebook_events`, and immutability guards. |
| `drizzle/0004_thankful_talisman.sql` | Creates all 14 X1 workspace & community tables (`x1_*`). |
| `drizzle/0005_x1_immutability.sql` | Adds SQLite triggers preventing updates to immutable `x1_scans`, `x1_ledger`, `x1_scan_events`, and `x1_soul_revisions`. |
| `drizzle/0006_low_norrin_radd.sql` | Creates all 14 X2 social & market-data tables (`x2_*`). |
| `drizzle/meta/` (8 files) | `_journal.json` + schema snapshots `0000_snapshot.json` through `0006_snapshot.json`. |

**Optional V3 Local Supabase Project (`supabase/`, 9 files):**

| File(s) | Purpose |
| --- | --- |
| `supabase/config.toml` & `.gitignore` | Local Supabase Auth, Storage, and Mailpit SMTP project configuration. |
| `supabase/templates/code.html` | Custom HTML email OTP verification template (`{{ .Token }}`). |
| `supabase/migrations/` (6 SQL files) | V3 PostgreSQL schema with Row-Level Security (RLS), validation triggers, privacy export/erasure RPCs, deny-by-default quant worker job queue, private avatar validation, manual holdings (`v3_holdings`), and audience-scoped dataset entitlement guards. |

</details>

<details>
<summary><strong>5. Frontend UI, Workspaces & Styles — <code>frontend/</code> (95 files)</strong></summary>

**Shared Components & Workspace Shell (`frontend/components/`, 72 files):**

| Path / Files | Purpose |
| --- | --- |
| `frontend/components/connector-error.tsx` | Isolated recovery card shown when a connector fails or needs re-authentication. |
| `frontend/components/tradingview-widget.tsx` | Click-to-load, isolated TradingView embed container (never scrapes prices from frames). |
| `frontend/components/utils.ts` | `cn()` Tailwind class-merge helper (`clsx` + `tailwind-merge`). |
| `frontend/components/workspace/` (8 files) | Main shell (`workspace.tsx`), reduced-motion entry animation (`eclipse-intro.tsx`), header omni-search (`universal-search.tsx`), shared API/UI helpers (`shared.tsx`), mobile scrollable tabs (`scroll-tabs.tsx`), strategy bridge (`strategy.tsx`), and globe/motion CSS (`globe-visual.css`, `motion.css`). |
| `frontend/components/ui/` (61 files) | Vendored shadcn/ui `4.17.0` accessible UI primitives (accordion, alert, dialog, tabs, table, form, chart, command, sidebar, tooltip, etc.). |

**Feature Dashboards (`frontend/features/`, 16 files):**

| Folder & Files | Purpose |
| --- | --- |
| `global/` (`dashboard.tsx`, `globe-canvas.tsx`, `asset-terminal.tsx`, `data-control.tsx`, `data.css`) | **Global Dashboard:** WebGL 3D satellite globe, 24-venue session clock, live ECB/Treasury cards, watchlists, manual portfolios, detailed per-asset charting/drawing terminal, and owner-only provider settings drawer. |
| `strategy/` (`workspace.tsx`, `controls.tsx`, `formula-lab.tsx`, `research.css`) | **Strategy Dashboard:** Soul Scan Simple & Advanced builders, preflight checker, Scan History, Graveyard, Market Radar, Financial Calendar, evidence/replay panels, and interactive Formula Lab. |
| `community/` (`dashboard.tsx`, `social-workspace.tsx`, `social.css`) | **Community Dashboard:** Body profiles, private/discoverable research groups, shared Souls & revision diffs, posts, Supers, comments, DMs, bookmarks, notifications, blocks, and reports. |
| `legacy/` (`workspace.tsx`, `notebook.tsx`) | Retained authenticated `/legacy` workspace and 3-step manual Research Notebook builder. |
| `v3/` (`workspace.tsx`, `portfolio.tsx`) | Retained mobile-first V3 5-tab workspace UI and V3 CSV/cost-basis portfolio view (gated behind Supabase config). |

**Hooks & Styles (`frontend/hooks/`, `frontend/styles/`, 7 files):**

| File(s) | Purpose |
| --- | --- |
| `frontend/hooks/use-mobile.ts` | `useIsMobile()` responsive media-query hook (`< 768px`). |
| `frontend/styles/globals.css` | Canonical matte-black (`#070809`), silver copy, and bright blue (`#76C0FF`) heading palette tokens and base styles. |
| `frontend/styles/v3.css`, `x1.css`, `x2.css` | Scoped layout and component styles inheriting canonical tokens from `globals.css`. |
| `frontend/styles/vendor/` (2 files) | Vendored Tailwind/shadcn utility stylesheet (`4.13.0`) and MIT license. |

</details>

<details>
<summary><strong>6. Public Static Assets — <code>public/</code> (23 files)</strong></summary>

| Path / Files | Purpose |
| --- | --- |
| `public/gvv-approved.jpg` | Official approved Global Vertex Vectors eclipse header logo. |
| `public/favicon-x1.svg` & `favicon.svg` | Active matte-black/silver favicon and earlier mint/gold favicon. |
| `public/data/` (6 files) | Authentic NASA Blue Marble & Black Marble globe textures (`earth-day.jpg`, `earth-night.jpg`, `earth-clouds.jpg`, `earth-static.jpg`), Natural Earth 110m TopoJSON (`land-110m.json`), and provenance metadata (`earth-assets.json`). |
| `public/fonts/` (11 files) | Self-hosted `fonts.css`, WOFF2 weights for IBM Plex Mono, Inter, and Space Grotesk, plus their SIL OFL licenses. |
| `public/downloads/` (3 files) | Retained offline reference documents (`README_Strategic_Souls_GVV.md`, `RELEASE_REVIEW_Strategic_Souls_GVV.md`, and standalone `Strategic_Souls_GVV_One_File_Reference.html`). |

</details>

<details>
<summary><strong>7. Operations, Docs, Scripts & CI — <code>operations/</code>, <code>scripts/</code>, <code>.github/</code>, <code>.openai/</code> (117 files)</strong></summary>

**Active Documentation (`operations/docs/`, 80 files total):**

| Folder / Files | Purpose |
| --- | --- |
| Top-level active guides (4 files) | [`README.md`](operations/docs/README.md) (docs index), [`ARCHITECTURE.md`](operations/docs/ARCHITECTURE.md), [`DEVELOPER_GUIDE.md`](operations/docs/DEVELOPER_GUIDE.md), and [`RESTRUCTURING_REPORT.md`](operations/docs/RESTRUCTURING_REPORT.md). |
| `setup/` & `security/` (2 files) | [`X2_DATA_SETUP.md`](operations/docs/setup/X2_DATA_SETUP.md) (ECB, Treasury, EODHD, TrueData setup) and [`X2_COMMUNITY_SECURITY.md`](operations/docs/security/X2_COMMUNITY_SECURITY.md) (social security & privacy architecture). |
| `product/` & `data-rights/` (4 files) | Soul Scan, Probability, and Graveyard specs; market provider entitlement matrix; and NASA globe asset provenance & hashes. |
| `reports/x2/` (17 files) | X2 audit evidence, QA checklists, bug register, numeric/probability validation reports, UI audits, and historical export onboarding guide. |
| `v3/` (14 files) | Optional V3 engineering handoff specs, security/compliance gates, quant methodology, and runbooks. |
| `archive/x1/` (24 files) & `archive/pre-x1/` (15 files) | Historical X1 and pre-X1 architecture, design system, globe reviews, data-rights matrices, and test/release reports. |

**Scripts, Examples, CI & Hosting (37 files):**

| Path / Files | Purpose |
| --- | --- |
| `operations/scripts/` (31 files) | Local compiled-Worker preview runner (`local-preview.mjs`), release verifier (`check-x2-release.mjs`), framework build runner (`run-framework.mjs`), secret scanner (`scan-v3-source.mjs`), SQLite backup/restore verifiers (`backup-x2.mjs`, `backup-v3.mjs`, `verify-logical-backup.mjs`), Windows/V3 local helpers, managed pnpm/CI installers, and Vite/connector preview plugins (`vite/`, `connector-preview/`). |
| `operations/examples/` (2 files) | Reference Cloudflare D1 + Drizzle route and schema snippet (`d1/app/api/notes/route.ts`, `d1/db/schema.ts`). |
| `scripts/install-pnpm.sh` | Fixed-path managed Sites installer entrypoint delegating to `operations/scripts/install-pnpm.sh`. |
| `.github/workflows/verify.yml` | Automatic CI on every push and pull request: installs locked deps, runs `npm run verify`, and runs `npm run build`. |
| `.github/workflows/verify-v3.yml` | Manual (`workflow_dispatch`) CI running Python quant tests (`uv` + `pytest`) and an isolated local Supabase + Mailpit end-to-end check. |
| `.openai/hosting.json` | ChatGPT Sites hosting configuration preserving the D1 binding (`DB`) and production Site project ID. |

</details>

<details>
<summary><strong>8. Automated Test Suites — <code>tests/</code> (22 files, 245 Node Tests)</strong></summary>

**Integration Tests (`tests/integration/`, 9 files):**

| File | What It Tests |
| --- | --- |
| `api.test.mjs` | Core catch-all API authentication, consent enforcement, notebooks, erasure, and concurrent rate limiting (12 tests). |
| `notebook.test.mjs` | Fail-closed quote contracts, UTC/IST timestamps, additive D1 migrations, and logical backup restoration (5 tests). |
| `v3-model-api.test.mjs` | Optional V3 validators, mocked Auth OTP/PKCE flows, and strict redirect rejection (11 tests). |
| `v3-postgres.test.mjs` | Embedded PGlite PostgreSQL Row-Level Security, role escalation blocking, worker queue, and dataset entitlements (12 tests). |
| `x1-community.test.mjs` | X1 Bodies, private groups, invites, shared Souls, optimistic revisions, posts, Supers, comments, and erasure (12 tests). |
| `x1-workspace.test.mjs` | Watchlist CAS updates, multi-currency portfolio ledger math, scan snapshots, immutability, and cursor pagination (30 tests). |
| `x2-data.test.mjs` | Chart indicators, EODHD/TrueData normalizers, owner-only provider config, entitlements, and private chart layouts (27 tests). |
| `x2-social.test.mjs` & `x2-social-schema.sql` | Opt-in discovery, DMs, join requests, discussions, blocking, portability export, and scoped erasure (15 tests + schema fixture). |

**Unit Tests (`tests/unit/`, 13 files):**

| File | What It Tests |
| --- | --- |
| `engine.test.mjs` | Legacy synthetic engine cutoffs and security guards (14 tests). |
| `phoenix-presets.test.mjs` | V3 starter scan preset immutability (3 tests). |
| `research.test.mjs` | Locked 28-instrument watchlist, legacy DSL, CSV import, and legacy BSM math (6 tests). |
| `tradingview.test.mjs` | Allowlisted TradingView symbols and WCAG contrast checks (5 tests). |
| `x1-globe.test.mjs` | 3D spherical projection, co-located venue clustering, and great-circle arcs (8 tests). |
| `x1-market.test.mjs` | 24 MIC venues, IANA DST session clocks, ECB & Treasury XML parsing, and caching/staleness (22 tests). |
| `x1-math.test.mjs` | Black-Scholes pricing, analytic Greeks, Implied Volatility solver, CAGR, and XIRR (10 tests). |
| `x1-motion.test.mjs` | Eclipse intro SSR guard, `prefers-reduced-motion` compliance, and cleanup (8 tests). |
| `x1-palette.test.mjs` | Matte-black/silver/blue heading palette tokens and WCAG 4.5:1 contrast rules (6 tests). |
| `x1-scan.test.mjs` | 80 Simple ↔ Advanced round-trip rules, AST safety, 3-valued `UNKNOWN` logic, and technical indicators (12 tests). |
| `x2-async.test.mjs` | Request deduplication, timeouts, and retry lock safety (6 tests). |
| `x2-backtest.test.mjs` | Next-open simulation, PIT/adjustment gates, and opening gap behavior (5 tests). |
| `x2-research.test.mjs` | Nested rule trees, Wilson/Brier/ECE calibration, OOS release gates, and Graveyard denominator logic (16 tests). |

</details>

---

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui, Recharts, Lucide Icons, native WebGL 3D Globe
- **Framework & Runtime:** Next.js 16 conventions via **Vinext** + **Vite 8**, deployed on **Cloudflare Workers**
- **Database:** **Cloudflare D1** (SQLite) managed with **Drizzle ORM**
- **Testing & CI:** Node.js native test runner (`245` tests), ESLint 9, TypeScript (`tsc`), GitHub Actions
- **Optional V3 Stack:** Local **Supabase** (PostgreSQL + RLS + Auth) and **Python 3.11+** (`DuckDB`, `NumPy`, `PyArrow`, `uv`, `29` pytest tests)

---

## Quick Start (Run Locally)

### Prerequisites

Verified toolchain (tested on Windows):

- **Git**
- **Node.js** `22.16.0` *(minimum `>= 22.13.0`)*
- **pnpm** `11.25.0`

### 1. Install & Launch Local Preview

From the repository root in your terminal:

```powershell
pnpm install --frozen-lockfile
npm run dev
```

When Wrangler reports it is ready, open **`http://127.0.0.1:5173`** in your browser. Press `Ctrl + C` to stop.

> [!TIP]
> **How local preview works:**
> - **No `.env` file or API keys are needed** to run the core workspace locally.
> - `npm run dev` builds the Cloudflare Worker, applies all 7 D1 migrations to a local `.wrangler/state` database, and provides a loopback-only fictional developer identity (complete the local onboarding screen before saving data).
> - On Windows, restart `npm run dev` after code changes (recommended over `npm run dev:hmr` due to an upstream Vinext/Vite HMR issue documented in [`operations/docs/DEVELOPER_GUIDE.md`](operations/docs/DEVELOPER_GUIDE.md)).

### 2. Useful Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Build the Worker, migrate local D1, and start the local preview on `http://127.0.0.1:5173` |
| `npm run verify:x2` | Run full X2 release checks (TypeScript typecheck, app ESLint, and Node test suite) |
| `npm run verify` | Run `typecheck`, `lint:app`, and `test` sequentially |
| `npm test` | Run all `245` Node.js unit and integration tests |
| `npm run typecheck` | Run TypeScript type checks (`tsc --noEmit`) |
| `npm run lint:app` | Lint `app/`, `frontend/`, `backend/`, and `database/` |
| `npm run build` | Build the production Cloudflare Worker bundle |
| `npm run test:quant` | Run the `29` optional Python quant tests (requires `uv`) |
| `npm run audit:security` | Run high-severity dependency audit (`pnpm audit --audit-level high`) |

### 3. Optional Environment Variables & Provider Keys

- Copy variable names from [`.env.example`](.env.example) only if you are configuring licensed provider adapters (`X2_EODHD_API_TOKEN`, `X2_TRUEDATA_BEARER_TOKEN`, `X2_OWNER_SUBJECT`) or testing the optional V3 Supabase/Python stack.
- Store local secrets only in git-ignored `.sites-runtime/.dev.vars` (or hosted runtime settings). **Never commit `.env`, `.dev.vars`, API keys, or private user data.**
- See [`operations/docs/setup/X2_DATA_SETUP.md`](operations/docs/setup/X2_DATA_SETUP.md) for provider licensing and setup details.

---

## Product Principles

- **Evidence over hype:** No fabricated prices, statistics, backtests, or forward probabilities (`INSUFFICIENT EVIDENCE` is shown whenever data is uncalibrated).
- **Data freshness matters:** Every figure clearly labels whether it is live, delayed, end-of-day, historical, or unavailable.
- **Transparency by design:** Inputs, formulas, exclusions, and missing (`UNKNOWN`) values are surfaced explicitly — never silently zeroed.
- **Simple to start, powerful to explore:** Beginner-friendly visual flows paired with deep advanced formula controls.
- **Privacy & security first:** Server-side access checks, opt-in discovery, isolated local dev identity, and strict separation of credentials from source code.
- **Research, not trade execution:** Built strictly for analysis and education — never broker execution or promised returns.

---

## Development Priorities

- [ ] Connect and validate licensed commercial data feeds for NSE, BSE, MCX, and major global indices (`EODHD` / `TrueData`).
- [ ] Expand end-to-end Soul Scan coverage and point-in-time historical evaluation once licensed multi-year datasets are connected.
- [ ] Complete browser, mobile responsiveness, and accessibility testing across devices.
- [ ] Finalize security review, moderation workflows, and multi-user production readiness for Community collaboration.
- [ ] Reconcile reviewed GitHub changes into the hosted ChatGPT Sites release pipeline under founder approval.

---

## Contributing & Releases

- Read [`AGENTS.md`](AGENTS.md) for engineering rules and [`operations/docs/DEVELOPER_GUIDE.md`](operations/docs/DEVELOPER_GUIDE.md) for day-to-day workflows.
- Create small, focused branches from `main`, run `npm run verify:x2` and `npm run build`, and open a Pull Request.
- **Deployment note:** Pushing to GitHub runs CI verification only — it does **not** automatically deploy the hosted ChatGPT Site. See [`SOURCE_PROVENANCE.json`](SOURCE_PROVENANCE.json), [`operations/docs/ARCHITECTURE.md`](operations/docs/ARCHITECTURE.md), and [`operations/docs/README.md`](operations/docs/README.md) for full architecture and release details.

### Long-Term Business Direction

Strategic Souls aims to build a sustainable **free + premium** ecosystem: accessible core financial research tools for free users (potentially supported by non-intrusive advertising) paired with affordable premium subscriptions for deeper workflows and data coverage. Pricing, entitlements, and launch timelines are not yet finalized.

---

> [!IMPORTANT]
> **Disclaimer:** Strategic Souls is intended strictly for **education and financial research**. It is **not** a broker or registered investment adviser, does **not** execute trades, and does **not** guarantee investment outcomes. Market data may be delayed, incomplete, unavailable, or subject to licensing restrictions. Research outputs and historical simulations are not personalized investment advice.

---

**Strategic Souls · Global Vertex Vectors (GVV)**
*Analyze with evidence. Build with purpose.*
