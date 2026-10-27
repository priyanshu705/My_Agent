@echo off
REM Start My_Agent so your phone (same Wi-Fi) can open it too. Needs ACCESS_PIN in .env.
cd /d "%~dp0"

if not exist .venv (
  echo Pehle run.bat ek baar chalao, phir ye.
  pause
  exit /b
)
call .venv\Scripts\activate

findstr /b /c:"ACCESS_PIN=" .env >nul 2>&1 || (
  echo .env mein ACCESS_PIN=1234 jaisi line add karo ^(apna PIN rakho^), phir dobara chalao.
  notepad .env
  pause
  exit /b
)

echo.
echo Phone par ye address kholo ^(PC aur phone same Wi-Fi par hon^): UI ke Settings mein bhi dikhega.
echo Windows firewall puchhe to "Private networks" allow karo.
echo.
start "" http://localhost:8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
