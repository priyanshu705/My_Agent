# My_Agent Design System

Premium, calm, voice-first. Light SaaS surface, dark-navy sidebar, indigo AI accent. Dark theme is a first-class
alternative; light is the default.

All tokens live in `web/app/globals.css` as **RGB triplets** (so Tailwind can apply opacity) and are mapped to
Tailwind colours in `web/tailwind.config.ts`. Components never use raw hex values.

## 1. Colour tokens

| Token | Light | Dark | Used for |
|---|---|---|---|
| `bg` | `#F7F8FC` | `#0B1020` | page background |
| `card` | `#FFFFFF` | `#141B2D` | cards, dialogs, inputs |
| `border` (`line`) | `#E8EAF0` | `#26304A` | hairlines, dividers |
| `text` (`ink`) | `#1F2937` | `#E5E7EB` | body and headings |
| `muted` | `#5C6B82` | `#9AA6BC` | secondary text (AA-safe variant of brand `#64748B`) |
| `sidebar` | `#111827` | `#080C18` | navigation rail |
| `sidebar-2` | `#232C42` | `#1E273E` | active / hover nav item |
| `primary` | `#5856D6` | `#5856D6` | buttons, active states, orb |
| `primary-hover` | `#4B49C8` | `#6A68E4` | button hover |
| `primary-soft` | `#EEEEFC` | `#21224A` | tinted surfaces, icon tiles |
| `primary-text` | `#5856D6` | `#8B89F0` | links and accent text |
| `success` / `-text` / `-soft` | `#16A36A` / `#0B7A4B` / `#E7F6EF` | `#34D399` / `#34D399` / `#10342A` | fill+dot / text / chip bg |
| `warning` / `-text` / `-soft` | `#E59A32` / `#8A5300` / `#FDF3E3` | `#F5B455` / `#F5B455` / `#3A2A10` | |
| `danger` / `-text` / `-soft` | `#DC4C4C` / `#B42F2F` / `#FCEBEB` | `#F87171` / `#F87171` / `#3E181C` | |
| `danger-solid` | `#C73B3B` | `#C73B3B` | destructive button fill (white text, 5.1:1) |

### Two deliberate deviations from the brand palette
1. **Muted text is `#5C6B82`, not `#64748B`.** The brand value measures 4.48:1 on the `#F7F8FC` page background, just under WCAG AA 4.5:1.
2. **Brand success / warning / danger are fills, dots and borders only.** On white they measure 3.24, 2.33 and 4.05:1, so
   they cannot be small text. Text and chips use the darker `-text` variants on the `-soft` background.

### Measured contrast
| Theme | Pair | Ratio | AA text (4.5) |
|---|---|---|---|
| Light | Text #1F2937 on page #F7F8FC | 13.83:1 | pass |
| Light | Text on card | 14.68:1 | pass |
| Light | Muted #5C6B82 on page | 5.10:1 | pass |
| Light | Muted #5C6B82 on card | 5.41:1 | pass |
| Light | Brand muted #64748B on page (not used for text) | 4.48:1 | **fail — not used for text** |
| Light | Primary link #5856D6 on card | 5.65:1 | pass |
| Light | White on primary button | 5.65:1 | pass |
| Light | Primary on primary-soft | 4.92:1 | pass |
| Light | Success text #0B7A4B on soft | 4.83:1 | pass |
| Light | Warning text #8A5300 on soft | 5.76:1 | pass |
| Light | Danger text #B42F2F on soft | 5.38:1 | pass |
| Light | White on danger button #C73B3B | 5.10:1 | pass |
| Light | Brand success #16A36A on card (fills/dots only) | 3.24:1 | **fail — not used for text** |
| Light | Brand warning #E59A32 on card (fills/dots only) | 2.33:1 | **fail — not used for text** |
| Light | Brand danger #DC4C4C on card (fills/dots only) | 4.05:1 | **fail — not used for text** |
| Sidebar | Text #CBD5E1 on #111827 | 11.95:1 | pass |
| Sidebar | Muted #94A3B8 on #111827 | 6.92:1 | pass |
| Sidebar | White on active item #232C42 | 13.90:1 | pass |
| Dark | Text #E5E7EB on page #0B1020 | 15.29:1 | pass |
| Dark | Muted #9AA6BC on card #141B2D | 6.99:1 | pass |
| Dark | Primary text #8B89F0 on card | 5.66:1 | pass |
| Dark | Success #34D399 on card | 8.92:1 | pass |
| Dark | Warning #F5B455 on card | 9.43:1 | pass |
| Dark | Danger #F87171 on card | 6.20:1 | pass |

Status is never conveyed by colour alone: every badge carries a text label, and failed/pending rows also use a different icon.

## 2. Typography
- **Inter** (variable), self-hosted through `@fontsource-variable/inter`, so the offline PC build needs no network at runtime.
- System-ui fallback; monospace only for code-like content.

| Role | Classes | Size |
|---|---|---|
| Page title | `text-xl sm:text-2xl font-semibold tracking-tight` | 20 / 24 px |
| Card / section title | `text-sm font-semibold` | 14 px |
| Body | `text-sm`, chat `text-[15px] leading-relaxed` | 14–15 px |
| Caption / meta | `text-xs text-muted` | 12 px |
| Overline | `text-[11px] font-semibold uppercase tracking-wider` | 11 px |

## 3. Shape, elevation, spacing
- Radii: `md 10` · `lg 12` (buttons, inputs) · `xl 14` (tiles) · `2xl 16` (cards, dialogs).
- Shadows: `shadow-card` (1–3 px, 4–5 % opacity) for resting surfaces; `shadow-pop` only for dialogs and toasts.
- Spacing scale: Tailwind 4 px grid. Page padding `16 px` mobile, `24 px` ≥ sm; card padding `16–20 px`.
- Layout: sidebar 264 px (drawer below 1024 px), content max-width `6xl`, chat column max-width `3xl`.

## 4. Components (`web/components/ui.tsx`)
| Component | Variants / notes |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger`; sizes `sm` (40 px, 44 px on touch), `md` 44, `lg` 48; `loading`, `icon` |
| `IconButton` | 44 px square, required `label` (becomes `aria-label` + tooltip) |
| `Card`, `PageHeader`, `SectionTitle`, `EmptyState` | surfaces and page scaffolding |
| `Badge` | tones `success`, `warning`, `danger`, `info`, `neutral`; dot + text |
| `Switch` | `role="switch"`, 56×32 px |
| `Input`, `Field` | 44 px high; `Field` pairs label, hint and control (stacks on mobile) |
| `Dialog` | modal with focus trap, Esc, focus restore; `role="alertdialog"` for confirmations; bottom sheet on mobile |
| `useFocusTrap` | reusable trap used by Dialog and the mobile drawer |

Feature components: `Sidebar`, `Shell`, `Overview`, `Chat` (+ `Message`, composer), `Voice` (`VoicePanel`, `Wave`), `Orb`,
`Confirm` (`ConfirmDialog`, `ConfirmDetails`), `Automation` (`ExecutionCard`, `Timeline`, `FlowGraph`), `Productivity`
(`Notes`, `Tasks`, `Reminders`, `MemoryView`), `Integrations`, `Settings`, `Login`, `Toasts`.

## 5. Safety semantics (labels, never permissions)
`web/lib/tools.ts` maps every real backend tool to a **category** (Browser, Desktop, Web, Gmail, Calendar, WhatsApp, Memory,
Local system) and a **risk** label. The UI only *labels* with it; the backend still decides what needs confirmation.

| Risk | Meaning | Examples |
|---|---|---|
| Read-only | changes nothing | list/search/read tools |
| Reversible | can be undone or is low impact | open app, add note, create draft |
| Sensitive — needs approval | external effect or control of the PC | send mail/WhatsApp, type, shortcuts, close app, change/delete event, final browser click |
| Pending | waiting for the user | shown in the confirmation dialog |
| Failed | backend returned an error | red row + "Failed" badge |

A tool result is shown as **Completed** only when the backend returned without an error string; the UI never asserts success on its own.

## 6. Voice orb states
| State | Visual | Trigger (truthful) |
|---|---|---|
| Idle | slow breathing indigo sphere | nothing active |
| Listening | expanding ripples + live level waveform | recognizer **has started** |
| Processing | rotating arc | request in flight |
| Speaking | ripples + waveform from playback level | audio is playing |
| Wake-word active | dashed breathing ring | engine confirmed running (browser recognizer started, or offline engine reports `running`) |
| Permission denied | grey sphere, red ring, shield icon | browser reported `not-allowed` |
| Microphone unavailable | grey sphere, amber ring, mic-off icon | `audio-capture` / no recognizer |
| Error | grey sphere, red ring, warning icon | recognition error (e.g. network) |

## 7. Motion
- Entrances 220 ms ease-out (`rise`); no decorative loops except the orb, spinners and the working indicator.
- The orb pauses when the tab is hidden. With `prefers-reduced-motion` the orb is drawn once per state change and all CSS
  animation/transition durations collapse to ~0.

## 8. Theme mechanics
- `html[data-theme="light" | "dark"]`; the preference (`light` default, `dark`, `system`) is saved in `localStorage.settings.theme`.
- An inline script in `app/layout.tsx` applies it before first paint, so there is no flash. `system` follows
  `prefers-color-scheme` live.

## 9. Adding or changing a token
1. Add the RGB triplet to both `:root` blocks in `globals.css`.
2. Map it in `tailwind.config.ts` with `v("name")`.
3. Check contrast with the table above (text needs ≥ 4.5:1, UI components ≥ 3:1) and re-run `node e2e/a11y.js`.
