import os, sys, json
os.environ.update(BROWSER_AGENT="1", BROWSER_CDP_PORT="9333", WEB_HEADLESS="1", BROWSER_AGENT_DOMAINS="127.0.0.1",
    LLM_ROUTER_URL="http://127.0.0.1:8766/v1", LLM_ROUTER_KEY="k", BROWSER_AGENT_MAX_STEPS="9", BROWSER_AGENT_TIMEOUT="150")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent)); sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import fakeshop, mockllm
fakeshop.start(); mockllm.start()
from app import browser_tools as bt, browser_agent as ba
orig_blocked = bt._blocked_url
bt._blocked_url = lambda url: None if "127.0.0.1" in url else orig_blocked(url)
shop = "http://127.0.0.1:8765/"
f = mockllm.find
ok = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, extra); ok.append(bool(cond))
    if not cond: print("   ^^^ FAILED")
def run(script, task="t", model=None):
    mockllm.STATE.update(script=script, i=0)
    if model: os.environ["BROWSER_USE_MODEL"] = model
    else: os.environ.pop("BROWSER_USE_MODEL", None)
    return ba.browser_task(task)
nav = lambda u: {"navigate": {"url": u}}
done = {"done": {"text": "finished", "success": True}}

# A: normal shopping steps work, final click is blocked and nothing is ordered
fakeshop.HITS.update(order=0, pay=0, cart=0)
out = run([nav(shop),
    lambda u: {"input": {"index": f(u, "placeholder=search"), "text": "rice"}},
    lambda u: {"click": {"index": f(u, "id=s")}},
    nav(shop + "results?q=rice"),
    lambda u: {"click": {"index": f(u, "add to cart")}},
    nav(shop + "checkout"),
    lambda u: {"click": {"index": f(u, "place order")}},
    done])
check("A normal steps reached cart", fakeshop.HITS["cart"] == 1, f"cart hits={fakeshop.HITS['cart']}")
check("A Place order blocked, no order sent", fakeshop.HITS["order"] == 0)
check("A tool reports it stopped at protected step", "Stopped at a protected step" in out, out[:160])
check("A tells nothing was ordered", "Nothing was ordered" in out)

# B: password / card fields are never typed into
out = run([nav(shop + "checkout"),
    lambda u: {"input": {"index": f(u, "type=password"), "text": "hunter2"}}, done])
check("B password typing blocked", "Stopped at a protected step" in out and "password" in out.lower() or "typing" in out, out[:200])

out = run([nav(shop + "checkout"),
    lambda u: {"input": {"index": f(u, "cardnumber"), "text": "4111111111111111"}}, done])
check("B2 card number typing blocked", "Stopped at a protected step" in out, out[:200])

# C: Pay now blocked
fakeshop.HITS.update(order=0, pay=0)
out = run([nav(shop + "checkout"), lambda u: {"click": {"index": f(u, "pay now")}}, done])
check("C Pay now blocked", fakeshop.HITS["pay"] == 0 and "Stopped at a protected step" in out, out[:160])

# D: not-allowed website and internal address
out = run([nav("http://evil.example.com/login"), done])
check("D evil site blocked", "Stopped at a protected step" in out and "allowed" in out, out[:200])
out = run([nav("http://169.254.169.254/latest/meta-data"), done])
check("D2 metadata address blocked", "Stopped at a protected step" in out, out[:200])

# E: guard survives models for which browser-use re-registers click (coordinate clicking)
fakeshop.HITS.update(order=0, pay=0)
out = run([nav(shop + "checkout"), lambda u: {"click": {"index": f(u, "place order")}}, done], model="gemini-3-pro-test")
check("E guard survives coordinate-clicking models", fakeshop.HITS["order"] == 0 and "Stopped at a protected step" in out, out[:160])

# F: removed actions are really gone
from browser_use import Tools
t = ba.build_tools({})
names = set(t.registry.registry.actions)
check("F evaluate/upload/file actions removed", not ({"evaluate", "upload_file", "read_file", "write_file", "replace_file"} & names), str(sorted(names)))

# G: Enter key on a checkout URL is blocked
fakeshop.HITS.update(order=0)
out = run([nav(shop + "checkout"), {"send_keys": {"keys": "Enter"}}, done])
check("G Enter on checkout page blocked", "Stopped at a protected step" in out, out[:160])

# H: allowed task finishes normally and returns its answer
out = run([nav(shop), {"done": {"text": "Cheapest is Basmati Rice 5kg at Rs 499", "success": True}}])
check("H normal result returned", "Rs 499" in out and "Stopped" not in out, out[:160])

# pure checks
check("P Apply now blocked", ba.check_click("Apply now") is not None)
check("P Easy Apply allowed to be refused? (Easy Apply opens form)", ba.check_click("Easy Apply") is None)
check("P Add to cart allowed", ba.check_click("Add to cart") is None)
check("P Continue on payment url blocked", ba.check_click("Continue", "https://x.com/payment/step2") is not None)
check("P Continue on product page allowed", ba.check_click("Continue shopping", "https://www.amazon.in/s?k=rice") is None)
check("P amazon.in allowed", ba.check_url("https://www.amazon.in/dp/x") is None)
check("P evil blocked", ba.check_url("https://amazon.in.evil.com/") is not None)
check("P file:// blocked", ba.check_url("file:///etc/passwd") is not None)
print("RESULT:", "ALL PASS" if all(ok) else f"{ok.count(False)} FAILED")
