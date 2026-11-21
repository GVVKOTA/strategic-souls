# Strategic Souls X5.1 — Obsidian Genome / The Research Network · Execution Status Ledger

- **Canonical Repository:** `https://github.com/GVVKOTA/strategic-souls`
- **Production Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)
- **Production D1 Database:** `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`)
- **Feature Branch:** `feat/x5-1-obsidian-genome-research-network` (branched from `main` `8fc7f22`)
- **Release Label:** `X5.1`
- **Last Updated:** 2026-11-22 IST

## Capability Matrix (Strict Honesty Contract)

| Capability | Status | Evidence & Limitations |
|---|---|---|
| Canonical Text Color Lock (`globals.css` 6 hex tokens) | **IMPLEMENTED** | Verified via `tests/unit/x1-palette.test.mjs` and Playwright computed-style check (`#e8edf2`, `#76c0ff`). All new X5.1 styles live in `frontend/styles/x51.css`. |
| 3 Primary Tabs (`Global \| Strategy \| Community`) & Dashboard-Specific Headers | **IMPLEMENTED** | Global (`⋮` drawer + Search + `?` + Avatar), Strategy (`⋮` drawer + centered `Strategy Builder`, NO search bar + `?` + Avatar), Community (`@BodyID` Search + Bell + Avatar). |
| Global 9-Card 3×3 Market Grid + Customize + D1 Persistence | **IMPLEMENTED** | `GET/POST /api/markets/overview`, optimistic concurrency `409`, 9-unique-canonical-ID validation, 3×3 verified at `320px–1440px` (`overflow = 0`). Unlicensed feeds honestly labeled `Restricted` / `Not connected`. |
| Asset Detail 6-Tab Terminal (`Chart \| Fundamentals \| Technicals \| Analysis \| Ideas \| News`) | **IMPLEMENTED** | Preserves Chart/drawings/layout save; asset-class tailored Fundamentals; live Community Ideas via `/api/community/network?view=web&symbol=...`; honest News/official links. |
| My Portfolio Summary + Dedicated View + Obsidian Backdrop + Opt-In Private Ticker | **IMPLEMENTED** | 8 Obsidian presets (`b01`–`b08`), crop/scrim/blur controls, contrast-guarded clickable rows, Private Holdings Ticker OFF by default & owner-only across dashboards. Custom R2 uploads **GATED** (R2 disabled on Cloudflare account; fails closed with `503 OBJECT_STORAGE_NOT_CONFIGURED`). |
| Official Statutory Economic Calendar (RBI, MoSPI, FOMC, BLS, BEA, EIA, ECB) | **IMPLEMENTED** | `GET/POST /api/calendar/events`, IANA DST-aware timestamps (`Asia/Kolkata` default), `.ics` export, D1 in-app reminders, zero fabricated actuals/consensus. |
| Strategic Globe (3D Earth + 2D NASA GIBS World Map + Conflict Layer) | **IMPLEMENTED** | Renamed from `SS Earth` to `Strategic Globe` across UI; added zoom-to-2D-Map contextual CTA (`zoom >= 1.25`). Commercial conflict feeds (UCDP/ACLED) remain honestly fail-closed (`NOT_CONFIGURED`) until API secrets are set. |
| Strategy Builder — Exact 2 Sub-Dashboards (`Soul Scan \| Formula Lab`) | **IMPLEMENTED** | Relocated calendar to Global; removed Market Radar. Formula Lab stands alone with upgraded manual Historical Investment calculator. |
| Classic Soul Scan (Exact 50 Presets + 8/Day IST Atomic Quota) | **IMPLEMENTED** | 50 presets (5 categories × 10 rules) in `classic-presets.ts`; selection-only filterable picker; 5 timeframes (`30m\|1h\|1d\|1wk\|1mo`, honest fail-closed on daily-only intraday); atomic D1 reservation (`x51_scan_reservations`) resets 00:00 IST; failed runs release quota; valid 0-match runs count. |
| Advanced Soul Scan (Discover / Build / Draw + Soul Genome + 1/Rolling-60m Quota) | **IMPLEMENTED** | Deterministic Discover Blueprint parser (`discover-parser.ts`); Visual + AST Build; Touch/Mouse/Keyboard Draw Canvas with 8 templates & normalized SVG overlay (`pattern-draw.ts`); Soul Genome Historical Twins + Empirical Future Paths (`INSUFFICIENT EVIDENCE` when `n < 15`) + Anti-Scan skepticism (`soul-genome.ts`); atomic concurrent-safe rolling 60m quota. Multi-exchange motif discovery & regime ML remain explicitly **GATED**. |
| Community Research Network (Centered Profile + Web / Chats / Groups + One-Click Post Soul) | **IMPLEMENTED** | `GET/POST /api/community/network`, centered profile with Obsidian banner + 50 avatars + optional gender symbol (`♂`/`♀`/hidden) + Instagram/Website + real D1 counts (`Followers/Following/Souls`), One-Click Post Soul with Angel One `403` public-share redaction, Save/Discuss/Copy/Pin(≤3)/Delete, Follow Requests approval in Bell dropdown, 1-to-1 Chats (honestly non-E2EE), Research Groups. |
| Additive Database Migration `0008_x51_foundation.sql` | **IMPLEMENTED** | Strictly additive `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` (`x51_scan_reservations`, `x51_follows`, `x51_web_souls`, `x51_web_soul_saves`, `x51_web_soul_comments`). Migrations `0000`–`0007` untouched. |
| Paid Market Feeds / R2 Object Storage / Broker Execution / Billing / Ads | **GATED** | Intentionally inactive without founder opt-in. Zero trading/order endpoints; zero billing/ads; OpenAI/ChatGPT login remains removed. |

## Verification Evidence

- **TypeScript (`tsc --noEmit`):** PASS (`exitCode: 0`)
- **ESLint (`pnpm run lint:app`):** PASS (`exitCode: 0`, 0 errors)
- **Node Unit & Integration Tests:** PASS (All 289 tests including 13 new X5.1 unit & integration/security tests in `tests/unit/x51-engines-and-calendar.test.mjs` and `tests/integration/x51-quotas-layouts-community.test.mjs`)
- **Python Quant Tests (`pytest`):** PASS (`29 passed in 0.62s`)
- **Secret Scan (`scan-secrets.mjs`):** PASS (`672` files including compiled `dist/` bundle, `0` findings)
- **Production Build (`run-framework.mjs build`):** PASS (`dist/server/wrangler.json` verified bound to Worker `strategic-souls`, D1 `ss`, binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`)
- **Playwright Compiled-Worker Visual & Functional QA:** PASS across `320px, 360px, 390px, 430px, 768px, 1024px, 1440px` (`overflowPx = 0` at every width; 3×3 9-card grid verified at `320px`, `390px`, and `1440px`; Community `0` console errors; full signed-in register -> profile -> ticker -> portfolio -> Classic scan -> One-Click Post Soul -> Web feed journey verified end-to-end on local isolated D1).
