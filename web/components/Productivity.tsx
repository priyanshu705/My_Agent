"use client";
import { useEffect, useMemo, useState } from "react";
import { Bell, Brain, Check, Clock, ListChecks, Plus, Search, StickyNote } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/activity";
import { Badge, Button, Card, EmptyState, Input, PageHeader, cn } from "./ui";
import ReminderWhen, { DEFAULT_WHEN, minutesFor, type When } from "./ReminderWhen";

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} className="pl-9" /></div>
  );
}
function AddForm({ label, placeholder, onAdd, children, multiline, disabled }: { label: string; placeholder: string; onAdd: (t: string) => Promise<void> | void; children?: React.ReactNode; multiline?: boolean; disabled?: boolean }) {
  const [v, setV] = useState(""); const [busy, setBusy] = useState(false); const toast = useStore((s) => s.toast);
  const submit = async () => { const t = v.trim(); if (!t || busy || disabled) return; setBusy(true); try { await onAdd(t); setV(""); } catch (e: any) { toast(e?.message || "Could not save.", true); } finally { setBusy(false); } };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      {multiline
        ? <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={1000} rows={2} className="min-h-[44px] w-full flex-1 rounded-lg border border-control bg-card px-3 py-2.5 text-sm placeholder:text-muted focus:border-primary"onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(); }} />
        : <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={500} className="flex-1" />}
      {children}
      <Button type="submit" variant="primary" icon={Plus} loading={busy} disabled={!v.trim() || disabled}>Add</Button>
    </form>
  );
}

export function Notes() {
  const { dash, addNote, memory, loadMemory } = useStore(); const [q, setQ] = useState("");
  useEffect(() => { void loadMemory(); }, [loadMemory]);
  const list = useMemo(() => dash.notes.filter((n) => n.text.toLowerCase().includes(q.trim().toLowerCase())), [dash.notes, q]);
  const total = memory?.counts.notes ?? dash.notes.length;
  return (
    <div>
      <PageHeader title="Notes" subtitle={`${total} saved on this PC`} />
      <Card className="mb-4 p-4"><AddForm label="New note" placeholder="Write a note… (Ctrl+Enter to save)" multiline onAdd={addNote} /></Card>
      <div className="mb-3"><SearchBox value={q} onChange={setQ} label="Search notes" /></div>
      {list.length === 0 ? <Card><EmptyState icon={StickyNote} title={q ? "No notes match your search" : "No notes yet"} hint={q ? "Try different words." : "Add one above, or say “note karo …” to the assistant."} /></Card> : (
        <ul className="grid gap-3 sm:grid-cols-2">{list.map((n, i) => (
          <li key={n.i ?? i}><Card as="article" className="h-full p-4"><p className="whitespace-pre-wrap break-words text-sm">{n.text}</p><p className="mt-3 text-xs text-muted">{n.at ? `Created ${fmtDate(n.at)}` : "Date not recorded"}</p></Card></li>))}</ul>)}
      {total > dash.notes.length && !q && <p className="mt-3 text-xs text-muted">Showing the {dash.notes.length} most recent of {total} notes — the backend returns only the latest ones.</p>}
    </div>
  );
}

export function Tasks() {
  const { dash, addTodo, toggleTodo } = useStore(); const [tab, setTab] = useState<"pending" | "done">("pending");
  const pending = dash.todos.filter((t) => !t.done), done = dash.todos.filter((t) => t.done); const list = tab === "pending" ? pending : done;
  return (
    <div>
      <PageHeader title="Tasks" subtitle={`${pending.length} pending · ${done.length} completed`} />
      <Card className="mb-4 p-4"><AddForm label="New task" placeholder="Add a task" onAdd={addTodo} /></Card>
      <div role="group" aria-label="Task filter" className="mb-3 inline-flex rounded-lg border border-line bg-card p-1">
        {([["pending", `Pending (${pending.length})`], ["done", `Completed (${done.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={cn("min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] rounded-md px-3.5 text-sm font-medium", tab === k ? "bg-primary text-white" : "text-muted hover:text-ink")}>{l}</button>))}
      </div>
      {list.length === 0 ? <Card><EmptyState icon={ListChecks} title={tab === "pending" ? "No pending tasks" : "Nothing completed yet"} hint={tab === "pending" ? "Add a task above or ask the assistant." : "Completed tasks show up here."} /></Card> : (
        <Card as="div" className="divide-y divide-line">{list.map((t) => (
          <div key={t.i} className="flex items-start gap-3 px-4 py-3">
            {/* 44 px target around a 32 px box */}
            <button type="button" role="checkbox" aria-checked={t.done} aria-label={`${t.done ? "Mark pending" : "Mark complete"}: ${t.task}`} onClick={() => void toggleTodo(t.i)}
              className="-m-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md"><span className={cn("grid h-8 w-8 place-items-center rounded-md border", t.done ? "border-primary bg-primary text-white" : "border-control bg-card")}>{t.done && <Check size={15} aria-hidden />}</span></button>
            <div className="min-w-0 flex-1"><p className={cn("break-words text-sm", t.done && "text-muted line-through")}>{t.task}</p><p className="text-xs text-muted">{t.at ? `Created ${fmtDate(t.at)}` : ""}</p></div>
          </div>))}</Card>)}
      <p className="mt-3 text-xs text-muted">Due dates are not supported by the backend yet, so tasks only show when they were created.</p>
    </div>
  );
}

export function Reminders() {
  const { dash, addReminder } = useStore(); const [whenSet, setWhen] = useState<When>(DEFAULT_WHEN);
  const now = Date.now(); const t = (r: { due: string }) => new Date(r.due).getTime();
  const upcoming = dash.reminders.filter((r) => t(r) > now), due = dash.reminders.filter((r) => !(t(r) > now));
  const when = (r: { due: string }) => isNaN(t(r)) ? r.due : new Date(t(r)).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const Row = ({ r, tone }: { r: { text: string; due: string }; tone: "info" | "warning" }) => (
    <li className="flex items-center gap-3 px-4 py-3"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone === "warning" ? "bg-warning-soft text-warning-text" : "bg-primary-soft text-primary-text")}>{tone === "warning" ? <Bell size={16} aria-hidden /> : <Clock size={16} aria-hidden />}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.text}</p><p className="text-xs text-muted">{when(r)}</p></div><Badge tone={tone}>{tone === "warning" ? "Due" : "Upcoming"}</Badge></li>);
  return (
    <div>
      <PageHeader title="Reminders" subtitle={`${upcoming.length} upcoming · ${due.length} due`} />
      <Card className="mb-4 space-y-3 p-4"><AddForm label="New reminder" placeholder="Remind me to…" disabled={minutesFor(whenSet) === null}
        onAdd={async (txt) => { const mins = minutesFor(whenSet); if (mins !== null) await addReminder(txt, mins); }} />
        <ReminderWhen id="rem-when" value={whenSet} onChange={setWhen} /></Card>
      {due.length > 0 && <><h2 className="mb-2 text-sm font-semibold">Due now</h2><Card as="div" className="mb-5"><ul className="divide-y divide-line">{due.map((r, i) => <Row key={i} r={r} tone="warning" />)}</ul></Card></>}
      <h2 className="mb-2 text-sm font-semibold">Upcoming</h2>
      {upcoming.length === 0 ? <Card><EmptyState icon={Bell} title="No upcoming reminders" hint="Add one above, or say “10 minute baad yaad dilana”." /></Card> : <Card as="div"><ul className="divide-y divide-line">{upcoming.map((r, i) => <Row key={i} r={r} tone="info" />)}</ul></Card>}
      <p className="mt-3 text-xs text-muted">Once a reminder has fired the backend removes it, so completed and cancelled reminders are not listed.</p>
    </div>
  );
}

export function MemoryView() {
  const { memory, memoryUnsupported, loadMemory, go, set } = useStore(); const [q, setQ] = useState("");
  useEffect(() => { void loadMemory(); }, [loadMemory]);
  const facts = (memory?.facts ?? []).filter((f) => f.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <PageHeader title="Saved memory" subtitle="Facts the assistant remembers about you and uses in every conversation."
        actions={<Button variant="primary" size="sm" icon={Brain} onClick={() => { set({ draft: "Remember that " }); go("chat"); }}>Teach the assistant</Button>} />
      {memoryUnsupported ? <Card><EmptyState icon={Brain} title="Not available on this backend" hint="Saved memory is listed by the PC backend. Connect to the PC agent to see it." /></Card> : memory === null ? <p className="py-8 text-center text-sm text-muted" role="status">Loading…</p> : (<>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">{[["Facts", memory.counts.facts], ["Notes", memory.counts.notes], ["Open tasks", memory.counts.todos_open]].map(([l, n]) => <Card as="div" key={String(l)} className="p-3"><p className="text-xl font-semibold">{n as number}</p><p className="text-xs text-muted">{l as string}</p></Card>)}</div>
        <div className="mb-3"><SearchBox value={q} onChange={setQ} label="Search saved memory" /></div>
        {facts.length === 0 ? <Card><EmptyState icon={Brain} title={q ? "Nothing matches" : "Nothing remembered yet"} hint={q ? "Try different words." : "Say “yaad rakhna ki …” and it will appear here."} /></Card> : (
          <Card as="div"><ul className="divide-y divide-line">{facts.map((f, i) => <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm"><Brain size={16} className="mt-0.5 shrink-0 text-primary-text" aria-hidden /><span className="min-w-0 break-words">{f}</span></li>)}</ul></Card>)}
        <p className="mt-3 text-xs text-muted">Memory is read-only here. To add or change a fact, tell the assistant in chat.</p></>)}
    </div>
  );
}
