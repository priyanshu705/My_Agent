# Frontend Implementation Notes

How the redesigned `web/` UI is built, what it talks to, and what works where.

## 1. Which UI is for which mode (parity)

There is **one** UI: `web/` (Next.js 14, React 18, TypeScript, Tailwind, Framer Motion, Zustand, Lucide). The vanilla
`static/` and `cloud/static/` UIs were retired before this redesign, so there is nothing to keep in sync. What varies is
the **backend** the same UI talks to, and it detects which one with `GET /api/ping` (`{cloud:true}` on the cloud API).

| Deployment | How it is served | Backend | Sign-in |
|---|---|---|---|
| **Local PC** | `npm run build:local` → `web/out`, served by FastAPI at `http://localhost:8000` (`run.bat` builds it once) | `app/` (PC) | none on the PC itself; PIN over LAN / tunnel |
| **Hosted UI → cloud** | `npm run build` on Vercel, `/api/*` rewritten to the cloud API (`API_URL`) | `cloud/api/index.py` | PIN |
| **Hosted UI → tunnelled PC** | same hosted build, pointed at the PC's tunnel | `app/` (PC) | PIN |

### Screen support by backend
| Screen / feature | Local PC backend | Cloud backend | Notes |
|---|---|---|---|
| Overview, Chat, Automation | yes | yes | Cloud returns step lists (richer); PC returns only the running tool name |
| Model name | yes (`/api/config.model`) | "not reported" | |
| Integrations: Gemini, Google | yes | yes (`has_key`, `google_*`) | |
| Integrations: WhatsApp, browser, desktop, local TTS, wake engine | yes (`/api/config.integrations`, `dash.status.whatsapp`) | "Not reported" | The cloud always reports `whatsapp:false`; the UI ignores it outside local mode |
| Notes, Tasks, Reminders | yes | yes | Same endpoints |
| Saved memory | yes (`GET /api/memory`) | "Not available on this backend" | cloud has no such endpoint (404) |
| Wake word: browser recognizer | yes | yes | needs Chrome/Edge on localhost or https |
| Wake word: offline engine | yes (`/api/wake`) | no | |
| Reset conversation | yes | yes | PC forgets agent context; cloud deletes the stored messages |
| Delete all conversations | yes | yes | loops `DELETE /api/sessions/{id}` |
| Google connect button | n/a | yes (`/api/google/start`) | |

## 2. File map (`web/`)

```
app/
  layout.tsx      Inter font, pre-paint theme script, metadata
  globals.css     design tokens (light/dark), focus ring, skip link, reduced motion
  page.tsx        Login vs Shell
lib/
  api.ts          fetch wrapper (token, timeout, 401 handler)      (unchanged)
  store.ts        Zustand store: auth, mode, sessions, chat, voice state machine, wake word, timers
  types.ts        shared types (View, Mode, Settings, ActionLog, …)
  tools.ts        tool → category + risk labels, argument labels, "did this result fail?"
  activity.ts     normalise both /api/activity shapes, build the execution log, assistant status
  voice.ts        TTS + recognition + wake recognizer (engine; hardened earlier)
components/
  ui.tsx          Button, IconButton, Card, Badge, Switch, Input, Field, Dialog, useFocusTrap, …
  Sidebar.tsx     navigation, recent conversations, mobile drawer
  Shell.tsx       top bar, views, live status region, global dialogs
  Overview.tsx    status tiles, quick actions, recent activity, productivity
  Chat.tsx        messages, composer, reset, copy, working indicator
  Voice.tsx       VoicePanel (hero/bar), Wave
  Orb.tsx         canvas orb + the 8-state mapping
  Confirm.tsx     ConfirmDialog (the single place to approve), ConfirmDetails
  Automation.tsx  current task, filters, ExecutionCard history, Timeline, FlowGraph
  Productivity.tsx Notes, Tasks, Reminders, MemoryView
  Integrations.tsx integration cards + status derivation
  Settings.tsx    11 sections
  Login.tsx, Toasts.tsx
e2e/              mock backend + Playwright suites + generated reports (see §6)
```
Removed: `Dashboard.tsx`, `Timeline.tsx`, `FlowGraph.tsx`, `Composer.tsx` (their features moved into the files above),
the `geist` font package, and the neon "accent colour" setting.
Added dependencies: `@fontsource-variable/inter` (runtime), `cross-env` and `axe-core` (dev only).

## 3. State model (what is derived, not stored)

| Concept | Derived from |
|---|---|
| Mode (local/cloud) | `GET /api/ping` (`cloud:true`), hostname as fallback |
| "PC connected" | local: backend reachable; cloud: `dash.status.pc` |
| Assistant status text | `assistantStatus({online,busy,pendingConfirm,activity,lastError})` — one function feeds the header, chat strip and the screen-reader live region |
| Execution log / Recent activity | `buildLog(msgs)`: the `actions` the backend returned for each message; a failed one is flagged only when the result text is an error |
| Pending confirmation | the newest message with `confirm`; approved/cancelled through `POST /api/confirm` with the server's `confirm_id` |
| Orb state | `useOrbState()` from `ui`, `voiceIssue`, `wakeActive`, `busy` |

### Voice truthfulness rules
- `ui = "listening"` is set **after** `recognition.start()` succeeds, never before.
- Browser errors map to `voiceIssue`: `not-allowed` → denied, `audio-capture` → unavailable, others → error. The orb, the
  alert text and a toast all say so; "Listening" is never shown in those states.
- Wake word is "Active" only when the browser recognizer really started, or the offline engine's `/api/wake` reports
  `running` with no error. A denied microphone stops the retry loop instead of flickering.

### Safety rules kept
- All confirmations flow through the backend (`confirm_id`, one-time, session-bound). The UI added **no** auto-approve and
  **no** new capability. Quick actions send an ordinary chat message, so they hit the same agent and the same confirmations.
- The confirmation dialog is mounted at the app root, so it is visible from every screen, starts on **Cancel**, traps
  focus and cannot be hidden behind other activity. The in-chat bubble only records "Waiting for your confirmation".
- Secrets are never sent to the browser: `/api/config` carries booleans and the model name only (tested).

## 4. Backend changes (additive, read-only)
| Change | Why |
|---|---|
| `GET /api/memory` → `{facts, counts}` | the Memory screen; facts had no endpoint |
| `/api/config` + `model`, `integrations{gemini_key, llm_router, whatsapp_session, browser_agent, desktop_automation, wake_engine_enabled, wake_engine_running, wake_engine_error}` | model and integration states |
No existing route, request or response format changed. Tests: `tests/test_security.py` (no secrets in config, memory read-only).

## 5. Deviations and decisions
1. **Colours**: muted text uses `#5C6B82` (brand `#64748B` is 4.48:1); brand green/amber/red are fills only, text uses darker variants (DESIGN_SYSTEM.md).
2. **No fabricated data**: tasks have no due dates and fired reminders are deleted by the backend, so those states are not shown; notes are capped to the latest 12 by the backend and the UI says so.
3. **Settings** that live in `.env` (agent name, model, recognition default, local TTS, wake engine) are shown read-only with a "Restart needed" label; browser preferences are labelled "Applies now".
4. **Accent colour picker removed**: the brief fixes the palette to indigo; the theme setting is Light / Dark / System (light default).
5. **Light default** changes first-run appearance for existing users; their saved theme is respected once chosen.

## 6. Running things
```bash
cd web
npm install
npm run dev            # dev server (needs API_URL pointing at a backend)
npm run typecheck
npm run build          # hosted build
npm run build:local    # static export → web/out (served by the PC backend)
```
UI tests (need Playwright's Chromium; not part of CI):
```bash
cd web && npm run build:local && (cd out && python3 -m http.server 3112 --bind 127.0.0.1 &)
node e2e/interact.js     # interaction suite (mock backend)
node e2e/responsive.js   # 9 viewports × 9 views
node e2e/a11y.js         # axe-core WCAG audit + structure checks
UI_URL=http://127.0.0.1:8000/ node e2e/real-backend.js   # against a running demo backend (DEMO_MODE=1)
node e2e/after.js        # regenerate the curated screenshots
node e2e/report.js       # rebuild the three *_REPORT.md files from e2e/results/*.json
```

## 7. Known limitations
- Execution history is the current conversation only (the backend stores messages, not a global tool log).
- Progress for a running tool is indeterminate: the backends do not report percentages.
- Cloud mode cannot show WhatsApp/browser/desktop/TTS state (those are PC-side facts).
- Voice input needs Chrome or Edge on localhost or https (Web Speech API).
- Screen-reader, real-device and Safari/Firefox testing have not been done (see the reports).
