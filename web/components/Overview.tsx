"use client";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Bell, CalendarDays, CheckCircle2, Chrome, Code2, Ear, Mail, MessageCircle, Mic, Plug, Plus, Search, Settings as Cog, ShieldAlert, StickyNote, Workflow } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildLog, fmtDate } from "@/lib/activity";
import { toolInfo } from "@/lib/tools";
import { voice } from "@/lib/voice";
import { Badge, Button, Card, Dialog, EmptyState, Input, PageHeader, SectionTitle, cn, type Tone } from "./ui";
import ReminderWhen, { DEFAULT_WHEN, minutesFor, type When } from "./ReminderWhen";
import { useIntegrations } from "./Integrations";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

function Stat({ icon: Icon, label, value, tone, hint, onClick }: { icon: any; label: string; value: string; tone: Tone; hint?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary-text"><Icon size={18} aria-hidden /></span><Badge tone={tone}>{value}</Badge></div>
      <p className="mt-3 text-sm font-medium">{label}</p>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </>
  );
  return onClick
    ? <Card as="div" className="p-0"><button type="button" onClick={onClick} className="block w-full rounded-2xl p-4 text-left transition-colors hover:bg-primary-soft/50">{body}</button></Card>
    : <Card as="div" className="p-4">{body}</Card>;
}

export default function Overview() {
  const s = useStore();
  const { settings, cfg, go, ask, msgs, dash, sessions, mode, pcOnline, online, memory, loadMemory, set, addNote, addReminder, toast } = s;
  const [dlg, setDlg] = useState<null | "note" | "reminder">(null);
  const [text, setText] = useState(""); const [when, setWhen] = useState<When>(DEFAULT_WHEN);
  useEffect(() => { void loadMemory(); }, [loadMemory]);
  const name = settings.name || cfg.user_name || "";
  const log = buildLog(msgs).slice(0, 5);
  const pcOk = online && (mode === "local" || pcOnline);
  const items = useIntegrations(); const on = items.filter((i) => i.state.tone === "success").length;
  const now = Date.now(); const upcoming = dash.reminders.filter((r) => new Date(r.due).getTime() > now);
  const open = dash.todos.filter((t) => !t.done).length;
  const canVoice = voice.canListen;

  type QA = { id: string; label: string; icon: any; run: () => void; disabled?: string };
  const actions: QA[] = [
    { id: "chrome", label: "Open Chrome", icon: Chrome, run: () => ask("Open Chrome"), disabled: pcOk ? undefined : "PC agent is offline" },
    { id: "google", label: "Search Google", icon: Search, run: () => { set({ draft: "Search Google for " }); go("chat"); } },
    { id: "note", label: "Create a note", icon: StickyNote, run: () => { setText(""); setDlg("note"); } },
    { id: "reminder", label: "Create a reminder", icon: Bell, run: () => { setText(""); setWhen(DEFAULT_WHEN); setDlg("reminder"); } },
    { id: "vscode", label: "Open VS Code", icon: Code2, run: () => ask("Open VS Code"), disabled: pcOk ? undefined : "PC agent is offline" },
    { id: "mail", label: "Unread email", icon: Mail, run: () => ask("Check my unread emails"), disabled: cfg.google_connected ? (pcOk || mode === "cloud" ? undefined : "PC agent is offline") : "Connect Google first (Integrations)" },
    { id: "wa", label: "Unread WhatsApp", icon: MessageCircle, run: () => ask("Check my unread WhatsApp messages"), disabled: !pcOk ? "PC agent is offline" : dash.whatsappSession === false ? "WhatsApp is not set up (Integrations)" : undefined },
  ];

  const submit = async () => {
    const t = text.trim(); if (!t) return;
    const mins = minutesFor(when);
    if (dlg === "reminder" && mins === null) return;
    try { if (dlg === "note") { await addNote(t); toast("Note saved."); } else if (mins !== null) await addReminder(t, mins); setDlg(null); }
    catch (e: any) { toast(e?.message || "Could not save.", true); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`${greet()}${name ? `, ${name}` : ""}`} subtitle="Here is what your assistant is doing and what it can reach."
        actions={<>
          <Badge tone="neutral" dot={false}>Model: {cfg.model || "not reported"}</Badge>
          <Button size="sm" icon={Cog} onClick={() => go("settings")}>Settings</Button>
        </>} />

      <section aria-labelledby="ov-assistant">
        <h2 id="ov-assistant" className="sr-only">Assistant overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={CheckCircle2} label="Assistant" value={!online ? "Offline" : cfg.demo ? "Ready · demo" : "Ready"} tone={!online ? "danger" : cfg.demo ? "warning" : "success"}
            hint={!online ? "The backend is not answering" : mode === "local" ? "Running on this PC" : pcOnline ? "Cloud + PC agent online" : "Cloud only — PC agent offline"} />
          <Stat icon={Mic} label="Voice" value={canVoice ? "Available" : "Unavailable"} tone={canVoice ? "success" : "warning"}
            hint={canVoice ? (settings.speak ? "Voice replies on" : "Voice replies muted") : "Needs Chrome or Edge on localhost / https"} onClick={() => go("settings")} />
          <Stat icon={Ear} label="Wake word" value={!settings.wake ? "Off" : s.wakeActive ? "Active" : "Paused"} tone={s.wakeActive ? "success" : "neutral"}
            hint={`“${settings.wakeWord || cfg.wake_word || "hey agent"}” · ${cfg.wake_engine === "oww" ? "offline engine" : "browser recognizer"}`} onClick={() => go("settings")} />
          <Stat icon={Plug} label="Integrations" value={`${on} of ${items.length} on`} tone={on > 0 ? "info" : "neutral"} hint="Gemini, Google, WhatsApp, automation, voice" onClick={() => go("integrations")} />
        </div>
      </section>

      <section aria-labelledby="ov-quick">
        <SectionTitle>{<span id="ov-quick">Quick actions</span>}</SectionTitle>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {actions.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={a.run} disabled={!!a.disabled} aria-describedby={a.disabled ? `qa-${a.id}` : undefined}
                className={cn("flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left text-sm font-medium shadow-card transition-colors", a.disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/40 hover:bg-primary-soft/50")}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-text"><a.icon size={18} aria-hidden /></span>
                <span className="min-w-0"><span className="block break-words">{a.label}</span>{a.disabled && <span id={`qa-${a.id}`} className="block text-xs font-normal text-muted">{a.disabled}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Quick actions send a normal message to the assistant, so anything risky still asks for your confirmation.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 p-4 lg:col-span-3">
          <SectionTitle right={<Button variant="ghost" size="sm" onClick={() => go("automation")}>View all <ArrowRight size={14} aria-hidden /></Button>}>Recent activity</SectionTitle>
          {log.length === 0 ? <EmptyState icon={Workflow} title="Nothing has run yet" hint="Ask the assistant to do something and every tool it uses appears here." action={<Button variant="primary" size="sm" onClick={() => go("chat")}>Open chat</Button>} /> : (
            <ul className="divide-y divide-line">
              {log.map((a) => { const info = toolInfo(a.tool); return (
                <li key={a.id} className="flex items-start gap-3 py-2.5">
                  <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", a.status === "failed" ? "bg-danger-soft text-danger-text" : a.status === "pending" ? "bg-warning-soft text-warning-text" : "bg-success-soft text-success-text")}>
                    {a.status === "failed" ? <AlertCircle size={16} aria-hidden /> : a.status === "pending" ? <ShieldAlert size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium capitalize">{info.label}</p><p className="truncate text-xs text-muted">{a.result || "—"}</p></div>
                  <div className="text-right"><Badge tone={a.status === "failed" ? "danger" : a.status === "pending" ? "warning" : "success"}>{a.status === "failed" ? "Failed" : a.status === "pending" ? "Pending" : "Completed"}</Badge><p className="mt-1 text-xs text-muted">{a.at}</p></div>
                </li>); })}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 p-4 lg:col-span-2">
          <SectionTitle>Productivity</SectionTitle>
          <ul className="grid grid-cols-3 gap-2 text-center" aria-label="Productivity counts">
            {[["Notes", memory?.counts.notes ?? dash.notes.length, "notes"], ["Open tasks", open, "tasks"], ["Upcoming", upcoming.length, "reminders"]].map(([l, n, v]) => (
              <li key={String(l)}><button type="button" onClick={() => go(v as any)} className="w-full rounded-xl bg-bg px-2 py-3 hover:bg-primary-soft">
                <span className="block text-2xl font-semibold">{n as number}</span><span className="block text-xs text-muted">{l as string}</span>
              </button></li>))}
          </ul>
          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Recent conversations</p>
          {sessions.length === 0 ? <p className="py-2 text-sm text-muted">No conversations yet.</p> : (
            <ul className="space-y-0.5">{sessions.slice(0, 4).map((c) => (
              <li key={c.id}><button type="button" onClick={() => { void s.openSession(c.id); go("chat"); }} className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm hover:bg-primary-soft">
                <span className="truncate">{c.title || "New chat"}</span><span className="shrink-0 text-xs text-muted">{fmtDate(c.updated)}</span></button></li>))}</ul>
          )}
        </Card>
      </div>

      {(cfg.google_connected || dash.calendar.length > 0 || dash.mail.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="min-w-0 p-4"><SectionTitle>Today&apos;s calendar</SectionTitle>
            {dash.calendarError && <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-text">Could not load the calendar. Anything shown may be out of date.</p>}
            {dash.calendar.length === 0 ? (dash.calendarError ? null : <p className="text-sm text-muted">Nothing scheduled.</p>) :<ul className="space-y-2">{dash.calendar.map((e, i) => <li key={i} className="flex gap-3 text-sm"><CalendarDays size={16} className="mt-0.5 shrink-0 text-primary-text" aria-hidden /><span className="min-w-0"><span className="block truncate font-medium">{e.title}</span><span className="text-xs text-muted">{e.time}</span></span></li>)}</ul>}</Card>
          <Card className="min-w-0 p-4"><SectionTitle>Inbox</SectionTitle>
            {dash.mailError && <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-text">Could not load mail. Anything shown may be out of date.</p>}
            {dash.mail.length === 0 ? (dash.mailError ? null : <p className="text-sm text-muted">Inbox zero.</p>) :<ul className="space-y-2">{dash.mail.map((m, i) => <li key={i} className="flex gap-3 text-sm"><Mail size={16} className="mt-0.5 shrink-0 text-primary-text" aria-hidden /><span className="min-w-0"><span className="block truncate font-medium">{m.subject}</span><span className="block truncate text-xs text-muted">{m.from} — {m.snippet}</span></span></li>)}</ul>}</Card>
        </div>
      )}

      <Dialog open={dlg !== null} onClose={() => setDlg(null)} title={dlg === "note" ? "Create a note" : "Create a reminder"} description={dlg === "reminder" ? "The assistant will remind you when the time comes." : "Saved on this PC."}>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="qa-text">{dlg === "note" ? "Note" : "Remind me to"}</label>
          <Input id="qa-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} data-autofocus />
          {dlg === "reminder" && <ReminderWhen id="qa-mins" value={when} onChange={setWhen} presets />}
          <div className="flex justify-end gap-2 pt-2"><Button onClick={() => setDlg(null)}>Cancel</Button><Button type="submit" variant="primary" icon={Plus} disabled={!text.trim() || (dlg === "reminder" && minutesFor(when) === null)}>Save</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
