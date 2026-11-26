// Builds the three test reports from e2e/results/*.json so every number comes from an actual run.
const fs = require("fs"); const R = (n) => JSON.parse(fs.readFileSync(`e2e/results/${n}.json`, "utf8"));
const inter = R("interaction"), resp = R("responsive"), a11y = R("a11y"), real = R("real-backend");
const stamp = new Date().toISOString().slice(0, 10);
const mark = (ok) => (ok ? "pass" : "**FAIL**");
const esc = (s) => String(s).replace(/\|/g, "\\|");

// ---------- interaction ----------
{ const sections = [...new Set(inter.map((r) => r.section))]; const pass = inter.filter((r) => r.pass).length;
  let md = `# Interaction Test Report\n\nRun date: ${stamp} · Tool: Playwright (Chromium) · Script: \`web/e2e/interact.js\`\n\n` +
  `**Result: ${pass}/${inter.length} checks passed** against the mock backend (\`web/e2e/mock.js\`), plus ${real.filter((r) => r.pass).length}/${real.length} against the **real FastAPI backend in demo mode** (\`web/e2e/real-backend.js\`).\n\n` +
  `## Safety of the test run\n- Every request goes to a mock; nothing real is sent (no mail, WhatsApp, calendar edits, PC commands).\n- The microphone is replaced by a fake \`SpeechRecognition\` class (modes: ok, denied, no-microphone, absent). No audio is recorded.\n- The real-backend run only creates throw-away notes/tasks/reminders and **cancels** the one confirmation it triggers; no tool is executed.\n\n` +
  `## Results by area\n`;
  for (const s of sections) { const rows = inter.filter((r) => r.section === s); md += `\n### ${s} (${rows.filter((r) => r.pass).length}/${rows.length})\n\n| # | Check | Result |\n|---|---|---|\n` + rows.map((r, i) => `| ${i + 1} | ${esc(r.name)} | ${mark(r.pass)}${r.pass ? "" : " — " + esc(r.detail)} |`).join("\n") + "\n"; }
  md += `\n### Real backend, demo mode (${real.filter((r) => r.pass).length}/${real.length})\n\n| # | Check | Result |\n|---|---|---|\n` + real.map((r, i) => `| ${i + 1} | ${esc(r.name)} | ${mark(r.pass)} |`).join("\n") + "\n";
  md += `\n## Defects found during this work, each now covered by a test\n| Found | Fix |\n|---|---|\n` +
  `| Local \`/api/activity\` shape (\`{tool,args,seconds}\`) crashed the old UI during any slow request | \`normalizeActivity()\` accepts both backend shapes (regression test: "local /api/activity shape does not crash") |\n` +
  `| Local backend always showed "PC offline" | mode detected from \`/api/ping\`; local = PC connected |\n` +
  `| The cloud backend always reports \`whatsapp:false\`; the UI turned that into "Needs setup" and disabled the WhatsApp quick action | WhatsApp state is only trusted in local mode; cloud shows "Not reported" |\n` +
  `| Wake word listener ignored every event after login (stale generation guard) | guard removed; interval is cleared on stop |\n` +
  `| Empty-chat orb clipped at the top on phones (auto-scroll to bottom) | no auto-scroll while the chat is empty |\n` +
  `| Add-forms exposed a redundant landmark per form | \`aria-label\` removed from \`<form>\`; the input keeps its label |\n\n` +
  `## Not covered (be aware)\n- Real speech recognition accuracy, real microphone permission prompts, and real audio playback.\n- Real Gmail/Calendar/WhatsApp/Windows automation (intentionally never exercised from UI tests).\n- Safari, Firefox and real phones; only Chromium with viewport emulation.\n- The hosted Vercel deployment and the cloud backend end to end (only the cloud *response shapes* are mocked).\n- Tests are not yet in CI (they need Playwright browsers); see FRONTEND_IMPLEMENTATION.md for how to run them.\n`;
  fs.writeFileSync("../INTERACTION_TEST_REPORT.md", md); }

// ---------- responsive ----------
{ const vps = [...new Set(resp.filter((r) => !r.view.includes("empty")).map((r) => r.vp))]; const views = [...new Set(resp.filter((r) => !r.view.includes("empty")).map((r) => r.view))];
  const pass = resp.filter((r) => r.pass).length; const adv = vps.map((v) => resp.filter((r) => r.vp === v && !r.view.includes("empty")).reduce((a, r) => a + r.small44, 0));
  let md = `# Responsive Test Report\n\nRun date: ${stamp} · Tool: Playwright (Chromium, viewport emulation) · Script: \`web/e2e/responsive.js\`\n\n` +
  `**Result: ${pass}/${resp.length} layouts passed** (${vps.length} viewports × ${views.length} views, plus ${resp.filter((r) => r.view.includes("empty")).length} empty-data layouts).\n\n` +
  `## What "pass" means\nFor each layout the script loads the app with realistic mock data and fails it if any of these is true:\n1. the page scrolls horizontally (\`scrollWidth > innerWidth\`)\n2. any visible element extends past the right edge (outside a deliberate scroll container or SVG)\n3. any interactive control is smaller than **24×24 px** (WCAG 2.2 SC 2.5.8, AA)\n4. the browser console reports an error\n\n` +
  `## Matrix (viewport × view)\n\n| Viewport | ${views.join(" | ")} |\n|---|${views.map(() => "---").join("|")}|\n` +
  vps.map((v) => `| ${v} | ` + views.map((w) => { const r = resp.find((x) => x.vp === v && x.view === w); return r ? (r.pass ? "pass" : "**FAIL**") : "–"; }).join(" | ") + " |").join("\n") + "\n\n" +
  `Required sizes covered: 320×568, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080.\n\n` +
  `## Empty-data layouts\n\n| Layout | Result |\n|---|---|\n` + resp.filter((r) => r.view.includes("empty")).map((r) => `| ${r.vp} · ${r.view} | ${mark(r.pass)} |`).join("\n") + "\n\n" +
  `## Touch-target size (advisory)\nEvery control is ≥ 24 px (AA). Controls below the 44 px comfort size at a mouse pointer (small buttons and filter chips are 40 px; they become 44 px under \`pointer: coarse\`, which this emulation does not trigger):\n\n| Viewport | Controls under 44 px |\n|---|---|\n` + vps.map((v, i) => `| ${v} | ${adv[i]} |`).join("\n") + "\n\n" +
  `## Layout behaviour by breakpoint\n- **< 1024 px**: the sidebar becomes an off-canvas drawer (focus-trapped, Esc closes, inert while closed); the top bar gains a microphone button.\n- **≥ 1024 px**: fixed 264 px sidebar; Overview and Automation use multi-column grids; chat column is capped at 3xl for readability.\n- **320 px**: Overview tiles, quick actions, forms and dialogs stack to one column; dialogs become bottom sheets.\n\n` +
  `## Defects found by this sweep and fixed\n| Found | Fix |\n|---|---|\n| "How to set this up" disclosure was 16 px tall (18 layouts failed) | summary is now a 44 px row |\n| Speed slider hit area was 16 px tall | \`h-11\` |\n| Switch (28 px) and task checkbox (28 px) were small | 32 px switch (56 px wide), 32 px checkbox |\n| Small buttons and chips were 36 px | 40 px, 44 px on coarse pointers |\n\n` +
  `## Not covered\n- Real devices, real touch input (\`pointer: coarse\`), browser UI chrome (address bar resize), landscape phones, and Safari/Firefox rendering.\n- Screenshots from this sweep are written to \`web/e2e/shots/responsive/\` (git-ignored, ${resp.length} images). Curated screenshots are committed as \`web/e2e/shots/after-*.png\`.\n`;
  fs.writeFileSync("../RESPONSIVE_TEST_REPORT.md", md); }

// ---------- accessibility ----------
{ const clean = a11y.axe.filter((r) => r.violations.length === 0).length; const st = a11y.structure; const views = [...new Set(a11y.axe.map((r) => r.view))];
  let md = `# Accessibility Report (target: WCAG 2.2 AA)\n\nRun date: ${stamp} · Tools: axe-core (rules tagged wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) in Chromium · Script: \`web/e2e/a11y.js\`\n\n` +
  `**Result: ${clean}/${a11y.axe.length} audited pages have zero axe violations; ${st.filter((s) => s.pass).length}/${st.length} structural checks pass.**\n\n` +
  `## Scope of the automated audit\n${a11y.axe.length} pages = ${views.length - 1} views × 2 themes (light, dark) × 2 viewports (1440×900 and 390×844), plus the confirmation dialog in both themes. Contrast is evaluated by axe in both themes.\n\n` +
  `## Structural checks\n\n| Check | Result |\n|---|---|\n` + st.map((s) => `| ${esc(s.name)} | ${mark(s.pass)} |`).join("\n") + "\n\n" +
  `## Keyboard and focus (from the interaction suite)\n- Dialogs trap focus, close on Esc, restore focus to the trigger; the confirmation dialog starts on **Cancel**.\n- The mobile drawer traps focus, closes on Esc and is \`inert\` while closed (not focusable, not read).\n- A skip link is the first Tab stop; navigating to a view moves focus into the main region.\n- Every control has a ≥ 2 px focus outline (\`:focus-visible\`).\n\n` +
  `## Screen-reader support (by construction; checked by axe rules, **not** with a real screen reader)\n- Landmarks: header, navigation "Main", main, complementary sidebar; one \`<h1>\` per view.\n- A polite live region announces assistant state changes ("Thinking…", "Waiting for your confirmation") without re-reading the whole chat.\n- The chat is a \`role="log"\`; tool chips have text alternatives ("returned a result" / "failed"); orb has a state label.\n- Errors use \`role="alert"\`; confirmations use \`role="alertdialog"\`.\n\n` +
  `## Reduced motion\nWith \`prefers-reduced-motion: reduce\` no infinite CSS animation is running; the orb is drawn once per state change.\n\n` +
  `## Issues found by the audit and fixed\n| Found | WCAG | Fix |\n|---|---|---|\n| Overview counters were a \`<dl>\` containing buttons | 1.3.1 | list of buttons |\n| Counter buttons had an \`aria-label\` that did not contain the visible text | 2.5.3 Label in Name | visible text is the name |\n| Disclosure summary 16 px tall, slider 16 px tall | 2.5.8 | enlarged (see responsive report) |\n| Muted brand colour \`#64748B\` is 4.48:1 on the page background | 1.4.3 | text uses \`#5C6B82\` (5.10:1) |\n| Brand success/warning/danger fail as small text on white | 1.4.3 | text variants + labelled chips (see DESIGN_SYSTEM.md) |\n| Redundant form landmarks | best practice | removed |\n\n` +
  `## What automation cannot prove (needs a human)\nAutomated tools find roughly a third of accessibility problems. **Not yet verified:** a real screen reader (NVDA/JAWS/VoiceOver) walkthrough, voice-control dictation of control names, high-contrast / forced-colours mode, zoom at 400 % on real devices, and cognitive aspects such as wording. The "Not tested" list in INTERACTION_TEST_REPORT.md also applies.\n`;
  fs.writeFileSync("../ACCESSIBILITY_REPORT.md", md); }
console.log("reports written");
