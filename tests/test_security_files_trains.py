"""Added folders, hidden key files, folder settings and the train results reader."""

from fastapi.testclient import TestClient

from app import browser_tools, main, pc_tools, setup_api

SAMPLE = """Free Cancellation
15565Vaishali Exp
4.0
01:16 ETW

5h 29m

06:45 NDLS
Schedule

SL
₹220

WL 15

Confirm or 3X Refund*
3A
₹575
AVL 8
Available
12033Shatabdi Exp
07:21 ETW
CC
₹700
AVL 900
1A
Click to refresh
IRCTC Authorised Partner
Secure my trip
"""


def test_train_page_becomes_one_line_per_train():
    rows = browser_tools.format_trains(SAMPLE).splitlines()
    assert len(rows) == 2 and rows[0].startswith("15565 Vaishali Exp | 01:16 ETW") and "3A | ₹575 | AVL 8" in rows[0]
    assert "not refreshed" in rows[1] and "Secure my trip" not in rows[1]
    assert browser_tools.format_trains(SAMPLE, "3a").splitlines() == [rows[0]]


def test_train_search_rejects_anything_but_codes_and_dates():
    assert "station codes" in browser_tools.train_search("ETW/../x", "NDLS", "18-12-2026")
    assert "DD-MM-YYYY" in browser_tools.train_search("ETW", "NDLS", "18 Dec")


def test_added_folder_is_searched_and_listed_but_key_files_stay_hidden(monkeypatch, tmp_path):
    extra = tmp_path / "work"
    (extra / "placement" / "secrets").mkdir(parents=True)
    (extra / "placement" / "resume.pdf").write_text("x")
    (extra / ".env").write_text("KEY=1")
    monkeypatch.setattr(pc_tools, "SEARCH_ROOTS", [])
    monkeypatch.setenv("FILE_ROOTS", "")
    assert "allowed" in pc_tools.list_folder(str(extra))
    monkeypatch.setenv("FILE_ROOTS", str(extra))
    assert "placement" in pc_tools.search_files("Placement") and "resume.pdf" in pc_tools.search_files("resume")
    assert "resume.pdf" in pc_tools.list_folder("placement") and "secrets" not in pc_tools.list_folder("placement")
    assert "placement" in pc_tools.list_folder("work") and ".env" not in pc_tools.list_folder("work")
    assert "No file" in pc_tools.search_files(".env")
    assert pc_tools.safe_path(extra / ".env") is None


def test_same_name_in_the_home_folder_does_not_shadow_an_added_folder(monkeypatch, tmp_path):
    home, extra = tmp_path / "home", tmp_path / "added" / "work"
    (home / "work").mkdir(parents=True)  # exists, but is not an allowed folder (like /home/runner/work on CI)
    (extra / "inside").mkdir(parents=True)
    monkeypatch.setattr(pc_tools, "HOME", home)
    monkeypatch.setattr(pc_tools, "SEARCH_ROOTS", [])
    monkeypatch.setenv("FILE_ROOTS", str(extra))
    assert "inside" in pc_tools.list_folder("work")
    assert "allowed" in pc_tools.list_folder(str(home / "work"))


def test_folder_setting_accepts_real_folders_only(monkeypatch, tmp_path):
    monkeypatch.setattr(setup_api, "ENV_FILE", tmp_path / ".env")
    monkeypatch.setenv("FILE_ROOTS", "")
    client = TestClient(main.app, client=("127.0.0.1", 50000), base_url="http://127.0.0.1:8000")

    def save(value):
        return client.post("/api/setup", json={"values": {"FILE_ROOTS": value}}, headers={"x-agent-setup": "1"})

    for bad in ("relative\\folder", str(tmp_path / "missing"), "C:\\", "C:\\Windows", "\\\\server\\share"):
        assert save(bad).status_code == 400, bad
    work = tmp_path / "my work"
    work.mkdir()
    assert save(f"{work};").json()["fields"]["FILE_ROOTS"]["value"] == str(work.resolve())
