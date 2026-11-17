# X1 final visual QA plan

Prepared 17 November 2026 for the founder’s matte-black, silver-UI and blue-title directive. Static palette verification has executed; browser checks below remain for the lead, who owns the Chrome session. An unchecked item is not a pass.

## Executed static gate

`node --test tests/x1-palette.test.mjs`: **6 passed / 0 failed**, exit code 0. The test parses actual CSS, resolves aliases, restricts blue to heading colour rules, calculates contrast, checks supporting-type floors and preserves checkpoint geometry. Lowest normal-text token contrast is **5.173:1** on the lightest canonical surface. This does not inspect inline SVG attributes, WebGL pixels, iframe internals, rendered opacity or every browser state.

## Required screen coverage

Capture real images at **320, 360, 375, 390, 430, 768, 1024, 1280 and 1440 px widths**, using task-appropriate heights. Keep exact viewport dimensions with each file. Reuse the same viewport for before/after comparisons. Cover the following views, with a representative narrow-phone and wide-desktop image of every dashboard:

| View | Visual evidence to inspect | Browser result |
| --- | --- | --- |
| Global overview | Compact sourced brief, silver figures, blue title, watchlist priority, contained globe | Pending lead verification |
| Watchlists and portfolio | Table hierarchy, exact identities, manual cost labels, edit controls, contained overflow | Pending lead verification |
| Market Explorer / asset dialog | Currency/unit/source/date labels, honest missing values, accessible dialog | Pending lead verification |
| Soul Scan, Simple and Advanced | Spacious rules, clear editor, focused primary action, source-aware state | Pending lead verification |
| History / Graveyard / Radar | Distinct labels, readable method/results and source states, neutral filters | Pending lead verification |
| Formula Lab | Silver chart lines and labels, line-pattern legend, inputs, assumptions and validation | Pending lead verification |
| Community | Silver identity/avatar, readable research, contributor history, role/visibility labels | Pending lead verification |
| Group editor / comments | Conflict and error states, threaded replies, gray Supers, bounded forms | Pending lead verification |
| Retained `/legacy` and legal routes | Same palette, retained content, title hierarchy, readable forms and tables | Pending lead verification |

## Palette inspection

1. Sample computed foreground and background colours from actual rendered elements. All ordinary text, links, tabs, navigation, buttons, numbers, icons, badges, source labels, focus rings, success/errors and Supers must remain in the neutral palette. Blue is allowed only on actual H1/H2/H3 title text and its title-only span/emphasis children.
2. Inspect blue titles separately from the wordmark, navigation and numerical data. Verify the existing wordmark structure and approved caption proportions; the logo is monochrome. Check loading, hover, selected, disabled, validation and notification states, rather than only the default screenshot.
3. Inspect SVG chart strokes, presentation-attribute labels, WebGL shading/markers, generated textures and fallback imagery separately from CSS. No green, red, gold, purple or blue data line/market marker should survive in first-party content. Chart series should remain distinguishable through written labels, dashes or patterns.
4. Confirm first-party surfaces are matte black/charcoal, without glass blur or glowing panels. Third-party viewing frames retain their permitted branding and source distinction; do not treat their internal colour scheme as proof of first-party numeric data coverage.
5. Use actual screen captures for critique. Record each concrete deficiency and its correction, then inspect the changed view again. Do not use a generated image, static mockup or CSS test result as a screenshot substitute.

## Layout, legibility and input

- Measure page-level `scrollWidth` against the viewport at 320–430 px. Financial tables may scroll inside their labelled containers; the page itself must not overflow horizontally. Check long symbols, URLs, handles, formula errors and translated/long text.
- Verify 15–16 px body prose and at least 12 px ordinary metadata in computed styles. The preserved embedded logo caption is the documented exception. Inspect SVG text attributes and any scaled chart labels separately. Confirm bundled fonts load and fallback text stays readable.
- Check real button/control hit rectangles, 44 px minimum standalone targets, visible silver focus, keyboard navigation, input labels, dialogs, escape/close behavior and focus return. Keep inline prose links usable without forcing paragraph layout changes.
- Keep Global compact and information-first, Strategy spacious around rules and editors, and Community comfortable for reading. Shared headers, panels and controls must still look related.
- Check the stable private brief and fixed market-card geometry while source requests load or fail. Observe layout shifts instead of assuming the fixed CSS eliminates them. Do not undo the checkpoint’s two-column private brief or fixed metric-card heights during colour refinements.
- Test on-screen keyboard layout, safe-area mobile navigation and narrow dialog forms. Verify unavailable controls clearly explain their state.

## Motion, globe and display preferences

- Under reduced motion, initial camera positioning must not animate automatically. Explicit user Play/rotation overrides must remain clear and reversible. Nonessential page/loading transitions should respect the preference.
- Check the WebGL globe, bounded pointer/wheel/keyboard interaction, selected venue, List switch, region filter and fallback. Confirm monochrome rendering and readable legend text. Record actual context-loss/retry behavior and actual failure handling.
- Verify rendering pauses when off-screen or the document is hidden, resumes without a large jump, and preserves an approximately 80-second autorotation period under the tested scheduling conditions. Frame counters are evidence of rendering activity, not proof of 60 fps.
- Inspect high-contrast and forced-colour modes. User-selected system colours can override the standard palette to retain accessibility. Confirm focus and labels remain visible.

## Functional smoke checks after visual changes

Use the existing accepted owner identity and approved private audience. Keep test work visibly identified, avoid new legal acceptance, and do not widen audience for QA.

- Global: open a saved watchlist, add an eligible instrument, refresh and verify persistence; open one sourced asset timestamp; inspect a manual portfolio’s recorded cost without inventing market value.
- Strategy: modify a Simple block, inspect the same canonical Advanced method, run only against actually permitted data, and verify saved method/history. Exercise one real validation error and Formula Lab calculation.
- Community: inspect or create an authorized private group method, save a revision, verify attribution/history, and test a real group-only post/Super/comment only within authorized test scope. Separate local multi-identity tests from production multi-person evidence under the owner-only Site audience.
- Retained routes: open saved owner research and one legal/utility page. Compare record-preservation evidence independently of the visual pass.

## Final evidence gate

Run the appropriate typecheck, lint, full tests and production build after the final changes. Record actual browser console/network failures, accessibility results and measured performance conditions. Rerun Lighthouse/CWV checks because typography and the renderer changed; earlier scores do not certify this visual build. Report measured LCP, CLS and interaction observations with viewport, hardware/emulation and run method; distinguish laboratory measurements from field p75 targets.

Only the lead’s supported Sites publication result and subsequent verification establish an update to the same project/URL/access policy. Store screenshot paths, exact source/build/version and observed workflow results in `X1_TEST_REPORT.md` and `X1_DEPLOYMENT_PROOF.md`. Leave unverified devices, external-user journeys, unavailable feeds and publication blockers explicitly marked.
