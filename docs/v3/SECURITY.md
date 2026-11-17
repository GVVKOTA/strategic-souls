# Security and verification limits
This is an implemented local boundary with tests, not a security guarantee.

| Threat | Implemented control | Evidence / remaining limit |
|---|---|---|
| IDOR / tenant leakage | Per-read live membership RLS, scoped exports, current author/role checks | Embedded PostgreSQL tests; real Supabase multi-user journey blocked |
| NULL authorization bypass | Boolean helpers coalesce false; membership absence explicitly rejects | Outsider/NULL-role mutation tests |
| Role escalation | Only Owner/Admin manage allowed roles; ordinary table DML revoked | SQL escalation, invite, reviewer/viewer and removal tests |
| Duplicate/conflicting writes | Auth-scoped request UUID, complete fingerprint, advisory lock, locked expected head | Same/different payload and stale-head tests; real multi-connection load not run |
| Session spoofing | Auth /user verification per request; no acceptance of browser-supplied Sites identity | Mocked protocol tests; Google and real Auth expiry not verified |
| OAuth / CSRF | Server PKCE verifier, browser-bound callback state, same-origin JSON writes, HttpOnly SameSite cookies | Handler tests; production proxy and OAuth callback journey not run |
| Script / SQL execution | React text rendering, reference-only URL validation, bounded typed AST and SQL allowlists/parameters | Validation and injection tests; independent penetration test not run |
| CSV injection | Strict headers, lengths, row count, types, unsafe-prefix and duplicate rejection | Existing parser tests plus browser preview and SQL atomic import |
| Private objects | Private bucket and UID directory policies, small PNG/JPEG/WebP signature checks | Policy tests; actual Storage upload and object lifecycle unverified |
| Worker privilege | Dedicated enrolled identity, current rights/tenant rechecks, immutable final results | Queue tests; actual HTTPS daemon/Auth integration unverified |
| Saved-response replay | Current edit permission checked before returning an idempotent Soul/scan response; current dataset rights checked on queue replay and result reads | Removed-member and expired-entitlement SQL regression checks |
| Secret exposure | No browser provider/admin keys; ignored local server environment; redacted typed errors | Source scan and tracked archive review required at release |
| Abuse | Successful mutation counters, Auth rate settings, invite expiry, block/report/appeal records | Invalid transactions can roll back DB counters; gateway abuse controls and staffed review incomplete |

The inherited Worker CSP still permits framework-required inline scripts and styles. It is not represented as a strict nonce-based XSS certification. No arbitrary evidence URL is fetched. External widgets load only after user action and never yield numerical scan data.

Entitlements default to OPERATOR_ONLY, with derived analysis disabled. A reviewed record must explicitly grant PERSONAL, TEAM or APP_INTERNAL use, analysis, derived outputs and any Team sharing. Catalog responses omit internal agreements. Membership and current rights also gate saved result visibility; a research cutoff does not extend an expired commercial permission.

## Secrets and owner migration
Publishable keys may identify the backend, but access and refresh credentials remain in HttpOnly cookies and server requests. Privileged handoff registration keys are server-only, disabled by default, and never persisted in source or browser code. Handoff requires the genuine existing owner AND a verified new identity; no email matching or owner-header injection was performed.

## Privacy gaps that remain visible
Private V3 withdrawal is deliberately narrower than complete cross-system account erasure. Shared attribution becomes pseudonymous; Auth identity, private Storage orphan cleanup, legacy D1 records and backups require an operator retention/deletion process. A Team owner cannot be silently removed. No automatic deletion was executed against existing data.

## Dependency state
The 14 November pnpm audit found 0 critical, 0 high, 10 moderate and 4 low findings. Lower-severity findings remain; a nonzero full audit result is not a vulnerability-free dependency tree. See evidence/dependency-audit.json for the captured registry response.
