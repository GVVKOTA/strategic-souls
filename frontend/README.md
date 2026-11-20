# Frontend Ownership Area (`frontend/`)

**Owns:** Everything users see, click, read, and interact with in Strategic Souls.

## Directory Map

| Path | Responsibility |
| --- | --- |
| `frontend/features/global/` | **Global workspace:** natural full-color 3D WebGL Earth (`globe-canvas.tsx`), 24 exchange clocks, ECB/Treasury overview, skippable research cycle guide, watchlists, manual portfolios (`dashboard.tsx`), Asset Terminal (`asset-terminal.tsx`), owner-only Data Connections drawer (`data-control.tsx`), and `data.css`. |
| `frontend/features/strategy/` | **Strategy workspace:** 3-level Soul Scan (`Beginner` default, `Intermediate` rule tree, `Advanced` formula editor), Preflight, Scan History, Graveyard, Market Radar, Research Glossary (`workspace.tsx`, `controls.tsx`), Formula Lab (`formula-lab.tsx`), and `research.css`. |
| `frontend/features/community/` | **Community workspace:** Body profiles, private/discoverable groups, invites, shared Souls & revision diffs, posts, Supers, comments (`dashboard.tsx`), opt-in Social/DMs/bookmarks/moderation (`social-workspace.tsx`), and `social.css`. |
| `frontend/features/auth/` | Standalone email/password registration & sign-in panel + optional Google OAuth button (`auth-panel.tsx`). |
| `frontend/features/legacy/` & `frontend/features/v3/` | Retained authenticated `/legacy` notebook and optional Supabase-gated V3 preview UI. |
| `frontend/components/workspace/` | Shared workspace shell (`workspace.tsx`), `EclipseIntro` (`eclipse-intro.tsx`), `WorkspaceSkeleton` & helpers (`shared.tsx`), header omni-search (`universal-search.tsx`), scrollable tabs (`scroll-tabs.tsx`), `globe-visual.css`, and `motion.css`. |
| `frontend/components/ui/` | Accessible shadcn/ui primitives (do not edit unless upgrading primitives). |
| `frontend/hooks/` | Shared React hooks (`use-mobile.ts`). |
| `frontend/styles/` | Canonical tokens (`globals.css`), workspace stylesheets (`x1.css`, `x2.css`, `v3.css`), and vendored Tailwind utilities (`vendor/`). |

## Non-Negotiable Frontend Rules

1. **Never change existing UI text color hex tokens** in `frontend/styles/globals.css` (`--x1-text-*`, `--x1-title-blue*`). Improve readability via surfaces, typography scale (`>=14px` interactive controls, `>=16px` mobile inputs), and spacing. Enforced by `tests/unit/x1-palette.test.mjs`.
2. **Never duplicate server calculations or authorization** here; call `/api/*` endpoints backed by `backend/`.
3. **Keep `EclipseIntro` & `motion.css` contracts intact** (`<=1050ms` React / `1100ms` CSS safety escape, once/session, skip-safe, reduced-motion safe). Enforced by `tests/unit/x1-motion.test.mjs`.
4. **Never display fabricated prices, LIVE badges on stale data, or fake loading completion.**
