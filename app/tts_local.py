"""Free offline Hindi voice for the local app, using Kokoro (kokoro-onnx, Apache-2.0). Runs on the PC's CPU, no API key, no quota.

The browser UI already has an English Kokoro voice (kokoro-js). That library cannot speak Hindi, so Hindi (Devanagari) replies
used to fall back to the robotic browser voice. This module adds Kokoro's Hindi voices (hf_alpha, hf_beta, hm_omega, hm_psi).

OFF by default. Turn on with KOKORO_TTS=1 in .env and `pip install -r requirements-extra.txt`. The first use downloads the int8
model (~92 MB) and voices (~28 MB) from the kokoro-onnx GitHub release into data/kokoro/ (one time).
"""

import io
import os
import threading
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(os.getenv("KOKORO_DIR") or ROOT / "data" / "kokoro")
_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = {"kokoro-v1.0.int8.onnx": 80_000_000, "voices-v1.0.bin": 20_000_000}  # name -> minimum plausible size in bytes
HINDI_VOICES = {"hf_alpha", "hf_beta", "hm_omega", "hm_psi"}
MAX_CHARS = 600
_lock = threading.Lock()
_tts = {"obj": None}


def enabled() -> bool:
    return os.getenv("KOKORO_TTS", "0") == "1"


def _ensure_models() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, min_size in FILES.items():
        path = MODEL_DIR / name
        if path.exists() and path.stat().st_size >= min_size:
            continue
        tmp = path.with_suffix(path.suffix + ".part")
        urllib.request.urlretrieve(_BASE + name, tmp)  # noqa: S310 - fixed https URL above
        if tmp.stat().st_size < min_size:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"Downloaded {name} looks incomplete. Try again.")
        tmp.replace(path)


def _load():
    if _tts["obj"] is None:
        from kokoro_onnx import Kokoro
        _ensure_models()
        _tts["obj"] = Kokoro(str(MODEL_DIR / "kokoro-v1.0.int8.onnx"), str(MODEL_DIR / "voices-v1.0.bin"))
    return _tts["obj"]


def to_wav(samples, rate: int) -> bytes:
    import numpy as np
    pcm = (np.clip(np.asarray(samples, dtype="float32"), -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(rate))
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def synthesize(text: str, voice: str = "hf_alpha", speed: float = 1.0) -> bytes:
    """Return WAV bytes. Raises RuntimeError with a readable message if Kokoro is off or fails."""
    if not enabled():
        raise RuntimeError("Local Kokoro voice is off. Set KOKORO_TTS=1 in .env.")
    text = (text or "").strip()[:MAX_CHARS]
    if not text:
        raise RuntimeError("Nothing to say.")
    if voice not in HINDI_VOICES:
        voice = "hf_alpha"
    try:
        with _lock:  # one synthesis at a time; the model is not thread-safe
            samples, rate = _load().create(text, voice=voice, speed=max(0.7, min(1.3, float(speed))), lang="hi")
    except ImportError as e:
        raise RuntimeError("kokoro-onnx is not installed. Run: pip install -r requirements-extra.txt") from e
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Kokoro voice failed: {e}") from e
    return to_wav(samples, rate)
