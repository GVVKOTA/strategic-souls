@echo off
setlocal
cd /d "%~dp0..\.."
powershell.exe -NoProfile -File "%~dp0start-v3-local.ps1"
if errorlevel 1 pause
