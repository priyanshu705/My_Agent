"""PC relay: lets the cloud assistant (phone / anywhere) drive THIS computer.

The PC only makes OUTBOUND HTTPS calls to your cloud app (no open ports, no tunnel):
  1. logs in with CLOUD_PIN, 2. long-polls /api/pc/poll for jobs, 3. runs them with the local Agent
  (Chrome automation, files, apps), 4. posts progress + the result back.
Orders, payments and form submissions still stop for your confirmation on the phone.

Env (.env): CLOUD_URL=https://your-app.vercel.app   CLOUD_PIN=<same as ACCESS_PIN>
Run:  python -m app.relay      (or run_agent.bat)
"""
import os
import sys
import time
import threading
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CLOUD_URL = os.getenv("CLOUD_URL", "").rstrip("/")
CLOUD_PIN = os.getenv("CLOUD_PIN", "")


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


class Relay:
    def __init__(self, base: str, pin: str, agent, stop: threading.Event | None = None):
        if not base.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise SystemExit("CLOUD_URL must be an https:// address (or localhost for tests).")
        self.base, self.pin, self.agent = base, pin, agent
        self.token = ""
        self.http = httpx.Client(timeout=httpx.Timeout(40.0, connect=15.0))
        self.stop = stop or threading.Event()
        self.sid = ""
        self._hook()

    # ---- auth / http
    def login(self) -> None:
        r = self.http.post(self.base + "/api/login", json={"pin": self.pin})
        if r.status_code == 429:
            raise RuntimeError("Cloud login is locked for a while after failed attempts. Check CLOUD_PIN.")
        if r.status_code != 200:
            raise RuntimeError(f"Cloud login failed ({r.status_code}). CLOUD_PIN must equal the cloud ACCESS_PIN.")
        self.token = r.json()["token"]

    def call(self, method: str, path: str, **kw) -> httpx.Response:
        for attempt in range(2):
            r = self.http.request(method, self.base + path, headers={"Authorization": "Bearer " + self.token}, **kw)
            if r.status_code == 401 and attempt == 0:
                self.login()
                continue
            return r
        return r

    # ---- progress: report each tool the local agent runs
    def _hook(self) -> None:
        original = getattr(self.agent, "_execute", None)
        if not original or getattr(self.agent, "_relay_hooked", False):
            return

        def wrapped(call):
            name = getattr(call, "name", "")
            if self.sid:
                try:
                    self.call("POST", "/api/pc/progress", json={"session_id": self.sid, "tool": name, "label": "PC: " + name.replace("_", " ")}, timeout=8)
                except Exception:
                    pass
            return original(call)

        self.agent._execute = wrapped
        self.agent._relay_hooked = True

    # ---- job handling
    def run_job(self, job: dict) -> dict:
        self.sid = job["session_id"]
        p = job.get("payload") or {}
        # The cloud session id is namespaced so PC history never collides with the local UI.
        local_sid = "cloud:" + self.sid
        try:
            if job["kind"] == "chat":
                out = self.agent.chat(local_sid, str(p.get("text", ""))[:3000])
            elif job["kind"] == "confirm":
                out = self.agent.confirm(local_sid, bool(p.get("approved")))
            else:
                return {"job_id": job["id"], "error": f"Unknown job type {job['kind']}"}
        except (Exception, SystemExit) as e:
            return {"job_id": job["id"], "error": str(e)[:300]}
        finally:
            self.sid = ""
        acts = [{"tool": a.get("tool"), "result": str(a.get("result", ""))[:300]} for a in (out.get("actions") or [])][:12]
        return {"job_id": job["id"], "reply": out.get("reply", ""), "actions": acts, "confirm": out.get("confirm")}

    def loop(self) -> None:
        log(f"Connecting to {self.base} …")
        self.login()
        log("Connected. Waiting for commands from your phone. (Ctrl+C to stop)")
        backoff = 1
        while not self.stop.is_set():
            try:
                r = self.call("GET", "/api/pc/poll", timeout=35)
                if r.status_code != 200:
                    raise RuntimeError(f"poll {r.status_code}")
                backoff = 1
                job = r.json().get("job")
                if not job:
                    continue
                log(f"Job #{job['id']}: {job['kind']}")
                res = self.run_job(job)
                self.call("POST", "/api/pc/result", json=res, timeout=30)
                log(f"Job #{job['id']} done" + (" (waiting for your confirmation)" if res.get("confirm") else ""))
            except (httpx.HTTPError, RuntimeError) as e:
                log(f"Connection problem: {e}. Retrying in {backoff}s")
                self.stop.wait(backoff)
                backoff = min(30, backoff * 2)


def main() -> None:
    if not CLOUD_URL or not CLOUD_PIN:
        sys.exit("Set CLOUD_URL and CLOUD_PIN in your .env file first (see REAL_SETUP.md).")
    from .main import agent as get_agent
    try:
        Relay(CLOUD_URL, CLOUD_PIN, get_agent()).loop()
    except KeyboardInterrupt:
        log("Stopped.")


if __name__ == "__main__":
    main()
