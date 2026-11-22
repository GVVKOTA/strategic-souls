# X1 final visual change log

17 November 2026. This pass implements the founder’s final visual direction on the existing X1 code. It changes presentation only. Native identity, permissions, provider decisions, calculations, stored records and deployment identity remain the lead’s existing implementation.

## Palette and component finish

The only authoritative colour map is the first `:root` block in `app/globals.css`:

| Role | Token | Value |
| --- | --- | --- |
| Matte background | `--x1-bg` | `#070809` |
| Surface levels | `--x1-surface-1/2/3` | `#0E1012` / `#15181B` / `#1B1F23` |
| Divider levels | `--x1-divider`, `--x1-divider-strong` | `#343941` / `#535A64` |
| Primary / secondary text | `--x1-text-primary/secondary` | `#E0E4E8` / `#C2C8CF` |
| Tertiary / muted text | `--x1-text-tertiary/muted` | `#A4ADB6` / `#87919B` |
| Actual H1/H2/H3 titles | `--x1-title-blue`, `--x1-title-blue-alt` | `#7AB8FF` / `#A2CFFF` |

Existing X1 and retained-route variables are compatibility aliases to this map. Variables historically named `--mint`, `--negative`, `--x-positive` and `--x-accent` now resolve to gray tones. Their names remain compatible with existing components; they no longer introduce coloured states.

Prior mint, green, red, gold, blue-status and purple CSS literals were removed from X1, V3 and legacy/legal global styles. Ordinary text, numerals, links, controls, navigation, icons, sources, focus indicators, Supers, avatars, loading/error surfaces and notifications use neutral tones. Only real H1/H2/H3 title rules use blue. Title spans and emphasis inherit title colour; status badges and SVG icons retain neutral styling. Forced-colour mode uses the user’s system colours for accessibility.

Primary actions use a charcoal fill, silver text and a strong silver border. Secondary actions use a quieter charcoal border. Errors, failed scan states and unknown states retain their written labels and use dashed or dotted borders, rather than relying on a hue. Hidden community posts remain legible with a dashed boundary. Sparkline opacity is restored to 1 so the neutral line remains visible. Root-owned chart markup supplies its legend and line patterns.

Glass blur is disabled. The old decorative globe glow is removed. Remaining gradients are neutral charcoal, and shadows are black. The application is not globally filtered: isolated first-party SVGs and avatars are monochrome, while blue headings retain their intended colour. Third-party iframe content is outside this first-party CSS scope.

## Typography and density

- Actual H1 titles use `clamp(1.6rem, 3vw, 2.2rem)`, approximately 26–35 px at the normal root size. H1/H2/H3 use the existing locally bundled Space Grotesk at semibold weight.
- Body text remains 15–16 px with 1.6 leading. Community post/comment prose uses 15 px and 1.65 leading. Ordinary supporting metadata has a 12 px declaration floor.
- The approved embedded wordmark keeps its existing proportions, including the X1 7 px logo caption. The audit explicitly reports the retained logo-only small-type declarations. No ordinary metadata receives that exception. The mark’s structure, proportions and source assets are preserved by this CSS pass.
- Global keeps its existing compact table and tabular-number treatment. Strategy receives 32 px desktop gutters and 28 px panel padding at wide viewports. Community keeps comfortable prose spacing. Shared controls, panels and field states use the same token system.
- Existing responsive grids, mobile navigation, safe areas, reduced-motion handling and functional class names remain. The checkpoint’s private brief still uses a stable two-column grid with a 44 px minimum height. The fixed market-card geometry remains 190 px on desktop, 210 px on mobile and 155 px for the third mobile card.
- Buttons and relevant standalone controls retain a 44 px minimum target. Inputs use the muted silver border for clearer boundaries. Focus outlines use the primary silver text tone.

## Executed verification

Command: `node --test tests/x1-palette.test.mjs`

Result on 17 November 2026: **6 tests passed, 0 failed; exit code 0; approximately 0.26 seconds.** The parser audit reads the actual CSS, resolves aliases, and checked **776 concrete colour uses across four CSS files**. All **10 blue uses** outside the canonical definitions belong to real heading colour rules. No ordinary metadata declaration below 12 px was found; **16 logo-related small-type declarations** were recorded as explicit preservation exceptions.

Computed WCAG normal-text contrast on the lightest surface `#1B1F23`:

| Foreground | Ratio |
| --- | ---: |
| Primary silver | 12.971:1 |
| Secondary silver | 9.833:1 |
| Tertiary silver | 7.287:1 |
| Muted silver | 5.173:1 |
| Main heading blue | 7.994:1 |
| Alternate heading blue | 10.187:1 |

All four text tones exceed 4.5:1 on every canonical matte surface. These are calculations from the actual token values, not a full browser accessibility certification. `git diff --check` reported no whitespace errors for this pass.

The palette audit also verifies one canonical map, neutral compatibility aliases, no app-wide grayscale, no backdrop blur, the body font declaration and preserved brief/card geometry. It includes the root-owned `components/x1/globe-visual.css` when present, without editing that file.

## Review limits

This pass owns only `app/globals.css`, `app/v3.css`, `app/x1.css`, the palette test and these two UI documents. It did not operate Chrome, change TSX, alter financial logic or publish a Site version. Shader colours, inline SVG attributes, image textures and remaining page metadata are handled by the lead. Two 11 px SVG payoff labels were reported to the lead for a 12 px update; CSS declaration tests do not inspect presentation attributes.

Final screenshots, computed styles, responsive interaction, console errors, Lighthouse/CWV results and exact deployment evidence must be supplied by the lead’s real browser/release checks. Earlier performance scores are not evidence for this changed visual build. Follow `UI_QA_PLAN_X1.md` and record actual outcomes in `X1_TEST_REPORT.md`.
