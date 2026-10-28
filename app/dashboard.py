"""UI support: chat history, dashboard data, live tool activity, and PIN login for phone access.

Nothing here is an AI tool. It only feeds the web UI in static/.
"""

import hmac
import json
import os
import secrets
import socket
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from . import memory_tools as mem

ROOT = Path(__file__).resolve().parent.parent
HISTORY_FILE = ROOT / "data" / "chat_history.json"
router = APIRouter()
_lock = threading.Lock()

MAX_SESSIONS = 50
MAX_MESSAGES = 300


# ---------------------------------------------------------------- chat history

def _load() -> dict:
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"sessions": {}}


def _save(db: dict) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(db, ensure_ascii=False), encoding="utf-8")


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def record(session_id: str, user_text: str | None, result: dict) -> None:
    """Store one exchange (called from main.py after the agent answers)."""
    with _lock:
        db = _load()
        s = db["sessions"].setdefault(session_id, {"title": "", "created": _now(), "messages": []})
        if user_text:
            s["messages"].append({"role": "user", "text": user_text, "at": _now()})
            if not s["title"]:
                s["title"] = user_text[:48]
        s["messages"].append({
            "role": "bot", "text": result.get("reply", ""), "at": _now(),
            "actions": [{"tool": a.get("tool"), "result": str(a.get("result", ""))[:300]}
                        for a in result.get("actions", [])],
            "confirm": result.get("confirm"),
        })
        s["messages"] = s["messages"][-MAX_MESSAGES:]
        s["updated"] = _now()
        if len(db["sessions"]) > MAX_SESSIONS:
            oldest = sorted(db["sessions"], key=lambda k: db["sessions"][k].get("updated", ""))
            for k in oldest[: len(db["sessions"]) - MAX_SESSIONS]:
                db["sessions"].pop(k, None)
        _save(db)


@router.get("/api/sessions")
def sessions():
    db = _load()["sessions"]
    rows = [{"id": k, "title": v.get("title") or "Nayi chat", "updated": v.get("updated", v.get("created", "")),
             "count": len(v.get("messages", []))} for k, v in db.items()]
    rows.sort(key=lambda r: r["updated"], reverse=True)
    return {"sessions": rows}


@router.get("/api/sessions/{sid}")
def session_messages(sid: str):
    s = _load()["sessions"].get(sid)
    return {"id": sid, "messages": s["messages"] if s else []}


@router.delete("/api/sessions/{sid}")
def delete_session(sid: str):
    with _lock:
        db = _load()
        db["sessions"].pop(sid, None)
        _save(db)
    return {"ok": True}


# ---------------------------------------------------------------- live activity

_activity = {"tool": "", "args": {}, "since": 0.0}


def install_activity_hook(agent) -> None:
    """Wrap agent._execute so the UI can show which tool is running right now."""
    original = getattr(agent, "_execute", None)
    if not original or getattr(agent, "_hooked", False):
        return

    def wrapped(call):
        _activity.update(tool=getattr(call, "name", ""), args=dict(getattr(call, "args", None) or {}),
                         since=time.time())
        try:
            return original(call)
        finally:
            _activity.update(tool="", args={}, since=0.0)

    agent._execute = wrapped
    agent._hooked = True


@router.get("/api/activity")
def activity():
    return {"tool": _activity["tool"], "args": _activity["args"],
            "seconds": round(time.time() - _activity["since"], 1) if _activity["since"] else 0}


# ---------------------------------------------------------------- dashboard data

def _google_ok() -> bool:
    try:
        from .google_tools import is_connected
        return is_connected()
    except Exception:
        return False


def _battery():
    try:
        import psutil
        b = psutil.sensors_battery()
        return {"percent": round(b.percent), "plugged": bool(b.power_plugged)} if b else None
    except Exception:
        return None


@router.get("/api/dashboard/local")
def dash_local():
    db = mem._load()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    todos = [{"i": i, **t} for i, t in enumerate(db.get("todos", []))]
    notes = [{"i": i, **n} for i, n in enumerate(db.get("notes", []))][-12:][::-1]
    reminders = sorted([r for r in db.get("reminders", []) if not r.get("fired")], key=lambda r: r["due"])
    return {
        "todos": todos, "notes": notes, "reminders": reminders, "now": now,
        "status": {
            "google": _google_ok(),
            "whatsapp": (ROOT / "data" / "wa_profile").exists(),
            "battery": _battery(),
        },
    }


_cache: dict[str, tuple[float, object]] = {}


def _cached(key: str, ttl: int, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


@router.get("/api/dashboard/calendar")
def dash_calendar():
    if not _google_ok():
        return {"connected": False, "events": []}

    def fetch():
        from .google_tools import _events_between, tz
        start = datetime.now(tz()).replace(hour=0, minute=0, second=0, microsecond=0)
        out = []
        for e in _events_between(start, start + timedelta(days=3), 25):
            s = e.get("start", {})
            if "dateTime" in s:
                st = datetime.fromisoformat(s["dateTime"].replace("Z", "+00:00")).astimezone(tz())
                en = datetime.fromisoformat(e["end"]["dateTime"].replace("Z", "+00:00")).astimezone(tz())
                out.append({"title": e.get("summary", "(no title)"), "day": st.strftime("%a %d %b"),
                            "time": f"{st:%I:%M %p} - {en:%I:%M %p}", "location": e.get("location", "")})
            else:
                d = datetime.strptime(s["date"], "%Y-%m-%d")
                out.append({"title": e.get("summary", "(no title)"), "day": d.strftime("%a %d %b"),
                            "time": "All day", "location": e.get("location", "")})
        return {"connected": True, "events": out}

    try:
        return _cached("cal", 60, fetch)
    except Exception as e:
        return {"connected": True, "events": [], "error": str(e)}


@router.get("/api/dashboard/mail")
def dash_mail():
    if not _google_ok():
        return {"connected": False, "mails": []}

    def fetch():
        import re
        from .google_tools import _gmail, _header
        g = _gmail()
        res = g.users().messages().list(userId="me", q="is:unread in:inbox", maxResults=8).execute()
        mails = []
        for m in res.get("messages", []):
            msg = g.users().messages().get(userId="me", id=m["id"], format="metadata",
                                           metadataHeaders=["From", "Subject", "Date"]).execute()
            sender = re.sub(r"\s*<.*?>", "", _header(msg, "From")).strip('" ')
            mails.append({"from": sender, "subject": _header(msg, "Subject") or "(no subject)",
                          "snippet": msg.get("snippet", "")[:120]})
        return {"connected": True, "mails": mails}

    try:
        return _cached("mail", 60, fetch)
    except Exception as e:
        return {"connected": True, "mails": [], "error": str(e)}


class TextIn(BaseModel):
    text: str


class ReminderIn(BaseModel):
    text: str
    minutes: int = 10


@router.post("/api/todos")
def todo_add(body: TextIn):
    if not body.text.strip():
        raise HTTPException(400, "empty")
    mem.add_todo(body.text.strip())
    return {"ok": True}


@router.post("/api/todos/{i}/toggle")
def todo_toggle(i: int):
    with mem._lock:
        db = mem._load()
        if not 0 <= i < len(db["todos"]):
            raise HTTPException(404, "no such todo")
        db["todos"][i]["done"] = not db["todos"][i]["done"]
        mem._save(db)
    return {"ok": True}


@router.post("/api/notes")
def note_add(body: TextIn):
    if not body.text.strip():
        raise HTTPException(400, "empty")
    mem.add_note(body.text.strip())
    return {"ok": True}


@router.post("/api/reminders")
def reminder_add(body: ReminderIn):
    return {"message": mem.add_reminder(body.text.strip(), minutes_from_now=max(1, body.minutes))}


# ---------------------------------------------------------------- remote access (PIN + token)
# The PC itself is always allowed. Everyone else (phone on Wi-Fi, or the Vercel UI through a
# Cloudflare tunnel) must log in with ACCESS_PIN and then send the token it gets back.

LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}
TOKEN_FILE = ROOT / "data" / "auth_tokens.json"
TOKEN_DAYS = 30
MIN_PIN_LEN = 6
_fails: dict[str, tuple[int, float, int]] = {}  # ip -> (count, locked_until, strikes)
_tokens: dict[str, float] | None = None


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


def _pin() -> str:
    return os.getenv("ACCESS_PIN", "").strip()


def allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "https://my-agent-ui-three.vercel.app,https://my-agent-ui-sunny-16e8.vercel.app")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def tunnel_url() -> str:
    f = ROOT / "data" / "tunnel_url.txt"
    try:
        return f.read_text(encoding="utf-8").strip() if f.exists() else ""
    except OSError:
        return ""


def _load_tokens() -> dict[str, float]:
    global _tokens
    if _tokens is None:
        try:
            _tokens = {k: float(v) for k, v in json.loads(TOKEN_FILE.read_text(encoding="utf-8")).items()}
        except (OSError, ValueError):
            _tokens = {}
    now = time.time()
    for k in [k for k, v in _tokens.items() if v < now]:
        _tokens.pop(k, None)
    return _tokens


def _save_tokens() -> None:
    try:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(json.dumps(_tokens or {}), encoding="utf-8")
    except OSError:
        pass


def _valid_token(tok: str) -> bool:
    if not tok:
        return False
    with _lock:
        for k, exp in _load_tokens().items():
            if hmac.compare_digest(k, tok) and exp > time.time():
                return True
    return False


def client_ip(request: Request) -> str:
    h = request.headers
    return (h.get("cf-connecting-ip") or (h.get("x-forwarded-for") or "").split(",")[0].strip()
            or (request.client.host if request.client else "?"))


def is_local(request: Request) -> bool:
    host = request.client.host if request.client else ""
    proxied = any(h in request.headers for h in ("x-forwarded-for", "cf-connecting-ip", "x-real-ip", "cf-ray"))
    return host in LOCAL_HOSTS and not proxied


def _bearer(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get("agent_auth", "")


async def guard(request: Request, call_next):
    """PC itself: always allowed. Anyone else: only with a valid login token."""
    if request.method == "OPTIONS" or is_local(request):
        return await call_next(request)
    path = request.url.path
    pin = _pin()
    if not pin or len(pin) < MIN_PIN_LEN:
        msg = ("Remote access band hai. .env mein kam se kam %d characters ka ACCESS_PIN set karo." % MIN_PIN_LEN)
        return JSONResponse({"detail": msg}, status_code=403)
    if path in ("/login", "/api/login", "/api/ping"):
        return await call_next(request)
    if _valid_token(_bearer(request)):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "Login chahiye"}, status_code=401)
    return RedirectResponse("/login")


@router.get("/api/ping")
def ping():
    """Unauthenticated, reveals nothing: lets the UI tell 'PC offline' from 'login needed'."""
    return {"ok": True}


class LoginIn(BaseModel):
    pin: str


@router.post("/api/login")
def login(body: LoginIn, request: Request):
    ip = client_ip(request)
    count, until, strikes = _fails.get(ip, (0, 0.0, 0))
    if until > time.time():
        raise HTTPException(429, f"Bahut galat try. {int(until - time.time())} second baad try karo.")
    pin = _pin()
    if pin and len(pin) >= MIN_PIN_LEN and hmac.compare_digest(body.pin.strip().encode(), pin.encode()):
        _fails.pop(ip, None)
        tok = secrets.token_urlsafe(32)
        with _lock:
            _load_tokens()[tok] = time.time() + TOKEN_DAYS * 86400
            _save_tokens()
        resp = JSONResponse({"ok": True, "token": tok})
        resp.set_cookie("agent_auth", tok, httponly=True, samesite="lax", max_age=TOKEN_DAYS * 86400)
        return resp
    count += 1
    if count >= 5:  # lock grows: 1 min, 2 min, 4 min ... up to 1 hour
        strikes += 1
        _fails[ip] = (0, time.time() + min(3600, 60 * 2 ** (strikes - 1)), strikes)
    else:
        _fails[ip] = (count, 0.0, strikes)
    raise HTTPException(401, "PIN galat hai")


@router.post("/api/logout")
def logout(request: Request):
    tok = _bearer(request)
    with _lock:
        _load_tokens().pop(tok, None)
        _save_tokens()
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("agent_auth")
    return resp


LOGIN_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Agent login</title>
<style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#050912;color:#e6f1ff;
font:16px system-ui,sans-serif}
form{width:min(320px,86vw);padding:28px;border-radius:20px;background:#0b1224;border:1px solid #1d2c52;
box-shadow:0 0 40px #19d3ff22;text-align:center}
h1{font-size:20px;margin:0 0 6px}p{color:#7f93b8;font-size:13px;margin:0 0 18px}
input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #24376a;background:#050912;
color:#fff;font-size:20px;text-align:center;letter-spacing:6px}
button{margin-top:14px;width:100%;padding:13px;border:0;border-radius:12px;font-weight:600;font-size:15px;
background:linear-gradient(135deg,#19d3ff,#7a5cff);color:#04101f}
#err{color:#ff6b7a;font-size:13px;min-height:18px;margin-top:10px}
</style></head><body>
<form id="f"><h1>Agent</h1><p>PIN daalo (PC wale .env mein ACCESS_PIN)</p>
<input id="pin" type="password" autocomplete="off" autofocus>
<button>Andar jao</button><div id="err"></div></form>
<script>
document.getElementById("f").onsubmit=async e=>{e.preventDefault();
const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({pin:document.getElementById("pin").value})});
if(r.ok)location.href="/";else{const d=await r.json().catch(()=>({}));
document.getElementById("err").textContent=d.detail||"Error";}};
</script></body></html>"""


@router.get("/login")
def login_page():
    return HTMLResponse(LOGIN_HTML)
