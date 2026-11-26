"use client";
import clsx from "clsx";
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

export const cn = clsx;

/* ---------- Buttons ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-card",
  secondary: "bg-card text-ink border border-line hover:bg-primary-soft",
  ghost: "text-ink hover:bg-primary-soft",
  danger: "bg-danger-solid text-white hover:brightness-95 shadow-card",
};
export function Button({ variant = "secondary", size = "md", loading, icon: Icon, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: LucideIcon }) {
  return (
    <button type="button" {...p} disabled={p.disabled || loading}
      className={cn("inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] px-3 text-sm" : size === "lg" ? "min-h-[48px] px-5 text-base" : "min-h-[44px] px-4 text-sm", VARIANT[variant], className)}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : Icon ? <Icon size={16} aria-hidden /> : null}{children}
    </button>
  );
}
export function IconButton({ label, icon: Icon, className, active, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} {...p}
      className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-primary-text disabled:opacity-40", active && "bg-primary-soft text-primary-text", className)}>
      <Icon size={18} aria-hidden />
    </button>
  );
}

/* ---------- Surfaces ---------- */
export function Card({ className, children, as: As = "section", ...p }: { className?: string; children: ReactNode; as?: "section" | "div" | "li" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return <As {...(p as any)} className={cn("rounded-2xl border border-line bg-card shadow-card", className)}>{children}</As>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{children}</h2>{right}</div>;
}
export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center px-4 py-8 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary-text"><Icon size={20} aria-hidden /></span>
      <p className="text-sm font-medium">{title}</p>{hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}{action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------- Status ---------- */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const TONE: Record<Tone, { chip: string; dot: string }> = {
  success: { chip: "bg-success-soft text-success-text", dot: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning-text", dot: "bg-warning" },
  danger: { chip: "bg-danger-soft text-danger-text", dot: "bg-danger" },
  info: { chip: "bg-primary-soft text-primary-text", dot: "bg-primary" },
  neutral: { chip: "bg-line/60 text-muted", dot: "bg-muted" },
};
export function Badge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", TONE[tone].chip, className)}>{dot && <i aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONE[tone].dot)} />}{children}</span>;
}

/* ---------- Form ---------- */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-muted/50")}>
      <i aria-hidden className={cn("absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all", on ? "left-[26px]" : "left-0.5")} />
    </button>
  );
}
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn("min-h-[44px] w-full rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary", className)} />;
}
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-[55%]"><label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/* ---------- Focus management / dialog ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const root = ref.current; if (!root) return;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.offsetParent !== null);
    const first = root.querySelector<HTMLElement>("[data-autofocus]") || items()[0]; first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) { e.stopPropagation(); onEscape(); return; }
      if (e.key !== "Tab") return;
      const els = items(); if (!els.length) return;
      const a = els[0], z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    root.addEventListener("keydown", onKey);
    return () => { root.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [active, onEscape]);
  return ref;
}

export function Dialog({ open, onClose, title, description, children, role = "dialog", tone = "info", wide }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; role?: "dialog" | "alertdialog"; tone?: Tone; wide?: boolean;
}) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && role === "dialog") onClose(); }}>
      <div ref={ref} role={role} aria-modal="true" aria-labelledby="dlg-title" aria-describedby={description ? "dlg-desc" : undefined}
        className={cn("max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-pop animate-rise sm:rounded-2xl", wide ? "sm:max-w-xl" : "sm:max-w-md",
          tone === "warning" ? "border-warning" : tone === "danger" ? "border-danger" : "border-line")}>
        <h2 id="dlg-title" className="text-lg font-semibold">{title}</h2>
        {description && <p id="dlg-desc" className="mt-1 text-sm text-muted">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = "Working" }: { label?: string }) { return <Loader2 size={16} className="animate-spin text-primary-text" role="img" aria-label={label} />; }
