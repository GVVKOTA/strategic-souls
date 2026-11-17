# Local runbook
All commands run inside the actual nested .sites-checkout repository. Do not run application/Git commands from its parent or edit sibling daycraft. The existing Site stays unchanged.

## Preview the implemented interface
Double-click START_V3_LOCAL.bat, or run:
~~~powershell
npm run dev
~~~
Open the printed URL (observed here: http://127.0.0.1:5173/). Without a real configured backend, independent sign-in and persistence correctly remain unavailable. /legacy retains the existing owner application and requires genuine Sites authentication; local mock-owner injection is disabled.

## Complete the accepted Windows prerequisite path
The current installation attempt failed with 0x80072ee2, and a non-admin session cannot complete Windows optional-feature setup. From Administrator PowerShell, after resolving the package/network failure:
~~~powershell
.\scripts\setup-windows-v3.ps1 -Install
~~~
The script uses official winget packages, WSL2 and Rancher Desktop Moby with Kubernetes disabled. It does not reboot. If Windows reports a required restart, the user must restart manually and rerun the script. It neither changes security policy nor switches to an unsupported substitute stack.

After docker info confirms the engine:
~~~powershell
.\scripts\start-v3-local.ps1 -StartSupabase
~~~
This starts the distinct local Supabase project, obtains its local status without printing key values, merges loopback settings into ignored .dev.vars and starts the frontend. Existing environment contents are backed up privately before replacement. Never archive .dev.vars, .env, local status output or tokens.

Local APIs: Supabase http://127.0.0.1:54321; Studio :54323; Mailpit :54324. These are configured local ports, not proof that services currently run. Migrations:
~~~powershell
pnpm exec supabase migration up --local
node scripts/test-supabase-local.mjs
~~~
The integration script only permits loopback targets, uses real local email OTPs from Mailpit, creates uniquely named disposable local accounts, and refuses to pass when the stack is missing. It retains its local fixtures for investigation. It does not test Google or human onboarding speed.

## Google and session configuration
Configure the owner's authorized Google OAuth client in the local Supabase environment; use the matching local Auth callback http://127.0.0.1:54321/auth/v1/callback and approved local app redirects. Set auth.external.google.enabled in local Supabase config and V3_GOOGLE_ENABLED=1 in .dev.vars only after configuration. Restart the relevant local services. Do not put client secrets into this chat, source, screenshots or browser code. Observe a real Google journey before claiming consumer readiness.

HTTPS deployments set Secure HttpOnly SameSite=Lax cookies; loopback HTTP development omits Secure for its local cookie. Requests verify Auth /user. Expired sessions require a fresh login or the explicit refresh endpoint; automatic cross-tab refresh has not been certified. Logout clears browser cookies even if server-wide revocation cannot be confirmed.

## Separate quantitative worker
~~~powershell
uv sync --project quant --frozen
uv run --project quant souls-quant health
uv run --project quant pytest quant/tests -q
~~~
Ingestion requires an operator-reviewed JSON containing bars, a rights record, complete source sessions, dated memberships and a complete corporate-action manifest. No real dataset is included. Example command syntax:
~~~text
uv run --project quant souls-quant ingest --input <reviewed-local-input.json> --root <private-data-root> --as-of <UTC-cutoff>
uv run --project quant souls-quant cache --manifest <private-manifest.json> --root <private-cache-root> --as-of <UTC-cutoff>
uv run --project quant souls-quant screen --manifest <private-manifest.json> --cache <private-cache-root> --scan <typed-scan.json> --as-of <UTC-cutoff>
uv run --project quant souls-quant work-once --catalog <reviewed-local-catalog.json> --cache <private-cache-root>
~~~
Angle-bracket items are real required paths/values, not bundled data. Test fixtures are rejected by production calls. QUANT_WORKER_ACCESS_TOKEN belongs to a separately enrolled restricted worker. Do not use a service-role key in the browser or a general user identity as an unattended worker. No worker is enrolled/connected in the real backend. V3_QUANT_ENABLED defaults to 0.

The queue currently supports cached SCREEN jobs. The walk-forward evaluator is a separate tested Python API and is not yet wired to a certified end-to-end backtest screen. Do not relabel a screen as a backtest.

## Verification and operations
~~~powershell
npm run verify
npm run build
uv run --project quant pytest quant/tests -q
pnpm audit
~~~
The embedded PostgreSQL tests verify actual migrations/RLS with a test Auth/Storage schema. The HTTP tests explicitly mock the Auth transport. Neither replaces the real local integration script.

Preserve old Parquet generations and CURRENT pointers before corrective ingestion; a failed checksum or writer lock must stop publication. An interrupted writer leaves evidence for investigation; do not delete arbitrary data to force a retry. Back up PostgreSQL and private Storage separately before later migrations, rehearse restore into an isolated target and compare counts/hashes. Never run db reset or production migration commands against research data.

Official setup references checked 14 November 2026: [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands), [Rancher Windows installation](https://docs.rancherdesktop.io/getting-started/installation/), [rdctl](https://docs.rancherdesktop.io/references/rdctl-command-reference/), [Supabase local development](https://supabase.com/docs/guides/local-development), [Supabase config](https://supabase.com/docs/guides/local-development/cli/config), [PostgREST RPC shapes](https://docs.postgrest.org/en/stable/references/api/functions.html), [Mailpit API](https://mailpit.axllent.org/docs/api-v1/).
