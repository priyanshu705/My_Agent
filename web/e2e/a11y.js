// Accessibility audit: axe-core (WCAG 2.0/2.1/2.2 A+AA rules) on every view, both themes, desktop + phone; plus structural checks.
const fs = require("fs"); const path = require("path"); const { launch, open, gotoView, NAMES } = require("./lib");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const VIEWS = Object.keys(NAMES); const results = { axe: [], structure: [] }; let bad = 0;

(async () => {
  const b = await launch();
  for (const theme of ["light", "dark"]) for (const [w, h] of [[1440, 900], [390, 844]]) for (const view of VIEWS) {
    const { ctx, p } = await open(b, { viewport: { width: w, height: h }, theme, wait: 900 });
    if (view !== "overview") await gotoView(p, view);
    if (view === "chat") { await p.getByRole("button", { name: /Plan tomorrow/ }).first().click().catch(() => {}); await p.waitForTimeout(400); }
    await p.evaluate(AXE); const r = await p.evaluate((tags) => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }), TAGS);
    const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length, sample: x.nodes[0].html.slice(0, 140), target: x.nodes[0].target.join(" ") }));
    results.axe.push({ theme, vp: `${w}x${h}`, view, violations: v }); if (v.length) { bad++; console.log("VIOLATIONS", theme, w, view, JSON.stringify(v.map((x) => x.id + "×" + x.nodes))); }
    await ctx.close();
  }
  // dialogs are separate DOM states: audit them too
  for (const theme of ["light", "dark"]) {
    const { ctx, p } = await open(b, { theme, wait: 900 }); await gotoView(p, "chat"); await p.getByLabel("Message to the assistant").fill("close chrome"); await p.keyboard.press("Enter"); await p.waitForTimeout(800);
    await p.evaluate(AXE); const r = await p.evaluate((tags) => axe.run(document, { runOnly: { type: "tag", values: tags } }), TAGS);
    const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length, sample: x.nodes[0].html.slice(0, 140) })); results.axe.push({ theme, vp: "1440x900", view: "confirmation dialog", violations: v }); if (v.length) { bad++; console.log("VIOLATIONS dialog", theme, JSON.stringify(v)); }
    await ctx.close(); }

  // structural checks
  const S = (name, ok, detail = "") => { results.structure.push({ name, pass: !!ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " -> " + detail)); if (!ok) bad++; };
  { const { ctx, p } = await open(b, { wait: 900 });
    for (const view of VIEWS) { if (view !== "overview") await gotoView(p, view); const h1 = await p.locator("main h1").count(); S(`exactly one <h1> in ${view}`, h1 === 1, `${h1}`); }
    S("landmarks: header, nav (Main), main, aside present", (await p.locator("header").count()) >= 1 && (await p.getByRole("navigation", { name: "Main" }).count()) === 1 && (await p.locator("main#main").count()) === 1 && (await p.locator("aside").count()) === 1);
    S("document language is set", (await p.evaluate(() => document.documentElement.lang)) === "en");
    S("a polite live region announces assistant status", (await p.getByTestId("live-status").getAttribute("aria-live")) === "polite");
    // visible focus indicator
    await gotoView(p, "overview"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); const ring = await p.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; });
    S("keyboard focus has a visible ≥2px outline", ring);
    S("every image/canvas is decorative or labelled (no unlabeled role=img)", (await p.locator('[role="img"]:not([aria-label])').count()) === 0);
    await ctx.close(); }
  { const { ctx, p } = await open(b, { wait: 900 }); // fresh load: the skip link must be the very first Tab stop
    await p.keyboard.press("Tab"); S("first Tab stop is the 'Skip to content' link", (await p.evaluate(() => document.activeElement.textContent)) === "Skip to content");
    await p.keyboard.press("Enter"); await p.waitForTimeout(250); S("activating the skip link moves focus into the main content", await p.evaluate(() => document.activeElement.id === "main" || !!document.activeElement.closest("main")));
    await ctx.close(); }
  { const { ctx, p } = await open(b, { reducedMotion: true, wait: 900 }); await gotoView(p, "chat");
    const anims = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getComputedTiming().iterations === Infinity && a.effect.getComputedTiming().duration > 10).length);
    S("reduced motion: no infinite CSS animations are running", anims === 0, `${anims} running`);
    await ctx.close(); }
  { const { ctx, p } = await open(b, { viewport: { width: 320, height: 568 }, wait: 900 }); await gotoView(p, "settings");
    await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); await p.waitForTimeout(300);
    S("200% text size at 320px: no horizontal scrolling (WCAG 1.4.4 / 1.4.10)", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await ctx.close(); }
  await b.close(); fs.writeFileSync("e2e/results/a11y.json", JSON.stringify(results, null, 2));
  const total = results.axe.length; const clean = results.axe.filter((r) => r.violations.length === 0).length;
  console.log(`axe: ${clean}/${total} pages clean; structure: ${results.structure.filter((s) => s.pass).length}/${results.structure.length}`); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
