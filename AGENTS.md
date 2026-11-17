# Strategic Souls engineering rules

## Mission and code map

Maintain the X2 research application for Global Vertex Vectors. The three dashboards live under [frontend/features](frontend/features). Put identity, canonical engines, provider adapters and application logic under [backend](backend). Routes remain in [app](app), and database definitions and access helpers belong in [database](database). Keep ordered D1 migrations in [drizzle](drizzle) and public assets in [public](public). Never duplicate canonical algorithms, provider adapters or access checks in dashboards.

Tested Node 22.16.0, pnpm 11.25.0; React/TypeScript, Next conventions through Vinext/Vite on Workers/D1. Preserve `pnpm-lock.yaml`; no unnecessary upgrades or second Node lockfile. Read README/SOURCE_PROVENANCE before assuming a deployed/source state.

## Product and evidence invariants

- Preserve matte black UI, readable shiny silver copy, bright blue headings, approved GVV header image, compact labels, accessible info controls, keyboard/focus behavior, reduced motion and responsive interaction. No unsolicited redesign/new dashboard.
- X2 has no crypto scope. Keep labelled legacy/synthetic archives separate from current evidence. Never invent LIVE values, volume, units, publication/known-at times or coverage. Null/UNKNOWN is not zero/FAIL. A key is separate from display, derived-display, non-display, cache, storage and redistribution rights.
- Use one deterministic canonical AST for Simple/Advanced. Preserve immutable executions/inputs/digests; corrections create versions. Enforce original cutoffs, censoring, ambiguity, deduplication/non-overlap. Negative-only Graveyard data is biased. Numerical probability needs eligible independent data, defensible cohorts, uncertainty and validated OOS calibration; otherwise INSUFFICIENT EVIDENCE.
- Enforce native identity/current consent and server-side owner/participant/membership/role checks, including mutation-time authority. Group sharing does not expose private portfolios or authorize training. Discovery is opt-in; retain blocks/rate limits; do not claim E2EE.
- Keep migrations chronological and non-destructive. Never erase/rewrite old migrations or rows to pass a test. Core X2 uses D1; retained Supabase/quant source is gated, not proof of active services.

## Development and checks

Use small branches from current `main`; agree on shared-file ownership. Inspect diffs, stage exact files, commit clearly and open a PR. No force pushes, overwriting contributions or cosmetic mass moves. Co-locate new behavioral tests when useful; retain existing backend suites in `tests/`. Do not weaken assertions to make checks green.

Use `pnpm install --frozen-lockfile` after dependency changes; `npm run verify:x2` for types/full application lint/Node tests; `npm run build` for the real Worker. Individual commands: `npm run typecheck`, `npm run lint:app`, `npm test`. Report actual results, warnings and untested limits. Remote Actions success is separate. Windows: use npm run dev for the compiled Worker preview. The upstream HMR issue is documented in the developer guide. Local mode is loopback-only fictional identity plus isolated local D1, never production auth/data. Stop owned QA helpers afterward.

## Security, teamwork and releases

- Never commit/output credentials, `.env` values, cookies, native owner subjects, user messages/rows/portfolios, private screenshots, DB dumps, vendor contracts or unauthorized datasets. Use server secrets, ignored local configuration and explicit synthetic fixtures. Scan current files and all history intended for push. Private GitHub is not a secret store. Retain third-party licences/credits; no scraping against terms or trade execution.
- Founder controls product/releases; contributors use their own identities and branches. Personal-repository roles do not guarantee review enforcement. Do not invite anyone without exact username and owner authorization.
- GitHub push does not deploy. Future approved deployment must verify original project `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0`, version/source/access, reconcile reviewed changes into the official Sites checkout, privately back up current data, check/build/package exact source and verify native deployment/original URL/audience. Record both SHAs; never create a replacement Site.
- No purchases, paid integrations, public/audience/access changes, credential expansion or irreversible production actions without explicit owner authorization. This export authorizes source management only, not deployment.
