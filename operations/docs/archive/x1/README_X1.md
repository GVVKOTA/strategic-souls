# Strategic Souls X1

Existing private Site: https://strategic-souls-gvv.vishnukota20071005.chatgpt.site/

Project ID: `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0`. Existing React/TypeScript/Vinext/Cloudflare Workers application and D1 `DB` are retained. Native Sites identity remains the authentication boundary. Do not run the local fixture proxy in production or replace native owner identity with a header supplied by a visitor.

## What is implemented

- **Global:** sourced daily ECB FX and Treasury yields, real satellite exchange globe/list, private persistent watchlists, manual portfolio/cash ledger with moving-average basis and fees, instrument search and honest source gaps.
- **Strategy:** Simple/Advanced typed Soul Scan, immutable source snapshots/history and distinct Graveyard reviews; Market Radar eligibility/missing-data view; Formula Lab BSM/Greeks/IV/CAGR/XIRR and educational long-option expiry payoff assumptions.
- **Community:** unique Body, initials avatar/bio, private groups, bound expiring invitations, server roles, collaborative immutable revisions/conflict checks, group-only exact-revision publishing, Supers/comments/reports/moderation and ownership controls.

No executable live quote feed, licensed equities/fundamentals/derivatives/flows history, billing, public publishing, photo upload, independent external signup or broker execution is enabled. ECB daily filters do not prove a historical point-in-time backtest. Public-group growth requires a separately approved audience and regulatory/data-rights decisions.

## Develop and validate

Use Node >=22.13 and the pinned pnpm version in `package.json`. Install with `pnpm install --frozen-lockfile`; run `npm run typecheck`, `npm run lint:app`, and `npm test`. Build with the official Sites `build-site.mjs` helper or `npm run build`. Windows' Bash-based `install:ci` wrapper may require direct pinned pnpm. The development runner encountered a framework/workerd error in this environment; the production build plus local Wrangler/D1 is the verified preview route.

Preserve `.openai/hosting.json`, source remote and project ID. Apply migrations locally before testing. Hosted publication uses the official Sites helper, exact pushed source commit, a matching built archive and native private save/deploy. Do not point local Wrangler's placeholder database ID at production. Production environment entries were empty at discovery; the two official daily adapters need no secret keys.

## Reports and recovery

Read `AUDIT.md`, `PRODUCT_SPEC.md`, `DATA_RIGHTS_MATRIX.md`, `SCAN_ENGINE_SPEC.md`, `COMMUNITY_SECURITY.md`, `TEST_REPORT.md`, `UI_CHANGELOG_X1.md`, `UI_QA_PLAN_X1.md`, `UI_QA_RESULTS_X1.md`, `GLOBE_X1_REPORT.md` and `RELEASE_NOTES_X1.md`. The finalized native publication/preservation receipt is supplied separately as `DEPLOYMENT_REPORT.md` in delivery so it can describe the exact immutable deployed source commit without adding an unbuilt follow-up source change.

Before-change source/Git bundles and the verified nine-table logical restore stay in sibling `recovery/`. They contain private application records; keep them local and private. The source bundle excludes local test database, credentials, node_modules and generated runtime state. Additive X1 tables need no destructive rollback: republishing the saved v9 source can leave newer tables intact. Hosted restore was not tested and must not overwrite later real research without a new verified capture.
