# Test evidence — 14 November 2026

Environment: Windows PowerShell; Node 22.16.0; pnpm 11.25.0. No production auth bypass or broker action used.

| Check | Actual result |
|---|---|
| pnpm install --frozen-lockfile | PASS; lock unchanged. Sites Bash installation wrapper failed on Windows, then documented pnpm fallback succeeded. |
| Baseline Sites build-site.mjs | PASS at base source before edits. |
| Baseline npm run verify | FAIL: typecheck/lint passed; tests 21 pass, 1 test-file failure from unsupported .ts extension under Node 22.16. |
| npm test with explicit strip-types | PASS: all 35 existing tests. |
| npm run verify after implementation | PASS: typecheck, application lint, 41 tests. Subsequent final checks are in delivery evidence. |
| Post-change Sites production build | PASS. Final publication build is recorded separately if inputs change. |
| git bundle verify | PASS: complete pre-change source history. |
| verify-logical-backup.mjs | PASS: complete logical data restore, legacy payload hash, SQLite integrity and pending additive migration; hosted restore not run. |
| Local D1 schema application | PASS: all four schema files applied to isolated local Worker database. |
| Development preview | FAIL: Node 22 owner-stack error; Node 24 Windows file-URL module fallback error. |
| Production Worker preview | PASS: serves actual built application on 127.0.0.1:8787. |

Existing tests exercise actual API handlers against isolated SQLite/D1 emulation, with fictional identities: authentication/consent/CSRF, malformed input, tenant isolation, atomic limits, notebook creation/read/review/revision, immutable triggers, duplicate/concurrent saves, exports/deletion, future evidence/lookahead, safe formulas, quote entitlement/freshness/units, DST/IST and backup restore. Widget tests verify exact 28-label order, null numeric outputs, strict allowlists, independent calendar configuration and actual token contrast ratios. Fixture numbers are never displayed as market observations.

Browser screenshots and observations, including target-host embeds, responsive widths, keyboard behavior and first-Soul flow, are saved with the final delivery report outside source. An iframe load alone is not a verified quote. Viewport/CDP capture failures and unavailable physical-device/screen-reader/p75 measurements must remain explicit. The test-only localhost proxy uses a fictional account and isolated D1; it is outside the repository and never shipped.

No live numeric tick, broker connection, payment, legal approval, real mobile device, screen-reader certification or p75 Core Web Vitals success is claimed.

Browser local QA passed: three-step creation with an explicit final Save action, immediate Graveyard visibility, append-only INCONCLUSIVE review, and reload/revisit persistence. Test subject and all notebook/reference inputs were visibly labelled LOCAL QA. No production record or visitor consent was created during these tests.

Responsive Chromium iframe-layout measurements passed for both landing and workspace at CSS widths 320, 360, 390, 430, 768, 1024 and 1440: no document-wide horizontal overflow. Workspace showed exactly three mobile destinations at mobile widths. These are browser layout checks, not physical iOS/Android tests. All 12 dashboard sections rendered without a service error. Settings Escape dismissal returned focus to its trigger. An intentionally restricted local CSP produced the documented widget fallback. The native viewport screenshot override timed out; unmodified native captures and a visibly labelled local mobile iframe were used instead.

Current dependency audit found one critical RSC advisory; updating the aligned React packages from 19.2.8 to 19.2.9 reduced the registry findings to 0 critical / 0 high / 10 moderate / 4 low. Lockfile reproduction, tests and production build were repeated for the patched release. Development-runner behavior after this dependency patch is not reverified.
