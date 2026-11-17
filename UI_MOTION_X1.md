# X1 silver eclipse and adaptive motion

This is a presentation-only changeset against functional checkpoint `fcec9d03b51f39915f2e74055b375e2718615d2a`. It adds no market values, request flows, account rules, storage tables, pricing, permissions, or new dependencies. The lead owns source integration, actual browser QA, and same-Site publication.

## Root integration

Import `components/x1/motion.css` after the canonical X1 theme, and mount the component once at the shared app root:

```tsx
import EclipseIntro from "./eclipse-intro";

<EclipseIntro ready={appIsReady} />;
```

Props: `{ready: boolean; preview?: boolean; onDismiss?: () => void}`. Set `ready` from actual app readiness, including a usable empty/error view; do not wait for every external feed. The component returns nothing during SSR if already ready. An explicit `preview` can bypass the session preference for local QA, but cannot override readiness or reduced motion. For a full storyboard capture mount a QA instance with `ready={false}` and `preview`; this is not a normal navigation trigger. The component never reads URL parameters or initiates preview itself.

Use this early inline head guard before paint (lead integrates with the app's existing CSP/header strategy):

```js
try {
  if (
    sessionStorage.getItem("ss-x1-intro-seen") !== null ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    document.documentElement.dataset.x1IntroSeen = "true";
} catch {
  // Storage is optional; the CSS media query and lifetime remain effective.
}
```

The stylesheet hides `html[data-x1-intro-seen]` overlays before paint, with a narrowly scoped exception for explicit preview. A denied session-storage write is harmless. The one non-sensitive preference is `ss-x1-intro-seen=1`; no account, market, or private record is stored. If session storage is unavailable, the document attribute still prevents repeat intros within the current document; a later full document navigation cannot persist a preference the browser refused to store.

## Storyboard and failure behavior

Silver SVG eclipse limb and faint monochrome corona emerge during the first 500 ms. The existing V-dot mark and stacked identity fade in from 500 ms; the actual `STRATEGIC SOULS X1` heading enters from 700 ms in the canonical headline blue. The inspected source identity uses `V<span>·</span>`, 44px mark, 41px width, -6px tracking, and the existing 21px/1.08 stacked wordmark. This preserves those proportions and text, introducing no substitute logo file or distorted mark. Identity remains silver; only the separate `h1` uses blue.

The app is usable underneath throughout. Pointer events pass through the overlay, except its immediately available 44px Skip introduction button. Pointer-down, any keyboard action, wheel/scroll, hidden tab, changed reduced-motion preference, or `ready=true` dismisses. Listeners never prevent default, cancel propagation, change body overflow, focus an element, or make app content inert. Dismissal takes 90 ms; the normal maximum is 1,050 ms. There is no percentage, fake data-loading stage, loop, audio, canvas, or WebGL.

CSS independently hides the intro by 1,100 ms even if React/hydration fails. Browsers without CSS-animation support keep it hidden; if the stylesheet itself fails, the component's inline `pointer-events:none` prevents an input trap and no black background is applied inline. Reduced motion bypasses the intro entirely. Its media rule disables optional first-party animation/transitions and exposes completed check lines statically.

All colors come from the canonical map: `--x1-bg`, `--x1-divider-strong`, `--x1-text-primary`, `--x1-text-secondary`, and `--x1-title-blue`. No literal color declarations or second palette exist in this file.

## Opt-in integration classes

| Class                | Purpose                                                       | Timing                               |
| -------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `x1-dashboard`       | Mount after major-dashboard selection; opacity + 8px movement | 220 ms                               |
| `x1-tab-panel`       | Small tab-panel reveal                                        | 150 ms                               |
| `x1-card-enter`      | First-mount visible cards, not all market rows                | 210 ms, 30 ms steps capped at 100 ms |
| `x1-modal-enter`     | Dialog/drawer surface entry                                   | 180 ms                               |
| `x1-motion-button`   | Optional press feedback                                       | 120 ms                               |
| `x1-save-confirmed`  | Wrapper around a persisted-save check SVG                     | 460 ms                               |
| `x1-super-confirmed` | Icon-only persisted Super-on reaction                         | 300 ms                               |
| `x1-super-cleared`   | Icon-only persisted Super-off response                        | 220 ms                               |

Attach confirmation classes only after the server confirms persistence. Do not use them for an optimistic count, pending save, failed write, changing financial price, fake progress, or recurring quote refresh. Keep persisted success text immediately readable; only its decorative check/icon moves. Do not key/remount cards on each refresh. Override `--x1-stagger` only on small visible card sets; the CSS clamps delay to 100 ms.

Example check markup (lead supplies it at the confirmed-save point):

```tsx
<span className="x1-save-confirmed" aria-label="Saved">
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      className="x1-save-check-line"
      pathLength="1"
      strokeWidth="1.6"
      d="m5 12 4 4L19 6"
    />
  </svg>
</span>
```

## Verification and required browser QA

`tests/x1-motion.test.mjs` executes the exported pure policy across all ready/seen/reduced-motion/preview combinations and renders the actual TSX component using the existing ReactDOM server package. It checks ready-state omission, immediate skip, nonblocking attributes, original wordmark content/proportions, session-guard/CSS failure deadline, palette/token restrictions, reduced motion, cleanup contracts, and bounded timing. These are local tests, not a claim that a browser animation or low-end phone passed.

Before release the lead must record actual screenshots of local cold entry and explicit preview, repeat-session bypass, immediate readiness, Skip and keyboard/pointer dismissal, reduced motion, hidden/resumed tab, failed/slow network, 320px and desktop layouts. Check that the app still responds while the intro exists, that no opaque overlay remains after 1.1 seconds with JS disabled, that focus never jumps, and that the session intro does not return on dashboard navigation. Exercise server-confirmed save and Super states and their failure paths. Record actual performance observations separately; no Lighthouse, FPS, LCP, INP, CLS, or browser-pass claim is made here.

Executed locally on Windows with Node v22.16.0, 17 November 2026:

```text
node --experimental-strip-types --experimental-vm-modules --test tests/x1-motion.test.mjs
8 tests / 8 pass / 0 fail / 0 skip; exit 0

node node_modules/typescript/bin/tsc --noEmit
exit 0

node node_modules/eslint/bin/eslint.js components/x1/eclipse-intro.tsx tests/x1-motion.test.mjs
exit 0
```

The module also retains its own session claim during React development effect replay, while a genuinely fresh mount honors the stored one-shot preference. Real browser lifecycle, screenshots, and performance remain lead QA, rather than inferred from these server-side checks.
