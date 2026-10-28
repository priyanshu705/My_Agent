@echo off
REM Connects this PC to your cloud assistant so you can command it from your phone.
REM Needs CLOUD_URL and CLOUD_PIN in .env. Keep this window open (or use install_autostart.bat).
cd /d "%~dp0"
if not exist .venv (
    python -m venv .venv || (echo Install Python first: https://www.python.org/downloads/ & pause & exit /b)
    call .venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate
)
python -m app.relay
pause
