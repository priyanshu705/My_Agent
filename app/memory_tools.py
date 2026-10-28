"""Notes, to-dos and reminders, saved in data/memory.json on the PC."""

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "memory.json"
_lock = threading.Lock()


def _load() -> dict:
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"notes": [], "todos": [], "reminders": [], "facts": []}


def _save(db: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


# ---------------- Notes ----------------

def add_note(text: str) -> str:
    """Save a note for the user.

    Args:
        text: The note content.
    """
    with _lock:
        db = _load()
        db["notes"].append({"text": text, "at": _now()})
        _save(db)
    return "Note save kar liya."


def list_notes(search: str = "") -> str:
    """Read back saved notes, optionally filtered by a word.

    Args:
        search: Optional word to filter notes.
    """
    notes = [n for n in _load()["notes"] if search.lower() in n["text"].lower()]
    if not notes:
        return "No notes found."
    return "\n".join(f"{i+1}. {n['text']} ({n['at']})" for i, n in enumerate(notes[-20:]))


# ---------------- To-dos ----------------

def add_todo(task: str) -> str:
    """Add a task to the user's to-do list.

    Args:
        task: The task to add.
    """
    with _lock:
        db = _load()
        db["todos"].append({"task": task, "done": False, "at": _now()})
        _save(db)
    return f"To-do mein add kiya: {task}"


def list_todos() -> str:
    """Show the user's to-do list with numbers."""
    todos = _load()["todos"]
    if not todos:
        return "The to-do list is empty."
    return "\n".join(f"{i+1}. [{'x' if t['done'] else ' '}] {t['task']}" for i, t in enumerate(todos))


def complete_todo(number: int) -> str:
    """Mark a to-do as done by its number from list_todos.

    Args:
        number: 1-based number of the task.
    """
    with _lock:
        db = _load()
        if not 1 <= number <= len(db["todos"]):
            return "There is no task with that number."
        db["todos"][number - 1]["done"] = True
        _save(db)
        return f"Done mark kiya: {db['todos'][number - 1]['task']}"


# ---------------- Reminders ----------------

def add_reminder(text: str, minutes_from_now: int = 0, at_time: str = "") -> str:
    """Set a reminder. Give either minutes_from_now OR at_time.

    Args:
        text: What to remind about.
        minutes_from_now: Remind after this many minutes.
        at_time: Exact time as 'YYYY-MM-DD HH:MM' (24h) in the user's local time.
    """
    if at_time:
        try:
            due = datetime.strptime(at_time, "%Y-%m-%d %H:%M")
        except ValueError:
            return "Use the time format 'YYYY-MM-DD HH:MM'."
    elif minutes_from_now > 0:
        due = datetime.now() + timedelta(minutes=minutes_from_now)
    else:
        return "When should the reminder fire? Give minutes or a time."
    with _lock:
        db = _load()
        db["reminders"].append({"text": text, "due": due.strftime("%Y-%m-%d %H:%M"), "fired": False})
        _save(db)
    return f"Reminder set: '{text}' at {due:%d %b %I:%M %p}."


def list_reminders() -> str:
    """List upcoming reminders."""
    rem = [r for r in _load()["reminders"] if not r["fired"]]
    if not rem:
        return "No upcoming reminders."
    return "\n".join(f"- {r['text']} at {r['due']}" for r in sorted(rem, key=lambda r: r["due"]))


def pop_due_reminders() -> list[str]:
    """Used by the web UI poller (not an AI tool)."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    due = []
    with _lock:
        db = _load()
        for r in db["reminders"]:
            if not r["fired"] and r["due"] <= now:
                r["fired"] = True
                due.append(r["text"])
        if due:
            _save(db)
    return due


# ---------------- Long-term facts ----------------

def remember_fact(fact: str) -> str:
    """Remember a permanent fact about the user (preferences, people, details) for future chats.

    Args:
        fact: The fact to remember.
    """
    with _lock:
        db = _load()
        db.setdefault("facts", []).append(fact)
        _save(db)
    return "Yaad rakh liya."


def get_facts() -> list[str]:
    return _load().get("facts", [])


MEMORY_TOOLS = [add_note, list_notes, add_todo, list_todos, complete_todo,
                add_reminder, list_reminders, remember_fact]
