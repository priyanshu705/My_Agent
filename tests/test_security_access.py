"""With wide folder access: private files stay hidden, programs are not run, uploads ask first."""

import os

import pytest

from app import agent, browser_tools, pc_tools


@pytest.fixture
def home(monkeypatch, tmp_path):
    root = tmp_path / "home"
    root.mkdir()
    monkeypatch.setattr(pc_tools, "SEARCH_ROOTS", [root / "Documents"])
    monkeypatch.setenv("FILE_ROOTS", str(root))
    return root


def make(root, rel):
    f = root / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text("x")
    return f


@pytest.mark.parametrize("rel", [
    "AppData/Local/Google/data.txt", ".ssh/id_ed25519", "project/.env", "project/.env.local", "secrets/note.txt",
    "My Passwords.xlsx", "vault.kdbx", "cert.pem", "token.json", "credentials.json", "jobhub-service-account.json",
    "chrome/Local State", "chrome/Default/History", ".git-credentials", ".claude/settings.json",
])
def test_private_files_are_hidden_everywhere(home, rel):
    if rel.startswith("chrome/"):
        make(home, "chrome/Local State")
    f = make(home, rel)
    assert pc_tools.safe_path(f) is None
    assert str(f) not in pc_tools.search_files(f.name)


def test_a_wider_folder_does_not_unhide_a_private_one(home, monkeypatch):
    f = make(home, "AppData/Local/x.txt")
    monkeypatch.setenv("FILE_ROOTS", os.pathsep.join([str(home), str(home / "AppData" / "Local")]))
    assert pc_tools.safe_path(f) is None


def test_normal_files_are_reachable(home):
    f = make(home, "placement/resume.pdf")
    assert pc_tools.safe_path(f) == f.resolve() and str(f.resolve()) in pc_tools.search_files("resume")


@pytest.mark.parametrize("name", ["a.exe", "b.BAT", "c.ps1", "d.py", "e.lnk", "f.exe.", "g.url"])
def test_programs_are_never_started(home, monkeypatch, name):
    started = []
    monkeypatch.setattr(os, "startfile", started.append, raising=False)
    monkeypatch.setattr(pc_tools, "IS_WINDOWS", True)
    f = make(home, name.rstrip("."))
    out = pc_tools.open_file(str(f.parent / name))
    assert not started and ("not opened" in out or "does not exist" in out)


def test_upload_asks_first_and_names_the_file():
    assert "browser_upload_file" in agent.NEEDS_CONFIRMATION and "browser_upload_file" in browser_tools.BROWSER_NEEDS_CONFIRMATION
    assert "resume.pdf" in agent.describe("browser_upload_file", {"path": r"C:\x\resume.pdf"})
