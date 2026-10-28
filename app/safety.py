"""Extra guards because the agent can now be reached over the internet (online mode).

The AI picks tool arguments, and a prompt-injection (e.g. text inside a web page or email)
could try to smuggle shell commands through them. These wrappers reject such arguments
before the real tool runs. Call harden() once, before the Agent is created.
"""

import functools
import re

_SHELL_CHARS = re.compile(r'[&|<>^"%`\r\n;]')
_RISKY_EXT = (".exe", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".msi", ".scr", ".lnk", ".com", ".reg", ".hta", ".jar")

# tool name -> argument names that must be free of shell metacharacters
_CHECK_ARGS = {"open_app": ("app_name",), "close_app": ("app_name",), "open_website": ("site",)}


def _wrap(fn):
    name = fn.__name__

    @functools.wraps(fn)
    def guarded(*args, **kwargs):
        values = list(args) + list(kwargs.values())
        if name in _CHECK_ARGS and any(isinstance(v, str) and _SHELL_CHARS.search(v) for v in values):
            return "Ye naam/link safe nahi laga (special characters hain), isliye roka."
        if name == "open_file" and values and isinstance(values[0], str) and values[0].lower().endswith(_RISKY_EXT):
            return "Program/script files remote se kholna blocked hai. Document ya folder bolo."
        return fn(*args, **kwargs)

    return guarded


def harden() -> None:
    """Replace risky tools inside the shared tool lists with guarded versions (idempotent)."""
    for modname, listname in (("pc_tools", "PC_TOOLS"), ("web_tools", "WEB_TOOLS")):
        try:
            mod = __import__(f"app.{modname}", fromlist=[listname])
        except Exception:
            continue
        tools = getattr(mod, listname, None)
        if not isinstance(tools, list):
            continue
        for i, fn in enumerate(tools):
            if getattr(fn, "__name__", "") in (*_CHECK_ARGS, "open_file") and not getattr(fn, "__wrapped__", None):
                tools[i] = _wrap(fn)
