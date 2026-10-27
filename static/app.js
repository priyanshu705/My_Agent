// My_Agent web UI: mic button + "Hey Agent" wake word, Hinglish speech in/out.
// Works best in Google Chrome or Microsoft Edge (Web Speech API).

const $ = (id) => document.getElementById(id);
const chatEl = $("chat"), input = $("text"), micBtn = $("micBtn"), statusEl = $("status"), dot = $("statusDot");
const SESSION = "default";

let cfg = { agent_name: "Agent", wake_word: "hey agent", recognition_lang: "en-IN", voice_lang: "en-IN" };
let wakeMode = false;      // always-listening for wake word
let capturing = false;     // capturing a single command
let speaking = false;
let busy = false;
let rec = null;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------- UI helpers ----------
function add(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function addAction(a) {
  const d = document.createElement("div");
  d.className = "action";
  d.textContent = `⚙ ${a.tool} → ${String(a.result).slice(0, 160)}`;
  chatEl.appendChild(d);
}
function setStatus(text, state = "") {
  statusEl.textContent = text;
  dot.className = "dot " + state;
}

// ---------- Text to speech ----------
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === cfg.voice_lang && /google|heera|neerja|ravi/i.test(v.name))
      || voices.find((v) => v.lang === cfg.voice_lang)
      || voices.find((v) => v.lang.startsWith("hi"))
      || voices.find((v) => v.lang.startsWith("en"));
}
function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    stopRec();
    speaking = true;
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ""));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1.05;
    u.onend = u.onerror = () => { speaking = false; resolve(); };
    speechSynthesis.speak(u);
  });
}
speechSynthesis.onvoiceschanged = () => {};

// ---------- Speech recognition ----------
function stopRec() {
  if (rec) { rec.onend = null; try { rec.abort(); } catch (e) {} rec = null; }
}

function normalize(t) { return t.toLowerCase().replace(/[.,!?।]/g, "").trim(); }

function wakeVariants() {
  const w = normalize(cfg.wake_word);           // e.g. "hey agent"
  const last = w.split(" ").pop();              // "agent"
  return [w, w.replace("hey", "hi"), w.replace("hey", "he"), w.replace("hey", "hay"),
          "हे " + "एजेंट", "हाय एजेंट", "एजेंट", last].filter(Boolean);
}

// Listen for one command, then send it.
function captureCommand() {
  if (!SR) return alert("Is browser mein voice support nahi hai. Chrome ya Edge use karo.");
  stopRec();
  capturing = true;
  micBtn.classList.add("on");
  setStatus("Sun raha hoon… bolo", "listening");
  rec = new SR();
  rec.lang = cfg.recognition_lang;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
    input.value = finalText || interim;
  };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setStatus("Mic error: " + e.error); };
  rec.onend = () => {
    capturing = false;
    micBtn.classList.remove("on");
    rec = null;
    const t = (finalText || input.value).trim();
    if (t) send(t);
    else { setStatus("Kuch suna nahi"); resumeWake(); }
  };
  rec.start();
}

// Continuous listening for the wake word.
function startWake() {
  if (!SR || !wakeMode || speaking || capturing || busy) return;
  stopRec();
  setStatus(`"${cfg.wake_word}" bolo…`, "listening");
  rec = new SR();
  rec.lang = cfg.recognition_lang;
  rec.continuous = true;
  rec.interimResults = false;
  const variants = wakeVariants();
  rec.onresult = (e) => {
    const t = normalize(e.results[e.results.length - 1][0].transcript);
    const hit = variants.find((v) => t.includes(v));
    if (!hit) return;
    const after = t.slice(t.indexOf(hit) + hit.length).trim();
    stopRec();
    if (after.split(" ").length >= 2) send(after);   // "hey agent open chrome" in one go
    else speak("Haan bolo?").then(captureCommand);
  };
  rec.onerror = () => {};
  rec.onend = () => { rec = null; setTimeout(startWake, 300); }; // Chrome stops after silence; restart
  try { rec.start(); } catch (e) {}
}
function resumeWake() { if (wakeMode) setTimeout(startWake, 400); else setStatus("Ready"); }

// ---------- Backend ----------
async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}

async function handle(data) {
  (data.actions || []).forEach(addAction);
  add(data.reply, "bot");
  const needConfirm = !!data.confirm;
  $("confirmBar").classList.toggle("hidden", !needConfirm);
  if (needConfirm) $("confirmText").textContent = data.reply;
  await speak(data.reply);
  if (needConfirm) captureCommand();   // listen for "haan" / "na"
  else resumeWake();
}

async function send(text) {
  input.value = "";
  add(text, "user");
  busy = true;
  stopRec();
  setStatus("Soch raha hoon…", "thinking");
  try {
    await handle(await post("/api/chat", { text, session_id: SESSION }));
  } catch (e) {
    add("Error: " + e.message, "bot");
    resumeWake();
  } finally {
    busy = false;
  }
}

async function confirmAction(approved) {
  $("confirmBar").classList.add("hidden");
  stopRec();
  add(approved ? "Haan" : "Na", "user");
  setStatus("Kar raha hoon…", "thinking");
  try { await handle(await post("/api/confirm", { approved, session_id: SESSION })); }
  catch (e) { add("Error: " + e.message, "bot"); }
}

// ---------- Reminders ----------
async function pollReminders() {
  try {
    const r = await fetch("/api/reminders/due").then((x) => x.json());
    for (const text of r.due || []) {
      add("⏰ Reminder: " + text, "bot");
      if (Notification.permission === "granted") new Notification("Reminder", { body: text });
      await speak("Reminder: " + text);
    }
  } catch (e) {}
}

// ---------- Init ----------
$("form").addEventListener("submit", (e) => { e.preventDefault(); if (input.value.trim()) send(input.value.trim()); });
micBtn.addEventListener("click", () => (capturing && rec ? rec.stop() :(speechSynthesis.cancel(), captureCommand())));
$("yesBtn").addEventListener("click", () => confirmAction(true));
$("noBtn").addEventListener("click", () => confirmAction(false));
$("wakeToggle").addEventListener("change", (e) => {
  wakeMode = e.target.checked;
  try { localStorage.setItem("wakeMode", wakeMode ? "1" : "0"); } catch (err) {}
  wakeMode ? startWake() : (stopRec(), setStatus("Ready"));
});

(async function init() {
  try { cfg = { ...cfg, ...(await fetch("/api/config").then((r) => r.json())) }; } catch (e) {}
  $("agentName").textContent = cfg.agent_name;
  $("wakeLabel").textContent = `"${cfg.wake_word}" sunte raho`;
  document.title = cfg.agent_name;
  if (cfg.has_key === false) add("GEMINI_API_KEY nahi mili. .env file mein key daalo aur server restart karo.", "bot");
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  let saved = "0";
  try { saved = localStorage.getItem("wakeMode") || "0"; } catch (e) {}
  if (saved === "1") { $("wakeToggle").checked = true; wakeMode = true; startWake(); }
  setInterval(pollReminders, 30000);
})();
