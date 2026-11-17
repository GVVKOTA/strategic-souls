# Strategic Souls V3 audit — 14 November 2026
Status: local implementation; production unchanged. This report supersedes the historical audit only for the changes and checks explicitly recorded here.

## Identity and source
- Existing Site: appgprj_6ae0ae7364a481919dfb1af2f4fe17f0.
- Canonical URL: https://strategic-souls-gvv.vishnukota20071005.chatgpt.site/
- Actual Git checkout: sites-strategic-souls/.sites-checkout, not its parent.
- Starting branch: codex/zero-fee-widgets-2026-11-14; clean HEAD 5882fe3e786f8ee45471112602796b176a3c8951.
- Working branch: codex/strategic-souls-v3-local-2026-11-14.
- Sites read-only responses confirmed owner role, custom owner-only audience, zero external visitors, saved version 7 and succeeded deployment appgdep_6af8660744808191ade74a9c2c047c9f.
- .openai/hosting.json retains project ID, d1="DB", r2=null. No source push, publication, access change, hosted provisioning or cutover was performed.
- Original master attachment was recovered and read, including sections A–O and all ten advanced capabilities. The user's latest handoff takes precedence over its older staging suggestion.

## Recovery evidence
Native database overview was read before rows. Its exact nine tables were accounts, notebook_events, notebook_souls, outcomes, ownership, rate_limits, souls, support_requests and workspace_records. Each native page ended with next_offset=null; omissions were zero. The legacy Soul payload alone was truncated.

A new private directory, private-backup/v3-2026-11-14T16-50-09-411Z, contains a complete logical application snapshot and isolated restore. Current legacy digest matched the full payload from the earlier logical backup. Notebook payload integrity was independently recomputed. Source history was preserved as a verified Git bundle. The recovery script refuses source-local destinations and pre-existing restore files.

| Evidence | Result |
|---|---|
| Nine-table restore, row-count check and SQLite integrity_check | PASS |
| Reopen restore read-only and recompute legacy SHA-256 | PASS |
| Full legacy payload versus current live digest | PASS |
| Snapshot | 15,350 bytes; d3ff1663886e8717eab2be429105efc9c0105ad37e8fcdb6ee6992a2548b7aa7 |
| Restored SQLite | 122,880 bytes; b4685178bb80893f63326965e7b1f3493e655632c8eaa843a9bde88fadbd342e |
| Provider-managed D1 snapshot / hosted restore | NOT RUN |

Counts: accounts 1; notebook_souls 1; notebook_events 0; souls 1; ownership 1; rate_limits 2; outcomes/support_requests/workspace_records 0. Separate live reads are not one transaction. Operational rate counters and last_active are not immutable evidence. Backups and private exports are excluded from source and distribution archives.

## Actual host
Observed 14 November: Windows 11 Home Single Language, build 26300; Node 22.16.0; installed Python 3.13.4; pnpm 11.25.0; uv 0.12.23. The worker's uv environment uses Python 3.14.7, DuckDB 1.5.6, NumPy 2.5.4 and PyArrow 23.0.1. The machine reports 16 logical processors, 16,849,948,672 bytes RAM and HypervisorPresent=true. Initial free C: space was 315,140,423,680 bytes. Source: local command/CIM results, not a hardware performance guarantee.

WSL was not installed; Docker, Podman and Rancher/rdctl were unavailable. Official winget attempts for Microsoft.WSL and Rancher Desktop (which depends on WSL) failed with 0x80072ee2. No reboot or security-setting workaround occurred. The Supabase CLI was installed as a pinned development dependency. Actual supabase start failed because no container engine exists. Real local integration script returned BLOCKED before creating accounts.

## Functional inventory and severity
| Area | Observed/implemented state | Severity / release implication |
|---|---|---|
| Existing D1 notebooks, immutable originals, reviews and exports | Retained source and live records; accessible through retained owner route | Preservation PASS; no owner migration executed |
| Independent Auth | HTTPS OTP/verify, PKCE Google callback, HttpOnly cookies and verified-user gate implemented; mocked transport tests only | P0 BLOCKED on real stack and Google configuration |
| Bodies | Case-insensitive normalized handles, DB uniqueness, reserved names, bio, private avatar storage, preferences, profile opt-in | Local SQL/validation WORKING; real Auth journey NOT VERIFIED |
| Three-step Souls | Real client validation, source times, private/Team selection, draft and immutable commit paths | SQL tested; browser persistence BLOCKED by backend |
| Teams | Roles, one-use 48h invitations, revocation, comments, tasks, audit, polling, exports | SQL WORKING; multi-user Supabase/browser journey NOT VERIFIED |
| Manual portfolio | Atomic/deduplicated imports, immutable payloads, archive/restore, cost-only summaries, CSV preview | SQL and browser validation tested; real backend journey BLOCKED |
| Markets | Original registry retained, null values, explicit source states, optional viewing-only widgets | Numerical integration BLOCKED on rights/provider |
| Quant worker | Separate Python calculations, Parquet/DuckDB cache and restricted HTTP job protocol | Offline calculations tested; real data/queue integration NOT VERIFIED |
| Moderation | Explainable rules, private learning allowed, Team high-risk gate, stored appeals | PARTIAL; trained classifier and staffed review unavailable |
| Public/paid/advisory/execution | Disabled | Deliberate release gates |
| Full identity/Storage/backup deletion | Deliberate private-data withdrawal implemented; shared lineage/operator process retained | PARTIAL; complete erasure across all systems NOT CERTIFIED |

Specific observed UI defect: Home overflowed at 320 px after the first typography pass because its breadcrumb plus source controls exceeded the header. Header flex constraints were patched; all seven Home widths were remeasured without page-wide overflow. Creation's first input was measured at approximately 299–301 px on phones, rather than relying on the handoff's old 911 px observation.

Final security review found that idempotent retries could return saved Team snapshots or evaluation responses without rechecking current access. Current permissions are now checked before replay, and stored evaluation reads require live dataset entitlements. The queue replay regression failed before the fix; the updated PostgreSQL fixture suite passes all twelve cases, including removed-member Soul/scan replay and expired-result visibility. A malformed new scan test fixture was corrected during this verification; it was not evidence of a production exposure. No V3 backend or deployment existed during these tests.

No complete penetration test, screen-reader audit, slow Android test, field Web Vitals study or human two-minute onboarding study was performed. Screenshots prove layout only. See RELEASE_REPORT.md and evidence files for executed checks.
