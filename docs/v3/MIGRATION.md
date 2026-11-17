# Migration and recovery boundary
Production remains on the existing Sites/D1 implementation. V3 Supabase migrations are additive local source files; they have not been applied to production.

## Safe sequence
1. Keep the verified nine-table private backup and Git bundle outside source and archives.
2. Complete the supported Windows WSL2 / Rancher Moby prerequisites, with Kubernetes disabled. No script reboots the PC.
3. Start the distinct local Supabase project strategic-souls-v3-local. Apply migrations with pnpm exec supabase migration up --local. Never run db reset on a database containing user records.
4. Configure only loopback .dev.vars through scripts/write-local-env.mjs, then restart the local frontend.
5. Run the real local Auth/Mailpit/persistence/role test. Do not substitute the embedded PostgreSQL or mocked Auth tests for this step.
6. Configure authorized Google OAuth credentials and observe a real Google sign-in/logout journey. This remains NOT VERIFIED.
7. Rehearse an isolated PostgreSQL/Storage export and restore before a future production decision. Only the legacy logical SQLite restore has been executed.
8. Prepare a concrete cutover package and obtain the separately required owner authorization. No cutover is authorized now.

## Ownership handoff
Email equality never transfers ownership. Issuance requires a verified Supabase session AND the genuine existing Site owner from the Sites server authentication context. Server-only LEGACY_SITE_OWNER_SUBJECT and an explicitly enabled handoff configuration are required. Registration is a privileged server-only RPC; a random token is stored only as SHA-256, expires after ten minutes and is consumed under a database lock once.

The implemented handoff links identities only. It deliberately does not copy D1 data or change production ownership. A reviewed importer must later verify every original ID, digest, evidence timestamp, version edge, holding and event against the fresh export before moving any records. No legacy import or production owner injection was performed.

## Rollback
No production rollback is needed because nothing was deployed. Preserve local work and use reviewable git revert commits if a source rollback is wanted; do not reset branches or drop tables. Leave Supabase additions intact during investigation. Back up the local PostgreSQL and private Storage before any later schema/data change. Migration down/drop scripts are deliberately absent.

The current nine-table snapshot is logical, assembled from separate reads plus a digest-verified earlier full legacy payload. It is not a provider-managed D1 Time Travel snapshot or a transaction-consistent physical backup. Hosted recovery remains untested.
