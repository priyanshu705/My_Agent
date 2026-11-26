// Captures "before" screenshots of the pre-redesign UI (served from a static build on :3112).
const { chromium } = require("playwright"); const mock = require("./mock");
const VPS = { "desktop-1440": [1440, 900], "tablet-768": [768, 1024], "mobile-390": [390, 844] };
(async () => {
  const b = await chromium.launch();
  for (const [name, [w, h]] of Object.entries(VPS)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
    await mock.install(p, { mode: "local" });
    await p.goto("http://127.0.0.1:3112/"); await p.waitForTimeout(2500);
    await p.getByRole("button", { name: /Plan tomorrow/ }).first().click().catch(() => {}); await p.waitForTimeout(800);
    await p.screenshot({ path: `e2e/shots/before-chat-${name}.png` });
    if (w < 1024) { await p.getByRole("button", { name: /Dashboard/ }).last().click().catch(() => {}); await p.waitForTimeout(600); await p.screenshot({ path: `e2e/shots/before-dashboard-${name}.png` }); }
    await p.locator('[aria-label="Open menu"], button:has-text("Settings")').first().click().catch(() => {}); await p.waitForTimeout(500);
    await p.screenshot({ path: `e2e/shots/before-menu-${name}.png` });
    await ctx.close();
  }
  await b.close(); console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
