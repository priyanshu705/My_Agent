"use client";
import { Plus, Trash2, Settings as Cog, LogOut, MessageSquare } from "lucide-react";
import { useStore } from "@/lib/store";

export default function Sidebar() {
  const { sessions, sid, newChat, openSession, deleteSession, set, logout, sidebarOpen, pcOnline, settings, cfg } = useStore();
  const name = settings.name || cfg.user_name || "You";
  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => set({ sidebarOpen: false })} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col glass-strong border-r border-white/5 p-3 transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Conversations">
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent2"><span className="h-3 w-3 rounded-full bg-ink-950" /></span>
          <span className="text-sm font-semibold tracking-tight">My <span className="text-gradient">Agent</span></span>
        </div>
        <button onClick={() => { newChat(); set({ sidebarOpen: false }); }} className="btn-primary mt-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm"><Plus size={16} /> New chat</button>
        <p className="mt-4 mb-1 px-2 text-[11px] uppercase tracking-wider text-slate-500">Recent</p>
        <nav className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
          {sessions.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No conversations yet.</p>}
          {sessions.map((s) => (
            <div key={s.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${s.id === sid ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"}`}>
              <button onClick={() => { void openSession(s.id); set({ sidebarOpen: false }); }} className="flex min-w-0 flex-1 items-center gap-2 text-left"><MessageSquare size={14} className="shrink-0" /><span className="truncate">{s.title || "New chat"}</span></button>
              <button onClick={() => void deleteSession(s.id)} aria-label="Delete conversation" className="opacity-0 transition hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"><Trash2 size={14} /></button>
            </div>
          ))}
        </nav>
        <div className="mt-2 space-y-1 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2 px-2 pb-2 text-xs"><i className={`h-2 w-2 rounded-full ${pcOnline ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-slate-600"}`} /><span className="text-slate-300">{pcOnline ? "PC agent online" : "PC agent offline"}</span></div>
          <button onClick={() => set({ settingsOpen: true, sidebarOpen: false })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5"><Cog size={15} /> Settings</button>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5"><LogOut size={15} /> Sign out · {name}</button>
        </div>
      </aside>
    </>
  );
}
