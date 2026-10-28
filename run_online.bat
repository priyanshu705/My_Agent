@echo off
REM Put My_Agent online (free Cloudflare tunnel) so the Vercel UI / your phone can reach this PC from anywhere.
cd /d "%~dp0"

if not exist .venv (
  echo Pehle run.bat ek baar chalao, phir ye.
  pause
  exit /b
)
call .venv\Scripts\activate
pip install -q -r requirements.txt

findstr /b /r /c:"ACCESS_PIN=.......*" .env >nul 2>&1 || (
  echo .env mein kam se kam 6 characters ka PIN daalo, jaise: ACCESS_PIN=meraPin2026
  notepad .env
  pause
  exit /b
)

python online.py
pause
