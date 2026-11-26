# Interaction Test Report

Run date: 2026-11-26 · Tool: Playwright (Chromium) · Script: `web/e2e/interact.js`

**Result: 99/99 checks passed** against the mock backend (`web/e2e/mock.js`), plus 14/14 against the **real FastAPI backend in demo mode** (`web/e2e/real-backend.js`).

## Safety of the test run
- Every request goes to a mock; nothing real is sent (no mail, WhatsApp, calendar edits, PC commands).
- The microphone is replaced by a fake `SpeechRecognition` class (modes: ok, denied, no-microphone, absent). No audio is recorded.
- The real-backend run only creates throw-away notes/tasks/reminders and **cancels** the one confirmation it triggers; no tool is executed.

## Results by area

### Local PC mode (13/13)

| # | Check | Result |
|---|---|---|
| 1 | no login screen when the PC backend lets the PC in | pass |
| 2 | header says PC connected (not 'PC offline') | pass |
| 3 | greeting uses the configured user name | pass |
| 4 | overview shows model name from /api/config | pass |
| 5 | overview shows Voice 'Available' | pass |
| 6 | integrations tile counts only real flags | pass |
| 7 | Create a note opens a dialog and focuses its field | pass |
| 8 | note saved through POST /api/notes | pass |
| 9 | dialog closed and focus returned to the trigger | pass |
| 10 | reminder saved through POST /api/reminders with minutes | pass |
| 11 | Search Google opens Chat with a pre-filled draft (nothing sent yet) | pass |
| 12 | Open Chrome sends an ordinary chat message | pass |
| 13 | no page errors in local mode basics | pass |

### Chat workspace (14/14)

| # | Check | Result |
|---|---|---|
| 1 | empty chat shows the voice hero and suggestions | pass |
| 2 | Shift+Enter adds a new line instead of sending | pass |
| 3 | Enter sends the multiline message | pass |
| 4 | assistant reply is rendered with a timestamp | pass |
| 5 | Copy response puts the reply on the clipboard | pass |
| 6 | tool chip appears for an executed tool | pass |
| 7 | backend error reply is shown as a failed request | pass |
| 8 | Reset asks first and focuses the safe option | pass |
| 9 | Reset calls POST /api/reset and clears the chat | pass |
| 10 | New chat starts an empty conversation | pass |
| 11 | opening a stored conversation loads its history | pass |
| 12 | a failed tool in history is flagged | pass |
| 13 | deleting a conversation calls DELETE /api/sessions/{id} | pass |
| 14 | no page errors in chat | pass |

### Confirmations (risky actions) (13/13)

| # | Check | Result |
|---|---|---|
| 1 | a pending action opens a global alert dialog | pass |
| 2 | dialog states the intent, the affected application and the risk | pass |
| 3 | focus starts on Cancel (the safe choice) | pass |
| 4 | keyboard focus stays trapped inside the dialog | pass |
| 5 | the chat bubble has no second set of approve buttons | pass |
| 6 | Escape cancels: POST /api/confirm approved=false with the server-issued id | pass |
| 7 | dialog closed afterwards | pass |
| 8 | email confirmation lists recipient, subject and body | pass |
| 9 | Confirm sends approved=true with the matching id | pass |
| 10 | result is reported only after the backend answered | pass |
| 11 | WhatsApp confirmation names the contact and message | pass |
| 12 | Automation lists the approved action as Completed and the cancelled as absent | pass |
| 13 | no page errors in confirmations | pass |

### Automation center and activity (8/8)

| # | Check | Result |
|---|---|---|
| 1 | local /api/activity shape does not crash the UI (regression) | pass |
| 2 | chat shows a live status while a tool runs | pass |
| 3 | Automation shows the current task with the tool name | pass |
| 4 | history lists completed and failed executions | pass |
| 5 | category filter narrows the list to WhatsApp | pass |
| 6 | Overview 'Recent activity' mirrors the real log | pass |
| 7 | cloud-mode step list is shown while running | pass |
| 8 | no page errors in cloud activity | pass |

### Notes, tasks, reminders, memory (12/12)

| # | Check | Result |
|---|---|---|
| 1 | adding a note posts it and lists it | pass |
| 2 | note search filters the list | pass |
| 3 | notes show their creation date | pass |
| 4 | tasks split into pending and completed | pass |
| 5 | toggling a task calls the toggle endpoint | pass |
| 6 | adding a task posts it | pass |
| 7 | reminders separate due from upcoming | pass |
| 8 | adding a reminder sends the chosen minutes | pass |
| 9 | memory lists the saved facts from GET /api/memory | pass |
| 10 | memory search filters facts | pass |
| 11 | 'Teach the assistant' opens chat with a draft, nothing is sent | pass |
| 12 | no page errors in productivity views | pass |

### Integrations (6/6)

| # | Check | Result |
|---|---|---|
| 1 | Google shows 'Needs authorization' with a Connect button | pass |
| 2 | no secret-looking values are rendered anywhere | pass |
| 3 | Re-check re-queries the backend and shows the time | pass |
| 4 | demo mode, disabled, enabled and error states are all distinguishable | pass |
| 5 | an engine error message is shown | pass |
| 6 | quick action WhatsApp is disabled with a reason when not set up | pass |

### Settings and appearance (12/12)

| # | Check | Result |
|---|---|---|
| 1 | settings has the required sections | pass |
| 2 | restart-needed options are labelled as such | pass |
| 3 | model name is shown read-only | pass |
| 4 | light is the default theme | pass |
| 5 | Dark theme applies and is saved | pass |
| 6 | theme survives a reload with no flash of the wrong theme | pass |
| 7 | System follows the OS colour scheme | pass |
| 8 | …and switches back when the OS changes | pass |
| 9 | changing the name updates the greeting | pass |
| 10 | Delete all asks first (danger dialog) | pass |
| 11 | it deletes every stored conversation via DELETE | pass |
| 12 | no page errors in settings | pass |

### Voice and microphone states (7/7)

| # | Check | Result |
|---|---|---|
| 1 | Listening is shown only once the recognizer started | pass |
| 2 | Stop returns to Idle | pass |
| 3 | permission denied is shown, never 'Listening' | pass |
| 4 | a missing microphone shows 'unavailable' | pass |
| 5 | no speech recognition: Talk is disabled and explains why | pass |
| 6 | wake word reports Active only when its recognizer started | pass |
| 7 | wake word with a blocked microphone is NOT shown as active | pass |

### Cloud mode, login and offline (9/9)

| # | Check | Result |
|---|---|---|
| 1 | cloud mode: PC offline is reported from the cloud status | pass |
| 2 | PC-only quick actions are disabled with a reason | pass |
| 3 | cloud mode: WhatsApp is 'Not reported' (the cloud always says false) instead of a false 'Needs setup' | pass |
| 4 | memory says it is unavailable when the backend has no /api/memory | pass |
| 5 | cloud mode requires sign-in | pass |
| 6 | a wrong PIN shows an accessible error | pass |
| 7 | the right PIN opens the app | pass |
| 8 | sign out returns to the login screen | pass |
| 9 | an unreachable backend shows Offline, not Ready | pass |

### Mobile navigation (5/5)

| # | Check | Result |
|---|---|---|
| 1 | closed mobile sidebar is inert (not focusable, not read by screen readers) | pass |
| 2 | menu opens and moves focus inside the drawer | pass |
| 3 | Escape closes the drawer and returns focus to the menu button | pass |
| 4 | choosing a destination closes the drawer and loads the view | pass |
| 5 | a mic button is in the top bar on mobile | pass |

### Real backend, demo mode (14/14)

| # | Check | Result |
|---|---|---|
| 1 | PC UI is served by the backend and needs no login on the PC | pass |
| 2 | status is 'PC connected' (mode detected from /api/ping) | pass |
| 3 | model comes from the real /api/config | pass |
| 4 | /api/config exposes integration flags and no secret | pass |
| 5 | a note is saved through the real POST /api/notes and listed | pass |
| 6 | a task is created and completed through the real endpoints | pass |
| 7 | a reminder appears under Upcoming | pass |
| 8 | GET /api/memory works (counts include the new note) | pass |
| 9 | integration states reflect the real backend (demo = Disabled) | pass |
| 10 | the real backend's confirmation opens the dialog with a server-issued id | pass |
| 11 | cancelling is accepted by the backend and nothing was executed | pass |
| 12 | a normal message round-trips through the real /api/chat | pass |
| 13 | history is stored: the conversation appears in the sidebar list | pass |
| 14 | no page errors against the real backend | pass |

## Defects found during this work, each now covered by a test
| Found | Fix |
|---|---|
| Local `/api/activity` shape (`{tool,args,seconds}`) crashed the old UI during any slow request | `normalizeActivity()` accepts both backend shapes (regression test: "local /api/activity shape does not crash") |
| Local backend always showed "PC offline" | mode detected from `/api/ping`; local = PC connected |
| The cloud backend always reports `whatsapp:false`; the UI turned that into "Needs setup" and disabled the WhatsApp quick action | WhatsApp state is only trusted in local mode; cloud shows "Not reported" |
| Wake word listener ignored every event after login (stale generation guard) | guard removed; interval is cleared on stop |
| Empty-chat orb clipped at the top on phones (auto-scroll to bottom) | no auto-scroll while the chat is empty |
| Add-forms exposed a redundant landmark per form | `aria-label` removed from `<form>`; the input keeps its label |

## Not covered (be aware)
- Real speech recognition accuracy, real microphone permission prompts, and real audio playback.
- Real Gmail/Calendar/WhatsApp/Windows automation (intentionally never exercised from UI tests).
- Safari, Firefox and real phones; only Chromium with viewport emulation.
- The hosted Vercel deployment and the cloud backend end to end (only the cloud *response shapes* are mocked).
- Tests are not yet in CI (they need Playwright browsers); see FRONTEND_IMPLEMENTATION.md for how to run them.
