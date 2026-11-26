"use client";
import { useEffect, useRef } from "react";
import { Menu, Mic, MicOff } from "lucide-react";
import { useStore } from "@/lib/store";
import { assistantStatus } from "@/lib/activity";
import { voice } from "@/lib/voice";
import Sidebar, { VIEW_LABEL } from "./Sidebar";
import ConfirmDialog from "./Confirm";
import Toasts from "./Toasts";
import Overview from "./Overview";
import Chat from "./Chat";
import Automation from "./Automation";
import { Notes, Tasks, Reminders, MemoryView } from "./Productivity";
import Integrations from "./Integrations";
import Settings from "./Settings";
import { Badge, IconButton, cn } from "./ui";

export function useStatus() {
  const { online, busy, activity, msgs } = useStore();
  const last = msgs[msgs.length - 1];
  return assistantStatus({ online, busy, pendingConfirm: msgs.some((m) => m.confirm), activity, lastError: !!last?.error });
}

export default function Shell() {
  const { view, set, ui, toggleMic, mode, pcOnline, online } = useStore();
  const status = useStatus(); const main = useRef<HTMLElement>(null); const first = useRef(true);
  // After the user navigates, move focus to the content so keyboard and screen-reader users land in the new view.
  useEffect(() => { if (first.current) { first.current = false; return; } main.current?.focus({ preventScroll: true }); }, [view]);
  const listening = ui === "listening";
  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <a href="#main" className="skip">Skip to content</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[56px] items-center gap-2 border-b border-line bg-card px-3 sm:px-5">
          <IconButton label="Open menu" icon={Menu} onClick={() => set({ sidebarOpen: true })} className="lg:hidden" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{VIEW_LABEL[view]}</p>
          <Badge tone={status.tone} className="hidden max-w-[260px] truncate sm:inline-flex"><span className="truncate">{status.label}</span></Badge>
          <Badge tone={!online ? "danger" : mode === "local" || pcOnline ? "success" : "neutral"} className="hidden md:inline-flex">
            {!online ? "Backend offline" : mode === "local" ? "PC connected" : pcOnline ? "PC online" : "PC offline"}
          </Badge>
          <IconButton label={listening ? "Stop listening" : "Start listening"} icon={listening ? MicOff : Mic} active={listening} onClick={() => void toggleMic()} disabled={!voice.canListen && !listening} className="sm:hidden" />
        </header>
        <main id="main" ref={main} tabIndex={-1} className={cn("min-h-0 flex-1 outline-none", view === "chat" ? "overflow-hidden" : "overflow-y-auto")}>
          <div key={view} className={cn("animate-rise", view === "chat" ? "h-full" : "mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7")}>
            {view === "overview" && <Overview />}
            {view === "chat" && <Chat />}
            {view === "automation" && <Automation />}
            {view === "notes" && <Notes />}
            {view === "tasks" && <Tasks />}
            {view === "reminders" && <Reminders />}
            {view === "memory" && <MemoryView />}
            {view === "integrations" && <Integrations />}
            {view === "settings" && <Settings />}
          </div>
        </main>
      </div>
      {/* Announces assistant state changes to screen readers without re-reading the whole chat */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="live-status">{status.label}</div>
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
