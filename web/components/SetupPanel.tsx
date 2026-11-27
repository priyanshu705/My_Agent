"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, apiRaw } from "@/lib/api";
import { useStore } from "@/lib/store";
import { voice } from "@/lib/voice";
import { Badge, Button, Card, Input, SectionTitle, Switch } from "./ui";

type SetupField = { set: boolean; value?: string };
type Setup = { fields: Record<string, SetupField>; voice_engine: string; installed: Record<string, boolean>; restart_needed: string[] };
type Values = Record<string, string>;

const ENGINES: [string, string, string][] = [
  ["gemini", "Gemini (most human-like)", "Needs a free Gemini key and internet. Reply text goes to Google; on the free tier Google may use it to improve its products."],
  ["edge", "Edge online voice", "No key. Needs internet. Reply text goes to Microsoft."],
  ["kokoro", "Kokoro (offline)", "Stays on this PC. Hindi only, and downloads about 120 MB the first time."],
  ["browser", "Browser voice", "Whatever your browser offers. Usually sounds robotic."],
];
const NEEDS: Record<string, string> = { edge: "edge", kokoro: "kokoro" };

export default function SetupPanel() {
  const { refreshStatus, toast, settings, mode } = useStore();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [problem, setProblem] = useState("");
  const [draft, setDraft] = useState<Values>({});
  const [busy, setBusy] = useState("");
  const [test, setTest] = useState("");

  const load = useCallback(async () => {
    try { setSetup(await api<Setup>("/api/setup")); setProblem(""); }
    catch (e: any) { setSetup(null); setProblem(e?.message || "Settings are not available."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (card: string, values: Values) => {
    if (!Object.keys(values).length) { toast("Nothing to save."); return; }
    setBusy(card);
    try {
      setSetup(await api<Setup>("/api/setup", { method: "POST", json: { values }, headers: { "X-Agent-Setup": "1" } }));
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in values))));
      voice.reset(); setTest("");
      await refreshStatus();
      toast("Saved.");
    } catch (e: any) { toast(e?.message || "Could not save.", true); }
    finally { setBusy(""); }
  };

  const testVoice = async () => {
    setBusy("test"); setTest("Making a sample…");
    try {
      const r = await apiRaw("/api/tts", { method: "POST", json: { text: "Namaste! Main aapka agent hoon. Bataiye, aaj kya karna hai?", voice: settings.voice }, timeout: 25000 });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `Request failed (${r.status})`); }
      const url = URL.createObjectURL(await r.blob());
      const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url);
      await audio.play(); setTest("Playing the sample.");
    } catch (e: any) { setTest(e?.message || "The sample could not be played."); }
    finally { setBusy(""); }
  };

  if (!setup) {
    return problem ? <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="setup-unavailable">
      {mode === "cloud" ? "To change keys and features, open the app on the PC at http://localhost:8000." : problem}</p> : null;
  }

  const f = setup.fields;
  const typed = (names: string[]) => Object.fromEntries(names.filter((n) => draft[n]?.trim()).map((n) => [n, draft[n].trim()]));
  const set = (name: string, value: string) => setDraft((d) => ({ ...d, [name]: value }));

  const secret = (name: string, label: string, hint?: ReactNode) => (
    <div className="mt-3">
      <label htmlFor={`setup-${name}`} className="flex items-center justify-between gap-2 text-sm font-medium">{label}<Badge tone={f[name].set ? "success" : "neutral"}>{f[name].set ? "Saved" : "Not set"}</Badge></label>
      <div className="mt-1 flex gap-2">
        <Input id={`setup-${name}`} type="password" autoComplete="off" spellCheck={false} value={draft[name] || ""} onChange={(e) => set(name, e.target.value)} placeholder={f[name].set ? "Leave empty to keep the saved one" : "Paste here"} />
        {f[name].set && <Button size="sm" variant="ghost" aria-label={`Remove ${label}`} disabled={!!busy} onClick={() => { if (window.confirm(`Remove the saved ${label}?`)) void save(name, { [name]: "" }); }}>Remove</Button>}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  const engine = draft.VOICE_ENGINE || setup.voice_engine;
  const about = ENGINES.find(([id]) => id === engine)?.[2];
  const missing = NEEDS[engine] && !setup.installed[NEEDS[engine]];
  const urlValue = draft.LLM_ROUTER_URL ?? f.LLM_ROUTER_URL.value ?? "";
  const feature = (name: string, label: string, need: string, on: string) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0"><p className="text-sm font-medium">{label}</p>
        {!setup.installed[need] && <p className="text-xs text-warning-text">Extra packages are not installed (run setup_features.bat).</p>}</div>
      <Switch label={label} disabled={!!busy} on={f[name].value === on} onChange={(v) => void save(name, { [name]: v ? on : on === "1" ? "0" : "" })} />
    </div>
  );

  return (
    <section className="mb-5" data-testid="setup-panel">
      <SectionTitle>Set up from here</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4" as="article">
          <h3 className="text-sm font-semibold">Natural voice</h3>
          <label htmlFor="setup-engine" className="mt-3 block text-sm font-medium">Voice engine</label>
          <select id="setup-engine" value={engine} onChange={(e) => set("VOICE_ENGINE", e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-control bg-card px-3 text-sm text-ink">
            {ENGINES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">{about}</p>
          {missing && <p className="mt-1 text-xs text-warning-text">Its package is not installed yet.</p>}
          {engine === "gemini" && secret("GEMINI_TTS_KEY", "Gemini key for voice", <>Free key: <a className="text-primary-text underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>{f.GEMINI_API_KEY.set && !f.GEMINI_TTS_KEY.set ? ". Empty uses the AI model's Gemini key." : "."}</>)}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" loading={busy === "voice"} disabled={!!busy} onClick={() => void save("voice", { VOICE_ENGINE: engine, ...typed(engine === "gemini" ? ["GEMINI_TTS_KEY"] : []) })}>Save voice</Button>
            <Button size="sm" loading={busy === "test"} disabled={!!busy || engine !== setup.voice_engine || engine === "browser" || !!draft.GEMINI_TTS_KEY} onClick={() => void testVoice()}>Play sample</Button>
          </div>
          <p role="status" className="mt-2 text-xs text-muted">{test}</p>
        </Card>
        <Card className="p-4" as="article">
          <h3 className="text-sm font-semibold">AI model</h3>
          <p className="mt-1 text-xs text-muted">A Gemini key, or your own router address and key.</p>
          {secret("GEMINI_API_KEY", "Gemini API key")}
          <label htmlFor="setup-url" className="mt-3 block text-sm font-medium">Router address</label>
          <Input id="setup-url" className="mt-1" type="url" spellCheck={false} value={urlValue} onChange={(e) => set("LLM_ROUTER_URL", e.target.value)} placeholder="https://…/v1" />
          {secret("LLM_ROUTER_KEY", "Router key")}
          <Button className="mt-3" variant="primary" size="sm" loading={busy === "ai"} disabled={!!busy}
            onClick={() => void save("ai", { ...typed(["GEMINI_API_KEY", "LLM_ROUTER_KEY"]), ...(urlValue.trim() !== (f.LLM_ROUTER_URL.value || "") ? { LLM_ROUTER_URL: urlValue.trim() } : {}) })}>Save AI settings</Button>
        </Card>
        <Card className="p-4" as="article">
          <h3 className="text-sm font-semibold">Optional features</h3>
          <p className="mt-1 text-xs text-muted">Risky actions still ask you before they run.</p>
          {feature("BROWSER_AGENT", "Advanced browser agent", "browser_agent", "1")}
          {feature("WINDOWS_MCP", "Desktop automation", "desktop", "1")}
          {feature("WAKEWORD_ENGINE", "Offline wake word", "wake", "openwakeword")}
          {setup.restart_needed.length > 0 && <p role="status" className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-text">Restart the agent to apply the feature change.</p>}
        </Card>
      </div>
      <Card className="mt-4 p-4" as="article">
        <label htmlFor="setup-folders" className="text-sm font-semibold">Folders the agent can see</label>
        <p id="setup-folders-hint" className="mt-1 text-xs text-muted">Desktop, Documents, Downloads, Pictures, Videos, Music and OneDrive are always included. Add more as full paths separated by “;”, for example D:\placement. File and folder names from these places are sent to your AI model.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="min-w-0 flex-1 basis-64"><Input id="setup-folders" aria-describedby="setup-folders-hint" spellCheck={false} value={draft.FILE_ROOTS ?? f.FILE_ROOTS.value ?? ""} onChange={(e) => set("FILE_ROOTS", e.target.value)} placeholder="D:\placement" /></span>
          <Button variant="primary" size="sm" loading={busy === "folders"} disabled={!!busy || draft.FILE_ROOTS === undefined} onClick={() => void save("folders", { FILE_ROOTS: (draft.FILE_ROOTS || "").trim() })}>Save folders</Button>
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted">Saved on this PC in the .env file. Saved keys are never shown again. Google and WhatsApp still use their setup files (see below).</p>
    </section>
  );
}
