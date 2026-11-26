"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, Mic, Monitor, Moon, Play, RotateCcw, Sun, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { CLOUD_VOICES, voice } from "@/lib/voice";
import { useIntegrations } from "./Integrations";
import { Badge, Button, Card, Dialog, Field, Input, PageHeader, Switch, cn } from "./ui";
import type { Theme } from "@/lib/types";

const SECTIONS = ["General", "Assistant identity", "Language", "Voice", "Wake word", "AI model", "Integrations", "Permissions", "Appearance", "Privacy", "Advanced"] as const;
const slug = (s: string) => "set-" + s.toLowerCase().replace(/\s+/g, "-");
const Restart = () => <Badge tone="warning" dot={false} className="whitespace-nowrap">Restart needed</Badge>;
const Live = () => <Badge tone="success" dot={false} className="whitespace-nowrap">Applies now</Badge>;

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (<Card className="scroll-mt-4 p-5" aria-labelledby={slug(title)}><h2 id={slug(title)} className="text-base font-semibold">{title}</h2>{intro && <p className="mt-0.5 text-sm text-muted">{intro}</p>}<div className="mt-2 divide-y divide-line">{children}</div></Card>);
}

function usePerm(name: "microphone" | "notifications") {
  const [s, setS] = useState<string>("unknown");
  useEffect(() => {
    let p: PermissionStatus | null = null; let dead = false;
    if (name === "notifications" && typeof Notification !== "undefined") setS(Notification.permission === "default" ? "prompt" : Notification.permission);
    (navigator as any).permissions?.query({ name }).then((r: PermissionStatus) => { if (dead) return; p = r; setS(r.state); r.onchange = () => setS(r.state); }).catch(() => {});
    return () => { dead = true; if (p) p.onchange = null; };
  }, [name]);
  return s;
}
const permTone = (s: string) => (s === "granted" ? "success" : s === "denied" ? "danger" : "neutral") as "success" | "danger" | "neutral";

export default function Settings() {
  const { settings, setSettings, cfg, playSample, mode, logout, deleteAllSessions, sessions, toast, wakeActive, wakeNote, go } = useStore();
  const items = useIntegrations(); const mic = usePerm("microphone"); const notif = usePerm("notifications");
  const [wipe, setWipe] = useState(false); const [reset, setReset] = useState(false);
  const on = items.filter((i) => i.state.tone === "success").length;
  const themes: [Theme, string, typeof Sun][] = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]];
  return (
    <div>
      <PageHeader title="Settings" subtitle="Preferences are saved in this browser. Server options live in the .env file on the PC." />
      <div className="grid gap-5 lg:grid-cols-[200px,1fr]">
        <nav aria-label="Settings sections" className="hidden lg:block"><ul className="sticky top-4 space-y-0.5">{SECTIONS.map((s) => <li key={s}><a href={`#${slug(s)}`} className="block min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] rounded-lg px-3 py-2 text-sm text-muted hover:bg-primary-soft hover:text-primary-text">{s}</a></li>)}</ul></nav>
        <div className="space-y-5">
          <Section title="General" intro="How the assistant behaves day to day.">
            <Field label="Hands-free conversation" hint="After it answers, keep listening for your next sentence."><Live /><Switch on={settings.convo} onChange={(v) => setSettings({ convo: v })} label="Hands-free conversation" /></Field>
            <Field label="Show tool chips in chat" hint="Small labels showing which tools ran."><Live /><Switch on={settings.showTools} onChange={(v) => setSettings({ showTools: v })} label="Show tool chips" /></Field>
            <Field label="Connection" hint={mode === "local" ? "You are using the PC backend directly." : "You are using the cloud backend; the PC agent connects to it."}><Badge tone="info" dot={false}>{mode === "local" ? "Local PC" : "Cloud"}</Badge></Field>
          </Section>

          <Section title="Assistant identity">
            <Field label="Your name" hint="Used for the greeting. Stored in this browser." htmlFor="s-name"><Live /><Input id="s-name" value={settings.name} maxLength={40} onChange={(e) => setSettings({ name: e.target.value })} placeholder={cfg.user_name || "Name"} className="w-44" /></Field>
            <Field label="Assistant name" hint="Set AGENT_NAME in .env."><Restart /><span className="text-sm font-medium">{cfg.agent_name || "Agent"}</span></Field>
          </Section>

          <Section title="Language" intro="The assistant replies in the language you write or speak.">
            <Field label="Microphone language" hint="Language the browser listens for." htmlFor="s-lang"><Live />
              <select id="s-lang" value={settings.srLang} onChange={(e) => setSettings({ srLang: e.target.value })} className="min-h-[44px] rounded-lg border border-line bg-card px-3 text-sm">{[["en-IN", "English (India)"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["hi-IN", "Hindi"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Default recognition language" hint="RECOGNITION_LANG in .env."><Restart /><span className="text-sm">{cfg.recognition_lang || "en-IN"}</span></Field>
          </Section>

          <Section title="Voice">
            <Field label="Speak replies aloud"><Live /><Switch on={settings.speak} onChange={(v) => { setSettings({ speak: v }); if (!v) voice.stop(); }} label="Speak replies aloud" /></Field>
            <Field label="Voice" htmlFor="s-voice"><Live /><select id="s-voice" value={settings.voice} onChange={(e) => setSettings({ voice: e.target.value })} className="min-h-[44px] max-w-[220px] rounded-lg border border-line bg-card px-3 text-sm">{CLOUD_VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <Button size="sm" icon={Play} onClick={() => void playSample()} aria-label="Play a voice sample">Test</Button></Field>
            <Field label={`Speed · ${settings.rate.toFixed(2)}×`} htmlFor="s-rate"><Live /><input id="s-rate" type="range" min={0.8} max={1.3} step={0.05} value={settings.rate} onChange={(e) => setSettings({ rate: +e.target.value })} className="h-11 w-40 accent-primary" /></Field>
            <Field label="Offline Hindi voice" hint="KOKORO_TTS=1 in .env."><Restart /><Badge tone={cfg.local_tts ? "success" : "neutral"}>{cfg.local_tts ? "Enabled" : "Disabled"}</Badge></Field>
          </Section>

          <Section title="Wake word" intro="Say the phrase to start talking hands-free. Only listens while the assistant is idle.">
            <Field label="Listen for the wake word" hint={!voice.canListen ? "Needs Chrome or Edge on localhost or https." : wakeNote || (settings.wake ? (wakeActive ? "Active now." : "On, waiting until the assistant is idle.") : undefined)}><Live /><Switch on={settings.wake} onChange={(v) => setSettings({ wake: v })} label="Listen for the wake word" disabled={!voice.canListen} /></Field>
            <Field label="Wake phrase" htmlFor="s-wake"><Live /><Input id="s-wake" value={settings.wakeWord} maxLength={40} onChange={(e) => setSettings({ wakeWord: e.target.value })} placeholder={cfg.wake_word || "hey agent"} className="w-44" /></Field>
            <Field label="Engine" hint="Offline engine: WAKEWORD_ENGINE=openwakeword in .env."><Restart /><Badge tone="info" dot={false}>{cfg.wake_engine === "oww" ? "Offline engine" : "Browser recognizer"}</Badge></Field>
          </Section>

          <Section title="AI model" intro="Chosen on the PC. The browser never sees keys.">
            <Field label="Current model"><span className="text-sm font-medium" data-testid="model-name">{cfg.model || "Not reported"}</span></Field>
            <Field label="Change the model" hint="GEMINI_MODEL, or LLM_ROUTER_URL / LLM_ROUTER_KEY in .env."><Restart /></Field>
          </Section>

          <Section title="Integrations" intro="Gmail, Calendar, WhatsApp, automation and voice engines.">
            <Field label={`${on} of ${items.length} connected or enabled`}><Button size="sm" onClick={() => go("integrations")}>Manage</Button></Field>
          </Section>

          <Section title="Permissions" intro="What this browser has allowed. The assistant cannot grant itself more.">
            <Field label="Microphone" hint="Needed for voice input and the wake word."><Badge tone={permTone(mic)}>{mic === "unknown" ? "Unknown" : mic}</Badge>{mic === "denied" && <span className="text-xs text-muted">Click the lock icon in the address bar to change.</span>}</Field>
            <Field label="Notifications" hint="For reminders."><Badge tone={permTone(notif)}>{notif}</Badge>{notif === "prompt" && <Button size="sm" icon={Bell} onClick={() => void Notification.requestPermission()}>Allow</Button>}</Field>
            <Field label="PC actions" hint="Sending mail or WhatsApp, typing, shortcuts, closing apps, changing events and final browser steps always need your confirmation. This cannot be turned off here."><Badge tone="success" dot={false}>Always confirmed</Badge></Field>
          </Section>

          <Section title="Appearance">
            <Field label="Theme" hint="Light is the default."><div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-line bg-card p-1">
              {themes.map(([k, l, Icon]) => <button key={k} type="button" role="radio" aria-checked={settings.theme === k} onClick={() => setSettings({ theme: k })} className={cn("inline-flex min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] items-center gap-1.5 rounded-md px-3 text-sm font-medium", settings.theme === k ? "bg-primary text-white" : "text-muted hover:text-ink")}><Icon size={14} aria-hidden />{l}</button>)}</div></Field>
          </Section>

          <Section title="Privacy" intro="Conversations and notes stay on your PC. Text you send is processed by the AI provider you configured.">
            <Field label="Conversations" hint={`${sessions.length} stored on the backend.`}><Button variant="danger" size="sm" icon={Trash2} onClick={() => setWipe(true)} disabled={sessions.length === 0}>Delete all</Button></Field>
            <Field label="Sign out of this browser"><Button size="sm" onClick={logout}>Sign out</Button></Field>
          </Section>

          <Section title="Advanced">
            <Field label="Backend" hint={typeof location !== "undefined" ? location.origin : ""}><Badge tone="neutral" dot={false}>{mode === "local" ? "Local PC API" : "Cloud API"}</Badge></Field>
            <Field label="Reset this browser's preferences" hint="Clears name, voice, theme and wake-word choices stored here. Server data is not touched."><Button size="sm" icon={RotateCcw} onClick={() => setReset(true)}>Reset</Button></Field>
          </Section>
        </div>
      </div>

      <Dialog open={wipe} onClose={() => setWipe(false)} title="Delete all conversations?" description="This removes every stored conversation from the backend. Notes, tasks, reminders and memory are kept." tone="danger">
        <div className="flex justify-end gap-2"><Button onClick={() => setWipe(false)} data-autofocus>Keep them</Button><Button variant="danger" onClick={() => { setWipe(false); void deleteAllSessions(); }}>Delete all</Button></div></Dialog>
      <Dialog open={reset} onClose={() => setReset(false)} title="Reset preferences?" description="Your name, voice, theme and wake-word settings in this browser go back to the defaults.">
        <div className="flex justify-end gap-2"><Button onClick={() => setReset(false)} data-autofocus>Cancel</Button><Button variant="primary" onClick={() => { setReset(false); try { localStorage.removeItem("settings"); } catch {} setSettings({ name: "", voice: "Sulafat", rate: 1, speak: true, convo: true, srLang: "en-IN", showTools: true, wake: false, wakeWord: "", theme: "light" }); toast("Preferences reset."); }}>Reset</Button></div></Dialog>
    </div>
  );
}
