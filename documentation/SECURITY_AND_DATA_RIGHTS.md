# Security Model, Compliance Gates & Data Rights

This document states the implemented technical controls, secret boundaries, licensing/regulatory blockers, and third-party asset attributions for **Strategic Souls**. Compliance documentation reflects engineering and source audits — **not legal counsel or regulatory certification**.

---

## 1. Security Architecture & Access Controls

| Boundary | Implemented Controls |
| --- | --- |
| **Authentication & Sessions** | Standalone email/password + optional Google OAuth (`application/backend/auth/`). Session token issued via `__ss_session` (`HttpOnly; SameSite=Lax; Secure` over HTTPS). Session revokes on password reset & logout. |
| **CSRF & Input Validation** | State-changing routes enforce strict same-origin `Origin` equality, `JSON`-only bodies, explicit payload byte limits (16 KiB community / 1.5 MB scan archive), and parameterized Drizzle SQL queries. |
| **Cross-Account / Owner Isolation** | Workspace/notebook/portfolio/DM reads filter strictly by authenticated `subject`. Owner routes (`/api/x2/providers`, `/api/market/quote`, `/api/market/candles`, `/api/market/auth`) verify `isDataOwner(userId)` against encrypted `X2_OWNER_SUBJECT` (`403`/`404` fail-closed). |
| **Secrets Isolation** | Credentials live strictly in Cloudflare Worker Secrets or gitignored `.secrets/angelone.env` / `.dev.vars` (inside `application/`). Zero secrets allowed in D1, browser bundles, logs, or Git history. `operations/scripts/scan-secrets.mjs` scans source + built `dist/`. |
| **HTTP Security & XSS** | Security headers (`X-Content-Type-Options: nosniff`, HSTS, strict CSP) injected in `application/backend/middleware/index.ts`. Research/messages escape via React; source URLs require HTTPS without embedded credentials and never trigger server-side fetches (zero SSRF). |
| **Immutability & Deletion** | D1 triggers (`0005_x1_immutability.sql`) protect committed Souls/history from mutation. Account deletion uses explicit transactional confirmation (`confirmSharedConversationDeletion` when paired conversations exist). |
| **Community & Messaging** | Discovery is opt-in, off by default; blocks hide discovery, inbox, and sends bilaterally; bounded exports (`100` conversations, `5,000` messages, `5,000` discussion items) return HTTP `413` instead of truncating silently. |

---

## 2. Regulatory & Public-Launch Gates (`BLOCKED` / `NOT APPROVED`)

Public commercial launch, billing, checkout, advertisements, personalized investment advice, public financial research publishing, and order execution are **ALL DISABLED (`false`)**:

| Gate | Status | Blocking Requirements |
| --- | --- | --- |
| **SEBI RA / IA Applicability** | **BLOCKED** | Qualified Indian securities counsel review of SEBI Research Analyst / Investment Adviser rules, fee/feature scope, and call/record obligations before any public research offer. |
| **DPDP Privacy / Minors / Retention** | **NOT APPROVED** | Verified data controller identity, grievance officer, India/cloud storage disclosures, formal minor assurance beyond adult self-declaration, backup erasure workflow. |
| **CERT-In Incident Readiness** | **NOT STAFFED** | Operational 24/7 reporting/contact workflow (CERT-In Directions 28 Apr 2022) and 180-day log retention verification required before public production offer. |
| **Exchange & Constituent Data Rights** | **BLOCKED** | Direct written display/redistribution sublicenses for NSE/BSE/MCX quotes or NSE Indices constituent lists (`ind_nifty500list.csv`), or paid BharatStock `DERIVED_ONLY` upgrade + constituent delivery. |
| **Billing / Payments / Ads** | **NOT AUTHORIZED** | Zero payment processor, tax/GST invoicing, or ad stack exists. |

---

## 3. Provider & Exchange Data-Rights Matrix

Verbal vendor assurances are **not** treated as exchange sublicenses. Server-side gates enforce written rights metadata:

| Provider | Terms / Evidence | Public Raw Display | Derived Screening (`DERIVED_ONLY`) | Server Storage | Current State |
| --- | --- | --- | --- | --- | --- |
| **Indian API** (`stock.indianapi.in`) | `indianapi.in/legal/terms` (Free 500 req/mo, close+vol only) | Unverified (no NSE display sublicense) | Blocked on Free plan (500/mo < 501 symbols) | Silent | **BLOCKED** |
| **BharatStock** (`bharatstockapi.com`) | `bharatstockapi.com/terms` (Free 60/day; Paid 1k–30k/day) | Exchange license required for raw OHLCV | **Permitted on Paid tiers** (non-reconstructable Customer Derivatives) | Allowed on active Paid plan only | **BLOCKED ON FREE TIER** (Recommended `DERIVED_ONLY` upgrade path) |
| **Nifty Indices** (`ind_nifty500list.csv`) | `niftyindices.com/terms-of-use` (501 rows observed read-only) | Requires written permission | Requires written permission (`indices@nseids.co.in`) | Prohibited without license | **BLOCKED** |
| **Angel One SmartAPI** (`MARKET_DATA_ADAPTER`) | Personal brokerage API + Apr 2026 Static IP policy | Strictly Forbidden publicly | Owner-only (`X2_OWNER_SUBJECT`) | RAM-only | **OWNER-ONLY INTACT** |
| **ECB Eurofxref & US Treasury** | Official public statistical releases (`17 U.S.C. § 105` / ECB disclaimer) | **Permitted** (`REFERENCE` attribution) | **Permitted** | 15-min shared D1 cache (`0020`) | **ACTIVE KEYLESS LIVE** |
| **TradingView Widgets** | `tradingview.com/policies/` | Vendor-hosted human viewing with branding intact | No scraping / extraction / alerts | None | **ACTIVE (Consent-Gated)** |

---

## 4. Open-Source, Font & Asset Attribution

Preserve all license files alongside their runtime assets:
- **Self-Hosted Fonts (`application/public/fonts/`):** `Space Grotesk` (`spacegrotesk-OFL.txt`), `Inter` (`inter-OFL.txt`), `IBM Plex Mono` (`ibmplexmono-OFL.txt`) — SIL Open Font License.
- **MapLibre GL Attribution:** [`application/public/data/maplibre-license.txt`](../application/public/data/maplibre-license.txt) (used by `application/frontend/features/global/regional-map.tsx`).
- **NASA Earth Imagery:** Public domain archival Blue Marble / Black Marble textures (`earth-day.jpg`, `earth-night.jpg`, `earth-clouds.jpg`, `earth-static.jpg`); exact SHA-256 checksums and provenance documented in [`specs/GLOBE_ASSET_RIGHTS.md`](specs/GLOBE_ASSET_RIGHTS.md).
- **Approved GVV Brand Asset:** `application/public/gvv-approved.jpg` (SHA-256 invariant verified by integration tests).
- **Source Classification & Provenance:** [`SOURCE_PROVENANCE.json`](SOURCE_PROVENANCE.json).
