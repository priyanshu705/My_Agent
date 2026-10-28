"""Control any Windows app (not just the browser) through Windows-MCP, wrapped in this project's safety rules.

Windows-MCP (github.com/CursorTouch/Windows-MCP, MIT) reads the screen's accessibility tree, so the agent can see real
button names and click them. We start it as a local subprocess and only expose a SMALL, guarded part of it:

  * Only these Windows-MCP tools are even started: Snapshot, Click, Type, Scroll, Shortcut, App, Wait.
    PowerShell, Registry, FileSystem, Process, Scrape and Clipboard are NOT started (--tools allowlist), so a confused or
    prompt-injected model cannot run commands or edit system settings through it.
  * windows_click / windows_type only work on an element that appeared in the LAST windows_snapshot (exact coordinates),
    so the code knows the element's name. Buttons that spend money / send / submit / delete are refused, and password,
    card, OTP and ID fields are never typed into.
  * windows_type never presses Enter. windows_shortcut only allows a short list of harmless shortcuts.
  * click, type and shortcut each ask the user to confirm first (NEEDS_CONFIRMATION). Snapshot / scroll / wait / open app do not.

OFF by default. Turn on with WINDOWS_MCP=1 in .env (Windows only; needs `pip install -r requirements-extra.txt` and `uv`).
WINDOWS_MCP_CMD can override the launch command (used by the tests with a mock server).
"""

import asyncio
import os
os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")  # Windows-MCP sends usage telemetry by default
import re
import shlex
import threading

from . import browser_tools as bt

ALLOWED_MCP_TOOLS = "Snapshot,Click,Type,Scroll,Shortcut,App,Wait"
CALL_TIMEOUT = float(os.getenv("WINDOWS_MCP_TIMEOUT", "40"))

# name = one of the elements parsed from the last snapshot
_last = {"elements": {}}  # {(x, y): {"ctrl": str, "name": str, "password": bool}}
_ELEMENT_RE = re.compile(r'\((-?\d+),\s*(-?\d+)\)\s+(\S+)\s+"(.*?)"\s+\[action:[^\]]*\](.*)$')
SAFE_SHORTCUTS = {
    "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+a", "ctrl+z", "ctrl+y", "ctrl+f", "ctrl+t", "ctrl+n", "ctrl+tab",
    "ctrl+shift+tab", "ctrl+home", "ctrl+end", "ctrl+plus", "ctrl+minus", "ctrl+0", "alt+tab", "alt+left", "alt+right",
    "win+d", "win+up", "win+down", "pageup", "pagedown", "home", "end", "f5", "esc", "escape", "f11",
}
_DIRECTIONS = {"up", "down", "left", "right"}


def enabled() -> bool:
    return os.getenv("WINDOWS_MCP", "0") == "1"


# ---------------- pure helpers (unit-tested) ----------------
def parse_snapshot(text: str) -> dict:
    """Pull the clickable elements out of Windows-MCP's Snapshot text. Returns {(x, y): info}."""
    out = {}
    for line in (text or "").splitlines():
        m = _ELEMENT_RE.search(line.strip())
        if not m:
            continue
        x, y, ctrl, name, meta = int(m.group(1)), int(m.group(2)), m.group(3).lower(), m.group(4), m.group(5)
        out[(x, y)] = {"ctrl": ctrl, "name": name, "password": "[password]" in meta.lower()}
    return out


def check_click(info: dict) -> str | None:
    label = f'{info.get("name", "")}'.strip()
    if bt.FINAL_RE.search(label):
        return f'"{label[:60]}" spends money, sends or makes something final. Ask the user to do it themselves'
    return None


def check_type(info: dict) -> str | None:
    if info.get("password") or "password" in info.get("ctrl", ""):
        return "this is a password field"
    if bt.SENSITIVE_FIELD_RE.search(info.get("name", "")):
        return "this looks like a password, card, OTP or ID field"
    return None


def check_shortcut(keys: str) -> str | None:
    k = re.sub(r"\s+", "", (keys or "").lower())
    return None if k in SAFE_SHORTCUTS else f'"{keys}" is not on the allowed shortcut list'


def _lookup(x: int, y: int):
    info = _last["elements"].get((int(x), int(y)))
    if info is None:
        return None, "Those coordinates are not an element from the latest windows_snapshot. Call windows_snapshot and use the (x,y) it shows."
    return info, None


def confirm_context(args: dict) -> dict:
    """Name of the element about to be clicked / typed into, so the confirmation says WHAT, not just coordinates."""
    try:
        info = _last["elements"].get((int(args.get("x")), int(args.get("y"))))
    except (TypeError, ValueError):
        info = None
    return {"_label": f'{info["ctrl"]} "{info["name"][:60]}"'} if info else {}


# ---------------- MCP stdio client on a background event loop ----------------
class _Client:
    def __init__(self):
        self._loop = None
        self._session = None
        self._ready = threading.Event()
        self._stop = None
        self._err = None
        self._lock = threading.Lock()

    def _command(self):
        custom = os.getenv("WINDOWS_MCP_CMD", "").strip()
        if custom:
            parts = shlex.split(custom, posix=(os.name != "nt"))
            return parts[0], parts[1:]
        return "uvx", ["--python", "3.12", "windows-mcp", "serve", "--tools", ALLOWED_MCP_TOOLS]

    async def _main(self):
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
        cmd, args = self._command()
        env = {**os.environ, "ANONYMIZED_TELEMETRY": "false"}
        self._stop = asyncio.Event()
        try:
            async with stdio_client(StdioServerParameters(command=cmd, args=args, env=env)) as (r, w):
                async with ClientSession(r, w) as session:
                    await asyncio.wait_for(session.initialize(), timeout=90)
                    self._session = session
                    self._ready.set()
                    await self._stop.wait()
        except Exception as e:  # noqa: BLE001
            self._err = e
        finally:
            self._session = None
            self._ready.set()

    def _start(self):
        def run():
            self._loop = asyncio.new_event_loop()
            self._loop.run_until_complete(self._main())
        self._ready.clear()
        self._err = None
        threading.Thread(target=run, daemon=True, name="windows-mcp").start()
        self._ready.wait(100)
        if self._session is None:
            raise RuntimeError(f"Could not start Windows-MCP ({self._err or 'timeout'}). Is `uv` installed and are you on Windows?")

    def call(self, tool: str, args: dict) -> str:
        with self._lock:
            if self._session is None:
                self._start()
            fut = asyncio.run_coroutine_threadsafe(self._session.call_tool(tool, args), self._loop)
            try:
                res = fut.result(CALL_TIMEOUT)
            except Exception as e:  # noqa: BLE001
                fut.cancel()
                raise RuntimeError(f"Windows-MCP {tool} failed: {e}") from e
        text = "\n".join(getattr(c, "text", "") for c in (res.content or []) if getattr(c, "text", None))
        if getattr(res, "isError", False):
            raise RuntimeError(text or f"Windows-MCP {tool} reported an error")
        return text

    def close(self):
        if self._loop and self._stop:
            self._loop.call_soon_threadsafe(self._stop.set)


_client = _Client()


def _call(tool: str, args: dict) -> str:
    return _client.call(tool, args)


# ---------------- tools the agent can use ----------------
def windows_snapshot() -> str:
    """Look at the Windows screen: lists open windows and the buttons, fields and links on them with their (x,y) positions. Always call this before windows_click or windows_type, and again after the screen changes."""
    text = _call("Snapshot", {"use_vision": False, "use_dom": False})
    _last["elements"] = parse_snapshot(text)
    return text[:9000]


def windows_click(x: int, y: int) -> str:
    """Click an element on the Windows screen. x and y must be the exact (x,y) of an element listed by the latest windows_snapshot. Buttons that pay, send, submit or delete are refused.

    Args:
        x: x position of the element from windows_snapshot.
        y: y position of the element from windows_snapshot.
    """
    info, err = _lookup(x, y)
    if err:
        return "Error: " + err
    why = check_click(info)
    if why:
        return "Refused: " + why + "."
    out = _call("Click", {"loc": [int(x), int(y)]})
    _last["elements"] = {}  # screen changed: force a fresh snapshot
    return out or f'Clicked "{info["name"]}".'


def windows_type(x: int, y: int, text: str) -> str:
    """Type text into a field on the Windows screen (does not press Enter). x and y must be the exact (x,y) of a field listed by the latest windows_snapshot. Password, card, OTP and ID fields are refused.

    Args:
        x: x position of the field from windows_snapshot.
        y: y position of the field from windows_snapshot.
        text: the text to type.
    """
    info, err = _lookup(x, y)
    if err:
        return "Error: " + err
    why = check_type(info)
    if why:
        return "Refused: " + why + ". Ask the user to type it themselves."
    out = _call("Type", {"loc": [int(x), int(y)], "text": text, "clear": False, "press_enter": False})
    return out or f'Typed into "{info["name"]}".'


def windows_shortcut(keys: str) -> str:
    """Press a harmless keyboard shortcut on Windows, for example ctrl+c, ctrl+v, ctrl+a, ctrl+f, alt+tab, win+d, pagedown.

    Args:
        keys: the shortcut, keys joined by + (lowercase).
    """
    why = check_shortcut(keys)
    if why:
        return "Refused: " + why + "."
    _last["elements"] = {}
    return _call("Shortcut", {"shortcut": re.sub(r"\s+", "", keys.lower())}) or f"Pressed {keys}."


def windows_scroll(direction: str = "down", amount: int = 3) -> str:
    """Scroll the Windows screen under the mouse.

    Args:
        direction: up, down, left or right.
        amount: how many wheel steps (1-10).
    """
    d = (direction or "down").lower()
    if d not in _DIRECTIONS:
        return "Error: direction must be up, down, left or right."
    horizontal = d in ("left", "right")
    _last["elements"] = {}
    return _call("Scroll", {"type": "horizontal" if horizontal else "vertical", "direction": d,
                            "wheel_times": max(1, min(10, int(amount)))}) or f"Scrolled {d}."


def windows_open_app(name: str) -> str:
    """Open or switch to a Windows app by its name, for example Notepad, Calculator, Spotify.

    Args:
        name: the app name.
    """
    if not (name or "").strip():
        return "Error: app name is empty."
    _last["elements"] = {}
    return _call("App", {"mode": "launch", "name": name.strip()}) or f"Opened {name}."


WINDOWS_MCP_TOOLS = [windows_snapshot, windows_click, windows_type, windows_shortcut, windows_scroll, windows_open_app] if enabled() else []
WINDOWS_MCP_NEEDS_CONFIRMATION = {"windows_click", "windows_type", "windows_shortcut"}
