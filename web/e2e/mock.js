// Mock backend for UI tests. Installs page.route handlers that behave like the real My_Agent API
// (local PC mode or cloud mode). Nothing real is ever touched: no mail, WhatsApp, calendar, mic or PC control.
const now = () => new Date();
const iso = (d) => d.toISOString().slice(0, 19);
const mins = (n) => iso(new Date(Date.now() + n * 60000));
const ago = (n) => iso(new Date(Date.now() - n * 60000));

function makeState(opts = {}) {
  return {
    mode: opts.mode || "local",
    config: {
      agent_name: "Agent", wake_word: "hey agent", user_name: "Om", recognition_lang: "en-IN", voice_lang: "en-IN",
      has_key: true, demo: false, local_tts: false, wake_engine: "browser", google_connected: true,
      model: "gemini-3.5-flash-lite",
      integrations: { gemini_key: true, llm_router: false, whatsapp_session: true, browser_agent: false, desktop_automation: false, wake_engine_enabled: false, wake_engine_running: false, wake_engine_error: "" },
      phone_url: "", tunnel_url: "", ui_url: "https://my-agent-ui-three.vercel.app",
      ...(opts.config || {}),
    },
    sessions: opts.empty ? {} : {
      s1: { title: "Plan tomorrow", updated: ago(5), messages: [
        { role: "user", text: "What's on my schedule tomorrow?", at: ago(6) },
        { role: "bot", text: "You have two meetings tomorrow: stand-up at 10:00 and a design review at 15:30.", at: ago(6), actions: [{ tool: "calendar_list_events", result: "2 events" }] },
        { role: "user", text: "Search Google for best standing desks", at: ago(5) },
        { role: "bot", text: "I opened Google with that search.", at: ago(5), actions: [{ tool: "google_search", result: "Opened https://www.google.com/search?q=best+standing+desks" }] },
        { role: "user", text: "Send the file to Rahul on WhatsApp", at: ago(4) },
        { role: "bot", text: "Could not do that.", at: ago(4), actions: [{ tool: "whatsapp_send_file", result: "Error: WhatsApp is not logged in" }] },
      ] },
      s2: { title: "Reminders for the week", updated: ago(90), messages: [{ role: "user", text: "Remind me to pay rent", at: ago(90) }, { role: "bot", text: "Done, I will remind you.", at: ago(90), actions: [{ tool: "add_reminder", result: "Reminder set" }] }] },
    },
    todos: opts.empty ? [] : [{ i: 0, task: "Review pull request", done: false, at: ago(300) }, { i: 1, task: "Book train tickets", done: false, at: ago(200) }, { i: 2, task: "Send invoice", done: true, at: ago(900) }],
    notes: opts.empty ? [] : [{ i: 0, text: "Ideas for the weekend trip: Lonavala or Mahabaleshwar", at: ago(1200) }, { i: 1, text: "Wi-Fi password for the office is on the fridge", at: ago(3000) }],
    reminders: opts.empty ? [] : [{ text: "Pay rent", due: mins(45) }, { text: "Call the bank", due: ago(3) }, { text: "Stand-up", due: mins(600) }],
    facts: opts.empty ? [] : ["Om prefers meetings after 11 AM", "Mom's birthday is on 14 March", "Likes basmati rice", "Works in Gurgaon"],
    pending: null, calls: [], fail: opts.fail || null, delayChat: opts.delayChat || 0, tts: opts.tts || 503, activity: null, wakeSeq: 5,
    pcOnline: opts.pcOnline !== false, whatsapp: opts.whatsapp !== false, needLogin: !!opts.needLogin,
  };
}

async function install(page, opts = {}) {
  const st = makeState(opts); page.__mock = st;
  const log = (m, p, b) => st.calls.push({ m, p, b });
  await page.route("**/api/**", async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname; const method = req.method();
    let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch {}
    log(method, path, body);
    const J = (o, status = 200) => route.fulfill({ status, json: o });
    if (st.needLogin && path !== "/api/login" && path !== "/api/config" && path !== "/api/ping") {
      if (!(req.headers()["authorization"] || "").includes("good-token")) return J({ detail: "Login required" }, 401);
    }
    if (path === "/api/ping") return J(st.mode === "cloud" ? { ok: true, cloud: true } : { ok: true });
    if (path === "/api/login") return body && body.pin === "123456" ? J({ ok: true, token: "good-token" }) : J({ detail: "Incorrect PIN" }, 401);
    if (path === "/api/config") return J(st.config);
    if (path === "/api/wake") return J({ seq: st.wakeSeq, running: true, error: "" });
    if (path === "/api/tts") return J({ detail: "Local voice is off" }, st.tts);
    if (path === "/api/activity") return J(st.activity || (st.mode === "cloud" ? { phase: "idle", steps: [], done: true } : { tool: "", args: {}, seconds: 0 }));
    if (path === "/api/sessions" && method === "GET") return J({ sessions: Object.entries(st.sessions).map(([id, s]) => ({ id, title: s.title, updated: s.updated, count: s.messages.length })) });
    const m = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (m && method === "GET") {
      const w = st.pending && st.pending.sid === m[1] ? st.pending : null;
      return J({ id: m[1], messages: (st.sessions[m[1]] || { messages: [] }).messages, pending: w ? { reply: w.reply, confirm: { id: w.id, tool: w.tool, args: w.args } } : null });
    }
    if (st.fail && st.fail.some((f) => path.startsWith(f)) && method !== "GET") return J({ detail: "Mock failure" }, 500);
    if (path === "/api/cancel") return J({ ok: true, stopping: true });
    if (m && method === "DELETE") { delete st.sessions[m[1]]; return J({ ok: true }); }
    if (path === "/api/reset") { if (st.sessions[body.session_id]) st.sessions[body.session_id].messages = []; return J({ ok: true }); }
    if (path === "/api/dashboard/local") return J({ todos: st.todos, notes: st.notes, reminders: st.reminders, now: iso(now()), status: { google: !!st.config.google_connected, whatsapp: st.mode === "cloud" ? false : st.whatsapp, battery: { percent: 82, plugged: true }, ...(st.mode === "cloud" ? { pc: st.pcOnline } : {}) } });
    if (path === "/api/dashboard/calendar") return J({ connected: !!st.config.google_connected, events: st.config.google_connected ? [{ title: "Stand-up", day: "Today", time: "10:00 AM - 10:15 AM" }, { title: "Design review", day: "Today", time: "03:30 PM - 04:30 PM" }] : [] });
    if (path === "/api/dashboard/mail") return J({ connected: !!st.config.google_connected, mails: st.config.google_connected ? [{ from: "HR Team", subject: "Policy update", snippet: "Please read the new leave policy" }] : [] });
    if (path === "/api/memory") return st.mode === "cloud" ? J({ detail: "Not Found" }, 404) : J({ facts: st.facts, counts: { notes: st.notes.length, todos_open: st.todos.filter((t) => !t.done).length, facts: st.facts.length } });
    if (path === "/api/todos") { st.todos.push({ i: st.todos.length, task: body.text, done: false, at: iso(now()) }); return J({ ok: true }); }
    const t = path.match(/^\/api\/todos\/(\d+)\/toggle$/); if (t) { const x = st.todos[+t[1]]; if (x) x.done = !x.done; return J({ ok: true }); }
    if (path === "/api/notes") { st.notes.unshift({ i: st.notes.length, text: body.text, at: iso(now()) }); return J({ ok: true }); }
    if (path === "/api/reminders" && method === "POST") { st.reminders.push({ text: body.text, due: mins(body.minutes) }); return J({ message: `Reminder set for ${body.minutes} minutes from now.` }); }
    if (path === "/api/reminders/due") return J({ due: [], notices: [] });
    if (path === "/api/google/start") return J({ url: "https://accounts.example.test/auth" });
    if (path === "/api/chat") {
      const text = String(body.text || ""); const sid = body.session_id; const low = text.toLowerCase();
      st.sessions[sid] = st.sessions[sid] || { title: text.slice(0, 48), updated: iso(now()), messages: [] };
      st.sessions[sid].messages.push({ role: "user", text, at: iso(now()) });
      if (st.delayChat) {
        st.activity = st.mode === "cloud"
          ? { phase: "tool", tool: "google_search", label: "Searching the web", steps: [{ phase: "understand", label: "Understanding your request", ms: 0 }, { phase: "think", label: "Thinking", ms: 600 }, { phase: "tool", tool: "google_search", label: "Searching the web", ms: 1200 }], done: false }
          : { tool: "google_search", args: { query: "x" }, seconds: 1.2 };
        await new Promise((r) => setTimeout(r, st.delayChat)); st.activity = null;
      }
      let res;
      if (/close|band/.test(low)) { st.pending = { id: "cid-" + Date.now(), tool: "close_app", args: { app_name: "chrome" }, sid }; res = { reply: "Please confirm: close chrome. Say confirm or cancel.", actions: [], confirm: { id: st.pending.id, tool: "close_app", args: { app_name: "chrome" } } }; }
      else if (/mail|email/.test(low)) { st.pending = { id: "cid-" + Date.now(), tool: "gmail_send", args: { to: "rahul@example.com", subject: "Report", body: "Hi Rahul, report attached." }, sid }; res = { reply: "Please confirm: send an email to rahul@example.com with subject \"Report\". Say confirm or cancel.", actions: [], confirm: { id: st.pending.id, tool: "gmail_send", args: st.pending.args } }; }
      else if (/whatsapp/.test(low)) { st.pending = { id: "cid-" + Date.now(), tool: "whatsapp_send", args: { to: "Rahul", message: "Running 10 minutes late" }, sid }; res = { reply: "Please confirm: send a WhatsApp message to Rahul. Say confirm or cancel.", actions: [], confirm: { id: st.pending.id, tool: "whatsapp_send", args: st.pending.args } }; }
      else if (/error|fail/.test(low)) res = { reply: "The AI service is busy right now. Please try again in a minute.", actions: [], error: true };
      else if (/search|google/.test(low)) res = { reply: "I opened Google with your search.", actions: [{ tool: "google_search", args: { query: text }, result: "Opened https://www.google.com/search?q=" + encodeURIComponent(text) }] };
      else if (/note/.test(low)) res = { reply: "Saved the note.", actions: [{ tool: "add_note", args: { text }, result: "Note saved." }] };
      else res = { reply: "Sure — here is a short answer to \"" + text + "\".", actions: [] };
      if (res.confirm) st.pending.reply = res.reply;
      st.sessions[sid].messages.push({ role: "bot", text: res.reply, at: iso(now()), actions: res.actions, confirm: res.confirm || null });
      return J(res);
    }
    if (path === "/api/confirm") {
      if (!st.pending || st.pending.sid !== body.session_id || body.confirm_id !== st.pending.id) return J({ reply: "That confirmation is no longer valid. Please ask again.", actions: [], error: true });
      const p = st.pending; st.pending = null;
      const reply = body.approved ? `Done: ${p.tool.replace("_", " ")} completed.` : "Okay, I cancelled that.";
      const actions = body.approved ? [{ tool: p.tool, args: p.args, result: "OK (mock — nothing real was executed)" }] : [];
      st.sessions[body.session_id].messages.push({ role: "bot", text: reply, at: iso(now()), actions });
      return J({ reply, actions });
    }
    return J({ detail: "not mocked: " + path }, 404);
  });
  return st;
}

module.exports = { install, makeState };
