@echo off
setlocal
cd /d "%~dp0"
rem ExecutionPolicy applies only to this PowerShell process; no system policy change.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prompt.ps1"
echo.
pause
