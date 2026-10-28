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
    return f"Opened {url}."


def google_search(query: str) -> str:
    """Search Google in the browser.

    Args:
        query: What to search.
    """
    webbrowser.open("https://www.google.com/search?q=" + urllib.parse.quote(query))
    return f"Searched Google for '{query}'."


def play_youtube(query: str) -> str:
    """Search and open YouTube results for a song/video.

    Args:
        query: Song or video to find.
    """
    webbrowser.open("https://www.youtube.com/results?search_query=" + urllib.parse.quote(query))
    return f"Opened YouTube results for '{query}'."


def get_datetime() -> str:
    """Get current local date, day and time."""
    return datetime.now().strftime("Today is %A, %d %B %Y, %I:%M %p")


WEB_TOOLS = [open_website, google_search, play_youtube, get_datetime]  # WhatsApp lives in whatsapp_tools.py
