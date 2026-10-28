const TOKEN_KEY = "ctoken";
export const getToken = (): string => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
export const setToken = (t: string) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export class AuthError extends Error {}
let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

type Opts = Omit<RequestInit, "body"> & { json?: unknown; timeout?: number };

export async function apiRaw(path: string, opts: Opts = {}): Promise<Response> {
  const { json, timeout = 65000, headers, ...rest } = opts;
  const h: Record<string, string> = { ...(headers as Record<string, string> | undefined) };
  const tok = getToken();
  if (tok) h.Authorization = "Bearer " + tok;
  let body: BodyInit | undefined;
  if (json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(path, { ...rest, headers: h, body, signal: opts.signal ?? ctrl.signal, cache: "no-store" });
    if (r.status === 401 && path !== "/api/login") { onAuthLost?.(); throw new AuthError("Your session expired. Please sign in again."); }
    return r;
  } finally { clearTimeout(timer); }
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const r = await apiRaw(path, opts);
  let data: any = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error((data && (data.detail || data.message)) || `Request failed (${r.status})`);
  return data as T;
}
