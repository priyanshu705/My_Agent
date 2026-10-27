"""PC control tools for Windows: apps, files, system controls, typing.

Every function returns a short string the AI reads back to the user.
Windows-only libraries are imported lazily so the server still starts on other OSes.
"""

import os
import platform
import subprocess
import time
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
        return f"(Demo) '{app_name}' would open on Windows. Ye PC Windows nahi hai."
    name = app_name.lower().strip()
    target = APP_ALIASES.get(name)
    try:
        if target:
            os.startfile(target) if target.endswith(":") else subprocess.Popen(f'start "" {target}', shell=True)
            return f"{app_name} khol diya."
        # Fallback: search Start Menu shortcuts
        for lnk in _start_menu_shortcuts():
            if name in lnk.stem.lower():
                os.startfile(str(lnk))
                return f"{lnk.stem} khol diya."
        subprocess.Popen(f'start "" "{app_name}"', shell=True)
        return f"{app_name} kholne ki koshish ki."
    except Exception as e:
        return f"{app_name} nahi khul paaya: {e}"


def close_app(app_name: str) -> str:
    """Close a running application on the PC (needs user confirmation).

    Args:
        app_name: Name of the app to close, e.g. 'chrome', 'notepad'.
    """
    name = app_name.lower().strip()
    proc_name = PROCESS_ALIASES.get(name, name if name.endswith(".exe") else name + ".exe").lower()
    closed = 0
    for p in psutil.process_iter(["name"]):
        pname = (p.info.get("name") or "").lower()
        if pname == proc_name or (name in pname and len(name) > 3):
            try:
                p.terminate()
                closed += 1
            except Exception:
                pass
    return f"{app_name} band kar diya ({closed} process)." if closed else f"{app_name} chal hi nahi raha tha."


def list_running_apps() -> str:
    """List the main apps currently running on the PC."""
    names = sorted({(p.info.get("name") or "") for p in psutil.process_iter(["name"])
                    if p.info.get("name") and not p.info["name"].lower().startswith(("svchost", "system", "runtime"))})
    return "Chal rahe apps: " + ", ".join(names[:60])


# ---------------- Files ----------------

def search_files(query: str, max_results: int = 10) -> str:
    """Search the user's files (Desktop, Documents, Downloads, Pictures, Videos, Music, OneDrive) by name.

    Args:
        query: Part of the file or folder name to look for.
        max_results: Max matches to return.
    """
    q = query.lower().strip()
    found = []
    start = time.time()
    for root in SEARCH_ROOTS:
        if not root.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in ("node_modules", "__pycache__", ".git")]
            for f in filenames + dirnames:
                if q in f.lower():
                    found.append(os.path.join(dirpath, f))
                    if len(found) >= max_results:
                        break
            if len(found) >= max_results or time.time() - start > 8:
                break
    if not found:
        return f"'{query}' naam ki koi file nahi mili."
    return "Mili files:\n" + "\n".join(found)


def open_file(path: str) -> str:
    """Open a file or folder with its default app. Use the full path from search_files.

    Args:
        path: Full path of the file or folder.
    """
    p = Path(path).expanduser()
    if not p.exists():
        return f"Ye path exist nahi karta: {path}"
    if not IS_WINDOWS:
        return f"(Demo) {p} Windows par khulta."
    os.startfile(str(p))
    return f"{p.name} khol diya."


def list_folder(folder: str = "Downloads") -> str:
    """List what is inside a folder. Accepts 'Desktop', 'Downloads', 'Documents' or a full path.

    Args:
        folder: Folder name or full path.
    """
    p = Path(folder).expanduser()
    if not p.is_absolute():
        p = HOME / folder
    if not p.exists():
        return f"Folder nahi mila: {p}"
    items = sorted(p.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True)[:40]
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
        return f"Volume {level}% kar diya."
    except Exception as e:
        return f"Volume set nahi hua: {e}"


def mute_volume(mute: bool = True) -> str:
    """Mute or unmute the PC sound.

    Args:
        mute: True to mute, False to unmute.
    """
    if not IS_WINDOWS:
        return "(Demo) mute toggle."
    import pyautogui
    pyautogui.press("volumemute")
    return "Mute/unmute kar diya."


def take_screenshot() -> str:
    """Take a screenshot of the PC screen and save it in Pictures/MyAgent Screenshots."""
    try:
        import pyautogui
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        path = SCREENSHOT_DIR / f"screenshot_{datetime.now():%Y%m%d_%H%M%S}.png"
        pyautogui.screenshot(str(path))
        return f"Screenshot save ho gaya: {path}"
    except Exception as e:
        return f"Screenshot nahi le paaya: {e}"


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
    parts.append(f"CPU {psutil.cpu_percent(interval=0.5):.0f}%")
    parts.append(f"RAM {psutil.virtual_memory().percent:.0f}% used")
    return ", ".join(parts)


# ---------------- Typing / automation ----------------

def type_text(text: str) -> str:
    """Type text into whatever window is active on the PC (needs user confirmation).

    Args:
        text: The text to type. Hindi/emoji supported via clipboard paste.
    """
    try:
        import pyautogui
        import pyperclip
        time.sleep(1.5)  # time to focus the target window
        pyperclip.copy(text)
        pyautogui.hotkey("ctrl", "v")
        return "Text type kar diya."
    except Exception as e:
        return f"Type nahi ho paaya: {e}"


def press_keys(keys: str) -> str:
    """Press a keyboard shortcut on the PC, e.g. 'ctrl+s', 'alt+tab', 'win+d', 'enter' (needs user confirmation).

    Args:
        keys: Keys joined with '+', e.g. 'ctrl+shift+esc'.
    """
    try:
        import pyautogui
        combo = [k.strip().lower().replace("windows", "win") for k in keys.split("+")]
        time.sleep(1)
        pyautogui.hotkey(*combo)
        return f"{keys} daba diya."
    except Exception as e:
        return f"Keys nahi daba paaya: {e}"


PC_TOOLS = [open_app, close_app, list_running_apps, search_files, open_file, list_folder,
            set_volume, mute_volume, take_screenshot, lock_screen, system_status, type_text, press_keys]

# These change things the user may not expect, so the UI asks "haan/na" first.
NEEDS_CONFIRMATION = {"close_app", "lock_screen", "type_text", "press_keys"}
