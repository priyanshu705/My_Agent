"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, CheckCircle2, Wrench, Monitor, Sparkles, Loader2, CircleDot } from "lucide-react";
import { useStore } from "@/lib/store";

const ICON: Record<string, any> = { understand: Sparkles, think: Brain, tool: Wrench, pc: Monitor, pc_tool: Monitor, answer: CheckCircle2, done: CheckCircle2 };

export default function Timeline() {
  const a = useStore((s) => s.activity); const busy = useStore((s) => s.busy);
  const live = busy || !a.done;
  const steps = a.steps;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">What I'm doing</h3>
        {live && <Loader2 size={14} className="animate-spin text-accent" aria-label="Working" />}
      </div>
      {steps.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing running. Ask me something and you'll see every step here, live.</p>
      ) : (
        <ol className="relative space-y-3 pl-1" data-testid="timeline">
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-accent/50 via-white/10 to-transparent" />
          <AnimatePresence initial={false}>
            {steps.map((s, i) => {
              const last = i === steps.length - 1; const Ic = ICON[s.phase] || CircleDot; const running = live && last;
              return (
                <motion.li key={i + s.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="relative flex items-start gap-3">
                  <span className={`z-10 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border ${running ? "border-accent bg-accent/15 text-accent" : "border-white/10 bg-ink-800 text-slate-400"}`}>
                    {running ? <span className="relative flex h-full w-full items-center justify-center"><i className="absolute h-full w-full rounded-full border border-accent animate-pulseRing" /><Ic size={14} /></span> : <Ic size={14} />}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`truncate text-sm ${running ? "text-white" : "text-slate-300"}`}>{s.label}</p>
                    <p className="font-mono text-[10px] text-slate-500">{(s.ms / 1000).toFixed(1)}s{s.tool ? ` · ${s.tool}` : ""}</p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
