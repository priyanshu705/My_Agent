// Responsive sweep: 9 viewports x 9 views. Checks horizontal overflow, clipped elements, tiny touch targets, console errors.
const fs = require("fs"); const { launch, open, gotoView, NAMES } = require("./lib");
const VPS = [[320, 568], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]];
const VIEWS = process.env.VIEWS ? process.env.VIEWS.split(",") : Object.keys(NAMES); const PARTIAL = !!process.env.VIEWS; // VIEWS=settings runs a targeted sweep and does not overwrite the full results

const MEASURE = () => {
  const vw = innerWidth; const out = { overflowX: document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1, clipped: [], small24: [], small44: 0 };
  const skip = (el) => el.closest("aside[inert]") || el.closest(".sr-only") || el.classList.contains("skip") || el.closest("[data-skip-measure]");
  const insideScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if ((ox === "auto" || ox === "scroll") && p.scrollWidth > p.clientWidth) return true; } return false; };
  document.querySelectorAll("body *").forEach((el) => {
    if (skip(el)) return; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return; const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 1 && !insideScroller(el) && el.tagName !== "svg" && !el.closest("svg")) out.clipped.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40) + " right=" + Math.round(r.right));
  });
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=checkbox], [role=radio], [role=switch], summary').forEach((el) => {
    if (skip(el)) return; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return; const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
    if (r.top > innerHeight * 3) return;
    const label = (el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 30);
    if (r.width < 24 || r.height < 24) out.small24.push(label + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (r.height < 44 || r.width < 44) out.small44++;
  });
  return out;
};

(async () => {
  const b = await launch(); const rows = []; let fails = 0;
  for (const [w, h] of VPS) {
    for (const view of VIEWS) {
      const { ctx, p } = await open(b, { viewport: { width: w, height: h }, wait: 900 });
      if (view !== "overview") await gotoView(p, view); if (view === "chat") { await p.getByRole("button", { name: /Plan tomorrow/ }).first().click().catch(async () => { if (w < 1024) { await p.getByRole("button", { name: "Open menu" }).click(); await p.getByRole("button", { name: /Plan tomorrow/ }).first().click(); } }); await p.waitForTimeout(500); }
      await p.waitForTimeout(300);
      const m = await p.evaluate(MEASURE); await p.screenshot({ path: `e2e/shots/responsive/${view}-${w}x${h}.png` });
      const row = { vp: `${w}x${h}`, view, overflowX: m.overflowX, clipped: m.clipped.slice(0, 3), small24: m.small24.slice(0, 5), small44: m.small44, errors: p.errors.slice(0, 2) };
      row.pass = !m.overflowX && m.clipped.length === 0 && m.small24.length === 0 && p.errors.length === 0; if (!row.pass) { fails++; console.log("FAIL", row.vp, view, JSON.stringify({ o: m.overflowX, c: row.clipped, s: row.small24, e: row.errors })); }
      rows.push(row); await ctx.close();
    }
    console.log("done", w + "x" + h);
  }
  // empty-data state at three sizes
  if (!PARTIAL) for (const [w, h] of [[320, 568], [768, 1024], [1440, 900]]) for (const view of ["overview", "chat", "tasks", "memory", "automation"]) {
    const { ctx, p } = await open(b, { viewport: { width: w, height: h }, mock: { empty: true }, wait: 900 }); if (view !== "overview") await gotoView(p, view); await p.waitForTimeout(300);
    const m = await p.evaluate(MEASURE); const row = { vp: `${w}x${h}`, view: view + " (empty data)", overflowX: m.overflowX, clipped: m.clipped.slice(0, 3), small24: m.small24.slice(0, 5), small44: m.small44, errors: p.errors.slice(0, 2) };
    row.pass = !m.overflowX && m.clipped.length === 0 && m.small24.length === 0 && p.errors.length === 0; if (!row.pass) { fails++; console.log("FAIL", row.vp, row.view, JSON.stringify(row)); } rows.push(row); await ctx.close();
  }
  await b.close(); if (!PARTIAL) fs.writeFileSync("e2e/results/responsive.json", JSON.stringify(rows, null, 2));
  console.log(`${rows.length - fails}/${rows.length} layouts passed; targets under 44px (advisory): ${rows.reduce((a, r) => a + r.small44, 0)}`); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
