# Strategic Souls V3.1 — Reliability & Premium Experience Release Evidence Report

**Release Track:** `V3.1`  
**Revision Marker:** `x8-v3.1-reliability-2026-11-24`  
**Date:** 24 November 2026 (IST)  
**Production URL:** `https://strategic-souls.vishnukota20071005.workers.dev/`  
**Cloudflare Worker:** `strategic-souls` (D1 `DB` -> `ss` `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, VPC `MARKET_DATA_ADAPTER` `01a2095b-f466-7c90-a813-4fad03735504`)  
**Rollback Candidate:** Worker Version `70e8bcda-cf80-4aca-a3b9-32cd3945ff4d` (#22, V3.0 RC1 `b9153e05efdbf2c3d822a77b62a28fa7842fc025`) / Version `f820aad8-7352-4126-95d8-8f6dd45d60d2` (#21). Zero D1 schema migrations were added in V3.1, so Worker rollback is non-destructive and leaves all user data intact.

---

## 1. Honest Release Status Summary

**Overall V3.1 Status:** **`PARTIAL`** (Code, UI, Security, Quota, Engine, Owner/ECB/CSV & Release Synchronization = **COMPLETE**; Live Ordinary-Member NSE/BSE/MCX Market Scanning & Quotes = **BLOCKED** pending commercial feed provisioning).

- Every code, UI, reliability, quota (`20/day`), editable Classic formula, Pattern Scan, Asset Research chart-first mobile redesign, Strategic Teal hierarchy, security, and GitHub/Cloudflare synchronization requirement is implemented, tested, and verified.
- **Truthful Production Blocker (`R04` member live, `R12`/`R13`/`R14` member live):** Remote Cloudflare D1 table `x2_providers` currently contains `0` rows and Cloudflare Worker Secrets contain no commercial shared market-data credential (`X2_TRUEDATA_BEARER_TOKEN` or `X2_EODHD_API_TOKEN`). Retail private owner broker credentials remain strictly owner-isolated by design and are never redistributed to ordinary accounts. Ordinary accounts fail closed cleanly with **0 quota charged** until commercial shared market data is provisioned (see Section 5 Owner Onboarding Checklist).

---

## 2. Baseline vs V3.1 Verified Defect Remediation

| Area | Baseline Live Production (`b9153e0` / `V3.0 RC1`) | V3.1 Delivered Behavior (`x8-v3.1-reliability-2026-11-24`) | Key Files Changed |
| --- | --- | --- | --- |
| **8-Card Global Grid & Sessions** | 5/8 cards showed repetitive `"Last available"` pill; only 1/8 (`USD/INR`) showed a sparkline; `NIFTY MIDCAP` failed (`INVALID_SYMBOL`); `MCX:SILVER` lacked seed & `startsWith` matched mini/guinea symbols; MCX used `XNSE` equity hours & CL used `XNYS` hours | `"Last available"` pill removed completely; compact truthful timestamps + single `SharedLiveClock` (live-only); `NSE:NIFTYMIDCAP100` (`99926011`) + exact-root unexpired `MCX:GOLD` / `MCX:SILVER` seeds; DST-aware `getNymexGlobexSession()` & MCX partial-holiday schedule; 30-day real sparklines in semantic `#42CF91`/`#EF666A`/`#929CA7` | `backend/services/market-data/angelone/instrument-master.ts`, `calendar.ts`, `nine-card-types.ts`, `nine-card-markets.ts`, `frontend/features/global/market-grid.tsx`, `app/api/markets/overview/route.ts` |
| **Asset Research Mobile & Desktop** | Wrapped in narrow `650px` `<Modal>`; chart pushed completely below fold; exposed `ECB:USDINR · PUBLISHED_EOD · ECB`, `Private Owner Read-Only`, & raw broker `Token`; horizontal tab bar clipped `News` to `New`; monochrome line with 5-decimal Y-axis | Full-screen `100dvh` mobile sheet / spacious `920px` desktop dialog; chart immediately visible above fold (`top: 261px` at `390x844`); semantic green/red/neutral line & candle colors driven by selected-range return (`1D`/`1W`/`1M`/`3M`/`1Y`/`ALL`); rounded Y-axis & formatted X-axis dates; Watchlist bookmark toggle; consolidated `(i)` Attribution drawer; clean underline tabs; `Scan Asset` single-asset handoff into Classic Soul Scan | `frontend/features/global/asset-terminal.tsx`, `frontend/features/global/dashboard.tsx`, `frontend/components/workspace/workspace.tsx`, `frontend/styles/ss-v3.css` |
| **SoulScan Classic Quota & Editor** | `8` scans/IST day (live owner hit `0/8`); duplicate `Strategy Builder` headings; Classic formula locked read-only to preset; tiny `Browse ›` pill; `30m` unconditionally blocked; secondary `:x1scans` limit 30/day | `20` completed scans/IST day (`CLASSIC_DAILY_LIMIT = 20`), `:x1scans` raised to `60/day`; single white `Soul Scan` heading + visible `"20 of 20 scans left today"` strip + single `Guide & Limits` modal; live editable numeric parameter inputs + editable validated AST expression (`#ss-v31-classic-formula`) + `Customized` teal badge + `Reset` + `Save copy` (presets immutable); full-width blue `Browse all 50 formulas` button; capability-gated `30m`/`1h` completed-session bars; explicit scan lifecycle (`RUNNING` skeleton, `Cancel`, disjoint `Matched`/`Did not match`/`Insufficient data`/`Deferred` breakdown) | `backend/services/research/scan-quota.ts`, `workspace.ts`, `research.ts`, `backend/services/market-data/angelone/scan-history.ts`, `providers.ts`, `data-service.ts`, `frontend/features/strategy/workspace.tsx` |
| **Pattern Scan Redesign** | Heading `"Interactive Pattern Draw (Normalized Pearson + Bounded DTW)"`, 8 wrapping chips, green disconnected strokes, `Run draw scan` placed above Scope/Timeframe, accepted flat lines, leaked `"5-stock Indian equity CSV fixture"` copy | Heading `Pattern Scan` + plain subtitle + `(i)` methodology drawer; 3 visual SVG template cards + `View all (8)` + account-private saved patterns (`save-pattern`); single-trajectory Strategic Teal (`#4FA3A1`) canvas with `activePointerId` isolation, `ResizeObserver`, fullscreen draw mode, full Undo stack across Draw/Erase/Clear/Reset/Template; `validateStrokePoints` rejects flat lines before quota; single `Similarity` slider (default `75%`) + `Advanced settings` Lookback; primary blue `Find Similar Patterns` bottom CTA; zero fixture text | `backend/engines/pattern-draw.ts`, `backend/services/research/workspace.ts`, `frontend/features/strategy/draw-canvas.tsx` |
| **Strategic Teal & Typography** | All headings blue; portfolio card blue; public `/api/release` exposed `providerReadiness` & internal gateway flags | White major headings (`#F4F6F8`), restrained Strategic Teal (`#4FA3A1`) solely for personal ownership (`My Portfolio`, `Watchlist`, pins, active content tabs, pattern drawing), canonical `--x1-*` tokens in `globals.css` & GVV logo SHA-256 preserved untouched; `/api/release` cleaned to `V3.1` (`x8-v3.1-reliability-2026-11-24`, `classicDailyLimit: 20`, zero internal provider diagnostics) | `frontend/styles/ss-v3.css`, `backend/services/release-meta.ts`, `app/api/release/route.ts` |

---

## 3. Live Data Entitlement & Capability Matrix (Production)

| Capability | Guest (Unauthenticated) | Ordinary Member (Signed-In) | Authorized Owner (`X2_OWNER_SUBJECT`) | Source Attribution & Restrictions |
| --- | --- | --- | --- | --- |
| **Official Reference Feeds (`USD/INR`, US Treasury, USGS, EONET)** | Live (`ECB` daily reference + yields) | Live (`ECB` daily reference, chart & Daily/Weekly/Monthly scans) | Live (`ECB` daily reference, chart & Daily/Weekly/Monthly scans) | Official public agency data; date-only reference closes, never synthetic intraday or live quotes |
| **NSE / BSE / MCX Quotes & History (`1d`/`1h`/`30m`)** | Blocked / Unavailable (fail closed) | **BLOCKED** (`x2_providers` has 0 rows, no commercial secret configured; 0 quota charged) | Entitled via private VPC `MARKET_DATA_ADAPTER` (read-only personal feed when adapter is online) | Private retail broker feed is strictly owner-only and never redistributed to ordinary members |
| **NYMEX Crude Oil (`GLOBAL:CL`)** | Unavailable (session schedule shown honestly: `Globex open`/`Closed`/`Weekend`) | **BLOCKED** (no licensed global futures feed provisioned) | **BLOCKED** (no licensed global futures feed provisioned) | Session hours follow CME Globex `America/New_York` DST-aware schedule; prices never fabricated |
| **Private Daily CSV Scans (`CUSTOM_CSV`)** | Auth required (`401`) | Live (Daily `1d` bars; `30m`/`1h` cleanly rejected with 0 quota charged) | Live (Daily `1d` bars) | User-supplied private data; isolated per account |
| **Classic / Advanced Scan Quota** | Auth required (`401`) | Classic: `20 / IST day` · Advanced: `1 / rolling 60 min` | Classic: `20 / IST day` · Advanced: `1 / rolling 60 min` | Atomic D1 reservation/batch commit; failed/blocked/unentitled scans never consume quota |

---

## 4. Automated Verification & Local Production-Build QA Evidence

All automated gates executed cleanly against the V3.1 implementation prior to commit:

| Gate / Check | Command | Result | Exact Metrics / Notes |
| --- | --- | --- | --- |
| TypeScript Typecheck | `pnpm exec tsc --noEmit` | **PASS** | `0` errors |
| ESLint | `pnpm run lint:app` | **PASS** | `0` errors (`10` pre-existing baseline warnings, `0` new warnings) |
| Node Unit & Integration Tests | `pnpm test` (`pnpm run verify`) | **PASS** | **357 / 357 pass**, `0` fail, `0` skipped (`16.9s`), including `7` new V3.1 integration tests in `tests/integration/v31-reliability-and-ux.test.mjs` |
| Python Quant Engine Tests | `pnpm run test:quant` | **PASS** | **29 / 29 pytest pass** (`1.08s`) |
| Release Verification Harness | `node operations/scripts/check-x2-release.mjs` | **PASS** | `typecheck` (0), `lint` (0), `tests` (0) |
| Secret & Leak Scanner | `pnpm run scan:secrets` | **PASS** | `774` files + `dist` bundle scanned, `0` findings |
| Dependency Security Audit | `pnpm run audit:security` | **PASS** | Exit `0` (`0` high/critical; `2` pre-existing moderate advisories) |
| Production Bundle Build | `pnpm run build` | **PASS** | 5/5 Vinext/Vite environments built cleanly; `dist/server/wrangler.json` verified matching exact production Worker `strategic-souls`, D1 `ss`, VPC `MARKET_DATA_ADAPTER` |
| Local Production-Like Viewport QA (`127.0.0.1:8787`) | Playwright across `320, 360, 390, 412, 430, 768, 1024, 1440px` | **PASS** | `overflowX: 0` on all 8 viewports; `8` cards; `hasLastAvailable: false`; `USD/INR` chart above fold (`top: 261px` at `390x844`) with truthful red `#EF666A` 3M window return; `Browse all 50 formulas` unclipped at `320px`; Pattern Scan `3` SVG templates + `75%` slider + teal canvas; `0` console errors; 20-cycle Asset Research open/close soak (`nodeDelta: +2`, `lingeringDialogs: 0`, body scroll restored) |

---

## 5. Owner Action Checklist (To Unblock Live Ordinary-Member Market Scans)

No secrets or paid services were created or requested during this release. To enable ordinary-member NSE/BSE/MCX daily and intraday (`30m`/`1h`) scanning in production:

1. **Obtain Commercial Redistribution License:** Provision a commercial TrueData (`30min`, `60min`, `eod` for NSE/BSE/MCX) or EODHD (`1h`, `eod` for NSE/BSE/GLOBAL) license covering multi-user display/derived analysis.
2. **Set Server-Only Worker Secret (Out-of-Band via Wrangler):**
   - `pnpm exec wrangler secret put X2_TRUEDATA_BEARER_TOKEN --name strategic-souls` (and/or `X2_EODHD_API_TOKEN`)
   - Optional for password reset / email verification outbound mail: `RESEND_API_KEY` or `SS_EMAIL_WEBHOOK_URL`
3. **Register Entitled Instrument Mapping & Rights in `x2_providers`:** Sign in as the configured `X2_OWNER_SUBJECT`, open owner Data Connections (`/api/x2/providers`), save the verified contract expiry, rights (`display`, `analysis`, `derivedDisplay`, `storage`, `redistribution`), and licensed symbol list, then run `Test connection` to transition health to `CONNECTED`.
4. **Verify Live Ordinary-Member Scan:** Test with a non-owner account on `Market` (`1d`, `1h`, and `30m` on TrueData) and confirm closed-session evaluation + GRAVEYARD reload.

---

## 6. Rollback Procedure (Zero D1 Data Loss)

V3.1 adds **zero** D1 SQL migrations (reusing existing `x1_records`, `x1_scans`, `x51_scan_reservations`, and `v3_formula_pins`). If a critical regression is detected after deployment:

```bash
pnpm exec wrangler rollback 70e8bcda-cf80-4aca-a3b9-32cd3945ff4d --name strategic-souls
```

Verify rollback via `GET https://strategic-souls.vishnukota20071005.workers.dev/api/release` and `wrangler deployments list --name strategic-souls`.
