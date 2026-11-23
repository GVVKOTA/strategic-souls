# X7 fix log

Implementation commit `6e1636f575589fbf52ed9cfd890a5899cffea9fd` on the existing X6/X7 repair branch.

| Defect | Change | Verification |
| --- | --- | --- |
| ECB default and contradictory sources | `frontend/features/strategy/workspace.tsx`, `backend/services/research/research.ts`, and `workspace.ts` default new scans to NSE/BSE and require a consistent scope for version 2 requests. Legacy stored runs keep their original definitions. | Versioned API cases reject missing scope or NSE/BSE paired with ECB before a broker call. |
| Scope changes left asynchronous work attached to the old form | Strategy aborts in-flight coverage when switching market and ignores stale responses. Draw remounts on market or watchlist changes and preserves a request ID for retries within its mounted form. | Code review and request tests. Browser timing test remains open. |
| Watchlist ownership and selection | The scan definition stores a selected list ID. D1 resolves it with subject and active-state conditions, and the picker only offers saved members. | The other-account fixture cannot select the owner's saved list. |
| Short and nested history | `backend/engines/scan.ts` computes structural bar requirements and seeds nested EMA, RSI, and MACD from the first valid input. The scanner uses the documented 2,000-calendar-day upstream Daily window limit and caps requests and snapshots. | Independent RSI and nested EMA boundaries, Golden Cross history, and cap tests for 25, 51, 501, and 1,000 candidates. [SmartAPI historical limits](https://smartapi.angelone.in/docs/ResponseStructure) |
| Mixed result labels and incomplete scope tally | Results label a valid result as “Did not match.” Coverage includes excluded candidates, distinguishes the selected scope, and shows provider and closed-bar dates. | A three-candidate fixture reconciles one eligible and two excluded at 33.3%. |
| Split writes could save a snapshot without completing quota | `scan-quota.ts` uses a single D1 batch for the reservation and immutable result. Both execution paths verify idempotent replay ownership and request digest. | A SQLite failure on the quota update rolls back the scan insert. The same request subsequently saves and replays once. [D1 batch transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) |
| Release and request provenance | `/api/release` reports X7 and the commit from a clean checkout. Scanner requests have an opaque trace ID through the Worker and private candle adapter. | CI build and local route tests. Production only after release. |

## Local gates on 24 November 2026 IST

- `node operations/scripts/check-x2-release.mjs` passed typecheck, lint, and 343 Node tests. Lint reported 10 warnings in existing code. The final Node suite ran in 12.95 seconds.
- An earlier run caught a React Compiler memoization error and then an accounting compatibility regression. The manual memos were removed where they obscured watchlist state. The established evaluated count again includes UNKNOWN attempts, and eligible counts only determinate outcomes. The existing invariant remains tested.
- `uv run --project backend/quant pytest backend/quant/tests -q` passed 29 tests in 4.05 seconds.
- `node operations/scripts/run-framework.mjs build` passed. The generated config matched the existing Worker name, D1 UUID, and binding names.
- `pnpm.cmd audit --audit-level high` exited zero and reported two moderate advisories.
- `node operations/scripts/scan-secrets.mjs` passed on 760 files, the staged changes, and the Worker bundle. The checkout had no configured local secret-value comparisons.
