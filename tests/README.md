# Tests

Run from the project folder (`python tests/test_x.py`). They use mock servers and fake shops, so nothing real is bought, sent or paid.

| File | Needs | What it proves |
|---|---|---|
| `test_agent_router.py` | base install | router-first brain, Gemini fallback, tool-call round trips |
| `test_bu.py` | `requirements-extra.txt` + Chromium | browser-use guards: final/pay buttons, password fields, domains |
| `test_wmcp.py` | `requirements-extra.txt` | Windows-MCP guards against a mock MCP server (runs on any OS) |
| `test_tts.py` | `kokoro-onnx` + model files in `KOKORO_DIR` | Hindi Kokoro endpoint returns real audio |
| `test_oww.py` | `openwakeword`, `kokoro-onnx`, `scipy` | wake word fires on "hey jarvis", stays quiet on other speech |

What these tests can NOT show: how it behaves on your real PC (real Windows apps, real microphone, real shopping sites, a real free LLM driving browser-use).
