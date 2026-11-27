"""Human-like voice from Google's Gemini TTS models, using the same request shapes as cloud/api/index.py.

Needs a free Gemini API key (GEMINI_TTS_KEY, or GEMINI_API_KEY) and internet. The reply text is sent to Google;
on the free tier Google may use it to improve its products. The browser voice is used whenever this fails.
"""

import base64
import os
import re
import struct
import time

import httpx

BASE = "https://generativelanguage.googleapis.com/v1beta/"
MODELS = [("gemini-3.8-flash-tts", False), ("gemini-3.8-flash-lite-tts", False),
          ("gemini-3.1-flash-tts-preview", True), ("gemini-2.5-flash-preview-tts", True)]  # (name, old request shape)
VOICES = {"Sulafat", "Achernar", "Aoede", "Vindemiatrix", "Leda", "Kore", "Zephyr", "Gacrux", "Charon", "Puck", "Orus",
          "Algieba", "Achird", "Callirrhoe"}
MAX_CHARS = 700
BUDGET = 20.0  # seconds; the web UI gives up after 22
_good: dict = {"model": None}


def api_key() -> str:
    for name in ("GEMINI_TTS_KEY", "GEMINI_API_KEY"):
        key = os.getenv(name, "").strip()
        if key and key != "paste_your_key_here":
            return key
    return ""


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    head = struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + head + b"data" + struct.pack("<I", len(pcm)) + pcm


def _find_audio(obj) -> str | None:
    """Base64 audio from either response shape (Interactions or generateContent)."""
    if isinstance(obj, dict):
        inline = obj.get("inlineData") or obj.get("inline_data")
        if isinstance(inline, dict) and isinstance(inline.get("data"), str):
            return inline["data"]
        mime = str(obj.get("mime_type") or obj.get("mimeType") or "").lower()
        if isinstance(obj.get("data"), str) and ("audio" in mime or "l16" in mime):
            return obj["data"]
        obj = list(obj.values())
    if isinstance(obj, list):
        for item in obj:
            found = _find_audio(item)
            if found:
                return found
    return None


def _request(model: str, old: bool, text: str, voice: str, key: str, timeout: float):
    if old:
        url = f"{BASE}models/{model}:generateContent"
        body = {"contents": [{"parts": [{"text": text}]}], "generationConfig": {
            "responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    else:
        url = BASE + "interactions"
        body = {"model": model, "input": [{"type": "user_input", "content": [{"type": "text", "text": text}]}],
                "response_format": {"type": "audio"}, "generation_config": {"speech_config": [{"voice": voice}]}}
    return httpx.post(url, headers={"x-goog-api-key": key}, json=body, timeout=timeout)


def synthesize(text: str, voice: str = "Sulafat") -> bytes:
    """Return WAV bytes. Raises RuntimeError with a readable message (never containing the key)."""
    text = re.sub(r"\s+", " ", text or "").strip()[:MAX_CHARS]
    if not text:
        raise RuntimeError("Nothing to say.")
    key = api_key()
    if not key:
        raise RuntimeError("No Gemini key. Add it under Integrations, Natural voice.")
    voice = voice if voice in VOICES else "Sulafat"
    order = sorted(MODELS, key=lambda m: m[0] != _good["model"])  # the model that worked last goes first
    deadline, last = time.monotonic() + BUDGET, "no answer"
    for model, old in order:
        left = deadline - time.monotonic()
        if left < 2:
            break
        try:
            r = _request(model, old, text, voice, key, left)
        except httpx.HTTPError as e:
            last = type(e).__name__
            continue
        if r.status_code == 200:
            try:
                found = _find_audio(r.json())
                raw = base64.b64decode(found) if found else b""
            except ValueError:
                raw = b""
            if raw:
                _good["model"] = model
                return raw if raw[:4] == b"RIFF" else _wav(raw)
            last = "no audio in the answer"
            continue
        if r.status_code == 429:
            last = "free quota used up for now (429)"
            continue  # another model may still have quota
        if r.status_code in (400, 401, 403) and "API key" in r.text:
            raise RuntimeError("Gemini voice failed: the API key was not accepted.")
        last = f"error {r.status_code}"
    raise RuntimeError(f"Gemini voice failed: {last}.")
