"use client";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { Mic, Brain, Globe, Mail, CalendarDays, ListTodo, Monitor, MessageSquareText, type LucideIcon } from "lucide-react";

type N = { id: string; x: number; y: number; label: string; sub: string; Icon: LucideIcon };
const NODES: N[] = [
  { id: "you", x: 50, y: 34, label: "You", sub: "voice · text", Icon: Mic },
  { id: "brain", x: 200, y: 150, label: "Brain", sub: "Gemini", Icon: Brain },
  { id: "web", x: 350, y: 34, label: "Web", sub: "live search", Icon: Globe },
  { id: "mail", x: 350, y: 118, label: "Mail", sub: "Gmail", Icon: Mail },
  { id: "cal", x: 350, y: 202, label: "Calendar", sub: "events", Icon: CalendarDays },
  { id: "tasks", x: 350, y: 286, label: "Tasks", sub: "notes · reminders", Icon: ListTodo },
  { id: "pc", x: 200, y: 290, label: "Your PC", sub: "Chrome · apps", Icon: Monitor },
  { id: "ans", x: 50, y: 250, label: "Answer", sub: "text + voice", Icon: MessageSquareText },
];
const EDGES: [string, string][] = [["you", "brain"], ["brain", "web"], ["brain", "mail"], ["brain", "cal"], ["brain", "tasks"], ["brain", "pc"], ["brain", "ans"]];
const N_BY = Object.fromEntries(NODES.map((n) => [n.id, n]));

function toolNode(tool?: string): string | null {
  if (!tool) return null;
  if (/search|web|news|weather/.test(tool)) return "web";
  if (/mail|email|gmail|whatsapp/.test(tool)) return "mail";
  if (/calendar|event|schedule/.test(tool)) return "cal";
  if (/todo|task|note|remind|memory|remember/.test(tool)) return "tasks";
  if (/browser|pc|run_on_pc|open|file|app|system/.test(tool)) return "pc";
  return "tasks";
}

export default function FlowGraph() {
  const a = useStore((s) => s.activity); const pcOnline = useStore((s) => s.pcOnline); const busy = useStore((s) => s.busy);
  const live = busy || !a.done;
  const active = new Set<string>();
  if (live) {
    active.add("you");
    if (["think", "tool", "pc", "pc_tool", "understand"].includes(a.phase)) active.add("brain");
    if (a.phase === "tool" || a.phase === "pc_tool") { const n = toolNode(a.tool); if (n) active.add(n); }
    if (a.phase === "pc" || a.phase === "pc_tool") active.add("pc");
  }
  if (a.done && a.phase === "done") { active.add("brain"); active.add("ans"); }
  const edgeActive = (f: string, t: string) => active.has(f) && active.has(t);
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">Live data flow</h3>
        <span className={`flex items-center gap-1.5 text-[11px] ${live ? "text-accent" : "text-slate-500"}`}><i className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent animate-pulse" : "bg-slate-600"}`} />{live ? "Working" : "Idle"}</span>
      </div>
      <svg viewBox="0 0 420 345" className="w-full" role="img" aria-label="Live data flow diagram">
        <defs>
          <linearGradient id="eg" x1="0" x2="1"><stop offset="0" stopColor="rgb(var(--accent))" /><stop offset="1" stopColor="rgb(var(--accent2))" /></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {EDGES.map(([f, t]) => {
          const A = N_BY[f], B = N_BY[t]; const on = edgeActive(f, t); const id = `e-${f}-${t}`;
          const d = `M${A.x} ${A.y} C ${A.x} ${(A.y + B.y) / 2}, ${B.x} ${(A.y + B.y) / 2}, ${B.x} ${B.y}`;
          return (
            <g key={id}>
              <path id={id} d={d} fill="none" stroke={on ? "url(#eg)" : "rgba(148,163,184,.18)"} strokeWidth={on ? 2 : 1.2} strokeDasharray={on ? "5 5" : "2 6"}>
                {on && <animate attributeName="stroke-dashoffset" from="20" to="0" dur=".8s" repeatCount="indefinite" />}
              </path>
              {on && [0, .5].map((o) => (
                <circle key={o} r="3.5" fill="rgb(var(--accent))" filter="url(#glow)">
                  <animateMotion dur="1.2s" begin={`${o * 1.2}s`} repeatCount="indefinite"><mpath href={`#${id}`} /></animateMotion>
                </circle>
              ))}
            </g>
          );
        })}
        {NODES.map((n) => {
          const on = active.has(n.id); const off = n.id === "pc" && !pcOnline;
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              {on && <circle r="26" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5"><animate attributeName="r" from="22" to="40" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" from=".7" to="0" dur="1.4s" repeatCount="indefinite" /></circle>}
              <motion.circle r="22" initial={false} animate={{ scale: on ? 1.12 : 1 }} fill={on ? "rgba(34,211,238,.14)" : "rgba(15,23,42,.9)"} stroke={on ? "rgb(var(--accent))" : "rgba(148,163,184,.3)"} strokeWidth={on ? 2 : 1.2} opacity={off ? .45 : 1} />
              <foreignObject x="-11" y="-11" width="22" height="22"><div className={`grid h-[22px] w-[22px] place-items-center ${on ? "text-accent" : "text-slate-400"}`}><n.Icon size={15} /></div></foreignObject>
              <text y="38" textAnchor="middle" className="fill-slate-200" fontSize="10.5" fontWeight="600">{n.label}</text>
              <text y="49" textAnchor="middle" className="fill-slate-500" fontSize="8.5">{n.id === "pc" ? (pcOnline ? "online · Chrome" : "offline") : n.sub}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
