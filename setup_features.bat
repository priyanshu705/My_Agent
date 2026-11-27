@echo off
setlocal
cd /d "%~dp0"
if not exist data mkdir data
set PYTHONIOENCODING=utf-8
echo Setup is running. This can take several minutes (pip installs). Please wait...
call :main > "data\setup_log.txt" 2>&1
echo.
echo ===== Result (also saved in data\setup_log.txt) =====
type "data\setup_log.txt"
echo.
pause
exit /b

:main
echo === 1. Python
python --version || (echo [FAIL] Python not found in PATH & exit /b 1)
echo === 2. .env present?
if not exist .env (echo [FAIL] .env not found in this folder. Copy your existing .env here, then run again. & exit /b 1)
echo === 3. Virtual environment .venv
if not exist .venv\Scripts\activate.bat (python -m venv .venv || (echo [FAIL] could not create .venv & exit /b 1))
call .venv\Scripts\activate.bat
echo === 4. pip install -r requirements.txt
python -m pip install -r requirements.txt || echo [FAIL] requirements.txt install had errors
echo === 5. pip install -r requirements-extra.txt
python -m pip install -r requirements-extra.txt || echo [FAIL] requirements-extra.txt install had errors
echo === 6. Check browser-use and mcp import
python -c "import browser_use, mcp; print('browser_use and mcp import OK')" || (echo [STOP] extra packages not installed correctly. Flags NOT changed. & exit /b 1)
echo === 7. uv (needed by Windows-MCP, installed from PyPI into this project's .venv only)
where uv >nul 2>&1 || python -m pip install uv
where uvx >nul 2>&1 && (uv --version) || (echo [STOP] uv/uvx not available. Flags NOT changed. & exit /b 1)
echo === 8. Set WINDOWS_MCP=1, BROWSER_AGENT=1, KOKORO_TTS=0 (only after installs succeeded)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_env_flags.ps1" || (echo [FAIL] .env edit failed & exit /b 1)
echo === 9. TEST A1: tests\test_wmcp.py
python tests\test_wmcp.py
echo EXIT CODE: %errorlevel%
echo === 10. TEST A2: tests\test_agent_router.py
python tests\test_agent_router.py
echo EXIT CODE: %errorlevel%
echo === DONE. Start the agent with run.bat (it activates .venv, so uvx is found).
exit /b 0
