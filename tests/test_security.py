"""Security regression tests (run with `pytest`). No real apps, files or services are touched."""

import os
import subprocess
from pathlib import Path

import pytest

os.environ.setdefault("DEMO_MODE", "1")
os.environ["ACCESS_PIN"] = "123456"

from fastapi.testclient import TestClient  # noqa: E402

from app import pc_tools, web_tools  # noqa: E402
from app.util import RateLimiter, atomic_write  # noqa: E402


# ---------- file boundary ----------
def test_safe_path_allows_inside_and_blocks_outside(tmp_path, monkeypatch):
    root = tmp_path / "Docs"; root.mkdir()
    (root / "a.txt").write_text("x")
    monkeypatch.setattr(pc_tools, "SEARCH_ROOTS", [root])
    assert pc_tools.safe_path(root / "a.txt") == (root / "a.txt").resolve()
    assert pc_tools.safe_path(tmp_path / "secret.txt") is None
    assert pc_tools.safe_path(root / ".." / "secret.txt") is None
    assert pc_tools.safe_path("/etc/passwd") is None


def test_symlink_escape_is_blocked(tmp_path, monkeypatch):
    root = tmp_path / "Docs"; root.mkdir()
    outside = tmp_path / "outside"; outside.mkdir()
    (outside / "s.txt").write_text("secret")
    (root / "link").symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(pc_tools, "SEARCH_ROOTS", [root])
    assert pc_tools.safe_path(root / "link" / "s.txt") is None
    assert "outside" in pc_tools.open_file(str(root / "link" / "s.txt")).lower()
    assert "outside" in pc_tools.list_folder(str(root / "link")).lower()
    assert "Mili files" not in pc_tools.search_files("s.txt")


# ---------- no shell ----------
def test_open_app_never_uses_shell(monkeypatch):
    calls = []
    monkeypatch.setattr(pc_tools, "IS_WINDOWS", True)
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: calls.append((a, k)))
    monkeypatch.setattr(pc_tools, "_start_menu_shortcuts", lambda: iter(()))
    pc_tools.open_app("notepad")
    out = pc_tools.open_app("x & calc.exe")
    assert calls and all(not k.get("shell") and isinstance(a[0], list) for a, k in calls)
    assert len(calls) == 1 and "do not know" in out  # unknown names are refused, not executed


def test_close_app_refuses_protected_processes():
    assert "protected" in pc_tools.close_app("explorer")


def test_press_keys_allowlist():
    assert "not allowed" in pc_tools.press_keys("ctrl+alt+;")
    assert "not allowed" in pc_tools.press_keys("a+b+c+d+e")
    assert "too long" in pc_tools.type_text("x" * 5000)


# ---------- navigation ----------
@pytest.mark.parametrize("url", ["http://localhost:8000", "http://127.0.0.1", "http://[::1]/", "http://0x7f.1/",
                                 "http://2130706433", "http://192.168.1.1", "http://169.254.169.254/latest",
                                 "http://100.64.0.1", "file:///etc/passwd", "https://u:p@example.com", "http://printer.local"])
def test_private_urls_blocked(url):
    assert not web_tools.is_public_url(url)


def test_public_urls_allowed():
    assert web_tools.is_public_url("https://example.com/path?q=1")
    assert web_tools.is_public_url("http://8.8.8.8")


# ---------- persistence / limits ----------
def test_atomic_write_replaces_and_leaves_no_temp(tmp_path):
    f = tmp_path / "d" / "x.json"
    atomic_write(f, '{"a":1}'); atomic_write(f, '{"a":2}')
    assert f.read_text() == '{"a":2}'
    assert [p.name for p in f.parent.iterdir()] == ["x.json"]


def test_rate_limiter():
    rl = RateLimiter()
    assert all(rl.allow("k", 3) for _ in range(3))
    assert not rl.allow("k", 3)
    assert rl.allow("other", 3)


# ---------- API: confirmation integrity ----------
@pytest.fixture()
def client(monkeypatch):
    from app import main
    main._agent = None
    return TestClient(main.app, client=("127.0.0.1", 50000))


def _ask(c, sid="s1"):
    r = c.post("/api/chat", json={"text": "chrome band karo", "session_id": sid}).json()
    return r["confirm"]["id"]


def test_confirm_requires_matching_id_and_session(client):
    cid = _ask(client, "s1")
    assert client.post("/api/confirm", json={"approved": True, "session_id": "s1"}).json().get("error")
    assert client.post("/api/confirm", json={"approved": True, "session_id": "s1", "confirm_id": "wrong"}).json().get("error")
    other = client.post("/api/confirm", json={"approved": True, "session_id": "s2", "confirm_id": cid}).json()
    assert "nothing" in other["reply"].lower() or "pending" in other["reply"].lower()
    ok = client.post("/api/confirm", json={"approved": True, "session_id": "s1", "confirm_id": cid}).json()
    assert ok["actions"] and not ok.get("error")


def test_confirm_is_one_time(client):
    cid = _ask(client, "s3")
    body = {"approved": True, "session_id": "s3", "confirm_id": cid}
    assert client.post("/api/confirm", json=body).json()["actions"]
    again = client.post("/api/confirm", json=body).json()
    assert not again["actions"]


def test_input_limits(client):
    assert client.post("/api/chat", json={"text": "x" * 5000}).status_code == 422
    assert client.post("/api/chat", json={"text": "hi", "session_id": "../etc"}).status_code == 422
    assert client.post("/api/tts", json={"text": "x" * 2000}).status_code == 422


def test_remote_without_login_is_rejected():
    from app import main
    c = TestClient(main.app, client=("203.0.113.5", 4000))
    assert c.post("/api/chat", json={"text": "hi"}).status_code == 401
    assert c.post("/api/confirm", json={"approved": True}).status_code == 401


def test_forged_forwarding_header_is_not_trusted():
    from app import dashboard
    from starlette.requests import Request

    def req(peer, headers):
        return Request({"type": "http", "client": (peer, 1), "headers": [(k.encode(), v.encode()) for k, v in headers.items()]})
    assert dashboard.client_ip(req("203.0.113.5", {"x-forwarded-for": "1.2.3.4"})) == "203.0.113.5"
    assert dashboard.client_ip(req("127.0.0.1", {"cf-connecting-ip": "9.9.9.9"})) == "9.9.9.9"


# ---------- UI serving ----------
def test_root_serves_ui_or_build_hint_with_security_headers(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Content-Security-Policy" in r.headers and r.headers["X-Frame-Options"] == "DENY"
    assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()


def test_legacy_static_ui_is_gone(client):
    assert client.get("/static/app.js").status_code in (404, 200) and "SESSION" not in client.get("/static/app.js").text


# ---------- read-only UI support endpoints ----------
def test_config_exposes_model_and_flags_but_no_secrets(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "super-secret-key-123")
    monkeypatch.setenv("LLM_ROUTER_KEY", "router-secret-456")
    body = client.get("/api/config").text
    assert "super-secret-key-123" not in body and "router-secret-456" not in body
    cfg = client.get("/api/config").json()
    assert "model" in cfg and isinstance(cfg["integrations"]["whatsapp_session"], bool)
    assert {"gemini_key", "browser_agent", "desktop_automation", "wake_engine_running"} <= set(cfg["integrations"])


def test_memory_endpoint_is_read_only_and_reports_facts(client, tmp_path, monkeypatch):
    from app import memory_tools
    monkeypatch.setattr(memory_tools, "DATA_FILE", tmp_path / "memory.json")
    memory_tools.remember_fact("Om likes basmati rice")
    r = client.get("/api/memory").json()
    assert r["facts"] == ["Om likes basmati rice"] and r["counts"]["facts"] == 1
    assert client.post("/api/memory", json={"facts": ["x"]}).status_code in (404, 405)
