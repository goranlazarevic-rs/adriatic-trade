@echo off
cd /d "%~dp0..\.."
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
  echo Potreban je Node.js 24 ili noviji. Instalirajte ga, pa ponovo pokrenite ovaj fajl.
  pause
  exit /b 1
)
echo Otvorite http://127.0.0.1:4317 u browseru nakon pokretanja servera.
node tools/integration-lab/server.mjs
pause
