"""Settings that can be changed from the web UI instead of editing .env by hand.

Only for a browser on this PC, on the app's own page: never for phones, tunnels, the hosted UI or other websites.
Only the names listed here can be written, and saved keys are never sent back.
"""

import importlib.util
import os
import re
import shutil
import threading
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import dashboard
from .util import atomic_write

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
_KEY = r"[A-Za-z0-9._~+/=:-]{8,300}"
# name -> (kind, allowed value pattern); an empty value always means "remove / off"
FIELDS = {
    "VOICE_ENGINE": ("choice", r"gemini|edge|kokoro|browser"),
    "GEMINI_TTS_KEY": ("secret", _KEY),
    "GEMINI_API_KEY": ("secret", _KEY),
    "LLM_ROUTER_URL": ("text", r"https?://[A-Za-z0-9._~:/?=&%\[\]-]{3,300}"),
    "LLM_ROUTER_KEY": ("secret", _KEY),
    "BROWSER_AGENT": ("flag", r"0|1"),
    "WINDOWS_MCP": ("flag", r"0|1"),
    "WAKEWORD_ENGINE": ("choice", r"openwakeword"),
    "FILE_ROOTS": ("folders", r"[^\"'#\r\n]{3,1000}"),  # extra folders the agent may see, separated by ;
}
AI_FIELDS = {"GEMINI_API_KEY", "LLM_ROUTER_URL", "LLM_ROUTER_KEY"}
RESTART_FIELDS = {"BROWSER_AGENT", "WINDOWS_MCP", "WAKEWORD_ENGINE"}
# feature -> Python packages it needs (requirements-extra.txt)
PACKAGES = {"edge": ["edge_tts"], "kokoro": ["kokoro_onnx"], "browser_agent": ["browser_use"],
            "desktop": ["mcp"], "wake": ["openwakeword", "sounddevice"]}
LOCAL_NAMES = {"127.0.0.1", "localhost", "::1"}

router = APIRouter()
on_ai_change = None  # set by main.py: forget the running agent so the next message uses the new keys
_lock = threading.Lock()
_restart: set[str] = set()


def _only_this_pc(request: Request) -> None:
    host = request.headers.get("host", "")
    origin = request.headers.get("origin")
    ok = (dashboard.is_local(request)
          and urlsplit("//" + host).hostname in LOCAL_NAMES  # blocks DNS rebinding
          and (origin is None or origin in (f"http://{host}", f"https://{host}"))
          and request.headers.get("sec-fetch-site", "same-origin") in ("same-origin", "none"))
    if not ok:
        raise HTTPException(403, "Settings can only be changed on the PC itself, at http://localhost:8000.")


def current_engine() -> str:
    """Which voice /api/tts uses. VOICE_ENGINE wins; without it the older on/off flags decide."""
    chosen = os.getenv("VOICE_ENGINE", "").strip().lower()
    if re.fullmatch(FIELDS["VOICE_ENGINE"][1], chosen):
        return chosen
    if os.getenv("EDGE_TTS", "0") == "1":
        return "edge"
    return "kokoro" if os.getenv("KOKORO_TTS", "0") == "1" else "browser"


def _state() -> dict:
    fields = {}
    for name, (kind, _) in FIELDS.items():
        value = os.getenv(name, "").strip()
        value = "" if value == "paste_your_key_here" else value
        fields[name] = {"set": bool(value)} if kind == "secret" else {"set": bool(value), "value": value}
    installed = {k: all(importlib.util.find_spec(m) is not None for m in mods) for k, mods in PACKAGES.items()}
    installed["uvx"] = shutil.which("uvx") is not None
    return {"fields": fields, "voice_engine": current_engine(), "installed": installed, "restart_needed": sorted(_restart)}


def write_env(values: dict[str, str], path: Path | None = None) -> None:
    """Set NAME=value lines in .env, leaving every other line as it is."""
    path = path or ENV_FILE
    lines = path.read_text(encoding="utf-8-sig").splitlines() if path.exists() else []
    for name, value in values.items():
        pattern = re.compile(rf"^\s*(export\s+)?{name}\s*=")
        new, done = [], False
        for line in lines:
            if not pattern.match(line):
                new.append(line)
            elif not done:
                new.append(f"{name}={value}")
                done = True
        lines = new if done else new + [f"{name}={value}"]
    atomic_write(path, "\n".join(lines) + "\n")


def _check_folders(value: str) -> str:
    """Every folder must exist, and Windows' own folders or all of the system drive are refused."""
    system = Path(os.environ.get("SystemRoot", r"C:\Windows")).resolve()
    blocked = [system, *(Path(os.environ[n]).resolve() for n in ("ProgramFiles", "ProgramFiles(x86)", "ProgramData", "APPDATA",
                                                                 "LOCALAPPDATA") if os.environ.get(n))]
    out = []
    for raw in (x.strip() for x in value.split(";")):
        if not raw:
            continue
        p = Path(raw)
        if not p.is_absolute() or raw.startswith("\\\\") or not p.is_dir():
            raise HTTPException(400, f"Folder not found: {raw}. Give the full path, for example D:\\placement.")
        p = p.resolve()
        if p == Path(system.anchor) or any(p == b or b in p.parents for b in blocked):
            raise HTTPException(400, f"{raw} holds Windows or program files, so it cannot be added.")
        out.append(str(p))
    return ";".join(out)


class SetupIn(BaseModel):
    values: dict[str, str] = Field(min_length=1, max_length=len(FIELDS))


@router.get("/api/setup")
def read_setup(request: Request):
    _only_this_pc(request)
    return _state()


@router.post("/api/setup")
def save_setup(body: SetupIn, request: Request):
    _only_this_pc(request)
    if request.headers.get("x-agent-setup") != "1":  # a header other websites cannot add without permission
        raise HTTPException(403, "Missing setup header.")
    values = {}
    for name, raw in body.values.items():
        if name not in FIELDS:
            raise HTTPException(400, "Unknown setting.")
        value = raw.strip()
        if value and not re.fullmatch(FIELDS[name][1], value):
            raise HTTPException(400, f"{name} does not look right. Check for spaces or missing characters.")
        values[name] = _check_folders(value) if value and FIELDS[name][0] == "folders" else value
    url =values.get("LLM_ROUTER_URL")
    if url and url != os.getenv("LLM_ROUTER_URL", "").strip() and os.getenv("LLM_ROUTER_KEY") and not values.get("LLM_ROUTER_KEY"):
        raise HTTPException(400, "You changed the router address, so enter the router key again.")
    with _lock:
        changed = {n for n, v in values.items() if v != os.getenv(n, "").strip()}
        try:
            write_env(values)
        except (OSError, UnicodeError) as e:
            raise HTTPException(500, f"Could not write .env ({type(e).__name__}).")
        for name, value in values.items():
            os.environ[name] = value
        _restart.update(changed & RESTART_FIELDS)
    if changed & AI_FIELDS and on_ai_change:
        on_ai_change()
    return _state()
