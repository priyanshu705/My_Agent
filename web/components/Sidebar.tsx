"use client";
import { useEffect, useState } from "react";
import { Bell, Brain, LayoutDashboard, ListChecks, LogOut, MessageSquare, Plug, Plus, Settings as Cog, StickyNote, Trash2, Workflow, X, type LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import type { View } from "@/lib/types";
import { cn, useFocusTrap } from "./ui";

export const NAV: { group: string; items: { id: View; label: string; Icon: LucideIcon }[] }[] = [
  { group: "Workspace", items: [{ id: "overview", label: "Overview", Icon: LayoutDashboard }, { id: "chat", label: "Chat", Icon: MessageSquare }, { id: "automation", label: "Automation", Icon: Workflow }] },
  { group: "Productivity", items: [{ id: "notes", label: "Notes", Icon: StickyNote }, { id: "tasks", label: "Tasks", Icon: ListChecks }, { id: "reminders", label: "Reminders", Icon: Bell }, { id: "memory", label: "Memory", Icon: Brain }] },
  { group: "System", items: [{ id: "integrations", label: "Integrations", Icon: Plug }, { id: "settings", label: "Settings", Icon: Cog }] },
];
export const VIEW_LABEL: Record<View, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<View, string>;

export function useIsDesktop() {
  const [d, setD] = useState(true);
  useEffect(() => { const q = matchMedia("(min-width: 1024px)"); const f = () => setD(q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return d;
}

export default function Sidebar() {
  const { sessions, sid, newChat, openSession, deleteSession, go, view, logout, sidebarOpen, set, pcOnline, online, mode, settings, cfg } = useStore();
  const desktop = useIsDesktop(); const drawer = !desktop && sidebarOpen;
  const ref = useFocusTrap(drawer, () => set({ sidebarOpen: false }));
  const name = settings.name || cfg.user_name || "You";
  const status = !online ? "Backend offline" : mode === "local" ? "PC agent running" : pcOnline ? "PC agent online" : "PC agent offline";
  return (
    <>
      {drawer && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => set({ sidebarOpen: false })} aria-hidden />}
      <aside ref={ref} aria-label="Sidebar" {...(!desktop && !sidebarOpen ? { inert: "" as any } : {})}
        className={cn("on-dark fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[86vw] flex-col bg-sidebar p-3 text-sidebar-text transition-transform duration-200 lg:static lg:w-[264px] lg:max-w-none lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white" aria-hidden><span className="h-3.5 w-3.5 rounded-full bg-white/90" /></span>
            <div className="leading-tight"><p className="text-sm font-semibold text-white">My Agent</p><p className="text-[11px] text-sidebar-muted">Personal AI OS</p></div>
          </div>
          <button type="button" aria-label="Close menu" onClick={() => set({ sidebarOpen: false })} className="grid h-11 w-11 place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-2 hover:text-white lg:hidden"><X size={18} aria-hidden /></button>
        </div>

        <button type="button" onClick={() => { newChat(); set({ sidebarOpen: false }); }}
          className="mt-2 flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} aria-hidden /> New chat</button>

        <nav aria-label="Main" className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{g.group}</p>
              <ul className="space-y-0.5">
                {g.items.map(({ id, label, Icon }) => (
                  <li key={id}>
                    <button type="button" onClick={() => go(id)} aria-current={view === id ? "page" : undefined}
                      className={cn("flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors", view === id ? "bg-sidebar-2 font-medium text-white" : "hover:bg-sidebar-2/60 hover:text-white")}>
                      <Icon size={17} aria-hidden /> {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Recent conversations</p>
            {sessions.length === 0 && <p className="px-3 py-2 text-xs text-sidebar-muted">No conversations yet.</p>}
            <ul className="space-y-0.5">
              {sessions.slice(0, 12).map((s) => (
                <li key={s.id} className={cn("group flex items-center rounded-lg", s.id === sid && view === "chat" ? "bg-sidebar-2 text-white" : "hover:bg-sidebar-2/60")}>
                  <button type="button" onClick={() => { void openSession(s.id); go("chat"); }} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-left text-sm" aria-current={s.id === sid && view === "chat" ? "true" : undefined}>
                    <MessageSquare size={14} className="shrink-0 opacity-70" aria-hidden /><span className="truncate">{s.title || "New chat"}</span>
                  </button>
                  <button type="button" onClick={() => void deleteSession(s.id)} aria-label={`Delete conversation ${s.title || "New chat"}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-sidebar-muted opacity-100 hover:text-white focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"><Trash2 size={14} aria-hidden /></button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="mt-2 space-y-1 border-t border-white/10 pt-3">
          <p className="flex items-center gap-2 px-3 pb-1 text-xs"><i aria-hidden className={cn("h-2 w-2 rounded-full", online ? "bg-success" : "bg-danger")} /><span>{status}</span></p>
          <button type="button" onClick={logout} className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-sm hover:bg-sidebar-2/60 hover:text-white"><LogOut size={16} aria-hidden /> Sign out · {name}</button>
        </div>
      </aside>
    </>
  );
}
