"use client";
import { useMemo, useState } from "react";
import { AlertCircle, Brain, CheckCircle2, ChevronDown, CircleDot, Globe, ListTodo, Loader2, Mail, CalendarDays, Monitor, Mic, MessageSquareText, ShieldAlert, Sparkles, Workflow, Wrench, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { buildLog } from "@/lib/activity";
import { CATEGORY_LABEL, RISK_LABEL, describeArgs, toolInfo, type Category } from "@/lib/tools";
import type { ActionLog } from "@/lib/types";
import { useStatus } from "./Shell";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, cn } from "./ui";

const CATS = Object.keys(CATEGORY_LABEL) as Category[];

function ExecutionCard({ a }: { a: ActionLog }) {
  const [open, setOpen] = useState(false); const info = toolInfo(a.tool); const rows = describeArgs(a.args || {});
  const tone = a.status === "failed" ? "danger" : a.status === "pending" ? "warning" : "success";
  const Icon = a.status === "failed" ? AlertCircle : a.status === "pending" ? ShieldAlert : CheckCircle2;
  return (
    <li><Card as="article" className="p-3.5">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg", a.status === "failed" ? "bg-danger-soft text-danger-text" : a.status === "pending" ? "bg-warning-soft text-warning-text" : "bg-success-soft text-success-text")}><Icon size={17} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-sm font-semibold capitalize">{info.label}</h3>
            <Badge tone={tone}>{a.status === "failed" ? "Failed" : a.status === "pending" ? "Pending approval" : "Completed"}</Badge></div>
          <p className="mt-0.5 text-xs text-muted">{CATEGORY_LABEL[info.category]} · {RISK_LABEL[info.risk]} · {a.at}</p>
          <p className={cn("mt-2 break-words text-sm", a.status === "failed" ? "text-danger-text" : "text-ink")}>{a.result || "No result text returned."}</p>
          {rows.length > 0 && (<>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-primary-text hover:underline">
              <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} aria-hidden />{open ? "Hide" : "Show"} what was sent</button>
            {open && <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-lg bg-bg px-3 py-2 text-xs">{rows.map((r) => <div key={r.label} className="contents"><dt className="text-muted">{r.label}</dt><dd className="break-words">{r.value}</dd></div>)}</dl>}
          </>)}
        </div>
      </div>
    </Card></li>
  );
}

const ICON: Record<string, LucideIcon> = { understand: Sparkles, think: Brain, tool: Wrench, pc: Monitor, pc_tool: Monitor, answer: CheckCircle2, done: CheckCircle2 };
function Timeline() {
  const a = useStore((s) => s.activity); const busy = useStore((s) => s.busy); const live = busy || !a.done;
  return (
    <Card className="p-4">
      <SectionTitle right={live ? <Loader2 size={16} className="animate-spin text-primary-text" role="img" aria-label="Working" /> : undefined}>Steps of the current request</SectionTitle>
      {a.steps.length === 0 ? <p className="py-4 text-center text-sm text-muted">Nothing running. Ask something and each step appears here as it happens.</p> : (
        <ol className="relative space-y-3" data-testid="timeline">
          <span className="absolute bottom-3 left-[17px] top-3 w-px bg-line" aria-hidden />
          {a.steps.map((s, i) => { const last = i === a.steps.length - 1; const Ic = ICON[s.phase] || CircleDot; const running = live && last; return (
            <motion.li key={i + s.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative flex items-start gap-3">
              <span className={cn("z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border", running ? "border-primary bg-primary-soft text-primary-text" : "border-line bg-card text-muted")}>{running ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Ic size={15} aria-hidden />}</span>
              <div className="min-w-0 pt-1"><p className={cn("truncate text-sm", running && "font-medium")}>{s.label}{running && <span className="sr-only"> (in progress)</span>}</p><p className="text-xs text-muted">{(s.ms / 1000).toFixed(1)}s{s.tool ? ` · ${toolInfo(s.tool).label}` : ""}</p></div>
            </motion.li>); })}
        </ol>)}
    </Card>
  );
}

type N = { id: string; x: number; y: number; label: string; sub: string; Icon: LucideIcon };
const NODES: N[] = [
  { id: "you", x: 50, y: 34, label: "You", sub: "voice · text", Icon: Mic }, { id: "brain", x: 200, y: 150, label: "Brain", sub: "AI model", Icon: Brain },
  { id: "web", x: 350, y: 34, label: "Web", sub: "search", Icon: Globe }, { id: "mail", x: 350, y: 118, label: "Mail", sub: "Gmail · WhatsApp", Icon: Mail },
  { id: "cal", x: 350, y: 202, label: "Calendar", sub: "events", Icon: CalendarDays }, { id: "tasks", x: 350, y: 286, label: "Memory", sub: "notes · reminders", Icon: ListTodo },
  { id: "pc", x: 200, y: 290, label: "Your PC", sub: "apps · browser", Icon: Monitor }, { id: "ans", x: 50, y: 250, label: "Answer", sub: "text + voice", Icon: MessageSquareText },
];
const EDGES: [string, string][] = [["you", "brain"], ["brain", "web"], ["brain", "mail"], ["brain", "cal"], ["brain", "tasks"], ["brain", "pc"], ["brain", "ans"]];
const N_BY = Object.fromEntries(NODES.map((n) => [n.id, n]));
const nodeFor = (t?: string) => { const c = toolInfo(t || "").category; return c === "web" ? "web" : c === "gmail" || c === "whatsapp" ? "mail" : c === "calendar" ? "cal" : c === "memory" ? "tasks" : "pc"; };

function FlowGraph() {
  const a = useStore((s) => s.activity); const pcOnline = useStore((s) => s.pcOnline); const busy = useStore((s) => s.busy); const live = busy || !a.done;
  const active = new Set<string>();
  if (live) { active.add("you"); if (["think", "tool", "pc", "pc_tool", "understand"].includes(a.phase)) active.add("brain"); if (a.phase === "tool" || a.phase === "pc_tool") active.add(nodeFor(a.tool)); if (a.phase === "pc" || a.phase === "pc_tool") active.add("pc"); }
  if (a.done && a.phase === "done") { active.add("brain"); active.add("ans"); }
  return (
    <Card className="p-3">
      <SectionTitle right={<Badge tone={live ? "info" : "neutral"}>{live ? "Working" : "Idle"}</Badge>}>Data flow</SectionTitle>
      <svg viewBox="0 0 420 345" className="w-full" role="img" aria-label={`Data flow diagram. ${live ? "The assistant is working." : "Idle."}`}>
        {EDGES.map(([f, t]) => { const A = N_BY[f], B = N_BY[t]; const on = active.has(f) && active.has(t); const d = `M${A.x} ${A.y} C ${A.x} ${(A.y + B.y) / 2}, ${B.x} ${(A.y + B.y) / 2}, ${B.x} ${B.y}`;
          return <path key={f + t} d={d} fill="none" stroke={on ? "rgb(var(--primary))" : "rgb(var(--border))"} strokeWidth={on ? 2 : 1.5} strokeDasharray={on ? "5 5" : "3 5"}>{on && <animate attributeName="stroke-dashoffset" from="20" to="0" dur=".8s" repeatCount="indefinite" />}</path>; })}
        {NODES.map((n) => { const on = active.has(n.id); const off = n.id === "pc" && !pcOnline; return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={off ? 0.5 : 1}>
            <circle r="23" fill={on ? "rgb(var(--primary-soft))" : "rgb(var(--card))"} stroke={on ? "rgb(var(--primary))" : "rgb(var(--border))"} strokeWidth={on ? 2 : 1.5} />
            <foreignObject x="-11" y="-11" width="22" height="22"><div className={cn("grid h-[22px] w-[22px] place-items-center", on ? "text-primary-text" : "text-muted")}><n.Icon size={15} aria-hidden /></div></foreignObject>
            <text y="40" textAnchor="middle" fontSize="11" fontWeight="600" fill="rgb(var(--text))">{n.label}</text>
            <text y="52" textAnchor="middle" fontSize="9" fill="rgb(var(--muted))">{n.id === "pc" ? (pcOnline ? "online" : "offline") : n.sub}</text>
          </g>); })}
      </svg>
    </Card>
  );
}

export default function Automation() {
  const { msgs, go, activity, busy } = useStore(); const status = useStatus();
  const [cat, setCat] = useState<Category | "all">("all");
  const log = useMemo(() => buildLog(msgs), [msgs]);
  const counts = useMemo(() => { const c: Partial<Record<Category, number>> = {}; log.forEach((a) => { const k = toolInfo(a.tool).category; c[k] = (c[k] || 0) + 1; }); return c; }, [log]);
  const shown = cat === "all" ? log : log.filter((a) => toolInfo(a.tool).category === cat);
  const lastStep = activity.steps[activity.steps.length - 1]; const live = busy || !activity.done;
  const failed = log.filter((a) => a.status === "failed").length;
  return (
    <div>
      <PageHeader title="Automation center" subtitle="Every tool the assistant used in this conversation, and what the backend reported back." />
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("grid h-11 w-11 place-items-center rounded-xl", live ? "bg-primary-soft text-primary-text" : "bg-bg text-muted")}>{live ? <Loader2 className="animate-spin" size={20} aria-hidden /> : <Workflow size={20} aria-hidden />}</span>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Current task</p>
            <p className="truncate text-sm font-medium" data-testid="current-task">{live ? (lastStep?.label || status.label) : "Nothing running"}</p>
            <p className="text-xs text-muted">{live ? `${status.label}${lastStep ? ` · step ${activity.steps.length} · ${(lastStep.ms / 1000).toFixed(1)}s` : ""} · progress is not reported by the backend` : "Idle — ask the assistant to do something."}</p></div>
          <Badge tone={status.tone}>{status.label}</Badge>
          <div className="flex gap-2 text-xs"><Badge tone="success">{log.filter((a) => a.status === "completed").length} completed</Badge><Badge tone={failed ? "danger" : "neutral"}>{failed} failed</Badge></div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div role="group" aria-label="Filter by category" className="mb-3 flex flex-wrap gap-1.5">
            {(["all", ...CATS] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                className={cn("min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] rounded-full border px-3 text-xs font-medium", cat === c ? "border-primary bg-primary text-white" : "border-line bg-card hover:bg-primary-soft")}>
                {c === "all" ? `All (${log.length})` : `${CATEGORY_LABEL[c]}${counts[c] ? ` (${counts[c]})` : ""}`}</button>))}
          </div>
          {shown.length === 0 ? <Card><EmptyState icon={Workflow} title={log.length ? "No actions in this category" : "No automation has run yet"} hint={log.length ? "Choose another category." : "Run a command in Chat and its tool calls, results and failures are listed here."} action={log.length ? undefined : <Button variant="primary" size="sm" onClick={() => go("chat")}>Open chat</Button>} /></Card>
            : <ul className="space-y-2.5" aria-label="Execution history">{shown.map((a) => <ExecutionCard key={a.id} a={a} />)}</ul>}
        </div>
        <div className="space-y-4 lg:col-span-2"><Timeline /><FlowGraph /></div>
      </div>
    </div>
  );
}
