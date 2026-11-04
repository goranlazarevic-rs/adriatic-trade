@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\AdriaticTrade\FiscalArchive\run.ps1"
echo.
pause
