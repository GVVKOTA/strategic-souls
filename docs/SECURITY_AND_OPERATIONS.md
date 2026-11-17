# Security, recovery and operating runbook

## Threat model / data flow

Browser → Sites access and identity → Worker checks → owner-scoped D1. External evidence URLs are clickable reference links; the server does not fetch them. Following a link leaves the app. Notebook exports contain private user-authored data. No copied source full text or credentials are included intentionally.

| Threat | Implemented control | Residual risk |
|---|---|---|
| Cross-user reading or mutation | Server ID from Sites; bound owner queries; tests for create-parent, events, list, export and erase | Real platform two-account tests remain blocked |
| Historical editing | Database UPDATE triggers, no edit API, linked new versions; append-only reviews | Privileged operator can alter DB; independent timestamp signing absent |
| CSRF / oversized requests | Origin equality, JSON-only writes; streamed size limit 4 KB / notebook 32 KB | Platform cookie/session security not independently verified |
| SQL injection | Parameterized queries; fixed table/column identifiers | Independent penetration testing not done |
| XSS | React text escaping; no raw HTML rendering for research; HTTPS URL validation; CSP | CSP retains framework-required inline script allowance; nonce hardening deferred |
| SSRF | No server URL fetch; unsafe schemes/credentials/local endpoints rejected | User can follow a hostile external public HTTPS link; no malware reputation service |
| Replays / concurrent saves | Unique semantic digest for originals; request-ID dedupe/conflict for events; atomic rate counter | Broader distributed/load/failure testing still required |
| Deletion and data loss | Explicit exact confirmation; owner-only transactional deletion; schema preservation | Full live backup and restoration not verified; session revoke separate |
| Secret exposure | No configured provider keys; no client secret use; source scan | Candidate audit: 0 critical/high, 10 moderate/4 low; independent penetration audit outstanding |

## Feature controls

`lib/gates.ts` records all public/billing/data/trading gates as false. Actual API enforcement: `DISABLED_FEATURES` rejects commercial/public/trading routes; scan/outcome endpoints return 503 before model execution or quota charging. Session returns the gate state. Missing licensed data does not fall back to synthetic prices. Site audience is enforced by Sites and must remain owner-only. Changing a boolean alone cannot supply a provider, licence or payment system.

## Backup evidence and required recovery step

Source was captured before edits in `strategic-souls-before.bundle`; `git bundle verify` passed and reports complete history; a separate restored checkout matched the original HEAD. A restoration test for additive migrations and immutable triggers passed on a disposable SQLite database. Neither constitutes a live D1 restore test.

Production D1 reader exposed 7 tables: accounts (1), souls (1), ownership (1), rate_limits (1), outcomes (0), support_requests (0), workspace_records (0). The sole `souls.payload` was truncated by the connector. No complete row backup was fabricated or claimed. No live rows or schema were mutated in this task. Counts are discovery observations, not a consistent transactional backup.

Before deploying this candidate:
1. Obtain a complete provider-supported database export or snapshot using the authorized operator interface. An app account export is useful but does not back up all tables/configuration.
2. Store the export privately with a manifest and SHA-256. Validate every row is complete; check counts and foreign keys. Never restore a truncated connector projection.
3. Restore into an isolated database. Verify representative original Souls, ownership, accounts and hashes; run the immutable-trigger tests. Record exact tool/version, time, checksums and result.
4. Run migration 0003 in that restored staging environment, then browser-test onboarding, Soul save/reload/review/export/erase with two isolated identities.
5. Only after these checks, deploy privately to the SAME existing project. Do not create a duplicate or change the audience.

## Deployment / rollback

Pinned Node 24, package lock and source provided. Locally: `corepack enable`, `corepack pnpm install --frozen-lockfile`, `npm run verify`, `npm run build`. In Sites use its supported source workflow and build helper, preserving `.openai/hosting.json` project ID and `DB` binding. No extra platform has been provisioned. `npm run dev` is for local development; test identities exist only inside the isolated VM test harness, never as production middleware.

Existing rollback target: version 2, saved ID `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0~appgver_895127d6ac84819185d1b81a01f66118`, commit `615835411701ee6916788f18d22bd98e8daea8fc`. If a future candidate deployment fails, restore that saved version through Sites while preserving access. Leave additive notebook tables intact; old code will not use them. Export new records before any database restore. Do not DROP tables as a rollback shortcut. This rollback procedure is documented, not exercised against production.

## Monitoring and incident response

API errors return generic messages; logs include error type, not record content. No alert transport, staffed rota, uptime SLO, support email, domain or merchant service is configured. Existing support UI records private requests but does not notify an operator. Do not claim responses will be delivered. Before launch assign named owner/on-call, connect privacy-respecting alerts, exercise an outage and configure a grievance queue.

Incident sequence: restrict affected capability without deleting evidence; preserve redacted logs and backup; identify scope, users and responsible operator; assess CERT-In/DPDP/other reporting duties with counsel; notify through verified channels; fix, restore and verify before reopening; document root cause. Do not send any incident communication automatically from this project.

## Privacy / retention

Consent v3 explicitly covers notebook sources and review events. Privacy/terms are draft policies. No email is stored by application code. Site-specific ID, alias, consent, activity, support and research data remain personal data. Account deletion removes active app records and ownership links, but unlinked legacy synthetic originals, logs and provider backups have separate retention questions. Controller identity, processors, storage region, backup erasure, grievance contact, legal basis and minors assurance must be resolved. No automatic inactivity erasure is enabled.

## Domains and separate production hosting

No custom domain purchased or configured. When authorized, use Sites domain workflow and ONLY returned DNS validation/CNAME/A records, then verify TLS and redirects. Do not guess records. Public customer identity has not been verified, so a separate SaaS migration is not silently attempted. If Sites cannot meet the required identity/region/backup controls, preserve this private Site; export with consent and design an explicit migration with stable ID mapping, row-count/hash verification, dual-read checks and rollback. No alternate-host production readiness is claimed.
