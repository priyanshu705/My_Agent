"""Web actions: Google search, YouTube, open websites, time, WhatsApp Web."""

import urllib.parse
import webbrowser
from datetime import datetime

SITES = {
    "youtube": "https://www.youtube.com", "gmail": "https://mail.google.com",
    "google": "https://www.google.com", "calendar": "https://calendar.google.com",
    "whatsapp": "https://web.whatsapp.com", "instagram": "https://www.instagram.com",
    "linkedin": "https://www.linkedin.com", "github": "https://github.com",
    "chatgpt": "https://chatgpt.com", "claude": "https://claude.ai",
    "drive": "https://drive.google.com", "maps": "https://maps.google.com",
}


def open_website(site: str) -> str:
    """Open a website in the PC browser. Accepts a known name ('youtube', 'gmail') or a URL.

    Args:
        site: Site name or full URL.
    """
    key = site.lower().strip()
    url = SITES.get(key) or (site if site.startswith("http") else f"https://{site}")
    webbrowser.open(url)
    return f"{url} khol diya."


def google_search(query: str) -> str:
    """Search Google in the browser.

    Args:
        query: What to search.
    """
    webbrowser.open("https://www.google.com/search?q=" + urllib.parse.quote(query))
    return f"Google par '{query}' search kar diya."


def play_youtube(query: str) -> str:
    """Search and open YouTube results for a song/video.

    Args:
        query: Song or video to find.
    """
    webbrowser.open("https://www.youtube.com/results?search_query=" + urllib.parse.quote(query))
    return f"YouTube par '{query}' khol diya."


def whatsapp_message(phone: str, message: str) -> str:
    """Open WhatsApp Web with a message pre-filled for a phone number. The user presses Send themselves.

    Args:
        phone: Phone number with country code, e.g. 919876543210.
        message: Message text.
    """
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        digits = "91" + digits
    webbrowser.open(f"https://web.whatsapp.com/send?phone={digits}&text={urllib.parse.quote(message)}")
    return "WhatsApp Web par message ready hai, Send aap dabao."


def get_datetime() -> str:
    """Get current local date, day and time."""
    return datetime.now().strftime("Aaj %A, %d %B %Y hai, time %I:%M %p")


WEB_TOOLS = [open_website, google_search, play_youtube, whatsapp_message, get_datetime]
