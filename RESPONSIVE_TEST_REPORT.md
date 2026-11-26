# Responsive Test Report

Run date: 2026-11-26 · Tool: Playwright (Chromium, viewport emulation) · Script: `web/e2e/responsive.js`

**Result: 96/96 layouts passed** (9 viewports × 9 views, plus 15 empty-data layouts).

## What "pass" means
For each layout the script loads the app with realistic mock data and fails it if any of these is true:
1. the page scrolls horizontally (`scrollWidth > innerWidth`)
2. any visible element extends past the right edge (outside a deliberate scroll container or SVG)
3. any interactive control is smaller than **24×24 px** (WCAG 2.2 SC 2.5.8, AA)
4. the browser console reports an error

## Matrix (viewport × view)

| Viewport | overview | chat | automation | notes | tasks | reminders | memory | integrations | settings |
|---|---|---|---|---|---|---|---|---|---|
| 320x568 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 375x812 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 390x844 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 430x932 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 768x1024 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 1024x768 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 1366x768 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 1440x900 | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| 1920x1080 | pass | pass | pass | pass | pass | pass | pass | pass | pass |

Required sizes covered: 320×568, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080.

## Empty-data layouts

| Layout | Result |
|---|---|
| 320x568 · overview (empty data) | pass |
| 320x568 · chat (empty data) | pass |
| 320x568 · tasks (empty data) | pass |
| 320x568 · memory (empty data) | pass |
| 320x568 · automation (empty data) | pass |
| 768x1024 · overview (empty data) | pass |
| 768x1024 · chat (empty data) | pass |
| 768x1024 · tasks (empty data) | pass |
| 768x1024 · memory (empty data) | pass |
| 768x1024 · automation (empty data) | pass |
| 1440x900 · overview (empty data) | pass |
| 1440x900 · chat (empty data) | pass |
| 1440x900 · tasks (empty data) | pass |
| 1440x900 · memory (empty data) | pass |
| 1440x900 · automation (empty data) | pass |

## Touch-target size (advisory)
Every control is ≥ 24 px (AA). Controls below the 44 px comfort size at a mouse pointer (small buttons and filter chips are 40 px; they become 44 px under `pointer: coarse`, which this emulation does not trigger):

| Viewport | Controls under 44 px |
|---|---|
| 320x568 | 30 |
| 375x812 | 31 |
| 390x844 | 31 |
| 430x932 | 32 |
| 768x1024 | 39 |
| 1024x768 | 44 |
| 1366x768 | 44 |
| 1440x900 | 49 |
| 1920x1080 | 50 |

## Layout behaviour by breakpoint
- **< 1024 px**: the sidebar becomes an off-canvas drawer (focus-trapped, Esc closes, inert while closed); the top bar gains a microphone button.
- **≥ 1024 px**: fixed 264 px sidebar; Overview and Automation use multi-column grids; chat column is capped at 3xl for readability.
- **320 px**: Overview tiles, quick actions, forms and dialogs stack to one column; dialogs become bottom sheets.

## Defects found by this sweep and fixed
| Found | Fix |
|---|---|
| "How to set this up" disclosure was 16 px tall (18 layouts failed) | summary is now a 44 px row |
| Speed slider hit area was 16 px tall | `h-11` |
| Switch (28 px) and task checkbox (28 px) were small | 32 px switch (56 px wide), 32 px checkbox |
| Small buttons and chips were 36 px | 40 px, 44 px on coarse pointers |

## Not covered
- Real devices, real touch input (`pointer: coarse`), browser UI chrome (address bar resize), landscape phones, and Safari/Firefox rendering.
- Screenshots from this sweep are written to `web/e2e/shots/responsive/` (git-ignored, 96 images). Curated screenshots are committed as `web/e2e/shots/after-*.png`.
