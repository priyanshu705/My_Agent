@echo off
REM Builds the web UI once so the agent can show it at http://localhost:8000 (needs Node.js 18+).
cd /d "%~dp0"
if exist web\out\index.html exit /b 0
where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js nahi mila. UI banane ke liye https://nodejs.org se Node.js 18+ install karo, phir dobara chalao.
    echo Tab tak hosted UI use kar sakte ho: https://my-agent-ui-three.vercel.app
    exit /b 0
)
echo UI pehli baar ban raha hai ^(1-2 minute^)...
pushd web
call npm install --no-audit --no-fund
call npm run build:local
popd
exit /b 0
