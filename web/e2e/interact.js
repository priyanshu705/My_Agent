// Interaction tests: every control exercised against the mock backend. Writes e2e/results/interaction.json
const fs = require("fs"); const { launch, open, gotoView, collector } = require("./lib");
const R = collector(); const { check } = R;
const calls = (st, path, method) => st.calls.filter((c) => c.p === path && (!method || c.m === method));
const send = async (p, text) => { const ta = p.getByLabel("Message to the assistant"); await ta.fill(text); await ta.press("Enter"); };

(async () => {
  const b = await launch();

  // ---------------------------------------------------------------- local mode basics
  R.section("Local PC mode");
  { const { ctx, p, st } = await open(b);
    check("no login screen when the PC backend lets the PC in", (await p.getByLabel("Access PIN").count()) === 0);
    check("header says PC connected (not 'PC offline')", await p.getByText("PC connected").first().isVisible());
    check("greeting uses the configured user name", await p.getByRole("heading", { level: 1 }).first().innerText().then((t) => /Om/.test(t)));
    check("overview shows model name from /api/config", await p.getByText("Model: gemini-3.5-flash-lite").isVisible());
    check("overview shows Voice 'Available'", await p.getByText("Available", { exact: true }).first().isVisible());
    check("integrations tile counts only real flags", await p.getByText(/\d of 7 on/).isVisible());

    // quick actions
    await p.getByRole("button", { name: "Create a note" }).click();
    check("Create a note opens a dialog and focuses its field", await p.getByRole("dialog", { name: "Create a note" }).isVisible() && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "qa-text");
    await p.keyboard.type("Buy milk and eggs"); await p.getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(400);
    check("note saved through POST /api/notes", calls(st, "/api/notes", "POST").some((c) => c.b.text === "Buy milk and eggs"));
    check("dialog closed and focus returned to the trigger", (await p.getByRole("dialog").count()) === 0 && (await p.evaluate(() => document.activeElement.textContent)).includes("Create a note"));
    await p.getByRole("button", { name: "Create a reminder" }).click(); await p.keyboard.type("Call dentist"); await p.getByRole("button", { name: "1 h" }).click(); await p.getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(400);
    check("reminder saved through POST /api/reminders with minutes", calls(st, "/api/reminders", "POST").some((c) => c.b.text === "Call dentist" && c.b.minutes === 60));
    await p.getByRole("button", { name: "Search Google" }).click(); await p.waitForTimeout(500);
    check("Search Google opens Chat with a pre-filled draft (nothing sent yet)", (await p.getByLabel("Message to the assistant").inputValue()) === "Search Google for " && calls(st, "/api/chat").length === 0);
    await gotoView(p, "overview");
    await p.getByRole("button", { name: "Open Chrome" }).click(); await p.waitForTimeout(700);
    check("Open Chrome sends an ordinary chat message", calls(st, "/api/chat").some((c) => c.b.text === "Open Chrome"));
    check("no page errors in local mode basics", p.errors.length === 0, p.errors.join(" | "));
    await ctx.close(); }

  // ---------------------------------------------------------------- chat
  R.section("Chat workspace");
  { const { ctx, p, st } = await open(b);
    await gotoView(p, "chat");
    check("empty chat shows the voice hero and suggestions", await p.getByText("How can I help?").isVisible());
    const ta = p.getByLabel("Message to the assistant");
    await ta.fill("line one"); await ta.press("Shift+Enter"); await ta.type("line two");
    check("Shift+Enter adds a new line instead of sending", (await ta.inputValue()) === "line one\nline two" && calls(st, "/api/chat").length === 0);
    await ta.press("Enter"); await p.waitForTimeout(600);
    check("Enter sends the multiline message", calls(st, "/api/chat").some((c) => c.b.text === "line one\nline two"));
    check("assistant reply is rendered with a timestamp", await p.getByText(/Sure — here is a short answer/).isVisible() && (await p.getByText(/Assistant, /).count()) > 0);
    await p.getByRole("button", { name: "Copy response" }).first().click(); await p.waitForTimeout(300);
    check("Copy response puts the reply on the clipboard", (await p.evaluate(() => navigator.clipboard.readText())).includes("short answer"));
    await send(p, "search google for desks"); await p.waitForTimeout(600);
    check("tool chip appears for an executed tool", await p.getByLabel("Tools used").getByText("google search").first().isVisible());
    await send(p, "please error out"); await p.waitForTimeout(600);
    check("backend error reply is shown as a failed request", await p.getByText("Request failed").first().isVisible());
    // reset
    await p.getByRole("button", { name: /Reset/ }).first().click();
    check("Reset asks first and focuses the safe option", await p.getByRole("dialog", { name: "Reset this conversation?" }).isVisible() && (await p.evaluate(() => document.activeElement.textContent)) === "Keep chat");
    await p.getByRole("dialog").getByRole("button", { name: "Reset", exact: true }).click(); await p.waitForTimeout(500);
    check("Reset calls POST /api/reset and clears the chat", calls(st, "/api/reset").length === 1 && (await p.getByText("How can I help?").isVisible()));
    // new chat + sessions
    await p.getByRole("button", { name: "New chat" }).first().click(); await p.waitForTimeout(400);
    check("New chat starts an empty conversation", await p.getByText("How can I help?").isVisible());
    await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); await p.waitForTimeout(600);
    check("opening a stored conversation loads its history", await p.getByText(/design review at 15:30/).isVisible());
    check("a failed tool in history is flagged", await p.getByLabel("Tools used").getByText("whatsapp send file").first().isVisible());
    await p.getByRole("button", { name: /Delete conversation Reminders/ }).click(); await p.waitForTimeout(400);
    check("deleting a conversation calls DELETE /api/sessions/{id}", calls(st, "/api/sessions/s2", "DELETE").length === 1);
    check("no page errors in chat", p.errors.length === 0, p.errors.join(" | "));
    await ctx.close(); }

  // ---------------------------------------------------------------- confirmations
  R.section("Confirmations (risky actions)");
  { const { ctx, p, st } = await open(b);
    await gotoView(p, "chat"); await send(p, "close chrome"); await p.waitForTimeout(700);
    const dlg = p.getByRole("alertdialog");
    check("a pending action opens a global alert dialog", await dlg.isVisible());
    check("dialog states the intent, the affected application and the risk", (await dlg.innerText()).includes("close chrome") && (await dlg.innerText()).includes("Application") && (await dlg.innerText()).includes("Sensitive"));
    check("focus starts on Cancel (the safe choice)", (await p.evaluate(() => document.activeElement.textContent)) === "Cancel");
    await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
    check("keyboard focus stays trapped inside the dialog", await p.evaluate(() => !!document.activeElement.closest('[role="alertdialog"]')));
    check("the chat bubble has no second set of approve buttons", (await p.getByRole("button", { name: "Confirm", exact: true }).count()) === 1);
    await p.keyboard.press("Escape"); await p.waitForTimeout(600);
    const c1 = calls(st, "/api/confirm");
    check("Escape cancels: POST /api/confirm approved=false with the server-issued id", c1.length === 1 && c1[0].b.approved === false && /^cid-/.test(c1[0].b.confirm_id));
    check("dialog closed afterwards", (await p.getByRole("alertdialog").count()) === 0);
    await send(p, "send email to rahul"); await p.waitForTimeout(600);
    const t = await p.getByRole("alertdialog").innerText();
    check("email confirmation lists recipient, subject and body", t.includes("rahul@example.com") && t.includes("Report") && t.includes("report attached"));
    await p.getByRole("button", { name: "Confirm", exact: true }).click(); await p.waitForTimeout(700);
    const c2 = calls(st, "/api/confirm");
    check("Confirm sends approved=true with the matching id", c2.length === 2 && c2[1].b.approved === true && c2[1].b.confirm_id.startsWith("cid-"));
    check("result is reported only after the backend answered", await p.getByText(/gmail send completed/i).isVisible());
    await send(p, "whatsapp rahul late"); await p.waitForTimeout(600);
    const w = await p.getByRole("alertdialog").innerText();
    check("WhatsApp confirmation names the contact and message", w.includes("Rahul") && w.includes("Running 10 minutes late"));
    await p.getByRole("button", { name: "Cancel" }).click(); await p.waitForTimeout(500);
    await gotoView(p, "automation");
    check("Automation lists the approved action as Completed and the cancelled as absent", (await p.getByText("gmail send").count()) > 0 && (await p.getByText("whatsapp send").count()) === 0);
    check("no page errors in confirmations", p.errors.length === 0, p.errors.join(" | "));
    await ctx.close(); }

  // ---------------------------------------------------------------- automation / activity
  R.section("Automation center and activity");
  { const { ctx, p } = await open(b, { mock: { delayChat: 2500 } });
    await gotoView(p, "chat"); await send(p, "search google for slow test"); await p.waitForTimeout(1500);
    check("local /api/activity shape does not crash the UI (regression)", p.errors.length === 0, p.errors.join(" | "));
    check("chat shows a live status while a tool runs", await p.getByTestId("working").innerText().then((t) => /Searching|Running/.test(t)));
    await gotoView(p, "automation");
    check("Automation shows the current task with the tool name", await p.getByTestId("current-task").innerText().then((t) => /google search/i.test(t)));
    await p.waitForTimeout(2200);
    await gotoView(p, "chat"); await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); await gotoView(p, "automation");
    check("history lists completed and failed executions", (await p.getByText("Failed", { exact: true }).count()) > 0 && (await p.getByText("Completed", { exact: true }).count()) > 0);
    await p.getByRole("button", { name: /^WhatsApp/ }).click();
    check("category filter narrows the list to WhatsApp", (await p.getByLabel("Execution history").locator("article").count()) === 1);
    await p.getByRole("button", { name: /Show what was sent|Hide/ }).first().isVisible().catch(() => {});
    await gotoView(p, "overview");
    check("Overview 'Recent activity' mirrors the real log", (await p.getByText("whatsapp send file").first().isVisible()));
    await ctx.close(); }
  { const { ctx, p } = await open(b, { mode: "cloud", mock: { mode: "cloud", delayChat: 2000 } });
    await gotoView(p, "chat"); await send(p, "search google cloud"); await p.waitForTimeout(1300);
    check("cloud-mode step list is shown while running", await p.getByTestId("working").innerText().then((t) => /Searching/.test(t)));
    check("no page errors in cloud activity", p.errors.length === 0, p.errors.join(" | ")); await ctx.close(); }

  // ---------------------------------------------------------------- productivity
  R.section("Notes, tasks, reminders, memory");
  { const { ctx, p, st } = await open(b);
    await gotoView(p, "notes");
    await p.getByLabel("New note").first().fill("Note from the test"); await p.getByRole("button", { name: "Add" }).click(); await p.waitForTimeout(500);
    check("adding a note posts it and lists it", calls(st, "/api/notes", "POST").length === 1 && (await p.getByText("Note from the test").isVisible()));
    await p.getByLabel("Search notes").fill("wi-fi");
    check("note search filters the list", (await p.locator("article").count()) === 1);
    check("notes show their creation date", (await p.locator("article").first().innerText()).includes("Created"));
    await gotoView(p, "tasks");
    check("tasks split into pending and completed", await p.getByRole("button", { name: /Pending \(2\)/ }).isVisible() && await p.getByRole("button", { name: /Completed \(1\)/ }).isVisible());
    await p.getByRole("checkbox", { name: /Mark complete: Review pull request/ }).click(); await p.waitForTimeout(500);
    check("toggling a task calls the toggle endpoint", calls(st, "/api/todos/0/toggle", "POST").length === 1 && await p.getByRole("button", { name: /Pending \(1\)/ }).isVisible());
    await p.getByLabel("New task").first().fill("Water plants"); await p.getByRole("button", { name: "Add" }).click(); await p.waitForTimeout(400);
    check("adding a task posts it", calls(st, "/api/todos", "POST").some((c) => c.b.text === "Water plants"));
    await gotoView(p, "reminders");
    check("reminders separate due from upcoming", await p.getByRole("heading", { name: "Due now" }).isVisible() && await p.getByRole("heading", { name: "Upcoming" }).isVisible());
    await p.getByLabel("New reminder").first().fill("Water the plants"); await p.getByLabel("Minutes from now").fill("15"); await p.getByRole("button", { name: "Add" }).click(); await p.waitForTimeout(400);
    check("adding a reminder sends the chosen minutes", calls(st, "/api/reminders", "POST").some((c) => c.b.text === "Water the plants" && c.b.minutes === 15));
    await gotoView(p, "memory");
    check("memory lists the saved facts from GET /api/memory", await p.getByText("Likes basmati rice").isVisible() && calls(st, "/api/memory").length > 0);
    await p.getByLabel("Search saved memory").fill("birthday");
    check("memory search filters facts", (await p.getByText("Mom's birthday is on 14 March").isVisible()) && (await p.getByText("Likes basmati rice").count()) === 0);
    await p.getByRole("button", { name: "Teach the assistant" }).click(); await p.waitForTimeout(400);
    check("'Teach the assistant' opens chat with a draft, nothing is sent", (await p.getByLabel("Message to the assistant").inputValue()) === "Remember that ");
    check("no page errors in productivity views", p.errors.length === 0, p.errors.join(" | "));
    await ctx.close(); }

  // ---------------------------------------------------------------- integrations
  R.section("Integrations");
  { const { ctx, p, st } = await open(b, { mock: { config: { google_connected: false, google_ready: true, demo: false } } });
    await gotoView(p, "integrations");
    check("Google shows 'Needs authorization' with a Connect button", (await p.getByText("Needs authorization").count()) === 3 && await p.getByRole("button", { name: "Connect Google" }).first().isVisible());
    check("no secret-looking values are rendered anywhere", !/AIza[0-9A-Za-z_-]{10,}|sk-[A-Za-z0-9]{10,}|Bearer\s+\S+|GEMINI_API_KEY\s*=/i.test(await p.locator("main").innerText()));
    const before = calls(st, "/api/config").length; await p.getByRole("button", { name: "Re-check" }).click(); await p.waitForTimeout(600);
    check("Re-check re-queries the backend and shows the time", calls(st, "/api/config").length > before && /Checked \d/.test(await p.getByTestId("checked-at").innerText()));
    await ctx.close(); }
  { const { ctx, p } = await open(b, { mock: { whatsapp: false, config: { demo: true, has_key: false, google_connected: false, google_ready: false, local_tts: true, wake_engine: "oww", integrations: { whatsapp_session: false, browser_agent: true, desktop_automation: true, wake_engine_enabled: true, wake_engine_running: false, wake_engine_error: "Wake word stopped: no microphone" } } } });
    await gotoView(p, "integrations"); const t = await p.locator("main").innerText();
    check("demo mode, disabled, enabled and error states are all distinguishable", /Disabled — demo mode/.test(t) && /Enabled/.test(t) && /Error/.test(t) && /Needs setup/.test(t));
    check("an engine error message is shown", /no microphone/.test(t));
    await gotoView(p, "overview");
    check("quick action WhatsApp is disabled with a reason when not set up", await p.getByRole("button", { name: /Unread WhatsApp/ }).isDisabled());
    await ctx.close(); }

  // ---------------------------------------------------------------- settings + theme
  R.section("Settings and appearance");
  { const { ctx, p, st } = await open(b);
    await gotoView(p, "settings");
    check("settings has the required sections", (await Promise.all(["General", "Assistant identity", "Language", "Voice", "Wake word", "AI model", "Integrations", "Permissions", "Appearance", "Privacy", "Advanced"].map((s) => p.getByRole("heading", { name: s, exact: true }).count()))).every((n) => n === 1));
    check("restart-needed options are labelled as such", (await p.getByText("Restart needed").count()) >= 4);
    check("model name is shown read-only", await p.getByTestId("model-name").innerText().then((t) => t === "gemini-3.5-flash-lite"));
    check("light is the default theme", (await p.evaluate(() => document.documentElement.dataset.theme)) === "light");
    await p.getByRole("radio", { name: "Dark" }).click(); await p.waitForTimeout(300);
    check("Dark theme applies and is saved", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await p.evaluate(() => JSON.parse(localStorage.settings).theme)) === "dark");
    await p.reload(); await p.waitForTimeout(1200);
    check("theme survives a reload with no flash of the wrong theme", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark");
    await gotoView(p, "settings"); await p.getByRole("radio", { name: "System" }).click(); await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(300);
    check("System follows the OS colour scheme", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark");
    await p.emulateMedia({ colorScheme: "light" }); await p.waitForTimeout(300);
    check("…and switches back when the OS changes", (await p.evaluate(() => document.documentElement.dataset.theme)) === "light");
    await p.getByLabel("Your name").fill("Asha"); await gotoView(p, "overview");
    check("changing the name updates the greeting", await p.getByRole("heading", { level: 1 }).first().innerText().then((t) => /Asha/.test(t)));
    await gotoView(p, "settings"); await p.getByRole("button", { name: "Delete all" }).click();
    check("Delete all asks first (danger dialog)", await p.getByRole("dialog", { name: "Delete all conversations?" }).isVisible());
    await p.getByRole("button", { name: "Delete all" }).last().click(); await p.waitForTimeout(700);
    check("it deletes every stored conversation via DELETE", calls(st, "/api/sessions/s1", "DELETE").length === 1 && calls(st, "/api/sessions/s2", "DELETE").length === 1);
    check("no page errors in settings", p.errors.length === 0, p.errors.join(" | "));
    await ctx.close(); }

  // ---------------------------------------------------------------- voice truthfulness
  R.section("Voice and microphone states");
  { const { ctx, p } = await open(b, { sr: "ok" });
    await gotoView(p, "chat"); await p.getByRole("button", { name: "Talk" }).first().click(); await p.waitForTimeout(400);
    check("Listening is shown only once the recognizer started", (await p.getByTestId("orb-state").first().innerText()) === "Listening" && (await p.evaluate(() => window.__srStarts)) >= 1);
    await p.getByRole("button", { name: "Stop" }).first().click(); await p.waitForTimeout(400);
    check("Stop returns to Idle", (await p.getByTestId("orb-state").first().innerText()) === "Idle");
    await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "denied" });
    await gotoView(p, "chat"); await p.getByRole("button", { name: "Talk" }).first().click(); await p.waitForTimeout(500);
    check("permission denied is shown, never 'Listening'", (await p.getByTestId("orb-state").first().innerText()) === "Microphone permission denied" && await p.getByRole("alert").filter({ hasText: "blocked the microphone" }).isVisible());
    await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "nomic" });
    await gotoView(p, "chat"); await p.getByRole("button", { name: "Talk" }).first().click(); await p.waitForTimeout(500);
    check("a missing microphone shows 'unavailable'", (await p.getByTestId("orb-state").first().innerText()) === "Microphone unavailable"); await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "none" });
    await gotoView(p, "chat");
    check("no speech recognition: Talk is disabled and explains why", await p.getByRole("button", { name: "Talk" }).first().isDisabled() && await p.getByText("Voice input needs Chrome or Edge").first().isVisible()); await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "ok" });
    await gotoView(p, "chat"); const sw = p.getByRole("switch", { name: "Listen for the wake word" }).first(); await sw.click(); await p.waitForTimeout(700);
    check("wake word reports Active only when its recognizer started", await p.getByText("Active", { exact: true }).first().isVisible() && (await p.getByTestId("orb-state").first().innerText()) === "Waiting for the wake word");
    await p.getByRole("button", { name: "Mute voice replies" }).first().click().catch(() => {}); await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "denied" });
    await gotoView(p, "chat"); await p.getByRole("switch", { name: "Listen for the wake word" }).first().click(); await p.waitForTimeout(800);
    check("wake word with a blocked microphone is NOT shown as active", (await p.getByText("Active", { exact: true }).count()) === 0 && (await p.getByTestId("orb-state").first().innerText()) === "Microphone permission denied"); await ctx.close(); }

  // ---------------------------------------------------------------- cloud + login + offline
  R.section("Cloud mode, login and offline");
  { const { ctx, p } = await open(b, { mode: "cloud", mock: { mode: "cloud", pcOnline: false } });
    check("cloud mode: PC offline is reported from the cloud status", await p.getByText("PC offline").first().isVisible());
    check("PC-only quick actions are disabled with a reason", await p.getByRole("button", { name: /Open Chrome/ }).isDisabled() && await p.getByText("PC agent is offline").first().isVisible());
    await gotoView(p, "integrations");
    check("cloud mode: WhatsApp is 'Not reported' (the cloud always says false) instead of a false 'Needs setup'", !/Needs setup/.test(await p.locator("main").innerText()) && /Not reported/.test(await p.locator("main").innerText()));
    await gotoView(p, "memory"); check("memory says it is unavailable when the backend has no /api/memory", await p.getByText("Not available on this backend").isVisible());
    await ctx.close(); }
  { const { ctx, p } = await open(b, { mock: { mode: "cloud", needLogin: true } });
    check("cloud mode requires sign-in", await p.getByLabel("Access PIN").isVisible());
    await p.getByLabel("Access PIN").fill("000000"); await p.getByRole("button", { name: /Sign in/ }).click(); await p.waitForTimeout(600);
    check("a wrong PIN shows an accessible error", await p.getByRole("alert").filter({ hasText: "Incorrect PIN" }).isVisible());
    await p.getByLabel("Access PIN").fill("123456"); await p.getByRole("button", { name: /Sign in/ }).click(); await p.waitForTimeout(1500);
    check("the right PIN opens the app", await p.getByRole("navigation", { name: "Main" }).isVisible());
    await p.getByRole("button", { name: /Sign out/ }).click(); await p.waitForTimeout(500);
    check("sign out returns to the login screen", await p.getByLabel("Access PIN").isVisible()); await ctx.close(); }
  { const { ctx, p } = await open(b, { wait: 0 });
    await p.route("**/api/ping", (r) => r.abort()); await p.reload(); await p.waitForTimeout(1500);
    check("an unreachable backend shows Offline, not Ready", await p.getByText("Backend offline").first().isVisible() || await p.getByText("Offline", { exact: true }).first().isVisible()); await ctx.close(); }

  // ---------------------------------------------------------------- mobile navigation
  R.section("Mobile navigation");
  { const { ctx, p } = await open(b, { viewport: { width: 390, height: 844 } });
    check("closed mobile sidebar is inert (not focusable, not read by screen readers)", await p.evaluate(() => document.querySelector("aside").inert === true));
    await p.getByRole("button", { name: "Open menu" }).click(); await p.waitForTimeout(350);
    check("menu opens and moves focus inside the drawer", await p.evaluate(() => !!document.activeElement.closest("aside")));
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    check("Escape closes the drawer and returns focus to the menu button", (await p.getByRole("button", { name: "Open menu" }).evaluate((e) => e === document.activeElement)));
    await gotoView(p, "tasks");
    check("choosing a destination closes the drawer and loads the view", await p.getByRole("heading", { name: "Tasks", level: 1 }).isVisible() && (await p.evaluate(() => document.querySelector("aside").inert === true)));
    check("a mic button is in the top bar on mobile", await p.getByRole("button", { name: "Start listening" }).first().isVisible()); await ctx.close(); }

  await b.close();
  fs.mkdirSync("e2e/results", { recursive: true }); fs.writeFileSync("e2e/results/interaction.json", JSON.stringify(R.rows, null, 2));
  const fail = R.rows.filter((r) => !r.pass); console.log(`\n${R.rows.length - fail.length}/${R.rows.length} passed`); process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
