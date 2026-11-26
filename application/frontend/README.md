# Frontend Ownership Area (`frontend/`)

**Owns:** Everything visitors and signed-in researchers see, click, read, and interact with in Strategic Souls (`X5.5`).

---

## 1. What Belongs Here vs. What Does Not

### What Belongs Here
- Workspace UIs under `frontend/features/` (`global/`, `strategy/`, `community/`, `account/`, `auth/`, plus retained `legacy/`).
- Shared shell, navigation, search, TradingView widget, and motion controls under `frontend/components/`.
- Pure client helpers (`frontend/lib/`).
- Canonical CSS tokens (`frontend/styles/globals.css`), workspace stylesheets (`frontend/styles/x51.css`, `x1.css`, `x2.css`, `ss-v3.css`), and feature-scoped CSS (`scanner-x54.css`, `profile.css`, `messenger.css`, `account.css`).

### What Does Not Belong Here
- Framework route entrypoints (`app/**/page.tsx`, `app/layout.tsx`, `app/api/**/route.ts`) — these remain in [`application/app/`](../app/) for Vinext / Next.js App Router file-system discovery.
- Static files served directly at `/` (`/gvv-approved.jpg`, `/fonts/*`, `/avatars/*`, `/data/earth-*`) — these remain in [`application/public/`](../public/).
- Server-only database queries, secret readers, PBKDF2 auth logic, or canonical scan/math engines — these belong in [`backend/`](../backend/) and [`database/`](../database/).

---

## 2. Key Entrypoints & Directory Map

| Path | Responsibility |
| --- | --- |
| `frontend/components/workspace/workspace.tsx` | Primary application shell, top bar, Notification Bell, Universal Search trigger, `?profile=` deep-linking, and workspace switcher (`Global` · `Strategy` · `Community`). |
| `frontend/components/workspace/global-menu.ts` | Locked 4-item Global three-dot menu contract (`Strategic Dashboard`, `Market Intelligence / Economic Calendar`, `Heatmap`, `Strategic Globe`). |
| `frontend/components/workspace/eclipse-intro.tsx` | Bounded session intro (`<=1050ms` React / `1100ms` CSS safety escape, skip-safe, reduced-motion aware). |
| `frontend/features/global/dashboard.tsx` | **Global workspace:** Exact 4-block Overview (`MarketOverviewGrid` → compact `My Portfolio` & `Watchlist` → `StrategicGlobe` → `EconomicCalendar`) plus focused subviews. |
| `frontend/features/global/market-grid.tsx` | Centered `Strategic Dashboard` title + 9 customizable market cards (3×3 desktop/tablet, 2-col + full-width 9th card on `<=520px`). |
| `frontend/features/global/strategic-globe.tsx` & `globe-canvas.tsx` | Enlarged `1.0×`–`5.0×` perspective WebGL 3D Earth (`Set<WebGLBuffer>` lifecycle, 15s texture timeout, reduced-quality cloud skip, `prefers-reduced-motion` & `data-motion="minimal"` support). |
| `frontend/features/global/economic-calendar.tsx` & `daily-pulse.tsx` | Official statutory Economic Calendar (zero `HIGH/MEDIUM/LOW` impact badges; never synthesizes times) and `MARKET VOX` (`NIFTY & Gold community vote`). |
| `frontend/features/strategy/workspace.tsx`, `scan-helpers.ts` & `controls.tsx` | **Strategy workspace:** Full-width `[Soul Scan \| Formula Lab]` tabs, blank-by-default Soul name input, Classic (50 presets) & Advanced (`Discover` / `Build` / `Draw`), pure formatting/CSV/parameter helpers (`scan-helpers.ts`), compact results, and standalone `GRAVEYARD` heading (zero subtitle). Lazy-loads `formula-lab.tsx` and `draw-canvas.tsx`. |
| `frontend/features/strategy/evidence-charts.tsx` | Honest SVG coverage bar & Wilson 95% confidence-interval charts (`Insufficient verified observations` when sample gates fail). |
| `frontend/features/community/research-network-shell.tsx` | **Community (`Soul Network`) shell:** Full-width 3-column `Soul Feed \| Chats \| Rooms` tabs, compact `"My Profile"` strip, debounced public researcher search, and lazy-loaded `SocialWorkspace` (`Chats`) and `dashboard.tsx` (`Rooms`). |
| `frontend/features/community/public-profile-sheet.tsx` | Canonical `PublicProfileSheet` modal with `Tab`/`Shift+Tab` focus trap, abort/sequence guards, `Souls \| Followers \| Following` drawers, `Share profile`, and `Copy to Drafts`. |
| `frontend/features/community/messenger/` | Modular Telegram-like `Chats` (`chat-inbox.tsx`, `chat-header.tsx`, `conversation-view.tsx`, `message-bubble.tsx`, `chat-composer.tsx`, `types.ts`) with monotonic message merging and cross-thread abort/sequence guards. |
| `frontend/features/account/` & `frontend/features/auth/` | `settings-view.tsx`, `account-quick-panel.tsx`, `avatar-studio.tsx`, `avatar-badge.tsx`, and standalone D1 email/password `auth-panel.tsx`. |
| `frontend/styles/globals.css` & `frontend/styles/x51.css` | Canonical 6-color text tokens (`globals.css`) and active `X5.1`–`X5.5` component styling (`x51.css`). |

---

## 3. Non-Negotiable Frontend Invariants

1. **Never alter the 6 canonical UI text color hex tokens** in `frontend/styles/globals.css` (`--x1-text-primary: #E8EDF2`, `--x1-text-secondary: #CAD3DC`, `--x1-text-tertiary: #B9C3CE`, `--x1-text-muted: #A7B1BC`, `--x1-title-blue: #76C0FF`, `--x1-title-blue-alt: #94D0FF`). Enforced by `tests/unit/x1-palette.test.mjs`.
2. **Preserve the Global 4-block Overview & 4-item three-dot menu**; never reintroduce a 2D geographic world map or visible Globe `List` switcher. Enforced by `tests/unit/x53-terminal-globe-evidence.test.mjs`.
3. **Preserve the standalone `GRAVEYARD` heading (zero subtitle)** and clean brand vocabulary (`Body ID`, `Soul Feed`, `Soul Network`, `Rooms`, `Publish Soul`, `Copy to Drafts`; zero visible `@BodyID` or `Cloudflare D1` jargon). Enforced by `tests/unit/x55-language-and-ux.test.mjs`.

---

## 4. How to Verify Changes (from `application/`)

```powershell
node tooling/check-x2-release.mjs
node tooling/run-framework.mjs build
```
