"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy, Loader2, Mic, MicOff, Plus, RotateCcw, SendHorizonal, Sparkles, Wrench } from "lucide-react";
import { useStore } from "@/lib/store";
import { resultFailed, toolInfo } from "@/lib/tools";
import { voice } from "@/lib/voice";
import { useStatus } from "./Shell";
import VoicePanel from "./Voice";
import { PendingNote } from "./Confirm";
import { Badge, Button, Dialog, IconButton, cn } from "./ui";
import type { Msg } from "@/lib/types";

async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok; } catch { return false; }
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false); const toast = useStore((s) => s.toast);
  return (
    <button type="button" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } else toast("Could not copy. Select the text and copy it manually."); }}
      aria-label={done ? "Copied" : "Copy response"} className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-primary-soft hover:text-primary-text">
      {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}{done ? "Copied" : "Copy"}
    </button>
  );
}

function Message({ m }: { m: Msg }) {
  const showTools = useStore((s) => s.settings.showTools);
  if (m.role === "user") return (
    <div className="flex justify-end">
      <div className="max-w-[88%] sm:max-w-[75%]">
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-white">{m.text}</div>
        <p className="mt-1 text-right text-xs text-muted"><span className="sr-only">You, </span>{m.at}</p>
      </div>
    </div>
  );
  const failed = m.role === "sys" || m.error;
  return (
    <div className="flex gap-2.5">
      <span className={cn("mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full", failed ? "bg-danger-soft text-danger-text" : "bg-primary-soft text-primary-text")} aria-hidden>{failed ? <AlertCircle size={16} /> : <Sparkles size={16} />}</span>
      <div className="min-w-0 max-w-[92%] sm:max-w-[80%]">
        <div className={cn("rounded-2xl rounded-tl-md border px-4 py-2.5 text-[15px] leading-relaxed shadow-card", failed ? "border-danger/40 bg-danger-soft text-danger-text" : "border-line bg-card")}>
          {failed && <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide">Request failed</p>}
          <p className="whitespace-pre-wrap break-words">{m.text}</p>
          {showTools && m.actions && m.actions.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Tools used">
              {m.actions.map((a, i) => { const bad = resultFailed(a.result); const info = toolInfo(a.tool); return (
                <li key={i}><span title={a.result} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium capitalize", bad ? "bg-danger-soft text-danger-text" : "bg-primary-soft text-primary-text")}>
                  {bad ? <AlertCircle size={12} aria-hidden /> : <Wrench size={12} aria-hidden />}{info.label}<span className="sr-only">{bad ? " failed" : " returned a result"}</span></span></li>); })}
            </ul>
          )}
          {m.pendingJob ? <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Loader2 size={12} className="animate-spin" aria-hidden /> Still running on your PC…</p> : null}
          {m.confirm && <PendingNote />}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted"><span><span className="sr-only">Assistant, </span>{m.at}</span>{!failed && m.text && <CopyButton text={m.text} />}</div>
      </div>
    </div>
  );
}

export default function Chat() {
  const { msgs, busy, interim, sessions, sid, newChat, resetChat, settings, cfg, send, draft, set, toggleMic, ui, mode, pcOnline, online } = useStore();
  const status = useStatus();
  const box = useRef<HTMLDivElement>(null); const end = useRef<HTMLDivElement>(null); const ta = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true); const [text, setText] = useState(""); const [resetOpen, setResetOpen] = useState(false);
  const title = sessions.find((s) => s.id === sid)?.title || "New conversation";
  const listening = ui === "listening"; const empty = msgs.length === 0;

  useEffect(() => { if (msgs.length === 0 && !busy) { box.current?.scrollTo({ top: 0 }); stick.current = true; return; } if (!stick.current) return; const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; end.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" }); }, [msgs.length, busy, interim]);
  useEffect(() => { if (draft) { setText(draft); set({ draft: "" }); setTimeout(() => { ta.current?.focus(); const l = ta.current?.value.length || 0; ta.current?.setSelectionRange(l, l); }, 0); } }, [draft, set]);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }, [text]);

  const submit = () => { const t = text.trim(); if (!t || busy) return; setText(""); void send(t); };
  const pcOk = online && (mode === "local" || pcOnline);
  const suggestions = [
    cfg.google_connected && "What's on my schedule today?", "Search Google for the latest tech news", pcOk && "Open Chrome", "Add a reminder in 30 minutes", "Save a note: ",
  ].filter(Boolean) as string[];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-2 sm:px-5">
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold">{title}</h1><p className="truncate text-xs text-muted" data-testid="status-line">{status.label}</p></div>
        <Button size="sm" icon={Plus} onClick={newChat}><span className="hidden sm:inline">New chat</span><span className="sr-only sm:hidden">New chat</span></Button>
        <Button size="sm" icon={RotateCcw} onClick={() => setResetOpen(true)} disabled={empty || busy}><span className="hidden sm:inline">Reset</span><span className="sr-only sm:hidden">Reset conversation</span></Button>
      </div>

      <div ref={box} role="log" aria-label="Conversation" onScroll={() => { const b = box.current!; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" data-testid="chat-log">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {empty && !busy ? (
            <div className="flex flex-col items-center gap-5 py-4">
              <VoicePanel variant="hero" />
              <div className="text-center"><h2 className="text-lg font-semibold">How can I help?</h2><p className="mt-1 text-sm text-muted">Speak, or type below. Risky actions always ask first.</p></div>
              <ul className="flex flex-wrap justify-center gap-2">{suggestions.map((s) => (
                <li key={s}><button type="button" onClick={() => (s.endsWith(": ") ? (setText(s), ta.current?.focus()) : void send(s))} className="min-h-[44px] rounded-full border border-line bg-card px-4 text-sm hover:border-primary/40 hover:bg-primary-soft">{s.replace(/: $/, "…")}</button></li>))}</ul>
            </div>
          ) : msgs.map((m) => <Message key={m.id} m={m} />)}
          {interim && <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-primary/50 px-4 py-2 text-sm italic text-muted">{interim}…</p></div>}
          {busy && (
            <div className="flex items-center gap-2.5" data-testid="working">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary-text" aria-hidden><Sparkles size={16} /></span>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-card px-4 py-2.5 text-sm text-muted shadow-card">
                <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>{status.label}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </div>

      <div className="border-t border-line bg-bg px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-2.5">
          {!empty && <VoicePanel variant="bar" />}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-card p-2 shadow-card focus-within:border-primary">
            <IconButton label={listening ? "Stop listening" : "Start voice input"} icon={listening ? MicOff : Mic} active={listening} aria-pressed={listening} onClick={() => void toggleMic()} disabled={!voice.canListen && !listening} />
            <textarea ref={ta} rows={1} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} aria-label="Message to the assistant" placeholder={listening ? "Listening…" : "Ask anything or give a command…"}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-1 py-3 text-[15px] outline-none placeholder:text-muted" />
            <Button variant="primary" onClick={submit} disabled={!text.trim() || busy} loading={busy} aria-label="Send message" className="w-11 px-0">{busy ? null : <SendHorizonal size={18} aria-hidden />}</Button>
          </div>
          <p className="px-1 text-xs text-muted">Enter to send · Shift+Enter for a new line{text.length > 3500 ? ` · ${4000 - text.length} characters left` : ""}</p>
        </div>
      </div>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="Reset this conversation?" description="The assistant forgets the context of this chat. Your notes, tasks, reminders and saved memory are not affected.">
        <div className="flex justify-end gap-2"><Button onClick={() => setResetOpen(false)} data-autofocus>Keep chat</Button><Button variant="danger" onClick={() => { setResetOpen(false); void resetChat(); }}>Reset</Button></div>
      </Dialog>
    </div>
  );
}
