"use client";
import { useStore } from "@/lib/store";
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className="pointer-events-auto max-w-md animate-rise rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-pop">{t.text}</div>)}
    </div>
  );
}
