"""Natural neural voice using edge-tts (https://github.com/rany2/edge-tts): Microsoft Edge's online voices, no API key.

OFF by default. Turn on with EDGE_TTS=1 and `pip install -r requirements-extra.txt`.

Honest notes: it needs internet, the reply text is sent to Microsoft's speech service, and this is not an official
public API, so it can stop working. The browser voice is used whenever it fails.
"""

import os
import re

# language -> (female, male). en-IN also reads Hinglish written in Latin letters.
VOICES = {
    "en": ("en-IN-NeerjaExpressiveNeural", "en-IN-PrabhatNeural"),
    "hi": ("hi-IN-SwaraNeural", "hi-IN-MadhurNeural"),
}
MALE_CHOICES = {"Charon", "Orus", "hm_omega", "hm_psi"}  # voice names the UI sends that mean "a male voice"
MAX_CHARS = 600


def enabled() -> bool:
    return os.getenv("EDGE_TTS", "0") == "1"


def pick_voice(text: str, choice: str) -> str:
    """Hindi voice for Devanagari text, Indian English otherwise; keeps the female/male choice made in Settings."""
    lang = "hi" if re.search(r"[ऀ-ॿ]", text) else "en"
    return VOICES[lang][1 if choice in MALE_CHOICES else 0]


def synthesize(text: str, choice: str = "") -> bytes:
    """Return MP3 bytes. Raises RuntimeError with a readable message if it fails.

    Speed is not applied here: the web UI already changes the playback rate.
    """
    text = (text or "").strip()[:MAX_CHARS]
    if not text:
        raise RuntimeError("Nothing to say.")
    try:
        import edge_tts
    except ImportError as e:
        raise RuntimeError("edge-tts is not installed. Run: pip install -r requirements-extra.txt") from e
    try:
        speech = edge_tts.Communicate(text, pick_voice(text, choice), connect_timeout=8, receive_timeout=15)
        audio = b"".join(part["data"] for part in speech.stream_sync() if part["type"] == "audio")
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Edge voice failed: {type(e).__name__}") from e
    if not audio:
        raise RuntimeError("Edge voice returned no audio.")
    return audio
