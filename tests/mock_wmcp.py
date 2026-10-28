try:
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:
    from mcp.server.fastmcp import FastMCP
m = FastMCP("mock-windows-mcp")
import os, tempfile
LOG = os.path.join(tempfile.gettempdir(), "wmcp_calls.log")
def log(s): open(LOG, "a").write(s + "\n")
SNAP = '''Focused Window: Notepad
window "Checkout - Shop"
├── (100,200) button "Place your order"  [action: click]
├── (120,260) edit "Search box"  [action: type]
├── (140,300) edit "Password"  [action: type]  [password]
└── (160,340) button "Save"  [action: click]
'''
@m.tool(name="Snapshot")
def snapshot(use_vision: bool = False, use_dom: bool = False) -> str: return SNAP
@m.tool(name="Click")
def click(loc: list[int] | None = None) -> str: log(f"Click {loc}"); return f"Clicked at {loc}"
@m.tool(name="Type")
def typ(text: str, loc: list[int] | None = None, clear: bool = False, press_enter: bool = False) -> str: log(f"Type {loc} {text!r} enter={press_enter}"); return "typed"
@m.tool(name="Shortcut")
def sc(shortcut: str) -> str: log(f"Shortcut {shortcut}"); return "ok"
@m.tool(name="Scroll")
def scroll(type: str = "vertical", direction: str = "down", wheel_times: int = 1) -> str: log(f"Scroll {direction} {wheel_times}"); return "scrolled"
@m.tool(name="App")
def app(mode: str = "launch", name: str | None = None) -> str: log(f"App {mode} {name}"); return f"launched {name}"
m.run()
