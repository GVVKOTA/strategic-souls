# X1 design system

The final founder directive supersedes the functional checkpoint's earlier mint palette. One canonical `:root` token map in `app/globals.css` defines background **#070809**, surfaces **#0E1012 / #15181B / #1B1F23**, dividers **#343941 / #535A64**, and silver text **#E0E4E8 / #C2C8CF / #A4ADB6 / #87919B**. Blue **#7AB8FF / #A2CFFF** is restricted to actual H1/H2/H3 title text. All ordinary copy, controls, links, numbers, errors, focus outlines, badges, charts and exchange markers use silver/gray. Legacy token aliases resolve to these neutral values. Third-party TradingView frame internals retain provider styling and are isolated viewing surfaces, not scanner data sources.

Locally hosted Inter, Space Grotesk and IBM Plex Mono retain their SIL Open Font License notices. Space Grotesk headings use a fluid 26–35 px primary ramp, body prose 15–16 px and ordinary metadata at least 12 px. The original V-mid-dot wordmark and small embedded brand caption are preserved. Static token math has a lowest normal-text contrast of **5.173:1** across canonical surfaces; full WCAG compliance is not claimed from token checks alone.

Global uses compact sourced cards and contained tables; Strategy has wider rule/editor spacing; Community uses comfortable reading measure and attributed revisions. Dashboard navigation uses a 220 ms fade/8 px entry; routine controls remain direct. A skippable silver eclipse appears at most once per browser session, exits immediately on readiness, and bypasses under reduced motion. Persisted saves and Supers receive a restrained silver flourish only after server confirmation. The real globe uses historical NASA satellite textures graded to grayscale by the shader, a bounded camera, an approximately 80-second rotation and a static/list fallback. `UI_CHANGELOG_X1.md`, `UI_MOTION_X1.md` and `GLOBE_X1_REPORT.md` specify the final implementation.

Desktop uses one fixed three-section sidebar, a shared search/source header, useful data cards, a globe with a companion private workspace column, and contextual subnavigation. Mobile uses the same three dashboards in a persistent safe-area bottom bar. Panels collapse into one column; tables scroll inside their bounded region, never the entire page. Forms have visible labels; dialogs use native modal focus and Escape handling. Drag controls also have keyboard-accessible up/down buttons. A 2D/list route covers every globe venue.

## Before-state audit

Actual deployed version 9 screenshots were captured at 360×800, 390×844, 430×932, 768×1024, 1280×800 and 1440×900 before UI changes. Strengths: retained GVV identity, local fonts and private archive. Defects: five main links plus six duplicate research menus, oversized question/creation panels before daily usefulness, profiles/Teams presented ahead of actual connected implementation, no exchange globe and no numerical feed. Some secondary metadata is very small.

## X1 changes and review

Three locked dashboards replace the duplicated menu hierarchy. Global puts source observations before the globe. The globe is bounded and offers pause, List and compatibility controls. Empty states lead to real save actions. Source event dates differ visibly from retrieval times. Strategy exposes exact method and UNKNOWN instead of hiding missing data. Community places identity, group workspace and exact-revision discussion in one view.

Screenshots, viewport widths, overflow checks and review findings are recorded in `X1_TEST_REPORT.md`. Captures are actual browser output. Device emulation is not a physical Android test, and WCAG 2.2 AA remains a target until full audit evidence exists.
