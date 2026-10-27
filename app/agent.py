"""The agent brain: Gemini + function calling, with a confirm step for risky actions."""

import os
from datetime import datetime
from pathlib import Path

from google import genai
from google.genai import types

from .google_tools import GOOGLE_NEEDS_CONFIRMATION, GOOGLE_TOOLS, is_connected, tz
from .memory_tools import MEMORY_TOOLS, get_facts
from .pc_tools import NEEDS_CONFIRMATION as PC_NEEDS_CONFIRMATION, PC_TOOLS
from .contacts_tools import CONTACT_TOOLS
from .web_tools import WEB_TOOLS
from .whatsapp_tools import WHATSAPP_NEEDS_CONFIRMATION, WHATSAPP_TOOLS

ALL_TOOLS = PC_TOOLS + WEB_TOOLS + MEMORY_TOOLS + GOOGLE_TOOLS + CONTACT_TOOLS + WHATSAPP_TOOLS
NEEDS_CONFIRMATION = PC_NEEDS_CONFIRMATION | GOOGLE_NEEDS_CONFIRMATION | WHATSAPP_NEEDS_CONFIRMATION
TOOL_MAP = {f.__name__: f for f in ALL_TOOLS}
MAX_STEPS = 8
MAX_HISTORY = 40

AGENT_NAME = os.getenv("AGENT_NAME", "Agent")
USER_NAME = os.getenv("USER_NAME", "Om")


def system_prompt() -> str:
    facts = get_facts()
    facts_txt = "\n".join(f"- {f}" for f in facts) if facts else "(abhi kuch nahi)"
    return f"""Tum {AGENT_NAME} ho, {USER_NAME} ke personal voice assistant. Tum unke Windows PC par chal rahe ho.

Bolne ka tarika:
- Hinglish mein jawab do (Hindi + English mix, Roman script), jaise dost baat karta hai.
- Jawab chhote rakho (1-3 sentences) kyunki ye bol kar sunaya jaayega. Markdown, bullets, emoji mat use karo.

Kaam karne ka tarika:
- User jo bole, tools se seedha kar do. Pehle se poochho mat jab kaam clear ho.
- Ek request mein kai steps ho sakte hain (jaise file dhundh kar kholna) - sab tools ek ke baad ek chalao.
- Agar koi tool kaam ka nahi hai, to jo jaante ho us se madad karo ya batao ki ye abhi possible nahi hai.
- Kabhi mat bolo ki kaam ho gaya jab tool ne error diya ho.
{google_rules()}
- WhatsApp: user ke apne number se whatsapp_send / whatsapp_send_file. Naam diya ho to seedha naam pass karo
  (agent saved contacts, Google Contacts aur WhatsApp chat list mein dhundh lega). Message user ki baat se
  likho, user ki tarah (first person), chhota aur natural. File bhejni ho to pehle search_files se path lo.
  "Raat 12 baje bhejna" jaisa ho to whatsapp_schedule. Kisi ka number user bataye to save_contact karo.
- Agar user koi permanent baat bataye (pasand, log, details), remember_fact se save karo.

Abhi ka time: {datetime.now(tz()):%A, %d %B %Y, %I:%M %p} ({tz()}). "Kal", "parso", "next Monday" isi se calculate karo.

{USER_NAME} ke baare mein yaad rakhi baatein:
{facts_txt}
"""


def google_rules() -> str:
    if not is_connected():
        return ("- Gmail/Calendar abhi connected nahi hain. Agar user maange to batao ki README ke Phase 2 steps se "
                "setup_google.bat chalana hai; tab tak open_website('gmail' / 'calendar') use karo.")
    return """- Gmail aur Google Calendar connected hain.
- Mail padhte waqt sirf zaroori baat chhote mein batao (kisne bheja, kya chahiye).
- Email address kabhi guess mat karo. Sirf naam pata ho to find_email_address chalao, na mile to user se poochho.
- Mail likhna ho to default gmail_create_draft. gmail_send sirf tab jab user saaf bole 'bhej do/send karo'.
  Bhejne se pehle subject aur body user ki baat se likho, professional aur chhota.
- Event badalna/cancel karna ho to pehle calendar_list_events se sahi event_id lo.
- Meeting add karte waqt agar time nahi bataya to poochho; duration nahi bataya to 60 minute maano."""


class Agent:
    def __init__(self):
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY missing. .env file mein daalo (README dekho).")
        self.client = genai.Client(api_key=key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.sessions: dict[str, dict] = {}

    # ---------- public ----------
    def chat(self, session_id: str, text: str) -> dict:
        s = self._session(session_id)
        if s.get("pending"):
            answer = yes_no(text)
            if answer is not None:
                return self.confirm(session_id, answer)
            # user moved on: cancel the waiting actions so the history stays valid
            p = s["pending"]
            for call in p["remaining"]:
                p["responses"].append(types.Part.from_function_response(
                    name=call.name, response={"result": "User ne ye action skip kar diya."}))
            s["contents"].append(types.Content(role="user", parts=p["responses"]))
            s["pending"] = None
        s["contents"].append(types.Content(role="user", parts=[types.Part.from_text(text=text)]))
        return self._loop(s)

    def confirm(self, session_id: str, approved: bool) -> dict:
        s = self._session(session_id)
        p = s.get("pending")
        if not p:
            return {"reply": "Abhi koi kaam confirm karne ke liye pending nahi hai.", "actions": []}
        call = p["remaining"].pop(0)
        if approved:
            result = self._execute(call)
            p["actions"].append({"tool": call.name, "args": dict(call.args or {}), "result": result})
        else:
            result = "User ne ye action cancel kar diya."
        p["responses"].append(types.Part.from_function_response(name=call.name, response={"result": result}))
        s["pending"] = None
        out = self._run_calls(s, p)
        return out if out else self._loop(s, p["actions"])

    def reset(self, session_id: str) -> None:
        self.sessions.pop(session_id, None)

    # ---------- internals ----------
    def _session(self, sid: str) -> dict:
        return self.sessions.setdefault(sid, {"contents": [], "pending": None})

    def _config(self):
        return types.GenerateContentConfig(
            system_instruction=system_prompt(),
            tools=ALL_TOOLS,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=0.6,
        )

    def _execute(self, call) -> str:
        fn = TOOL_MAP.get(call.name)
        if not fn:
            return f"Unknown tool {call.name}"
        try:
            return str(fn(**dict(call.args or {})))
        except (Exception, SystemExit) as e:  # report errors back to the model instead of crashing
            return f"Error: {e}"

    def _run_calls(self, s: dict, p: dict):
        """Run queued function calls. Returns a confirm-request dict if one needs approval, else None."""
        while p["remaining"]:
            call = p["remaining"][0]
            if call.name in NEEDS_CONFIRMATION:
                s["pending"] = p
                args = dict(call.args or {})
                return {
                    "reply": f"Confirm karo: {describe(call.name, args)}. Haan ya na?",
                    "confirm": {"tool": call.name, "args": args},
                    "actions": p["actions"],
                }
            p["remaining"].pop(0)
            result = self._execute(call)
            p["actions"].append({"tool": call.name, "args": dict(call.args or {}), "result": result})
            p["responses"].append(types.Part.from_function_response(name=call.name, response={"result": result}))
        s["contents"].append(types.Content(role="user", parts=p["responses"]))
        return None

    def _loop(self, s: dict, actions=None) -> dict:
        actions = actions if actions is not None else []
        for _ in range(MAX_STEPS):
            try:
                resp = self.client.models.generate_content(model=self.model, contents=s["contents"], config=self._config())
            except Exception as e:
                return {"reply": f"AI se connect nahi ho paaya: {e}", "actions": actions, "error": True}
            cand = resp.candidates[0] if resp.candidates else None
            if not cand or not cand.content:
                return {"reply": "Maaf karna, jawab nahi bana. Phir se bolo?", "actions": actions}
            s["contents"].append(cand.content)
            calls = resp.function_calls or []
            if not calls:
                self._trim(s)
                return {"reply": (resp.text or "Ho gaya.").strip(), "actions": actions}
            p = {"remaining": list(calls), "responses": [], "actions": actions}
            out = self._run_calls(s, p)
            if out:
                return out
        return {"reply": "Bahut steps ho gaye, yahin rok raha hoon.", "actions": actions}

    def _trim(self, s: dict) -> None:
        c = s["contents"]
        if len(c) > MAX_HISTORY:
            # cut at a plain user text turn so function call/response pairs stay intact
            for i in range(len(c) - MAX_HISTORY, len(c)):
                if c[i].role == "user" and c[i].parts and c[i].parts[0].text:
                    s["contents"] = c[i:]
                    return


YES = {"haan", "han", "ha", "haa", "yes", "yeah", "yep", "ok", "okay", "theek hai", "thik hai", "kar do", "karo", "sure", "confirm", "हाँ", "हां", "हा", "ठीक है", "कर दो"}
NO = {"na", "nahi", "nahin", "no", "nope", "cancel", "mat karo", "rehne do", "ruko", "stop", "नहीं", "ना", "मत करो", "रहने दो"}


def yes_no(text: str):
    t = text.lower().strip().strip(".!?। ")
    if t in YES or any(t.startswith(y + " ") for y in YES):
        return True
    if t in NO or any(t.startswith(n + " ") for n in NO):
        return False
    return None


def describe(name: str, args: dict) -> str:
    return {
        "close_app": f"{args.get('app_name')} band karna hai",
        "lock_screen": "screen lock karni hai",
        "type_text": f"ye type karna hai: \"{str(args.get('text', ''))[:80]}\"",
        "press_keys": f"{args.get('keys')} dabana hai",
        "gmail_send": f"{args.get('to')} ko mail bhejna hai, subject \"{args.get('subject')}\"",
        "calendar_update_event": "calendar event badalna hai" + (f" to {args.get('new_start')}" if args.get("new_start") else ""),
        "calendar_delete_event": "calendar event cancel karna hai",
        "whatsapp_send": f"{args.get('to')} ko WhatsApp: \"{str(args.get('message', ''))[:120]}\"",
        "whatsapp_send_file": f"{args.get('to')} ko WhatsApp par file {Path(str(args.get('file_path', ''))).name} bhejni hai",
        "whatsapp_schedule": f"{args.get('at_time')} par {args.get('to')} ko WhatsApp: \"{str(args.get('message', ''))[:100]}\"",
    }.get(name, f"{name} chalana hai")
