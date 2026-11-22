# Frontend Ownership Area (`frontend/`)

**Owns:** Everything users see, click, read, and interact with in Strategic Souls (`X5.3`).

## Directory Map

| Path | Responsibility |
| --- | --- |
| `frontend/features/global/` | **Global workspace:** 4-block `Strategic Dashboard` & focused views (`dashboard.tsx`), 9-card customizable market grid (`market-grid.tsx`), enlarged `1.0×`–`5.0×` perspective 3D Earth (`strategic-globe.tsx`, `globe-canvas.tsx`), redesigned `Economic Calendar` (`economic-calendar.tsx`), `Market Intelligence` (`market-intelligence.tsx`), `Market Vox` (`daily-pulse.tsx`), `Heatmap` / NSE Sector Explorer & Asset Comparison (`sector-explorer.tsx`), `Portfolio Allocation` (`portfolio-allocation.tsx`), Asset Terminal (`asset-terminal.tsx`), and owner-only Data Control (`data-control.tsx`). |
| `frontend/features/strategy/` | **Strategy workspace:** Full-width `[Soul Scan \| Formula Lab]` tabs, Classic (50 presets) & Advanced (`Discover` / `Build` / `Draw`), compact scan results with collapsed-by-default match accordions, prominent `GRAVEYARD` archive (`workspace.tsx`, `controls.tsx`), truthful SVG coverage & empirical probability charts (`evidence-charts.tsx`), interactive pattern drawing (`draw-canvas.tsx`), and standalone Formula Lab (`formula-lab.tsx`). |
| `frontend/features/community/` | **Community workspace:** Body IDs (`@handle`), shared Souls, private/discoverable groups, pinned research, opt-in DMs, bookmarks, moderation (`research-network-shell.tsx`, `dashboard.tsx`, `social-workspace.tsx`, `social.css`). |
| `frontend/features/account/` | Account quick panel, 50-avatar studio, profile settings & QR identity (`account-quick-panel.tsx`, `avatar-studio.tsx`, `settings-view.tsx`). |
| `frontend/features/auth/` | Standalone email/password registration & sign-in panel + optional Google OAuth (`auth-panel.tsx`). |
| `frontend/features/legacy/` & `frontend/features/v3/` | Retained authenticated `/legacy` notebook and optional Supabase-gated V3 preview UI. |
| `frontend/components/workspace/` | Shared shell (`workspace.tsx`), exact 4-item Global menu contract (`global-menu.ts`), `EclipseIntro` (`eclipse-intro.tsx`), universal search (`universal-search.tsx`), private ticker (`private-ticker.tsx`), `shared.tsx`, `globe-visual.css`, `motion.css`. |
| `frontend/components/ui/` | Accessible shadcn/ui primitives. |
| `frontend/hooks/` & `frontend/lib/` | Shared hooks (`use-mobile.ts`) and self-contained QR SVG encoder (`qr-svg.ts`). |
| `frontend/styles/` | Canonical tokens (`globals.css`), X5.1/X5.2/X5.3 styles (`x51.css`), legacy styles (`x1.css`, `x2.css`, `v3.css`), and vendored Tailwind utilities. |

## Non-Negotiable Frontend Rules

1. **Never change canonical UI text color hex tokens** in `frontend/styles/globals.css` (`--x1-text-*`, `--x1-title-blue*`). Enforced by `tests/unit/x1-palette.test.mjs`.
2. **Preserve the X5.3 Global 4-block Overview & 4-item three-dot menu**; never reintroduce a 2D geographic world map or visible Globe `List` switcher.
3. **Keep `EclipseIntro` & `motion.css` contracts intact** (`<=1050ms` React / `1100ms` CSS safety escape, once/session, skip-safe, reduced-motion safe).
4. **Never display fabricated prices, LIVE badges on stale/date-only data, fake probabilities, or HIGH/MEDIUM/LOW calendar impact badges.**
