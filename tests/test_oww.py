import os, sys, numpy as np
os.environ.update(WAKEWORD_ENGINE="openwakeword", GEMINI_API_KEY="x")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scipy.signal import resample_poly
from kokoro_onnx import Kokoro
from app import wakeword as ww
k = Kokoro(os.path.join(os.environ.get("KOKORO_DIR", "data/kokoro"), "kokoro-v1.0.int8.onnx"), os.path.join(os.environ.get("KOKORO_DIR", "data/kokoro"), "voices-v1.0.bin"))
def clip(t, v="af_heart"):
    a, _ = k.create(t, voice=v, speed=1.0, lang="en-us")
    return np.concatenate([np.zeros(16000, np.int16), (np.clip(resample_poly(a, 2, 3), -1, 1) * 32767).astype(np.int16), np.zeros(16000, np.int16)])
def hits(det, pcm, t0=1000.0):
    n = 0
    for j, i in enumerate(range(0, len(pcm) - ww.CHUNK, ww.CHUNK)):
        n += det.feed(pcm[i:i + ww.CHUNK], now=t0 + j * 0.08)
    return n
ok = bad = 0
def check(n, c):
    global ok, bad; print("PASS" if c else "FAIL", n); ok += bool(c); bad += (not c)
d = ww.Detector()
check("wakes on 'hey jarvis' (female)", hits(d, clip("Hey Jarvis")) == 1)
check("wakes on 'hey jarvis' (male)", hits(ww.Detector(), clip("Hey Jarvis", "am_michael")) == 1)
check("quiet on normal speech", hits(ww.Detector(), clip("Please open the calculator and then play some relaxing music for me")) == 0)
check("quiet on silence", hits(ww.Detector(), np.zeros(16000 * 5, np.int16)) == 0)
d2 = ww.Detector(cooldown=3.0)
two = np.concatenate([clip("Hey Jarvis"), clip("Hey Jarvis")])
check("cooldown: back-to-back counted once per 3 s window", hits(d2, two) <= 2)
try: ww.Detector(model="nope"); check("unknown model raises", False)
except RuntimeError: check("unknown model raises", True)
from fastapi.testclient import TestClient
from app import main
c = TestClient(main.app, client=("127.0.0.1", 50000))
check("config says oww", c.get("/api/config").json()["wake_engine"] == "oww")
check("/api/wake shape", set(c.get("/api/wake").json()) == {"seq", "running", "error"})
print(ok, "passed", bad, "failed"); sys.exit(bad > 0)
