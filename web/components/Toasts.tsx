"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";

/** Short notices close by themselves; the timer waits while the pointer or keyboard is on them. Sticky ones stay. */
function Toast({ id, text, sticky }: { id: string; text: string; sticky?: boolean }) {
  const dismiss = useStore((s) => s.dismissToast);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (sticky || held) return;
    const t = setTimeout(() => dismiss(id), 5500);
    return () => clearTimeout(t);
  }, [id, sticky, held, dismiss]);
  return (
    <div onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
      className="pointer-events-auto flex max-w-md animate-rise items-center gap-1 rounded-xl border border-line bg-card py-1 pl-4 pr-1 text-sm shadow-pop">
      <span className="py-2">{text}</span>
      <button type="button" onClick={() => dismiss(id)} aria-label="Dismiss message" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary-text"><X size={16} aria-hidden /></button>
    </div>
  );
}

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6" role="status" aria-live="polite">
      {toasts.map((t) => <Toast key={t.id} {...t} />)}
    </div>
  );
}
