# Strategic Souls V3 local release evidence

Prepared 15 November 2026 IST (checks began 14 November UTC). Release decision: **NOT READY for production or outside users.** This is an implemented, locally tested source delivery with explicit integration gaps. The existing private Site remains at saved version 7, with its original ID, URL, owner and audience.

## Delivered source

- The existing React/Vinext application now opens a mobile research workspace with five primary destinations, a desktop sidebar/search, three-step Soul creation, Library/history/diffs, Graveyard, Body settings, Team rooms, manual portfolio, Scan Builder and educational Options Lab. Original owner features remain under /legacy.
- Six additive Supabase migrations define independent identity profiles, private and Team research, immutable versions/events, permissions, invitations, comments/tasks, private avatar storage, holdings, moderation and a restricted quantitative queue. The Sites Worker uses Auth/REST/RPC/Storage HTTP interfaces. No database TCP or Python batch process was added to the Worker.
- A separate Python package implements point-in-time calculations, corporate-action handling, walk-forward evaluation, HC3 attribution, liquidity filters, sector strength and an immutable Parquet/DuckDB cache. All ten advanced requirements are mapped in QUANT_METHODOLOGY.md, including the incomplete classifier and absent real-data integrations.
- Recovery tooling, local startup/setup scripts, dependency locks, operational/security/data-rights documentation and manual-only CI source are included. The CI workflow was not executed and performs no deployment.

## Executed checks

| Check | Actual result | Evidence and limits |
|---|---|---|
| Current recovery | PASS: all 9 D1 tables captured; isolated SQLite integrity, row counts and payload digests verified | AUDIT.md; full private recovery files stay outside source/distribution; separate reads are not one transaction |
| npm run verify | PASS: typecheck, application lint and 63 Node tests | evidence/verify-result.json and verify.log; includes 41 inherited tests, 10 model/HTTP tests and 12 embedded PostgreSQL cases |
| Auth test boundary | Mocked HTTP transport only | Protocol tests are explicitly labelled; no real Google or email authentication claim |
| PostgreSQL test boundary | Actual SQL migrations, RLS and transactions in PGlite | Test Auth/Storage schema; not containerized Supabase, real email delivery or multi-connection load |
| Quantitative tests | PASS: 29 tests | evidence/quant-tests.log; generated fixtures and independent arithmetic, no actual exchange performance |
| npm run build | PASS | evidence/build-result.json and build.log; build success alone does not establish a user journey |
| Built Worker smoke | PASS: five local routes returned HTTP 200 | evidence/built-http-smoke.json; session is unauthenticated and backend unavailable |
| Built browser layouts | PASS for Home and Idea creation at 320, 360, 390, 430, 768, 1024 and 1440 px | External output/built-browser-evidence.json; no measured page-wide overflow; phone first input approximately 299–301 px from viewport top, 16 px input text |
| Local UI interactions | Three creation steps, CSV preview, editable command parsing and desktop search observed | Backend-dependent saves/imports correctly returned unavailable; no persistence claim |
| Runtime observations | Fresh built Home/Create/Library session captured no warning/error console entries | Limited smoke only; development/HMR previously emitted hydration/multiple-renderer warnings and is not certified clean |
| Dependency audit | 0 critical, 0 high, 10 moderate, 4 low | evidence/dependency-audit.json; full audit returned nonzero and the remaining findings are unresolved |
| Source pattern scan | PASS in captured evidence | evidence/source-scan.json; restricted patterns, not a guarantee that every possible secret is absent |

The synthetic cache benchmark used 41,600 rows, 160 instruments, one warmup and 12 paired repetitions. Cached p50/p95 was 213.01/232.86 ms; uncached was 1252.27/1351.94 ms, with matching result identities. This is a finite local laboratory measurement. See evidence/quant-benchmark.json and QUANT_METHODOLOGY.md for measurement details and limitations.

## Blocking and partial requirements

1. **Real local Supabase: BLOCKED.** WSL/container prerequisites are absent. Verified official winget package installation failed with 0x80072ee2; the session is not elevated. Actual Supabase startup failed for lack of an engine, and the real integration script stopped before account creation. The accepted path remains WSL2 plus Rancher Desktop Moby with Kubernetes disabled. No reboot or unsupported replacement was attempted.
2. **Independent consumer sign-in and real persistence: NOT VERIFIED.** Google OAuth credentials are not configured; email OTP, Storage and multi-user browser persistence require the real local stack. No assertion is made that outside users can sign in to the hosted Site.
3. **Market feeds and real research evaluations: BLOCKED.** No paid service, feed agreement, entitlement or real dataset was acquired. Numerical quotes remain null/unavailable. The worker is not connected to a real backend queue. No real return, win rate or strategy edge is reported.
4. **Complete advanced integration: PARTIAL.** The walk-forward evaluator is a Python API; the web queue supports cached SCREEN jobs, not a certified backtest journey. Factor/regime/sector logic is tested but not connected to legitimate histories or completed research. Cached RSI periods other than 14 abstain. Unresolved corporate-action execution paths abstain. The moderation classifier is NOT_CONFIGURED, with explainable rules and fail-closed public publication.
5. **Legacy migration and complete erasure: PARTIAL.** The secure one-use handoff links identities only and is disabled by default. No D1 importer, ownership transfer or production cutover was executed. Auth identity, orphaned Storage, backups and legacy deletion require a reviewed operator process. Team ownership transfer needs a separate explicit implementation; Team owners cannot silently withdraw.
6. **Release certification: NOT RUN.** Human ten-second comprehension/two-minute creation, screen readers, 200% zoom, slow Android/network, reduced-motion runtime, field p75 LCP/INP/CLS, external penetration testing, hosted restore and legal/regulatory review remain unverified.

## Source and operational custody

Work is confined to sites-strategic-souls/.sites-checkout and its named private-backup/output siblings. The unrelated daycraft project was not edited. The hosting manifest is unchanged. There was no source push, Site publication, audience change, production mutation, new hosted project, data upload, payment or brokerage action.

The final source commit and ZIP size/SHA-256 are recorded in the external output ARTIFACTS.json so the archive does not contain a circular self-hash. The source archive excludes private recovery files, environment credentials, package environments, build output and market data. Screenshots document actual local layouts only.

RUNBOOK.md contains the exact supported next commands. First resolve the official WSL installation/elevation prerequisite, then run the real local Supabase journey and configure authorized Google credentials locally. These are prerequisites for validation, not permission to publish or cut over production.
