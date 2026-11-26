"use client";
import { create } from "zustand";
import { api, apiRaw, getToken, setToken, setAuthLostHandler, AuthError } from "./api";
import { voice } from "./voice";
import type { Activity, CalEvent, Confirm, Mail, Msg, Note, Reminder, Session, Settings, Todo, UiState } from "./types";

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const nowHM = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const ACCENTS = ["cyan", "violet", "emerald", "amber", "rose"];
/** Keep only well-typed values from localStorage so a corrupted or old entry cannot break the UI. */
function cleanSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const str = (v: unknown, def: string, max = 40) => (typeof v === "string" && v.length <= max ? v : def);
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const rate = typeof r.rate === "number" && r.rate >= 0.5 && r.rate <= 2 ? r.rate : d.rate;
  const accent = typeof r.accent === "string" && ACCENTS.includes(r.accent) ? r.accent : d.accent;
  return { name: str(r.name, d.name), voice: str(r.voice, d.voice), rate, speak: bool(r.speak, d.speak), convo: bool(r.convo, d.convo),
    srLang: str(r.srLang, d.srLang, 12), accent, showTools: bool(r.showTools, d.showTools),
    wake: bool(r.wake, d.wake), wakeWord: str(r.wakeWord, d.wakeWord, 40).toLowerCase() };
}
const SID_OK = /^[A-Za-z0-9_-]{1,64}$/;

const DEFAULT_SETTINGS: Settings = { name: "", voice: "Sulafat", rate: 1, speak: true, convo: true, srLang: "en-IN", accent: "cyan", showTools: true, wake: false, wakeWord: "" };
const IDLE_ACT: Activity = { phase: "idle", steps: [], done: true };

type Toast = { id: string; text: string };
type Dash = { todos: Todo[]; notes: Note[]; reminders: Reminder[]; calendar: CalEvent[]; mail: Mail[]; calendarConnected: boolean; mailConnected: boolean };

interface State {
  ready: boolean; authed: boolean; loggingIn: boolean; loginError: string;
  cfg: { user_name?: string; wake_word?: string; wake_engine?: string; google_ready?: boolean; google_connected?: boolean; needs_setup?: string[] };
  settings: Settings; sessions: Session[]; sid: string; msgs: Msg[];
  ui: UiState; busy: boolean; activity: Activity; interim: string; voiceStatus: string;
  dash: Dash; pcOnline: boolean; toasts: Toast[]; convoActive: boolean;
  settingsOpen: boolean; sidebarOpen: boolean; tab: "chat" | "flow" | "dash";
  init(): Promise<void>; login(pin: string): Promise<void>; logout(): void;
  send(text: string): Promise<void>; confirm(approved: boolean): Promise<void>;
  newChat(): void; openSession(id: string): Promise<void>; deleteSession(id: string): Promise<void>;
  refreshSessions(): Promise<void>; refreshDash(): Promise<void>;
  addTodo(t: string): Promise<void>; toggleTodo(i: number): Promise<void>; addNote(t: string): Promise<void>; addReminder(t: string, minutes: number): Promise<void>;
  toggleMic(): Promise<void>; setSettings(p: Partial<Settings>): void; toast(text: string): void;
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

export const useStore = create<State>((set, get) => {
  const speakReply = async (text: string) => {
    const { settings } = get();
    if (!settings.speak) return;
    set({ ui: "speaking" });
    const status = await voice.speak(text, { voice: settings.voice, rate: settings.rate });
    if (status) set({ voiceStatus: status });
    if (get().ui === "speaking") set({ ui: "idle" });
  };
  const afterReply = (needConfirm: boolean) => {
    if (get().busy) return;
    if ((needConfirm || get().convoActive) && voice.canListen) void listenOnce();
  };
  const startActivity = (sid: string) => {
    stopActivity();
    const g = gen;
    actTimer = setInterval(async () => {
      try {
        const a = await api<Activity>("/api/activity?session_id=" + encodeURIComponent(sid), { timeout: 6000 });
        if (g === gen && get().sid === sid && actTimer && (get().busy || !a.done)) set({ activity: a });
      } catch { /* transient */ }
    }, 600);
  };
  const stopActivity = () => { if (actTimer) clearInterval(actTimer); actTimer = null; };

  const listenOnce = async () => {
    const st = get();
    if (!voice.canListen) { st.toast("Voice input is not supported in this browser. Use Chrome or Edge."); set({ convoActive: false }); return; }
    set({ ui: "listening", interim: "" });
    const ok = await voice.listen({
      lang: st.settings.srLang,
      onInterim: (t) => set({ interim: t }),
      onEnd: (text, err) => {
        set({ interim: "" });
        if (err) {
          const msg: Record<string, string> = {
            "not-allowed": "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then try again.",
            "service-not-allowed": "Microphone access is blocked. Allow the microphone for this site and try again.",
            "audio-capture": "No microphone was found. Connect one and try again.",
            network: "Speech recognition needs an internet connection. Check your connection.",
          };
          if (msg[err]) { get().toast(msg[err]); set({ convoActive: false, ui: "idle" }); return; }
        }
        if (text) { emptyCount = 0; set({ ui: "thinking" }); void get().send(text); return; }
        emptyCount++;
        if (get().convoActive && emptyCount < 3 && !get().busy) { setTimeout(() => get().convoActive && !get().busy && void listenOnce(), 250); return; }
        set({ convoActive: false, ui: "idle" });
        if (emptyCount > 0) get().toast("I did not hear anything. Tap the microphone and try again.");
      },
    });
    if (!ok) set({ convoActive: false, ui: "idle" });
  };

  // ---- wake word: offline engine (poll /api/wake) or browser recognizer; only active while idle ----
  const stopWakeLoops = () => { voice.stopWake(); if (wakeTimer) clearInterval(wakeTimer); wakeTimer = null; wakeSeq = null; };
  const onWake = (after: string) => {
    stopWakeLoops();
    if (get().busy || get().ui !== "idle") return;
    if (after.split(" ").length >= 2) { void get().send(after); return; }
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
          const w = await api<{ seq: number; error?: string }>("/api/wake", { timeout: 4000 });
          if (!wakeTimer) return; // stopped while the request was in flight
          if (wakeSeq === null) { wakeSeq = w.seq; return; }
          if (w.seq !== wakeSeq) { wakeSeq = w.seq; onWake(""); }
        } catch { /* transient */ }
      }, 600);
    } else if (!voice.waking) {
      voice.startWake({ lang: st.settings.srLang, word: st.settings.wakeWord || st.cfg.wake_word || "hey agent", onHit: onWake });
    }
  };

  const stopJob = () => { if (jobTimer) clearInterval(jobTimer); jobTimer = null; };
  const stopTimers = () => {
    if (dashTimer) clearInterval(dashTimer); dashTimer = null;
    if (remindTimer) clearInterval(remindTimer); remindTimer = null;
  };
  const startTimers = () => {
    stopTimers(); // single place that creates the background timers, so login/reload can never stack them
    dashTimer = setInterval(() => { if (get().authed) void get().refreshDash(); }, 20000);
    remindTimer = setInterval(async () => {
      if (!get().authed) return;
      try {
        const r = await api<{ due: string[]; notices: string[] }>("/api/reminders/due", { timeout: 10000 });
        for (const t of r.due || []) {
          set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "bot", text: "Reminder: " + t, at: nowHM() }] }));
          get().toast("Reminder: " + t);
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
      msgs: [...s.msgs, { id: uid(), role: "bot", text: data.reply, at: nowHM(), actions: data.actions || [], confirm, pendingJob: data.pending ? data.job_id : null }],
      activity: { phase: "done", steps: data.trace || s.activity.steps, done: true },
      busy: !!data.pending, ui: data.pending ? "thinking" : "idle",
    }));
    if (data.pending && data.job_id) { startActivity(sid); pollJob(data.job_id, sid); }
    void speakReply(data.reply).then(() => afterReply(!!confirm));
    void get().refreshDash(); void get().refreshSessions();
  };

  return {
    ready: false, authed: false, loggingIn: false, loginError: "", cfg: {},
    settings: DEFAULT_SETTINGS, sessions: [], sid: "", msgs: [], ui: "idle", busy: false, activity: IDLE_ACT, interim: "", voiceStatus: "",
    dash: { todos: [], notes: [], reminders: [], calendar: [], mail: [], calendarConnected: false, mailConnected: false },
    pcOnline: false, toasts: [], convoActive: false, settingsOpen: false, sidebarOpen: false, tab: "chat",
    set: (p) => set(p as any),
    syncWake,

    toast: (text) => {
      const id = uid(); set((s) => ({ toasts: [...s.toasts, { id, text }].slice(-4) }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5500);
    },

    setSettings: (p) => {
      const s = { ...get().settings, ...p }; ls.set("settings", s); set({ settings: s });
      if (typeof document !== "undefined") document.documentElement.dataset.accent = s.accent;
      if (p.voice !== undefined) voice.resetFailure();
      if (p.wake !== undefined || p.wakeWord !== undefined || p.srLang !== undefined) { voice.stopWake(); get().syncWake(); }
    },

    init: async () => {
      const settings = cleanSettings(ls.get<unknown>("settings", {}));
      document.documentElement.dataset.accent = settings.accent;
      let sid = ls.get<string>("sid", ""); if (typeof sid !== "string" || !SID_OK.test(sid)) { sid = uid(); ls.set("sid", sid); }
      setAuthLostHandler(() => { gen++; stopJob(); stopTimers(); stopWakeLoops(); voice.stop(); voice.stopListening(); setToken(""); set({ authed: false, loginError: "Your session expired. Please sign in again.", busy: false, ui: "idle" }); stopActivity(); });
      set({ settings, sid });
      try { const cfg = await api("/api/config", { timeout: 15000 }); set({ cfg }); } catch {}
      if (getToken()) {
        try { await api("/api/sessions", { timeout: 15000 }); set({ authed: true }); } catch (e) { if (!(e instanceof AuthError)) set({ authed: true }); }
      } else {
        // The PC backend lets the PC itself in without a PIN: if it answers without a token, skip the login screen.
        try { const r = await fetch("/api/sessions", { cache: "no-store" }); if (r.ok) set({ authed: true }); } catch { /* offline: show login */ }
      }
      set({ ready: true });
      if (get().authed) {
        await get().openSession(sid);
        void get().refreshDash();
        startTimers();
        if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      }
    },

    login: async (pin) => {
      set({ loggingIn: true, loginError: "" });
      try {
        const d = await api<{ token: string }>("/api/login", { method: "POST", json: { pin }, timeout: 20000 });
        setToken(d.token); set({ authed: true, loggingIn: false });
        voice.unlock();
        await get().openSession(get().sid); void get().refreshDash();
        startTimers();
      } catch (e: any) { set({ loggingIn: false, loginError: e?.message || "Sign-in failed." }); }
    },
    logout: () => { gen++; setToken(""); voice.stop(); voice.stopListening(); stopActivity(); stopJob(); stopTimers(); stopWakeLoops(); set({ authed: false, msgs: [], convoActive: false, ui: "idle" }); },

    refreshSessions: async () => { try { const r = await api<{ sessions: Session[] }>("/api/sessions"); set({ sessions: r.sessions }); } catch {} },
    refreshDash: async () => {
      try {
        const d = await api<any>("/api/dashboard/local");
        set((s) => ({ dash: { ...s.dash, todos: d.todos ?? [], notes: d.notes ?? [], reminders: d.reminders ?? [] }, pcOnline: !!d.status?.pc }));
      } catch {}
      try { const c = await api<any>("/api/dashboard/calendar"); set((s) => ({ dash: { ...s.dash, calendar: c.events || [], calendarConnected: !!c.connected } })); } catch {}
      try { const m = await api<any>("/api/dashboard/mail"); set((s) => ({ dash: { ...s.dash, mail: m.mails || [], mailConnected: !!m.connected } })); } catch {}
    },

    openSession: async (id) => {
      gen++; stopJob(); ls.set("sid", id); voice.stop(); stopActivity();
      set({ sid: id, sidebarOpen: false, activity: IDLE_ACT, busy: false, ui: "idle" });
      try {
        const r = await api<{ messages: any[] }>("/api/sessions/" + encodeURIComponent(id));
        const msgs: Msg[] = r.messages.map((m) => ({ id: uid(), role: m.role === "user" ? "user" : "bot", text: m.text, at: (m.at || "").slice(11, 16) || nowHM(), actions: m.actions }));
        set({ msgs });
      } catch { set({ msgs: [] }); }
      await get().refreshSessions();
    },
    newChat: () => { const id = uid(); void get().openSession(id); set({ msgs: [] }); },
    deleteSession: async (id) => {
      try { await api("/api/sessions/" + encodeURIComponent(id), { method: "DELETE" }); } catch {}
      if (id === get().sid) get().newChat(); else await get().refreshSessions();
    },

    send: async (text) => {
      const t = text.trim(); if (!t || get().busy) return;
      voice.stop(); voice.unlock();
      const sid = get().sid;
      set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "user", text: t, at: nowHM() }], busy: true, ui: "thinking", activity: { phase: "understand", steps: [{ phase: "understand", label: "Understanding your request", ms: 0 }], done: false } }));
      startActivity(sid);
      try {
        const data = await api<any>("/api/chat", { method: "POST", json: { text: t, session_id: sid }, timeout: 70000 });
        handle(sid, data);
      } catch (e: any) {
        stopActivity();
        if (e instanceof AuthError) return;
        set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "sys", text: "Something went wrong: " + (e?.name === "AbortError" ? "the request took too long." : e?.message || e), at: nowHM() }], busy: false, ui: "idle", activity: { ...s.activity, done: true, phase: "error" } }));
      }
    },

    confirm: async (approved) => {
      const sid = get().sid;
      const confirmId = [...get().msgs].reverse().find((m) => m.confirm)?.confirm?.id || "";
      if (!confirmId) { get().toast("That request has expired. Please ask again."); return; }
      set((s) => ({ msgs: s.msgs.map((m, i, a) => (i === a.length - 1 || m.confirm ? { ...m, confirm: null } : m)), busy: true, ui: "thinking" }));
      voice.stop(); startActivity(sid);
      set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "user", text: approved ? "Yes, go ahead." : "No, cancel it.", at: nowHM() }] }));
      try { handle(sid, await api<any>("/api/confirm", { method: "POST", json: { approved, confirm_id: confirmId, session_id: sid }, timeout: 70000 })); }
      catch (e: any) { stopActivity(); if (e instanceof AuthError) return; set((s) => ({ msgs: [...s.msgs, { id: uid(), role: "sys", text: "Something went wrong: " + (e?.message || e), at: nowHM() }], busy: false, ui: "idle" })); }
    },

    addTodo: async (t) => { await api("/api/todos", { method: "POST", json: { text: t } }); await get().refreshDash(); },
    toggleTodo: async (i) => { await api(`/api/todos/${i}/toggle`, { method: "POST" }); await get().refreshDash(); },
    addNote: async (t) => { await api("/api/notes", { method: "POST", json: { text: t } }); await get().refreshDash(); },
    addReminder: async (t, minutes) => { const r = await api<{ message: string }>("/api/reminders", { method: "POST", json: { text: t, minutes } }); get().toast(r.message); await get().refreshDash(); },

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
      try { const d = await api<{ url?: string; detail?: string }>("/api/google/start"); if (d.url) location.href = d.url; else get().toast(d.detail || "Google setup is incomplete."); }
      catch (e: any) { get().toast(e?.message || "Could not start Google sign-in."); }
    },
  };
});
export { apiRaw };

// Wake word only listens while the assistant is idle: re-evaluate whenever one of the relevant states changes.
useStore.subscribe((s, p) => {
  if (s.ui !== p.ui || s.busy !== p.busy || s.authed !== p.authed || s.ready !== p.ready || s.convoActive !== p.convoActive
    || s.settings.wake !== p.settings.wake || s.cfg !== p.cfg) s.syncWake();
});
