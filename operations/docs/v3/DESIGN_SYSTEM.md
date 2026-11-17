# Obsidian Eclipse V3
Implemented in app/v3.css and components/v3. Existing owner styles remain scoped separately.

| Token | Value / role |
|---|---|
| Background | #070A0C |
| Elevated slate | #111C20 |
| Teal structure | #334B4D |
| Interactive mint | #8DCDB4 |
| Secondary text | #B8C6CB |
| Reading text | #E8F0EE |
| Economic downside | Separate rose; decorative mint never implies a market gain |

No gold is introduced. The GVV treatment uses a custom text/glyph composition with the locally licensed font family; no registered-trademark claim is made. Space Grotesk headings, Inter text and IBM Plex Mono tabular figures reuse the existing local OFL assets. No font service request is needed.

Desktop includes an authorized-research search field and a collapsible sidebar. Search carries the entered query into the Soul Library; backend reads still require a verified identity and RLS. On phones, Library search remains available in its own view.

Heading entrance is 380 ms; card transitions approximately 200 ms; tap feedback approximately 130 ms. All selective motion is disabled under prefers-reduced-motion. Quotes never roll or animate.

Phone form controls use 16 px text. Main phone prose uses 16 px; informational labels are generally 12–14 px. Buttons have at least 44 px targets, explicit focus, semantic labels and safe-area bottom navigation. Cards replace compressed tables. The 320 px header was fixed at its actual cause rather than hiding the page overflow.

Browser artifacts cover Home and Idea creation at 320, 360, 390, 430, 768, 1024 and 1440 px, plus populated CSV/scan views at representative widths. Geometry results and JPGs are in the external output package. These are laboratory checks, not complete WCAG certification. Screen-reader, 200% zoom, slow Android/network, reduced-motion runtime and field p75 LCP/INP/CLS remain NOT RUN.
