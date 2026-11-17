# Strategic Souls X2

This updates the existing owner-private Strategic Souls Site. Project `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0`; original URL https://strategic-souls-gvv.vishnukota20071005.chatgpt.site/ . Baseline version 10. Publication is verified separately by the native deployment receipt and authenticated browser, never by a successful local build alone.

The compact silver-on-black interface uses the supplied, byte-preserved GVV image, universal search, three dashboards and owner-only data controls. Real daily ECB references and US Treasury yields remain connected. Private watchlists, manual portfolio accounting, named source-checked scans, versioned drafts, immutable history, explicit Graveyard reviews, Body discovery, message requests, DMs and group collaboration use D1 persistence.

Commercial market adapters are implemented, but no provider key or commercial licence has been supplied. Forward probability and historical replay/backtest remain suppressed for actual sources without certified PIT history and calibration. Unsupported data has an unavailable state. The delivery is not a claim that every requested feature has a live entitlement or that every possible defect is excluded.

## Run and checks

Use Node 22.16+ and the pinned pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, `npm run typecheck`, `npm test`. Application lint includes `components/x2` in addition to the existing `lint:app` paths. The official Sites `build-site.mjs` is the deployment build entry point; `npm start` previews the compiled Worker on loopback with a separate local D1 database. Do not use production cookies or copy runtime secrets into a source checkout. Never upload `.wrangler`, `.env`, private recovery, `node_modules` or QA identities as live records.

## Review map

- [All six decisions and remaining scope](X2_FINAL_SCOPE_CHECKLIST.md)
- [Verified baseline and recovery](X2_VERIFIED_BASELINE.md)
- [Bugs and corrections](X2_BUG_REGISTER.md)
- [Provider matrix](X2_MARKET_PROVIDER_MATRIX.md), [owner setup](X2_DATA_SETUP.md)
- [Scans and Graveyard](X2_SCAN_AND_GRAVEYARD_SPEC.md), [probability](X2_PROBABILITY_VALIDATION.md), [numeric tests](X2_NUMERIC_TEST_REPORT.md)
- [Charts](X2_CHART_AND_ASSET_QA.md), [community security](X2_COMMUNITY_SECURITY_REPORT.md)
- [UI screenshots and screen sizes](X2_SCREENSHOT_UI_AUDIT.md), [accessibility](X2_ACCESSIBILITY_AND_MOTION.md)
- [Regression results](X2_REGRESSION_RESULT.md), [dependencies](X2_DEPENDENCY_REVIEW.md)
- [Publication proof](X2_DEPLOYMENT_PROOF.md), [resume and rollback](X2_RESUME_HANDOFF.md)

Original legal routes, legacy notebook, accounts and immutable scans remain. This release authorizes no purchases, payments, public access, brokerage execution or hosting migration.
