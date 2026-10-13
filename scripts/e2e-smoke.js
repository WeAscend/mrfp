// Browser smoke test against a running server (default http://localhost:3100) seeded with scripts/seed-dev.ts.
const { chromium } = require("playwright");
const fs = require("fs");
const base = process.env.BASE || "http://localhost:3100";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push("PAGEERROR " + e.message)); p.on("console", m => { if (m.type() === "error" && !/fonts|favicon/.test(m.text())) errs.push("CONSOLE " + m.text()); });
  const wait = (ms = 1200) => p.waitForTimeout(ms);
  const DCL = { waitUntil: "domcontentloaded" }; const _goto = p.goto.bind(p); p.goto = (u, o) => _goto(u, { ...DCL, ...(o || {}) }); const _reload = p.reload.bind(p); p.reload = () => _reload(DCL); const _w = p.waitForURL.bind(p); p.waitForURL = (u, o) => _w(u, { ...DCL, ...(o || {}) });
  await p.goto(base + "/login"); await p.fill("input[name=email]", "mt@example.test"); await p.fill("input[name=password]", "password1234"); await p.click('button:has-text("Log in")'); await p.waitForURL("**/leads", { timeout: 20000 });
  console.log("leads rows:", await p.$$eval("tbody tr", r => r.length), "| followups nav:", await p.$eval('nav a[href="/followups"]', a => a.innerText));
  await p.goto(base + "/followups"); console.log("due rows:", await p.$$eval("tbody tr", r => r.map(x => x.innerText.replace(/\s+/g, " ").slice(0, 80))));
  await p.goto(base + "/leads?id=New%20import"); await p.click("text=NEWLEAD, Nina"); await p.waitForURL("**/clients/**"); await wait(500);
  await p.selectOption('label:has-text("Lead Identifier") select', "A2A sent"); await wait(); await p.reload();
  console.log("A2A Sent stamped:", await p.$eval('label:has-text("A2A Sent") input', i => i.value));
  await p.fill('label:has-text("A2A Signed") input', "2026-10-13"); await wait(1500); await p.reload();
  console.log("header after signed:", (await p.$eval("h1", h => h.innerText)).replace(/\s+/g, " "));
  await p.click('a:has-text("Claims (")'); await wait(600);
  await p.selectOption('select:near(:text("Open new claim"))', { label: "ASIC" }); await p.click('button:has-text("Open new claim")'); await p.waitForURL("**claim=**", { timeout: 15000 }); await wait(800);
  console.log("claim card:", (await p.$eval("h2", h => h.innerText)).replace(/\s+/g, " "));
  await p.selectOption('label:has-text("Claim Progress") select', "7"); await wait(1500); await p.reload();
  console.log("date submitted:", await p.$eval(':text("Date Submitted") >> xpath=following-sibling::label//input | ../label//input', i => i.value).catch(async () => (await p.$$eval('input[type=date]', i => i.map(x => x.value))).join(",")));
  const url = p.url();
  await p.goto(base + "/followups"); const before = await p.$$eval("tbody tr", r => r.length); await p.click('button:has-text("Chased")'); await wait(1500); await p.reload(); const afterChased = await p.$$eval("tbody tr", r => r.length);
  await p.click('button:has-text("Done")'); await wait(1500); await p.reload(); console.log("follow-ups:", before, "-> chased", afterChased, "-> done", await p.$$eval("tbody tr", r => r.length));
  const s = await (await p.request.get(base + "/api/search?q=012345678901")).json(); console.log("search OTN:", s.map(x => x.title));
  const s2 = await (await p.request.get(base + "/api/search?q=0400000001")).json(); console.log("search phone no spaces:", s2.map(x => x.title));
  await p.goto(base + "/import"); await p.fill("textarea", fs.readFileSync("test-data/lead_import_sample.csv", "utf8")); await p.click('button:has-text("Preview")'); await wait(1500);
  console.log("import rows:", await p.$$eval("tbody tr", r => r.length), "| dups:", await p.$$eval(".chip-red", r => r.map(x => x.innerText)), "| flags:", await p.$$eval(".chip-amber", r => r.map(x => x.innerText)));
  await p.click('button:has-text("Import 7")'); await p.waitForURL("**/leads?id=New%20import", { timeout: 15000 }); await wait(500); console.log("New import leads after import:", await p.$$eval("tbody tr", r => r.length));
  await p.goto(base + "/reports?tab=activity"); console.log("activity rows:", await p.$$eval("tbody tr", r => r.length));
  await p.goto(url); await wait(800); await p.screenshot({ path: "/tmp/shot-app-claims.png" });
  await p.goto(base + "/clients"); await p.setViewportSize({ width: 400, height: 800 }); await wait(300); console.log("phone hscroll:", await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)); await p.setViewportSize({ width: 1360, height: 900 });
  // User role: no Settings, cannot see Activity Log
  await p.goto(base + "/login"); await p.click('button[aria-label="Account menu"]').catch(() => {}); await p.goto(base + "/login");
  const ctx2 = await b.newContext(); await ctx2.route("https://fonts.googleapis.com/**", r => r.abort()); const q = await ctx2.newPage(); await q.goto(base + "/login", { waitUntil: "domcontentloaded" }); await q.fill("input[name=email]", "jb@example.test"); await q.fill("input[name=password]", "password1234"); await q.click('button:has-text("Log in")'); await q.waitForURL("**/leads", { waitUntil: "domcontentloaded" });
  console.log("JB2 nav has Settings:", await q.$$eval("nav a", a => a.map(x => x.innerText)).then(a => a.some(x => /Settings/.test(x))), "| activity tab visible:", await q.goto(base + "/reports?tab=activity", { waitUntil: "domcontentloaded" }).then(() => q.$$eval(".views a", a => a.map(x => x.innerText))).then(a => a.some(x => /Activity/.test(x))));
  console.log("errors:", errs); await b.close();
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
