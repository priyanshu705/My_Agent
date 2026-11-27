"""edge-tts voice: opt-in flag, voice choice and failure handling. No network: edge_tts is faked."""

import sys
import types

import pytest
from fastapi.testclient import TestClient

from app import main, tts_edge


def fake_edge(monkeypatch, parts=None, error=None):
    calls = []

    class Communicate:
        def __init__(self, text, voice, **kwargs):
            calls.append((text, voice))

        def stream_sync(self):
            if error:
                raise error
            return iter(parts or [])

    monkeypatch.setitem(sys.modules, "edge_tts", types.SimpleNamespace(Communicate=Communicate))
    return calls


@pytest.mark.parametrize("text,choice,voice", [
    ("Chrome khol diya", "Sulafat", "en-IN-NeerjaExpressiveNeural"),
    ("Done", "Charon", "en-IN-PrabhatNeural"),
    ("नमस्ते", "Sulafat", "hi-IN-SwaraNeural"),
    ("नमस्ते", "Orus", "hi-IN-MadhurNeural"),
])
def test_voice_follows_language_and_gender(text, choice, voice):
    assert tts_edge.pick_voice(text, choice) == voice


def test_api_returns_mp3_when_enabled(monkeypatch):
    calls = fake_edge(monkeypatch, [{"type": "audio", "data": b"ab"}, {"type": "SentenceBoundary"}, {"type": "audio", "data": b"c"}])
    monkeypatch.setenv("EDGE_TTS", "1")
    r = TestClient(main.app, client=("127.0.0.1", 50000)).post("/api/tts", json={"text": " Hello ", "voice": "Sulafat"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"abc"
    assert calls == [("Hello", "en-IN-NeerjaExpressiveNeural")]


@pytest.mark.parametrize("kwargs", [{"error": OSError("offline")}, {"parts": []}])
def test_api_reports_503_so_the_browser_voice_takes_over(monkeypatch, kwargs):
    fake_edge(monkeypatch, **kwargs)
    monkeypatch.setenv("EDGE_TTS", "1")
    r = TestClient(main.app, client=("127.0.0.1", 50000)).post("/api/tts", json={"text": "Hello", "voice": "Sulafat"})
    assert r.status_code == 503 and "Edge voice" in r.json()["detail"]


def test_off_by_default_never_calls_edge(monkeypatch):
    calls = fake_edge(monkeypatch, [{"type": "audio", "data": b"x"}])
    monkeypatch.delenv("EDGE_TTS", raising=False)
    monkeypatch.delenv("KOKORO_TTS", raising=False)
    r = TestClient(main.app, client=("127.0.0.1", 50000)).post("/api/tts", json={"text": "Hello"})
    assert r.status_code == 503 and calls == []
