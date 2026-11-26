"use client";
import { useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, Square, Ear } from "lucide-react";
import { useStore } from "@/lib/store";
import { voice } from "@/lib/voice";
import Orb, { ORB_LABEL, useOrbState } from "./Orb";
import { Badge, Button, Switch, cn } from "./ui";

/** Live level bars from the real audio level (mic while listening, speech while speaking). Flat when nothing is active. */
export function Wave({ active, width = 160, height = 28 }: { active: boolean; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = width * dpr; cv.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, t = 0;
    const N = 24, gap = 3, bw = (width - gap * (N - 1)) / N;
    const draw = () => {
      t += 0.12; const col = getComputedStyle(document.documentElement).getPropertyValue("--primary-text").trim().replace(/ /g, ",");
      const lv = active ? voice.level() : 0; ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < N; i++) {
        const h = Math.max(3, (active ? 4 + lv * (height - 4) * (0.45 + 0.55 * Math.abs(Math.sin(t + i * 0.7))) : 3));
        ctx.fillStyle = `rgba(${col},${active ? 0.9 : 0.35})`; const x = i * (bw + gap);
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x, (height - h) / 2, bw, h, 2) : ctx.rect(x, (height - h) / 2, bw, h); ctx.fill();
      }
      if (active && !reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [active, width, height]);
  return <canvas ref={ref} style={{ width, height }} aria-hidden />;
}

const HELP: Record<string, string> = {
  denied: "The browser blocked the microphone. Click the lock icon in the address bar, allow the microphone for this site, then press the mic button.",
  unavailable: "No usable microphone or speech recognition was found. Connect a microphone, or use Chrome or Edge on localhost or https.",
  error: "Speech recognition hit an error (often a lost connection). Try the mic button again.",
};

/** Voice controls. `hero` is the big empty-chat version, `bar` the compact strip above the messages. */
export default function VoicePanel({ variant = "bar" }: { variant?: "hero" | "bar" }) {
  const { ui, toggleMic, settings, setSettings, wakeActive, wakeNote, cfg, voiceIssue, set } = useStore();
  const st = useOrbState(); const listening = ui === "listening"; const speaking = ui === "speaking";
  const canListen = voice.canListen; const phrase = settings.wakeWord || cfg.wake_word || "hey agent";
  const hero = variant === "hero";
  const sub = listening ? "Microphone is on — speak now" : speaking ? "Playing the reply" : st === "processing" ? "Working on it…" : st === "wake" ? `Say “${phrase}”` : voiceIssue ? "" : canListen ? "Tap the mic to talk" : "Voice input needs Chrome or Edge";
  return (
    <section aria-label="Voice assistant" className={cn("border border-line bg-card shadow-card", hero ? "mx-auto w-full max-w-md rounded-2xl p-5 text-center" : "rounded-2xl px-3 py-2.5")}>
      <div className={cn(hero ? "flex flex-col items-center gap-3" : "flex flex-wrap items-center gap-3")}>
        <Orb size={hero ? 148 : 56} onClick={() => void toggleMic()} label={listening ? "Stop listening" : "Start listening"} />
        <div className={cn("min-w-0", hero ? "" : "flex-1")}>
          <p className="text-sm font-semibold" data-testid="orb-state">{ORB_LABEL[st]}</p>
          {sub && <p className="text-xs text-muted">{sub}</p>}
          {!hero && (listening || speaking) && <div className="mt-1"><Wave active width={120} height={18} /></div>}
        </div>
        {hero && (listening || speaking) && <Wave active width={180} height={28} />}
        <div className={cn("flex items-center gap-1", hero ? "justify-center" : "ml-auto")}>
          <Button variant={listening ? "danger" : "primary"} size="sm" icon={listening ? MicOff : Mic} onClick={() => void toggleMic()} disabled={!canListen && !listening} aria-pressed={listening}>
            {listening ? "Stop" : "Talk"}
          </Button>
          {speaking && <Button size="sm" icon={Square} onClick={() => { voice.stop(); set({ ui: "idle" }); }}>Stop audio</Button>}
          <Button size="sm" icon={settings.speak ? Volume2 : VolumeX} aria-pressed={!settings.speak}
            onClick={() => { setSettings({ speak: !settings.speak }); if (settings.speak) { voice.stop(); set({ ui: "idle" }); } }}
            aria-label={settings.speak ? "Mute voice replies" : "Unmute voice replies"}>{hero ? (settings.speak ? "Mute" : "Unmute") : null}</Button>
        </div>
      </div>
      {voiceIssue && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-left text-xs text-danger-text">{HELP[voiceIssue]}</p>}
      <div className={cn("mt-3 flex items-center gap-3 border-t border-line pt-3 text-left", !hero && "hidden sm:flex")}>
        <Ear size={16} className="text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Wake word “{phrase}”</p>
          <p className="text-xs text-muted">{!canListen ? "Needs Chrome or Edge" : wakeNote ? wakeNote : settings.wake ? (wakeActive ? "Active — listening only while idle" : "On, but not listening right now") : "Off"}</p>
        </div>
        {settings.wake && <Badge tone={wakeActive ? "success" : "neutral"}>{wakeActive ? "Active" : "Paused"}</Badge>}
        <Switch on={settings.wake} onChange={(v) => setSettings({ wake: v })} label="Listen for the wake word" disabled={!canListen} />
      </div>
    </section>
  );
}
