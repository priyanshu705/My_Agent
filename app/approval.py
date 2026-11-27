"""Reading a typed or spoken answer to a pending risky action.

Deliberately strict, because a wrong "yes" sends a mail or controls the PC:
- any negation or "wait" word anywhere cancels,
- only a whole phrase that contains "confirm" approves ("haan" or "ok" alone do not),
- everything else is not an answer, so the action stays pending and nothing runs.

web/lib/approval.ts mirrors these lists. Change both together.
"""

import re

CONFIRM_PHRASES = frozenset({
    "confirm", "confirm it", "confirm send", "yes confirm", "ok confirm", "okay confirm",
    "haan confirm", "han confirm", "confirm karo", "confirm kar do", "haan confirm karo", "haan confirm kar do",
    "कन्फर्म", "कंफर्म", "हाँ कन्फर्म", "हां कन्फर्म", "कन्फर्म करो", "कन्फर्म कर दो",
})
CANCEL_WORDS = frozenset({
    "no", "nope", "not", "dont", "never", "cancel", "stop", "wait", "hold",
    "na", "nahi", "nahin", "mat", "ruko", "ruk", "rukiye", "rehne",
    "नहीं", "नही", "ना", "मत", "रुको", "रुक", "रुकिए", "रहने", "कैंसल", "कैंसिल",
})
_PUNCTUATION = re.compile(r"[.,!?;:।\"“”()\-…]+")


def yes_no(text: str):
    """True = approve, False = cancel, None = not an answer."""
    words = _PUNCTUATION.sub(" ", text.lower().replace("'", "").replace("’", "")).split()
    if any(w in CANCEL_WORDS for w in words):
        return False
    if " ".join(words) in CONFIRM_PHRASES:
        return True
    return None


def ask_text(description: str) -> str:
    """The question shown and spoken for a pending action. web/components/Confirm.tsx strips the first and last parts."""
    return f"Please confirm: {description}. Say confirm or cancel."
