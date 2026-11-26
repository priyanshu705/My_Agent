"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import Login from "@/components/Login";
import Shell from "@/components/Shell";

export default function Page() {
  const { ready, authed, init } = useStore();
  useEffect(() => { void init(); }, [init]);
  if (!ready) return <div className="grid h-dvh place-items-center bg-bg"><div role="status" aria-label="Loading" className="h-10 w-10 animate-spin rounded-full border-2 border-primary/25 border-t-primary" /></div>;
  return authed ? <Shell /> : <Login />;
}
