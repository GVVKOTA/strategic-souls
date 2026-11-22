# X1 code and recovery audit

Inspected on 17 November 2026 using native Sites APIs, a freshly opened source checkout, terminal/Git and authenticated Chrome. Same Site ID and URL verified. Current before-state deployment: version 9, source `4283d14976201baf7c84db6db6ea29dea33374a8`, successful deployment `appgdep_6afa097a49e88191a10d7e5aee6e6e90`, restricted/custom policy containing only the owner and zero groups/external viewers. Production environment revision 0 had no entries. No credentials were copied to source or browser code.

## Existing architecture

React 19.2.9, TypeScript 5.9.3, Vinext 1.0.0-beta.5, Vite 8.1.6, Cloudflare Workers and existing D1 `DB`. Existing local fonts/licensing retained. Nine user tables: accounts, notebook_events, notebook_souls, outcomes, ownership, rate_limits, souls, support_requests, workspace_records. V3 independent-auth/Supabase and quant services were scaffolded but unconfigured. Native stable Site subjects are reused for X1; no email linking or host migration.

## Recovery evidence before mutation

Recovery files are outside the source checkout in `../recovery`. The complete Git bundle verified successfully. Before-source ZIP SHA-256 `e9725147c4641e2a3f727a3de802a75a549b0a034365fe9d108174b1109b1214`; bundle SHA-256 `94f918afd9d3589c9d4bfab41ca509136e6d8486c151c796a3a1660381d09053`. Native live table projections captured all nine tables. Isolated SQLite restore passed integrity and reopened read-only. Snapshot SHA-256 `95fbbc0ed14039e01799a0d31794be0cb3ad450853fc6f722ddb36362bceb324`; restore SHA-256 `24dffa4d6c14a7b075c3018684bec86baac945d477215577aaf4289e962dd76e`.

Counts: accounts 1; notebook_souls 1; ownership 1; souls 1; rate_limits 2; all other original tables 0. The live tool truncated one legacy synthetic payload. The prior complete snapshot restored that payload and matched the current live SHA-256 `[PRIVATE_RECORD_DIGEST_OMITTED_FROM_SOURCE_EXPORT]`. Separate table reads are not transaction-consistent or provider-managed snapshots; hosted restore was not run.

## Changes

Additive `0004_thankful_talisman.sql` creates 14 X1 tables without modifying the original nine. `0005_x1_immutability.sql` adds four bounded immutability triggers. Private records and ledger/scans reference the existing account. Community uses normalized Body handles, membership, hashed invitations, immutable revision content, exact-revision posts, unique Supers and private moderation records. API input sizes, origin checks, native identity, rate limits, authorization and optimistic concurrency are server-enforced. Data fetches use fixed official URLs, bounded sizes/timeouts/cache and provider timestamp validation.

Original research routes and data remain. Original export/erasure are extended for X1; deleting an account that owns groups requires a separate acknowledgement of shared group deletion or ownership transfer. No erasure was performed on the hosted account.

## Tool and agent inventory

Lead: Codex. Actual scoped Codex agents delivered data/registry, scan/mathematics, Community backend and independent globe review. Git, Node 22.16.0, npm, pinned pnpm 11.25.0, Python 3.13, VS Code CLI, Codex CLI, Claude CLI, native Sites tools and Chrome/CUA are available. Antigravity desktop is installed but no supported coding-agent handoff CLI was discovered; no Antigravity model review is claimed. Claude was not invoked. No unrelated accounts or financial tools were accessed.

The Sites dependency wrapper could not launch its Bash command on Windows; pinned pnpm performed the unchanged frozen-lockfile install. The first dev preview failed inside the framework/workerd runner (`recentlyCreatedOwnerStacks`). A production build plus loopback Wrangler/local D1 test identity supplies browser QA. The fixture proxy is outside source and never deployed. Production retains the platform authentication boundary.

## Remaining review limits

Source and fixture tests cannot prove external signup, production two-person sessions, current paid data entitlements, regulatory approval or field performance. The release reports these separately. Public finance publication, provider purchases, audience changes and billing remain unapproved and inactive.
