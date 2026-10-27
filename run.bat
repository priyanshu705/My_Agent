@echo off
REM One-click start for My_Agent on Windows
cd /d "%~dp0"

if not exist .venv (
    echo Pehli baar setup ho raha hai...
    python -m venv .venv || (echo Python install karo: https://www.python.org/downloads/ & pause & exit /b)
    call .venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate
)

if not exist .env (
    copy .env.example .env >nul
    echo .env file bani hai. Usme apni GEMINI_API_KEY daalo, phir run.bat dobara chalao.
    notepad .env
    pause
    exit /b
)

start "" http://localhost:8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
