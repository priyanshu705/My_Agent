"use client";
import { Menu, MessageCircle, Workflow, LayoutDashboard } from "lucide-react";
import { useStore } from "@/lib/store";
import Sidebar from "./Sidebar"; import Orb from "./Orb"; import Chat from "./Chat"; import Composer from "./Composer";
import FlowGraph from "./FlowGraph"; import Timeline from "./Timeline"; import Dashboard from "./Dashboard"; import Settings from "./Settings"; import Toasts from "./Toasts";

const LABEL = { idle: "Ready", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" } as const;

export default function Shell() {
  const { ui, tab, set, toggleMic, pcOnline, settings, cfg } = useStore();
  const name = settings.name || cfg.user_name || "";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="relative flex h-dvh overflow-hidden noise">
      <div className="pointer-events-none absolute inset-0 dots opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/3 h-[480px] w-[480px] rounded-full bg-accent/10 blur-[120px] animate-aurora" />
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col pb-14 lg:pb-0 lg:flex-row">
        {/* Center: orb + chat */}
        <section className={`${tab === "chat" ? "flex" : "hidden"} lg:flex min-w-0 flex-1 flex-col`} aria-label="Chat">
          <header className="flex items-center gap-3 px-4 pt-3">
            <button aria-label="Open menu" onClick={() => set({ sidebarOpen: true })} className="rounded-lg p-2 hover:bg-white/10 lg:hidden"><Menu size={20} /></button>
            <div className="min-w-0"><h1 className="truncate text-sm font-medium">{greet}{name ? `, ${name}` : ""}</h1><p className="text-xs text-slate-500" data-testid="ui-state">{LABEL[ui]}</p></div>
            <span className={`ml-auto flex items-center gap-1.5 rounded-full hairline px-2.5 py-1 text-[11px] ${pcOnline ? "text-emerald-300" : "text-slate-500"}`}><i className={`h-1.5 w-1.5 rounded-full ${pcOnline ? "bg-emerald-400" : "bg-slate-600"}`} />PC {pcOnline ? "online" : "offline"}</span>
          </header>
          <div className="flex justify-center pt-1"><Orb size={150} onClick={() => void toggleMic()} /></div>
          <Chat />
          <Composer />
        </section>
        {/* Right: live panel */}
        <aside className={`${tab === "chat" ? "hidden" : "block"} lg:block w-full overflow-y-auto p-3 lg:w-[430px] lg:shrink-0 lg:border-l lg:border-white/5`} aria-label="Live activity and dashboard">
          <div className={`${tab === "dash" ? "hidden" : "block"} lg:block space-y-3`}><FlowGraph /><Timeline /></div>
          <div className={`${tab === "flow" ? "hidden" : "block"} lg:block mt-3`}><Dashboard /></div>
        </aside>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-white/10 glass-strong pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Sections">
        {([["chat", "Chat", MessageCircle], ["flow", "Live", Workflow], ["dash", "Dashboard", LayoutDashboard]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => set({ tab: k })} aria-current={tab === k} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${tab === k ? "text-accent" : "text-slate-400"}`}><I size={18} />{l}</button>
        ))}
      </nav>
      <Settings /><Toasts />
    </div>
  );
}
