@echo off
REM One-time WhatsApp login (Phase 3): scan the QR code with your phone
cd /d "%~dp0"
if not exist .venv (echo Pehle run.bat ek baar chalao. & pause & exit /b)
call .venv\Scripts\activate
pip install -q -r requirements.txt
echo Agar run.bat chal raha hai to pehle use band karo.
echo Phone mein WhatsApp kholo: Settings ^> Linked devices ^> Link a device, aur window ka QR scan karo.
python -m app.whatsapp_tools
pause
