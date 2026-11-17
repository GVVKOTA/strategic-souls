# Master specification coverage

Cross-check against the recovered original sections A–O and the newer implementation handoff. Status describes executed evidence, not a production certification. Release remains NOT READY.

| Original section | Implemented source / evidence | Outstanding requirements |
|---|---|---|
| A: audit/recovery | AUDIT.md, MIGRATION.md, scripts/backup-v3.mjs; fresh nine-table logical restore | Provider-managed snapshot and hosted restore not exercised |
| B: information architecture | components/v3/workspace.tsx; three conceptual domains, five mobile destinations, desktop search/sidebar | Human comprehension study not run |
| C: mobile visual system | app/v3.css, existing local licensed fonts, actual seven-width browser measurements/screenshots | Complete accessibility and field performance studies not run |
| D: Body/Auth | lib/v3/supabase.ts, V3 API, profile/avatar SQL and UI | Real Google, local OTP, expiry and persistence blocked on real stack; parallel handle-collision load not run |
| E: Team research | SQL/UI roles, private invitations, rooms/comments/tasks, immutable heads/forks/diffs and audit | Real multi-user concurrency and browser E2E not run; notifications limited to preferences and room polling; ownership transfer absent |
| F: Soul creation | Three real validated steps, drafts, audience, evidence times, immutable save/review handlers | Real save/reload and human two-minute journey blocked/unmeasured |
| G: market dashboard | Explicit missing quote values/status, source health, consentful viewing-only widgets, cost-only manual portfolio | No authorized numerical provider; sector leaders, sourced impact analysis and calendar coverage incomplete |
| H: EOD engine | quant/souls_quant pipeline, immutable raw Parquet, adjustment/cache/DuckDB and worker queue | Provider ingest scheduler/monitoring and real backend transport not integrated |
| I: ten advanced capabilities | QUANT_METHODOLOGY.md maps each function/test to the requirement | Regime/factor/sector outputs lack real data and full UI integration; one-action ranked-sector universe selection incomplete; classifier absent; certified backtest UI absent |
| J: statistics/post-mortems | Offline evaluator/stats/HC3/temporal tests; immutable reviews, opposing case and version provenance | Real comparable reports and linked factor/regime post-mortems unverified; capital-allocation/overlapping-trade model absent |
| K: security/privacy/compliance | RLS/RPC checks, origin/cookies, bounded AST, SQL policies, private Storage, block/report/appeal records, security/legal gates | Real penetration/abuse testing, operational review staff, complete cross-system deletion and counsel review absent |
| L: execution stages | Recovery first, then local product/backend/worker, tests, docs and packaging | Blocked integrations remain blocked; no stage is called complete merely because its UI exists |
| M: normalized model/API | Six additive Supabase migrations, strict TypeScript, Python hints, locks, runtime validators, HTTPS boundary | Real PostgreSQL/Storage restore and schema performance at scale not tested |
| N: mandatory acceptance | RELEASE_REPORT.md distinguishes actual PASS, BLOCKED and NOT RUN; evidence logs retained | Full Auth/Team E2E, accessibility, CI execution, production-like ops and field metrics remain outstanding |
| O: deliverables | Source, migrations, lockfiles, blank .env.example, manual-only CI, all named reports, runbook and output archive | No deployment/publication; existing production remains unchanged by explicit owner instruction |

## Quantitative evidence scope

All 29 Python tests use software fixtures with explicit test-only rights. A finite synthetic benchmark is not a market-data license or an exchange result. PGlite executes PostgreSQL policies with synthetic Auth/Storage tables and does not replace Supabase. HTTP Auth tests mock transport. Browser unavailable-save observations do not prove persistence. These limits are release blockers where the original acceptance test requires a real integration.
