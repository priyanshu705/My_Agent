@echo off
REM One-time Google login for Gmail + Calendar (Phase 2)
cd /d "%~dp0"
if not exist .venv (echo Pehle run.bat ek baar chalao. & pause & exit /b)
call .venv\Scripts\activate
pip install -q -r requirements.txt
if not exist credentials.json (
    echo credentials.json is folder mein nahi mili. README ke Phase 2 steps dekho.
    pause
    exit /b
)
echo Browser mein Google login khulega. Apna account chuno aur Allow dabao.
python -m app.google_tools
pause
