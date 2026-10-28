"""Local server: serves the web UI and runs the agent. Start with run.bat or:
python -m uvicorn app.main:app --port 8000
"""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import dashboard, tts_local, wakeword  # noqa: E402
from .memory_tools import pop_due_reminders  # noqa: E402
from .whatsapp_tools import pop_notices, start_scheduler  # noqa: E402

app = FastAPI(title="My_Agent")
app.middleware("http")(dashboard.guard)  # PC is always allowed; everyone else needs ACCESS_PIN login
# Added after the guard so it is outermost: browser preflight (OPTIONS) is answered before auth.
app.add_middleware(CORSMiddleware, allow_origins=dashboard.allowed_origins(),
                   allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])
app.include_router(dashboard.router)
start_scheduler()
wakeword.start()
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

_agent = None


def google_connected() -> bool:
    from .google_tools import is_connected
    return is_connected()


def demo_mode() -> bool:
    key = os.getenv("GEMINI_API_KEY", "")
    return os.getenv("DEMO_MODE") == "1" or not key or key == "paste_your_key_here"


def agent():
    global _agent
    if _agent is None:
        from . import safety
        safety.harden()
        from .agent import Agent
        if demo_mode():
            from .demo_agent import DemoAgent
            _agent = DemoAgent()
        else:
            try:
                _agent = Agent()
            except RuntimeError as e:
                raise HTTPException(500, str(e))
        dashboard.install_activity_hook(_agent)
    return _agent


class ChatIn(BaseModel):
    text: str
    session_id: str = "default"


class ConfirmIn(BaseModel):
    approved: bool
    session_id: str = "default"


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/config")
def config():
    return {
        "agent_name": os.getenv("AGENT_NAME", "Agent"),
        "wake_word": os.getenv("WAKE_WORD", "hey agent"),
        "user_name": os.getenv("USER_NAME", "Om"),
        "recognition_lang": os.getenv("RECOGNITION_LANG", "en-IN"),
        "voice_lang": os.getenv("VOICE_LANG", "en-IN"),
        "has_key": not demo_mode(),
        "demo": demo_mode(),
        "local_tts": tts_local.enabled(),
        "wake_engine": "oww" if wakeword.enabled() else "browser",
        "google_connected": google_connected(),
        "phone_url": f"http://{dashboard.lan_ip()}:8000" if os.getenv("ACCESS_PIN") else "",
        "tunnel_url": dashboard.tunnel_url(),
        "ui_url": os.getenv("UI_URL", "https://my-agent-roan-delta.vercel.app"),
    }


@app.get("/api/wake")
def wake():
    """Counter that goes up each time the offline wake word is heard (see app/wakeword.py)."""
    return wakeword.status()


class TtsIn(BaseModel):
    text: str
    voice: str = "hf_alpha"
    speed: float = 1.0


@app.post("/api/tts")
def tts(body: TtsIn):
    """Hindi speech from the free local Kokoro model (opt-in with KOKORO_TTS=1). Returns audio/wav."""
    try:
        return Response(tts_local.synthesize(body.text, body.voice, body.speed), media_type="audio/wav")
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/chat")
def chat(body: ChatIn):
    text = body.text.strip()
    if not text:
        return {"reply": "I did not catch that. Could you say it again?", "actions": []}
    result = agent().chat(body.session_id, text)
    dashboard.record(body.session_id, text, result)
    return result


@app.post("/api/confirm")
def confirm(body: ConfirmIn):
    result = agent().confirm(body.session_id, body.approved)
    dashboard.record(body.session_id, "Haan" if body.approved else "Na", result)
    return result


@app.post("/api/reset")
def reset(body: ConfirmIn):
    agent().reset(body.session_id)
    return {"ok": True}


@app.get("/api/reminders/due")
def due():
    return {"due": pop_due_reminders(), "notices": pop_notices()}
