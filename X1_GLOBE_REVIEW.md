# X1 independent globe review

Review date: 17 November 2026, 19:45 IST. Reviewer: the bounded Codex community/review agent, independent of the lead implementing the renderer. Scope: read-only inspection of `components/x1/globe-canvas.tsx`, `lib/x1/globe.ts` and the surrounding Global/List integration; pure geometry tests were added in `tests/x1-globe.test.mjs`. The reviewer did not operate Chrome or modify renderer source.

Initial source SHA-256: globe math `F501BFE4FDFF6A2BF3605AFF6EF523CBBEFECF6A9A98AE9BB2C5185C4B48C229`; canvas `41EBF39D840943BF889F6AAABF74C18CA5C9C01F6ADE23BE64AECE1510884B9A`. Findings below describe this review snapshot. Subsequent fixes require reinspection and rerunning tests; they are not presumed applied.

## Follow-up disposition — 20:16 IST

The reviewer reread the changed source and reran the geometry suite. **All 8 geometry tests pass; exit code 0; approximately 0.59 seconds.** Reviewed source hashes: math `2168B5B3EAC1DA37639CBB42777642E9C9E58B2E3A855766FD972449C08CA625`; canvas `6C3E23B0345DFFA9F89628075BA985CDE0BC474D0604CFD00A4C7FD486DC7CD3`.

| Initial issue | Follow-up source/test status |
| --- | --- |
| Antipodal path loses normalization | **Resolved.** A deterministic orthogonal plane and normalized samples preserve the radial envelope and endpoints. Exact and near-antipodal tests pass. |
| Reversed smoothstep edges | **Resolved in source.** The mask uses `1.-smoothstep(.28,.5,d)`. |
| Premultiplied compositor alpha | **Resolved in source.** Colour and alpha use separate blend factors with `ONE` for source alpha. |
| Automatic reduced-motion selection easing | **Resolved in source.** Reduced motion snaps a selection to its orientation; autorotation requires normal motion permission or an explicit user Play override. |
| Failure does not run effect cleanup | **Resolved in source.** `failure` is an effect dependency and failed state skips renderer initialization. **Retry remains partial:** a real failure never resets within the component, so toggling compatibility mode cannot yet recreate WebGL. |
| Allocation errors bypass fallback | **Improved in source.** Shaders are registered before compilation; initial buffer exceptions release resources; a safe draw wrapper converts JavaScript exceptions into fallback. **Remaining limit:** `bufferData` GPU allocation failures can report a WebGL error rather than throw; no explicit allocation-time `getError()` check is present in this snapshot. |
| Pointer listener cleanup / identity | **Cleanup and pointer-up guard resolved in source.** Pointer cancellation and lost capture use named removable listeners. **Multi-pointer handling remains partial:** a new pointer down can replace the active pointer and an unrelated cancellation can clear it. |
| Missing wheel zoom | **Resolved in source.** Wheel zoom is bounded and applies only with canvas focus or Control; ordinary page wheel scrolling remains available. Arrow keys and plus/minus keys are also implemented. Physical input behavior remains a browser check. |
| Preserved drawing buffer cost | **Resolved in source.** `preserveDrawingBuffer` is false. No unsupported performance gain is claimed. |

No new geometry regression was found within the tested inputs. The residual retry, multi-pointer and GPU-error paths were reported to the lead. The lead also plans to raise the elapsed-time clamp from 80 ms to 1,000 ms to preserve the intended 80-second period under frame throttling; visibility resume resets the clock. That pending change was not present in the canvas hash above and needs the lead’s browser timing verification.

## Historical initial findings and rationale

1. **High — antipodal great-circle interpolation loses normalization.** `greatCircle` divides by `sin(angle)` whenever it is nonzero. For antipodes that value is about `1.22e-16`, so cancellation creates a path that drops through the sphere or bulges far above its designed radius. The independent test reproduced a radius `0.4987417315` where the intended radius was `1.0211943442`. The midpoint of `(40°,20°) → (-40°,-160°)` had an unnormalized base-vector norm `1.6007810594`. Use a numerically stable plane for coincident/near-antipodal endpoints and normalize each interpolated direction. No live financial meaning is attached to these arcs.

2. **High — point alpha uses undefined `smoothstep` edge order.** The fragment shader calls `smoothstep(.5,.28,d)`. The first edge is greater than the second. Use `1. - smoothstep(.28,.5,d)` for the intended decreasing mask. This is a source-level shader defect, not a claim that every currently tested browser displays broken dots. See the [official GLSL ES 1.00 specification, common functions](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf).

3. **High — transparent compositor alpha is inconsistent.** The context defaults to premultiplied alpha. `blendFunc(SRC_ALPHA,ONE_MINUS_SRC_ALPHA)` applies those factors to alpha as well as colour. Against transparent clear, a source alpha of `.28` produces alpha `.0784` while a source red `.58` produces red `.1624`. This can feed RGB greater than alpha into the compositor for arcs outside the sphere. Use separate blend factors for colour and alpha (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA`) or deliberately render an opaque canvas. The [official WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/) documents the premultiplied-alpha requirements; the reviewed latest specification is an editor’s draft.

4. **High — the initial selected venue animates under reduced motion.** `selectedId` initially equals the empty string, so the default selected exchange creates an easing target on first render. Target interpolation runs regardless of `prefers-reduced-motion`. Reduced motion suppresses autorotation but does not suppress this initial automatic camera transition. Jump to the target orientation directly under reduced motion, or initialize the selected orientation without a transition.

5. **Medium — failure does not immediately execute renderer cleanup.** A WebGL context-loss event sets React `failure`, removing the canvas, but the renderer effect depends only on `forceFallback`. Observers, listeners and retained GPU objects remain until a later effect teardown/component unmount. The existing `failure` state also prevents an actual WebGL retry after toggling compatibility view. Tie failure/retry transitions to cleanup and a fresh canvas/context, with a clear fallback if recreation fails.

6. **Medium — resource-allocation errors can bypass the fallback.** Initial buffers and later marker/arc buffers can throw outside the shader-only try/catch. Low-memory `createBuffer()` failure can therefore reach React as an effect/animation error instead of rendering the accessible fallback. A failed shader allocation is also registered for cleanup only after successful compilation. Centralize failure handling, register allocated resources immediately, and release all resources on every failed initialization path.

7. **Medium — pointer lifecycle has gaps.** The anonymous `pointercancel` listener cannot be removed by the cleanup function. `pointerup` does not check that its pointer ID matches the active drag; a second pointer can terminate or select using the first pointer’s drag state. Handle `pointercancel` and `lostpointercapture` with named listeners; ignore unrelated pointer IDs and release capture after the active interaction. The RAF loop also continues while an idle pointer is held even when no frame is dirty.

8. **Medium — wheel zoom is not implemented in the reviewed source.** Explicit plus/minus controls enforce `.8–1.35` bounds, but there is no mouse-wheel handler. If wheel zoom is added, keep it bounded and preserve normal mobile vertical scrolling. The reviewed source did not yet include final canvas touch-action CSS, so touch scroll behavior was not verified.

9. **Medium — preserved drawing buffer adds an unmeasured mobile cost.** The context requests `preserveDrawingBuffer:true`; there is no canvas readback feature in the inspected renderer. Khronos warns this can reduce performance on some platforms. Prefer false unless a concrete requirement and real profiling justify preserving it. This is a performance concern, not a measured regression claim. [WebGL drawing-buffer specification](https://registry.khronos.org/webgl/specs/latest/1.0/).

## Verified math and useful implementation choices

- The CPU `project()` transform agrees with the vertex shader in CSS pixels across portrait and landscape aspect ratios, tested rotations, and supported zoom values. The apparent missing aspect factor in the CPU expression cancels correctly when normalized coordinates become screen pixels.
- Setting yaw to negative longitude and pitch to positive latitude centers every registered exchange without mirroring the globe. Back-side selection is excluded using transformed depth.
- The registry’s 24 venues form 21 markers; New York, Chicago and Mumbai co-located venue pairs are retained. Every identifier survives clustering, the registry is not mutated, and reversing the actual registry order preserves the grouping. The generic degree-threshold clustering is not a global geodesic clustering algorithm: dateline wrap, polar distances and chained near-neighbour order dependence remain future robustness concerns, outside the current co-located seed cases.
- Ordinary great-circle paths have correct endpoints, reversible geometry and the intended `1.014 + .11·sin(πt)` radial envelope. Coincident and almost-coincident endpoint tests pass. The dedicated antipodal test exposes the case requiring repair.
- Geometry is genuinely three dimensional: sphere triangles, transformed coordinates, depth testing and directional lighting. No generated globe image or external 3D engine is substituted for it.
- Static source counts are 4,096 sphere triangles and 5,015 coastline segments in a local 86,007-byte JSON file. The renderer clamps device pixel ratio to 1.5 and requests a low-power context. These are code/artifact counts, not device speed or battery measurements.
- The code has IntersectionObserver and document-visibility pause paths, explicit cancellation on unmount, bounded zoom controls, a separate accessible List view, a labelled 2D compatibility state, and an explicit legend stating arcs mean geography rather than financial flows. The lead must verify those paths in a browser, including after the failure-handling changes.

## Executed tests

Command: `node --experimental-strip-types --test tests/x1-globe.test.mjs`

Initial result: **8 tests; 7 passed, 1 failed; exit code 1; approximately 0.58 seconds.** The initial failure was the antipodal radial-envelope test. Follow-up result after the lead’s correction: **8 passed, 0 failed; exit code 0; approximately 0.59 seconds.** Tests cover cardinal geometry/radius, CPU versus shader projection, all registered venue centering, zoom clamping, co-located clusters, ordinary path endpoints/reversal, coincidence, and antipodes. These tests execute the actual TypeScript math after transpilation.

The reviewer has not tested WebGL execution, GPU-driver failures, pointer input, screen-reader output, mobile scrolling, context recovery, long tasks, frames per second, LCP, INP or CLS in this subtask. Browser results and final re-verification belong in the lead’s `X1_TEST_REPORT.md` and release evidence. No performance target is marked passed by this review.
