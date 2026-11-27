"use client";
import { create } from "zustand";
import { api, apiRaw, getToken, setToken, setAuthLostHandler, AuthError } from "./api";
import { voice } from "./voice";
import { voiceAnswer } from "./approval";
import { IDLE_ACT, normalizeActivity } from "./activity";
import type { Activity, CalEvent, Cfg, Confirm, Mail, Memory, Mode, Msg, Note, Reminder, Session, Settings, Theme, Todo, UiState, View, VoiceIssue } from "./types";

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const nowHM = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DEFAULT_SETTINGS: Settings = { name: "", voice: "Sulafat", rate: 1, speak: true, convo: true, srLang: "en-IN", showTools: true, wake: false, wakeWord: "", theme: "light" };
const THEMES: Theme[] = ["light", "dark", "system"];
const SID_OK = /^[A-Za-z0-9_-]{1,64}$/;

/** Keep only well-typed values from localStorage so a corrupted or old entry cannot break the UI. */
function cleanSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const str = (v: unknown, def: string, max = 40) => (typeof v === "string" && v.length <= max ? v : def);
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const rate = typeof r.rate === "number" && r.rate >= 0.5 && r.rate <= 2 ? r.rate : d.rate;
  const theme = THEMES.includes(r.theme as Theme) ? (r.theme as Theme) : d.theme;
  return { name: str(r.name, d.name), voice: str(r.voice, d.voice), rate, speak: bool(r.speak, d.speak), convo: bool(r.convo, d.convo),
    srLang: str(r.srLang, d.srLang, 12), showTools: bool(r.showTools, d.showTools),
    wake: bool(r.wake, d.wake), wakeWord: str(r.wakeWord, d.wakeWord, 40).toLowerCase(), theme };
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const t = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = t;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "theme-color"); document.head.appendChild(meta); }
  meta.setAttribute("content", `rgb(${getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().split(" ").join(",")})`);
}

type Toast = { id: string; text: string; sticky?: boolean };
type Dash = { todos: Todo[]; notes: Note[]; reminders: Reminder[]; calendar: CalEvent[]; mail: Mail[]; calendarConnected: boolean; mailConnected: boolean; calendarError: boolean; mailError: boolean; whatsappSession: boolean | null; battery: { percent: number; plugged: boolean } | null };

interface State {
  ready: boolean; authed: boolean; loggingIn: boolean; loginError: string;
  mode: Mode; online: boolean; checkedAt: number;
  cfg: Cfg;
  settings: Settings; sessions: Session[]; sid: string; msgs: Msg[];
  ui: UiState; busy: boolean; activity: Activity; interim: string; voiceStatus: string;
  voiceIssue: VoiceIssue; wakeActive: boolean; wakeNote: string;
  dash: Dash; pcOnline: boolean; toasts: Toast[]; convoActive: boolean;
  memory: Memory | null; memoryUnsupported: boolean; draft: string;
  view: View; sidebarOpen: boolean;
  init(): Promise<void>; login(pin: string): Promise<void>; logout(): void;
  send(text: string): Promise<void>; confirm(approved: boolean): Promise<void>; resetChat(): Promise<void>;
  newChat(): void; openSession(id: string): Promise<void>; deleteSession(id: string): Promise<void>; deleteAllSessions(): Promise<void>;
  refreshSessions(): Promise<void>; refreshDash(): Promise<void>; refreshStatus(): Promise<void>; loadMemory(): Promise<void>;
  addTodo(t: string): Promise<void>; toggleTodo(i: number): Promise<void>; addNote(t: string): Promise<void>; addReminder(t: string, minutes: number): Promise<void>;
  toggleMic(): Promise<void>; setSettings(p: Partial<Settings>): void; toast(text: string, sticky?: boolean): void; dismissToast(id: string): void; go(v: View): void; ask(text: string): void;
  confirmError: string; dismissConfirm(): void; stopRequest(): Promise<void>;
  syncWake(): void; set(p: Partial<State>): void; playSample(): Promise<void>; connectGoogle(): Promise<void>;
}

let actTimer: ReturnType<typeof setInterval> | null = null;
let jobTimer: ReturnType<typeof setInterval> | null = null;
let dashTimer: ReturnType<typeof setInterval> | null = null;
let remindTimer: ReturnType<typeof setInterval> | null = null;
let wakeTimer: ReturnType<typeof setInterval> | null = null;
let wakeSeq: number | null = null;
let gen = 0; // bumped on logout / session switch so late responses from the old state are ignored
let emptyCount = 0;
let reqId = 0; // bumped when a request is stopped or abandoned, so its late answer is ignored
let mq: MediaQueryList | null = null;

const MIC_MSG: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then try again.",
  "service-not-allowed": "Microphone access is blocked. Allow the microphone for this site and try again.",
  "audio-capture": "No microphone was found. Connect one and try again.",
  network: "Speech recognition needs an internet connection. Check your connection.",
};

export const useStore = create<State>((set, get) => {
  const speakReply = async (text: string) => {
    const { settings } = get();
    if (!settings.speak) return;
    set({ ui: "speaking" });
    const status = await voice.speak(text, { voice: settings.voice, rate: settings.rate });
    if (status) set({ voiceStatus: status });
    if (get().ui === "speaking") set({ ui: "idle" });
  };
  // The microphone opens by itself only for someone who is using their voice, never after a typed command.
  let nextFromVoice = false, lastFromVoice = false;
  const sendVoice = (text: string) => { nextFromVoice = true; void get().send(text); };
  const afterReply = (needConfirm: boolean) => {
    if (get().busy) return;
    if ((get().convoActive || (needConfirm && lastFromVoice)) && voice.canListen) void listenOnce();
  };
  const startActivity = (sid: string) => {
    stopActivity();
    const g = gen;
    actTimer = setInterval(async () => {
      try {
        const raw = await api<unknown>("/api/activity?session_id=" + encodeURIComponent(sid), { timeout: 6000 });
        if (!(g === gen && get().sid === sid && actTimer)) return;
        const a = normalizeActivity(raw);
        // an idle answer from the PC backend must not wipe the steps we already know about while a request is running
        if (get().busy && a.steps.length === 0) return;
        if (get().busy || !a.done) set({ activity: a });
      } catch { /* transient */ }
    }, 600);
  };
  const stopActivity = () => { if (actTimer) clearInterval(actTimer); actTimer = null; };

  /** Starts one voice capture. "listening" is only shown once the recognizer has really started. */
  const listenOnce = async () => {
    const st = get();
    if (!voice.canListen) { st.toast("Voice input is not supported in this browser. Use Chrome or Edge on a secure connection.", true); set({ convoActive: false, voiceIssue: "unavailable" }); return; }
    const ok = await voice.listen({
      lang: st.settings.srLang,
      onInterim: (t) => set({ interim: t }),
      onEnd: (text, err) => {
        set({ interim: "" });
        if (err) {
          if (MIC_MSG[err]) {
            get().toast(MIC_MSG[err], true);
            set({ convoActive: false, ui: "idle", voiceIssue: err === "audio-capture" ? "unavailable" : err === "network" ? "error" : "denied" });
            return;
          }
          set({ voiceIssue: "error" });
        }
        if (text) { emptyCount = 0; set({ ui: "thinking" }); sendVoice(text); return; }
        emptyCount++;
        if (get().convoActive && emptyCount < 3 && !get().busy) { setTimeout(() => get().convoActive && !get().busy && void listenOnce(), 250); return; }
        set({ convoActive: false, ui: "idle" });
        if (emptyCount > 0) get().toast("I did not hear anything. Tap the microphone and try again.");
      },
    });
    if (ok) set({ ui: "listening", interim: "", voiceIssue: null });
    else set({ convoActive: false, ui: "idle", voiceIssue: "unavailable" });
  };

  // ---- wake word: offline engine (poll /api/wake) or browser recognizer; only active while idle ----
  const stopWakeLoops = () => {
    voice.stopWake(); if (wakeTimer) clearInterval(wakeTimer); wakeTimer = null; wakeSeq = null;
    if (get().wakeActive) set({ wakeActive: false });
  };
  const onWake = (after: string) => {
    stopWakeLoops();
    if (get().busy || get().ui !== "idle") return;
    if (after.split(" ").length >= 2) { sendVoice(after); return; }
    set({ ui: "speaking" });
    void voice.speak("Yes, I'm listening.", { voice: get().settings.voice, rate: get().settings.rate }).then(() => { set({ ui: "idle" }); void listenOnce(); });
  };
  const syncWake = () => {
    const st = get();
    const want = st.settings.wake && st.authed && st.ready && st.ui === "idle" && !st.busy && !st.convoActive && voice.canListen;
    if (!want) { stopWakeLoops(); return; }
    if (st.cfg.wake_engine === "oww") {
      if (wakeTimer) return; voice.stopWake();
      wakeTimer = setInterval(async () => {
        try {
          const w = await api<{ seq: number; running?: boolean; error?: string }>("/api/wake", { timeout: 4000 });
          if (!wakeTimer) return; // stopped while the request was in flight
          // only claim "active" when the offline engine says it is really running
          set({ wakeActive: w.running !== false && !w.error, wakeNote: w.error || "" });
          if (wakeSeq === null) { wakeSeq = w.seq; return; }
          if (w.seq !== wakeSeq) { wakeSeq = w.seq; onWake(""); }
        } catch { /* transient */ }
      }, 600);
    } else if (!voice.waking && !voice.wakeBlocked) {
      const started = voice.startWake({
        lang: st.settings.srLang, word: st.settings.wakeWord || st.cfg.wake_word || "hey agent", onHit: onWake,
        onError: (e) => { set({ wakeActive: false, wakeNote: MIC_MSG[e] || "The wake word could not use the microphone.", voiceIssue: e === "audio-capture" ? "unavailable" : "denied" }); get().toast(MIC_MSG[e] || "The wake word could not start.", true); },
      });
      set({ wakeActive: started, wakeNote: started ? "" : "The wake word could not start in this browser." });
    } else if (voice.wakeBlocked && get().wakeActive) set({ wakeActive: false });
  };

  const stopJob = () => { if (jobTimer) clearInterval(jobTimer); jobTimer = null; };
  const stopTimers = () => {
    if (dashTimer) clearInterval(dashTimer); dashTimer = null;
    if (remindTimer) clearInterval(remindTimer); remindTimer = null;
  };
  const startTimers = () => {
    stopTimers(); // single place that creates the background timers, so login/reload can never stack them
    dashTimer = setInterval(() => { if (get().authed) { void get().refreshDash(); void get().refreshStatus(); } }, 20000);
    remindTimer = setInterval(async () => {
      if (!get().authed) return;
      try {
        const r = await api<{ due: string[]; notices: string[] }>("/api/reminders/due", { timeout: 10000 });
        for (const t of r.due || []) {
          set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "bot", text: "Reminder: " + t, at: nowHM() }] }));
          get().toast("Reminder: " + t, true);
          if ("Notification" in window && Notification.permission === "granted") new Notification("Reminder", { body: t });
          void speakReply("Reminder: " + t);
        }
      } catch {}
    }, 30000);
  };

  const pollJob = (jobId: number, sid: string) => {
    stopJob();
    const g = gen;
    let n = 0;
    jobTimer = setInterval(async () => {
      n++;
      try {
        const r = await api<any>(`/api/jobs/${jobId}`, { timeout: 15000 });
        if (g !== gen) return;
        if (r.status === "running" && n < 300) return;
        stopJob(); stopActivity();
        if (get().sid !== sid) return;
        const reply = r.reply || "Done.";
        set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "bot", text: reply, at: nowHM(), actions: r.actions, confirm: r.confirm ?? null }], busy: false, ui: "idle" }));
        void speakReply(reply).then(() => afterReply(!!r.confirm));
        void get().refreshDash();
      } catch (e) { if (n > 20) stopJob(); }
    }, 3000);
  };

  const handle = (sid: string, data: any) => {
    stopActivity();
    const confirm: Confirm | null = data.confirm ?? null;
    set((s) => ({
      msgs: [...s.msgs, { id: uid(), role: "bot", text: data.reply, at: nowHM(), actions: data.actions || [], confirm, pendingJob: data.pending ? data.job_id : null, error: !!data.error }],
      activity: { phase: "done", steps: data.trace || s.activity.steps, done: true },
      busy: !!data.pending, ui: data.pending ? "thinking" : "idle",
    }));
    if (data.pending && data.job_id) { startActivity(sid); pollJob(data.job_id, sid); }
    void speakReply(data.reply).then(() => afterReply(!!confirm));
    void get().refreshDash(); void get().refreshSessions();
  };

  return {
    ready: false, authed: false, loggingIn: false, loginError: "", mode: "local", online: true, checkedAt: 0, cfg: {},
    settings: DEFAULT_SETTINGS, sessions: [], sid: "", msgs: [], ui: "idle", busy: false, activity: IDLE_ACT, interim: "", voiceStatus: "",
    voiceIssue: null, wakeActive: false, wakeNote: "",
    dash: { todos: [], notes: [], reminders: [], calendar: [], mail: [], calendarConnected: false, mailConnected: false, calendarError: false, mailError: false, whatsappSession: null, battery: null },
    pcOnline: false, toasts: [], confirmError: "",convoActive: false, memory: null, memoryUnsupported: false, draft: "", view: "overview", sidebarOpen: false,
    set: (p) => set(p as any),
    syncWake,

    toast: (text, sticky) => { set((s) => ({ toasts: [...s.toasts, { id: uid(), text, sticky }].slice(-4) })); },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    dismissConfirm: () => {
      set((s) => ({ msgs: s.msgs.map((m) => (m.confirm ? { ...m, confirm: null } : m)), confirmError: "" }));
      get().toast("Closed. If the action is still waiting, it shows again when you reopen this chat.", true);
    },
    stopRequest: async () => {
      if (!get().busy) return;
      const { sid, mode } = get();
      reqId++; gen++; stopJob(); stopActivity(); voice.stop(); voice.stopListening();
      set((s) => ({ busy: false, ui: "idle", convoActive: false, interim: "", activity: { ...s.activity, done: true, phase: "idle" }, msgs: s.msgs.map((m) => (m.pendingJob ? { ...m, pendingJob: null } : m)) }));
      let told = false;
      if (mode === "local") { try { told = !!(await api<{ stopping?: boolean }>("/api/cancel", { method: "POST", json: { session_id: sid }, timeout: 10000 })).stopping; } catch {} }
      if (get().sid !== sid) return;
      const text = told ? "Stopped. No further steps will start. A step that was already running may still finish."
        : "Stopped waiting. The task may still be running. Risky steps still ask you first.";
      set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "bot", text, at: nowHM() }] }));
    },
    go: (v) => set({ view: v, sidebarOpen: false }),
    /** Quick actions send an ordinary chat message: they go through the same agent and the same confirmations as typing it. */
    ask: (text) => { set({ view: "chat", sidebarOpen: false }); void get().send(text); },

    setSettings: (p) => {
      const s = cleanSettings({ ...get().settings, ...p }); ls.set("settings", s); set({ settings: s });
      if (p.theme !== undefined) applyTheme(s.theme);
      if (p.voice !== undefined) voice.resetFailure();
      if (p.wake !== undefined || p.wakeWord !== undefined || p.srLang !== undefined) { voice.clearWakeBlock(); voice.stopWake(); set({ wakeNote: "" }); get().syncWake(); }
    },

    refreshStatus: async () => {
      let mode: Mode = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? "local" : "cloud";
      try { const p = await api<{ ok?: boolean; cloud?: boolean }>("/api/ping", { timeout: 8000 }); mode = p.cloud ? "cloud" : "local"; set({ online: true }); }
      catch (e) { if (!(e instanceof AuthError)) set({ online: false }); }
      try { const cfg = await api<Cfg>("/api/config", { timeout: 15000 }); set({ cfg }); } catch {}
      set({ mode, checkedAt: Date.now() });
      if (mode === "local") set({ pcOnline: get().online }); // on the PC backend the agent IS the PC
    },

    init: async () => {
      const settings = cleanSettings(ls.get<unknown>("settings", {}));
      applyTheme(settings.theme);
      if (typeof matchMedia !== "undefined" && !mq) { mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", () => { if (get().settings.theme === "system") applyTheme("system"); }); }
      let sid = ls.get<string>("sid", ""); if (typeof sid !== "string" || !SID_OK.test(sid)) { sid = uid(); ls.set("sid", sid); }
      setAuthLostHandler(() => { gen++; stopJob(); stopTimers(); stopWakeLoops(); voice.stop(); voice.stopListening(); setToken(""); set({ authed: false, loginError: "Your session expired. Please sign in again.", busy: false, ui: "idle" }); stopActivity(); });
      set({ settings, sid });
      await get().refreshStatus();
      if (getToken()) {
        try { await api("/api/sessions", { timeout: 15000 }); set({ authed: true }); } catch (e) { if (!(e instanceof AuthError)) set({ authed: true }); }
      } else {
        // The PC backend lets the PC itself in without a PIN: if it answers without a token, skip the login screen.
        try { const r = await fetch("/api/sessions", { cache: "no-store" }); if (r.ok) set({ authed: true }); } catch { /* offline: show login */ }
      }
      set({ ready: true });
      if (get().authed) {
        await get().openSession(sid);
        void get().refreshDash(); void get().refreshStatus();
        startTimers();
      }
    },

    login: async (pin) => {
      set({ loggingIn: true, loginError: "" });
      try {
        const d = await api<{ token: string }>("/api/login", { method: "POST", json: { pin }, timeout: 20000 });
        setToken(d.token); set({ authed: true, loggingIn: false });
        voice.unlock();
        await get().openSession(get().sid); void get().refreshDash(); void get().refreshStatus();
        startTimers();
      } catch (e: any) { set({ loggingIn: false, loginError: e?.message || "Sign-in failed." }); }
    },
    logout: () => { gen++; reqId++;setToken(""); voice.stop(); voice.stopListening(); stopActivity(); stopJob(); stopTimers(); stopWakeLoops(); set({ authed: false, msgs: [], convoActive: false, ui: "idle", view: "overview" }); },

    refreshSessions: async () => { try { const r = await api<{ sessions: Session[] }>("/api/sessions"); set({ sessions: r.sessions }); } catch {} },
    refreshDash: async () => {
      // note: only trust the WhatsApp flag in local mode; the cloud backend always reports false because WhatsApp lives on the PC
      try {
        const d = await api<any>("/api/dashboard/local");
        set((s) => ({
          dash: { ...s.dash, todos: d.todos ?? [], notes: d.notes ?? [], reminders: d.reminders ?? [], whatsappSession: s.mode === "local" && typeof d.status?.whatsapp === "boolean" ? d.status.whatsapp : null, battery: d.status?.battery ?? null },
          ...(s.mode === "cloud" ? { pcOnline: !!d.status?.pc } : {}),
        }));
      } catch {}
      try { const c = await api<any>("/api/dashboard/calendar"); set((s) => ({ dash: { ...s.dash, calendar: c.events || [], calendarConnected: !!c.connected, calendarError: !!c.error } })); }
      catch { set((s) => ({ dash: { ...s.dash, calendarError: true } })); }
      try { const m = await api<any>("/api/dashboard/mail"); set((s) => ({ dash: { ...s.dash, mail: m.mails || [], mailConnected: !!m.connected, mailError: !!m.error } })); }
      catch { set((s) => ({ dash: { ...s.dash, mailError: true } })); }
    },
    loadMemory: async () => {
      try { const m = await api<Memory>("/api/memory", { timeout: 10000 }); set({ memory: m, memoryUnsupported: false }); }
      catch (e) { if (!(e instanceof AuthError)) set({ memory: null, memoryUnsupported: true }); }
    },

    openSession: async (id) => {
      const g = ++gen; reqId++; stopJob(); ls.set("sid", id); voice.stop(); stopActivity();
      set({ sid: id, sidebarOpen: false, activity: IDLE_ACT, busy: false, ui: "idle", confirmError: "" });
      try {
        const r = await api<{ messages: any[]; pending?: { reply: string; confirm: Confirm } | null }>("/api/sessions/" + encodeURIComponent(id));
        if (g !== gen) return;
        const msgs: Msg[] = r.messages.map((m) => ({ id: uid(), role: m.role === "user" ? "user" : "bot", text: m.text, at: (m.at || "").slice(11, 16) || nowHM(), actions: m.actions }));
        // The backend says what is still waiting for approval; show it again after a reload or a chat switch.
        if (r.pending?.confirm) {
          const last = msgs[msgs.length - 1];
          if (last && last.role === "bot" && last.text === r.pending.reply) last.confirm = r.pending.confirm;
          else msgs.push({ id: uid(), role: "bot", text: r.pending.reply, at: nowHM(), confirm: r.pending.confirm });
        }
        set({ msgs });
      } catch (e) { if (g !== gen) return; set({ msgs: [] }); if (!(e instanceof AuthError)) get().toast("Could not load this conversation.", true); }
      await get().refreshSessions();
    },
    newChat: () => { const id = uid(); void get().openSession(id); set({ msgs: [], view: "chat" }); },
    deleteSession: async (id) => {
      try { await api("/api/sessions/" + encodeURIComponent(id), { method: "DELETE" }); }
      catch { get().toast("Could not delete that conversation. Nothing was removed.", true); void get().refreshStatus(); return; }
      get().toast("Conversation deleted.");
      if (id === get().sid) get().newChat(); else await get().refreshSessions();
    },
    deleteAllSessions: async () => {
      let failed = 0;
      for (const s of get().sessions) { try { await api("/api/sessions/" + encodeURIComponent(s.id), { method: "DELETE" }); } catch { failed++; } }
      if (!failed) { get().newChat(); await get().refreshSessions(); get().toast("All conversations deleted."); return; }
      get().toast(`${failed} conversation${failed === 1 ? "" : "s"} could not be deleted.`, true);
      void get().refreshStatus(); await get().refreshSessions();
    },
    resetChat: async () => {
      const sid = get().sid;
      try { await api("/api/reset", { method: "POST", json: { session_id: sid } }); set({ msgs: [], activity: IDLE_ACT, confirmError: "" }); get().toast("Conversation reset."); }
      catch (e: any) { get().toast(e?.message || "Could not reset the conversation.", true); }
    },

    send: async (text) => {
      const spoken = nextFromVoice; nextFromVoice = false;
      const t = text.trim(); if (!t || get().busy) return;
      lastFromVoice = spoken;
      if (!spoken) { voice.stopListening(); set({ convoActive: false, interim: "" }); }
      voice.stop(); voice.unlock();
      // While an action waits for approval, words are only an answer to it. They never go to /api/chat.
      if (get().msgs.some((m) => m.confirm)) {
        const answer = voiceAnswer(t);
        if (answer !== null) return get().confirm(answer);
        set({ convoActive: false, ui: "idle" });
        get().toast(`Heard “${t}”. Nothing ran. Say “confirm” or “cancel”, or use the buttons.`);
        return;
      }
      const sid = get().sid; const my = ++reqId;
      set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "user", text: t, at: nowHM() }], busy: true, ui: "thinking", draft: "", activity: { phase: "understand", steps: [{ phase: "understand", label: "Understanding your request", ms: 0 }], done: false } }));
      startActivity(sid);
      try {
        const data = await api<any>("/api/chat", { method: "POST", json: { text: t, session_id: sid }, timeout: 180000 });
        if (my !== reqId) return;
        handle(sid, data);
      } catch (e: any) {
        if (my !== reqId) return;
        stopActivity(); void get().refreshStatus();
        if (e instanceof AuthError) return;
        set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "sys", text: "Something went wrong: " + (e?.name === "AbortError" ? "the request took too long." : e?.message || e), at: nowHM(), error: true }], busy: false, ui: "idle", activity: { ...s.activity, done: true, phase: "error" } }));
      }
    },

    confirm: async (approved) => {
      const sid = get().sid;
      const asked = [...get().msgs].reverse().find((m) => m.confirm);
      const pending = asked?.confirm;
      if (!asked || !pending?.id) { get().toast("That request has expired. Please ask again."); return; }
      const my = ++reqId; const answerId = uid();
      set((s) => ({ msgs: s.msgs.map((m) => (m.confirm ? { ...m, confirm: null } : m)), busy: true, ui: "thinking", confirmError: "" }));
      voice.stopListening(); voice.stop(); set({ interim: "" }); startActivity(sid);
      set((s) => ({ msgs: [...s.msgs, { id: answerId, role: "user", text: approved ? "Yes, go ahead." : "No, cancel it.", at: nowHM() }] }));
      try {
        const data = await api<any>("/api/confirm", { method: "POST", json: { approved, confirm_id: pending.id, session_id: sid }, timeout: 180000 });
        if (my !== reqId) return;
        handle(sid, data);
      } catch (e: any) {
        if (my !== reqId) return;
        stopActivity(); if (e instanceof AuthError) return;
        // We do not know whether the answer arrived, so keep the question on screen. The id works only once.
        set((s) => ({
          msgs: s.msgs.filter((m) => m.id !== answerId).map((m) => (m.id === asked.id ? { ...m, confirm: pending } : m)),
          confirmError: "Your answer may not have reached the assistant (" + (e?.name === "AbortError" ? "the request took too long" : e?.message || e) + ").",
          busy: false, ui: "idle", activity: { ...s.activity, done: true, phase: "error" },
        }));
        void get().refreshStatus();
      }
    },

    addTodo: async (t) => { await api("/api/todos", { method: "POST", json: { text: t } }); await get().refreshDash(); },
    toggleTodo: async (i) => {
      try { await api(`/api/todos/${i}/toggle`, { method: "POST" }); }
      catch { get().toast("Could not update the task. It was not changed.", true); void get().refreshStatus(); return; }
      await get().refreshDash();
    },
    addNote: async (t) => { await api("/api/notes", { method: "POST", json: { text: t } }); await get().refreshDash(); void get().loadMemory(); },
    addReminder: async (t, minutes) => {
      // Asked here, from the user's own action, and not when the page loads.
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      const r = await api<{ message: string }>("/api/reminders", { method: "POST", json: { text: t, minutes } }); get().toast(r.message); await get().refreshDash(); },

    toggleMic: async () => {
      voice.unlock();
      if (get().convoActive || voice.listening) { set({ convoActive: false, ui: "idle", interim: "" }); voice.stopListening(); voice.stop(); return; }
      voice.stop(); emptyCount = 0; set({ convoActive: get().settings.convo });
      await listenOnce();
    },
    playSample: async () => {
      voice.resetFailure(); set({ ui: "speaking" });
      const s = get().settings; const st = await voice.speak("Hello! This is how I sound. How can I help you today?", { voice: s.voice, rate: s.rate });
      set({ ui: "idle", voiceStatus: st || get().voiceStatus });
    },
    connectGoogle: async () => {
      try { const d = await api<{ url?: string; detail?: string }>("/api/google/start"); if (d.url) location.href = d.url; else get().toast(d.detail || "Google setup is incomplete.", true); }
      catch (e: any) { get().toast(e?.message || "Could not start Google sign-in.", true); }
    },
  };
});
export { apiRaw };

// Wake word only listens while the assistant is idle: re-evaluate whenever one of the relevant states changes.
useStore.subscribe((s, p) => {
  if (s.ui !== p.ui || s.busy !== p.busy || s.authed !== p.authed || s.ready !== p.ready || s.convoActive !== p.convoActive
    || s.settings.wake !== p.settings.wake || s.cfg !== p.cfg) s.syncWake();
});
