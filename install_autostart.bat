@echo off
REM Start My_Agent (online, hidden) every time you log in to Windows.
cd /d "%~dp0"
if not exist .venv\Scripts\pythonw.exe (
  echo Pehle run.bat ek baar chalao, phir ye.
  pause
  exit /b
)
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\My_Agent.vbs"
> "%VBS%" echo Set s = CreateObject("Wscript.Shell")
>> "%VBS%" echo s.CurrentDirectory = "%~dp0"
>> "%VBS%" echo s.Run """%~dp0.venv\Scripts\pythonw.exe"" ""%~dp0online.py"" --no-browser", 0, False
echo Autostart ON. Ab PC on hote hi agent chalega (hidden).
echo Naya link: data\phone_link.txt ya http://localhost:8000 ki Settings mein dikhega.
echo Band karne ke liye remove_autostart.bat chalao.
pause
