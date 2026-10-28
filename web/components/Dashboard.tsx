"use client";
import { useState } from "react";
import { CalendarDays, Mail, ListTodo, StickyNote, Bell, Plus, Check } from "lucide-react";
import { useStore } from "@/lib/store";

const Card = ({ title, Icon, children, right }: { title: string; Icon: any; children: React.ReactNode; right?: React.ReactNode }) => (
  <section className="glass rounded-2xl p-4">
    <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400"><Icon size={14} className="text-accent" />{title}</h3>{right}</div>
    {children}
  </section>
);
const Empty = ({ t }: { t: string }) => <p className="py-2 text-sm text-slate-500">{t}</p>;

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(""); } }}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 rounded-lg hairline bg-black/25 px-3 py-1.5 text-sm outline-none focus:border-accent/50" />
      <button aria-label="Add" className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.07] hover:bg-white/15"><Plus size={14} /></button>
    </form>
  );
}

export default function Dashboard() {
  const { dash, toggleTodo, addTodo, addNote, connectGoogle, cfg } = useStore();
  const open = dash.todos.filter((t) => !t.done).length;
  return (
    <div className="space-y-3">
      <Card title="Tasks" Icon={ListTodo} right={<span className="text-[11px] text-slate-500">{open} open</span>}>
        {dash.todos.length === 0 ? <Empty t="No tasks yet." /> : (
          <ul className="space-y-1">
            {dash.todos.map((t) => (
              <li key={t.i}><button onClick={() => void toggleTodo(t.i)} className="group flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-white/5">
                <span className={`grid h-4 w-4 place-items-center rounded border ${t.done ? "border-accent bg-accent text-ink-950" : "border-white/25"}`}>{t.done && <Check size={11} />}</span>
                <span className={t.done ? "text-slate-500 line-through" : ""}>{t.task}</span></button></li>
            ))}
          </ul>
        )}
        <AddRow placeholder="Add a task" onAdd={(t) => void addTodo(t)} />
      </Card>
      <Card title="Today's calendar" Icon={CalendarDays}>
        {!dash.calendarConnected ? (
          <div className="py-1 text-sm text-slate-400">Not connected. {cfg.google_ready ? <button onClick={() => void connectGoogle()} className="text-accent underline-offset-2 hover:underline">Connect Google</button> : <span className="text-slate-500">Google OAuth not configured yet.</span>}</div>
        ) : dash.calendar.length === 0 ? <Empty t="Nothing scheduled." /> : (
          <ul className="space-y-2">{dash.calendar.map((e, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-14 shrink-0 font-mono text-xs text-accent">{e.time}</span><span className="min-w-0 truncate">{e.title}</span></li>)}</ul>
        )}
      </Card>
      <Card title="Inbox" Icon={Mail}>
        {!dash.mailConnected ? <Empty t="Not connected." /> : dash.mail.length === 0 ? <Empty t="Inbox zero." /> : (
          <ul className="space-y-2">{dash.mail.map((m, i) => <li key={i} className="text-sm"><p className="truncate font-medium">{m.subject}</p><p className="truncate text-xs text-slate-500">{m.from} — {m.snippet}</p></li>)}</ul>
        )}
      </Card>
      <Card title="Reminders" Icon={Bell}>
        {dash.reminders.length === 0 ? <Empty t="No reminders." /> : <ul className="space-y-1.5">{dash.reminders.map((r, i) => <li key={i} className="flex justify-between gap-2 text-sm"><span className="truncate">{r.text}</span><span className="shrink-0 font-mono text-xs text-slate-500">{new Date(r.due).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul>}
      </Card>
      <Card title="Notes" Icon={StickyNote}>
        {dash.notes.length === 0 ? <Empty t="No notes." /> : <ul className="space-y-1.5">{dash.notes.slice(0, 5).map((n, i) => <li key={i} className="text-sm text-slate-300">{n.text}</li>)}</ul>}
        <AddRow placeholder="Add a note" onAdd={(t) => void addNote(t)} />
      </Card>
    </div>
  );
}
