"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { useStore } from "@/lib/store";
import Orb from "./Orb";
import { Button, Card } from "./ui";

export default function Login() {
  const { login, loggingIn, loginError } = useStore();
  const [pin, setPin] = useState("");
  const [secure, setSecure] = useState(false);
  useEffect(() => { setSecure(location.protocol === "https:"); }, []);
  return (
    <main id="main" className="grid h-dvh place-items-center overflow-y-auto bg-bg px-4 py-8">
      <Card as="div" className="w-full max-w-sm p-7 text-center shadow-pop">
        <form onSubmit={(e) => { e.preventDefault(); if (pin) void login(pin); }} noValidate>
          <div className="mx-auto grid place-items-center"><Orb size={104} state="idle" label="My Agent" /></div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">My Agent</h1>
          <p className="mt-1 text-sm text-muted">Your personal AI operating system. Sign in to continue.</p>
          <label htmlFor="pin" className="mt-6 block text-left text-sm font-medium">Access PIN</label>
          <div className="mt-1 flex min-h-[44px] items-center gap-2 rounded-lg border border-control bg-card px-3 outline-2 outline-offset-1 outline-primary focus-within:border-primary focus-within:outline">
            <Lock size={16} className="text-muted" aria-hidden />
            <input id="pin" type="password" autoFocus autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} aria-describedby={loginError ? "pin-err" : undefined} aria-invalid={!!loginError}
              className="w-full bg-transparent py-2.5 text-sm outline-none" />
          </div>
          {loginError && <p id="pin-err" role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-left text-sm text-danger-text">{loginError}</p>}
          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={loggingIn} disabled={!pin}>Sign in <ArrowRight size={16} aria-hidden /></Button>
          <p className="mt-4 text-xs text-muted">{secure ? "Encrypted in transit · session expires in 30 days" : "Session expires in 30 days · this connection is not encrypted"}</p>
        </form>
      </Card>
    </main>
  );
}
