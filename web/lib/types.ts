export type Role = "user" | "bot" | "sys";
export type ToolAction = { tool: string; args?: Record<string, unknown>; result?: string };
export type Confirm = { id?: string; tool: string; args: Record<string, unknown> };
export type Msg = {
  id: string; role: Role; text: string; at: string; actions?: ToolAction[]; confirm?: Confirm | null;
  pendingJob?: number | null; error?: boolean;
};
export type Step = { phase: string; tool?: string; label: string; ms: number };
export type Activity = { phase: string; tool?: string; label?: string; steps: Step[]; done: boolean };
export type Session = { id: string; title: string; updated: string; count?: number };
export type Todo = { i: number; task: string; done: boolean; at?: string };
export type Note = { i?: number; text: string; at?: string };
export type Reminder = { text: string; due: string };
export type CalEvent = { title: string; day: string; time: string; location?: string };
export type Mail = { from: string; subject: string; snippet: string };

export type Theme = "light" | "dark" | "system";
export type Settings = {
  name: string; voice: string; rate: number; speak: boolean; convo: boolean; srLang: string; showTools: boolean;
  wake: boolean; wakeWord: string; theme: Theme;
};
export type UiState = "idle" | "listening" | "thinking" | "speaking";
export type VoiceIssue = "denied" | "unavailable" | "error" | null;
export type View = "overview" | "chat" | "automation" | "notes" | "tasks" | "reminders" | "memory" | "integrations" | "settings";
export type Mode = "local" | "cloud";

/** Non-secret integration flags reported by the PC backend (/api/config). Absent on the cloud backend. */
export type IntegrationFlags = {
  gemini_key?: boolean; llm_router?: boolean; whatsapp_session?: boolean; browser_agent?: boolean; desktop_automation?: boolean;
  wake_engine_enabled?: boolean; wake_engine_running?: boolean; wake_engine_error?: string;
};
export type Cfg = {
  user_name?: string; agent_name?: string; wake_word?: string; wake_engine?: string; recognition_lang?: string;
  google_ready?: boolean; google_connected?: boolean; needs_setup?: string[]; has_key?: boolean; demo?: boolean;
  local_tts?: boolean; model?: string; integrations?: IntegrationFlags; tunnel_url?: string; phone_url?: string;
};

export type ActionStatus = "completed" | "failed" | "pending";
export type ActionLog = { id: string; tool: string; args?: Record<string, unknown>; result: string; at: string; status: ActionStatus };
export type Memory = { facts: string[]; counts: { notes: number; todos_open: number; facts: number } };
