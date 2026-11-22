# Strategic Souls X5.5 — Three-Phase Audit, Polish & Release Report

**Organization:** Global Vertex Vectors (GVV)  
**Branch:** `feat/x5-5-stability-experience-language`  
**X5.4 Production Baseline SHA:** `3eac39c238545eb98742c3441e78719ab5832c29`  
**Target Cloudflare Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)  
**Target Cloudflare D1:** `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`)  
**Release Marker:** `X5.5` (`x5.5-apex-clarity-stability-2026-11-22`)

---

## 1. Executive Summary

Strategic Souls X5.5 was executed strictly sequentially across **Phase 1 (Reliability, Concurrency & Privacy)**, **Phase 2 (Mobile/Desktop UX, Performance, 3D Globe & Brand Language)**, and **Phase 3 (D1 Safety, Security Matrix, Low-Noise Observability, Market-Data Contracts & Cross-Device E2E)** with zero destructive database changes, zero commercial API keys connected, zero new paid Cloudflare services, and zero changes to the approved GVV logo or canonical 6-color text palette (`#E8EDF2`, `#CAD3DC`, `#B9C3CE`, `#A7B1BC`, `#76C0FF`, `#94D0FF`).

| Phase | Scope | Gate Status |
| --- | --- | --- |
| **Phase 0** | Live reconnaissance, X5.4 baseline capture, BEFORE screenshots & bundle baseline | **PASS** |
| **Phase 1** | Messaging concurrency, read-receipt accuracy, profile focus/privacy, single-row Soul authz, 50 Classic presets | **PASS** |
| **Phase 2** | Standalone `GRAVEYARD`, complete brand language polish, mobile UX, 3D Globe optimization, route code-splitting | **PASS** |
| **Phase 3** | D1 query plans & isolated backup/restore rehearsal, security matrix, observability, market-data contracts, Playwright E2E | **PASS** |

---

## 2. Root-Cause Defect Register & Fixes

| ID | Severity | Root Cause Found | Fix Implemented & Verified |
| --- | --- | --- | --- |
| **D-01** | P0 | `SocialWorkspace.refreshThread` & `onLoadEarlier` lacked `AbortController`, request sequence counters, and `activeThreadIdRef` checks — delayed responses from Thread A could overwrite Thread B; `mergeUniqueMessages` allowed stale polls to downgrade edits, retractions, or `READ` receipts. | Added `activeThreadIdRef`, `threadFetchSeqRef`, `olderFetchSeqRef`, `inboxFetchSeqRef`, `threadAbortRef`, and `olderAbortRef`. Upgraded `mergeUniqueMessages` to monotonic version/retraction/status progression (`READ > DELIVERED > SENT`). Returned canonical `message` snapshots from `send`, `edit-message`, and `retract-message` in `backend/services/community/social.ts`. Proven via Playwright `page.route` 1400ms delayed cross-thread test. |
| **D-02** | P0 | `ConversationView` recorded `lastMarkedRef` before server confirmation and swallowed errors; `mark-read` silenced newer `MESSAGE` notifications past `seen.created_at`; topbar Notification Bell desynced from chat reads. | `mark-read` now scopes notification updates to `<= seen.created_at` and returns authoritative `{ unread, unreadNotifications }`. `ConversationView` commits `confirmedReadRef` ONLY after server `200 OK`, with bounded retry (`2s/6s/15s`) and `visibilitychange` foreground sync. Topbar Bell syncs via `ss-unread-synced`. |
| **D-03** | P0 | `action === "read-notifications"` was missing in `backend/services/community/social.ts` (HTTP 400); `PublicProfileSheet` sent `targetKind: "BODY"` instead of `kind: "BODY"`; `dashboard.tsx` omitted `onOpenProfile` on `<SocialWorkspace view="Discover">`. | Implemented `read-notifications` handler, aligned `report` payload (`kind: "BODY"`) with defensive `targetKind`/`note` support, added `avatar`/`bio` to `blocked` query, and wired `onOpenProfile` in `dashboard.tsx`. |
| **D-04** | P1 | `ChatInbox` cleared `newHandle` and closed the New Chat bar even when `start-thread` failed; `ConversationView` left `prevScrollHeightRef` stale on failed earlier pagination and trapped mobile users without a `Back to chats` button while a slow/failing thread loaded. | `startChatByHandle` now returns `{ ok, error }`; `ChatInbox` preserves typed handle and shows inline `.x55-inline-error` on failure. `ConversationView` resets `prevScrollHeightRef = null` on failure, displays retry UI, and always renders the mobile `Back to chats` header when `hasActiveThread` is active. |
| **D-05** | P0 | `getPostComments`, `save-soul`, `comment-soul`, and `copy-soul` called full 80-row `listWebSouls()` (N+1 + broke past 80 global posts); `getPublicResearcherProfile` exposed total `publishedSouls` including hidden `GROUP`/`FOLLOWERS` posts to third parties; `copy-soul` ignored the 100-record insert cap silently. | Added O(1) PK-indexed `getAuthorizedWebSoulById` in `backend/services/community/research-network.ts`, pushed `authorHandle`/`savedOnly` filters into SQL, scoped non-owner profile `publishedSouls` to `feed.posts.length`, and threw HTTP 400 when 100 active workspace records are reached. |
| **D-06** | P1 | `PublicProfileSheet` lacked abort/sequence guards, modal focus trapping, opener focus restoration, background scroll lock, and delete confirmation; clipboard writers faked success toasts; `ResearchNetworkShell` and `UniversalSearch` flashed stale/empty states during debounce and blocked public researcher search for guests. | Added abort/sequence guards, `Tab`/`Shift+Tab` focus trap, opener focus restore, scroll lock, inline delete confirmation, truthful `copyTextSafe`, debounce-safe search state, and public researcher search in `UniversalSearch`. |
| **D-07** | P1 | `handleProfileSynced` dropped `legacyPrivateProfile`; `handleSignOut` retained cross-user state (`followRequests`, `initialProfileHandle`, `communitySearch`, `sharedFormula`, `asset`, `bellOpen`); `loadDefinition` dropped `MCX_FUTURES` / `CUSTOM_CSV` presets. | Synced `legacyPrivateProfile`, reset all workspace/overlay states on sign-out, and restored `MCX_FUTURES` and `CUSTOM_CSV` presets in `loadDefinition`. |
| **D-08** | P2 | `globe-canvas.tsx` leaked deleted `WebGLBuffer` handles in an array, ignored in-app `data-motion="minimal"`, uploaded 809.9 KB clouds in `reduced` mode, and lacked a texture fetch timeout. | Tracked active buffers in `Set<WebGLBuffer>`, respected `document.documentElement.dataset.motion === "minimal"`, capped idle rotation to ~30fps on constrained/reduced devices, skipped clouds in `reduced`, and enforced a 15s fetch timeout. |

---

## 3. Standalone `GRAVEYARD` & Brand Language Verification

- **Standalone `GRAVEYARD` Heading:** Verified in both source (`tests/unit/x55-language-and-ux.test.mjs`) and live Chromium DOM (`headingText: "GRAVEYARD"`, `wrapText: "GRAVEYARD"`, `hasSubtitleParagraph: false`, visually confirmed in `04-graveyard-390.png`). Immutability details live strictly inside the Strategy `?` Help modal.

### Brand Glossary
- **Body ID:** Unique public handle (`@handle`) for publishing Souls, following researchers, and messaging.
- **Soul:** A saved or published strategy scan built from deterministic rules.
- **Soul Feed:** Public stream of published Souls (replaces `Web` / `Community Web`).
- **Soul Network:** The Community space uniting `Soul Feed`, `Chats`, and `Rooms` (replaces `Research Network`).
- **Rooms:** Private or discoverable collaborative research spaces (replaces `Groups`).
- **GRAVEYARD:** Standalone signature heading for the immutable personal scan archive (zero subtitle).

### Visible Language Replacement Table

| Old Visible Copy | New Visible Copy | Source File(s) | Rationale |
| --- | --- | --- | --- |
| `Immutable personal scan archive · original formulas, cutoffs & post-mortems preserved` | *(Removed beneath `GRAVEYARD`; moved to Strategy `?` Help modal)* | `frontend/features/strategy/workspace.tsx`, `frontend/components/workspace/workspace.tsx` | Founder directive: standalone `GRAVEYARD` heading with zero subtitle |
| `Web` / `Community Web` | `Soul Feed` | `research-network-shell.tsx`, `strategy/workspace.tsx`, `public-profile-sheet.tsx`, `asset-terminal.tsx` | Clearer, signature product vocabulary |
| `Groups` | `Rooms` | `research-network-shell.tsx`, `social-workspace.tsx`, `workspace.tsx` | Consistent collaborative space naming |
| `Research Network` | `Soul Network` | `research-network-shell.tsx`, `workspace.tsx` | Coherent brand architecture |
| `Claim your public @BodyID` / `Set @BodyID` | `Create your Body ID` / `Choose Body ID` | `research-network-shell.tsx` | Removes confusing literal `@BodyID` placeholder |
| `Body ID (@handle)` | `Body ID` + concise one-time help text | `settings-view.tsx` | Plain-language onboarding without syntax noise |
| `Create your Body ID first` / `Body ID required for Direct Messages` | `Create a Body ID to start chatting` / `Create a Body ID to message researchers` | `social-workspace.tsx` | Direct action-oriented framing |
| `Enter @BodyID…` / `Search @BodyID, researcher, or Soul…` | `Enter a Body ID (e.g. @market_explorer)` / `Search Body ID or Soul…` | `chat-inbox.tsx`, `workspace.tsx`, `social-workspace.tsx` | Shows concrete example instead of literal `@BodyID` |
| `No @BodyID set yet` / `@BodyID_not_set` | `No Body ID set yet` / `No Body ID yet` | `account-quick-panel.tsx`, `settings-view.tsx` | Eliminates literal `@BodyID` token |
| `Post Soul` / `Post Soul to Community` / `Confirm & Post Soul` | `Publish Soul` / `Publish to Soul Feed` / `Publish Soul` | `strategy/workspace.tsx`, `asset-terminal.tsx` | Standard publishing verb |
| `Published cleanly! Your Soul ... is live on Community Web.` | `Soul published! Your Soul ... is now live in the Soul Feed.` | `strategy/workspace.tsx` | Natural confirmation copy |
| `Copy` (on another researcher's Soul) | `Copy to Drafts` | `research-network-shell.tsx`, `public-profile-sheet.tsx` | Clarifies exact destination of copy action |
| `Share QR & link` | `Share profile` | `public-profile-sheet.tsx` | Concise human label |
| `Sign in to sync to D1` / `Changes save directly to Cloudflare D1` / `from Cloudflare D1` | `Sign in to sync across devices` / `Private to your account` / `profile data` | `market-grid.tsx`, `settings-view.tsx` | Removes internal database implementation jargon |
| `Checking authorized conversations.` / `Loading server-authorized messages.` | *(Skeleton cards)* / `Loading messages…` | `social-workspace.tsx`, `conversation-view.tsx` | Removes internal authorization phrasing |
| `Messages are private to participants and server-authorized, but not end-to-end encrypted.` | `Messages are private between participants, though not end-to-end encrypted.` | `chat-inbox.tsx`, `settings-view.tsx` | Plain-language privacy honesty without E2EE overclaim |
| `Passwords are salted and hashed server-side with PBKDF2-SHA256.` | `Your password is never stored as plain text.` *(PBKDF2-SHA256 kept on `/trust`)* | `auth-panel.tsx`, `settings-view.tsx` | Approachable auth copy while preserving technical disclosure on `/trust` |
| `COVERAGE BLOCKED` / `COVERAGE VERIFIED` | `Not enough data to scan` / `Data coverage ready` | `strategy/workspace.tsx` | Human-readable preflight status |
| `Enter a natural-language research hypothesis first.` | `Describe the strategy you want to test.` | `strategy/workspace.tsx` | Simpler first-time prompt |
| `Soul name requires 3–100 characters` | `Soul names must be 3–100 characters long.` | `strategy/workspace.tsx`, `draw-canvas.tsx` | Complete grammatical guidance |
| `Post-mortem` / `Graveyard Post-Mortem` / `Save post-mortem` | `Review scan` / `Review Scan` / `Save review` | `strategy/workspace.tsx`, `controls.tsx` | Clearer review verb |
| `Draft version saved privately.` / `Scan completed and archived immutably in Graveyard.` | `Draft saved.` / `Scan complete. Saved to GRAVEYARD.` | `strategy/workspace.tsx` | Crisp feedback toasts |
| `No drafts yet` / `No saved Souls in this view` / `No formula matched …` / `No published Souls match this filter` | `No saved drafts yet` / `No matching scans.` (`No scans yet`) / `No matching formulas found.` / `No Souls match these filters.` | `strategy/workspace.tsx`, `research-network-shell.tsx` | Consistent, uncluttered empty states |
| `Replace Slot #N (...) — search canonical instruments:` | `Choose an instrument for slot N (current: ...):` | `market-grid.tsx` | Direct user action phrasing |
| `No matching instrument or permitted research found` | `No matching markets or public research found` | `universal-search.tsx` | Natural search empty state |
| `Payments, broker execution, public content publishing, and ...` | `Payments, commercial brokerage execution, automated trade routing, and ...` | `workspace.tsx` | Fixes outdated About claim now that Soul Feed publishing is live |

---

## 4. Performance & Bundle Metrics (Measured Before vs After)

| Metric | X5.4 Baseline (Before) | X5.5 (After) | Delta / Notes |
| --- | --- | --- | --- |
| `research-network-shell.js` (Community initial chunk) | `119.2 KB` | **`46.3 KB`** | **-61.2% (-72.9 KB)** via lazy-loading `SocialWorkspace` (`45.3 KB`) & `dashboard` (`36.4 KB`) |
| `strategy.js` (Strategy initial chunk) | `117.1 KB` | **`84.6 KB`** | **-27.8% (-32.5 KB)** via lazy-loading `FormulaLab` (`23.2 KB`) & `PatternDrawCanvas` |
| Total built client assets (`dist/client`) | `1151.7 KB JS / 262.2 KB CSS` (130 files) | `1166.3 KB JS / 263.8 KB CSS` (143 files) | +14.6 KB total across all split chunks due to concurrency/validation guards; initial route payloads substantially smaller |
| Mobile `390x844` FCP / Load | `900ms FCP / 2114ms load` (Vite dev server) | `320ms FCP / 541ms load` (local production Worker) | Different runtimes (dev vs built Worker) — reported transparently without inflating claims |
| Reduced-quality 3D Globe bandwidth | Always loaded `earth-clouds.jpg` (`809.9 KB`) | Skips `earth-clouds.jpg` in `reduced` mode | **-809.9 KB** saved on reduced-quality / `saveData` devices |

---

## 5. Multi-Viewport & Cross-Device Playwright Verification

Executed in real Chromium (`gvvPlaywright`) against the built production Cloudflare Worker (`http://127.0.0.1:8787`) across **8 viewports**, **3 synthetic accounts** (`@arjun_*`, `@meera_*`, `@kiran_*`), and **reduced motion**:

| Viewport | `scrollWidth` / `clientWidth` | Horizontal Overflow | Result |
| --- | --- | --- | --- |
| `320x720` | `320 / 320` | `0 px` | **PASS** |
| `360x800` | `360 / 360` | `0 px` | **PASS** |
| `390x844` | `390 / 390` | `0 px` | **PASS** |
| `430x932` | `430 / 430` | `0 px` | **PASS** |
| `640x360` (landscape) | `640 / 640` | `0 px` | **PASS** |
| `768x1024` | `768 / 768` | `0 px` | **PASS** |
| `1024x768` | `1024 / 1024` | `0 px` | **PASS** |
| `1440x900` | `1440 / 1440` | `0 px` | **PASS** |

- **2-Account Live E2E:** Register + consent + Body ID -> Classic Scan -> `GRAVEYARD` -> Publish to `Soul Feed` -> Search & open `PublicProfileSheet` -> Tab focus trap verified -> Follow -> DM with `<img src=x onerror=...>` + emoji + Arabic RTL (`xssFired: false`, `overflowPx: 0`) -> Accept & Reply -> Settings: **PASS**.
- **Out-of-Order Delayed Cross-Thread Guard (`page.route` 1400ms delay):** Active thread stayed on Kiran (`activeHeaderHasKiran: true`, `activeLogContaminatedByMeera: false`): **PASS**.
- **Failed New Chat Input Preservation:** Retained `"does_not_exist_999"` + inline `.x55-inline-error` visible: **PASS**.
- **Visual Inspection:** All 12 AFTER screenshots (`01-global-390`, `01-global-1440`, `02-strategy-scan-390`, `02-strategy-1440`, `03-formula-lab-390`, `04-graveyard-390`, `05-soul-feed-390`, `06-chats-inbox-390`, `07-open-chat-390`, `08-public-profile-390`, `09-settings-390`, `10-calendar-390`) visually inspected.

---

## 6. D1 Safety, Query Plans & Backup Rehearsal

- **Migrations Applied (`0000`–`0009`):** 10 files untouched; 57 indexes present; **0 new schema migrations** introduced (instant Worker rollback compatible with live D1 `ss`).
- **Hot Query Plan Audit (`EXPLAIN QUERY PLAN`):** 9 of 10 hot paths use covering or primary/secondary indexes (`x2_conversation_first`/`second`, `x2_message_thread_time`, `x51_follows_target`, `sqlite_autoindex_x51_web_souls_1`, `x1_body_handle_unique`, `x1_scans_owner`, `x1_records_owner`, `x2_notification_owner_time`). Future note: once `x51_web_souls` exceeds >1,000 rows, add `CREATE INDEX IF NOT EXISTS x51_web_souls_feed ON x51_web_souls(deleted_at, created_at DESC)`.
- **Isolated Backup & Restore Rehearsal:** Logical export -> clean restore into fresh SQLite DB -> `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = 0 violations`, `x1_scans` immutability trigger verified (`UPDATE` rejected), exact row-count parity (`auth_users: 1, accounts: 1, x1_bodies: 1, x1_scans: 1`).

---

## 7. Security, Observability & Market-Data Readiness

- **Security Matrix (`tests/integration/x55-security-and-permissions.test.mjs`):** Guest `401` on private endpoints; zero email/subject leaks on public endpoints; pre-consent `403`; legacy-private `404` until explicit opt-in; Room member `200` vs non-member `404` on `GROUP` Souls; cross-user scan/draft isolation enforced.
- **Observability (`backend/middleware/index.ts`):** Emits non-identifying `X-Request-Id` and `Server-Timing: app;dur=<ms>` on `/api/*`, plus low-noise JSON signals (`ss_api_signal`) strictly for `5xx`, `429`, or slow `/api/* > 1500ms` using `url.pathname` ONLY (zero query strings, zero PII/secrets).
- **Market-Data Contracts (`backend/services/market-data/providers.ts`):** Added `validateFeedBatchContract` & `evaluateFeedEntitlement` tested purely with synthetic NSE equity & MCX futures fixtures (`tests/unit/x55-market-data-contracts.test.mjs`). Enforces fail-closed entitlements (HTTP 200 != redistribution; Angel One SmartAPI strictly denied public redistribution). **ZERO commercial API keys connected.**

---

## 8. Evidence-Backed Quality Scorecard (1–5)

| Dimension | X5.4 Before | X5.5 After | Evidence Basis |
| --- | --- | --- | --- |
| **Reliability & Concurrency** | 3.0 / 5 | **4.8 / 5** | Abort/sequence guards, monotonic message merging, verified `page.route` delay test, `read-notifications` & `report` fixed, 50/50 Classic presets verified |
| **Mobile UX & Layout Polish** | 3.5 / 5 | **4.7 / 5** | 0px overflow across 8 viewports, 5-col single-row timeframes, full-width 3-col Community tabs, untruncated My Profile strip, mobile chat back-button during load |
| **Brand & Language Clarity** | 3.2 / 5 | **4.9 / 5** | Standalone `GRAVEYARD` (no subtitle), zero visible `@BodyID`/`Cloudflare D1`/`Community Web`/`Post Soul`/`server-authorized` jargon |
| **Performance & 3D Globe** | 3.8 / 5 | **4.6 / 5** | `-61.2%` Community initial chunk, `-27.8%` Strategy initial chunk, `Set<WebGLBuffer>` leak fix, `reduced` clouds skip, 15s texture timeout |
| **Security, Privacy & Data Integrity** | 4.2 / 5 | **4.9 / 5** | Single-row Soul authz, hidden non-owner counts, clean sign-out reset, Tab focus trap, fail-closed market-data entitlement contracts |

---

## 9. Complete Verification Command Ledger

| Command | Result | Details |
| --- | --- | --- |
| `node operations/scripts/check-x2-release.mjs` | **PASS** | `typecheck` exit 0, `lint` exit 0, `tests` **333 / 333 PASS** (0 fail) |
| `uv run --project backend/quant pytest backend/quant/tests -q` | **PASS** | **29 / 29 PASS** |
| `node operations/scripts/scan-secrets.mjs` | **PASS** | 744 files scanned, 0 findings |
| `node operations/scripts/scan-v3-source.mjs` | **PASS** | 457 files examined, 0 findings |
| `pnpm.cmd audit --audit-level high` | **PASS** | 0 high, 0 critical (2 moderate) |
| `node operations/scripts/run-framework.mjs build` | **PASS** | 5/5 Vinext environments; `dist/server/wrangler.json` bindings verified (`strategic-souls` / `DB` / `ss` / `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) |
| `git diff --check` | **PASS** | 0 whitespace errors |
| Real Chromium Playwright E2E + 8 viewports + 12 screenshots | **PASS** | 0 pageErrors, 0px overflow on all 8 viewports, out-of-order guard PASS, XSS safe |

---

## 10. Explicit Remaining External Blockers (Out of Scope / Unchanged)

1. **Cloudflare R2 Absent / Account-Disabled (`403 code 10042`):** Custom media uploads remain fail-closed; 50 SVG avatars and 8 Obsidian backdrops operate natively without R2.
2. **Commercial Market Data Feeds Missing:** No commercial NSE/BSE/MCX/TrueData/EODHD/News API keys are connected; public view serves verified ECB FX, US Treasury yields, USGS earthquakes, and NASA EONET feeds while commercial instruments display honest pending/restricted states. Validation & entitlement contracts are ready for plug-and-play activation once licensed keys are procured.
3. **Google OAuth Pending:** Email/password D1 session auth is live; Google OAuth stays dormant until client ID/secret and callback URIs are configured.
4. **Billing / Payments Pending:** Zero Razorpay, Stripe, or subscription/ad infrastructure installed.

---

## 11. 10-Item Final Founder Acceptance Checklist

1. [ ] Open **Global** on mobile & desktop: confirm centered `Strategic Dashboard`, 9 market cards (3×3), compact Portfolio/Watchlist, 3D `Strategic Globe` (zero 2D map), and `Economic Calendar` at bottom with canonical 6-color text palette & GVV logo unchanged.
2. [ ] Open **Strategy → Soul Scan**: confirm blank Soul name input, 50 Classic presets selector, single-row 5-column timeframe chips (`30 min | 1 hour | Daily | Weekly | Monthly`), and clean `Formula Lab` tab.
3. [ ] Scroll to **GRAVEYARD** in Strategy: confirm standalone `GRAVEYARD` heading with **zero subtitle**, zero `"Scan History"`, and clean `"Search scans or formulas…"` bar; tap Strategy `?` Help to verify GRAVEYARD immutability details live there.
4. [ ] Run a scan and tap **Publish Soul**: confirm `"Publish to Soul Feed"` modal, `"Soul published!"` confirmation, and appearance in **Community → Soul Feed**.
5. [ ] Open **Community**: confirm full-width 3-column `Soul Feed | Chats | Rooms` tabs, untruncated My Profile strip (`@handle · Souls · Followers` + single `Edit`), side-by-side `All Timeframes | Newest` selects, and zero literal `@BodyID` anywhere.
6. [ ] Tap a researcher's `@handle`: confirm canonical Public Profile Sheet opens cleanly, `Tab` focus stays trapped inside modal, `Esc` closes and restores focus, `Share profile` & `Copy to Drafts` work cleanly.
7. [ ] Open **Community → Chats**: verify Telegram-like inbox, switch quickly between threads (confirm zero cross-thread contamination), test invalid Body ID in New Chat (confirm typed text is preserved with inline error), and verify unread badge updates after reading.
8. [ ] Open **Settings & Preferences**: confirm clean `"Private to your account"` header, `"Body ID"` field with concise onboarding help, and zero `"Cloudflare D1"` / `"PBKDF2-SHA256"` jargon (while `/trust` still documents full technical security posture).
9. [ ] Verify live `GET /api/release` returns `"release": "X5.5"`, `"revisionMarker": "x5.5-apex-clarity-stability-2026-11-22"`, `X-Request-Id`, and `Server-Timing` headers while unauthenticated `/api/profile` returns `401`.
10. [ ] Confirm rollback safety: zero destructive D1 migrations were applied (`0000`–`0009` intact); Cloudflare Worker version `#15` (`37f4d374-6839-4d4a-a470-7484f8adefc4`) remains available as instant X5.4 rollback target.

