"""Contacts: your own saved list (data/contacts.json) + Google Contacts."""

import json
import re
import threading
from pathlib import Path

CONTACTS_FILE = Path(__file__).resolve().parent.parent / "data" / "contacts.json"
_lock = threading.Lock()
_people_warm = False


def _norm_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    return digits


def _load() -> dict:
    try:
        return json.loads(CONTACTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict):
    CONTACTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONTACTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _google_search(name: str) -> list[dict]:
    """Search Google Contacts. Returns [] if Google is not connected or permission is missing."""
    global _people_warm
    try:
        from .google_tools import _service
        people = _service("people", "v1")
        if not _people_warm:  # Google asks for one empty warm-up search first
            people.people().searchContacts(query="", readMask="names").execute()
            _people_warm = True
        res = people.people().searchContacts(query=name, readMask="names,phoneNumbers", pageSize=10).execute()
    except Exception:
        return []
    out = []
    for r in res.get("results", []):
        p = r.get("person", {})
        nm = (p.get("names") or [{}])[0].get("displayName", "")
        for ph in p.get("phoneNumbers", []):
            out.append({"name": nm, "phone": _norm_phone(ph.get("value", "")), "source": "Google Contacts"})
    return out


def find_matches(name: str) -> list[dict]:
    q = name.lower().strip()
    local = [{"name": n, "phone": p, "source": "saved"} for n, p in _load().items() if q in n.lower()]
    exact = [m for m in local if m["name"].lower() == q]
    if exact:
        return exact
    return local + _google_search(name)


def resolve_contact(name: str) -> dict:
    """Return {'name','phone'} only when exactly one phone matches; else {}."""
    matches = find_matches(name)
    phones = {m["phone"] for m in matches if m["phone"]}
    if len(phones) == 1:
        m = next(m for m in matches if m["phone"])
        return {"name": m["name"], "phone": m["phone"]}
    return {}


def save_contact(name: str, phone: str) -> str:
    """Save or update a contact's phone number in the agent's own contact list.

    Args:
        name: Contact name, e.g. 'Jyotish'.
        phone: Phone number (10 digits or with country code).
    """
    num = _norm_phone(phone)
    if len(num) < 11:
        return "Phone number sahi nahi lag raha. 10 digit ya country code ke saath do."
    with _lock:
        data = _load()
        data[name.strip()] = num
        _save(data)
    return f"{name} ka number save kar liya: +{num}"


def find_contact(name: str) -> str:
    """Look up a person's phone number in saved contacts and Google Contacts.

    Args:
        name: Name to search.
    """
    matches = find_matches(name)
    if not matches:
        return (f"'{name}' saved contacts ya Google Contacts mein nahi mila. WhatsApp chat list mein naam se "
                f"dhundh sakta hoon, ya number bata do.")
    return "\n".join(f"- {m['name']}: +{m['phone']} ({m['source']})" for m in matches[:10])


def list_contacts() -> str:
    """List all contacts saved in the agent's own contact list."""
    data = _load()
    if not data:
        return "Abhi koi contact save nahi hai."
    return "\n".join(f"- {n}: +{p}" for n, p in sorted(data.items()))


CONTACT_TOOLS = [save_contact, find_contact, list_contacts]
