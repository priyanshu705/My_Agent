import { resultFailed, toolInfo } from "./tools";
import type { Activity, ActionLog, Msg, Step } from "./types";

export const IDLE_ACT: Activity = { phase: "idle", steps: [], done: true };

/** Both backends answer /api/activity differently; turn either shape into one Activity model.
 *  cloud: { phase, tool, label, steps[], done }     local PC: { tool, args, seconds }  (tool is "" when idle) */
export function normalizeActivity(raw: any): Activity {
  if (raw && Array.isArray(raw.steps)) return { phase: raw.phase || "idle", tool: raw.tool, label: raw.label, steps: raw.steps as Step[], done: raw.done !== false };
  const tool = raw && typeof raw.tool === "string" ? raw.tool : "";
  if (!tool) return IDLE_ACT;
  const label = toolInfo(tool).label;
  return { phase: "tool", tool, label, done: false, steps: [{ phase: "tool", tool, label, ms: Math.round((Number(raw.seconds) || 0) * 1000) }] };
}

/** Executed tools shown in Overview / Automation, built only from what the backend returned in the conversation. */
export function buildLog(msgs: Msg[]): ActionLog[] {
  const out: ActionLog[] = [];
  msgs.forEach((m, mi) => {
    (m.actions || []).forEach((a, i) => {
      out.push({ id: `${m.id}-${i}`, tool: a.tool, args: a.args, result: String(a.result ?? ""), at: m.at, status: resultFailed(a.result) ? "failed" : "completed" });
    });
    if (m.confirm && mi === msgs.length - 1) out.push({ id: `${m.id}-confirm`, tool: m.confirm.tool, args: m.confirm.args, result: "Waiting for your approval", at: m.at, status: "pending" });
  });
  return out.reverse();
}

export type AssistantStatus = { key: "ready" | "understanding" | "thinking" | "searching" | "executing" | "confirm" | "completing" | "error" | "offline"; label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" };
const SEARCHY = /search|news|weather|find|read|list|unread|snapshot|state/;

/** Single source of truth for "what is the assistant doing right now" (header, chat strip, live region). */
export function assistantStatus(o: { online: boolean; busy: boolean; pendingConfirm: boolean; activity: Activity; lastError: boolean }): AssistantStatus {
  if (!o.online) return { key: "offline", label: "Offline", tone: "danger" };
  if (o.pendingConfirm) return { key: "confirm", label: "Waiting for your confirmation", tone: "warning" };
  if (o.busy) {
    const s = o.activity.steps[o.activity.steps.length - 1];
    if (!s) return { key: "thinking", label: "Thinking…", tone: "info" };
    if (s.phase === "understand") return { key: "understanding", label: "Understanding your request…", tone: "info" };
    if (s.phase === "tool" || s.phase === "pc_tool") {
      const t = s.tool || o.activity.tool || "";
      return SEARCHY.test(t) ? { key: "searching", label: `Searching — ${toolInfo(t).label}…`, tone: "info" } : { key: "executing", label: `Running ${toolInfo(t).label}…`, tone: "info" };
    }
    if (s.phase === "pc") return { key: "executing", label: "Running on your PC…", tone: "info" };
    if (s.phase === "answer" || s.phase === "done") return { key: "completing", label: "Completing…", tone: "info" };
    return { key: "thinking", label: "Thinking…", tone: "info" };
  }
  if (o.lastError) return { key: "error", label: "Last request failed", tone: "danger" };
  return { key: "ready", label: "Ready", tone: "success" };
}

export function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const today = new Date(); const same = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return same ? `Today, ${t}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${t}`;
}
