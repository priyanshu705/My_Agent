"""PC control tools for Windows: apps, files, system controls, typing.

Every function returns a short string the AI reads back to the user.
Windows-only libraries are imported lazily so the server still starts on other OSes.
"""

import os
import platform
import re
import subprocess
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import psutil

IS_WINDOWS = platform.system() == "Windows"
HOME = Path.home()
SCREENSHOT_DIR = HOME / "Pictures" / "MyAgent Screenshots"

# Common app names (Hinglish/English) -> Windows command or exe
APP_ALIASES = {
    "chrome": "chrome", "google chrome": "chrome", "browser": "chrome",
    "edge": "msedge", "microsoft edge": "msedge",
    "notepad": "notepad", "calculator": "calc", "calc": "calc",
    "paint": "mspaint", "file explorer": "explorer", "explorer": "explorer",
    "files": "explorer", "settings": "ms-settings:", "cmd": "cmd",
    "command prompt": "cmd", "powershell": "powershell", "task manager": "taskmgr",
    "vs code": "code", "vscode": "code", "visual studio code": "code",
    "word": "winword", "excel": "excel", "powerpoint": "powerpnt",
    "spotify": "spotify", "whatsapp": "whatsapp:", "camera": "microsoft.windows.camera:",
}

# Process names used when closing apps
PROCESS_ALIASES = {
    "chrome": "chrome.exe", "google chrome": "chrome.exe", "browser": "chrome.exe",
    "edge": "msedge.exe", "notepad": "notepad.exe", "calculator": "CalculatorApp.exe",
    "vs code": "Code.exe", "vscode": "Code.exe", "spotify": "Spotify.exe",
    "word": "WINWORD.EXE", "excel": "EXCEL.EXE", "powerpoint": "POWERPNT.EXE",
    "paint": "mspaint.exe", "whatsapp": "WhatsApp.exe", "task manager": "Taskmgr.exe",
}

SEARCH_ROOTS = [HOME / "Desktop", HOME / "Documents", HOME / "Downloads",
                HOME / "Pictures", HOME / "Videos", HOME / "Music", HOME / "OneDrive"]

# Never terminate these, even if the model asks.
PROTECTED_PROCESSES = {"system", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe",
                       "smss.exe", "explorer.exe", "svchost.exe", "dwm.exe", "python.exe", "pythonw.exe"}
SECRET_NAMES = {"secrets", "appdata", "application data", "local settings", "cookies", ".ssh", ".aws", ".azure", ".gnupg",
                ".kube", ".docker", ".config", ".claude", ".codex", ".gemini", ".git", ".git-credentials", ".netrc", ".npmrc",
                ".pypirc", "web_profile", "wa_profile", "chrome-workers", "$recycle.bin", "system volume information",
                "login data", "id_rsa", "id_ed25519"}
SECRET_EXT = (".pem", ".key", ".pfx", ".p12", ".kdbx", ".ovpn", ".ppk")
SECRET_FILE = re.compile(r"(credentials|token|auth_tokens|client_secret|.*service[-_ ]?account).*\.json|ntuser\..*")
# Opening one of these runs code, which the agent must never do on its own.
PROGRAM_EXT = (".exe", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".msi", ".msp",
               ".msc", ".scr", ".lnk", ".com", ".reg", ".hta", ".jar", ".py", ".pyw", ".cpl", ".pif", ".scf", ".url",
               ".application", ".appref-ms", ".chm", ".inf", ".sh")
MAX_TYPE_CHARS = 2000
ALLOWED_KEYS = {"ctrl", "shift", "alt", "win", "enter", "esc", "tab", "space", "backspace", "delete", "up", "down",
                "left", "right", "home", "end", "pageup", "pagedown", "volumemute", "volumeup", "volumedown",
                *[f"f{i}" for i in range(1, 13)], *"abcdefghijklmnopqrstuvwxyz0123456789"}


def allowed_roots() -> list[Path]:
    """Folders the agent may list, search or open. Extra roots: FILE_ROOTS=path1;path2 (Integrations page or .env)."""
    roots = [r for r in SEARCH_ROOTS]
    for extra in os.getenv("FILE_ROOTS", "").split(os.pathsep if os.pathsep != ":" else ";"):
        if extra.strip():
            roots.append(Path(extra.strip()).expanduser())
    out = []
    for r in roots:
        try:
            out.append(r.resolve())
        except OSError:
            pass
    return out


def safe_path(path: str | Path) -> Path | None:
    """Resolve symlinks and return the path only if it lies inside an allowed root, else None."""
    try:
        p = Path(str(path)).expanduser().resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    if any(_is_browser_profile(d) for d in (p, *p.parents)):
        return None
    # Every allowed folder that contains the path gets a say: the private part must not hide behind a wider folder.
    inside = [root for root in allowed_roots() if (p == root or root in p.parents) and not _is_secret(root.name)]
    if not inside or any(_is_secret(part) for root in inside for part in p.relative_to(root).parts):
        return None
    return p


def _is_secret(name: str) -> bool:
    """Passwords, keys, sign-ins and app data stay out of reach even inside an allowed folder."""
    n = name.lower()
    if n.startswith(".env"):
        return n != ".env.example"
    return (n in SECRET_NAMES or n.endswith(SECRET_EXT) or "password" in n or "passwd" in n
            or bool(SECRET_FILE.fullmatch(n)))


def _is_browser_profile(folder: Path) -> bool:
    """Chrome / Edge profiles hold cookies and saved logins, wherever they are kept."""
    try:
        return (folder / "Local State").is_file()
    except OSError:
        return False


def _not_allowed(what: str) -> str:
    roots = "; ".join(str(r) for r in allowed_roots() if r.is_dir())
    return (f"{what} is outside the folders I am allowed to use. Allowed now: {roots}. "
            "The user can add a folder under Integrations, 'Folders the agent can see'.")


def _start_menu_shortcuts():
    dirs = [Path(os.environ.get("ProgramData", "C:/ProgramData")) / "Microsoft/Windows/Start Menu/Programs",
            Path(os.environ.get("APPDATA", str(HOME))) / "Microsoft/Windows/Start Menu/Programs"]
    for d in dirs:
        if d.exists():
            yield from d.rglob("*.lnk")


# ---------------- Apps ----------------

def open_app(app_name: str) -> str:
    """Open/launch an application on the user's Windows PC, e.g. 'chrome', 'notepad', 'vs code', 'spotify'.

    Args:
        app_name: Name of the app to open, as the user said it.
    """
    if not IS_WINDOWS:
        return f"(Demo) '{app_name}' would open on Windows. This PC is not running Windows."
    name = app_name.lower().strip()[:80]
    target = APP_ALIASES.get(name)
    try:
        if target:
            if target.endswith(":"):
                os.startfile(target)
            else:  # fixed allow-listed command, argument list, no shell
                subprocess.Popen(["cmd", "/c", "start", "", target])
            return f"Opened {app_name}."
        # Only apps with a Start Menu shortcut can be opened by free-form name
        for lnk in _start_menu_shortcuts():
            if name and name in lnk.stem.lower():
                os.startfile(str(lnk))
                return f"Opened {lnk.stem}."
        return f"I do not know an app called '{app_name}'."
    except Exception as e:
        return f"Could not open {app_name}: {e}"


def close_app(app_name: str) -> str:
    """Close a running application on the PC (needs user confirmation).

    Args:
        app_name: Name of the app to close, e.g. 'chrome', 'notepad'.
    """
    name = app_name.lower().strip()
    proc_name = PROCESS_ALIASES.get(name, name if name.endswith(".exe") else name + ".exe").lower()
    closed = 0
    if proc_name in PROTECTED_PROCESSES:
        return f"{app_name} is a protected system process, so I will not close it."
    for p in psutil.process_iter(["name"]):
        pname = (p.info.get("name") or "").lower()
        if pname == proc_name and pname not in PROTECTED_PROCESSES:
            try:
                p.terminate()
                closed += 1
            except Exception:
                pass
    return f"Closed {app_name} ({closed} process)." if closed else f"{app_name} was not running."


def list_running_apps() -> str:
    """List the main apps currently running on the PC."""
    names = sorted({(p.info.get("name") or "") for p in psutil.process_iter(["name"])
                    if p.info.get("name") and not p.info["name"].lower().startswith(("svchost", "system", "runtime"))})
    return "Chal rahe apps: " + ", ".join(names[:60])


# ---------------- Files ----------------

def search_files(query: str, max_results: int = 10) -> str:
    """Search file and folder names in the user's allowed folders (Desktop, Documents, Downloads, Pictures, Videos, Music,
    OneDrive and any folder the user added).

    Args:
        query: Part of the file or folder name to look for.
        max_results: Max matches to return.
    """
    q = query.lower().strip()[:100]
    max_results = max(1, min(int(max_results), 30))
    found = []
    start = time.time()
    # Level by level across all folders, so a folder near the top of any of them is found before deep files elsewhere.
    queue = deque(dict.fromkeys(str(r) for r in allowed_roots() if r.is_dir()))
    seen = set(queue)
    found += [d for d in queue if q in os.path.basename(d).lower()]
    while queue and len(found) < max_results and time.time() - start < 8:
        try:
            folder = queue.popleft()
            if _is_browser_profile(Path(folder)):
                continue
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for e in entries:
            if _is_secret(e.name):
                continue
            if q in e.name.lower() and e.path not in found:
                found.append(e.path)
            try:
                is_dir = e.is_dir(follow_symlinks=False) and not os.path.islink(e.path)
            except OSError:
                continue
            if is_dir and e.path not in seen and not e.name.startswith((".", "$")) and e.name not in ("node_modules", "__pycache__"):
                seen.add(e.path)
                queue.append(e.path)
    if not found:
        return (f"No file named '{query}' was found in: " + "; ".join(str(r) for r in allowed_roots() if r.is_dir())
                + ". Other folders can be added under Integrations, 'Folders the agent can see'.")
    return "Mili files:\n" + "\n".join(found[:max_results])


def open_file(path: str) -> str:
    """Open a file or folder with its default app. Use the full path from search_files.

    Args:
        path: Full path of the file or folder.
    """
    p = safe_path(path)
    if p is None:
        return _not_allowed("That path")
    if not p.exists():
        return f"This path does not exist: {path}"
    if p.is_file() and p.name.lower().rstrip(". ").endswith(PROGRAM_EXT):
        return "Program and script files are not opened by the agent. The user can open it from File Explorer."
    if not IS_WINDOWS:
        return f"(Demo) {p} Windows par khulta."
    os.startfile(str(p))
    return f"Opened {p.name}."


def list_folder(folder: str = "Downloads") -> str:
    """List what is inside a folder. Accepts 'Desktop', 'Downloads', 'Documents', the name of an added folder, or a full path.

    Args:
        folder: Folder name or full path.
    """
    p = Path(folder).expanduser()
    if not p.is_absolute():
        # in the home folder, inside an allowed folder (OneDrive\Desktop) or an added folder with that name
        roots = allowed_roots()
        options = [HOME / folder, *(r / folder for r in roots), *(r for r in roots if r.name.lower() == folder.strip().lower())]
        existing = [o for o in options if o.is_dir()]
        # a folder with the same name in the home folder must not shadow one the agent is allowed to use
        p = next((o for o in existing if safe_path(o)), existing[0] if existing else HOME / folder)
    p = safe_path(p)
    if p is None:
        return _not_allowed("That folder")
    if not p.is_dir():
        return f"Folder not found: {folder}"
    items = sorted((i for i in p.iterdir() if not _is_secret(i.name)), key=lambda x: x.stat().st_mtime, reverse=True)[:40]
    return f"{p} mein (latest pehle):\n" + "\n".join(("[DIR] " if i.is_dir() else "") + i.name for i in items)


# ---------------- System ----------------

def set_volume(level: int) -> str:
    """Set the PC master volume, 0 to 100.

    Args:
        level: Volume percentage 0-100.
    """
    level = max(0, min(100, int(level)))
    if not IS_WINDOWS:
        return f"(Demo) Volume {level}% hota."
    try:
        from ctypes import POINTER, cast
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
        dev = AudioUtilities.GetSpeakers()
        iface = dev.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        vol = cast(iface, POINTER(IAudioEndpointVolume))
        vol.SetMasterVolumeLevelScalar(level / 100, None)
        return f"Volume set to {level}%."
    except Exception as e:
        return f"Could not set the volume: {e}"


def mute_volume(mute: bool = True) -> str:
    """Mute or unmute the PC sound.

    Args:
        mute: True to mute, False to unmute.
    """
    if not IS_WINDOWS:
        return "(Demo) mute toggle."
    import pyautogui
    pyautogui.press("volumemute")
    return "Mute setting changed."


def take_screenshot() -> str:
    """Take a screenshot of the PC screen and save it in Pictures/MyAgent Screenshots."""
    try:
        from PIL import ImageGrab
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        path = SCREENSHOT_DIR / f"screenshot_{datetime.now():%Y%m%d_%H%M%S_%f}.png"
        ImageGrab.grab().save(path)
        return f"Screenshot saved: {path}"
    except (Exception, SystemExit) as e:
        return f"Could not take a screenshot: {e}"


def lock_screen() -> str:
    """Lock the Windows PC screen (needs user confirmation)."""
    if not IS_WINDOWS:
        return "(Demo) screen lock hoti."
    import ctypes
    ctypes.windll.user32.LockWorkStation()
    return "Screen lock kar di."


def system_status() -> str:
    """Get battery %, charging state, CPU and RAM usage of the PC."""
    parts = []
    b = psutil.sensors_battery() if hasattr(psutil, "sensors_battery") else None
    if b:
        parts.append(f"Battery {b.percent:.0f}% ({'charging' if b.power_plugged else 'not charging'})")
    parts.append(f"CPU {psutil.cpu_percent(interval=None):.0f}%")
    parts.append(f"RAM {psutil.virtual_memory().percent:.0f}% used")
    return ", ".join(parts)


# ---------------- Typing / automation ----------------

def type_text(text: str) -> str:
    """Type text into whatever window is active on the PC (needs user confirmation).

    Args:
        text: The text to type. Hindi/emoji supported via clipboard paste.
    """
    if len(text) > MAX_TYPE_CHARS:
        return f"That text is too long to type ({len(text)} characters, max {MAX_TYPE_CHARS})."
    try:
        import pyautogui
        import pyperclip
        time.sleep(1.5)  # time to focus the target window
        pyperclip.copy(text)
        pyautogui.hotkey("ctrl", "v")
        return "Text typed."
    except (Exception, SystemExit) as e:
        return f"Could not type the text: {e}"


def press_keys(keys: str) -> str:
    """Press a keyboard shortcut on the PC, e.g. 'ctrl+s', 'alt+tab', 'win+d', 'enter' (needs user confirmation).

    Args:
        keys: Keys joined with '+', e.g. 'ctrl+shift+esc'.
    """
    combo = [k.strip().lower().replace("windows", "win") for k in keys.split("+")]
    if not combo or len(combo) > 4 or any(k not in ALLOWED_KEYS for k in combo):
        return "Those keys are not allowed."
    try:
        import pyautogui
        time.sleep(1)
        pyautogui.hotkey(*combo)
        return f"Pressed {keys}."
    except (Exception, SystemExit) as e:
        return f"Could not press the keys: {e}"


PC_TOOLS = [open_app, close_app, list_running_apps, search_files, open_file, list_folder,
            set_volume, mute_volume, take_screenshot, lock_screen, system_status, type_text, press_keys]

# These change things the user may not expect, so the user is asked to confirm first.
NEEDS_CONFIRMATION = {"close_app", "lock_screen", "type_text", "press_keys"}
