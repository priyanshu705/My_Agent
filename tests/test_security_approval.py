"""A pending risky action runs only on an explicit "confirm". No real apps or services are touched."""

import pytest

from app import demo_agent
from app.agent import Agent
from app.approval import yes_no

CALL = ("close_app", {"app_name": "chrome"})


@pytest.mark.parametrize("phrase", [
    "ok wait", "ok ruko mat bhejo", "theek hai ruko", "sure not", "karo mat", "yes no cancel it", "ok, cancel it",
    "don't confirm", "confirm mat karo", "no, confirm", "wait", "nahi", "Cancel.", "रुको", "मत भेजो",
])
def test_negation_or_wait_cancels(phrase):
    assert yes_no(phrase) is False


@pytest.mark.parametrize("phrase", ["confirm", "Confirm.", "yes, confirm", "haan confirm karo", "confirm send", "कन्फर्म कर दो"])
def test_explicit_confirm_approves(phrase):
    assert yes_no(phrase) is True


@pytest.mark.parametrize("phrase", [
    "haan", "yes", "ok", "okay", "haan lekin subject badlo", "ha ha very funny", "karo", "confirm the subject first",
    "is this confirmed", "open chrome", "",
])
def test_anything_else_is_not_an_answer(phrase):
    assert yes_no(phrase) is None


@pytest.fixture()
def ran(monkeypatch):
    calls = []
    monkeypatch.setitem(demo_agent.TOOL_MAP, "close_app", lambda app_name: calls.append(app_name) or "Closed.")
    return calls


def _gemini_agent_with_pending():
    """An Agent with one action waiting, built without any AI client or network."""
    import threading

    from google.genai import types

    ag = Agent.__new__(Agent)
    ag.sessions, ag._locks, ag._guard = {}, {}, threading.Lock()
    ag._loop = lambda s, actions=None: {"reply": "finished", "actions": actions or []}
    call = types.FunctionCall(name=CALL[0], args=CALL[1])
    first = ag._run_calls(ag._session("s"), {"remaining": [call], "responses": [], "actions": []})
    return ag, first


@pytest.mark.parametrize("phrase", ["haan", "ok", "open notepad"])
def test_agent_keeps_the_action_pending(ran, phrase):
    ag, first = _gemini_agent_with_pending()
    again = ag.chat("s", phrase)
    assert ran == []
    assert again["confirm"] == first["confirm"] and again["reply"] == first["reply"]
    assert ag.chat("s", "confirm")["reply"] == "finished" and ran == ["chrome"]


def test_agent_cancels_on_negation(ran):
    ag, _ = _gemini_agent_with_pending()
    ag.chat("s", "ok ruko mat karo")
    assert ran == [] and ag.sessions["s"]["pending"] is None


def test_pending_question_can_be_shown_again(ran):
    ag, first = _gemini_agent_with_pending()
    assert ag.pending_ask("s") == {"reply": first["reply"], "confirm": first["confirm"]}
    ag.chat("s", "cancel")
    assert ag.pending_ask("s") is None and ag.pending_ask("nobody") is None


def test_stop_runs_none_of_the_remaining_steps(ran):
    from google.genai import types

    ag, _ = _gemini_agent_with_pending()
    s = ag._session("t")
    assert ag.cancel("t") and not ag.cancel("nobody")
    call = types.FunctionCall(name=CALL[0], args=CALL[1])
    out = ag._run_calls(s, {"remaining": [call, call], "responses": [], "actions": []})
    assert out is None and ran == [] and s["pending"] is None
    assert len(s["contents"][-1].parts) == 2  # every call still got an answer


def test_demo_agent_follows_the_same_rules(ran):
    ag = demo_agent.DemoAgent()
    first = ag.chat("d", "chrome band karo")
    assert ag.chat("d", "haan")["confirm"] == first["confirm"] and ran == []
    ag.chat("d", "confirm")
    assert ran == ["chrome"]
    ag.chat("d", "chrome band karo")
    ag.chat("d", "ok wait")
    assert ran == ["chrome"] and "d" not in ag.pending
