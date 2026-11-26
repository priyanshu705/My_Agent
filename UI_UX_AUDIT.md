# UI / UX Audit — before the redesign

Audited commit: `cc3c9d5` (`web/` after the legacy UIs were retired).
Method: code reading plus screenshots of the built UI driven by the mock backend in `web/e2e/mock.js`
(before-shots are in `web/e2e/shots/before-*.png`). Nothing real (mail, WhatsApp, calendar, microphone,
PC control) was touched.

## 1. Architecture findings

| Topic | Finding |
|---|---|
| UIs in the repo | One: `web/` (Next.js 14). `static/` and `cloud/static/` were retired in the previous change. |
| Deployment modes of `web/` | **Local**: `npm run build:local` → `web/out`, served by the PC backend at `localhost:8000`, same origin. **Hosted**: Vercel build proxying `/api/*` to the cloud backend, or to a tunnelled PC. |
| Parity | There is nothing left to keep in sync between UIs. What differs is the *backend* it talks to (local PC API vs cloud API), so the redesign must work against both response shapes. |

## 2. Functional defects found (fixed by the redesign)

1. **Local mode shows "PC offline" permanently.** `pcOnline` reads `status.pc`, which only the cloud API
   returns. On the PC backend the agent *is* the PC.
2. **Local-mode crash risk.** `/api/activity` on the PC backend returns `{tool, args, seconds}`; the UI
   expects `{phase, steps, done}`. A chat slower than the 600 ms poll would hit `a.steps.length` on
   `undefined`.
3. **No mode detection.** The UI cannot tell local from cloud, so it cannot hide or label cloud-only
   things (jobs, Google connect) or PC-only things.
4. **Status is not truthful.** `ui === "listening"` is set before the recognizer has started; there is
   no "permission denied" or "microphone unavailable" state, only a toast.
5. **Wake word has no visible active/inactive state** other than a text line.
6. **Confirmation lives only inside the chat bubble.** If the user is on the Dashboard tab (mobile) a
   pending confirmation is invisible.
7. **Reset conversation is not reachable** (`/api/reset` is never called by the UI).
8. **No copy-response**, no per-message error state (a failed backend reply looks like a normal reply).
9. **Calendar times wrap** into four lines in the 430 px side panel (`10:00 AM - 10:15 AM`).
10. **Notes/tasks are capped and not searchable**; reminders show only a time, not the date.

## 3. Information-architecture findings

- Everything is crammed into one screen: orb, chat, flow graph, timeline, tasks, calendar, mail,
  reminders, notes. There is no way to focus on one job.
- No overview: the user cannot see at a glance whether the assistant is ready, which integrations are
  connected, or what ran recently.
- Settings is a single modal with 8 unrelated controls; nothing explains what needs a restart, what is
  stored where, or what leaves the device.
- The three mobile tabs (Chat / Live / Dashboard) hide the conversation list entirely (it is only in the
  drawer).

## 4. Visual-design findings

- Dark neon "glass" theme: low-contrast secondary text (`text-slate-500` on near-black), many decorative
  layers (noise, dots, aurora blobs) that cost GPU for no information.
- Accent chosen from four neon colours at runtime; no stable brand identity.
- Mixed radii (`rounded-lg`/`xl`/`2xl`/`3xl`/`full`), no spacing or type scale, mono text used for times.
- The orb is the only voice affordance and has four states; denied / unavailable / error are invisible.

## 5. Accessibility findings (pre-change)

- Modal settings dialog has `role="dialog"` but no focus trap and no focus return.
- No skip link; no visible focus style beyond browser defaults on some controls.
- `aria-live` is on the whole chat log, which re-announces every update; no dedicated status region.
- Contrast: slate-500 (#64748B) on the dark background is below 4.5:1 for 10–11 px text used widely.
- Touch targets: several controls are 24–32 px (delete conversation, add buttons, tool chips).
- Reduced motion: a global CSS override exists (good), the orb already stops its loop.

## 6. What works and must be preserved

- Server-issued `confirm_id` flow, PIN login and token handling, stale-response guards, timers cleanup.
- Voice engine (TTS cache, recognition, wake word: offline engine + browser recognizer).
- Local static export and same-origin serving by the PC backend.
- Session list, history load, delete session, Google connect, dashboard add forms.

## 7. Redesign decisions that follow from the audit

1. One canonical shell with **9 views** (Overview, Chat, Automation, Notes, Tasks, Reminders, Memory,
   Integrations, Settings) instead of one crowded screen.
2. Detect **mode** (local/cloud) once from `/api/ping`; derive PC status correctly.
3. Normalise both `/api/activity` shapes into one internal model.
4. A **global confirmation dialog** that is visible from every view and cannot be bypassed.
5. Truthful voice state machine: `listening` only once the recognizer started; explicit
   denied / unavailable / error states; wake-word "active" only when the engine confirms it.
6. Only show data the backend really provides; additive read-only `GET /api/memory` and extra
   non-secret `/api/config` flags for the gaps (facts, model, integration status).
7. Light default with tokens given in the brief, dark and system themes, Inter self-hosted.
