"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import Login from "@/components/Login";
import Shell from "@/components/Shell";

export default function Page() {
  const { ready, authed, init, settings } = useStore();
  useEffect(() => { void init(); }, [init]);
  useEffect(() => { document.documentElement.dataset.accent = settings.accent; }, [settings.accent]);
  if (!ready) return <div className="h-dvh grid place-items-center"><div className="h-10 w-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin" aria-label="Loading" /></div>;
  return authed ? <Shell /> : <Login />;
}
