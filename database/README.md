# Database Ownership Area (`database/`)

**Owns:** Cloudflare D1 (SQLite) Drizzle ORM table schemas and reusable server-side query helpers.

## Directory Map

| Path | Responsibility |
| --- | --- |
| `database/schemas/index.ts` | `getDb(env)` helper binding Drizzle ORM to Cloudflare `env.DB`. |
| `database/schemas/schema.ts` | Core tables (`accounts`, `auth_users`, `auth_sessions`, `souls`, `ownership`, `outcomes`, `support_requests`, `rate_limits`, `workspace_records`, `notebook_souls`, `notebook_events`) plus X1/X2 re-exports. |
| `database/schemas/x1-workspace.ts` | Workspace persistence (`x1_records`, `x1_ledger`, `x1_scans`, `x1_scan_events`). |
| `database/schemas/x1-community.ts` | Community tables (`x1_bodies`, `x1_groups`, `x1_memberships`, `x1_invitations`, `x1_group_souls`, `x1_soul_revisions`, `x1_group_posts`, `x1_supers`, `x1_comments`, `x1_reports`). |
| `database/schemas/x2-data.ts` | Market provider metadata, audit logs, and private chart layouts (`x2_providers`, `x2_provider_audit`, `x2_chart_layouts`). Never stores plaintext API secrets. |
| `database/schemas/x2-social.ts` | Social preferences, blocks, DMs, notifications, bookmarks, reports, group directory, join requests, and discussions (`x2_*`). |
| `database/queries/` | Account, atomic rate-limit, retention, and legacy immutable notebook query helpers (`repository.ts`, `notebook-repository.ts`). |

## Applied Migrations & Production Binding (Root Exceptions)

- **Applied Cloudflare D1 migrations live in root [`drizzle/`](../drizzle/) (`0000`–`0007`)** so `drizzle.config.ts` and Wrangler discover them reliably:
  - `0000`–`0003`: Core tables, ownership uniqueness, `workspace_records`, legacy notebook + immutability triggers.
  - `0004`–`0005`: 14 `x1_*` workspace/community tables + immutability triggers preventing edits to `x1_scans`, `x1_ledger`, `x1_scan_events`, and `x1_soul_revisions`.
  - `0006`: 14 `x2_*` market-data and social tables.
  - `0007_standalone_auth.sql`: Standalone authentication tables (`auth_users`, `auth_sessions`).
- **Live Production Database:** Cloudflare D1 database `ss`, runtime binding `DB`, UUID `1cda2b05-6b99-4d04-896f-b3542ad2ce7f` (43 tables + 11 immutability triggers live).
- **NEVER edit, reorder, squash, or delete applied migrations `0000`–`0007`**, and **never reset or wipe live D1 user tables**. New changes require a new chronological additive migration (`0008+`), a verified backup, and separate owner approval.
- **Optional V3 PostgreSQL (`supabase/`):** Root `supabase/` is a completely separate optional local PostgreSQL + RLS stack; keep its migration history separate from D1.
