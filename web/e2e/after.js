// Curated "after" screenshots (mirrors before.js) plus the states that matter: confirmation, voice, dark mode, drawer.
const { launch, open, gotoView } = require("./lib");
const VPS = { "desktop-1440": [1440, 900], "tablet-768": [768, 1024], "mobile-390": [390, 844] };
const shot = (p, n) => p.screenshot({ path: `e2e/shots/after-${n}.png` });
(async () => {
  const b = await launch();
  for (const [name, [w, h]] of Object.entries(VPS)) {
    const { ctx, p } = await open(b, { viewport: { width: w, height: h } });
    await shot(p, `overview-${name}`);
    await gotoView(p, "chat"); await p.getByRole("button", { name: /Plan tomorrow/ }).first().click().catch(async () => { if (w < 1024) { await p.getByRole("button", { name: "Open menu" }).click(); await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); } });
    await p.waitForTimeout(600); await shot(p, `chat-${name}`);
    if (w < 1024) { await p.getByRole("button", { name: "Open menu" }).click(); await p.waitForTimeout(400); await shot(p, `menu-${name}`); }
    await ctx.close();
  }
  { const { ctx, p } = await open(b, { viewport: { width: 390, height: 844 }, mock: { empty: true } }); await gotoView(p, "chat"); await p.waitForTimeout(400); await shot(p, "chat-empty-mobile-390"); await ctx.close(); }
  for (const v of ["automation", "integrations", "settings", "notes", "tasks", "reminders", "memory"]) { const { ctx, p } = await open(b); await gotoView(p, v); if (v === "automation") { await gotoView(p, "chat"); await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); await gotoView(p, "automation"); } await p.waitForTimeout(300); await shot(p, `${v}-desktop-1440`); await ctx.close(); }
  for (const v of ["overview", "chat", "automation", "settings"]) { const { ctx, p } = await open(b, { theme: "dark" }); if (v !== "overview") { if (v !== "chat") { await gotoView(p, "chat"); await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); } await gotoView(p, v); if (v === "chat") await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); } await p.waitForTimeout(500); await shot(p, `${v}-dark-1440`); await ctx.close(); }
  for (const [name, vp] of [["desktop-1440", { width: 1440, height: 900 }], ["mobile-390", { width: 390, height: 844 }]]) {
    const { ctx, p } = await open(b, { viewport: vp }); await gotoView(p, "chat"); const ta = p.getByLabel("Message to the assistant"); await ta.fill("send email to rahul"); await ta.press("Enter"); await p.waitForTimeout(900); await shot(p, `confirm-dialog-${name}`); await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "ok" }); await gotoView(p, "chat"); await p.getByRole("button", { name: "Talk" }).first().click(); await p.waitForTimeout(500); await shot(p, "voice-listening-desktop"); await ctx.close(); }
  { const { ctx, p } = await open(b, { sr: "denied", viewport: { width: 390, height: 844 } }); await gotoView(p, "chat"); await p.getByRole("button", { name: "Talk" }).first().click(); await p.waitForTimeout(600); await shot(p, "voice-denied-mobile-390"); await ctx.close(); }
  { const { ctx, p } = await open(b, { mock: { delayChat: 4000 } }); await gotoView(p, "chat"); const ta = p.getByLabel("Message to the assistant"); await ta.fill("search google for desks"); await ta.press("Enter"); await p.waitForTimeout(1500); await shot(p, "chat-working-desktop"); await ctx.close(); }
  await b.close(); console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
