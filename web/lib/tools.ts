// Metadata for the tools the assistant can really call (names match app/*_tools.py). The UI uses it only to
// LABEL things (category, how risky) — it never decides what is allowed; the backend still enforces confirmation.
export type Category = "browser" | "desktop" | "web" | "gmail" | "calendar" | "whatsapp" | "memory" | "system";
export type Risk = "read" | "reversible" | "sensitive" | "unclassified";

export const CATEGORY_LABEL: Record<Category, string> = {
  browser: "Browser automation", desktop: "Desktop control", web: "Web search", gmail: "Gmail", calendar: "Calendar",
  whatsapp: "WhatsApp", memory: "Memory", system: "Local system",
};
export const RISK_LABEL: Record<Risk, string> = {
  read: "Read-only", reversible: "Reversible", sensitive: "Sensitive — needs approval", unclassified: "Action",
};

const T = (category: Category, risk: Risk) => ({ category, risk });
const TOOLS: Record<string, { category: Category; risk: Risk }> = {
  // desktop
  open_app: T("desktop", "reversible"), close_app: T("desktop", "sensitive"), list_running_apps: T("desktop", "read"),
  type_text: T("desktop", "sensitive"), press_keys: T("desktop", "sensitive"),
  windows_snapshot: T("desktop", "read"), windows_click: T("desktop", "sensitive"), windows_type: T("desktop", "sensitive"),
  windows_shortcut: T("desktop", "sensitive"), windows_scroll: T("desktop", "reversible"), windows_open_app: T("desktop", "reversible"),
  // local system
  search_files: T("system", "read"), open_file: T("system", "reversible"), list_folder: T("system", "read"),
  set_volume: T("system", "reversible"), mute_volume: T("system", "reversible"), take_screenshot: T("system", "reversible"),
  lock_screen: T("system", "sensitive"), system_status: T("system", "read"), get_datetime: T("system", "read"),
  // web
  open_website: T("web", "reversible"), google_search: T("web", "reversible"), play_youtube: T("web", "reversible"),
  // memory
  add_note: T("memory", "reversible"), list_notes: T("memory", "read"), add_todo: T("memory", "reversible"),
  list_todos: T("memory", "read"), complete_todo: T("memory", "reversible"), add_reminder: T("memory", "reversible"),
  list_reminders: T("memory", "read"), remember_fact: T("memory", "reversible"), save_contact: T("memory", "reversible"),
  find_contact: T("memory", "read"), list_contacts: T("memory", "read"),
  // gmail
  gmail_list_unread: T("gmail", "read"), gmail_search: T("gmail", "read"), gmail_read: T("gmail", "read"),
  find_email_address: T("gmail", "read"), gmail_create_draft: T("gmail", "reversible"), gmail_send: T("gmail", "sensitive"),
  // calendar
  calendar_list_events: T("calendar", "read"), calendar_find_free_time: T("calendar", "read"),
  calendar_add_event: T("calendar", "reversible"), calendar_update_event: T("calendar", "sensitive"), calendar_delete_event: T("calendar", "sensitive"),
  // whatsapp
  whatsapp_send: T("whatsapp", "sensitive"), whatsapp_send_file: T("whatsapp", "sensitive"), whatsapp_schedule: T("whatsapp", "sensitive"),
  whatsapp_unread: T("whatsapp", "read"), whatsapp_read_chat: T("whatsapp", "read"), whatsapp_list_scheduled: T("whatsapp", "read"),
  whatsapp_cancel_scheduled: T("whatsapp", "reversible"),
  // browser
  browser_open: T("browser", "reversible"), browser_state: T("browser", "read"), browser_click: T("browser", "reversible"),
  browser_type: T("browser", "reversible"), browser_select: T("browser", "reversible"), browser_press: T("browser", "reversible"),
  browser_scroll: T("browser", "read"), browser_back: T("browser", "read"), browser_upload_file: T("browser", "reversible"),
  browser_click_final: T("browser", "sensitive"), browser_login_window: T("browser", "reversible"), browser_close: T("browser", "reversible"),
  browser_task: T("browser", "reversible"), run_on_pc: T("desktop", "unclassified"),
};

export function toolInfo(name: string): { category: Category; risk: Risk; label: string } {
  const t = TOOLS[name];
  const label = name.replace(/_/g, " ");
  if (t) return { ...t, label };
  const guess: Category = /^gmail|mail/.test(name) ? "gmail" : /^calendar/.test(name) ? "calendar" : /^whatsapp/.test(name) ? "whatsapp"
    : /^browser/.test(name) ? "browser" : /^windows/.test(name) ? "desktop" : "system";
  return { category: guess, risk: "unclassified", label };
}

/** Argument names the backend sends, mapped to a human label so a confirmation says exactly who/what is affected. */
export const ARG_LABEL: Record<string, string> = {
  app_name: "Application", to: "Recipient", subject: "Subject", body: "Message body", message: "Message", file_path: "File",
  caption: "Caption", at_time: "Scheduled for", text: "Text to type", keys: "Keys", summary: "Operation", x: "Screen X", y: "Screen Y",
  event_id: "Event", new_start: "New start", new_end: "New end", title: "Title", _label: "Element", site: "Website", url: "Website",
};
const HIDDEN_ARGS = new Set(["_label"]);
export function describeArgs(args: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(args || {})
    .filter(([k, v]) => !HIDDEN_ARGS.has(k) && v !== "" && v != null)
    .map(([k, v]) => ({ label: ARG_LABEL[k] || k.replace(/_/g, " "), value: typeof v === "string" ? v : JSON.stringify(v) }));
}

/** A tool result counts as failed only when the backend says so; otherwise it is reported as "completed" (as returned). */
export function resultFailed(result?: string): boolean {
  return /^(error\b|browser error|could not|unknown tool|.*\b(is blocked|was blocked)\b|that path is outside|those keys are not allowed|i do not know)/i.test((result || "").trim());
}
