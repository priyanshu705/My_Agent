"""Run My_Agent and put it online through a free Cloudflare quick tunnel.

    python online.py              start, print the phone link, open it in the browser
    python online.py --no-browser start silently (used by autostart)

The agent itself only listens on 127.0.0.1. The tunnel is the only way in, and every request
from outside must log in with ACCESS_PIN first. Risky actions still ask haan/na.
"""

import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

PORT = int(os.getenv("PORT", "8000"))
UI_URL = os.getenv("UI_URL", "https://my-agent-ui-three.vercel.app").rstrip("/")
DATA = ROOT / "data"
TUNNEL_FILE = DATA / "tunnel_url.txt"
LINK_FILE = DATA / "phone_link.txt"
CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
NO_BROWSER = "--no-browser" in sys.argv


def say(msg: str) -> None:
    print(msg, flush=True)


def find_cloudflared() -> str:
    found = shutil.which("cloudflared")
    if found:
        return found
    base = Path(os.getenv("LOCALAPPDATA", Path.home())) / "My_Agent"
    exe = base / ("cloudflared.exe" if os.name == "nt" else "cloudflared")
    if exe.exists():
        return str(exe)
    if os.name != "nt":
        raise SystemExit("cloudflared install karo: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
    say("cloudflared pehli baar download ho raha hai (~30 MB)...")
    base.mkdir(parents=True, exist_ok=True)
    tmp = exe.with_suffix(".part")
    urllib.request.urlretrieve(CF_URL, tmp)
    tmp.replace(exe)
    return str(exe)


def wait_for_server(proc: subprocess.Popen, timeout: int = 60) -> None:
    end = time.time() + timeout
    while time.time() < end:
        if proc.poll() is not None:
            raise SystemExit("Agent start nahi hua. Pehle run.bat se check karo (.env, GEMINI_API_KEY).")
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/ping", timeout=2).read()
            return
        except Exception:
            time.sleep(0.7)
    raise SystemExit("Agent 60 second mein ready nahi hua.")


def start_tunnel(exe: str):
    """Start cloudflared and return (process, public_url)."""
    proc = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="ignore")
    end = time.time() + 60
    while time.time() < end:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            continue
        m = URL_RE.search(line)
        if m:
            # keep draining output so cloudflared never blocks on a full pipe
            import threading
            threading.Thread(target=lambda: [None for _ in proc.stdout], daemon=True).start()
            return proc, m.group(0)
    proc.terminate()
    return None, ""


def publish(url: str) -> str:
    DATA.mkdir(exist_ok=True)
    link = f"{UI_URL}/#connect={url}"
    TUNNEL_FILE.write_text(url, encoding="utf-8")
    LINK_FILE.write_text(link, encoding="utf-8")
    return link


def main() -> None:
    pin = os.getenv("ACCESS_PIN", "").strip()
    if len(pin) < 6:
        raise SystemExit(".env mein kam se kam 6 characters ka ACCESS_PIN set karo (jaise ACCESS_PIN=meraPin2026), phir dobara chalao.")
    DATA.mkdir(exist_ok=True)
    exe = find_cloudflared()
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT)])
    tunnel = None
    try:
        wait_for_server(server)
        say("Agent chal gaya. Tunnel bana raha hoon...")
        while True:
            tunnel, url = start_tunnel(exe)
            if not url:
                say("Tunnel nahi bana, 10 second baad phir try...")
                time.sleep(10)
                continue
            link = publish(url)
            say("\n" + "=" * 60)
            say("Phone ya kisi bhi browser mein ye link kholo:\n\n  " + link)
            say("\nPhir PIN daalo. (Link data\\phone_link.txt mein bhi save hai.)")
            say("Link har baar start par badalta hai. Kisi ko mat bhejna: PIN ke bina andar nahi ja sakta, par link private rakho.")
            say("=" * 60 + "\n")
            try:
                import pyperclip
                pyperclip.copy(link)
                say("(Link clipboard mein copy ho gaya.)")
            except Exception:
                pass
            if not NO_BROWSER:
                import webbrowser
                webbrowser.open(link)
            while tunnel.poll() is None and server.poll() is None:
                time.sleep(2)
            if server.poll() is not None:
                raise SystemExit("Agent band ho gaya.")
            say("Tunnel toot gaya, dobara bana raha hoon...")
            TUNNEL_FILE.unlink(missing_ok=True)
    except KeyboardInterrupt:
        pass
    finally:
        for p in (tunnel, server):
            if p and p.poll() is None:
                p.terminate()
        TUNNEL_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
