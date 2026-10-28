// My_Agent web UI: chat sessions, voice (mic + "Hey Agent"), confirm cards, dashboard, settings.
// Voice works best in Google Chrome or Microsoft Edge (Web Speech API) on the PC.

const $ = (id) => document.getElementById(id);
const chatEl = $("chat"), input = $("text"), micBtn = $("micBtn");

// ---------- small helpers ----------
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const hhmm = (d = new Date()) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// ---------- connection (PC backend: same origin, or a tunnel URL when hosted on Vercel) ----------
let HOSTED = false, API = "", TOKEN = "", online = true;
const normUrl = (u) => { u = (u || "").trim().replace(/\/+$/, ""); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
function loadScript(src) { return new Promise((res) => { const s = document.createElement("script"); s.src = src; s.onload = s.onerror = res; document.head.appendChild(s); }); }
function setOnline(v) {
  online = v;
  const c = $("conn"); if (!c) return;
  const hide = !HOSTED || store.get("demo", false);
  c.textContent = v ? "PC online" : "PC offline";
  c.className = "badge " + (v ? "ok" : "warn") + (hide ? " hidden" : "");
}
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  let r;
  try { r = await fetch(API + path, { ...opts, headers }); }
  catch (e) { if (HOSTED) setOnline(false); throw e; }
  if (HOSTED) setOnline(true);
  if (r.status === 401) { if (HOSTED) showConnect("Login expire ho gaya, PIN phir se daalo."); else location.href = "/login"; throw new Error("Login chahiye"); }
  return r;
}
function showConnect(msg) {
  $("cErr").textContent = msg || "";
  $("cUrl").value = $("cUrl").value || API || "";
  $("connect").classList.remove("hidden");
}
async function doConnect() {
  const url = normUrl($("cUrl").value), pin = $("cPin").value;
  if (!url || !pin) return ($("cErr").textContent = "Address aur PIN dono daalo.");
  $("cErr").textContent = "Connect ho raha hai…"; $("cGo").disabled = true;
  try {
    const r = await fetch(url + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || "Login nahi hua");
    store.set("apiBase", url); store.set("token", d.token); store.set("demo", false);
    location.reload();
  } catch (e) {
    $("cErr").textContent = e instanceof TypeError ? "PC tak nahi pahunch paaya. Agent aur tunnel chal rahe hain? Address sahi hai?" : e.message;
  } finally { $("cGo").disabled = false; }
}
async function detectSameOrigin() {
  try {
    const r = await api("/api/ping", { cache: "no-store" });
    if (r.ok && (await r.json()).ok === true) return true;
  } catch (e) {}
  return false;
}
async function disconnect() {
  try { await api("/api/logout", { method: "POST" }); } catch (e) {}
  ["apiBase", "token", "demo"].forEach((k) => store.set(k, k === "demo" ? false : ""));
  location.reload();
}

// ---------- state ----------
let cfg = { agent_name: "Agent", wake_word: "hey agent", recognition_lang: "en-IN", voice_lang: "en-IN" };
const DEFAULTS = { wake: "", name: "", voice: "", rate: 1.05, speak: null, actions: true, live: false, reduce: false, accent: "cyan" };
let S = { ...DEFAULTS, ...store.get("settings", {}) };
let SESSION = store.get("sid") || uid();
store.set("sid", SESSION);

let wakeMode = false, capturing = false, speaking = false, busy = false, rec = null;
let pendingCard = null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canVoice = !!SR && window.isSecureContext;
if (S.speak === null) S.speak = canVoice; // phone over plain http: replies stay silent by default

const wakeWord = () => (S.wake || cfg.wake_word || "hey agent");
const agentName = () => (S.name || cfg.agent_name || "Agent");

// ---------- state display (orb + status) ----------
let uiState = "idle";
function setState(state, text) {
  uiState = state;
  $("orb").className = state;
  $("stateText").textContent = text || { idle: "Ready", listening: "Sun raha hoon…", thinking: "Soch raha hoon…", speaking: "Bol raha hoon…" }[state];
  $("statusDot").className = "dot " + (state === "idle" ? "" : state);
}
const setStatus = (text, state = "idle") => setState(state, text);

// ---------- chat rendering ----------
function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }
function updateCompact() { $("stage").classList.toggle("compact", chatEl.children.length > 3); }

function addMsg(role, text, opts = {}) {
  const m = el("div", "msg " + role);
  if (opts.actions && opts.actions.length) {
    const tools = el("div", "tools");
    opts.actions.forEach((a) => tools.appendChild(toolChip(a)));
    m.appendChild(tools);
  }
  m.appendChild(el("div", "bubble", text));
  if (role !== "sys") m.appendChild(el("div", "time", opts.at ? hhmm(new Date(opts.at)) : hhmm()));
  chatEl.appendChild(m);
  updateCompact(); scrollDown();
  return m;
}

const TOOL_ICON = { open_app: "🚀", close_app: "✖", search_files: "📁", open_file: "📂", set_volume: "🔊", screenshot: "📸",
  type_text: "⌨", press_keys: "⌨", lock_screen: "🔒", battery_status: "🔋", google_search: "🔎", youtube_search: "▶",
  open_website: "🌐", add_note: "📝", list_notes: "📝", add_todo: "✅", list_todos: "✅", complete_todo: "✅",
  add_reminder: "⏰", list_reminders: "⏰", remember_fact: "🧠", save_contact: "👤" };
function toolIcon(name) {
  if (TOOL_ICON[name]) return TOOL_ICON[name];
  if (name.startsWith("gmail") || name === "find_email_address") return "✉";
  if (name.startsWith("calendar")) return "📅";
  if (name.startsWith("whatsapp")) return "💬";
  return "⚙";
}
function toolChip(a) {
  const c = el("button", "tool");
  c.type = "button";
  const b = el("b", "", `${toolIcon(a.tool)} ${a.tool}`);
  const r = el("span", "res", String(a.result == null ? "" : a.result).slice(0, 400));
  c.append(b, r);
  c.addEventListener("click", () => c.classList.toggle("open"));
  return c;
}

const CONFIRM_META = {
  gmail_send: { icon: "✉", title: "Mail bhejna hai?", fields: { to: "Kisko", subject: "Subject", body: "Message" } },
  whatsapp_send: { icon: "💬", title: "WhatsApp bhejna hai?", fields: { to: "Kisko", message: "Message" } },
  whatsapp_send_file: { icon: "📎", title: "WhatsApp par file bhejni hai?", fields: { to: "Kisko", file_path: "File" } },
  whatsapp_schedule: { icon: "🕒", title: "WhatsApp schedule karna hai?", fields: { to: "Kisko", at_time: "Kab", message: "Message" } },
  calendar_update_event: { icon: "📅", title: "Event badalna hai?", fields: { new_title: "Naya title", new_start: "Naya time", new_duration_minutes: "Minutes" } },
  calendar_delete_event: { icon: "🗑", title: "Event cancel karna hai?", fields: {} },
  close_app: { icon: "✖", title: "App band karni hai?", fields: { app_name: "App" } },
  type_text: { icon: "⌨", title: "Ye type karna hai?", fields: { text: "Text" } },
  press_keys: { icon: "⌨", title: "Keys dabani hain?", fields: { keys: "Keys" } },
  lock_screen: { icon: "🔒", title: "Screen lock karni hai?", fields: {} },
};

function confirmCard(conf, reply) {
  const meta = CONFIRM_META[conf.tool] || { icon: "⚠", title: "Ye kaam karna hai?", fields: {} };
  const card = el("div", "confirm-card");
  const head = el("div", "ch");
  const t = el("div"); t.append(el("div", "", meta.title), el("div", "sub", conf.tool));
  head.append(el("span", "ci", meta.icon), t);
  const dl = el("dl");
  const args = conf.args || {};
  const keys = Object.keys(meta.fields).length ? Object.keys(meta.fields) : Object.keys(args);
  keys.forEach((k) => {
    if (args[k] === undefined || args[k] === "" || args[k] === 0) return;
    dl.append(el("dt", "", meta.fields[k] || k), el("dd", "", String(args[k])));
  });
  if (!dl.children.length && reply) { dl.append(el("dt", "", "Detail"), el("dd", "", reply)); }
  const btns = el("div", "btns");
  const yes = el("button", "yes", "Haan"), no = el("button", "no", "Na");
  yes.type = no.type = "button";
  yes.addEventListener("click", () => confirmAction(true));
  no.addEventListener("click", () => confirmAction(false));
  btns.append(yes, no);
  card.append(head, dl, btns, el("div", "hint", "Bol bhi sakte ho: “haan” ya “na”"), el("div", "result"));
  chatEl.appendChild(card);
  pendingCard = card;
  scrollDown();
  return card;
}
function resolveCard(approved, via = "") {
  if (!pendingCard) return;
  pendingCard.classList.add("done", approved === true ? "approved" : "denied");
  pendingCard.querySelector(".result").textContent = approved === true ? "✓ Haan bola" + via : approved === false ? "✗ Na bola" + via : "Jawab de diya";
  pendingCard = null;
}

function typing(on) {
  const old = $("typing"); if (old) old.remove();
  if (!on) return;
  const m = el("div", "msg bot typing"); m.id = "typing";
  const b = el("div", "bubble"); b.append(el("i"), el("i"), el("i")); m.append(b);
  chatEl.appendChild(m); scrollDown();
}

// ---------- live tool activity ----------
let actTimer = null;
function startActivity() {
  stopActivity();
  const bar = $("activity"), txt = $("activityText");
  const tick = async () => {
    try {
      const a = await api("/api/activity").then((r) => r.json());
      if (a.tool && S.actions) { bar.classList.remove("hidden"); txt.textContent = `${toolIcon(a.tool)} ${a.tool} chal raha hai…`; }
      else if (S.actions) { bar.classList.remove("hidden"); txt.textContent = "AI soch raha hai…"; }
    } catch (e) {}
  };
  tick(); actTimer = setInterval(tick, 700);
}
function stopActivity() { clearInterval(actTimer); actTimer = null; $("activity").classList.add("hidden"); }

// ---------- text to speech ----------
function voices() { return "speechSynthesis" in window ? speechSynthesis.getVoices() : []; }
function pickVoice() {
  const v = voices();
  return v.find((x) => x.name === S.voice)
    || v.find((x) => x.lang === cfg.voice_lang && /google|heera|neerja|ravi/i.test(x.name))
    || v.find((x) => x.lang === cfg.voice_lang) || v.find((x) => x.lang.startsWith("hi")) || v.find((x) => x.lang.startsWith("en"));
}
function speak(text) {
  return new Promise((resolve) => {
    if (!S.speak || !("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    stopRec();
    speaking = true; setState("speaking");
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ""));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = Number(S.rate) || 1.05;
    let done = false;
    const finish = () => { if (!done) { done = true; speaking = false; if (uiState === "speaking") setState("idle"); resolve(); } };
    u.onend = u.onerror = finish;
    setTimeout(finish, 2500 + text.length * 90); // safety net
    speechSynthesis.speak(u);
  });
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = fillVoices;

// ---------- waveform ----------
const wave = $("wave"), wctx = wave.getContext("2d");
let analyser = null, micStream = null, audioCtx = null, level = 0;
async function startLiveMic() {
  if (!S.live || analyser || !navigator.mediaDevices) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
  } catch (e) { analyser = null; }
}
function stopLiveMic() {
  try { micStream && micStream.getTracks().forEach((t) => t.stop()); audioCtx && audioCtx.close(); } catch (e) {}
  micStream = audioCtx = analyser = null;
}
function drawWave(t) {
  const W = wave.width, H = wave.height, n = 56, bw = W / n;
  wctx.clearRect(0, 0, W, H);
  let target = 0.06;
  if (uiState === "listening") {
    if (analyser) { const d = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(d); level = d.reduce((a, b) => a + b, 0) / d.length / 120; target = Math.min(1, level); }
    else target = 0.35 + 0.25 * Math.sin(t / 180);
  } else if (uiState === "speaking") target = 0.4 + 0.3 * Math.abs(Math.sin(t / 130));
  else if (uiState === "thinking") target = 0.25;
  const css = getComputedStyle(document.documentElement);
  const grad = wctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, css.getPropertyValue("--accent")); grad.addColorStop(1, css.getPropertyValue("--accent2"));
  wctx.fillStyle = grad;
  for (let i = 0; i < n; i++) {
    const env = Math.sin((i / n) * Math.PI);
    let a = target * env;
    if (uiState === "thinking") a = 0.1 + 0.25 * Math.max(0, Math.sin(t / 200 - i / 3)) * env;
    else a *= 0.55 + 0.45 * Math.abs(Math.sin(t / 160 + i * 0.7));
    const h = Math.max(2, a * H);
    wctx.fillRect(i * bw + 1, (H - h) / 2, bw - 2, h);
  }
  if (!S.reduce) requestAnimationFrame(drawWave); else setTimeout(() => requestAnimationFrame(drawWave), 400);
}

// ---------- speech recognition ----------
function stopRec() { if (rec) { rec.onend = null; try { rec.abort(); } catch (e) {} rec = null; } }
function normalize(t) { return t.toLowerCase().replace(/[.,!?।]/g, "").trim(); }
function wakeVariants() {
  const w = normalize(wakeWord()), last = w.split(" ").pop();
  return [w, w.replace("hey", "hi"), w.replace("hey", "he"), w.replace("hey", "hay"), "हे एजेंट", "हाय एजेंट", "एजेंट", last].filter(Boolean);
}

function captureCommand() {
  if (!canVoice) return toast("Is browser/connection par voice nahi chalega. PC par Chrome ya Edge use karo.");
  stopRec();
  capturing = true; micBtn.classList.add("on");
  setStatus("Sun raha hoon… bolo", "listening");
  startLiveMic();
  rec = new SR();
  rec.lang = cfg.recognition_lang; rec.interimResults = true; rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
    input.value = finalText || interim;
  };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setStatus("Mic error: " + e.error); };
  rec.onend = () => {
    capturing = false; micBtn.classList.remove("on"); rec = null; stopLiveMic();
    const t = (finalText || input.value).trim();
    if (t) send(t); else { setStatus("Kuch suna nahi"); resumeWake(); }
  };
  rec.start();
}

function startWake() {
  if (!canVoice || !wakeMode || speaking || capturing || busy) return;
  stopRec();
  setStatus(`"${wakeWord()}" bolo…`, "listening");
  rec = new SR();
  rec.lang = cfg.recognition_lang; rec.continuous = true; rec.interimResults = false;
  const variants = wakeVariants();
  rec.onresult = (e) => {
    const t = normalize(e.results[e.results.length - 1][0].transcript);
    const hit = variants.find((v) => t.includes(v));
    if (!hit) return;
    const after = t.slice(t.indexOf(hit) + hit.length).trim();
    stopRec();
    if (after.split(" ").length >= 2) send(after);
    else speak("Haan bolo?").then(captureCommand);
  };
  rec.onerror = () => {};
  rec.onend = () => { rec = null; setTimeout(startWake, 300); };
  try { rec.start(); } catch (e) {}
}
function resumeWake() { if (wakeMode) setTimeout(startWake, 400); else setStatus("Ready"); }

// ---------- backend ----------
async function post(url, body) {
  const r = await api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}

async function handle(data) {
  typing(false);
  const needConfirm = !!data.confirm;
  if (!needConfirm) resolveCard(null, "");
  if (data.actions && data.actions.length && S.actions) {
    addMsg("bot", data.reply, { actions: data.actions });
  } else addMsg("bot", data.reply);
  if (needConfirm) { resolveCard(null); confirmCard(data.confirm, data.reply); }
  loadLocal();
  await speak(data.reply);
  if (needConfirm && canVoice) captureCommand(); else resumeWake();
}

async function send(text) {
  input.value = "";
  addMsg("user", text);
  busy = true; stopRec(); setState("thinking");
  typing(true); startActivity();
  try { await handle(await post("/api/chat", { text, session_id: SESSION })); loadSessions(); }
  catch (e) { typing(false); addMsg("bot", "Error: " + e.message); resumeWake(); }
  finally { busy = false; stopActivity(); if (uiState === "thinking") setState("idle"); }
}

async function confirmAction(approved) {
  resolveCard(approved);
  stopRec();
  setState("thinking"); typing(true); startActivity(); busy = true;
  try { await handle(await post("/api/confirm", { approved, session_id: SESSION })); loadSessions(); }
  catch (e) { typing(false); addMsg("bot", "Error: " + e.message); }
  finally { busy = false; stopActivity(); if (uiState === "thinking") setState("idle"); }
}

// ---------- sessions ----------
async function loadSessions() {
  const list = $("sessionList");
  try {
    const { sessions } = await api("/api/sessions").then((r) => r.json());
    list.replaceChildren();
    if (!sessions.length) list.append(el("li", "empty", "Abhi koi chat nahi."));
    sessions.forEach((s) => {
      const li = el("li", s.id === SESSION ? "active" : "");
      const t = el("div", "t"); t.append(el("span", "", s.title), el("small", "", (s.updated || "").replace("T", " ").slice(0, 16)));
      const x = el("button", "x", "✕"); x.title = "Delete chat"; x.type = "button";
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Ye chat delete kar du?")) return;
        await api("/api/sessions/" + encodeURIComponent(s.id), { method: "DELETE" });
        if (s.id === SESSION) newChat(); else loadSessions();
      });
      li.append(t, x);
      li.addEventListener("click", () => openSession(s.id));
      list.append(li);
    });
  } catch (e) {}
}

function welcome() {
  chatEl.replaceChildren();
  const name = cfg.user_name || "";
  addMsg("bot", `Namaste${name ? " " + name : ""}! Mic dabao${canVoice ? " ya wake word bolo" : ""}, ya type karo. Jo kaam hai bata do.`);
  if (cfg.demo) addMsg("sys", "Demo mode: Gemini key nahi mili, isliye simple offline brain chal raha hai. Asli AI ke liye .env mein GEMINI_API_KEY daalo aur server restart karo.");
}

async function openSession(id) {
  SESSION = id; store.set("sid", id); closeDrawers();
  pendingCard = null;
  try {
    const { messages } = await api("/api/sessions/" + encodeURIComponent(id)).then((r) => r.json());
    chatEl.replaceChildren();
    if (!messages.length) welcome();
    messages.forEach((m, i) => {
      if (m.role === "user") addMsg("user", m.text, { at: m.at });
      else {
        addMsg("bot", m.text, { at: m.at, actions: S.actions ? m.actions : [] });
        if (m.confirm && i === messages.length - 1) confirmCard(m.confirm, m.text);
      }
    });
    scrollDown();
  } catch (e) { welcome(); }
  loadSessions();
}
function newChat() {
  SESSION = uid(); store.set("sid", SESSION); closeDrawers(); pendingCard = null;
  welcome(); loadSessions(); input.focus();
}

// ---------- dashboard ----------
function fillList(id, rows, empty) {
  const ul = $(id); ul.replaceChildren();
  if (!rows.length) { ul.append(el("li", "muted", empty)); return; }
  rows.forEach((r) => ul.append(r));
}
function fmtDue(s) { const d = new Date(s.replace(" ", "T")); return isNaN(d) ? s : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

async function loadLocal() {
  try {
    const d = await api("/api/dashboard/local").then((r) => r.json());
    fillList("todoList", d.todos.map((t) => {
      const li = el("li", t.done ? "done" : "");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = t.done;
      cb.addEventListener("change", async () => { await api(`/api/todos/${t.i}/toggle`, { method: "POST" }); loadLocal(); });
      li.append(cb, el("span", "grow", t.task)); return li;
    }), "Koi kaam nahi.");
    fillList("noteList", d.notes.map((n) => { const li = el("li"); const g = el("div", "grow", n.text); g.append(el("span", "sub", n.at)); li.append(g); return li; }), "Koi note nahi.");
    fillList("remList", d.reminders.map((r) => { const li = el("li"); li.append(el("span", "when", fmtDue(r.due)), el("span", "grow", r.text)); return li; }), "Koi reminder nahi.");
    const chips = $("statusChips"); chips.replaceChildren();
    const add = (txt, ok) => chips.append(el("span", "chip " + (ok ? "ok" : "off"), (ok ? "● " : "○ ") + txt));
    add("Gemini " + (cfg.demo ? "demo" : "on"), !cfg.demo); add("Gmail + Calendar", d.status.google); add("WhatsApp", d.status.whatsapp);
    if (d.status.battery) add(`Battery ${d.status.battery.percent}%${d.status.battery.plugged ? " ⚡" : ""}`, true);
    renderBadges(d.status);
  } catch (e) {}
}
function renderBadges(st) {
  const b = $("badges"); b.replaceChildren();
  if (cfg.demo) b.append(el("span", "badge warn", "Demo"));
  if (st && st.google) b.append(el("span", "badge ok", "Gmail ✓"));
  if (st && st.whatsapp) b.append(el("span", "badge ok", "WhatsApp ✓"));
}
async function loadCalendar() {
  try {
    const d = await api("/api/dashboard/calendar").then((r) => r.json());
    if (!d.connected) return fillList("calList", [], "Google connect nahi hai (setup_google.bat).");
    if (d.error) return fillList("calList", [], "Calendar load nahi hua.");
    fillList("calList", d.events.map((e) => { const li = el("li"); li.append(el("span", "when", e.day));
      const g = el("div", "grow", e.title); g.append(el("span", "sub", e.time + (e.location ? " · " + e.location : ""))); li.append(g); return li; }), "Agle 3 din kuch nahi hai.");
  } catch (e) {}
}
async function loadMail() {
  try {
    const d = await api("/api/dashboard/mail").then((r) => r.json());
    if (!d.connected) return fillList("mailList", [], "Google connect nahi hai (setup_google.bat).");
    if (d.error) return fillList("mailList", [], "Mail load nahi hua.");
    fillList("mailList", d.mails.map((m) => { const li = el("li"); const g = el("div", "grow", m.subject);
      g.append(el("span", "sub", m.from + " — " + m.snippet)); li.append(g); return li; }), "Koi unread mail nahi. 🎉");
  } catch (e) {}
}
function bindForms() {
  const wire = (formId, fn) => $(formId).addEventListener("submit", async (e) => { e.preventDefault(); await fn(); loadLocal(); });
  wire("todoForm", async () => { const v = $("todoText").value.trim(); if (!v) return; await post("/api/todos", { text: v }); $("todoText").value = ""; });
  wire("noteForm", async () => { const v = $("noteText").value.trim(); if (!v) return; await post("/api/notes", { text: v }); $("noteText").value = ""; });
  wire("remForm", async () => { const v = $("remText").value.trim(); if (!v) return; const r = await post("/api/reminders", { text: v, minutes: Number($("remMin").value) || 10 }); $("remText").value = ""; toast(r.message); });
}

// ---------- reminders poll + toast ----------
function toast(text) {
  const t = el("div", "toast", text); $("toasts").append(t); setTimeout(() => t.remove(), 5000);
}
async function pollReminders() {
  try {
    const r = await api("/api/reminders/due").then((x) => x.json());
    for (const text of r.due || []) {
      addMsg("bot", "⏰ Reminder: " + text); toast("⏰ " + text);
      if ("Notification" in window && Notification.permission === "granted") new Notification("Reminder", { body: text });
      await speak("Reminder: " + text); loadLocal();
    }
    for (const text of r.notices || []) { addMsg("bot", text); await speak(text); }
  } catch (e) {}
}

// ---------- drawers + settings ----------
function openDrawer(side) { $(side).classList.add("open"); $("scrim").classList.remove("hidden"); }
function closeDrawers() { ["left", "right"].forEach((s) => $(s).classList.remove("open")); $("scrim").classList.add("hidden"); }

function fillVoices() {
  const sel = $("setVoice"); const cur = S.voice;
  sel.replaceChildren(new Option("Auto", ""));
  voices().forEach((v) => sel.append(new Option(`${v.name} (${v.lang})`, v.name)));
  sel.value = cur || "";
}
function applySettings() {
  document.documentElement.dataset.accent = S.accent;
  document.body.classList.toggle("reduce", !!S.reduce);
  chatEl.parentElement.classList.toggle("no-tools", !S.actions);
  $("agentName").textContent = agentName(); $("brandName").textContent = agentName();
  document.title = agentName();
  $("wakeLabel").textContent = `"${wakeWord()}" sunte raho`;
  document.querySelectorAll("#swatches button").forEach((b) => b.classList.toggle("on", b.dataset.accent === S.accent));
}
function saveSettings() { store.set("settings", S); applySettings(); }
function bindSettings() {
  $("setWake").value = S.wake; $("setName").value = S.name; $("setRate").value = S.rate; $("rateVal").textContent = S.rate;
  $("setSpeak").checked = S.speak; $("setActions").checked = S.actions; $("setLive").checked = S.live; $("setReduce").checked = S.reduce;
  $("setWake").addEventListener("change", (e) => { S.wake = e.target.value.trim().toLowerCase(); saveSettings(); if (wakeMode) startWake(); });
  $("setName").addEventListener("change", (e) => { S.name = e.target.value.trim(); saveSettings(); });
  $("setVoice").addEventListener("change", (e) => { S.voice = e.target.value; saveSettings(); });
  $("setRate").addEventListener("input", (e) => { S.rate = Number(e.target.value); $("rateVal").textContent = S.rate; saveSettings(); });
  [["setSpeak", "speak"], ["setActions", "actions"], ["setLive", "live"], ["setReduce", "reduce"]].forEach(([id, k]) =>
    $(id).addEventListener("change", (e) => { S[k] = e.target.checked; saveSettings(); if (k === "reduce") requestAnimationFrame(drawWave); }));
  document.querySelectorAll("#swatches button").forEach((b) => b.addEventListener("click", () => { S.accent = b.dataset.accent; saveSettings(); }));
  $("openSettings").addEventListener("click", () => { closeDrawers(); $("settings").classList.remove("hidden"); fillVoices(); });
  $("closeSettings").addEventListener("click", () => $("settings").classList.add("hidden"));
  $("settings").addEventListener("click", (e) => { if (e.target === $("settings")) $("settings").classList.add("hidden"); });
  $("copyUrl").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("phoneUrl").value); toast("Copy ho gaya"); } catch (e) { $("phoneUrl").select(); } });
}

// ---------- init ----------
$("form").addEventListener("submit", (e) => { e.preventDefault(); const t = input.value.trim(); if (t && !busy) send(t); });
micBtn.addEventListener("click", () => (capturing && rec ? rec.stop() : (speechSynthesis.cancel(), captureCommand())));
$("wakeToggle").addEventListener("change", (e) => {
  wakeMode = e.target.checked; store.set("wakeMode", wakeMode);
  wakeMode ? startWake() : (stopRec(), setStatus("Ready"));
});
$("newChat").addEventListener("click", newChat);
$("cGo").addEventListener("click", doConnect);
$("cPin").addEventListener("keydown", (e) => { if (e.key === "Enter") doConnect(); });
$("cDemo").addEventListener("click", () => { store.set("demo", true); location.reload(); });
$("disconnectBtn").addEventListener("click", disconnect);
$("menuLeft").addEventListener("click", () => openDrawer("left"));
$("menuRight").addEventListener("click", () => openDrawer("right"));
$("scrim").addEventListener("click", closeDrawers);
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeDrawers));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeDrawers(); $("settings").classList.add("hidden"); }
  if (pendingCard && document.activeElement !== input && !e.ctrlKey && !e.metaKey) {
    if (e.key.toLowerCase() === "y") confirmAction(true);
    if (e.key.toLowerCase() === "n") confirmAction(false);
  }
});

(async function init() {
  // Where is the backend? Same origin (PC / tunnel) or a saved tunnel URL (Vercel).
  if (!(await detectSameOrigin())) {
    HOSTED = true; API = store.get("apiBase", ""); TOKEN = store.get("token", "");
    $("disconnectRow").classList.remove("hidden");
    if (store.get("demo", false)) await loadScript("/static/demo.js");
    else if (!API || !TOKEN) {
      const m = location.hash.match(/connect=([^&]+)/);
      if (m) { $("cUrl").value = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname); }
      showConnect();
    }
  }
  setOnline(true);
  try { cfg = { ...cfg, ...(await api("/api/config").then((r) => r.json())) }; } catch (e) {}
  bindSettings(); bindForms(); applySettings();
  if (!canVoice) {
    micBtn.classList.add("hidden"); $("wakeWrap").classList.add("hidden");
    if (SR === undefined || SR === null) $("voiceNote").textContent = "Is browser mein voice nahi hai. PC par Chrome ya Edge use karo, ya type karo.";
    $("voiceNote").classList.remove("hidden");
  }
  if (cfg.tunnel_url) {
    $("phoneInfo").textContent = "Internet link (Cloudflare tunnel). Ye har baar start par badalta hai. Phone par PC ka UI is link se khulta hai:";
    $("phoneRow").classList.remove("hidden"); $("phoneUrl").value = (cfg.ui_url || "") + "#connect=" + encodeURIComponent(cfg.tunnel_url);
  } else if (cfg.phone_url) {
    $("phoneInfo").textContent = "Phone aur PC same Wi-Fi par hon, aur run_phone.bat se start karo. Phir PIN daalo.";
    $("phoneRow").classList.remove("hidden"); $("phoneUrl").value = cfg.phone_url;
  }
  document.querySelector("#agentName").title = cfg.google_connected ? "Gmail + Calendar connected" : "Gmail/Calendar not connected";
  setState("idle");
  requestAnimationFrame(drawWave);
  await loadSessions();
  const sess = await api("/api/sessions/" + encodeURIComponent(SESSION)).then((r) => r.json()).catch(() => ({ messages: [] }));
  if (sess.messages && sess.messages.length) await openSession(SESSION); else welcome();
  loadLocal(); loadCalendar(); loadMail();
  setInterval(loadLocal, 30000); setInterval(loadCalendar, 120000); setInterval(loadMail, 120000);
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  if (canVoice && store.get("wakeMode")) { $("wakeToggle").checked = true; wakeMode = true; startWake(); }
  setInterval(pollReminders, 30000);
  setInterval(async () => { if (!HOSTED || store.get("demo", false) || !API) return; try { const r = await fetch(API + "/api/ping", { cache: "no-store" }); setOnline(r.ok); } catch (e) { setOnline(false); } }, 20000);
})();
