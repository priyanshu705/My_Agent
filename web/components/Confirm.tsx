"use client";
import { Check, ShieldAlert, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { CATEGORY_LABEL, RISK_LABEL, describeArgs, toolInfo } from "@/lib/tools";
import { Badge, Button, Dialog } from "./ui";
import type { Confirm, Msg } from "@/lib/types";

/** Plain-language intent: the backend's own wording ("Please confirm: send an email to …"), never rewritten by the UI. */
export const intentOf = (m: Msg) => m.text.replace(/^please confirm:\s*/i, "").replace(/\.?\s*(yes or no|haan ya na)\??$/i, "").trim();

export function ConfirmDetails({ c, intent }: { c: Confirm; intent: string }) {
  const info = toolInfo(c.tool); const rows = describeArgs(c.args);
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-warning-soft px-3.5 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-warning-text">The assistant wants to</p>
        <p className="mt-0.5 text-[15px] font-medium text-ink">{intent || info.label}</p>
      </div>
      <div className="flex flex-wrap gap-1.5"><Badge tone="warning">{RISK_LABEL[info.risk]}</Badge><Badge tone="neutral" dot={false}>{CATEGORY_LABEL[info.category]}</Badge><Badge tone="neutral" dot={false}>Tool: {info.label}</Badge></div>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line px-3.5 py-3 text-sm">
          {rows.map((r) => (<div key={r.label} className="contents"><dt className="text-muted">{r.label}</dt><dd className="min-w-0 break-words font-medium">{r.value}</dd></div>))}
        </dl>
      )}
      <p className="text-xs text-muted">Nothing happens until you choose Confirm. Cancel stops the action.</p>
    </div>
  );
}

/** The only place a pending action can be approved. It is mounted at the app root, so it is visible from every screen. */
export default function ConfirmDialog() {
  const { msgs, confirm, busy } = useStore();
  const m = [...msgs].reverse().find((x) => x.confirm);
  const c = m?.confirm ?? null;
  return (
    <Dialog open={!!c} onClose={() => void confirm(false)} title="Approve this action?" role="alertdialog" tone="warning" wide
      description="Review exactly what will happen before it runs.">
      {c && m && (
        <>
          <ConfirmDetails c={c} intent={intentOf(m)} />
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button icon={X} onClick={() => void confirm(false)} disabled={busy} data-autofocus>Cancel</Button>
            <Button variant="primary" icon={Check} onClick={() => void confirm(true)} disabled={busy}>Confirm</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Read-only record of a request that is waiting; the buttons live in ConfirmDialog only. */
export function PendingNote() {
  return <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-text"><ShieldAlert size={13} aria-hidden /> Waiting for your confirmation</p>;
}
