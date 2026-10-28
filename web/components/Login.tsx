"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import Orb from "./Orb";

export default function Login() {
  const { login, loggingIn, loginError } = useStore();
  const [pin, setPin] = useState("");
  return (
    <main className="relative h-dvh overflow-hidden grid place-items-center px-4 noise">
      <div className="absolute inset-0 dots opacity-70" />
      <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-accent/20 blur-[120px] animate-aurora" />
      <div className="absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full bg-accent2/20 blur-[130px] animate-aurora" />
      <motion.form initial={{ opacity: 0, y: 24, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .6, ease: [.2, .8, .2, 1] }}
        onSubmit={(e) => { e.preventDefault(); if (pin) void login(pin); }}
        className="glass-strong relative w-full max-w-sm rounded-3xl p-8 text-center">
        <div className="mx-auto h-28 w-28"><Orb size={112} forceState="idle" /></div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">My <span className="text-gradient">Agent</span></h1>
        <p className="mt-1 text-sm text-slate-400">Your personal AI. Sign in to continue.</p>
        <label className="mt-6 flex items-center gap-2 rounded-xl hairline bg-black/30 px-3 focus-within:border-accent/60 transition">
          <Lock size={16} className="text-slate-500" />
          <input type="password" autoFocus autoComplete="current-password" placeholder="Access PIN" value={pin} onChange={(e) => setPin(e.target.value)}
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-500" aria-label="Access PIN" />
        </label>
        {loginError && <p role="alert" className="mt-3 text-xs text-rose-300">{loginError}</p>}
        <button disabled={loggingIn || !pin} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm disabled:opacity-50">
          {loggingIn ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}
        </button>
        <p className="mt-4 text-[11px] text-slate-500">Encrypted in transit · session token expires in 30 days</p>
      </motion.form>
    </main>
  );
}
