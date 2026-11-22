# Strategic Souls X5.4 — Social Interface Audit & Release Report

**Release:** `X5.4` — Premium Mobile UI, Public Research Profiles, Telegram-like Chats & Cleaner Soul Scanner  
**Revision Marker:** `x5.4-mobile-social-scanner-2026-11-22` (`/api/release`)  
**Date:** 22 November 2026 (IST)  
**Feature Branch:** `feat/x5-4-mobile-social-and-scanner-ux` (branched from `main` at `f09774d8156cd88c8c1d6b2504fd685bc658c907`)  
**Target Cloudflare Worker:** `strategic-souls` (`https://strategic-souls.vishnukota20071005.workers.dev/`)  
**Target Cloudflare D1 Database:** `ss` (binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) — **0 schema migrations required** (`drizzle/0000`–`0009` immutable and untouched)  
**Rollback Baseline (X5.3):** Cloudflare Worker Version `#14` (`32d1f33e-742f-46ab-bf66-abac7f06a1c0`, Deployment `1920faa1-2a1b-4df2-b0ef-4be2730922c9`, deployed `2026-11-22T03:59:04Z`, commit `f09774d8156cd88c8c1d6b2504fd685bc658c907`)  
**Deployment Status:** _Pending final git push & Cloudflare Workers Builds verification (updated in Section 9 upon release)_

---

## 1. Executive Summary & Founder Request Coverage

X5.4 preserves the focused X5.3 intelligence terminal architecture (the 4-block Strategic Dashboard, natural-color 3D WebGL perspective Strategic Globe, Economic Calendar, Market Vox, 4-item Global 3-dot drawer, and the locked 6-token obsidian/silver/`#76C0FF` text color palette) while completely redesigning the mobile and desktop experience across four core founder-flagged surfaces:

| # | Founder Request / Screenshot Area | Before (`f09774d` X5.3) | After (X5.4 Implementation) | Status |
| --- | --- | --- | --- | --- |
| **1** | **Global Dashboard Market Header** | Redundant `"9 customizable instruments"` subtitle and permanent `"Synced · vN"` badge cluttered the header; 3×3 cards pinched narrow badges on small phones. | Removed `"9 customizable instruments"` and permanent `"Synced · vN"` text; clean right-aligned `Refresh` + `Customize` toolbar with 4-second ephemeral save feedback (`"Layout saved"`, `"Saved locally"`, `"Reset to defaults"`). All 9 cards preserved; below `520px`, renders clean 2-column grid with neat horizontal full-width 9th card and `≥12px` metadata badges. | `CHANGED` · `TESTED-PASS` |
| **2** | **Soul Scanner Name State & Compact UX** | New Soul prefilled `"Close above SMA(20)"` (and `"Double Bottom Shape Search"` in Draw), silently overwrote typed names when picking Classic presets/Discover/Draw templates, fell back to preset labels on blank submit, and showed verbose quota/helper walls. | Soul name starts **strictly blank** (`""`, placeholder `"Name your Soul"`) shared across Classic, Discover, Build, and Draw. Selecting `#11 Close above SMA(20)`, switching modes, or picking Draw templates never prefills or overwrites the name. Blank/whitespace names rejected both client-side (inline error + focus) and server-side (`400 "Enter a Soul name."` across `run-scan`, `save-scan-draft`, `run-draw-scan`, and `publish-soul`). Saved drafts restore their exact custom names cleanly; `"New Soul"` resets cleanly. Compact `"8 scans left"` pill + `Policy` popover, single clickable Classic formula card, Market/Timeframe chips, and clear CTA hierarchy (`Run scan` / `Check coverage` / `Save draft`). | `CHANGED` · `TESTED-PASS` |
| **3** | **Public Research Profiles & Legacy Consent Safety** | New users required a manual discoverability toggle; ordinary Web Soul posting had an unnecessary PUBLIC/FOLLOWERS/GROUP chooser; clicking `@BodyID` from many surfaces either did nothing or opened inconsistent drawers; giant `"Searching Research Network for..."` banner cluttered search; giant centered profile card pushed `Web \| Chats \| Groups` below the mobile fold. | First-time `@BodyID` creation automatically initializes `discoverable = 1` via `INSERT OR IGNORE` (zero bulk SQL update; existing legacy-private accounts stay private until explicit user opt-in via dismissible banner or Settings). Ordinary Web Souls always publish `PUBLIC` with clear upfront disclosure. Replaced giant landing profile card with a `~63px` compact `"My Profile"` strip so `Web \| Chats \| Groups` sits at `139px` on `390px` phones. Replaced giant search banner with compact ranked researcher rows (`GET /api/community/network?view=search&q=...`). | `CHANGED` · `TESTED-PASS` |
| **4** | **Instagram + Snapchat Inspired Canonical Profile (`PublicProfileSheet`)** | Fragmented profile views across Community, Settings, Search, and Notifications; mismatched layouts between self and visitor views. | Single canonical `PublicProfileSheet` opened from **every** `@handle` surface (Community strip, researcher search, UniversalSearch, Web Souls, comments, Rooms, Chat Header, Notification Bell, Account quick panel, and `?view=community&profile=<handle>` deep link with browser Back support). Original SS obsidian/silver/`#76C0FF`/restrained GVV-green composition: full-width preset banner, overlapping 82px ringed `AvatarBadge`, display name + `@handle`, bio, optional links/interests, clickable `Souls \| Followers \| Following` stats opening permitted connection sub-drawers, contextual owner/visitor actions (`Follow`/`Following`, `Message`, `QR Share`, `Edit Profile`, inline `Block` confirm & `Report`), and `Souls \| Pinned \| About` tabs. Zero fake Stories/snap-score/online badges. | `CHANGED` · `TESTED-PASS` |
| **5** | **Telegram-Like Compact Messenger (`Chats`)** | Oversized message cards (`>140px` tall for `"Hi"`), permanent `Mute / Hide / Block` buttons, `"Sent to server"` prose under every bubble, E2EE disclaimer paragraph under composer, simultaneous split panes colliding on mobile, bottom tab bar colliding with composer, and duplicate retracted tombstones. | Modular `messenger/` workspace: **mobile** shows strictly Inbox OR full-screen Conversation (`100dvh`, `.x1-mobile-nav` hidden while active, `visualViewport` height/top sync keeping composer visible above virtual keyboards); **desktop** shows clean 2-pane Inbox (`310px`) + Thread (`flex: 1`) with hidden mobile back button. Compact bubbles (`"Hi"` measured `95px × 52px` on `390px`) with inline time and truthful `✓`/`Read` state, contextual long-press/right-click/`⋮` menu (`Edit`, `Retract`, `Copy`, `Report`), inline retract confirmation, single compact `"Message retracted"` tombstone with deduplication, real inbox message previews & unread counters, and chat header `@handle` tap to canonical profile. | `CHANGED` · `TESTED-PASS` |
| **6** | **Clean Account & Preferences** | Cluttered profile form, narrow 2-column `Age`/`Gender` wrapping awkwardly on phones, unnecessary public/private toggle for normal public accounts, ambiguous custom upload wording despite R2 being disabled. | Live banner + overlapping avatar preview header (`Edit avatar`, `Banner`, `Preview`); logically grouped fieldsets (`Essentials`, `Interests & Links`, `Optional details (hidden by default)`); `Age` and `Gender` stack vertically below `640px` (`294px` wide on `390px`); checkbox row fixed (`flex-wrap: nowrap`) so label never drops below square; honest R2 unavailable notice inside Banner preset modal; public/private toggle hidden for standard public accounts while legacy-private accounts retain explicit opt-in control; single concise security notice without false E2EE claims. | `CHANGED` · `TESTED-PASS` |

---

## 2. Changed & Added Files Inventory

### Modified Files (23)

| Area | File | Purpose |
| --- | --- | --- |
| **API / Release** | `app/api/release/route.ts` | Updated release metadata to `X5.4` (`revisionMarker: "x5.4-mobile-social-scanner-2026-11-22"`, `bannerPresets: 8`). |
| **API / Auth** | `app/api/auth/[...action]/route.ts` | Exposed `legacyPrivateProfile` boolean in session payload. |
| **API / Community** | `app/api/community/network/route.ts` | Added `view=search` (public researcher search) and `view=followers\|following` (permitted connection lists) routes. |
| **App Shell** | `app/layout.tsx` | Imported modular X5.4 stylesheets (`scanner-x54.css`, `profile.css`, `messenger.css`). |
| **Backend / Research** | `backend/services/research/research.ts` | Enforced strict non-empty Soul name validation (`"Enter a Soul name."` / `"Scan name requires 3–100 characters."`). |
| **Backend / Research** | `backend/services/research/workspace.ts` | Rejected blank/whitespace `name` on `run-draw-scan` with HTTP `400`. |
| **Backend / Profile** | `backend/services/profile/profile.ts` | Auto-enabled `discoverable = 1` via `INSERT OR IGNORE` only on brand-new `@BodyID` creation; synced `x51_web_souls` & `x51_web_soul_comments` handles on rename; computed `legacyPrivateProfile`. |
| **Backend / Community** | `backend/services/community/community.ts` | Aligned `saveProfile` default-public logic for brand-new `@BodyID` and handle rename propagation. |
| **Backend / Community** | `backend/services/community/research-network.ts` | Rejected blank override title on Soul publish; implemented `searchPublicResearchers` (safe public DTOs only, block-filtered, ranked exact/prefix/name), `listProfileConnections` (visibility + block enforced), and open immediate `ACTIVE` follow for public profiles with server-authoritative counts & idempotent notifications. |
| **Backend / Social** | `backend/services/community/social.ts` | Enriched `inbox()` query with correlated `lastMessageText`, `lastMessageAt`, `lastMessageRetracted`, `lastMessageIsMine`, and case-insensitive handle filtering. |
| **Frontend / Global** | `frontend/features/global/market-grid.tsx` | Removed redundant caption and permanent `"Synced · vN"`; added 4s ephemeral save pill; clean right-aligned `Refresh` + `Customize` toolbar. |
| **Frontend / Global CSS** | `frontend/styles/x51.css` | Raised `.x51-mcard-badge` floor to `12px`; added `≤520px` 2-column + full-width horizontal 9th card grid layout. |
| **Frontend / Strategy** | `frontend/features/strategy/workspace.tsx` | Blank initial Soul name, shared single `#x54-soul-name` input decoupled from presets/Discover/Draw, `"New Soul"` reset, inline validation + focus, compact quota popover, unified Classic rule card, public-only Web Soul publish modal. |
| **Frontend / Strategy** | `frontend/features/strategy/draw-canvas.tsx` | Removed `"Double Bottom Shape Search"` prefill, template name overwrite, and default name fallback; wired controlled `scanName` / `onRequireName`. |
| **Frontend / Auth** | `frontend/features/auth/auth-panel.tsx` | Added `legacyPrivateProfile` to `SessionUser` interface. |
| **Frontend / Account** | `frontend/features/account/settings-view.tsx` | Live banner/avatar preview card, grouped fieldsets, stacked mobile Age/Gender, inline checkbox label span, honest R2 modal note, legacy-only discoverability opt-in. |
| **Frontend / Account** | `frontend/features/account/account.css` | Styles for `.x54-settings-*`, `.x54-optional-grid`, `.x54-r2-status-note`, and `.x54-settings-group .x1-checkbox` (`flex-wrap: nowrap`). |
| **Frontend / Account** | `frontend/features/account/account-quick-panel.tsx` | Routed "My Profile" to own canonical `PublicProfileSheet` when `@handle` exists. |
| **Frontend / Account** | `frontend/features/account/avatar-badge.tsx` | Added `displayName?: string` accessible `alt` fallback. |
| **Frontend / Shell** | `frontend/components/workspace/workspace.tsx` | Wired `?profile=` / `?handle=` deep-linking, UniversalSearch & Notification Bell `@handle` navigation to `PublicProfileSheet`, `is-mobile-chat-active` shell class hiding `.x1-mobile-nav` during active mobile chats, and X5.4 About copy. |
| **Frontend / Community** | `frontend/features/community/research-network-shell.tsx` | Compact `~63px` `"My Profile"` strip, dismissible legacy-private opt-in banner, debounced researcher search list, `PublicProfileSheet` integration with `pushState`/`popstate`, `Message` button -> `start-thread` -> Chats routing. |
| **Frontend / Community** | `frontend/features/community/dashboard.tsx` | Wired `onOpenProfile` across Rooms, posts, comments, members, and `GroupNetworkPanel`; removed discoverable opt-in checkbox on new Body creation in favor of clear upfront public disclosure. |
| **Frontend / Community** | `frontend/features/community/social-workspace.tsx` | Refactored to compose modular `messenger/` components; added nested `popstate` guard for opening profiles from chat header; removed composer E2EE paragraph; wired `initialThreadId`, `onOpenProfile`, and `onMobileChatActive`. |

### Added Modular Files (11)

- `frontend/features/strategy/scanner-x54.css` — Modular compact Soul Scanner styles (keeps `x51.css` clean).
- `frontend/features/community/public-profile-sheet.tsx` — Canonical Instagram+Snapchat-inspired public profile sheet & permitted connection sub-drawer.
- `frontend/features/community/profile.css` — Modular profile sheet, compact strip, and researcher search styles.
- `frontend/features/community/messenger/types.ts` — Messenger types, `mergeUniqueMessages` deduplicator, and time/date formatters.
- `frontend/features/community/messenger/chat-inbox.tsx` — Compact Telegram-like chat inbox rows with live previews and unread badges.
- `frontend/features/community/messenger/chat-header.tsx` — Clean single-line chat header with clickable `@handle` profile trigger and overflow menu (`Mute`, `Hide`, `Block`, `Report`).
- `frontend/features/community/messenger/message-bubble.tsx` — Compact left/right bubbles, inline time + truthful `✓`/`Read` state, contextual menu, inline retract confirmation, single `"Message retracted"` tombstone, and `ResearchAttachment`.
- `frontend/features/community/messenger/chat-composer.tsx` — 1–2 line auto-growing `16px` mobile textarea, inline Edit banner, desktop Enter-to-send / mobile newline, solid SS-blue send button.
- `frontend/features/community/messenger/conversation-view.tsx` — Full-viewport mobile/desktop thread view with `visualViewport` keyboard sync, smart bottom scrolling, scroll anchor preservation on earlier-message load, and auto-read marking.
- `frontend/features/community/messenger/messenger.css` — Modular Telegram-like messenger stylesheet with high-specificity `.x1-app .x2-social` resets preventing legacy button border leakage.
- `tests/integration/x54-mobile-social-and-scanner.test.mjs` — Automated integration & UI invariant test suite for X5.4.

---

## 3. Reproducible Bug Register & Root-Cause Fixes

Every bug below was reproduced via source audit, integration tests, or real-browser Playwright inspection and verified fixed:

| ID | Bug / Symptom | Root Cause | Fix & Verification |
| --- | --- | --- | --- |
| **B-01** | New Soul name prefilled `"Close above SMA(20)"` and silently overwrote user's typed name when picking presets or templates. | `workspace.tsx` initialized `name` from `CLASSIC_PRESETS[0].label` and called `setName(preset.label)` inside `selectClassicPreset()` & `parseDiscoverIntent()`; `draw-canvas.tsx` initialized `"Double Bottom Shape Search"` and called `setScanName(t.label)` in `applyTemplate()`. | Initialized `name = ""` across all modes; removed preset/Discover/template `setName` mutations; removed fallback labels; enforced blank rejection on client + backend. Verified in Node integration test & Playwright `390px`. |
| **B-02** | Blank Soul names could still succeed via backend/fallback paths on `run-draw-scan` or `publish-soul`. | `workspace.ts` defaulted blank `draw-scan` names to `"Interactive Draw Pattern Search"`; `research-network.ts` allowed blank override `title`. | Both endpoints now explicitly reject empty/whitespace names with HTTP `400 "Enter a Soul name."`. Verified in `x54-mobile-social-and-scanner.test.mjs`. |
| **B-03** | Loading a saved `SIMPLE` draft could lose or confuse its saved custom name. | `loadDefinition` didn't consistently preserve `def.name` independently from preset selection state. | `loadDefinition` restores saved `def.name` and rule payload without preset label overrides. Verified saving `"Tarun FX Trend"`, clicking `"New Soul"`, and reloading draft in Playwright `390px`. |
| **B-04** | New users' `@BodyID` profiles were hidden from search/followers until they manually toggled a hidden Setting. | `x2_social_preferences` defaulted `discoverable = 0` for all accounts including brand-new `@BodyID` creations. | `profile.ts` and `community.ts` now run `INSERT OR IGNORE INTO x2_social_preferences (..., discoverable) VALUES (..., 1)` strictly when `!existingBody && rawHandle`, preserving legacy-private users untouched. Verified in integration test. |
| **B-05** | Renaming a `@BodyID` left stale handles on previously published Web Souls and comments. | Handle update mutated `x1_bodies.handle` without updating denormalized `author_handle` columns. | Propagated handle updates to `x51_web_souls.author_handle` and `x51_web_soul_comments.author_handle` on rename. Verified in integration test. |
| **B-06** | Clicking `Message` on another user's profile didn't open the direct thread in `Chats`. | Profile drawer lacked wired `start-thread` -> tab switch -> `initialThreadId` handoff. | `ResearchNetworkShell` invokes `POST /api/x2/social` (`action: "start-thread"`), switches to `Chats`, and passes `initialThreadId` directly to `SocialWorkspace`. Verified end-to-end with 2 synthetic accounts. |
| **B-07** | **Nested Mobile Back Bug (caught in real Chrome Playwright QA):** Closing a `PublicProfileSheet` opened from a Chat Header also closed the mobile chat thread. | Closing `PublicProfileSheet` called `window.history.back()`, triggering BOTH `ResearchNetworkShell`'s and `SocialWorkspace`'s `popstate` listeners. | Guarded `SocialWorkspace`'s `popstate` handler to check `(e.state as { x54ChatThread?: string })?.x54ChatThread === threadId`, keeping the chat open when popping a nested profile and returning to Inbox on the next Back. Verified in Chrome `390px`. |
| **B-08** | Duplicate retracted tombstones or duplicate optimistic/polled messages appeared in chat threads. | Polling merge appended rows without ID deduplication or replacing retracted states cleanly. | Added `mergeUniqueMessages()` in `messenger/types.ts` deduplicating by message ID and rendering a single compact `"Message retracted"` tombstone. Verified in integration test & Chrome `390px`. |
| **B-09** | Legacy `.x1-app button` global CSS leaked visible gray borders onto borderless chat header buttons, inbox rows, desktop back button, and overrode the SS-blue send button (caught in Playwright screenshot review). | `x1.css` applies `.x1-app button` border/background/flex rules with specificity `(0,1,1)` beating single-class `.x54-*` rules `(0,1,0)`. | Added `.x1-app .x2-social .x54-...` / `.x1-app .x54-...` specificity selectors in `messenger.css` and `profile.css`; confirmed crisp borderless headers/rows and solid `#76C0FF` send button in polish screenshots. |
| **B-10** | `Follow` button wrapped into `"Follo/w"` on `390px` search rows (caught in screenshot review). | Missing `white-space: nowrap; flex-shrink: 0;` on compact search row action pills. | Added `white-space: nowrap; flex-shrink: 0;` in `profile.css`. Verified clean single-line `Follow` / `Following` pills. |
| **B-11** | Profile action buttons sat slightly low beside avatar on `390px` (caught in screenshot review). | `padding-top: 44px` on `.x54-profile-actions-inline` pushed buttons below the avatar midpoint. | Adjusted to `padding-top: 0; margin-bottom: 4px;` for balanced horizontal alignment beside the overlapping avatar. Verified in `x54-polish-profile-390.png`. |
| **B-12** | `"Show my age on my public Body ID profile"` label dropped beneath its checkbox square on `390px` (caught in screenshot review). | Legacy `.x1-checkbox` in `x1.css:1945` sets `flex-wrap: wrap`, causing long text nodes next to an `18px` checkbox to wrap to a new flex line. | Set `flex-wrap: nowrap` on `.x54-settings-group .x1-checkbox` and wrapped the text in `<span>` inside `settings-view.tsx`. |

---

## 4. Privacy, Security & Legacy Consent Architecture

- **Zero Bulk Privacy Flip & Zero D1 Migration Risk:** Existing migrations `drizzle/0000`–`0009` were never modified, and no `UPDATE x2_social_preferences SET discoverable = 1` was executed anywhere. Legacy accounts that previously opted out (`discoverable = 0`) remain **100% hidden** from public researcher search, public profile views, and third-party Followers/Following lists until the user explicitly chooses to make their profile public via the dismissible Community banner or Settings toggle.
- **Brand-New Accounts Public by Design:** Creating a new `@BodyID` inserts `discoverable = 1` via `INSERT OR IGNORE`, displays upfront public-profile disclosure during onboarding, and allows immediate open Follow (`ACTIVE`) without request friction.
- **Strict Public DTO Surface:** `searchPublicResearchers`, public `profile` views, and `listProfileConnections` never expose email addresses, internal subject IDs, password hashes, age (unless `showAge === true`), gender (unless explicitly non-`HIDDEN`), direct messages, message requests, portfolios, broker credentials, watchlists, saved private drafts, Graveyard history, or CSV uploads.
- **Block & Authorization Enforcement:** Blocked pairs are filtered bidirectionally from researcher search, profile access, follower/following lists, and messaging. Non-participants requesting a private DM thread receive HTTP `404`; logged-out requests to `/api/x2/social?view=home`, `/api/x1/workspace`, and `/api/x2/providers` fail closed with HTTP `401` and `Cache-Control: private, no-store`.
- **Honest Security Messaging:** Removed bloated encryption paragraphs from the chat composer; retained one concise, accurate disclosure in Settings clarifying that messages are protected in transit (HTTPS/TLS) and stored server-side in D1 for cross-device sync and moderation — never claiming end-to-end encryption (E2EE).

---

## 5. Automated Verification Matrix

All checks executed on branch `feat/x5-4-mobile-social-and-scanner-ux` after the final CSS and TypeScript edits:

| Gate | Command | Result | Details |
| --- | --- | --- | --- |
| **Production Worker Build** | `node operations/scripts/run-framework.mjs build` | **PASS** (`0`) | 5/5 Vinext environments built cleanly; verified `dist/server/wrangler.json` targets Worker `strategic-souls`, binding `DB`, D1 `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`). |
| **TypeScript (`typecheck`)** | `node operations/scripts/check-x2-release.mjs` | **PASS** (`0`) | `0` type errors (`8.0s`). |
| **ESLint (`lint:app`)** | `node operations/scripts/check-x2-release.mjs` | **PASS** (`0`) | `0` errors, `0` warnings (`38.9s`). |
| **Node Unit + Integration Suites** | `node --experimental-strip-types --experimental-vm-modules --test "tests/**/*.test.mjs"` | **PASS** (`0`) | **`317 / 317` passed, `0` failed** (`6.06s`), including all 4 new X5.4 integration/UI-invariant suites in `tests/integration/x54-mobile-social-and-scanner.test.mjs` and the `x1-palette` invariant audit. |
| **Python Quant Suite** | `uv run --project backend/quant pytest backend/quant/tests -q` | **PASS** (`0`) | **`29 / 29` passed** (`1.08s`). |
| **Secret Leak Scan** | `node operations/scripts/scan-secrets.mjs` | **PASS** (`0`) | `708` files scanned (including `dist/`), `0` findings. |
| **Source Hygiene Scan** | `node operations/scripts/scan-v3-source.mjs` | **PASS** (`0`) | `451` tracked/non-ignored files examined, `0` findings. |
| **Patch / Whitespace Check** | `git diff --check` | **PASS** (`0`) | `0` whitespace or conflict errors. |

---

## 6. Real-Browser Multi-Viewport Playwright QA Matrix

Tested via `gvvPlaywright` real Chromium against the compiled local Worker preview (`http://127.0.0.1:5173`, isolated local D1 with `0000`–`0009`) using **strictly synthetic test accounts** (`@tarun_grqr`, `@tarun_deja`, `@maya_grqr`) and a **logged-out guest context** (zero genuine user data):

### Responsive Overflow Sweep (All 7 Required Viewports)

| Viewport | Orientation | `scrollWidth <= innerWidth` | Horizontal Overflow | Notes |
| --- | --- | --- | --- | --- |
| `320×720` | Portrait | `320 <= 320` | `0px` (`PASS`) | 2-col + horizontal 9th Global card; zero clipping. |
| `360×800` | Portrait | `360 <= 360` | `0px` (`PASS`) | Clean Scanner, Community strip, Profile, and Messenger. |
| `390×844` | Portrait | `390 <= 390` | `0px` (`PASS`) | Full interactive E2E pass (Global, Strategy, Settings, Community, Profile, Chat). |
| `430×932` | Portrait | `430 <= 430` | `0px` (`PASS`) | Balanced card proportions and touch targets (`≥44px`). |
| `768×1024` | Tablet Portrait | `768 <= 768` | `0px` (`PASS`) | 3×3 Global grid, spacious modals, clean profile sheet. |
| `1024×768` | Landscape | `1024 <= 1024` | `0px` (`PASS`) | Sidebar + content alignment verified. |
| `1440×900` | Desktop | `1440 <= 1440` | `0px` (`PASS`) | 2-pane Messenger (`inbox: 310px`, `pane: 816px`, mobile back button hidden). |

### Interactive E2E Workflow Assertions (Measured DOM & Visual Evidence)

- **Global (`390×844`):** Confirmed `"9 customizable instruments"` absent and `"Synced · v"` absent; 9 market cards rendered (`card1Width: 175px`, `card9Width: 358px` full-width horizontal 9th card); Customize modal swap -> save -> reload persistence -> Reset to defaults passed.
- **Soul Scanner (`390×844`):** Confirmed `#x54-soul-name` initialized to `""`; selecting `#11 Close above SMA(20)` kept value `""`; clicking `Run scan` blank displayed inline `"Enter a Soul name."`; typing `"Tarun FX Trend"` survived switching Classic -> Advanced -> Discover -> Build -> Draw -> RSI; saving draft -> `"New Soul"` -> reloading draft restored `"Tarun FX Trend"`.
- **Account & Preferences (`390×844`):** Live banner + overlapping avatar preview confirmed; `Age` and `Gender` stacked vertically (`294px` wide each); honest R2 unavailable note verified in Banner modal; zero public/private toggle for new public user.
- **Community & Canonical Profile (`390×844`):** Compact `"My Profile"` strip measured `63px` tall, placing `Web | Chats | Groups` at `y = 139px`; typing `"tarun"` rendered compact `Researchers` rows without giant search banner; tapping `@tarun_grqr` opened `PublicProfileSheet` with banner + avatar + `Follow` -> `Following` (`1 Followers`) -> Followers sub-drawer listing `@maya_grqr` -> `?view=community&profile=tarun_grqr` deep-link reload reopened `@tarun_grqr`.
- **Telegram-Like Messenger (`390×844` & `1440×900`):**
  - Mobile Inbox showed only inbox; tapping conversation opened full-screen thread (`inboxHiddenOnPhone: true`, `mobileNavHidden: true`, `composerVisibleInViewport: true`).
  - Account B sent `"Hi"` -> bubble measured **`95px × 52px`** with inline time & `✓`, zero `"Sent to server"`, zero permanent Mute/Hide/Block buttons.
  - Account A saw unread badge `1` and preview `"Hi"` -> clicked Accept -> replied `"Hiw"` -> tapped Chat Header `@maya_grqr` -> opened canonical profile -> closed profile -> remained inside active chat thread -> opened contextual menu -> edited to `"Hiw!"` -> retracted -> rendered **1 single compact `"Message retracted"` tombstone** -> Back returned to Inbox with unread cleared and `.x1-mobile-nav` restored.
  - Desktop `1440×900` confirmed 2-pane Inbox + Thread layout with mobile back arrow hidden and `0px` horizontal overflow.
- **Logged-Out Guest Authorization:** Public profile `@tarun_grqr` readable; `/api/x2/social?view=home` returned `HTTP 401`.
- **Visual Polish Screenshots Inspected:** `x54-polish-settings-390.png`, `x54-polish-community-390.png`, `x54-polish-profile-390.png`, `x54-polish-chat-390.png`, `x54-polish-chat-1440.png` (captured in isolated browser workspace using synthetic identities only).

---

## 7. Honest Known Limitations & Unresolved Blockers

1. **Cloudflare R2 Disabled (`403 code 10042`):** Custom profile photo/banner binary uploads remain disabled at the Cloudflare account level. Built-in 50 avatar presets and 8 obsidian/eclipse banner presets remain fully operational, and the UI truthfully reports that custom uploads are unavailable rather than faking upload flows.
2. **Commercial Market Data & Retail Broker Isolation:** Public market surfaces continue to use official keyless public feeds (ECB daily FX, US Treasury daily par yields, USGS earthquakes, NASA EONET). Retail Angel One SmartAPI credentials remain strictly gated to owner-only private inspection and are never redistributed as public quotes.
3. **No Fake Social Features:** Deliberately omitted fake Snapchat Stories, disappearing snaps, snap-scores, typing indicators, live online presence dots, or unbacked delivery receipts until real backend infrastructure exists.
4. **No End-to-End Encryption Claimed:** Direct messages are protected via HTTPS/TLS in transit and D1 access-control/block enforcement server-side; Settings discloses this transparently.

---

## 8. Rollback Plan (< 1 Minute, Zero D1 Risk)

Because X5.4 introduces **zero D1 schema migrations** and preserves full backward compatibility with all existing tables (`drizzle/0000`–`0009`):

1. **Cloudflare Dashboard Rollback:** Open **Workers & Pages → `strategic-souls` → Deployments**, select X5.3 Version `#14` (`32d1f33e-742f-46ab-bf66-abac7f06a1c0`), and click **Rollback to this version**.
2. **CLI Fallback:** `npx wrangler rollback --name strategic-souls`.
3. **Post-Rollback Verification:** Re-check `GET /api/release`, `GET /api/markets/public`, and `GET /api/x1/workspace` (`401`). Never drop or reset D1 `ss`.

---

## 9. Deployment Verification Record

_To be populated immediately after pushing commits, checking CI/Workers Builds trigger `0727e904-48ad-4e75-9b26-1d2123ec5063`, and verifying live `/api/release` and smoke tests (or documenting `CODE READY, NOT DEPLOYED` if credentials block deployment)._

---

## 10. Final Acceptance Checklist

- [x] Only redundant dashboard header caption removed; nine customizable market cards preserved.
- [x] New Soul name BLANK; formula selection never supplies/overwrites name; blank rejected; old names preserved.
- [x] Community landing is compact; own public-profile preview doesn't dominate first viewport.
- [x] Public Body IDs tap through to correct attractive, original social profile from every relevant place.
- [x] New profiles/new ordinary Web Souls public by design without a privacy chooser; legacy private data kept private until consent.
- [x] Instagram/Snapchat-inspired but original banner-avatar-bio-stat-follow-message-profile composition.
- [x] Telegram-like compact messenger: modern inbox, left/right small bubbles, tidy status/timestamps, contextual action menus, persistent real messages.
- [x] No giant Mute/Hide/Block buttons or `Sent to server` paragraphs under every bubble.
- [x] Android keyboard, safe area, bottom nav and scroll work without hiding composer.
- [x] Account editor displays clean mobile layout; Age/Gender are not awkward two-column fields.
- [x] No added fake prices, stories, read receipts, online status, private data leaks or false encryption claims.
- [ ] Tests pass; source checks pass; screenshots checked; real deployment verified or accurately disclosed as blocked _(deployment step in progress)_.
