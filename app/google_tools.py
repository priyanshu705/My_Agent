"""Phase 2: Gmail + Google Calendar tools.

One-time setup: put credentials.json (Google Cloud OAuth "Desktop app" client) in the
project folder and run setup_google.bat. A token.json is saved after you log in.
"""

import base64
import os
import re
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CREDENTIALS = ROOT / "credentials.json"
TOKEN = ROOT / "token.json"
SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",    # read, draft, send (no permanent delete)
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/contacts.readonly",  # Phase 3: find WhatsApp numbers by name
]

SETUP_MSG = ("Google is not connected yet. Follow the 'Phase 2: Gmail + Calendar setup' steps in the README "
             "aur setup_google.bat chalao.")

_services = {}


def tz() -> ZoneInfo:
    return ZoneInfo(os.getenv("TIMEZONE", "Asia/Kolkata"))


# ---------------- Auth ----------------

def get_credentials(interactive: bool = False):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = Credentials.from_authorized_user_file(str(TOKEN)) if TOKEN.exists() else None
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            TOKEN.write_text(creds.to_json())
            return creds
        except Exception:
            creds = None
    if not interactive:
        return None
    if not CREDENTIALS.exists():
        raise FileNotFoundError(f"credentials.json not found: {CREDENTIALS}")
    from google_auth_oauthlib.flow import InstalledAppFlow
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent")
    TOKEN.write_text(creds.to_json())
    return creds


def is_connected() -> bool:
    try:
        return get_credentials() is not None
    except Exception:
        return False


def _service(name: str, version: str):
    if name not in _services:
        creds = get_credentials()
        if not creds:
            raise ConnectionError(SETUP_MSG)
        from googleapiclient.discovery import build
        _services[name] = build(name, version, credentials=creds, cache_discovery=False)
    return _services[name]


def _gmail():
    return _service("gmail", "v1")


def _calendar():
    return _service("calendar", "v3")


def _safe(fn):
    """Turn setup/API errors into a readable sentence for the AI."""
    import functools

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ConnectionError as e:
            return str(e)
        except Exception as e:
            return f"Google se error aaya: {e}"
    return wrapper


# ---------------- Gmail ----------------

def _header(msg, name):
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _summaries(query: str, max_results: int) -> str:
    g = _gmail()
    res = g.users().messages().list(userId="me", q=query, maxResults=max(1, min(int(max_results), 15))).execute()
    ids = [m["id"] for m in res.get("messages", [])]
    if not ids:
        return "No mail found."
    lines = []
    for i, mid in enumerate(ids, 1):
        m = g.users().messages().get(userId="me", id=mid, format="metadata",
                                     metadataHeaders=["From", "Subject", "Date"]).execute()
        sender = re.sub(r"\s*<.*?>", "", _header(m, "From")).strip('" ')
        lines.append(f"{i}. [id:{mid}] {sender}: {_header(m, 'Subject') or '(no subject)'} "
                     f"({_header(m, 'Date')[:22]}) - {m.get('snippet', '')[:120]}")
    return "\n".join(lines)


@_safe
def gmail_list_unread(max_results: int = 5) -> str:
    """List the latest unread emails in the inbox (sender, subject, snippet, id).

    Args:
        max_results: How many emails to list (max 15).
    """
    return _summaries("is:unread in:inbox", max_results)


@_safe
def gmail_search(query: str, max_results: int = 5) -> str:
    """Search Gmail using Gmail search syntax, e.g. 'from:amazon', 'subject:offer letter', 'from:hr newer_than:7d'.

    Args:
        query: Gmail search query.
        max_results: How many results (max 15).
    """
    return _summaries(query, max_results)


def _body_text(payload) -> str:
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", "ignore")
    for part in payload.get("parts", []) or []:
        text = _body_text(part)
        if text:
            return text
    if payload.get("mimeType") == "text/html" and payload.get("body", {}).get("data"):
        html = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", "ignore")
        return re.sub(r"<[^>]+>", " ", html)
    return ""


@_safe
def gmail_read(message_id: str) -> str:
    """Read the full text of one email by its id (from gmail_list_unread / gmail_search).

    Args:
        message_id: The email id.
    """
    m = _gmail().users().messages().get(userId="me", id=message_id, format="full").execute()
    body = re.sub(r"\n{3,}", "\n\n", _body_text(m.get("payload", {})) or m.get("snippet", "")).strip()
    return (f"From: {_header(m, 'From')}\nTo: {_header(m, 'To')}\nSubject: {_header(m, 'Subject')}\n"
            f"Date: {_header(m, 'Date')}\n\n{body[:3000]}")


@_safe
def find_email_address(name: str) -> str:
    """Find someone's email address from past emails by their name. Use before sending/drafting if only a name is known.

    Args:
        name: Person's name, e.g. 'Jyotish'.
    """
    g = _gmail()
    res = g.users().messages().list(userId="me", q=name, maxResults=20).execute()
    found = {}
    for m in res.get("messages", []):
        msg = g.users().messages().get(userId="me", id=m["id"], format="metadata",
                                       metadataHeaders=["From", "To", "Cc"]).execute()
        for h in ("From", "To", "Cc"):
            for part in _header(msg, h).split(","):
                if name.lower() in part.lower():
                    em = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", part)
                    if em:
                        found[em.group().lower()] = part.strip()
    if not found:
        return f"Could not find an email address for '{name}' in past mail. Ask the user."
    return "Mile addresses:\n" + "\n".join(found.values())


def _mime(to: str, subject: str, body: str, cc: str = "") -> dict:
    msg = MIMEText(body, "plain", "utf-8")
    msg["to"], msg["subject"] = to, subject
    if cc:
        msg["cc"] = cc
    return {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode()}


def _valid_emails(*fields: str) -> bool:
    addrs = [a.strip() for f in fields if f for a in f.split(",") if a.strip()]
    return bool(addrs) and all(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", re.sub(r".*<|>", "", a)) for a in addrs)


@_safe
def gmail_create_draft(to: str, subject: str, body: str, cc: str = "") -> str:
    """Create an email draft in Gmail (not sent). The user can review it in Gmail Drafts.

    Args:
        to: Recipient email address(es), comma separated.
        subject: Email subject.
        body: Email body text.
        cc: Optional CC addresses.
    """
    if not _valid_emails(to):
        return "A valid email address is required (for example name@gmail.com)."
    d = _gmail().users().drafts().create(userId="me", body={"message": _mime(to, subject, body, cc)}).execute()
    return f"Draft created (id {d['id']}) - To: {to}, Subject: {subject}. You can review it in Gmail Drafts."


@_safe
def gmail_send(to: str, subject: str, body: str, cc: str = "") -> str:
    """Send an email immediately (needs user confirmation). Prefer gmail_create_draft unless the user clearly says send.

    Args:
        to: Recipient email address(es), comma separated.
        subject: Email subject.
        body: Email body text.
        cc: Optional CC addresses.
    """
    if not _valid_emails(to):
        return "A valid email address is required (for example name@gmail.com)."
    _gmail().users().messages().send(userId="me", body=_mime(to, subject, body, cc)).execute()
    return f"Email sent to {to} - Subject: {subject}."


# ---------------- Calendar ----------------

def _parse_dt(text: str) -> datetime:
    text = text.strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19], fmt).replace(tzinfo=tz())
        except ValueError:
            pass
    raise ValueError(f"Could not understand the date/time: '{text}'. Use the format 'YYYY-MM-DD HH:MM'.")


def _fmt_event(e) -> str:
    s = e.get("start", {})
    if "dateTime" in s:
        st = datetime.fromisoformat(s["dateTime"].replace("Z", "+00:00")).astimezone(tz())
        en = datetime.fromisoformat(e["end"]["dateTime"].replace("Z", "+00:00")).astimezone(tz())
        when = f"{st:%a %d %b, %I:%M %p}-{en:%I:%M %p}"
    else:
        when = f"{s.get('date')} (all day)"
    loc = f" @ {e['location']}" if e.get("location") else ""
    return f"[id:{e['id']}] {when}: {e.get('summary', '(no title)')}{loc}"


def _events_between(start: datetime, end: datetime, max_results: int = 25):
    res = _calendar().events().list(calendarId="primary", timeMin=start.isoformat(), timeMax=end.isoformat(),
                                    singleEvents=True, orderBy="startTime", maxResults=max_results).execute()
    return res.get("items", [])


@_safe
def calendar_list_events(date: str = "", days: int = 1) -> str:
    """List calendar events. Default is today. For tomorrow pass tomorrow's date; for a week pass days=7.

    Args:
        date: Start date 'YYYY-MM-DD' (empty = today).
        days: Number of days to cover.
    """
    start = _parse_dt(date) if date else datetime.now(tz())
    start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    events = _events_between(start, start + timedelta(days=max(1, int(days))))
    if not events:
        return "Nothing on the calendar at this time."
    return "\n".join(_fmt_event(e) for e in events)


@_safe
def calendar_add_event(title: str, start: str, duration_minutes: int = 60, description: str = "",
                       location: str = "", attendees: str = "") -> str:
    """Add an event/meeting to Google Calendar.

    Args:
        title: Event title.
        start: Start 'YYYY-MM-DD HH:MM' in the user's local time.
        duration_minutes: Length in minutes.
        description: Optional notes.
        location: Optional place.
        attendees: Optional guest emails, comma separated (they get an invite).
    """
    st = _parse_dt(start)
    body = {
        "summary": title, "description": description, "location": location,
        "start": {"dateTime": st.isoformat(), "timeZone": str(tz())},
        "end": {"dateTime": (st + timedelta(minutes=int(duration_minutes))).isoformat(), "timeZone": str(tz())},
    }
    if attendees:
        body["attendees"] = [{"email": a.strip()} for a in attendees.split(",") if a.strip()]
    e = _calendar().events().insert(calendarId="primary", body=body,
                                    sendUpdates="all" if attendees else "none").execute()
    return f"Calendar mein add kiya: {_fmt_event(e)}"


@_safe
def calendar_update_event(event_id: str, new_start: str = "", new_title: str = "",
                          new_duration_minutes: int = 0) -> str:
    """Change an existing event's time, title or length (needs user confirmation). Get event_id from calendar_list_events.

    Args:
        event_id: The event id.
        new_start: New start 'YYYY-MM-DD HH:MM' (empty = keep).
        new_title: New title (empty = keep).
        new_duration_minutes: New length in minutes (0 = keep).
    """
    cal = _calendar()
    e = cal.events().get(calendarId="primary", eventId=event_id).execute()
    if new_title:
        e["summary"] = new_title
    if new_start or new_duration_minutes:
        old_st = datetime.fromisoformat(e["start"]["dateTime"].replace("Z", "+00:00"))
        old_en = datetime.fromisoformat(e["end"]["dateTime"].replace("Z", "+00:00"))
        st = _parse_dt(new_start) if new_start else old_st
        dur = timedelta(minutes=int(new_duration_minutes)) if new_duration_minutes else old_en - old_st
        e["start"] = {"dateTime": st.isoformat(), "timeZone": str(tz())}
        e["end"] = {"dateTime": (st + dur).isoformat(), "timeZone": str(tz())}
    e = cal.events().update(calendarId="primary", eventId=event_id, body=e, sendUpdates="all").execute()
    return f"Event updated: {_fmt_event(e)}"


@_safe
def calendar_delete_event(event_id: str) -> str:
    """Cancel/delete a calendar event (needs user confirmation). Get event_id from calendar_list_events.

    Args:
        event_id: The event id.
    """
    cal = _calendar()
    e = cal.events().get(calendarId="primary", eventId=event_id).execute()
    cal.events().delete(calendarId="primary", eventId=event_id, sendUpdates="all").execute()
    return f"Event cancelled: {e.get('summary', '(no title)')}"


@_safe
def calendar_find_free_time(date: str = "", days: int = 7, min_minutes: int = 60,
                            day_start_hour: int = 9, day_end_hour: int = 21) -> str:
    """Find free slots in the calendar between day_start_hour and day_end_hour.

    Args:
        date: First day 'YYYY-MM-DD' (empty = today).
        days: How many days to check.
        min_minutes: Minimum slot length.
        day_start_hour: Day starts at this hour (24h).
        day_end_hour: Day ends at this hour (24h).
    """
    now = datetime.now(tz())
    first = (_parse_dt(date) if date else now).replace(hour=0, minute=0, second=0, microsecond=0)
    busy = []
    for e in _events_between(first, first + timedelta(days=int(days)), 250):
        if "dateTime" in e.get("start", {}):
            busy.append((datetime.fromisoformat(e["start"]["dateTime"].replace("Z", "+00:00")).astimezone(tz()),
                         datetime.fromisoformat(e["end"]["dateTime"].replace("Z", "+00:00")).astimezone(tz())))
    busy.sort()
    slots = []
    for d in range(int(days)):
        day = first + timedelta(days=d)
        cur = max(day.replace(hour=int(day_start_hour)), now)
        end = day.replace(hour=int(day_end_hour))
        for bs, be in busy:
            if be <= cur or bs >= end:
                continue
            if (bs - cur).total_seconds() >= min_minutes * 60:
                slots.append((cur, bs))
            cur = max(cur, be)
        if (end - cur).total_seconds() >= min_minutes * 60:
            slots.append((cur, end))
    if not slots:
        return "No free slot found in this range."
    return "Free slots:\n" + "\n".join(f"- {a:%a %d %b}: {a:%I:%M %p} - {b:%I:%M %p}" for a, b in slots[:20])


GOOGLE_TOOLS = [gmail_list_unread, gmail_search, gmail_read, find_email_address, gmail_create_draft, gmail_send,
                calendar_list_events, calendar_add_event, calendar_update_event, calendar_delete_event,
                calendar_find_free_time]

GOOGLE_NEEDS_CONFIRMATION = {"gmail_send", "calendar_update_event", "calendar_delete_event"}


if __name__ == "__main__":
    # python -m app.google_tools  -> opens the Google login page once and saves token.json
    get_credentials(interactive=True)
    print("Google connected! token.json saved. Now run run.bat.")
