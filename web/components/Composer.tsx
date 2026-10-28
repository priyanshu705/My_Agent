"use client";
import { useState } from "react";
import { Mic, MicOff, SendHorizonal, Square } from "lucide-react";
import { useStore } from "@/lib/store";
import { voice } from "@/lib/voice";

const SUGGEST = ["What's on my schedule today?", "Search the latest tech news", "Open redBus and find buses Indore to Mumbai", "Add a reminder in 30 minutes"];

export default function Composer() {
  const { send, busy, ui, toggleMic, msgs, voiceStatus } = useStore();
  const [text, setText] = useState("");
  const submit = () => { const t = text.trim(); if (!t) return; setText(""); void send(t); };
  const listening = ui === "listening";
  return (
    <div className="px-3 sm:px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
      <div className="mx-auto max-w-2xl">
        {msgs.length <= 1 && (
          <div className="mb-2 flex flex-wrap justify-center gap-2">
            {SUGGEST.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-full hairline bg-white/[.04] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white">{s}</button>)}
          </div>
        )}
        {voiceStatus && <p className="mb-1 text-center text-[11px] text-amber-300/80">{voiceStatus}</p>}
        <div className="glass-strong flex items-end gap-2 rounded-2xl p-2 focus-within:border-accent/50 transition">
          <button onClick={() => void toggleMic()} aria-label={listening ? "Stop listening" : "Start voice"} aria-pressed={listening} disabled={!voice.canListen && !listening}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${listening ? "bg-rose-500/90 text-white animate-pulse" : "bg-white/[.06] hover:bg-white/10 text-slate-200"} disabled:opacity-40`}>
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : "Ask anything or give a command…"} aria-label="Message"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-1 py-3 text-[15px] outline-none placeholder:text-slate-500" />
          {busy ? (
            <button onClick={() => voice.stop()} aria-label="Stop speaking" className="grid h-11 w-11 place-items-center rounded-xl bg-white/[.06]"><Square size={16} /></button>
          ) : (
            <button onClick={submit} disabled={!text.trim()} aria-label="Send" className="btn-primary grid h-11 w-11 place-items-center rounded-xl disabled:opacity-40"><SendHorizonal size={18} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
