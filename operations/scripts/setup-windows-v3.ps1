param([switch]$Install)
$ErrorActionPreference='Stop'
# Current official references are in documentation/specs/V3_LOCAL_STACK_SPEC.md. This script never reboots.
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ('Administrator session: '+$isAdmin)
Write-Output ('OS: '+[Environment]::OSVersion.VersionString)
& wsl --status
if(-not $Install){Write-Output 'Inspection only. Use -Install from Administrator PowerShell to perform the accepted prerequisite setup.';exit 0}
if(-not $isAdmin){throw 'Administrator Windows feature setup is required. Open Administrator PowerShell and rerun this script with -Install. It will not reboot.'}
if(-not (Get-Command winget -ErrorAction SilentlyContinue)){throw 'Windows Package Manager is unavailable.'}
$feature=Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform
$restartNeeded=$false
if($feature.State -ne 'Enabled'){
 $changed=Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart
 $restartNeeded=$changed.RestartNeeded
}
& winget list --id Microsoft.WSL --exact --source winget --disable-interactivity *> $null
if($LASTEXITCODE -ne 0){& winget install --id Microsoft.WSL --exact --source winget --silent --disable-interactivity --no-upgrade}
if($LASTEXITCODE -ne 0){throw ('WSL installation did not complete. Exit '+$LASTEXITCODE+'. Resolve the package/network error before continuing.')}
if($restartNeeded){Write-Output 'A manual restart is required before container verification. This script will not restart the PC. Rerun it after your manual restart.';exit 2}
& winget list --id SUSE.RancherDesktop --exact --source winget --disable-interactivity *> $null
if($LASTEXITCODE -ne 0){& winget install --id SUSE.RancherDesktop --exact --source winget --silent --disable-interactivity --no-upgrade}
if($LASTEXITCODE -ne 0){throw ('Rancher Desktop installation did not complete. Exit '+$LASTEXITCODE)}
$rdCandidates=@(
 (Join-Path $env:ProgramFiles 'Rancher Desktop/resources/resources/win32/bin/rdctl.exe'),
 (Join-Path $env:LOCALAPPDATA 'Programs/Rancher Desktop/resources/resources/win32/bin/rdctl.exe')
)
$rdctl=Get-Command rdctl -ErrorAction SilentlyContinue
if($rdctl){$rdPath=$rdctl.Source}else{$rdPath=$rdCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1}
if(-not $rdPath){throw 'rdctl is not on PATH or at the documented installation candidates. Reopen this terminal after installation.'}
& $rdPath start --application.start-in-background=true --container-engine.name=moby --kubernetes.enabled=false --wait --wait-timeout=60s
if($LASTEXITCODE -ne 0){throw 'Rancher backend is not healthy. Do not treat the local database as running.'}
Write-Output 'Moby startup returned success. Verify docker info, then run operations/scripts/start-v3-local.ps1 -StartSupabase.'
