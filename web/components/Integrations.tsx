"use client";
import { CalendarDays, Cpu, Ear, Globe, Mail, MessageCircle, Monitor, RefreshCw, Sparkles, UserRound, Volume2, type LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import SetupPanel from "./SetupPanel";
import { Badge, Button, Card, PageHeader, type Tone } from "./ui";
const FROM_PANEL = "Use “Set up from here” at the top of the Integrations page.";
const VOICE_NAMES: Record<string, string> = { gemini: "Gemini", edge: "Edge online", kokoro: "offline Kokoro" };

type State = { label: string; tone: Tone };
type Item = { id: string; title: string; Icon: LucideIcon; state: State; detail: string; setup?: string[]; action?: { label: string; run: () => void } };

export function useIntegrations(): Item[] {
  const { cfg, dash, mode, connectGoogle } = useStore(); const f = cfg.integrations;
  const google: State = cfg.google_connected ? { label: "Connected", tone: "success" } : cfg.google_ready ? { label: "Needs authorization", tone: "warning" } : { label: "Disabled", tone: "neutral" };
  const googleSetup = ["Create a Google Cloud OAuth client and download credentials.json (see README, Phase 2).", "Run setup_google.bat on the PC and sign in.", "Come back here and press Re-check."];
  const googleAction = cfg.google_ready && !cfg.google_connected ? { label: "Connect Google", run: () => void connectGoogle() } : undefined;
  const gemini: State = cfg.demo ? { label: "Disabled — demo mode", tone: "warning" } : f?.llm_router ? { label: "Configured (router)", tone: "success" } : cfg.has_key || f?.gemini_key ? { label: "Configured", tone: "success" } : cfg.has_key === undefined ? { label: "Not reported", tone: "neutral" } : { label: "Needs API key", tone: "warning" };
  const wa = dash.whatsappSession;
  const engine = cfg.voice_engine ?? (cfg.local_tts ? "kokoro" : "browser");
  const voiceOn = engine in VOICE_NAMES ? engine : "";
  return [
    { id: "gemini", title: "Gemini / AI model", Icon: Sparkles, state: gemini, detail: cfg.model ? `Model: ${cfg.model}. “Configured” means a key is present; it is verified on the first request.` : "The model name is reported by the PC backend.", setup: ["Get a free key at aistudio.google.com/apikey.", FROM_PANEL] },
    { id: "gmail", title: "Gmail", Icon: Mail, state: google, detail: cfg.google_connected ? "Read mail, write drafts. Sending always asks you first." : "Not connected.", setup: googleSetup, action: googleAction },
    { id: "calendar", title: "Google Calendar", Icon: CalendarDays, state: google, detail: cfg.google_connected ? "View, add, change and cancel events. Changes ask you first." : "Not connected.", setup: googleSetup, action: googleAction },
    { id: "contacts", title: "Google Contacts", Icon: UserRound, state: cfg.google_connected ? { label: "Depends on Google", tone: "info" } : google, detail: "Used to find WhatsApp numbers by name. It shares the Google authorization above; the backend does not report the contacts permission separately." },
    { id: "whatsapp", title: "WhatsApp", Icon: MessageCircle, state: wa === true ? { label: "Session saved", tone: "success" } : wa === false ? { label: "Needs setup", tone: "warning" } : { label: "Not reported", tone: "neutral" },
      detail: wa === true ? "A WhatsApp Web session exists on this PC. Whether it is still logged in is only known when a message is sent. Sending always asks you first." : wa === false ? "No WhatsApp session found on this PC." : mode === "cloud" ? "WhatsApp runs on your PC; the cloud backend cannot see it." : "Status not reported.", setup: ["Run setup_whatsapp.bat on the PC.", "Scan the QR code with your phone once.", "Press Re-check."] },
    { id: "browser", title: "Browser automation", Icon: Globe, state: f ? (f.browser_agent ? { label: "Enabled", tone: "success" } : { label: "Advanced agent off", tone: "neutral" }) : { label: "Not reported", tone: "neutral" },
      detail: "Step-by-step browser tools run on the PC. The advanced multi-step agent (browser_task) is optional. Final steps such as paying or submitting always ask you.", setup: ["Run setup_features.bat once to install the extras.", FROM_PANEL, "Restart the agent."] },
    { id: "desktop", title: "Desktop automation", Icon: Monitor, state: f ? (f.desktop_automation ? { label: "Enabled", tone: "success" } : { label: "Disabled", tone: "neutral" }) : { label: "Not reported", tone: "neutral" },
      detail: "Windows-MCP lets the assistant read the screen and click or type. Every click, type and shortcut asks you first.", setup: ["Run setup_features.bat once to install uv and the extras.", FROM_PANEL, "Restart the agent."] },
    { id: "tts", title: "Reply voice", Icon: Volume2, state: voiceOn ? { label: "Enabled", tone: "success" } : { label: "Browser voice", tone: "neutral" },
      detail: voiceOn ? `Replies use the ${VOICE_NAMES[voiceOn]} voice. If it fails, the browser voice takes over.` : "Replies use the browser or cloud voice.", setup: [FROM_PANEL] },
    { id: "wake", title: "Wake-word engine", Icon: Ear, state: cfg.wake_engine === "oww" ? (f?.wake_engine_running ? { label: "Running", tone: "success" } : f?.wake_engine_error ? { label: "Error", tone: "danger" } : { label: "Starting", tone: "warning" }) : { label: "Browser recognizer", tone: "info" },
      detail: cfg.wake_engine === "oww" ? (f?.wake_engine_error || "Offline openWakeWord engine listening on the PC microphone.") : "Uses the browser's speech recognition while this tab is open. Chrome or Edge only.", setup: ["Run setup_features.bat once to install the extras.", FROM_PANEL, "Restart the agent."] },
  ];
}

export default function Integrations() {
  const items = useIntegrations(); const { refreshStatus, refreshDash, checkedAt, toast } = useStore();
  const recheck = async () => { await Promise.all([refreshStatus(), refreshDash()]); toast("Status refreshed."); };
  return (
    <div>
      <PageHeader title="Integrations" subtitle="What the assistant can reach, and what it needs to reach more. Secrets are never shown here."
        actions={<><span className="text-xs text-muted" data-testid="checked-at">{checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not checked yet"}</span><Button size="sm" icon={RefreshCw} onClick={() => void recheck()}>Re-check</Button></>} />
      <SetupPanel />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <li key={it.id}><Card as="article" className="flex h-full flex-col p-4" aria-labelledby={`int-${it.id}`}>
            <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary-text"><it.Icon size={20} aria-hidden /></span><Badge tone={it.state.tone}>{it.state.label}</Badge></div>
            <h2 id={`int-${it.id}`} className="mt-3 text-sm font-semibold">{it.title}</h2>
            {it.state.tone === "danger"
              ? <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-text">{it.detail}</p>
              : <p className="mt-1 text-sm text-muted">{it.detail}</p>}
            <div className="mt-auto pt-3">
              {it.action && <Button variant="primary" size="sm" onClick={it.action.run} className="mb-2">{it.action.label}</Button>}
              {it.setup && it.state.tone !== "success" && (
                <details className="group rounded-lg bg-bg px-3 py-2 text-sm"><summary className="flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-primary-text">How to set this up</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted">{it.setup.map((s, i) => <li key={i}>{s}</li>)}</ol></details>)}
            </div>
          </Card></li>))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Cpu size={14} aria-hidden /> Status reflects what the backend reports at the time of the last check; it does not send test messages or make live calls.</p>
    </div>
  );
}
