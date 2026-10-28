@echo off
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\My_Agent.vbs"
if exist "%VBS%" (del "%VBS%" && echo Autostart band kar diya.) else (echo Autostart pehle se band hai.)
pause
