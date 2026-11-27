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

from . import dashboard, setup_api, tts_edge, tts_gemini, tts_local, wakeword  # noqa: E402
from .memory_tools import pop_due_reminders  # noqa: E402
from .pages import no_ui_html  # noqa: E402
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
app.include_router(setup_api.router)
start_scheduler()
wakeword.start()

_agent = None
_agent_lock = threading.Lock()


def google_connected() -> bool:
    from .google_tools import is_connected
    return is_connected()


def demo_mode() -> bool:
    from . import llm_router
    key = os.getenv("GEMINI_API_KEY", "").strip()
    has_gemini = bool(key) and key != "paste_your_key_here"
    return os.getenv("DEMO_MODE") == "1" or not (has_gemini or llm_router.configured())


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


def _forget_agent() -> None:
    """After new AI keys are saved: build a new agent on the next message (a question still waiting is dropped)."""
    global _agent
    with _agent_lock:
        _agent = None


setup_api.on_ai_change = _forget_agent


class ChatIn(BaseModel):
    text: str = Field(max_length=4000)
    session_id: str = Field(default="default", pattern=SESSION_ID)


class ConfirmIn(BaseModel):
    approved: bool
    confirm_id: str = Field(default="", max_length=64)
    session_id: str = Field(default="default", pattern=SESSION_ID)


class ResetIn(BaseModel):
    session_id: str = Field(default="default", pattern=SESSION_ID)


def model_name() -> str:
    """Name of the model answering chats (never a key). Safe to show in the UI."""
    if demo_mode():
        return "Demo mode (rule-based)"
    from . import llm_router
    if llm_router.configured():
        return "AI router (" + os.getenv("LLM_ROUTER_MODEL", "auto") + ")"
    try:
        from .agent import GEMINI_FALLBACKS
        return os.getenv("GEMINI_MODEL", GEMINI_FALLBACKS[0])
    except Exception:
        return os.getenv("GEMINI_MODEL", "Gemini")


def integration_flags() -> dict:
    """Non-secret on/off state of optional features, for the Integrations screen."""
    from . import windows_mcp
    return {
        "gemini_key": bool(os.getenv("GEMINI_API_KEY")) and os.getenv("GEMINI_API_KEY") != "paste_your_key_here",
        "llm_router": bool(os.getenv("LLM_ROUTER_URL") and os.getenv("LLM_ROUTER_KEY")),
        "whatsapp_session": (ROOT / "data" / "wa_profile").exists(),
        "browser_agent": os.getenv("BROWSER_AGENT", "0") == "1",
        "desktop_automation": windows_mcp.enabled(),
        "wake_engine_enabled": wakeword.enabled(),
        "wake_engine_running": bool(wakeword.status().get("running")),
        "wake_engine_error": wakeword.status().get("error", ""),
    }


DEFAULT_UI_URL = "https://my-agent-ui-three.vercel.app"  # the hosted UI (cloud/index.html points here too)


def ui_url() -> str:
    return os.getenv("UI_URL", DEFAULT_UI_URL)


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
        "voice_engine": setup_api.current_engine(),
        "wake_engine": "oww" if wakeword.enabled() else "browser",
        "google_connected": google_connected(),
        "phone_url": f"http://{dashboard.lan_ip()}:8000" if os.getenv("ACCESS_PIN") else "",
        "tunnel_url": dashboard.tunnel_url(),
        "ui_url": ui_url(),
        "model": model_name(),
        "integrations": integration_flags(),
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
    """Speech from the voice chosen under Integrations: Gemini, edge-tts or the offline Kokoro Hindi model.
    A 503 answer makes the web UI use the browser's own voice."""
    engine = setup_api.current_engine()
    try:
        if engine == "gemini":
            return Response(tts_gemini.synthesize(body.text, body.voice), media_type="audio/wav")
        if engine == "edge":
            return Response(tts_edge.synthesize(body.text, body.voice), media_type="audio/mpeg")
        if engine == "browser":
            raise RuntimeError("The browser voice is selected.")
        if os.getenv("VOICE_ENGINE", "").strip().lower() == "kokoro":
            os.environ["KOKORO_TTS"] = "1"
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


@app.post("/api/cancel")
def cancel(body: ResetIn):
    """Stop a running request before its next step. A step that is already running is not interrupted."""
    stop = getattr(_agent, "cancel", None)
    return {"ok": True, "stopping": bool(stop and stop(body.session_id))}


def _pending_ask(session_id: str):
    ask = getattr(_agent, "pending_ask", None)
    return ask(session_id) if ask else None


dashboard.pending_provider = _pending_ask


@app.get("/api/reminders/due")
def due():
    return {"due": pop_due_reminders(), "notices": pop_notices()}


def _no_ui():
    return HTMLResponse(no_ui_html(ui_url()))


# Must be last: the built web/ app is served at "/" and the API/login routes above take priority.
if (UI_DIR / "index.html").is_file():
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")
else:
    app.add_api_route("/", _no_ui, methods=["GET"], include_in_schema=False)
