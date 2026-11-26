// Voice engine: natural cloud TTS (Gemini via /api/tts) with browser fallback, plus speech recognition and live audio levels for the orb.
import { apiRaw } from "./api";

type SR = any;
const w = (typeof window !== "undefined" ? window : {}) as any;

export const CLOUD_VOICES: [string, string][] = [
  ["Sulafat", "Sulafat · female, warm (recommended)"],
  ["Achernar", "Achernar · female, soft"],
  ["Aoede", "Aoede · female, breezy"],
  ["Vindemiatrix", "Vindemiatrix · female, gentle"],
  ["Leda", "Leda · female, youthful"],
  ["Kore", "Kore · female, firm"],
  ["Charon", "Charon · male, informative"],
  ["Orus", "Orus · male, firm"],
];

class VoiceEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private data: Uint8Array | null = null;
  private src: AudioBufferSourceNode | null = null;
  private token = 0;
  private cache = new Map<string, AudioBuffer>();
  private cacheBytes = 0;
  private listenTok = 0;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private downUntil = 0;
  lastStatus = "";
  // recognition
  private rec: SR | null = null;
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micData: Uint8Array | null = null;

  get canListen(): boolean { return !!(w.SpeechRecognition || w.webkitSpeechRecognition) && (typeof window === "undefined" || window.isSecureContext); }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (w.AudioContext || w.webkitAudioContext)();
      this.analyser = this.ctx!.createAnalyser(); this.analyser.fftSize = 256;
      this.analyser.connect(this.ctx!.destination);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.ctx!.state === "suspended") this.ctx!.resume().catch(() => {});
    return this.ctx!;
  }
  unlock() { try { this.ensureCtx(); } catch {} }

  /** 0..1 loudness of whatever is currently playing (speech) or being heard (mic). */
  level(): number {
    const read = (a: AnalyserNode | null, d: Uint8Array | null) => {
      if (!a || !d) return 0; a.getByteFrequencyData(d as any);
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i]; return Math.min(1, s / d.length / 90);
    };
    return Math.max(this.src ? read(this.analyser, this.data) : 0, read(this.micAnalyser, this.micData));
  }

  stop() {
    this.token++;
    try { if (this.src) { this.src.onended = null; this.src.stop(); } } catch {}
    this.src = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  private clean(t: string) {
    return t.replace(/https?:\/\/\S+/g, " link ").replace(/[*_#`>~|]/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
  }
  private chunk(t: string, first = 150, max = 260): string[] {
    const parts = t.match(/[^.!?।\n]+[.!?।]*\s*/g) || [t];
    const out: string[] = []; let cur = "";
    for (const p of parts) {
      const limit = out.length === 0 ? first : max;
      if (cur && (cur + p).length > limit) { out.push(cur.trim()); cur = p; } else cur += p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 8);
  }

  private async clip(text: string, voice: string): Promise<AudioBuffer> {
    const key = voice + "|" + text;
    const hit = this.cache.get(key); if (hit) return hit;
    const r = await apiRaw("/api/tts", { method: "POST", json: { text, voice }, timeout: 22000 });
    if (!r.ok) { let d: any = {}; try { d = await r.json(); } catch {} throw new Error(d.detail || "HTTP " + r.status); }
    const buf = await this.ensureCtx().decodeAudioData(await r.arrayBuffer());
    // bound the cache by memory (decoded float32 samples), not just by entry count
    const bytes = (b: AudioBuffer) => b.length * b.numberOfChannels * 4;
    this.cacheBytes += bytes(buf);
    this.cache.set(key, buf);
    while ((this.cache.size > 40 || this.cacheBytes > 24 * 1024 * 1024) && this.cache.size > 1) {
      const k = this.cache.keys().next().value as string;
      this.cacheBytes -= bytes(this.cache.get(k)!);
      this.cache.delete(k);
    }
    return buf;
  }
  private play(buf: AudioBuffer, rate: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      if (token !== this.token) return resolve();
      const ctx = this.ensureCtx(); const src = ctx.createBufferSource();
      src.buffer = buf; src.playbackRate.value = Math.min(1.4, Math.max(0.8, rate || 1));
      src.connect(this.analyser!);
      src.onended = () => { if (this.src === src) this.src = null; resolve(); };
      this.src = src; src.start();
    });
  }
  private browserSpeak(text: string, rate: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === "undefined" || token !== this.token) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const vs = speechSynthesis.getVoices();
      const hindi = /[ऀ-ॿ]/.test(text);
      const v = (hindi && vs.find((x) => x.lang.startsWith("hi")))
        || vs.find((x) => /natural|neural|online/i.test(x.name) && x.lang.startsWith("en"))
        || vs.find((x) => /google/i.test(x.name) && x.lang.startsWith("en")) || vs.find((x) => x.lang.startsWith("en"));
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = rate || 1;
      let done = false; let timer: ReturnType<typeof setTimeout> | null = null;
      const fin = () => { if (!done) { done = true; if (timer) clearTimeout(timer); resolve(); } };
      u.onend = u.onerror = fin; timer = setTimeout(fin, 2500 + text.length * 90);
      speechSynthesis.speak(u);
    });
  }

  /** Speaks text. Resolves when finished or interrupted. Never throws. */
  async speak(text: string, o: { voice: string; rate: number }): Promise<string> {
    const clean = this.clean(text); if (!clean) return "";
    this.stop(); const token = this.token;
    let status = "";
    if (Date.now() > this.downUntil) {
      try {
        const chunks = this.chunk(clean);
        let next = this.clip(chunks[0], o.voice);
        for (let i = 0; i < chunks.length; i++) {
          const buf = await next;
          if (token !== this.token) return "";
          if (i + 1 < chunks.length) { next = this.clip(chunks[i + 1], o.voice); next.catch(() => {}); }
          await this.play(buf, o.rate, token);
          if (token !== this.token) return "";
        }
        this.lastStatus = "Natural voice ✓"; return this.lastStatus;
      } catch (e: any) {
        if (token !== this.token) return "";
        this.downUntil = Date.now() + 45000;
        status = "Natural voice unavailable (" + (e?.message || e) + "). Using the fallback voice.";
      }
    }
    if (token === this.token) await this.browserSpeak(clean, o.rate, token);
    this.lastStatus = status; return status;
  }
  resetFailure() { this.downUntil = 0; }

  // ---- recognition ----
  async listen(o: { lang: string; onInterim: (t: string) => void; onEnd: (finalText: string, err: string) => void }): Promise<boolean> {
    const SRC = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SRC) return false;
    this.stopListening();
    const lt = ++this.listenTok;
    void this.openMic(lt);
    const rec: SR = new SRC();
    rec.lang = o.lang; rec.interimResults = true; rec.continuous = false;
    let finalText = "", interim = "", err = "";
    rec.onresult = (e: any) => {
      if (lt !== this.listenTok) return; // stale callback from a listener that was already replaced
      finalText = ""; interim = "";
      for (let i = 0; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
      o.onInterim((finalText + " " + interim).trim());
    };
    rec.onerror = (e: any) => { if (e.error !== "no-speech" && e.error !== "aborted") err = e.error; };
    rec.onend = () => { if (this.rec === rec) this.rec = null; this.closeMic(); o.onEnd((finalText || interim).trim(), err); };
    this.rec = rec;
    try { rec.start(); return true; } catch { this.rec = null; this.closeMic(); return false; }
  }
  stopListening() { this.listenTok++; const r = this.rec; this.rec = null; if (r) { r.onend = null; try { r.abort(); } catch {} } this.closeMic(); }
  // ---- wake word (browser engine): continuous recognizer that waits for the wake phrase ----
  private wakeRec: SR | null = null;
  private wakeTok = 0;
  get waking() { return !!this.wakeRec; }
  static wakeVariants(word: string): string[] {
    const w = VoiceEngine.norm(word || "hey agent"), last = w.split(" ").pop() || w;
    return [w, w.replace("hey", "hi"), w.replace("hey", "he"), w.replace("hey", "hay"), "हे एजेंट", "हाय एजेंट", "एजेंट", last].filter(Boolean);
  }
  static norm(t: string) { return t.toLowerCase().replace(/[.,!?।]/g, "").trim(); }
  /** Starts waiting for the wake phrase. onHit gets any words spoken right after it ("hey agent open chrome" -> "open chrome"). */
  startWake(o: { lang: string; word: string; onHit: (after: string) => void }): boolean {
    const SRC = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SRC || this.wakeRec) return !!this.wakeRec;
    const tok = ++this.wakeTok; const variants = VoiceEngine.wakeVariants(o.word);
    const rec: SR = new SRC();
    rec.lang = o.lang; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e: any) => {
      if (tok !== this.wakeTok) return;
      const t = VoiceEngine.norm(e.results[e.results.length - 1][0].transcript);
      const hit = variants.find((v) => t.includes(v)); if (!hit) return;
      const after = t.slice(t.indexOf(hit) + hit.length).trim();
      this.stopWake(); o.onHit(after);
    };
    rec.onerror = () => {};
    rec.onend = () => { // recognizers stop on silence: restart unless we were stopped on purpose
      if (tok !== this.wakeTok) return; this.wakeRec = null;
      setTimeout(() => { if (tok === this.wakeTok && !this.wakeRec) this.startWake(o); }, 400);
    };
    this.wakeRec = rec;
    try { rec.start(); return true; } catch { this.wakeRec = null; return false; }
  }
  stopWake() { this.wakeTok++; const r = this.wakeRec; this.wakeRec = null; if (r) { r.onend = null; try { r.abort(); } catch {} } }

  endListening() { try { this.rec?.stop(); } catch {} }
  get listening() { return !!this.rec; }

  private async openMic(tok: number) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (tok !== this.listenTok || !this.rec) { stream.getTracks().forEach((t) => t.stop()); return; } // listener ended while waiting for permission
      this.micStream = stream;
      const ctx = this.ensureCtx(); const an = ctx.createAnalyser(); an.fftSize = 256;
      this.micSource = ctx.createMediaStreamSource(stream); this.micSource.connect(an);
      this.micAnalyser = an; this.micData = new Uint8Array(an.frequencyBinCount);
    } catch { /* level meter is optional */ }
  }
  private closeMic() {
    try { this.micSource?.disconnect(); } catch {} this.micSource = null;
    this.micStream?.getTracks().forEach((t) => t.stop()); this.micStream = null; this.micAnalyser = null; this.micData = null;
  }
}

export const voice = new VoiceEngine();
