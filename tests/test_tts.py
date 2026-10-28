import os, sys, wave, io
os.environ.update(KOKORO_TTS="1", KOKORO_DIR=os.environ.get("KOKORO_DIR", "data/kokoro"), GEMINI_API_KEY="x")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from app import main, tts_local
c = TestClient(main.app, client=("127.0.0.1", 50000))
ok = bad = 0
def check(n, cond):
    global ok, bad
    print("PASS" if cond else "FAIL", n); ok += cond; bad += (not cond)
check("config flag", c.get("/api/config").json().get("local_tts") is True)
r = c.post("/api/tts", json={"text": "नमस्ते, मैं आपका सहायक हूँ।", "voice": "hm_omega"})
print(r.status_code, r.content[:200])
check("200 wav", r.status_code == 200 and r.headers["content-type"] == "audio/wav")
w = wave.open(io.BytesIO(r.content)); dur = w.getnframes() / w.getframerate()
check(f"audio length plausible ({dur:.1f}s)", 1.0 < dur < 10 and w.getframerate() == 24000)
check("empty text -> 503", c.post("/api/tts", json={"text": "  "}).status_code == 503)
check("bad voice falls back", c.post("/api/tts", json={"text": "नमस्ते", "voice": "../../etc/passwd"}).status_code == 200)
os.environ["KOKORO_TTS"] = "0"
check("off -> 503", c.post("/api/tts", json={"text": "नमस्ते"}).status_code == 503)
print(ok, "passed", bad, "failed"); sys.exit(bad > 0)
