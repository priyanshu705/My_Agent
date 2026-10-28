import os, sys, pathlib, tempfile
HERE = pathlib.Path(__file__).resolve().parent
LOGF = pathlib.Path(tempfile.gettempdir()) / "wmcp_calls.log"
os.environ["WINDOWS_MCP"]="1"
os.environ["WINDOWS_MCP_CMD"]=f"{sys.executable} {HERE / 'mock_wmcp.py'}"
sys.path.insert(0, str(HERE.parent))
LOGF.write_text("")
from app import windows_mcp as w
ok=0; bad=0
def check(n,c):
    global ok,bad
    if c: ok+=1; print("PASS",n)
    else: bad+=1; print("FAIL",n)
check("no click before snapshot", w.windows_click(100,200).startswith("Error"))
t=w.windows_snapshot(); check("snapshot text", "Place your order" in t)
check("parsed 4 elements", len(w._last["elements"])==4)
check("password flagged", w._last["elements"][(140,300)]["password"])
check("final button refused", w.windows_click(100,200).startswith("Refused"))
check("unknown coords refused", w.windows_click(1,1).startswith("Error"))
check("password type refused", w.windows_type(140,300,"x").startswith("Refused"))
check("type ok no enter", w.windows_type(120,260,"hello")=="typed")
check("confirm ctx", "Search" in w.confirm_context({"x":120,"y":260}).get("_label",""))
check("click save ok", "Clicked" in w.windows_click(160,340))
check("snapshot reset after click", w._last["elements"]=={})
check("bad shortcut refused", w.windows_shortcut("alt+f4").startswith("Refused") and w.windows_shortcut("win+r").startswith("Refused"))
check("good shortcut", w.windows_shortcut("Ctrl + C")=="ok")
check("scroll", w.windows_scroll("down",50)=="scrolled")
check("open app", "launched Notepad" in w.windows_open_app("Notepad"))
log=LOGF.read_text()
check("final/password never reached server", "(100, 200)" not in log and "[100, 200]" not in log and "'x'" not in log)
check("enter never pressed", "enter=False" in log and "enter=True" not in log)
check("shortcut normalised", "Shortcut ctrl+c" in log and "alt+f4" not in log)
check("wheel capped at 10", "Scroll down 10" in log)
w._client.close()
# agent integration: confirmation required + description
from app import agent
check("tools registered", "windows_click" in agent.TOOL_MAP)
check("needs confirm", {"windows_click","windows_type","windows_shortcut"} <= agent.NEEDS_CONFIRMATION)
print(f"{ok} passed, {bad} failed"); sys.exit(1 if bad else 0)
