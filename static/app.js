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

// ---------- connection ----------
// Three ways the UI can run:
//  1) CLOUD: served by Vercel with the cloud API (same origin). PIN login. An optional PC tunnel is used whenever the PC is online.
//  2) PC:    served by the PC itself (same origin, PC backend).
//  3) HOSTED: static host with only a saved tunnel URL (older setup) or the offline demo.
let HOSTED = false, API = "", TOKEN = "", online = true;
let CLOUD = false, CTOKEN = "", PCBASE = "", PCTOKEN = "", pcOn = false, connectMode = "pc", ready = false;
const normUrl = (u) => { u = (u || "").trim().replace(/\/+$/, ""); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
function loadScript(src) { return new Promise((res) => { const s = document.createElement("script"); s.src = src; s.onload = s.onerror = res; document.head.appendChild(s); }); }
function setBadge() {
  const c = $("conn"); if (!c) return;
  if (CLOUD) {
    c.textContent = pcOn ? "PC online" : PCBASE ? "Cloud · PC offline" : "Cloud";
    c.className = "badge " + (pcOn ? "ok" : "warn"); return;
  }
  const hide = !HOSTED || store.get("demo", false);
  c.textContent = online ? "PC online" : "PC offline";
  c.className = "badge " + (online ? "ok" : "warn") + (hide ? " hidden" : "");
}
function setOnline(v) { online = v; setBadge(); }
function setPc(v) {
  if (pcOn === v) return;
  pcOn = v; setBadge(); updatePcRow();
  if (ready) { toast(v ? "PC is online. PC actions are now available." : "PC is offline. Running in cloud mode."); refreshAll(); }
}
async function pingPc() {
  if (!PCBASE || !PCTOKEN) return false;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
  try { const r = await fetch(PCBASE + "/api/ping", { cache: "no-store", signal: c.signal }); const j = await r.json(); return r.ok && j.ok === true && !j.cloud; }
  catch (e) { return false; } finally { clearTimeout(t); }
}
async function api(path, opts = {}, force = "") {
  const toPc = CLOUD && (force === "pc" || (force !== "cloud" && pcOn));
  const base = CLOUD ? (toPc ? PCBASE : "") : API;
  const tok = CLOUD ? (toPc ? PCTOKEN : CTOKEN) : TOKEN;
  const headers = { ...(opts.headers || {}) };
  if (tok) headers.Authorization = "Bearer " + tok;
  let r;
  try { r = await fetch(base + path, { ...opts, headers }); }
  catch (e) {
    if (toPc && !force) { setPc(false); return api(path, opts, "cloud"); }
    if (HOSTED) setOnline(false);
    throw e;
  }
  if (HOSTED) setOnline(true);
  if (r.status === 401) {
    if (toPc && !force) { setPc(false); toast("Your PC session expired. Reconnect the PC from Settings."); return api(path, opts, "cloud"); }
    if (toPc) throw new Error("PC session expired");
    if (CLOUD) showConnect("Your session expired. Please enter your PIN again.", "cloud");
    else if (HOSTED) showConnect("Your session expired. Please enter your PIN again.", "pc");
    else location.href = "/login";
    throw new Error("Login required");
  }
  return r;
}
function showConnect(msg, mode) {
  connectMode = mode || "pc";
  const cloud = connectMode === "cloud";
  $("cErr").textContent = msg || "";
  $("cUrlRow").classList.toggle("hidden", cloud);
  $("cDemo").classList.toggle("hidden", cloud || CLOUD);
  $("cCancel").classList.toggle("hidden", cloud);
  $("cTitle").textContent = cloud ? "Sign in" : "Connect to your PC";
  $("cHelp").textContent = cloud ? "Enter your ACCESS_PIN (the one set in Vercel)." : "Run run_online.bat on your PC, paste the link it shows here, then enter the PC PIN.";
  $("cUrl").value = $("cUrl").value || PCBASE || API || "";
  $("cPin").value = "";
  $("connect").classList.remove("hidden");
  setTimeout(() => (cloud ? $("cPin") : $("cUrl").value ? $("cPin") : $("cUrl")).focus(), 50);
}
async function doConnect() {
  const cloud = connectMode === "cloud", pin = $("cPin").value, url = cloud ? "" : normUrl($("cUrl").value);
  if (!pin || (!cloud && !url)) return ($("cErr").textContent = cloud ? "Enter your PIN." : "Enter both the address and the PIN.");
  $("cErr").textContent = "Connecting…"; $("cGo").disabled = true;
  try {
    const r = await fetch(url + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || "Sign-in failed");
    if (cloud) store.set("ctoken", d.token);
    else if (CLOUD) { store.set("pcBase", url); store.set("pcToken", d.token); }
    else { store.set("apiBase", url); store.set("token", d.token); store.set("demo", false); }
    location.reload();
  } catch (e) {
    $("cErr").textContent = e instanceof TypeError ? (cloud ? "Could not reach the server. Check your internet connection." : "Could not reach your PC. Are the agent and tunnel running, and is the address correct?") : e.message;
  } finally { $("cGo").disabled = false; }
}
async function detectSameOrigin() {
  try {
    const r = await fetch("/api/ping", { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    if (j && j.ok === true) return j;
  } catch (e) {}
  return null;
}
async function disconnect() {
  if (CLOUD) { store.set("ctoken", ""); location.reload(); return; }
  try { await api("/api/logout", { method: "POST" }); } catch (e) {}
  ["apiBase", "token", "demo"].forEach((k) => store.set(k, k === "demo" ? false : ""));
  location.reload();
}
function removePc() { store.set("pcBase", ""); store.set("pcToken", ""); location.reload(); }
function updatePcRow() {
  if (!CLOUD) return;
  $("pcInfo").textContent = !PCBASE ? "PC agent: not connected" : pcOn ? "PC agent: online ✓" : "PC agent: offline";
  $("pcConnectBtn").textContent = PCBASE ? "Change" : "Connect PC";
  $("pcRemoveBtn").classList.toggle("hidden", !PCBASE);
}

// ---------- state ----------
const BASE_CFG = { agent_name: "Agent", wake_word: "hey agent", recognition_lang: "en-IN", voice_lang: "en-IN" };
let cfg = { ...BASE_CFG };
const DEFAULTS = { wake: "", name: "", voice: "", rate: 1, speak: null, actions: true, live: false, reduce: false, accent: "cyan" };
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
  $("stateText").textContent = text || { idle: "Ready", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" }[state];
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
  if (name.startsWith("browser")) return "🌐";
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
  gmail_send: { icon: "✉", title: "Send this email?", fields: { to: "To", subject: "Subject", body: "Message" } },
  whatsapp_send: { icon: "💬", title: "Send this WhatsApp message?", fields: { to: "To", message: "Message" } },
  whatsapp_send_file: { icon: "📎", title: "Send this file on WhatsApp?", fields: { to: "To", file_path: "File" } },
  whatsapp_schedule: { icon: "🕒", title: "Schedule this WhatsApp message?", fields: { to: "To", at_time: "When", message: "Message" } },
  calendar_update_event: { icon: "📅", title: "Change this event?", fields: { new_title: "New title", new_start: "New time", new_duration_minutes: "Minutes" } },
  calendar_delete_event: { icon: "🗑", title: "Cancel this event?", fields: {} },
  close_app: { icon: "✖", title: "Close this app?", fields: { app_name: "App" } },
  type_text: { icon: "⌨", title: "Type this text?", fields: { text: "Text" } },
  press_keys: { icon: "⌨", title: "Press these keys?", fields: { keys: "Keys" } },
  lock_screen: { icon: "🔒", title: "Lock the screen?", fields: {} },
  browser_click_final: { icon: "🛒", title: "Confirm this final step?", fields: { summary: "Action", button: "Button", page: "Website" } },
};

function confirmCard(conf, reply) {
  const meta = CONFIRM_META[conf.tool] || { icon: "⚠", title: "Approve this action?", fields: {} };
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
  if (!dl.children.length && reply) { dl.append(el("dt", "", "Details"), el("dd", "", reply)); }
  const btns = el("div", "btns");
  const yes = el("button", "yes", "Yes"), no = el("button", "no", "No");
  yes.type = no.type = "button";
  yes.addEventListener("click", () => confirmAction(true));
  no.addEventListener("click", () => confirmAction(false));
  btns.append(yes, no);
  card.append(head, dl, btns, el("div", "hint", "You can also say “yes” or “no”"), el("div", "result"));
  chatEl.appendChild(card);
  pendingCard = card;
  scrollDown();
  return card;
}
function resolveCard(approved, via = "") {
  if (!pendingCard) return;
  pendingCard.classList.add("done", approved === true ? "approved" : "denied");
  pendingCard.querySelector(".result").textContent = approved === true ? "✓ Approved" + via : approved === false ? "✗ Declined" + via : "Answered";
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
      if (a.tool && S.actions) { bar.classList.remove("hidden"); txt.textContent = `${toolIcon(a.tool)} ${a.tool} running…`; }
      else if (S.actions) { bar.classList.remove("hidden"); txt.textContent = "Working on it…"; }
    } catch (e) {}
  };
  tick(); actTimer = setInterval(tick, 700);
}
function stopActivity() { clearInterval(actTimer); actTimer = null; $("activity").classList.add("hidden"); }

// ---------- text to speech ----------
// Primary engine: Kokoro (open-source neural voice, runs fully in the browser, free).
// Fallback: the browser's built-in voices (used while the model loads, for Hindi script, or if Kokoro fails).
const KOKORO_VOICES = [
  ["kokoro:af_heart", "Heart · female, warm (recommended)"],
  ["kokoro:af_nicole", "Nicole · female, soft and calm"],
  ["kokoro:af_bella", "Bella · female, expressive"],
  ["kokoro:af_sarah", "Sarah · female, clear"],
  ["kokoro:bf_emma", "Emma · female, British"],
  ["kokoro:am_michael", "Michael · male"],
];
const kokoro = { tts: null, state: "idle", promise: null };
let ttsToken = 0, ttsSource = null, ttsCtx = null;

function setVoiceStatus(t) { const e = $("voiceStatus"); if (e) e.textContent = t || ""; }
function wantsKokoro() { return !S.voice || S.voice.startsWith("kokoro:"); }
function kokoroVoice() { return S.voice && S.voice.startsWith("kokoro:") ? S.voice.slice(7) : "af_heart"; }

function loadKokoro() {
  if (kokoro.promise) return kokoro.promise;
  kokoro.state = "loading";
  setVoiceStatus("Downloading the natural voice (one-time, about 90 MB)… 0%");
  kokoro.promise = (async () => {
    try {
      const { KokoroTTS } = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm");
      const files = {};
      kokoro.tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8", device: "wasm",
        progress_callback: (p) => {
          if (p && p.file && typeof p.loaded === "number" && p.total) {
            files[p.file] = [p.loaded, p.total];
            let l = 0, t = 0; for (const k in files) { l += files[k][0]; t += files[k][1]; }
            setVoiceStatus(`Downloading the natural voice (one-time)… ${Math.min(99, Math.round((l / t) * 100))}%`);
          }
        },
      });
      kokoro.state = "ready";
      setVoiceStatus("Natural voice ready ✓");
      return true;
    } catch (e) {
      console.warn("Kokoro failed", e);
      kokoro.state = "failed";
      setVoiceStatus("Natural voice could not load; using the browser voice instead.");
      return false;
    }
  })();
  return kokoro.promise;
}

function cleanForSpeech(text) {
  return text
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[*_#`>~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ").trim();
}
function splitSentences(t) {
  const parts = t.match(/[^.!?\n]+[.!?]*\s*/g) || [t];
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) { out.push(cur.trim()); cur = p; } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function stopSpeaking() {
  ttsToken++;
  try { if (ttsSource) { ttsSource.onended = null; ttsSource.stop(); } } catch (e) {}
  ttsSource = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function playSamples(samples, rate, token) {
  return new Promise((resolve) => {
    if (token !== ttsToken) return resolve();
    ttsCtx = ttsCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (ttsCtx.state === "suspended") ttsCtx.resume();
    const buf = ttsCtx.createBuffer(1, samples.length, rate);
    buf.copyToChannel(samples, 0);
    const src = ttsCtx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = Math.min(1.5, Math.max(0.7, Number(S.rate) || 1));
    src.connect(ttsCtx.destination);
    src.onended = () => { if (ttsSource === src) ttsSource = null; resolve(); };
    ttsSource = src; src.start();
  });
}
async function speakKokoro(text, token) {
  const chunks = splitSentences(text);
  let next = kokoro.tts.generate(chunks[0], { voice: kokoroVoice(), speed: 1 });
  for (let i = 0; i < chunks.length; i++) {
    const audio = await next;
    if (token !== ttsToken) return;
    if (i + 1 < chunks.length) next = kokoro.tts.generate(chunks[i + 1], { voice: kokoroVoice(), speed: 1 });
    await playSamples(audio.audio, audio.sampling_rate || 24000, token);
    if (token !== ttsToken) return;
  }
}

function voices() { return "speechSynthesis" in window ? speechSynthesis.getVoices() : []; }
function pickVoice() {
  const v = voices();
  return v.find((x) => x.name === S.voice)
    || v.find((x) => x.lang === cfg.voice_lang && /google|natural|neural|aria|jenny|heera|neerja/i.test(x.name))
    || v.find((x) => x.lang === cfg.voice_lang) || v.find((x) => x.lang.startsWith("en")) || v.find((x) => x.lang.startsWith("hi"));
}
function speakBrowser(text, token) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = Number(S.rate) || 1;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = u.onerror = finish;
    setTimeout(finish, 2500 + text.length * 90); // safety net
    speechSynthesis.speak(u);
  });
}
async function speakLocalHindi(text, token) {
  const chunks = splitSentences(text);
  const fetchClip = (t) => fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) })
    .then(async (r) => { if (!r.ok) throw new Error("tts " + r.status); return r.arrayBuffer(); });
  ttsCtx = ttsCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (ttsCtx.state === "suspended") ttsCtx.resume();
  let next = fetchClip(chunks[0]);
  for (let i = 0; i < chunks.length; i++) {
    const data = await next;
    if (token !== ttsToken) return;
    if (i + 1 < chunks.length) { next = fetchClip(chunks[i + 1]); next.catch(() => {}); }
    const buf = await ttsCtx.decodeAudioData(data);
    await playSamples(buf.getChannelData(0), buf.sampleRate, token);
    if (token !== ttsToken) return;
  }
}

async function speak(text) {
  if (!S.speak) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  stopSpeaking(); stopRec();
  const token = ttsToken;
  speaking = true; setState("speaking");
  try {
    const devanagari = /[ऀ-ॿ]/.test(clean);
    if (wantsKokoro() && !devanagari && kokoro.state === "ready") {
      try { await speakKokoro(clean, token); }
      catch (e) { console.warn("Kokoro speak failed", e); if (token === ttsToken) await speakBrowser(clean, token); }
    } else if (devanagari && cfg && cfg.local_tts) {
      try { await speakLocalHindi(clean, token); }
      catch (e) { console.warn("Local Hindi voice failed", e); if (token === ttsToken) await speakBrowser(clean, token); }
    } else {
      if (wantsKokoro() && kokoro.state === "idle") loadKokoro();
      await speakBrowser(clean, token);
    }
  } finally {
    if (token === ttsToken) { speaking = false; if (uiState === "speaking") setState("idle"); }
  }
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
  if (!canVoice) return toast("Voice input is not available on this browser or connection. Use Chrome or Edge on a PC.");
  stopRec();
  capturing = true; micBtn.classList.add("on");
  setStatus("Listening… go ahead", "listening");
  startLiveMic();
  rec = new SR();
  rec.lang = cfg.recognition_lang; rec.interimResults = true; rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
    input.value = finalText || interim;
  };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setStatus("Microphone error: " + e.error); };
  rec.onend = () => {
    capturing = false; micBtn.classList.remove("on"); rec = null; stopLiveMic();
    const t = (finalText || input.value).trim();
    if (t) send(t); else { setStatus("Did not catch that"); resumeWake(); }
  };
  rec.start();
}

let wakeSeq = null, wakePoll = null;
function pollOfflineWake() {
  if (wakePoll) return;
  wakePoll = setInterval(async () => {
    if (!wakeMode) return;
    try {
      const w = await api("/api/wake").then((r) => r.json());
      if (wakeSeq === null) { wakeSeq = w.seq; return; }
      if (w.seq !== wakeSeq) {
        wakeSeq = w.seq;
        if (speaking || capturing || busy) return;
        stopRec();
        speak("Yes, I'm listening.").then(captureCommand);
      } else if (w.error) setStatus(w.error);
    } catch (e) {}
  }, 600);
}

function startWake() {
  if (!canVoice || !wakeMode || speaking || capturing || busy) return;
  if (cfg.wake_engine === "oww") { stopRec(); setStatus("Say the wake word…", "listening"); pollOfflineWake(); return; }
  stopRec();
  setStatus(`Say "${wakeWord()}"…`, "listening");
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
    else speak("Yes, I'm listening.").then(captureCommand);
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
    if (!sessions.length) list.append(el("li", "empty", "No chats yet."));
    sessions.forEach((s) => {
      const li = el("li", s.id === SESSION ? "active" : "");
      const t = el("div", "t"); t.append(el("span", "", s.title), el("small", "", (s.updated || "").replace("T", " ").slice(0, 16)));
      const x = el("button", "x", "✕"); x.title = "Delete chat"; x.type = "button";
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this chat?")) return;
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
  addMsg("bot", `Hello${name ? " " + name : ""}! Press the mic${canVoice ? " or say the wake word" : ""}, or just type. How can I help you today?`);
  if (cfg.cloud && cfg.needs_setup && cfg.needs_setup.length) addMsg("sys", "Cloud setup is incomplete. In Vercel > Settings > Environment Variables, add: " + cfg.needs_setup.join(", ") + ". Then redeploy.");
  else if (cfg.demo && !cfg.cloud) addMsg("sys", "Demo mode: no Gemini key found, so a simple offline assistant is running. For the real AI, add GEMINI_API_KEY to .env and restart the server.");
  if (CLOUD && !pcOn) addMsg("sys", PCBASE ? "Your PC is offline. Cloud mode supports chat, to-dos, notes, reminders, web search" + (cfg.google_connected ? ", Gmail and Calendar" : "") + ". PC actions (apps, volume, WhatsApp, shopping and bookings) work when your PC is online." : "Cloud mode supports chat, to-dos, notes, reminders and web search. For PC actions, go to Settings > Connect PC.");
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
    }), "No tasks.");
    fillList("noteList", d.notes.map((n) => { const li = el("li"); const g = el("div", "grow", n.text); g.append(el("span", "sub", n.at)); li.append(g); return li; }), "No notes.");
    fillList("remList", d.reminders.map((r) => { const li = el("li"); li.append(el("span", "when", fmtDue(r.due)), el("span", "grow", r.text)); return li; }), "No reminders.");
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
function googleLi(text) {
  const li = el("li", "muted");
  if (cfg.cloud && cfg.google_ready) {
    li.append(el("span", "grow", text + " "));
    const b = el("button", "small", "Connect Google"); b.type = "button";
    b.addEventListener("click", async () => {
      try { const d = await api("/api/google/start").then((r) => r.json()); if (d.url) location.href = d.url; else toast(d.detail || "Google setup is incomplete."); }
      catch (e) { toast("Could not start Google sign-in."); }
    });
    li.append(b);
  } else li.textContent = cfg.cloud ? "Google is not set up yet (add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel)." : text;
  return li;
}
async function loadCalendar() {
  try {
    const d = await api("/api/dashboard/calendar").then((r) => r.json());
    if (!d.connected) { $("calList").replaceChildren(googleLi("Google is not connected.")); return; }
    if (d.error) return fillList("calList", [], "Could not load calendar.");
    fillList("calList", d.events.map((e) => { const li = el("li"); li.append(el("span", "when", e.day));
      const g = el("div", "grow", e.title); g.append(el("span", "sub", e.time + (e.location ? " · " + e.location : ""))); li.append(g); return li; }), "Nothing in the next 3 days.");
  } catch (e) {}
}
async function loadMail() {
  try {
    const d = await api("/api/dashboard/mail").then((r) => r.json());
    if (!d.connected) { $("mailList").replaceChildren(googleLi("Google is not connected.")); return; }
    if (d.error) return fillList("mailList", [], "Could not load mail.");
    fillList("mailList", d.mails.map((m) => { const li = el("li"); const g = el("div", "grow", m.subject);
      g.append(el("span", "sub", m.from + " — " + m.snippet)); li.append(g); return li; }), "No unread mail.");
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
    if (CLOUD && pcOn) {
      try { const c = await api("/api/reminders/due", {}, "cloud").then((x) => x.json()); r.due = [...(r.due || []), ...(c.due || [])]; } catch (e) {}
    }
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
  sel.replaceChildren(new Option("Auto (natural voice)", ""));
  KOKORO_VOICES.forEach(([v, n]) => sel.append(new Option(n, v)));
  voices().forEach((v) => sel.append(new Option(`Browser: ${v.name} (${v.lang})`, v.name)));
  sel.value = cur || "";
}
function applySettings() {
  document.documentElement.dataset.accent = S.accent;
  document.body.classList.toggle("reduce", !!S.reduce);
  chatEl.parentElement.classList.toggle("no-tools", !S.actions);
  $("agentName").textContent = agentName(); $("brandName").textContent = agentName();
  document.title = agentName();
  $("wakeLabel").textContent = `Listening for "${wakeWord()}"`;
  document.querySelectorAll("#swatches button").forEach((b) => b.classList.toggle("on", b.dataset.accent === S.accent));
}
function saveSettings() { store.set("settings", S); applySettings(); }
function bindSettings() {
  $("setWake").value = S.wake; $("setName").value = S.name; $("setRate").value = S.rate; $("rateVal").textContent = S.rate;
  $("setSpeak").checked = S.speak; $("setActions").checked = S.actions; $("setLive").checked = S.live; $("setReduce").checked = S.reduce;
  $("setWake").addEventListener("change", (e) => { S.wake = e.target.value.trim().toLowerCase(); saveSettings(); if (wakeMode) startWake(); });
  $("setName").addEventListener("change", (e) => { S.name = e.target.value.trim(); saveSettings(); });
  $("setVoice").addEventListener("change", (e) => { S.voice = e.target.value; saveSettings(); if (wantsKokoro()) loadKokoro(); });
  $("testVoice").addEventListener("click", () => { S.speak = true; if (wantsKokoro()) toast("Loading the natural voice… the first sample may use the browser voice."); speak("Hello! This is how I sound. How can I help you today?"); });
  $("setRate").addEventListener("input", (e) => { S.rate = Number(e.target.value); $("rateVal").textContent = S.rate; saveSettings(); });
  [["setSpeak", "speak"], ["setActions", "actions"], ["setLive", "live"], ["setReduce", "reduce"]].forEach(([id, k]) =>
    $(id).addEventListener("change", (e) => { S[k] = e.target.checked; saveSettings(); if (k === "reduce") requestAnimationFrame(drawWave); }));
  document.querySelectorAll("#swatches button").forEach((b) => b.addEventListener("click", () => { S.accent = b.dataset.accent; saveSettings(); }));
  $("openSettings").addEventListener("click", () => { closeDrawers(); $("settings").classList.remove("hidden"); fillVoices(); });
  $("closeSettings").addEventListener("click", () => $("settings").classList.add("hidden"));
  $("settings").addEventListener("click", (e) => { if (e.target === $("settings")) $("settings").classList.add("hidden"); });
  $("pcConnectBtn").addEventListener("click", () => { $("settings").classList.add("hidden"); showConnect("", "pc"); });
  $("pcRemoveBtn").addEventListener("click", () => { if (confirm("Remove the PC agent? Cloud mode will keep working.")) removePc(); });
  $("cCancel").addEventListener("click", () => $("connect").classList.add("hidden"));
  $("copyUrl").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("phoneUrl").value); toast("Copied"); } catch (e) { $("phoneUrl").select(); } });
}

// ---------- init ----------
$("form").addEventListener("submit", (e) => { e.preventDefault(); const t = input.value.trim(); if (t && !busy) send(t); });
micBtn.addEventListener("click", () => (capturing && rec ? rec.stop() : (stopSpeaking(), captureCommand())));
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

async function refreshAll() {
  try { cfg = { ...BASE_CFG, ...(await api("/api/config").then((r) => r.json())) }; } catch (e) {}
  applySettings(); await loadSessions(); loadLocal(); loadCalendar(); loadMail();
}

(async function init() {
  // Where is the backend? Vercel cloud API, the PC itself, or a saved tunnel URL.
  const here = await detectSameOrigin();
  let hashConnect = "";
  const m = location.hash.match(/connect=([^&]+)/);
  if (m) { hashConnect = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname); }
  if (here && here.cloud) {
    CLOUD = true; CTOKEN = store.get("ctoken", ""); PCBASE = store.get("pcBase", ""); PCTOKEN = store.get("pcToken", "");
    $("disconnectRow").classList.remove("hidden"); $("pcRow").classList.remove("hidden");
    $("disconnectLabel").textContent = "Log out of this browser"; $("disconnectBtn").textContent = "Logout";
    if (hashConnect) { $("cUrl").value = hashConnect; }
    if (!CTOKEN) { showConnect("", "cloud"); return; }
    pcOn = await pingPc(); updatePcRow(); setBadge();
  } else if (!here) {
    HOSTED = true; API = store.get("apiBase", ""); TOKEN = store.get("token", "");
    $("disconnectRow").classList.remove("hidden");
    if (store.get("demo", false)) await loadScript("/static/demo.js");
    else if (!API || !TOKEN) {
      if (hashConnect) $("cUrl").value = hashConnect;
      showConnect("", "pc");
    }
  }
  if (!CLOUD) setOnline(true);
  try { cfg = { ...cfg, ...(await api("/api/config").then((r) => r.json())) }; } catch (e) {}
  bindSettings(); bindForms(); applySettings();
  if (!canVoice) {
    micBtn.classList.add("hidden"); $("wakeWrap").classList.add("hidden");
    if (SR === undefined || SR === null) $("voiceNote").textContent = "Voice input is not supported in this browser. Use Chrome or Edge on a PC, or type instead.";
    $("voiceNote").classList.remove("hidden");
  }
  if (CLOUD) {
    $("phoneInfo").textContent = "The cloud app opens on any device with this link. You will need your ACCESS_PIN to sign in.";
    $("phoneRow").classList.remove("hidden"); $("phoneUrl").value = location.origin;
  } else if (cfg.tunnel_url) {
    $("phoneInfo").textContent = "Internet link (Cloudflare tunnel). It changes on every start. Open your PC's UI on your phone with this link:";
    $("phoneRow").classList.remove("hidden"); $("phoneUrl").value = (cfg.ui_url || "") + "#connect=" + encodeURIComponent(cfg.tunnel_url);
  } else if (cfg.phone_url) {
    $("phoneInfo").textContent = "Keep your phone and PC on the same Wi-Fi and start with run_phone.bat. Then enter your PIN.";
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
  if (S.speak && wantsKokoro()) setTimeout(loadKokoro, 2500);
  ready = true;
  if (CLOUD && hashConnect) showConnect("", "pc");
  setInterval(async () => {
    if (CLOUD) { setPc(await pingPc()); return; }
    if (!HOSTED || store.get("demo", false) || !API) return;
    try { const r = await fetch(API + "/api/ping", { cache: "no-store" }); setOnline(r.ok); } catch (e) { setOnline(false); }
  }, 15000);
})();
