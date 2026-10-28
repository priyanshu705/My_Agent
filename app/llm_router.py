"""Use the free multi-provider LLM router (freellmapi on Render) as the agent's brain, with Gemini as the safety net.

The agent speaks Gemini's format (google-genai types). This module converts to and from the OpenAI-compatible format the router
understands, so one provider running out of free quota no longer stops the agent.

Env (in .env):  LLM_ROUTER_URL=https://<your-router>.onrender.com/v1   LLM_ROUTER_KEY=freellmapi-...
Optional:       LLM_ROUTER_MODEL=auto   LLM_ROUTER_TIMEOUT=40
"""

import inspect
import json
import os
import re
import time
from types import SimpleNamespace

import httpx
from google.genai import types

_down = {"until": 0.0}
_PY2JSON = {str: "string", int: "integer", float: "number", bool: "boolean"}


def configured() -> bool:
    return bool(os.getenv("LLM_ROUTER_URL", "").strip() and os.getenv("LLM_ROUTER_KEY", "").strip())


# ---------- tools -> OpenAI function schemas ----------
def _doc_parts(fn) -> tuple[str, dict]:
    doc = inspect.getdoc(fn) or ""
    head, _, rest = doc.partition("Args:")
    params = {}
    for m in re.finditer(r"^\s*(\w+)\s*(?:\([^)]*\))?:\s*(.+)$", rest, re.M):
        params[m.group(1)] = m.group(2).strip()
    return " ".join(head.split())[:600], params


def tool_schema(fn) -> dict:
    desc, pdocs = _doc_parts(fn)
    props, required = {}, []
    for name, p in inspect.signature(fn).parameters.items():
        ann = p.annotation
        if isinstance(ann, str):
            ann = {"str": str, "int": int, "float": float, "bool": bool}.get(ann.split("|")[0].strip(), str)
        base = ann if ann in _PY2JSON else str
        props[name] = {"type": _PY2JSON[base], "description": pdocs.get(name, name)}
        if p.default is inspect.Parameter.empty:
            required.append(name)
    return {"type": "function", "function": {"name": fn.__name__, "description": desc or fn.__name__,
                                             "parameters": {"type": "object", "properties": props, "required": required}}}


# ---------- genai contents -> OpenAI messages ----------
def to_messages(contents, system: str) -> list[dict]:
    msgs = [{"role": "system", "content": system}]
    pending: list[str] = []
    n = 0
    for c in contents:
        parts = c.parts or []
        if c.role == "model":
            text = "".join(p.text for p in parts if getattr(p, "text", None))
            calls = []
            for p in parts:
                fc = getattr(p, "function_call", None)
                if fc:
                    n += 1
                    cid = fc.id or f"call_{n}"
                    pending.append(cid)
                    calls.append({"id": cid, "type": "function",
                                  "function": {"name": fc.name, "arguments": json.dumps(dict(fc.args or {}), default=str)}})
            m = {"role": "assistant", "content": text or None}
            if calls:
                m["tool_calls"] = calls
            msgs.append(m)
        else:
            for p in parts:
                fr = getattr(p, "function_response", None)
                if fr:
                    cid = fr.id if fr.id in pending else (pending[0] if pending else f"call_{n}")
                    if cid in pending:
                        pending.remove(cid)
                    res = fr.response or {}
                    msgs.append({"role": "tool", "tool_call_id": cid, "content": str(res.get("result", res))[:6000]})
            text = "".join(p.text for p in parts if getattr(p, "text", None))
            if text:
                msgs.append({"role": "user", "content": text})
    return msgs


# ---------- OpenAI response -> object shaped like genai's response ----------
def from_response(d: dict):
    msg = ((d.get("choices") or [{}])[0].get("message")) or {}
    parts, fcalls = [], []
    if msg.get("content"):
        parts.append(types.Part.from_text(text=msg["content"]))
    for tc in msg.get("tool_calls") or []:
        f = tc.get("function") or {}
        try:
            args = json.loads(f.get("arguments") or "{}")
        except ValueError:
            args = {}
        fc = types.FunctionCall(name=f.get("name", ""), args=args if isinstance(args, dict) else {}, id=tc.get("id"))
        fcalls.append(fc)
        parts.append(types.Part(function_call=fc))
    if not parts:
        return None
    content = types.Content(role="model", parts=parts)
    text = "".join(p.text for p in parts if getattr(p, "text", None))
    return SimpleNamespace(candidates=[SimpleNamespace(content=content)], function_calls=fcalls, text=text, via=d.get("model", "router"))


def generate(contents, system: str, tools: list, timeout: float | None = None):
    """Return a genai-like response from the router, or None if the router is off, cooling down, or failed (caller falls back)."""
    if not configured() or time.time() < _down["until"]:
        return None
    url = os.getenv("LLM_ROUTER_URL").strip().rstrip("/") + "/chat/completions"
    body = {"model": os.getenv("LLM_ROUTER_MODEL", "auto"), "messages": to_messages(contents, system),
            "tools": [tool_schema(f) for f in tools], "temperature": 0.4}
    try:
        r = httpx.post(url, headers={"Authorization": "Bearer " + os.getenv("LLM_ROUTER_KEY").strip()}, json=body,
                       timeout=timeout or float(os.getenv("LLM_ROUTER_TIMEOUT", "40")))
    except httpx.HTTPError:
        _down["until"] = time.time() + 60  # unreachable: skip it for a minute instead of waiting on every message
        return None
    if r.status_code != 200:
        if r.status_code in (401, 403, 404):
            _down["until"] = time.time() + 300
        return None
    try:
        return from_response(r.json())
    except Exception:
        return None
