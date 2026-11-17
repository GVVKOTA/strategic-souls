# X1 Community security and verification

Verified locally on 17 November 2026. The existing restricted Site audience stays unchanged. Native ChatGPT Sites identity supplies the stable account subject; an email, handle, invitation code or browser-supplied role never establishes account ownership.

## Implemented boundaries

- A Body is an editable, unique, case-normalized ASCII handle plus display name, bio and a selected avatar colour. The `x1_body_handle_unique` database constraint resolves concurrent registration collisions. Existing account consent version `2026-11-14-v4` is preserved. A new account must separately acknowledge age 18+, privacy and terms. Profile-photo uploads are unavailable because no private file-storage binding is configured.
- Every group is private. Server membership checks guard direct group, Soul, revision, post, comment, Super, report and invitation access. Responses contain handles and profile fields, never internal account subjects or account email addresses. Group rows and private authored revisions cannot be exported by removed members.
- OWNER can transfer ownership and assign roles. OWNER and ADMIN invite and publish. EDITOR can draft and revise. VIEWER reads and participates in discussion. An administrator cannot create another administrator; only the owner can grant that role. Group ownership always depends on the immutable subject, including after a handle rename.
- Invitations are bound to one named Body, valid for seven days and single-use. Only a SHA-256 hash of a cryptographically random 64-character code is stored. The plaintext is returned once to the creating administrator. Acceptance checks current inviter role, expiry, revocation, target handle and membership limits. An invitation does not change Sites audience or bypass its sign-in gate.
- A group Soul uses the same `compileFormula` canonical parser as personal Soul Scan. Each revision retains source formula, typed canonical rule, version, methodology summary, author handle and change note. An atomic D1 batch conditionally advances the expected revision and inserts only the matching new revision token. A stale or concurrent edit returns HTTP 409; prior content is retained. Restoring an earlier method appends a new revision.
- Publication is a group-only, administrator-approved snapshot of the current revision. A unique `(soul_id, revision)` index makes retries return the existing post. Revision history retains contributor attribution. There is no public publication action or paid publication path.
- Supers use explicit desired state, a unique `(post_id, subject)` key and server-authoritative counts. Repeating an `active:true` request cannot add more likes. Comments support bounded threaded replies, own edits and tombstone deletion. A reply parent must be from the same authorized post. Client text is rendered as text, with no HTML execution or arbitrary image fetching.
- Members can report a group post. Reports are visible only to its owner and administrators. Moderators can hide or restore a group post; hidden posts disappear from ordinary member projections and reject new comments or Supers. Reports remain private and are not automatically emailed to anyone.

## Request and storage limits

The API requires same-origin JSON mutations, bounds streamed JSON bodies to 16 KiB, and sends `private, no-store` responses. Per subject limits are 120 requests/minute, 30 writes/minute, 25 invitations/day and 10 reports/day. Database UPSERTs enforce those limits atomically. Groups are bounded to 30 per Body and 100 members per group. Responses expose at most 50 posts, 50 current Souls, 100 revision records and 200 comments; the post feed has a stable keyset cursor, while oversized revision/comment history remains a documented UI limit. No fabricated engagement or seed accounts are installed by these modules.

Ten additive D1 tables store Bodies, groups, memberships, invitations, group Souls, immutable revision content, group posts, Supers, comments and reports. No existing table is reset or rewritten. The lead agent owns generated SQL migration review and deployment.

## Privacy integration

`exportCommunityData(subject)` supplies the existing private account export. It includes the current Body, group memberships, authorized authored revisions and authored comments, and fails rather than returning a partial export above its bound.

`communityPrivacyStatements(subject)` must run inside the existing explicit erasure batch before deleting the account. It anonymizes revision/post attribution and tombstones authored comments in retained groups. Foreign-key cascades remove the Body, memberships, invitations created by the account, its Supers and its reports. An account that owns a group also owns its group workspace: confirmed erasure cascades that group and its records. The account flow must disclose this effect and provide ownership transfer first. No inactivity cleanup is invoked.

## Executed tests and limits

The actual route and community repository run in an isolated Node VM with the real canonical parser, generated Drizzle migrations, SQLite foreign keys and atomic transaction batches. Tests cover native-identity rejection, origin/consent/body limits, concurrent handle collisions, outsider/direct-ID isolation, hashed target-bound invitations, editor/viewer permissions, concurrent revision conflicts, group-only snapshot publication, idempotent Supers/comments, cross-post reply rejection, own-comment edits, private reports, moderation, ownership transfer, revoked invitations, export boundaries, erasure and request limits.

These tests use isolated test identities and do not establish external-user sign-up or production multi-person collaboration. The verified production Site currently admits only its owner. Real two-person browser verification requires an explicit future audience invitation by the owner; this implementation does not widen access. Photos, public discovery/publishing, automatic moderation, blocking, external notifications and consumer identity outside ChatGPT are not shipped by this slice. Qualified regulatory review remains necessary before public financial-content sharing.
