"""Phase 3: WhatsApp on your personal number, by automating WhatsApp Web.

A separate browser window (Edge/Chrome) opens with WhatsApp Web. Scan the QR code
once (setup_whatsapp.bat); the login stays saved in data/wa_profile.

This is unofficial automation. Keep usage personal and low-volume: the agent
waits between messages and caps messages per hour to reduce the risk of a ban.
WhatsApp changes its web page often; if something stops working, the selectors
at the top of this file are the place to update.
"""

import json
import os
import re
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from .contacts_tools import resolve_contact

ROOT = Path(__file__).resolve().parent.parent
PROFILE_DIR = ROOT / "data" / "wa_profile"
DEBUG_SHOT = ROOT / "data" / "wa_debug.png"
SCHEDULE_FILE = ROOT / "data" / "wa_scheduled.json"
WA_URL = os.getenv("WA_URL", "https://web.whatsapp.com")

MIN_GAP_SECONDS = 5
MAX_PER_HOUR = 30
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".3gp", ".mov"}

# Selectors: several options each, because WhatsApp Web changes its markup.
SEL = {
    "logged_in": ["#pane-side", "[aria-label='Chat list']"],
    "qr": ["canvas[aria-label*='Scan']", "div[data-ref] canvas", "[data-testid='qrcode']", "canvas"],
    "search": ["div[contenteditable='true'][data-tab='3']", "input[aria-label*='Search']",
               "div[aria-label*='Search'][contenteditable='true']", "[role='textbox'][aria-label*='Search']"],
    "compose": ["footer div[contenteditable='true']", "#main div[contenteditable='true'][data-tab='10']",
                "#main [role='textbox']"],
    "chat_title": ["#main header span[title]", "#main header span[dir='auto']", "#main header"],
    "attach": ["[aria-label='Attach']", "span[data-icon='plus']", "span[data-icon='attach-menu-plus']",
               "span[data-icon='clip']", "[title='Attach']"],
    "media_send": ["[aria-label='Send']", "span[data-icon='send']", "div[role='button'] span[data-icon='wds-ic-send-filled']"],
    "invalid_number": ["text=Phone number shared via url is invalid", "text=invalid"],
}

_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whatsapp")  # Playwright must stay on one thread
_state = {"pw": None, "ctx": None, "page": None}
_sent_times: deque = deque()
_lock = threading.Lock()


# ---------------- browser plumbing (runs on the worker thread) ----------------

def _launch():
    from playwright.sync_api import sync_playwright
    if _state["page"] and not _state["page"].is_closed():
        return _state["page"]
    if _state["pw"] is None:
        _state["pw"] = sync_playwright().start()
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    headless = os.getenv("WA_HEADLESS", "0") == "1"
    last_err = None
    for channel in (os.getenv("WA_BROWSER", ""), "msedge", "chrome", None):
        if channel == "":
            continue
        try:
            kw = {"channel": channel} if channel else {}
            ctx = _state["pw"].chromium.launch_persistent_context(
                str(PROFILE_DIR), headless=headless, viewport={"width": 1100, "height": 800}, **kw)
            break
        except Exception as e:
            last_err = e
    else:
        raise RuntimeError(f"Browser start nahi hua (Edge/Chrome chahiye): {last_err}")
    _state["ctx"] = ctx
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(WA_URL, wait_until="domcontentloaded")
    _state["page"] = page
    return page


def _first(page, key, timeout=0, visible=True):
    """Return the first (visible) locator for a selector group, optionally waiting."""
    end = time.time() + timeout / 1000
    while True:
        for s in SEL[key]:
            loc = page.locator(s).first
            try:
                if loc.count() and (not visible or loc.is_visible()):
                    return loc
            except Exception:
                pass
        if time.time() >= end:
            return None
        page.wait_for_timeout(300)


def _ready(page, timeout=45000) -> str:
    """'ok' when logged in, 'qr' when waiting for the QR scan."""
    end = time.time() + timeout / 1000
    while time.time() < end:
        if _first(page, "logged_in", visible=False):
            return "ok"
        if _first(page, "qr") and not _first(page, "logged_in", visible=False):
            page.wait_for_timeout(1500)
            if not _first(page, "logged_in", visible=False):
                return "qr"
        page.wait_for_timeout(500)
    return "timeout"


def _debug(page):
    try:
        page.screenshot(path=str(DEBUG_SHOT))
    except Exception:
        pass


def _check_rate():
    now = time.time()
    while _sent_times and now - _sent_times[0] > 3600:
        _sent_times.popleft()
    if len(_sent_times) >= MAX_PER_HOUR:
        raise RuntimeError(f"Safety limit: ek ghante mein {MAX_PER_HOUR} se zyada message nahi bhejunga.")
    if _sent_times and now - _sent_times[-1] < MIN_GAP_SECONDS:
        time.sleep(MIN_GAP_SECONDS - (now - _sent_times[-1]))


def _type_message(page, box, message: str):
    box.click()
    for i, line in enumerate(message.split("\n")):
        if i:
            page.keyboard.press("Shift+Enter")
        page.keyboard.insert_text(line)


def _open_chat_by_number(page, phone: str) -> str:
    page.goto(f"{WA_URL}/send?phone={phone}", wait_until="domcontentloaded")
    box = None
    end = time.time() + 40
    while time.time() < end:
        box = _first(page, "compose")
        if box:
            break
        for s in SEL["invalid_number"]:
            if page.locator(s).count():
                raise RuntimeError(f"{phone} WhatsApp par nahi hai ya number galat hai.")
        page.wait_for_timeout(500)
    if not box:
        _debug(page)
        raise RuntimeError("Chat nahi khula (WhatsApp Web load nahi hua).")
    return phone


def _open_chat_by_name(page, name: str) -> str:
    search = _first(page, "search", 10000)
    if not search:
        _debug(page)
        raise RuntimeError("WhatsApp search box nahi mila.")
    search.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.insert_text(name)
    page.wait_for_timeout(2000)
    pattern = re.compile(re.escape(name), re.I)
    hit = page.locator("#pane-side span[title]").filter(has_text=pattern).first
    if not hit.count():
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")
        page.keyboard.press("Escape")
        raise LookupError(f"WhatsApp chat list mein '{name}' nahi mila.")
    title = hit.get_attribute("title") or name
    hit.click()
    if not _first(page, "compose", 10000):
        _debug(page)
        raise RuntimeError("Chat khula nahi.")
    return title


def _open_chat(page, target: dict) -> str:
    return _open_chat_by_number(page, target["phone"]) if target.get("phone") else _open_chat_by_name(page, target["name"])


def _attach_file(page, path: Path, caption: str):
    btn = _first(page, "attach", 8000)
    if not btn:
        _debug(page)
        raise RuntimeError("Attach button nahi mila.")
    btn.click()
    page.wait_for_timeout(800)
    is_media = path.suffix.lower() in IMAGE_EXT
    inputs = page.locator("input[type='file']")
    chosen = None
    for i in range(inputs.count()):
        accept = (inputs.nth(i).get_attribute("accept") or "").lower()
        if is_media and "image" in accept:
            chosen = inputs.nth(i)
            break
        if not is_media and (accept in ("", "*") or "image" not in accept):
            chosen = inputs.nth(i)
            break
    if chosen is None and inputs.count():
        chosen = inputs.first
    if chosen is None:
        _debug(page)
        raise RuntimeError("File upload option nahi mila.")
    chosen.set_input_files(str(path))
    send = _first(page, "media_send", 20000)
    if not send:
        _debug(page)
        raise RuntimeError("File preview ka Send button nahi mila.")
    if caption:
        page.keyboard.insert_text(caption)
    send.click()


def _do_send(target: dict, message: str = "", file_path: str = "") -> str:
    page = _launch()
    status = _ready(page)
    if status == "qr":
        return "WhatsApp login nahi hai. Khuli hui window mein QR code apne phone se scan karo, phir dobara bolo."
    if status != "ok":
        _debug(page)
        return "WhatsApp Web load nahi hua. Internet check karo."
    _check_rate()
    title = _open_chat(page, target)
    if file_path:
        _attach_file(page, Path(file_path), message)
    else:
        box = _first(page, "compose", 5000)
        _type_message(page, box, message)
        page.keyboard.press("Enter")
    page.wait_for_timeout(1500)
    _sent_times.append(time.time())
    what = f"file {Path(file_path).name}" if file_path else "message"
    return f"WhatsApp {what} bhej diya: {target.get('label') or title}."


def _do_unread(limit: int) -> str:
    page = _launch()
    status = _ready(page)
    if status != "ok":
        return "WhatsApp login nahi hai. Window mein QR scan karo." if status == "qr" else "WhatsApp Web load nahi hua."
    page.wait_for_timeout(1500)
    rows = page.evaluate("""(limit) => {
      const rows = [...document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')];
      const out = [];
      for (const r of rows) {
        const badge = r.querySelector('[aria-label*="unread" i]');
        if (!badge) continue;
        const titles = [...r.querySelectorAll('span[title]')].map(s => s.getAttribute('title'));
        out.push({ name: titles[0] || '', last: titles[titles.length - 1] || '', count: (badge.innerText || '').trim() });
        if (out.length >= limit) break;
      }
      return out;
    }""", limit)
    if not rows:
        return "WhatsApp par koi unread message nahi hai."
    return "\n".join(f"- {r['name']} ({r['count'] or 'new'}): {r['last'] if r['last'] != r['name'] else ''}" for r in rows)


def _do_read_chat(target: dict, count: int) -> str:
    page = _launch()
    if _ready(page) != "ok":
        return "WhatsApp login nahi hai. Window mein QR scan karo."
    title = _open_chat(page, target)
    page.wait_for_timeout(1500)
    msgs = page.evaluate("""(count) => {
      const nodes = [...document.querySelectorAll('#main [data-pre-plain-text]')].slice(-count);
      return nodes.map(n => {
        const meta = n.getAttribute('data-pre-plain-text') || '';
        const text = (n.querySelector('.selectable-text') || n).innerText || '';
        return (meta + ' ' + text).trim();
      });
    }""", count)
    if not msgs:
        return f"{title} ki chat mein text messages nahi mile."
    return f"{title} ke last messages:\n" + "\n".join(msgs)


def _run(fn, *args, timeout=150):
    try:
        return _pool.submit(fn, *args).result(timeout=timeout)
    except LookupError as e:
        return str(e)
    except Exception as e:
        return f"WhatsApp error: {e}"


def _target(to: str) -> dict:
    """Turn 'Jyotish' or '98765 43210' into {'phone': ..} or {'name': ..}."""
    digits = re.sub(r"\D", "", to)
    if len(digits) >= 10 and len(digits) >= len(re.sub(r"\s", "", to)) - 2:
        if len(digits) == 10:
            digits = "91" + digits
        return {"phone": digits, "label": to}
    found = resolve_contact(to)
    if found.get("phone"):
        return {"phone": found["phone"], "label": f"{found['name']} ({found['phone']})"}
    return {"name": to, "label": to}


# ---------------- AI tools ----------------

def whatsapp_send(to: str, message: str) -> str:
    """Send a WhatsApp text from the user's own number (needs user confirmation).

    Args:
        to: Contact name (as saved / in WhatsApp chats) or phone number.
        message: The message text.
    """
    if not message.strip():
        return "Message khaali hai."
    return _run(_do_send, _target(to), message)


def whatsapp_send_file(to: str, file_path: str, caption: str = "") -> str:
    """Send a file or photo on WhatsApp (needs user confirmation). Get file_path from search_files first.

    Args:
        to: Contact name or phone number.
        file_path: Full path of the file on the PC.
        caption: Optional message with the file.
    """
    p = Path(file_path).expanduser()
    if not p.is_file():
        return f"File nahi mili: {file_path}. Pehle search_files se sahi path lo."
    if p.stat().st_size > 100 * 1024 * 1024:
        return "File 100 MB se badi hai, WhatsApp par nahi jaayegi."
    return _run(_do_send, _target(to), caption, str(p))


def whatsapp_unread(limit: int = 10) -> str:
    """List WhatsApp chats that have unread messages (name, count, last message).

    Args:
        limit: Max chats to list.
    """
    return _run(_do_unread, int(limit))


def whatsapp_read_chat(contact: str, count: int = 10) -> str:
    """Read the latest messages of one WhatsApp chat.

    Args:
        contact: Contact name or phone number.
        count: How many recent messages.
    """
    return _run(_do_read_chat, _target(contact), int(count))


# ---------------- scheduled messages ----------------

def _load_sched() -> list:
    try:
        return json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_sched(items: list):
    SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCHEDULE_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def whatsapp_schedule(to: str, message: str, at_time: str, file_path: str = "") -> str:
    """Schedule a WhatsApp message for later (needs user confirmation). The PC and this agent must be running then.

    Args:
        to: Contact name or phone number.
        message: Message text (or caption if a file is given).
        at_time: When to send, 'YYYY-MM-DD HH:MM' in local time.
        file_path: Optional file to send.
    """
    try:
        due = datetime.strptime(at_time.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        return "Time ka format 'YYYY-MM-DD HH:MM' chahiye."
    if due <= datetime.now():
        return "Ye time nikal chuka hai."
    with _lock:
        items = _load_sched()
        items.append({"to": to, "message": message, "file": file_path, "due": due.strftime("%Y-%m-%d %H:%M"),
                      "status": "pending"})
        _save_sched(items)
    return f"Schedule ho gaya: {to} ko {due:%d %b %I:%M %p} par WhatsApp jaayega (PC aur agent chalu rehne chahiye)."


def whatsapp_list_scheduled() -> str:
    """List pending scheduled WhatsApp messages."""
    items = [i for i in _load_sched() if i["status"] == "pending"]
    if not items:
        return "Koi scheduled WhatsApp message nahi hai."
    return "\n".join(f"{n+1}. {i['due']} -> {i['to']}: {i['message'][:60]}" for n, i in enumerate(items))


def whatsapp_cancel_scheduled(number: int) -> str:
    """Cancel a scheduled WhatsApp message by its number from whatsapp_list_scheduled.

    Args:
        number: 1-based number.
    """
    with _lock:
        items = _load_sched()
        pending = [i for i in items if i["status"] == "pending"]
        if not 1 <= number <= len(pending):
            return "Is number ka scheduled message nahi hai."
        pending[number - 1]["status"] = "cancelled"
        _save_sched(items)
    return "Scheduled message cancel kar diya."


_notices: list[str] = []


def pop_notices() -> list[str]:
    out, _notices[:] = list(_notices), []
    return out


def _scheduler_loop():
    while True:
        time.sleep(30)
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        with _lock:
            items = _load_sched()
            due = [i for i in items if i["status"] == "pending" and i["due"] <= now]
            for i in due:
                i["status"] = "sending"
            if due:
                _save_sched(items)
        for i in due:
            if i.get("file"):
                result = whatsapp_send_file(i["to"], i["file"], i["message"])
            else:
                result = whatsapp_send(i["to"], i["message"])
            ok = "bhej diya" in result
            with _lock:
                items = _load_sched()
                for j in items:
                    if j["due"] == i["due"] and j["to"] == i["to"] and j["status"] == "sending":
                        j["status"] = "sent" if ok else "failed"
                _save_sched(items)
            _notices.append(("Scheduled WhatsApp: " if ok else "Scheduled WhatsApp fail hua: ") + result)


def start_scheduler():
    threading.Thread(target=_scheduler_loop, daemon=True, name="wa-scheduler").start()


def open_for_login() -> str:
    """Open WhatsApp Web and wait up to 2 minutes for the QR scan (used by setup_whatsapp.bat)."""
    def _login():
        page = _launch()
        status = _ready(page, 120000)
        return status
    return _run(_login, timeout=180)


WHATSAPP_TOOLS = [whatsapp_send, whatsapp_send_file, whatsapp_unread, whatsapp_read_chat,
                  whatsapp_schedule, whatsapp_list_scheduled, whatsapp_cancel_scheduled]
WHATSAPP_NEEDS_CONFIRMATION = {"whatsapp_send", "whatsapp_send_file", "whatsapp_schedule"}


if __name__ == "__main__":
    print("WhatsApp Web khul raha hai. Phone mein WhatsApp > Linked devices > Link a device se QR scan karo...")
    result = open_for_login()
    print("WhatsApp connect ho gaya! Ab run.bat chalao." if result == "ok" else f"Login nahi hua ({result}). Dobara try karo.")
