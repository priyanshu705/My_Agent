"""Offline "hey ..." wake word with openWakeWord (Apache-2.0 code), so waking the agent does not depend on Chrome's cloud speech.

A background thread listens to the PC microphone (16 kHz, nothing is recorded or sent anywhere) and bumps a counter when the wake
phrase is heard. The web UI polls /api/wake and starts listening for the command when the counter changes.

OFF by default. Turn on with WAKEWORD_ENGINE=openwakeword in .env and `pip install -r requirements-extra.txt`.
  OWW_MODEL      pretrained name (hey_jarvis, alexa, hey_mycroft) or a path to your own .onnx model. Default: hey_jarvis
  OWW_THRESHOLD  0..1, higher = fewer false wake-ups. Default 0.6
  OWW_DEVICE     microphone index or name (optional)

Honest notes: the pretrained phrases are English ("hey jarvis"). Similar sounding phrases can wake it too (in tests "hey Travis"
did). For your own phrase such as "hey agent", train a custom model (openWakeWord's training Colab) and point OWW_MODEL at the .onnx.
The pretrained openWakeWord models are licensed CC BY-NC-SA 4.0 (fine for personal use, not for selling).
"""

import os
import threading
import time

_state = {"seq": 0, "at": 0.0, "running": False, "error": ""}
_COOLDOWN = 3.0
CHUNK = 1280  # 80 ms at 16 kHz, what openWakeWord expects


def enabled() -> bool:
    return os.getenv("WAKEWORD_ENGINE", "").lower() == "openwakeword"


def threshold() -> float:
    try:
        return min(0.99, max(0.1, float(os.getenv("OWW_THRESHOLD", "0.6"))))
    except ValueError:
        return 0.6


def status() -> dict:
    return {"seq": _state["seq"], "running": _state["running"], "error": _state["error"]}


class Detector:
    """Feed it int16 mono 16 kHz chunks. feed() returns True when the wake phrase was just heard."""

    def __init__(self, model=None, thresh: float | None = None, cooldown: float = _COOLDOWN):
        import openwakeword
        from openwakeword.model import Model
        name = (model or os.getenv("OWW_MODEL", "hey_jarvis")).strip()
        if name.endswith(".onnx") and os.path.exists(name):
            paths = [name]
        else:
            paths = [p for p in openwakeword.get_pretrained_model_paths() if name in os.path.basename(p)]
        if not paths:
            raise RuntimeError(f"Wake word model '{name}' not found. Use hey_jarvis, alexa, hey_mycroft or the path to your .onnx file.")
        self.model = Model(wakeword_model_paths=paths)
        self.thresh = thresh if thresh is not None else threshold()
        self.cooldown = cooldown
        self._last = 0.0

    def feed(self, pcm, now: float | None = None) -> bool:
        scores = self.model.predict(pcm)
        now = time.time() if now is None else now
        if scores and max(scores.values()) >= self.thresh and now - self._last >= self.cooldown:
            self._last = now
            self.model.reset()
            return True
        return False


def _loop():
    try:
        import numpy as np
        import sounddevice as sd
        det = Detector()
        dev = os.getenv("OWW_DEVICE") or None
        if dev and dev.isdigit():
            dev = int(dev)
        _state["running"], _state["error"] = True, ""
        with sd.InputStream(samplerate=16000, channels=1, dtype="int16", blocksize=CHUNK, device=dev) as stream:
            while True:
                data, _ = stream.read(CHUNK)
                if det.feed(np.ascontiguousarray(data[:, 0])):
                    _state["seq"] += 1
                    _state["at"] = time.time()
    except Exception as e:  # noqa: BLE001
        _state["running"], _state["error"] = False, f"Wake word stopped: {e}"


def start() -> None:
    if enabled() and not _state["running"]:
        threading.Thread(target=_loop, daemon=True, name="openwakeword").start()
