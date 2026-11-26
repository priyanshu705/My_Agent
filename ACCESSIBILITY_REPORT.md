# Accessibility Report (target: WCAG 2.2 AA)

Run date: 2026-11-26 · Tools: axe-core (rules tagged wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) in Chromium · Script: `web/e2e/a11y.js`

**Result: 38/38 audited pages have zero axe violations; 18/18 structural checks pass.**

## Scope of the automated audit
38 pages = 9 views × 2 themes (light, dark) × 2 viewports (1440×900 and 390×844), plus the confirmation dialog in both themes. Contrast is evaluated by axe in both themes.

## Structural checks

| Check | Result |
|---|---|
| exactly one <h1> in overview | pass |
| exactly one <h1> in chat | pass |
| exactly one <h1> in automation | pass |
| exactly one <h1> in notes | pass |
| exactly one <h1> in tasks | pass |
| exactly one <h1> in reminders | pass |
| exactly one <h1> in memory | pass |
| exactly one <h1> in integrations | pass |
| exactly one <h1> in settings | pass |
| landmarks: header, nav (Main), main, aside present | pass |
| document language is set | pass |
| a polite live region announces assistant status | pass |
| keyboard focus has a visible ≥2px outline | pass |
| every image/canvas is decorative or labelled (no unlabeled role=img) | pass |
| first Tab stop is the 'Skip to content' link | pass |
| activating the skip link moves focus into the main content | pass |
| reduced motion: no infinite CSS animations are running | pass |
| 200% text size at 320px: no horizontal scrolling (WCAG 1.4.4 / 1.4.10) | pass |

## Keyboard and focus (from the interaction suite)
- Dialogs trap focus, close on Esc, restore focus to the trigger; the confirmation dialog starts on **Cancel**.
- The mobile drawer traps focus, closes on Esc and is `inert` while closed (not focusable, not read).
- A skip link is the first Tab stop; navigating to a view moves focus into the main region.
- Every control has a ≥ 2 px focus outline (`:focus-visible`).

## Screen-reader support (by construction; checked by axe rules, **not** with a real screen reader)
- Landmarks: header, navigation "Main", main, complementary sidebar; one `<h1>` per view.
- A polite live region announces assistant state changes ("Thinking…", "Waiting for your confirmation") without re-reading the whole chat.
- The chat is a `role="log"`; tool chips have text alternatives ("returned a result" / "failed"); orb has a state label.
- Errors use `role="alert"`; confirmations use `role="alertdialog"`.

## Reduced motion
With `prefers-reduced-motion: reduce` no infinite CSS animation is running; the orb is drawn once per state change.

## Issues found by the audit and fixed
| Found | WCAG | Fix |
|---|---|---|
| Overview counters were a `<dl>` containing buttons | 1.3.1 | list of buttons |
| Counter buttons had an `aria-label` that did not contain the visible text | 2.5.3 Label in Name | visible text is the name |
| Disclosure summary 16 px tall, slider 16 px tall | 2.5.8 | enlarged (see responsive report) |
| Muted brand colour `#64748B` is 4.48:1 on the page background | 1.4.3 | text uses `#5C6B82` (5.10:1) |
| Brand success/warning/danger fail as small text on white | 1.4.3 | text variants + labelled chips (see DESIGN_SYSTEM.md) |
| Redundant form landmarks | best practice | removed |

## What automation cannot prove (needs a human)
Automated tools find roughly a third of accessibility problems. **Not yet verified:** a real screen reader (NVDA/JAWS/VoiceOver) walkthrough, voice-control dictation of control names, high-contrast / forced-colours mode, zoom at 400 % on real devices, and cognitive aspects such as wording. The "Not tested" list in INTERACTION_TEST_REPORT.md also applies.
