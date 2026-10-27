"""Local server: serves the web UI and runs the agent. Start with run.bat or:
    python -m uvicorn app.main:app --port 8000
"""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from .memory_tools import pop_due_reminders  # noqa: E402

app = FastAPI(title="My_Agent")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

_agent = None


def agent():
    global _agent
    if _agent is None:
        from .agent import Agent
        try:
            _agent = Agent()
        except RuntimeError as e:
            raise HTTPException(500, str(e))
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
        "has_key": bool(os.getenv("GEMINI_API_KEY")),
    }


@app.post("/api/chat")
def chat(body: ChatIn):
    if not body.text.strip():
        return {"reply": "Kuch suna nahi, phir se bolo?", "actions": []}
    return agent().chat(body.session_id, body.text.strip())


@app.post("/api/confirm")
def confirm(body: ConfirmIn):
    return agent().confirm(body.session_id, body.approved)


@app.post("/api/reset")
def reset(body: ConfirmIn):
    agent().reset(body.session_id)
    return {"ok": True}


@app.get("/api/reminders/due")
def due():
    return {"due": pop_due_reminders()}
