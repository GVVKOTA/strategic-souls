# Strategic Souls X5.5 — Execution Progress Ledger

**Branch:** `feat/x5-5-stability-experience-language`  
**X5.4 Production Baseline SHA:** `3eac39c238545eb98742c3441e78719ab5832c29`  
**Live Production Baseline Worker:** `strategic-souls` Version `#15` (`37f4d374-6839-4d4a-a470-7484f8adefc4`, Deployment `2eb1fa8c-70aa-4092-b12b-dc8d1bd92115`, deployed `2026-11-22T08:09:56.454909Z`)  
**D1 Database:** `ss` (`DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`)

---

## Phase 0 — Live Reconnaissance & X5.4 Baseline (DONE)

| Check | Result | Measured Value |
| --- | --- | --- |
| `node operations/scripts/check-x2-release.mjs` | PASS | `typecheck` 22.3s, `lint` 47.6s, `tests` 317/317 (4.9s) |
| `uv run --project backend/quant pytest backend/quant/tests -q` | PASS | 29/29 PASS (3.97s) |
| `node operations/scripts/scan-secrets.mjs` | PASS | 698 files, 0 findings |
| `node operations/scripts/scan-v3-source.mjs` | PASS | 452 files, 0 findings |
| `node operations/scripts/run-framework.mjs build` | PASS | 5/5 Vinext environments; `dist/server/wrangler.json` verified |
| Client bundle baseline (`dist/client`) | MEASURED | **JS: 1151.7 KB**, **CSS: 262.2 KB** (130 files) |
| Mobile `390x844` Playwright BEFORE baseline | MEASURED | `FCP: 900ms`, `domContentLoaded: 628ms`, `loadEvent: 2114ms`, `scrollWidth: 390 <= 390`, `consoleErrors: 0` |
| BEFORE Screenshots captured & inspected | DONE | 9 PNGs (`global`, `calendar`, `strategy-scan`, `graveyard`, `community`, `profile`, `settings` @390; `global`, `strategy` @1440) |

---

## Phase 1 — Critical Functional Reliability, Concurrency & Privacy (DONE)

### Root-Cause Defects Fixed
1. **D-01 (Cross-Thread Stale Contamination & Monotonic Merging):**
   - Added `activeThreadIdRef`, `threadFetchSeqRef`, `olderFetchSeqRef`, `inboxFetchSeqRef`, `threadAbortRef`, and `olderAbortRef` in `frontend/features/community/social-workspace.tsx`.
   - Switching threads synchronously clears previous `thread`/`older`/`olderError`/`editing`, aborts in-flight fetches, and discards stale responses whose sequence or `threadId` no longer matches.
   - Upgraded `mergeUniqueMessages` in `frontend/features/community/messenger/types.ts` so newer `version`, `retractedAt`, and `READ > DELIVERED > SENT` status progression are never downgraded by stale polls; fixed `inboxTimeLabel` midnight calendar-day `"Yesterday"` boundary.
   - Separated write commit from post-write refresh in `social-workspace.tsx` and returned canonical `message` snapshots from `send`, `edit-message`, and `retract-message` in `backend/services/community/social.ts`.
2. **D-02 (Unread & Read Receipt Desync):**
   - Fixed `mark-read` in `backend/services/community/social.ts` to only mark `MESSAGE` notifications read up to `seen.created_at` and return authoritative `{ unread, unreadNotifications }`.
   - Fixed `ConversationView` to commit `confirmedReadRef` ONLY after server `200 OK`, with bounded retry backoff (`2s / 6s / 15s`) and `visibilitychange` foreground sync.
   - Synced unread notification counts across chat, Notifications, and topbar Notification Bell via `ss-unread-synced`.
3. **D-03 (Form Preservation & Pagination Recovery):**
   - `ChatInbox` preserves typed Body ID + displays inline error when `start-thread` fails, clearing/closing only on `ok === true`.
   - `ConversationView` preserves scroll anchor (`prevScrollHeightRef = null`) and shows inline retry UI if `onLoadEarlier` fails.
4. **D-04 (Broken Endpoints & Navigation Wiring):**
   - Implemented missing `action === "read-notifications"` bulk handler in `backend/services/community/social.ts`.
   - Hardened `action === "report"` to accept both canonical `kind` and defensive `targetKind` + `note`, and fixed `PublicProfileSheet` payload.
   - Added `avatar` and `bio` to `getSocial` blocked list query.
   - Wired missing `onOpenProfile` into `<SocialWorkspace view="Discover">` in `frontend/features/community/dashboard.tsx`.
5. **D-05 (Profile Races, Modal Focus Trap, Clipboard Honesty, Search & Signout Hygiene):**
   - Added abort/sequence guards to `PublicProfileSheet` (`loadProfile`, `openConnections`), `ResearchNetworkShell` (`loadWebFeed`, `openComments`, researcher search), and `UniversalSearch` (zero false empty state during debounce + guest/Body-less public researcher search via `/api/community/network?view=search`).
   - Added real modal focus move, `Tab`/`Shift+Tab` focus trap, background scroll lock, opener focus restoration, and inline delete confirmation in `PublicProfileSheet`.
   - Added `copyTextSafe` in `frontend/components/workspace/shared.tsx` so clipboard actions never display fake success toasts.
   - Added single-row `getAuthorizedWebSoulById` in `backend/services/community/research-network.ts` (eliminating N+1 full-feed reads and fixing >80 post lookups), scoped `listWebSouls` SQL by `authorHandle`/`savedOnly`, hid non-public Soul counts from third-party profile visitors, and enforced the 100-record workspace cap truthfully on `copy-soul`.
   - Synced `legacyPrivateProfile` in `handleProfileSynced` and cleared all cross-user UI state on `handleSignOut` in `frontend/components/workspace/workspace.tsx`.
   - Preserved `MCX_FUTURES` and `CUSTOM_CSV` presets in `loadDefinition` (`frontend/features/strategy/workspace.tsx`).

### Phase 1 Verification Gate (PASS)
- `node operations/scripts/check-x2-release.mjs`: `typecheck` PASS (9.2s), `lint` PASS (35.7s), `tests` PASS (5.0s — **323/323 PASS**, including 6 new tests in `tests/integration/x55-phase1-reliability-privacy.test.mjs` covering all 50 Classic presets + all concurrency/privacy regressions).

---

## Phase 2 — Premium UX, Mobile Polish, Performance, Globe & Brand Language (DONE)

### Delivered Improvements
1. **Standalone `GRAVEYARD` Heading (Strict Founder Contract):**
   - Removed subtitle paragraph (`Immutable personal scan archive · original formulas, cutoffs & post-mortems preserved`) directly beneath `GRAVEYARD` in `frontend/features/strategy/workspace.tsx` so `GRAVEYARD` stands alone with zero subtitle/descriptor. Moved immutability explanation to the Strategy `?` Help modal.
2. **Complete Brand & Plain-Language Vocabulary Polish:**
   - Removed all visible `@BodyID`, `Community Web`, `Post Soul`, `Cloudflare D1`, `Checking authorized conversations`, `server-authorized`, `COVERAGE BLOCKED`/`COVERAGE VERIFIED`, `PBKDF2-SHA256` (in Auth/Settings; retained technical disclosure on `/trust`), and stale `"public content publishing"` copy across 15 frontend UI files.
   - Standardized visible product language to `Body ID`, `Soul Feed`, `Soul Network`, `Rooms`, `Publish Soul`, `Publish to Soul Feed`, `Copy to Drafts`, `Share profile`, `Review scan`, and concise Body ID onboarding microcopy.
3. **Mobile & Desktop UX Polish:**
   - Community primary tabs (`Soul Feed | Chats | Rooms`) now span full 3-equal-column width (`.x55-comm-tabs`) with zero dead space.
   - Removed redundant `Profile >` button from `.x54-my-strip` so `@handle · Souls · Followers` no longer truncates to `...` on 390px viewports.
   - Placed `All Timeframes` + `Newest` selects into a crisp 2-column `.x55-feed-selects` row on mobile.
   - Tightened Strategy timeframe strip (`.x54-chip-strip.is-tf`) into a clean 5-column single row (`30m | 1h | Daily | Weekly | Monthly`).
   - Added layout-stable skeleton loading cards (`.x55-skel-card`, reduced-motion safe) in Soul Feed, Chats, and Economic Calendar, plus inline error + Retry UI on Economic Calendar.
   - Unified duplicated `/api/profile` request in `SettingsView`.
4. **3D Globe & Bundle Performance:**
   - `globe-canvas.tsx`: switched `buffers` tracking to `Set<WebGLBuffer>` so deleted buffers are released cleanly; honored in-app `data-motion="minimal"` alongside `prefers-reduced-motion`; capped idle auto-rotation to ~30fps on constrained/reduced devices; skipped 809.9 KB `earth-clouds.jpg` in `reduced` mode; added 15s fetch timeout on textures.
   - Lazy-loaded `SocialWorkspace` and `CommunityGroupsWorkspace` in `research-network-shell.tsx` and `FormulaLab` and `PatternDrawCanvas` in `strategy/workspace.tsx`.
   - **Measured Initial Route Chunk Deltas (vs X5.4 Baseline):**
     - `research-network-shell.js`: **119.2 KB -> 46.3 KB (-61.2% / -72.9 KB)**
     - `strategy.js`: **117.1 KB -> 84.6 KB (-27.8% / -32.5 KB)**
     - Total built client JS/CSS across all lazy chunks: `1166.3 KB JS / 263.8 KB CSS` (143 files).

### Phase 2 Verification Gate (PASS)
- `node operations/scripts/check-x2-release.mjs`: `typecheck` PASS (18.0s), `lint` PASS (48.4s), `tests` PASS (6.1s — **326/326 PASS**, including `tests/unit/x55-language-and-ux.test.mjs`, `tests/unit/x1-palette.test.mjs`, and `tests/unit/x53-terminal-globe-evidence.test.mjs`).
- `node operations/scripts/run-framework.mjs build`: PASS (5/5 Vinext environments).

## Phase 3 — D1 Safety, Security Matrix, Observability, Market-Data Contracts, E2E & Release (DONE)

### Delivered Improvements
1. **D1 Safety, Indexes & Isolated Backup/Restore Rehearsal (`P3.1`):**
   - Verified `EXPLAIN QUERY PLAN` across 10 hot paths over migrations `0000`–`0009` (57 existing indexes): 9/10 hot queries use indexes directly (including O(1) PK lookup on single-row `x51_web_souls`, covering indexes on `x2_messages`, `x51_follows`, `x1_scans`). Zero new schema migrations required — preserves zero-drift instant rollback.
   - Executed isolated SQLite logical backup & restore rehearsal outside git: `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = 0 violations`, immutability trigger on `x1_scans` verified enforced (`UPDATE` rejected), exact row-count parity verified.
2. **Low-Noise Privacy-Safe Observability (`P3.3`):**
   - Enhanced `backend/middleware/index.ts` with non-identifying `X-Request-Id`, `Server-Timing: app;dur=<ms>` on `/api/*`, and anonymous JSON signal logging (`ss_api_signal`) ONLY for `5xx`, `429`, or slow `/api/*` (`>1500ms`) logging pathname only (never query strings, Body IDs, cookies, message content, or secrets).
   - Updated `app/api/release/route.ts` to `X5.5` (`x5.5-apex-clarity-stability-2026-11-22`).
3. **Market-Data-Ready Validation & Entitlement Contracts (`P3.4`, ZERO Keys Connected):**
   - Extended `backend/services/market-data/providers.ts` with `validateFeedBatchContract` and `evaluateFeedEntitlement` covering canonical symbol/MIC/IANA timezone/currency/unit, futures expiry/lot/tick, OHLCV bounds, null-not-zero missing volume, corporate-action tagging, duplicate & staleness checks, concurrency/quota caps, and fail-closed license rights (HTTP 200 never implies display/redistribution; Angel One SmartAPI strictly denied public redistribution).
   - Added 3 synthetic-fixture contract tests (`tests/unit/x55-market-data-contracts.test.mjs`).
4. **Full Security & Permission Matrix Tests (`P3.2`):**
   - Added `tests/integration/x55-security-and-permissions.test.mjs` covering guest `401` gates, zero email/subject leaks, pre-consent `403`, legacy-private isolation, Room member vs non-member isolation for `GROUP` Souls, cross-user scan isolation, and middleware header/logging guarantees.
5. **Real-Browser Multi-Viewport & 2-Account Playwright E2E + Mobile Back-Button Fix (`P3.5`):**
   - Discovered and fixed a real mobile UX bug during delayed-network Playwright testing: while loading or failing a thread on mobile (`<=768px`), `ConversationView` previously rendered without a `Back to chats` button. Added persistent mobile header with `Back to chats` whenever `hasActiveThread` is true.
   - Verified 0px horizontal overflow across all 8 viewports (`320x720`, `360x800`, `390x844`, `430x932`, `640x360`, `768x1024`, `1024x768`, `1440x900`), `FCP = 320ms` on local production Worker (`390x844`), standalone `GRAVEYARD` heading with zero subtitle, `Soul Feed | Chats | Rooms` vocabulary, 2-account follow/publish/chat E2E, `page.route` 1400ms delayed out-of-order thread guard, failed New Chat input retention, Tab focus trap inside `PublicProfileSheet`, XSS/emoji/RTL safety (`xssFired = false`), reduced-motion media emulation, and visually inspected all 12 AFTER screenshots.
   - Verified `dist/server/wrangler.json` preserves exact bindings (`strategic-souls`, `DB`, `ss`, `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`, `r2_buckets: []`).
   - Verified `scan-secrets.mjs` (744 files, 0 findings), `scan-v3-source.mjs` (457 files, 0 findings), `pytest` (29/29 PASS), `pnpm audit --audit-level high` (0 high/critical), and `check-x2-release.mjs` (333/333 PASS).
