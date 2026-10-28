import os, sys, json, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
os.environ.update(GEMINI_API_KEY="g", LLM_ROUTER_URL="http://127.0.0.1:8777/v1", LLM_ROUTER_KEY="freellmapi-test", AGENT_NAME="Agent", USER_NAME="Om")
import tempfile; os.chdir(tempfile.mkdtemp())
ok = []
def check(n, c, x=""):
    print(("PASS " if c else "FAIL ") + n, x); ok.append(bool(c))
REQS, SCRIPT = [], []
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"]))); REQS.append((self.headers.get("Authorization"), req))
        item = SCRIPT.pop(0)
        if isinstance(item, int):
            self.send_response(item); self.end_headers(); self.wfile.write(b"busy"); return
        msg = {"role": "assistant", "content": item.get("text"), "tool_calls": item.get("calls")}
        body = json.dumps({"model": "groq/llama", "choices": [{"message": msg}]}).encode()
        self.send_response(200); self.send_header("Content-Type","application/json"); self.end_headers(); self.wfile.write(body)
srv = HTTPServer(("127.0.0.1", 8777), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
def tc(id, name, args): return {"id": id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}

from app import agent as A, llm_router
ag = A.Agent()
calls = []
A.TOOL_MAP["remember_fact"] = lambda fact: (calls.append(("remember_fact", fact)) or "Saved.")
A.TOOL_MAP["close_app"] = lambda app_name: (calls.append(("close_app", app_name)) or "Closed.")

# 1: tool call through the router, then final text
SCRIPT[:] = [{"calls": [tc("tc_9", "remember_fact", {"fact": "likes basmati rice"})]}, {"text": "Okay, I will remember that."}]
r = ag.chat("s1", "remember that I like basmati rice")
check("router: reply returned", r["reply"] == "Okay, I will remember that.", r["reply"])
check("router: tool executed with args", calls == [("remember_fact", "likes basmati rice")], str(calls))
auth, req1 = REQS[0]; _, req2 = REQS[1]
check("router: bearer key sent", auth == "Bearer freellmapi-test")
check("router: system + tools sent", req1["messages"][0]["role"] == "system" and len(req1["tools"]) > 40, f'{len(req1["tools"])} tools')
m2 = req2["messages"]
check("router: tool result linked to the call id", m2[-1] == {"role": "tool", "tool_call_id": "tc_9", "content": "Saved."}, str(m2[-2:]))
check("router: assistant tool_calls kept", m2[-2]["role"] == "assistant" and m2[-2]["tool_calls"][0]["id"] == "tc_9")

# 2: confirm-required tool coming from the router still asks the user first
REQS.clear(); calls.clear()
SCRIPT[:] = [{"calls": [tc("c1", "close_app", {"app_name": "chrome"})]}, {"text": "Chrome is closed."}]
r = ag.chat("s2", "close chrome")
check("confirm: card shown, tool NOT run yet", "confirm" in r and calls == [], str(r.get("confirm")))
r = ag.chat("s2", "yes")
check("confirm: runs after yes", calls == [("close_app", "chrome")] and r["reply"] == "Chrome is closed.", r["reply"])

# 3: router 503 -> falls back to Gemini models (first one retired 404, second works)
REQS.clear(); SCRIPT[:] = [503]
llm_router._down["until"] = 0
tried = []
class FakeErr(Exception):
    def __init__(s, code): s.code = code
class FakeResp:
    def __init__(s, text):
        from google.genai import types
        s.candidates = [type("C", (), {"content": types.Content(role="model", parts=[types.Part.from_text(text=text)])})()]
        s.function_calls = []; s.text = text
def fake_gen(model, contents, config):
    tried.append(model)
    if model == "gemini-3.5-flash-lite": raise FakeErr(404)
    return FakeResp("gemini says hi")
ag.client = type("X", (), {"models": type("M", (), {"generate_content": staticmethod(fake_gen)})()})()
r = ag.chat("s3", "hello")
check("fallback: router 503 -> Gemini answered", r["reply"] == "gemini says hi", r["reply"])
check("fallback: retired model skipped", tried[:2] == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"], str(tried))
check("fallback: remembers the working model", ag._good_model == "gemini-3.1-flash-lite")

# 4: router unreachable -> cooldown, Gemini quota error gives a friendly message
llm_router._down["until"] = 0
os.environ["LLM_ROUTER_URL"] = "http://127.0.0.1:1/v1"
tried.clear()
def quota(model, contents, config): tried.append(model); raise FakeErr(429)
ag.client.models.generate_content = staticmethod(quota)
r = ag.chat("s4", "hello again")
check("fallback: quota message is friendly", "quota" in r["reply"].lower() and r.get("error"), r["reply"])
check("fallback: router put on cooldown", llm_router._down["until"] > time.time())
check("fallback: tried several models", len(tried) >= 3, str(tried))

# 5: no Gemini key at all but router configured: agent still constructs
os.environ["LLM_ROUTER_URL"] = "http://127.0.0.1:8777/v1"; llm_router._down["until"] = 0
del os.environ["GEMINI_API_KEY"]
ag2 = A.Agent(); check("no Gemini key needed when router is set", ag2.client is None)
SCRIPT[:] = [{"text": "router only works"}]
r = ag2.chat("s5", "hi"); check("router-only chat", r["reply"] == "router only works", r["reply"])
print("RESULT:", "ALL PASS" if all(ok) else f"{ok.count(False)} FAILED")
