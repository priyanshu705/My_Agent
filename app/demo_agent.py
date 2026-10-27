"""Offline demo brain: understands common Hinglish commands with simple rules.

Used when GEMINI_API_KEY is missing or DEMO_MODE=1. It runs the same tools as
the real agent, but it is far less smart than Gemini (no free-form questions).
"""

import re

from datetime import datetime, timedelta

from .agent import NEEDS_CONFIRMATION, TOOL_MAP, describe, yes_no
from .web_tools import SITES

OPEN = r"(khol|kholo|open|start|chalu|launch)"


def _strip(text: str, words: str) -> str:
    drop = set(words.split())
    return " ".join(w for w in re.findall(r"[\w.-]+", text) if w not in drop)


def _num(text, default=0):
    m = re.search(r"\d+", text)
    return int(m.group()) if m else default


def parse(text: str):
    """Return (tool_name, args) or (None, reply)."""
    t = text.lower().strip().strip(".!?")

    m = re.search(r"^(.+?) ko (?:whatsapp|wa|message|msg)\s*(?:karo|kar do|bhejo|bhej do)?\s*(?:ki|ke|:)?\s*(.+)$", text.strip(), re.I)
    if m and "whatsapp" in t:
        return "whatsapp_send", {"to": m.group(1).strip(), "message": m.group(2).strip()}
    if "whatsapp" in t and re.search(r"(kiske|unread|naye|new|aaye)", t):
        return "whatsapp_unread", {"limit": 10}
    if not re.search(OPEN, t):
        if re.search(r"(unread|naye mail|new mail|inbox|mail aaye|mails? batao)", t):
            return "gmail_list_unread", {"max_results": 5}
        if re.search(r"(free|khaali|khali).*(kab|time|slot)|(kab|time|slot).*(free|khaali|khali)", t):
            return "calendar_find_free_time", {"days": 7}
        if re.search(r"(meeting|schedule|calendar|event)", t):
            day = datetime.now() + timedelta(days=1 if re.search(r"\bkal\b|tomorrow", t) else 0)
            return "calendar_list_events", {"date": day.strftime("%Y-%m-%d"), "days": 7 if "hafte" in t or "week" in t else 1}
    m = re.search(r"(?:type karo|type kar do|type)\s*:?\s*(.+)", text, re.I)
    if m:
        return "type_text", {"text": m.group(1).strip()}
    if re.search(r"(youtube).*(chala|play|laga|sunao)|(chala|play|laga|sunao).*(youtube)", t) or ("gaana" in t or "song" in t):
        q = re.sub(r"(youtube|pe|par|pr|chalao|chala do|play karo|play|laga do|lagao|sunao|gaana|song|ke|ka|ki)", " ", t)
        return "play_youtube", {"query": " ".join(q.split()) or "trending songs"}
    if re.search(r"(dhundh|find file|file search|search file|dhoondh)", t):
        q = _strip(t, "downloads documents desktop mein me mai dhundho dhundh do dhoondho find search file files aur khol kholo naam ki wali meri mera")
        return "search_files", {"query": q or t}
    if "google" in t or re.search(r"\bsearch\b", t):
        q = re.sub(r"(google|pe|par|pr|search karo|search kar do|search|karo|kar do)", " ", t)
        return "google_search", {"query": " ".join(q.split())}
    if "volume" in t or "awaaz" in t or "awaz" in t:
        if "mute" in t:
            return "mute_volume", {"mute": True}
        return "set_volume", {"level": _num(t, 50)}
    if "screenshot" in t:
        return "take_screenshot", {}
    if re.search(r"(battery|cpu|ram|system status|pc ka status)", t):
        return "system_status", {}
    if re.search(r"(lock)", t):
        return "lock_screen", {}
    if re.search(r"(time|samay|date|tareekh|aaj kya din)", t):
        return "get_datetime", {}
    m = re.search(r"(\d+)\s*(minute|min|mint)\s*(baad|me|mein).*?(yaad|remind)", t)
    if m:
        what = re.sub(r"(\d+\s*(minute|min|mint)\s*(baad|me|mein)|yaad dilana|yaad dila do|remind karna|remind me|ki|ke liye)", " ", t)
        return "add_reminder", {"text": " ".join(what.split()) or "reminder", "minutes_from_now": int(m.group(1))}
    if re.search(r"(reminder).*(dikhao|list|batao)", t):
        return "list_reminders", {}
    if re.search(r"(to-?do|todo|kaam ki list)", t):
        if re.search(r"(dikhao|list|batao|kya hai)", t):
            return "list_todos", {}
        task = re.sub(r"(to-?do|todo|list)\s*(mein|me|mai)?\s*(add karo|add kar do|daalo|dal do|add)?", " ", t)
        return "add_todo", {"task": " ".join(task.split())}
    m = re.search(r"^(?:note karo|note kar lo|note)\b\s*:?\s*(.+)", text.strip(), re.I)
    if m and "notes" not in t:
        return "add_note", {"text": m.group(1).strip()}
    if re.search(r"notes.*(dikhao|batao|padho)", t):
        return "list_notes", {}
    if re.search(r"(band|close|bandh)", t):
        app = re.sub(r"(band karo|band kar do|band|close karo|close|bandh|karo|kar do)", " ", t)
        return "close_app", {"app_name": " ".join(app.split())}
    if re.search(OPEN, t):
        name = " ".join(re.sub(OPEN + r"\w*|karo|kar do|do|please|zara", " ", t).split())
        if name in SITES:
            return "open_website", {"site": name}
        return "open_app", {"app_name": name}
    if re.search(r"^(hi|hello|namaste|hey)", t):
        return None, "Namaste Om! Bolo kya kaam hai?"
    return None, ("Demo mode mein main ye samajh nahi paaya. Asli Gemini key daaloge to aise sawaal bhi "
                  "samajh lunga. Abhi try karo: 'Chrome kholo', 'volume 30 karo', 'screenshot lo'.")


class DemoAgent:
    demo = True

    def __init__(self):
        self.pending: dict[str, tuple] = {}

    def _run(self, name, args):
        try:
            result = str(TOOL_MAP[name](**args))
        except (Exception, SystemExit) as e:
            result = f"Error: {e}"
        return {"reply": result, "actions": [{"tool": name, "args": args, "result": result}]}

    def chat(self, session_id: str, text: str) -> dict:
        if session_id in self.pending:
            ans = yes_no(text)
            if ans is not None:
                return self.confirm(session_id, ans)
            self.pending.pop(session_id)
        name, args = parse(text)
        if name is None:
            return {"reply": args, "actions": []}
        if name in NEEDS_CONFIRMATION:
            self.pending[session_id] = (name, args)
            return {"reply": f"Confirm karo: {describe(name, args)}. Haan ya na?",
                    "confirm": {"tool": name, "args": args}, "actions": []}
        return self._run(name, args)

    def confirm(self, session_id: str, approved: bool) -> dict:
        p = self.pending.pop(session_id, None)
        if not p:
            return {"reply": "Abhi koi kaam confirm karne ke liye pending nahi hai.", "actions": []}
        return self._run(*p) if approved else {"reply": "Theek hai, cancel kar diya.", "actions": []}

    def reset(self, session_id: str) -> None:
        self.pending.pop(session_id, None)
