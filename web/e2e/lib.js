// Shared helpers for the UI test scripts. Everything runs against mock.js: no real mic, mail, WhatsApp, calendar or PC control.
const { chromium } = require("playwright"); const mock = require("./mock");
const URL = process.env.UI_URL || "http://127.0.0.1:3112/";
const NAMES = { overview: "Overview", chat: "Chat", automation: "Automation", notes: "Notes", tasks: "Tasks", reminders: "Reminders", memory: "Memory", integrations: "Integrations", settings: "Settings" };

const FAKE_SR = (mode) => `(() => {
  class FakeSR { constructor(){ this.continuous=false; this.interimResults=false; this.lang=''; }
    start(){ window.__srStarts=(window.__srStarts||0)+1;
      ${mode === "denied" ? "setTimeout(()=>{ this.onerror&&this.onerror({error:'not-allowed'}); this.onend&&this.onend(); },60);" : mode === "nomic" ? "setTimeout(()=>{ this.onerror&&this.onerror({error:'audio-capture'}); this.onend&&this.onend(); },60);" : ""} }
    stop(){ this.onend&&this.onend(); } abort(){ this.onend=null; } }
  ${mode === "none" ? "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;" : "window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;"}
})();`;

async function launch() { return chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }); }

/** Opens the app in a fresh context. opts: viewport, theme, mock options, sr ("ok"|"denied"|"nomic"|"none"), scheme, reducedMotion */
async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, colorScheme: o.scheme || "light", reducedMotion: o.reducedMotion ? "reduce" : "no-preference", permissions: ["microphone", "clipboard-read", "clipboard-write", "notifications"] });
  await ctx.addInitScript((t) => { if (!localStorage.getItem("settings")) localStorage.setItem("settings", JSON.stringify({ theme: t, speak: false })); }, o.theme || "light");
  await ctx.addInitScript(FAKE_SR(o.sr || "ok"));
  const p = await ctx.newPage(); p.errors = [];
  p.on("pageerror", (e) => p.errors.push("pageerror: " + e)); p.on("console", (m) => m.type() === "error" && !/503|404|401|favicon|Failed to load resource/.test(m.text()) && p.errors.push("console: " + m.text()));
  const st = await mock.install(p, o.mock || {});
  await p.goto(URL); await p.waitForTimeout(o.wait ?? 1500);
  return { ctx, p, st };
}

async function gotoView(p, view) {
  const vw = p.viewportSize().width;
  if (vw < 1024 && (await p.getByRole("button", { name: "Open menu" }).count())) await p.getByRole("button", { name: "Open menu" }).click();
  await p.getByRole("navigation", { name: "Main" }).getByRole("button", { name: NAMES[view], exact: true }).click();
  await p.waitForTimeout(450);
}

function collector() {
  const rows = []; let section = "";
  return {
    section: (s) => { section = s; },
    check: (name, ok, detail = "") => { rows.push({ section, name, pass: !!ok, detail: String(detail).slice(0, 200) }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + detail)); },
    rows,
  };
}
module.exports = { launch, open, gotoView, collector, NAMES, URL };
