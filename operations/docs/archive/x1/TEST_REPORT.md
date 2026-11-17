# Strategic Souls X1 test report

Executed 17 November 2026 on Windows, Node 22.16.0, Python 3.13, Chrome 157 and the existing Vinext/Workers/D1 stack. Evidence files are delivered separately in `evidence/`; private database recovery is in `recovery/`, outside source.

## Executed release gates

| Gate | Command / method | Actual result |
|---|---|---|
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | PASS, exit 0 |
| Application lint | `node node_modules/eslint/bin/eslint.js app lib components/research components/v3 components/x1 worker` | PASS, zero errors; one `no-img-element` advisory for the explicitly sized, lazy local static Earth fallback |
| Whole test suite | `node --experimental-strip-types --experimental-vm-modules --test tests/*.test.mjs` | 164 passed, 0 failed, 0 skipped; 3.89 s final regression run |
| Production build | Official Sites `scripts/build-site.mjs` | PASS, production Worker/client output generated |
| Local D1 migrations | Wrangler `d1 migrations apply ... --local` | All six migrations applied in the isolated local database |
| Recovery | Nine-table logical capture, isolated SQLite integrity check and read-only reopen | PASS; separate reads, not atomic/provider-managed; hosted restore not run |
| Dependency audit | Pinned package audit at functional checkpoint | 0 high, 0 critical, 3 moderate; no new application dependency added for visual work |
| Visual integrity | `git diff --name-only fcec9d03b51f39915f2e74055b375e2718615d2a -- lib db drizzle app/api` | Empty: final visual override did not alter the tested backend, schema or API files |

The 164 tests comprise 66 retained tests, 22 scan/math, 22 data/registry, 12 Community, 8 globe geometry, 20 private workspace and 14 palette/motion tests. Numerical coverage includes 80 Simple/Advanced equivalence cases and 48 IV recoveries. Integration tests execute actual migrations/repositories and cover tenant denial, concurrent revisions, Super uniqueness, invitation identity/expiry, exact-revision publication, scan retries, ledger ordering, oversells, snapshots and archive restore. These are not production multi-person browser tests.

Two temporary failures were corrected: the expanded palette audit initially rejected an unqualified eclipse class selector, now explicitly `h1.x1-eclipse-title`; a direct motion test command initially omitted Node's required VM-module flag. The authoritative command above passes. The earlier globe antipodal failure and Workers-incompatible `redirect: 'error'` behavior were corrected and have regressions in the passing suite.

## Actual browser workflows

The production build runs on loopback Wrangler with local D1. A separate loopback proxy supplies a fixed fake `x1-local-test` identity; it is outside source and is not deployed. Local QA content is visibly named `Local QA`. No test holding, fictitious transaction, Body engagement or local consent record is copied to production.

- Global: private watchlist created, ECB EURUSD added, saved list survives reload; manual INR portfolio with two test units at INR 100 reports INR 200 acquisition cost and INR -200 recorded cash, without inventing deposits or market value. Source detail, exact source date, list search, co-located New York venues, reset, static Earth compatibility and WebGL restoration were exercised.
- Strategy: Simple canonical method and Advanced editor inspected. `eval(close) > 0` yields `Unknown function: eval. (line 1, column 5)`; no run is saved for invalid input. A real ECB daily scan saved `all((rsi(close, 14) < 40))` with 13 instruments, 9 PASS, 4 FAIL and 0 UNKNOWN. Its exact source snapshot hash is `600b94b0abe7df6e26b5ad674264c074db5f99beda750e8a2c9088d428b47e0b`. History survives reload. This is a current filter, not a point-in-time historical backtest.
- Community: private Body/group/method and revision-one group post survived reload. A second attributed revision retained the first revision and the post's original content. A real server-confirmed Super toggled 1 → 0 → 1. An existing local comment remained. Group editor, version history and mobile profile controls were inspected.
- Globe: actual WebGL canvas rendered the grayscale satellite sphere, markers and geographic arcs; 24 venues form 21 city clusters. List search `New York` returns NYSE and Nasdaq independently. Actual reduced-motion state pauses initial autonomous movement. Static NASA Earth and list parity are functional. An explicit-Play session measured 188.082 seconds and a rotation equivalent to an approximately 80.74-second turn, with 199 rendered-counter increments under a roughly one-Hz browser scheduling cadence; this does not certify physical-device FPS. Captured console warnings/errors: zero. See `globe-active-session.json` and the globe report.

## Responsive, visual and accessibility evidence

All three dashboards were measured at widths 320, 360, 375, 390, 430, 768, 1024, 1280 and 1440. All 27 measurements had page scrollWidth no larger than the viewport. Captured images include `final-global-<width>.jpg`, `final-strategy-{320,390,768,1440}.jpg`, `final-community-{320,390,768,1440}.jpg`, scan results/error, group editor/history, Supers/comments and globe/list/fallback. `final-layout-checks.json` holds measured dimensions. Widths below 700 used height 844; larger widths used height 900. The mobile sparkline overlap found at 320 was corrected and the Global captures repeated.

Palette tests resolve 787 concrete colour uses across five CSS files, with 11 blue uses restricted to heading selectors. Lowest normal-text token contrast is 5.173:1. Computed browser H1 colour is RGB(122,184,255), ordinary text RGB(164,173,182), with Space Grotesk headings. Stored avatar enum names do not dictate visible colours; their UI choices are Silver I–V. TradingView iframe internals retain provider styling and are not first-party palette or numeric-feed evidence.

## Measured performance

Lighthouse 12.8.2, isolated headless Chrome 157, local production build at `http://127.0.0.1:5173/`; report fetched **2026-11-17T15:48:12.523Z**. Simulated Moto G Power / Android UA, 412×823, DPR 1.75, 4× CPU slowdown, simulated 150 ms RTT and 1,638.4 Kbps throughput. Single laboratory navigation, not a physical device or p75 field sample.

| Metric | Final actual result |
|---|---|
| Performance / accessibility / best practices | 97 / 100 / 100 |
| FCP / LCP | 1.834 s / 2.284 s |
| Total blocking time | 9 ms |
| CLS | 0.003309 |
| Speed index | 1.834 s |
| Legible text | 100% in automated audit |

The earlier functional-theme run measured 90/100/96, LCP 2.4 s, TBT 200 ms and CLS 0.109. Fixed brief geometry and readable typography preceded the final measurement; these two single runs do not establish causality or field performance. Retained legacy CSS/JavaScript and render-blocking resources remain optimization opportunities. Authenticated `no-store` is preserved despite its back-forward-cache cost. INP is **not measured** by this navigation audit; TBT is not substituted for INP.

## Explicit limits

Physical Android touch/keyboard, low-RAM GPU behavior, battery/heat, measured CPU/GPU memory, forced-colour mode, full screen-reader audit, field INP/p75 and production two-person sessions are not verified. Browser keyboard zoom was attempted but a reliable 200% state could not be established through the available browser control; responsive widths do not substitute for that check. Reduced-motion bypass is observed; normal eclipse timing/policy is covered by eight automated tests, but a normal-motion animation screenshot is not claimed. Provider timeout/malformed/partial failures are executed contract tests, not a live-provider outage simulation. Production publication and preservation readback are recorded in the separately delivered `DEPLOYMENT_REPORT.md` receipt.
