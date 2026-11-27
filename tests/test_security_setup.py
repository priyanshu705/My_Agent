"""Settings from the web UI (/api/setup) and the Gemini voice. No network; .env is a temporary file."""

import base64
import os

import pytest
from fastapi.testclient import TestClient

from app import main, setup_api, tts_gemini

HOST = "127.0.0.1:8000"
GOOD = {"x-agent-setup": "1", "origin": f"http://{HOST}"}


@pytest.fixture(autouse=True)
def clean(monkeypatch, tmp_path):
    for name in (*setup_api.FIELDS, "EDGE_TTS", "KOKORO_TTS", "ACCESS_PIN"):
        monkeypatch.setenv(name, "")  # remembered, so whatever a test saves is undone afterwards
        monkeypatch.delenv(name)
    env = tmp_path / ".env"
    env.write_text("# my settings\nUSER_NAME=Om\nGEMINI_TTS_KEY=old\n", encoding="utf-8")
    monkeypatch.setattr(setup_api, "ENV_FILE", env)
    monkeypatch.setattr(setup_api, "_restart", set())
    yield env


def client(ip="127.0.0.1", host=HOST):
    return TestClient(main.app, client=(ip, 50000), base_url=f"http://{host}")


def save(values, headers=GOOD, **kwargs):
    return client(**kwargs).post("/api/setup", json={"values": values}, headers=headers)


def test_save_updates_env_file_and_never_returns_the_key(clean):
    r = save({"GEMINI_TTS_KEY": "fake-gemini-key", "VOICE_ENGINE": "gemini"})
    assert r.status_code == 200 and r.json()["voice_engine"] == "gemini"
    assert "fake-gemini-key" not in r.text and "fake-gemini-key" not in client().get("/api/setup").text
    assert clean.read_text(encoding="utf-8").splitlines() == [
        "# my settings", "USER_NAME=Om", "GEMINI_TTS_KEY=fake-gemini-key", "VOICE_ENGINE=gemini"]
    assert os.environ["GEMINI_TTS_KEY"] == "fake-gemini-key"


@pytest.mark.parametrize("headers", [
    {"origin": f"http://{HOST}"},
    {"x-agent-setup": "1", "origin": "https://my-agent-ui-three.vercel.app"},
    {"x-agent-setup": "1", "sec-fetch-site": "cross-site"},
])
def test_other_websites_cannot_save(clean, headers):
    before = clean.read_text(encoding="utf-8")
    assert save({"WINDOWS_MCP": "1"}, headers=headers).status_code == 403
    assert clean.read_text(encoding="utf-8") == before


@pytest.mark.parametrize("kwargs", [{"ip": "192.168.1.20"}, {"host": "evil.example:8000"}])
def test_only_this_pc_and_its_own_address(kwargs):
    assert client(**kwargs).get("/api/setup").status_code == 403
    assert save({"WINDOWS_MCP": "1"}, headers={"x-agent-setup": "1"}, **kwargs).status_code == 403


@pytest.mark.parametrize("values", [
    {"ACCESS_PIN": "123456"},
    {"GEMINI_API_KEY": "abc\nWINDOWS_MCP=1"},
    {"GEMINI_API_KEY": "has a space inside"},
    {"LLM_ROUTER_URL": "file:///c:/x"},
    {"VOICE_ENGINE": "anything"},
])
def test_bad_names_and_values_are_rejected(clean, values):
    before = clean.read_text(encoding="utf-8")
    assert save(values).status_code in (400, 422)
    assert clean.read_text(encoding="utf-8") == before


def test_new_router_address_needs_the_key_again(monkeypatch):
    monkeypatch.setenv("LLM_ROUTER_URL", "https://old.example/v1")
    monkeypatch.setenv("LLM_ROUTER_KEY", "old-router-key")
    assert save({"LLM_ROUTER_URL": "https://new.example/v1"}).status_code == 400
    assert save({"LLM_ROUTER_URL": "https://new.example/v1", "LLM_ROUTER_KEY": "new-router-key"}).status_code == 200


def test_new_ai_key_rebuilds_the_agent_and_features_ask_for_restart(monkeypatch):
    monkeypatch.setattr(main, "_agent", object())
    r = save({"GEMINI_API_KEY": "fake-gemini-key", "BROWSER_AGENT": "1"})
    assert main._agent is None and r.json()["restart_needed"] == ["BROWSER_AGENT"]


def test_old_flags_still_pick_the_voice(monkeypatch):
    assert setup_api.current_engine() == "browser"
    monkeypatch.setenv("EDGE_TTS", "1")
    assert setup_api.current_engine() == "edge"
    monkeypatch.setenv("VOICE_ENGINE", "gemini")
    assert setup_api.current_engine() == "gemini"


class Answer:
    def __init__(self, status, body=None, text=""):
        self.status_code, self._body, self.text = status, body, text

    def json(self):
        return self._body


def test_gemini_voice_returns_wav_and_moves_on_after_a_quota_error(monkeypatch):
    monkeypatch.setenv("GEMINI_TTS_KEY", "fake-gemini-key")
    monkeypatch.setattr(tts_gemini, "_good", {"model": None})
    seen = []

    def post(url, headers, json, timeout):
        seen.append(json.get("model", url))
        if len(seen) == 1:
            return Answer(429)
        return Answer(200, {"output": [{"mime_type": "audio/l16", "data": base64.b64encode(b"\x01\x02" * 100).decode()}]})

    monkeypatch.setattr(tts_gemini.httpx, "post", post)
    monkeypatch.setenv("VOICE_ENGINE", "gemini")
    r = client().post("/api/tts", json={"text": "Namaste", "voice": "Sulafat"})
    assert r.status_code == 200 and r.content[:4] == b"RIFF" and len(r.content) == 244
    assert seen == ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]


def test_gemini_voice_without_key_or_with_bad_key_gives_503(monkeypatch):
    monkeypatch.setenv("VOICE_ENGINE", "gemini")
    r = client().post("/api/tts", json={"text": "Hello"})
    assert r.status_code == 503 and "No Gemini key" in r.json()["detail"]
    monkeypatch.setenv("GEMINI_TTS_KEY", "wrong-gemini-key")
    monkeypatch.setattr(tts_gemini.httpx, "post", lambda *a, **k: Answer(400, text="API key not valid"))
    r = client().post("/api/tts", json={"text": "Hello"})
    assert r.status_code == 503 and "not accepted" in r.json()["detail"] and "wrong-gemini-key" not in r.text
