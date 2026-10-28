import json, re, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
STATE = {"script": [], "i": 0, "seen": [], "last_user": ""}
def find(text, needle):
    # browser-use state lines look like: [12]<button id=s />\n\tSearch   or  [12]<input ... />
    for m in re.finditer(r"\[(\d+)\]<([a-z]+)([^\n]*)\n?([^\[\n]*)", text):
        blob = (m.group(3) + " " + m.group(4)).lower()
        if needle.lower() in blob: return int(m.group(1))
    return None
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length",0)); req = json.loads(self.rfile.read(n))
        msgs = req["messages"]; user = ""; texts = []
        for m in msgs:
            if m["role"] == "user":
                c = m["content"]; texts.append(c if isinstance(c,str) else " ".join(p.get("text","") for p in c if isinstance(p,dict)))
        withstate = [t for t in texts if "<browser_state>" in t]
        user = withstate[-1] if withstate else (texts[-1] if texts else "")
        STATE["last_user"] = user
        step = STATE["script"][min(STATE["i"], len(STATE["script"])-1)]; STATE["i"] += 1
        action = step(user) if callable(step) else step
        out = {"memory":"m","action":[action]}
        body = json.dumps({"id":"x","object":"chat.completion","created":0,"model":req.get("model","auto"),
            "choices":[{"index":0,"message":{"role":"assistant","content":json.dumps(out)},"finish_reason":"stop"}],
            "usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}).encode()
        self.send_response(200); self.send_header("Content-Type","application/json"); self.end_headers(); self.wfile.write(body)
def start(port=8766):
    s = HTTPServer(("127.0.0.1", port), H); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
