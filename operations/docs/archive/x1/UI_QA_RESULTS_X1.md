# X1 founder visual QA results

Release: **X1 — FOUNDER-APPROVED VISUAL POLISH**. Executed 17 November 2026; exact production receipt is delivered in `DEPLOYMENT_REPORT.md` alongside the source archive. No duplicate Site or new product version identity was created.

| Locked choice | Implementation assessment | Code and actual evidence |
|---|---|---|
| 1. Balanced institutional / calm / research-social direction | PASS | Shared shell and components; Global source-first compact grid, Strategy wider editor spacing, Community reading measure. `final-global-1440.jpg`, `final-strategy-1440.jpg`, `final-community-1440.jpg` |
| 2. Matte black, silver UI, blue headings only | PASS | One canonical token map; 787 resolved colour uses, 11 heading-only blue uses; browser computed styles and screenshots inspected. `app/globals.css`, `app/x1.css`, `app/v3.css`; iframe exception documented |
| 3. Geometric premium type and original wordmark | PASS | Existing licensed Space Grotesk/Inter/IBM Plex Mono; original V-mid-dot proportions retained; ordinary metadata >=12 px; `app/layout.tsx`, `public/fonts`, screenshots |
| 4. Silver eclipse entry | PARTIAL verification | Implemented once/session, immediate Skip, ready exit, reduced-motion bypass, CSS fail-safe. Eight actual policy/SSR/motion tests pass and reduced-motion bypass observed. Normal-motion visual capture not established |
| 5. Adaptive transitions | PASS implementation | 220 ms major dashboard entry, fast routine controls; `components/x1/motion.css`, `workspace.tsx`; reduced-motion override. Physical-device smoothness remains unverified |
| 6. Expressive, honest microinteractions | PASS implementation | Card entry, server-confirmed save check and Super icon pulse; actual scan/revision/Super writes verified. No fake progress/presence/engagement. `shared.tsx`, `community.tsx`, scan/error/editor screenshots |
| 7. Balanced density / progressive disclosure | PASS | Three main dashboards and existing subviews preserved; 27 width measurements without page overflow; separate History/Graveyard and expanded provenance remain. `final-layout-checks.json` |
| 8. Real grayscale satellite Earth, moderate interaction | PASS implementation; device profiling open | NASA-textured WebGL sphere, 24 venues/21 clusters, bounded control/reset, lazy/adaptive textures and searchable static/list fallback. Globe screenshots and report; physical FPS/heat/GPU-loss tests not claimed |

The initial 320 px sparkline overlap was corrected into a separate 30 px chart lane and retested. Expanding the palette scan to the motion stylesheet found an overly broad eclipse-title selector; it is now explicitly `h1.x1-eclipse-title`. Fallback controls now disable rather than suggesting that the static image rotates. No backend/schema/API file changed during visual work relative to the functional checkpoint.

All three dashboards were inspected at 320/360/375/390/430/768/1024/1280/1440. Global captures exist at every width; Strategy/Community at representative phone/tablet/desktop widths, plus editor/history/results/errors/Supers/list/fallback captures. The nine-width tests and all 164 automated tests pass. Typecheck and production build pass; application lint has zero errors and one documented local-image advisory.

Final Lighthouse: 97 performance / 100 accessibility / 100 best practices, LCP 2.284 s, CLS 0.003309, TBT 9 ms at 2026-11-17T15:48:12.523Z. Conditions and limitations are in `TEST_REPORT.md`; this is not field INP/p75 certification. The audit report and actual captures are delivered, not generated mockups.

Open verification: reliable browser 200% zoom state, physical Android/on-screen keyboard, forced colours/full screen reader, normal-motion eclipse capture, measured globe FPS/CPU/memory/heat and production multi-person collaboration. Data/feed and external-auth blockers are product limitations, not concealed visual passes.
