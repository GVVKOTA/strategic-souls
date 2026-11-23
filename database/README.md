# Database Ownership Area (`database/`)

**Owns:** Cloudflare D1 (SQLite) Drizzle ORM table schemas, runtime D1 connection binding (`getDb(env)`), and reusable parameterized query helpers (`X5.5`).

---

## 1. What Belongs Here vs. What Does Not

### What Belongs Here
- Drizzle ORM SQLite schema definitions under `database/schemas/` (`index.ts`, `schema.ts`, `x1-workspace.ts`, `x1-community.ts`, `x2-data.ts`, `x2-social.ts`, `x51-research-network.ts`, `x52-intelligence.ts`, `profile.ts`).
- Parameterized query and retention helpers under `database/queries/` (`repository.ts`, `notebook-repository.ts`).

### What Does Not Belong Here
- Applied chronological Cloudflare D1 SQL migration files (`0000`–`0009`) — these must remain at root [`drizzle/`](../drizzle/) because `drizzle.config.ts`, `operations/scripts/local-preview.mjs`, `operations/scripts/backup-x2.mjs`, `operations/scripts/backup-v3.mjs`, `operations/scripts/verify-logical-backup.mjs`, and 15 integration test files load SQL directly from root `drizzle/`.
- Optional V3 local Supabase PostgreSQL configuration and RLS migrations — these remain at root [`supabase/`](../supabase/) for the Supabase CLI and `.github/workflows/verify-v3.yml`.
- Business logic, auth session tokens, or HTTP route handlers — these belong in [`backend/`](../backend/) and [`app/api/`](../app/api/).

---

## 2. Key Entrypoints & Directory Map

| Path | Responsibility |
| --- | --- |
| `database/schemas/index.ts` | `getDb(env)` helper binding Drizzle ORM to Cloudflare Worker `env.DB`. |
| `database/schemas/schema.ts` | Core tables (`accounts`, `auth_users`, `auth_sessions`, `souls`, `ownership`, `outcomes`, `support_requests`, `rate_limits`, `workspace_records`, `notebook_souls`, `notebook_events`) and full schema barrel export. |
| `database/schemas/x1-workspace.ts` | Workspace persistence (`x1_records`, `x1_ledger`, `x1_scans`, `x1_scan_events`). |
| `database/schemas/x1-community.ts` | Community & Rooms tables (`x1_bodies`, `x1_groups`, `x1_memberships`, `x1_invitations`, `x1_group_souls`, `x1_soul_revisions`, `x1_group_posts`, `x1_supers`, `x1_comments`, `x1_reports`). |
| `database/schemas/x2-data.ts` | Market provider metadata, audit logs, and private chart layouts (`x2_providers`, `x2_provider_audit`, `x2_chart_layouts`). Never stores plaintext API secrets. |
| `database/schemas/x2-social.ts` | Social preferences, blocks, DMs, notifications, bookmarks, reports, group directory, join requests, and discussions (`x2_*`). |
| `database/schemas/x51-research-network.ts` | Scan quota ledger, calendar reminders, and Soul Network tables (`x51_scan_quota_runs`, `x51_calendar_reminders`, `x51_web_souls`, `x51_web_soul_likes`, `x51_web_soul_saves`, `x51_web_soul_comments`, `x51_follows`). |
| `database/schemas/x52-intelligence.ts` | Market Vox polls & 1-vote-per-account votes, pinned Room research, search history, watch regions, and intelligence events (`x52_*`). |
| `database/schemas/profile.ts` | Extended profile metadata, avatar/banner preset selections, and privacy visibility flags. |
| `database/queries/repository.ts` & `notebook-repository.ts` | Account, atomic rate-limit, retention, and immutable legacy notebook query helpers. |

---

## 3. Applied Migrations & Production D1 Safety Contract

- **Applied Cloudflare D1 migrations live in root [`drizzle/`](../drizzle/) (`0000`–`0010`, 11 SQL migration files):**
  - `0000`–`0003`: Core tables, ownership uniqueness, `workspace_records`, legacy notebook + immutability triggers.
  - `0004`–`0005`: 14 `x1_*` workspace/community tables + immutability triggers preventing edits to `x1_scans`, `x1_ledger`, `x1_scan_events`, and `x1_soul_revisions`.
  - `0006`: 14 `x2_*` market-data and social tables.
  - `0007_standalone_auth.sql`: Standalone authentication tables (`auth_users`, `auth_sessions`).
  - `0008_x51_foundation.sql`: X5.1 scan quota ledger, calendar reminders, and Soul Network tables.
  - `0009_x52_intelligence_and_pulse.sql`: Market Vox polls/votes, pinned Room research, search history, watch regions, and intelligence event cache.
  - `0010_x56_profile_state_and_banner.sql`: Additive `auth_users.avatar_id` column for cryptographically random initial avatar persistence and `x56_profile_metadata` table (`state_code`, `banner_id`, `banner_align`).
- **Live Production Database:** Cloudflare D1 database `ss`, runtime binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f`.
- **NEVER edit, reorder, renumber, squash, or delete applied migrations `0000`–`0009`**, and **never reset or wipe live D1 user tables**.

---

## 4. How to Verify Changes

```powershell
node operations/scripts/check-x2-release.mjs
node operations/scripts/local-preview.mjs setup
```
