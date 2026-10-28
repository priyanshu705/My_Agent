"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" role="status">
      <AnimatePresence>{toasts.map((t) => <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong rounded-full px-4 py-2 text-sm">{t.text}</motion.div>)}</AnimatePresence>
    </div>
  );
}
