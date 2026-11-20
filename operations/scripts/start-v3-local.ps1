param([switch]$StartSupabase)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
$manifest=Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
if($manifest.name -ne 'strategic-souls-private-research'){throw 'Project identity mismatch. Nothing started.'}
if(-not (Test-Path -LiteralPath 'node_modules')){& pnpm install --frozen-lockfile;if($LASTEXITCODE -ne 0){throw 'Dependency installation failed.'}}
if($StartSupabase){
 if(-not (Get-Command docker -ErrorAction SilentlyContinue)){throw 'Container engine is unavailable. Complete operations/scripts/setup-windows-v3.ps1 first.'}
 & docker info --format '{{.ServerVersion}}'
 if($LASTEXITCODE -ne 0){throw 'Moby is not healthy.'}
 $privateLog=Join-Path $projectRoot '.sites-runtime/supabase-start.log'
 New-Item -ItemType Directory -Path (Split-Path $privateLog) -Force | Out-Null
 & pnpm exec supabase start *> $privateLog
 if($LASTEXITCODE -ne 0){throw 'Local Supabase startup failed. Private diagnostic log is in .sites-runtime. No success is implied.'}
 $statusJson=& pnpm exec supabase status --output json 2>$null
 if($LASTEXITCODE -ne 0){throw 'Local status not available.'}
 $statusJson | & node operations/scripts/write-local-env.mjs
 if($LASTEXITCODE -ne 0){throw 'Local environment configuration failed.'}
}
Write-Output 'Starting LOCAL V3. Production remains unchanged. Open the printed local URL.'
& npm run dev:hmr
exit $LASTEXITCODE
