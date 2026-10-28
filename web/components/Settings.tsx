"use client";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play } from "lucide-react";
import { useStore } from "@/lib/store";
import { CLOUD_VOICES } from "@/lib/voice";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="text-slate-300">{label}</span>{children}</label>;
const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-accent" : "bg-white/15"}`}><i className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></button>
);

export default function Settings() {
  const { settingsOpen, set, settings, setSettings, playSample, cfg, connectGoogle } = useStore();
  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => set({ settingsOpen: false })}>
          <motion.div role="dialog" aria-modal="true" aria-label="Settings" className="glass-strong w-full max-w-md rounded-3xl p-6" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: .97 }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Settings</h2><button aria-label="Close settings" onClick={() => set({ settingsOpen: false })} className="rounded-lg p-1 hover:bg-white/10"><X size={18} /></button></div>
            <div className="divide-y divide-white/5">
              <Row label="Your name"><input value={settings.name} onChange={(e) => setSettings({ name: e.target.value })} placeholder={cfg.user_name || "Name"} className="w-40 rounded-lg hairline bg-black/25 px-3 py-1.5 text-right outline-none focus:border-accent/50" /></Row>
              <Row label="Voice">
                <span className="flex items-center gap-2">
                  <select value={settings.voice} onChange={(e) => setSettings({ voice: e.target.value })} className="max-w-[170px] rounded-lg hairline bg-ink-800 px-2 py-1.5 text-xs outline-none">{CLOUD_VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <button type="button" aria-label="Play sample" onClick={() => void playSample()} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20"><Play size={13} /></button>
                </span>
              </Row>
              <Row label={`Speed · ${settings.rate.toFixed(2)}×`}><input type="range" min={0.8} max={1.3} step={0.05} value={settings.rate} onChange={(e) => setSettings({ rate: +e.target.value })} className="w-40 accent-[rgb(var(--accent))]" /></Row>
              <Row label="Speak replies"><Toggle on={settings.speak} onChange={(v) => setSettings({ speak: v })} label="Speak replies" /></Row>
              <Row label="Hands-free conversation"><Toggle on={settings.convo} onChange={(v) => setSettings({ convo: v })} label="Hands-free conversation" /></Row>
              <Row label="Show tool chips"><Toggle on={settings.showTools} onChange={(v) => setSettings({ showTools: v })} label="Show tool chips" /></Row>
              <Row label="Mic language">
                <select value={settings.srLang} onChange={(e) => setSettings({ srLang: e.target.value })} className="rounded-lg hairline bg-ink-800 px-2 py-1.5 text-xs outline-none">
                  {[["en-IN", "English (India)"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["hi-IN", "Hindi"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Row>
              <Row label="Accent colour">
                <span className="flex gap-2">{[["cyan", "#22d3ee"], ["violet", "#a78bfa"], ["green", "#34d399"], ["amber", "#fbbf24"]].map(([k, c]) => <button key={k} type="button" aria-label={k} onClick={() => setSettings({ accent: k })} style={{ background: c }} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-ink-900 ${settings.accent === k ? "ring-2 ring-white" : ""}`} />)}</span>
              </Row>
              <Row label="Google (Gmail + Calendar)">{cfg.google_connected ? <span className="text-xs text-emerald-300">Connected</span> : cfg.google_ready ? <button type="button" onClick={() => void connectGoogle()} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">Connect</button> : <span className="text-xs text-slate-500">Not configured</span>}</Row>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
