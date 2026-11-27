"use client";
import { fmtDate } from "@/lib/activity";
import { Button, Input, cn } from "./ui";

/** When a reminder should fire: after some minutes, or at a date and time. The backend takes minutes. */
export type When = { mode: "in" | "at"; mins: string; at: string };
export const DEFAULT_WHEN: When = { mode: "in", mins: "30", at: "" };
const MAX_MINUTES = 60 * 24 * 365;

/** Whole minutes from now, or null when the choice is empty, in the past or more than a year away. */
export function minutesFor(w: When, now = Date.now()): number | null {
  const n = w.mode === "in" ? (w.mins.trim() ? Number(w.mins) : NaN) : Math.ceil((new Date(w.at).getTime() - now) / 60000);
  return Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES ? n : null;
}

export default function ReminderWhen({ value, onChange, id, presets }: { value: When; onChange: (w: When) => void; id: string; presets?: boolean }) {
  const mins = minutesFor(value);
  const due = mins === null ? "" : fmtDate(new Date(Date.now() + mins * 60000).toISOString());
  return (
    <div className="space-y-2">
      <div role="group" aria-label="When to remind" className="flex flex-wrap items-center gap-2">
        {([["in", "In minutes"], ["at", "At a time"]] as const).map(([mode, label]) => (
          <Button key={mode} size="sm" variant={value.mode === mode ? "primary" : "secondary"} aria-pressed={value.mode === mode} onClick={() => onChange({ ...value, mode })}>{label}</Button>))}
        {value.mode === "in" ? (<>
          {presets && [10, 30, 60, 180].map((m) => <Button key={m} size="sm" variant={value.mins === String(m) ? "primary" : "secondary"} aria-pressed={value.mins === String(m)} onClick={() => onChange({ ...value, mins: String(m) })}>{m < 60 ? `${m} min` : `${m / 60} h`}</Button>)}
          <span className="w-28"><Input id={id} type="number" min={1} max={MAX_MINUTES} value={value.mins} onChange={(e) => onChange({ ...value, mins: e.target.value })} aria-label="Minutes from now" aria-invalid={mins === null} aria-describedby={`${id}-preview`} /></span>
        </>) : (
          <span className="w-60 max-w-full"><Input id={id} type="datetime-local" value={value.at} onChange={(e) => onChange({ ...value, at: e.target.value })} aria-label="Date and time" aria-invalid={mins === null} aria-describedby={`${id}-preview`} /></span>
        )}
      </div>
      <p id={`${id}-preview`} aria-live="polite" className={cn("text-xs", mins === null ? "text-danger-text" : "text-muted")}>
        {mins !== null ? `Will remind you: ${due}` : value.mode === "in" ? "Enter 1 or more minutes." : "Choose a date and time in the future."}
      </p>
    </div>
  );
}
