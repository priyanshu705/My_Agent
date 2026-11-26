"use client";
import { useEffect, useRef } from "react";
import { AlertTriangle, MicOff, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { voice } from "@/lib/voice";

export type OrbState = "idle" | "listening" | "processing" | "speaking" | "wake" | "denied" | "unavailable" | "error";
export const ORB_LABEL: Record<OrbState, string> = {
  idle: "Idle", listening: "Listening", processing: "Processing", speaking: "Speaking", wake: "Waiting for the wake word",
  denied: "Microphone permission denied", unavailable: "Microphone unavailable", error: "Voice error",
};

/** The orb state shown to the user. It is derived from what is really happening, never from a button press alone. */
export function useOrbState(): OrbState {
  const ui = useStore((s) => s.ui); const issue = useStore((s) => s.voiceIssue); const wake = useStore((s) => s.wakeActive);
  const busy = useStore((s) => s.busy);
  if (issue === "denied") return "denied";
  if (issue === "unavailable") return "unavailable";
  if (issue === "error") return "error";
  if (ui === "listening") return "listening";
  if (ui === "speaking") return "speaking";
  if (ui === "thinking" || busy) return "processing";
  if (wake) return "wake";
  return "idle";
}

const rgb = (name: string) => getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim().replace(/ /g, ",");

/** Canvas orb: indigo sphere, glow and rings. Animates only while visible and never when reduced motion is requested. */
export default function Orb({ size = 160, state, onClick, label }: { size?: number; state?: OrbState; onClick?: () => void; label?: string }) {
  const own = useOrbState(); const st = state ?? own;
  const ref = useRef<HTMLCanvasElement>(null); const stRef = useRef<OrbState>(st); stRef.current = st;
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0, t = 0, lvl = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => {
      t += reduce ? 0 : 0.016;
      const s = stRef.current; const c = size / 2; const base = size * 0.28;
      const bad = s === "denied" || s === "unavailable" || s === "error";
      const target = s === "speaking" || s === "listening" ? voice.level() : s === "processing" ? 0.3 + Math.sin(t * 4) * 0.1 : s === "wake" ? 0.12 + Math.sin(t * 1.6) * 0.05 : 0.07 + Math.sin(t * 1.1) * 0.03;
      lvl += (target - lvl) * 0.15;
      const main = bad ? rgb("muted") : rgb("primary"); const light = bad ? rgb("border") : rgb("primary-text");
      const ring = s === "denied" || s === "error" ? rgb("danger") : s === "unavailable" ? rgb("warning") : main;
      ctx.clearRect(0, 0, size, size);
      // glow
      const g = ctx.createRadialGradient(c, c, base * 0.5, c, c, size * 0.5);
      g.addColorStop(0, `rgba(${main},${bad ? 0.1 : 0.28 + lvl * 0.35})`); g.addColorStop(1, `rgba(${main},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      // state rings
      if (s === "listening" || s === "speaking") {
        for (let k = 0; k < 2; k++) { const ph = (t * 0.7 + k * 0.5) % 1; ctx.beginPath(); ctx.arc(c, c, base * (1.05 + ph * 0.55), 0, 7); ctx.strokeStyle = `rgba(${main},${(1 - ph) * 0.45})`; ctx.lineWidth = 2; ctx.stroke(); }
      } else if (s === "processing") {
        ctx.beginPath(); ctx.arc(c, c, base * 1.22, t * 3, t * 3 + Math.PI * 1.3); ctx.strokeStyle = `rgba(${main},.85)`; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke();
      } else if (s === "wake") {
        ctx.beginPath(); ctx.arc(c, c, base * (1.2 + Math.sin(t * 1.6) * 0.03), 0, 7); ctx.setLineDash([4, 6]); ctx.strokeStyle = `rgba(${main},.7)`; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      } else if (bad) {
        ctx.beginPath(); ctx.arc(c, c, base * 1.2, 0, 7); ctx.strokeStyle = `rgba(${ring},.9)`; ctx.lineWidth = 3; ctx.stroke();
      }
      // body
      const r = base * (1 + lvl * 0.35);
      const body = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r * 1.1);
      body.addColorStop(0, `rgb(${light})`); body.addColorStop(0.55, `rgb(${main})`); body.addColorStop(1, bad ? `rgb(${main})` : "rgb(60,58,170)");
      ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = body; ctx.fill();
      const hl = ctx.createRadialGradient(c - r * 0.4, c - r * 0.45, 1, c - r * 0.25, c - r * 0.3, r * 0.9);
      hl.addColorStop(0, "rgba(255,255,255,.6)"); hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = hl; ctx.fill();
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    drawRef.current = draw;
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(() => { if (reduce) draw(); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    draw();
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); mo.disconnect(); drawRef.current = null; };
  }, [size]);

  useEffect(() => { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) drawRef.current?.(); }, [st]);

  const Icon = st === "denied" ? ShieldAlert : st === "unavailable" ? MicOff : st === "error" ? AlertTriangle : null;
  const aria = label ?? `Voice assistant: ${ORB_LABEL[st]}`;
  const body = (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />
      {Icon && <span className="pointer-events-none absolute inset-0 grid place-items-center text-white"><Icon size={Math.round(size * 0.22)} aria-hidden /></span>}
    </span>
  );
  return onClick
    ? <button type="button" onClick={onClick} aria-label={aria} className="rounded-full">{body}</button>
    : <span role="img" aria-label={aria}>{body}</span>;
}
