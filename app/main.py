"""Local server: serves the web UI and runs the agent. Start with run.bat or:
python -m uvicorn app.main:app --port 8000
"""

import os
import threading
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import HTMLResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import dashboard, tts_local, wakeword  # noqa: E402
from .memory_tools import pop_due_reminders  # noqa: E402
from .util import RateLimiter  # noqa: E402
from .whatsapp_tools import pop_notices, start_scheduler  # noqa: E402

app = FastAPI(title="My_Agent")
SESSION_ID = r"^[A-Za-z0-9_-]{1,64}$"
_limiter = RateLimiter()
# path -> (max requests per minute for remote clients, for the PC itself)
_LIMITS = {"/api/chat": (20, 60), "/api/confirm": (30, 60), "/api/tts": (20, 60), "/api/reset": (20, 60)}


@app.middleware("http")
async def limits(request: Request, call_next):
    """Cap request body size and request rate on the expensive endpoints."""
    if request.method == "POST":
        try:
            if int(request.headers.get("content-length") or 0) > 64_000:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Bad Content-Length"}, status_code=400)
    lim = _LIMITS.get(request.url.path)
    if lim:
        remote, local = lim
        if not _limiter.allow(f"{request.url.path}:{dashboard.client_ip(request)}", local if dashboard.is_local(request) else remote):
            return JSONResponse({"detail": "Too many requests. Please slow down."}, status_code=429)
    return await call_next(request)


UI_DIR = ROOT / "web" / "out"  # the web/ app built with `npm run build:local` (run.bat does this)
_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    h = resp.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
    if not request.url.path.startswith("/api/") and request.url.path != "/login":
        h.setdefault("Content-Security-Policy", _CSP)
    return resp


app.middleware("http")(dashboard.guard)  # PC is always allowed; everyone else needs ACCESS_PIN login
# Added after the guard so it is outermost: browser preflight (OPTIONS) is answered before auth.
app.add_middleware(CORSMiddleware, allow_origins=dashboard.allowed_origins(),
                   allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])
app.include_router(dashboard.router)
start_scheduler()
wakeword.start()

_agent = None
_agent_lock = threading.Lock()


def google_connected() -> bool:
    from .google_tools import is_connected
    return is_connected()


def demo_mode() -> bool:
    key = os.getenv("GEMINI_API_KEY", "")
    return os.getenv("DEMO_MODE") == "1" or not key or key == "paste_your_key_here"


def agent():
    global _agent
    if _agent is None:
        with _agent_lock:
            if _agent is None:
                from . import safety
                safety.harden()
                from .agent import Agent
                if demo_mode():
                    from .demo_agent import DemoAgent
                    new = DemoAgent()
                else:
                    try:
                        new = Agent()
                    except RuntimeError as e:
                        raise HTTPException(500, str(e))
                dashboard.install_activity_hook(new)
                _agent = new
    return _agent


class ChatIn(BaseModel):
    text: str = Field(max_length=4000)
    session_id: str = Field(default="default", pattern=SESSION_ID)


class ConfirmIn(BaseModel):
    approved: bool
    confirm_id: str = Field(default="", max_length=64)
    session_id: str = Field(default="default", pattern=SESSION_ID)


class ResetIn(BaseModel):
    session_id: str = Field(default="default", pattern=SESSION_ID)


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
    text: str = Field(max_length=1500)
    voice: str = Field(default="hf_alpha", pattern=r"^[A-Za-z0-9_]{1,32}$")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


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
    result = agent().confirm(body.session_id, body.approved, body.confirm_id)
    dashboard.record(body.session_id, "Haan" if body.approved else "Na", result)
    return result


@app.post("/api/reset")
def reset(body: ResetIn):
    agent().reset(body.session_id)
    return {"ok": True}


@app.get("/api/reminders/due")
def due():
    return {"due": pop_due_reminders(), "notices": pop_notices()}


NO_UI_HTML = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>My_Agent</title><body style="font:16px system-ui;background:#050912;color:#e6f1ff;max-width:560px;margin:12vh auto;padding:0 20px">
<h2>The agent is running, but its web UI is not built yet</h2>
<p>Run <code>run.bat</code> again (it builds the UI once, needs Node.js 18+), or in the <code>web</code> folder run
<code>npm install</code> then <code>npm run build:local</code>, and refresh this page.</p>
<p>You can also use the hosted UI: <a style="color:#19d3ff" href="%s">%s</a></p>"""


def _no_ui():
    url = os.getenv("UI_URL", "https://my-agent-ui-three.vercel.app")
    return HTMLResponse(NO_UI_HTML % (url, url))


# Must be last: the built web/ app is served at "/" and the API/login routes above take priority.
if (UI_DIR / "index.html").is_file():
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")
else:
    app.add_api_route("/", _no_ui, methods=["GET"], include_in_schema=False)
