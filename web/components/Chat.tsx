"use client";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, ShieldAlert, Wrench, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Msg } from "@/lib/types";

const prettyTool = (t: string) => t.replace(/_/g, " ");

function ConfirmCard({ m }: { m: Msg }) {
  const { confirm, busy } = useStore(); const c = m.confirm!;
  const args = Object.entries(c.args || {}).filter(([, v]) => v !== "" && v != null);
  return (
    <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/[.07] p-4" role="group" aria-label="Confirmation required">
      <div className="flex items-center gap-2 text-amber-300 text-sm font-medium"><ShieldAlert size={16} /> Needs your approval · {prettyTool(c.tool)}</div>
      {args.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          {args.map(([k, v]) => (<><dt key={k + "k"} className="text-slate-500">{k}</dt><dd key={k + "v"} className="break-words text-slate-200">{typeof v === "string" ? v : JSON.stringify(v)}</dd></>))}
        </dl>
      )}
      <div className="mt-3 flex gap-2">
        <button disabled={busy} onClick={() => void confirm(true)} className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm disabled:opacity-50"><Check size={15} /> Confirm</button>
        <button disabled={busy} onClick={() => void confirm(false)} className="flex items-center gap-1.5 rounded-lg hairline bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"><X size={15} /> Cancel</button>
      </div>
    </motion.div>
  );
}

export default function Chat() {
  const { msgs, busy, activity, settings, interim } = useStore();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs.length, busy, interim]);
  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4" role="log" aria-live="polite" data-testid="chat-log">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "sys" ? (
                <div className="mx-auto rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-300">{m.text}</div>
              ) : (
                <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${m.role === "user" ? "bg-gradient-to-br from-accent to-accent2 text-ink-950 font-medium rounded-br-md" : "glass rounded-bl-md"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {settings.showTools && m.actions && m.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.map((a, i) => (<span key={i} title={a.result} className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] text-slate-300"><Wrench size={10} />{prettyTool(a.tool)}</span>))}
                    </div>
                  )}
                  {m.pendingJob ? <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Still running on your PC…</p> : null}
                  {m.confirm && <ConfirmCard m={m} />}
                  <p className={`mt-1 text-[10px] ${m.role === "user" ? "text-ink-950/60" : "text-slate-500"}`}>{m.at}</p>
                </div>
              )}
            </motion.div>
          ))}
          {interim && <motion.div key="interim" initial={{ opacity: 0 }} animate={{ opacity: .7 }} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-br-md border border-accent/30 px-4 py-2 text-sm italic text-slate-300">{interim}…</div></motion.div>}
          {busy && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex">
              <div className="glass flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-300" data-testid="working">
                <span className="flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${i * .15}s` }} />)}</span>
                {activity.steps.length ? activity.steps[activity.steps.length - 1].label : "Thinking"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={end} />
      </div>
    </div>
  );
}
