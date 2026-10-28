"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { voice } from "@/lib/voice";
import type { UiState } from "@/lib/types";

/** Audio-reactive canvas orb. Reacts to mic input while listening and to speech output while speaking. */
export default function Orb({ size = 220, forceState, onClick }: { size?: number; forceState?: UiState; onClick?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<UiState>("idle");
  const ui = useStore((s) => s.ui);
  stateRef.current = forceState ?? ui;

  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr; ctx.scale(dpr, dpr);
    let raf = 0, t = 0, lvl = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rgb = () => {
      const cs = getComputedStyle(document.documentElement);
      return [cs.getPropertyValue("--accent").trim().replace(/ /g, ","), cs.getPropertyValue("--accent2").trim().replace(/ /g, ",")];
    };
    const draw = () => {
      t += reduce ? 0 : 0.016;
      const st = stateRef.current;
      const target = st === "speaking" || st === "listening" ? voice.level() : st === "thinking" ? .35 + Math.sin(t * 5) * .15 : .08 + Math.sin(t * 1.2) * .04;
      lvl += (target - lvl) * .15;
      const [a, b] = rgb(); const c = size / 2; const base = size * .27;
      ctx.clearRect(0, 0, size, size);
      // halo
      const g = ctx.createRadialGradient(c, c, base * .6, c, c, size * .5);
      g.addColorStop(0, `rgba(${a},${.28 + lvl * .4})`); g.addColorStop(1, `rgba(${a},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      // morphing blobs
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        const N = 64, amp = base * (.08 + lvl * .35) * (1 + k * .15), spin = st === "thinking" ? 2.2 : 0.8;
        for (let i = 0; i <= N; i++) {
          const ang = (i / N) * Math.PI * 2;
          const r = base * (1 + k * .06) + amp * (Math.sin(ang * 3 + t * spin + k) * .6 + Math.sin(ang * 5 - t * spin * 1.3 + k * 2) * .4);
          const x = c + Math.cos(ang) * r, y = c + Math.sin(ang) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(c - base, c - base, c + base, c + base);
        grad.addColorStop(0, `rgba(${a},${k === 0 ? .95 : .25})`); grad.addColorStop(1, `rgba(${b},${k === 0 ? .95 : .25})`);
        if (k === 0) { ctx.fillStyle = grad; ctx.fill(); } else { ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      // specular
      const hl = ctx.createRadialGradient(c - base * .35, c - base * .4, 2, c - base * .2, c - base * .2, base);
      hl.addColorStop(0, "rgba(255,255,255,.55)"); hl.addColorStop(.5, "rgba(255,255,255,.06)"); hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath(); ctx.arc(c, c, base * .98, 0, 7); ctx.fillStyle = hl; ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} onClick={onClick} style={{ width: size, height: size }} className={onClick ? "cursor-pointer" : ""} role={onClick ? "button" : "img"} aria-label="Assistant status orb" />;
}
