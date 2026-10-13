// Browser test of the Decisions build: Prepare email + Info sent follow-up, Settings tabs (default owner, dropdowns, templates, holidays, PDF forms), weekly report.
const { chromium } = require("playwright");
const fs = require("fs"); const path = require("path");
const base = process.env.BASE || "http://localhost:3100";
async function makeTestPdf() {
  const { PDFDocument } = require("pdf-lib"); const doc = PDFDocument.create ? await PDFDocument.create() : null; const page = doc.addPage([400, 300]); const form = doc.getForm();
  const f1 = form.createTextField("ClaimantName"); f1.addToPage(page, { x: 20, y: 240, width: 300, height: 24 });
  const f2 = form.createTextField("OTN"); f2.addToPage(page, { x: 20, y: 200, width: 300, height: 24 });
  const cb = form.createCheckBox("Agree"); cb.addToPage(page, { x: 20, y: 160, width: 20, height: 20 });
  const p = path.join(require("os").tmpdir(), "mrfp-test-form.pdf"); fs.writeFileSync(p, await doc.save()); return p;
}
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push("PAGEERROR " + e.message)); p.on("console", m => { if (m.type() === "error" && !/fonts|favicon|ERR_FAILED/.test(m.text())) errs.push("CONSOLE " + m.text()); });
  const D = { waitUntil: "domcontentloaded" }; const wait = (ms = 1500) => p.waitForTimeout(ms);
  await p.goto(base + "/login", D); await p.fill("input[name=email]", "mt@example.test"); await p.fill("input[name=password]", "password1234"); await wait(); await p.click("form button"); await p.waitForURL("**/today", { timeout: 20000, ...D });
  console.log("today stats:", await p.$$eval(".stat .l", n => n.map(x => x.innerText)));
  // Lead: prepare info email, mark Info sent -> follow-up = +3 business days
  await p.goto(base + "/leads?id=New%20import", D); await p.click("text=NEWLEAD, Nina"); await p.waitForURL("**/clients/**", D); await wait(800);
  await p.fill('label:has-text("Email") textarea', "nina@example.test"); await p.press('label:has-text("Email") textarea', "Tab"); await wait(1500);
  console.log("hero buttons:", await p.$$eval(".hero button, .hero a.btn", b => b.map(x => x.innerText.trim())));
  await p.click('button:has-text("Prepare info email")'); await wait(1200);
  const subj = await p.$eval('label:has-text("Subject") input', i => i.value); const body = await p.$eval('label:has-text("Message") textarea', t => t.value);
  console.log("prepared subject:", subj, "| body starts:", body.slice(0, 40).replace(/\n/g, " "), "| has unsubscribe footer:", /\/u\//.test(body), "| mailto:", (await p.$eval('a:has-text("Open in Outlook")', a => a.getAttribute("href"))).slice(0, 40));
  await p.click('button:has-text("mark Info sent")'); await wait(2000); await p.reload(D); await wait(800);
  console.log("identifier:", await p.$eval('label:has-text("Lead Identifier") select', s => s.value), "| info sent:", await p.$eval('label:has-text("Info Email Sent") input', i => i.value), "| follow up:", await p.$eval('label:has-text("Follow Up") input', i => i.value), "| reason:", await p.$eval('label:has-text("Reason") input', i => i.value));
  // Settings: users default owner
  await p.goto(base + "/settings?tab=users", D); await wait(600); console.log("default owner:", await p.$eval('select.input', s => s.value));
  // Dropdowns: add a source
  await p.goto(base + "/settings?tab=dropdowns", D); await wait(800); const ta = await p.$('.card-plain:has-text("Source") textarea'); const cur = await ta.inputValue(); await ta.fill(cur + "\nFacebook ad"); await p.click('.card-plain:has-text("Source") button:has-text("Save")'); await wait(1500);
  await p.goto(base + "/leads", D); await p.click('button:has-text("New lead")'); await wait(400); console.log("new-lead sources include Facebook ad:", await p.$$eval('select option', o => o.map(x => x.textContent)).then(a => a.includes("Facebook ad"))); await p.keyboard.press("Escape");
  // Templates: add custom
  await p.goto(base + "/settings?tab=templates", D); await wait(600); console.log("templates:", await p.$$eval(".card-plain button.font-head", b => b.map(x => x.innerText.replace(/^[▸▾] /, ""))));
  await p.click('button:has-text("Add a template")'); await p.fill('input[placeholder*="Deceased"]', "Executor letter"); await p.fill('textarea[placeholder*="Hi {{firstName}}"]', "Dear {{firstName}}, test."); await p.click('button:has-text("Add template")'); await wait(1500); await p.reload(D); await wait(500);
  console.log("templates after add:", (await p.$$eval(".card-plain button.font-head", b => b.map(x => x.innerText))).length, "| custom chip:", await p.$$eval(".chip", c => c.map(x => x.innerText)).then(a => a.includes("custom")));
  // Holidays
  await p.goto(base + "/settings?tab=holidays", D); await wait(600); const before = await p.$$eval("tbody tr", r => r.length); await p.fill('input[type=date]', "2026-12-24"); await p.fill('input[placeholder*="King"]', "Test holiday"); await p.click('button:has-text("Add holiday")'); await wait(1500); await p.reload(D); await wait(500); console.log("holidays:", before, "->", await p.$$eval("tbody tr", r => r.length));
  // Forms: upload test PDF, map, download filled
  const pdfPath = await makeTestPdf(); await p.goto(base + "/settings?tab=forms", D); await wait(600); await p.fill('input[name=name]', "Test claim form"); await p.setInputFiles('input[name=file]', pdfPath); await p.click('button:has-text("Upload form")'); await wait(2500); await p.reload(D); await wait(600);
  console.log("forms:", await p.$$eval(".card-plain button.font-head", b => b.map(x => x.innerText)));
  await p.click('button:has-text("Test claim form")'); await wait(400);
  await p.selectOption('tr:has(td:text-is("ClaimantName")) select', "client.fullName"); await p.selectOption('tr:has(td:text-is("OTN")) select', "claim.reference"); await p.selectOption('tr:has(td:text-is("Agree")) select', "yes"); await p.click('button:has-text("Save mapping")'); await wait(1500);
  await p.goto(base + "/clients", D); await p.click("text=TESTER, Alice"); await p.waitForURL("**/clients/**", D); await p.goto(p.url().split("?")[0] + "?tab=claims", D); await wait(800);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click('a:has-text("Test claim form")')]); const out = await dl.path(); const { PDFDocument } = require("pdf-lib"); const d2 = await PDFDocument.load(fs.readFileSync(out)); const fm = d2.getForm();
  console.log("downloaded:", dl.suggestedFilename(), "| ClaimantName =", fm.getTextField("ClaimantName").getText(), "| OTN =", fm.getTextField("OTN").getText(), "| Agree =", fm.getCheckBox("Agree").isChecked());
  // Weekly report
  await p.goto(base + "/reports?tab=weekly", D); await wait(600); console.log("weekly:", await p.$$eval(".stat", s => s.map(x => x.querySelector(".n").innerText + " " + x.querySelector(".l").innerText)));
  await p.click('a:has-text("4. Claims pipeline")'); await wait(800); console.log("figure rows:", await p.$$eval("tbody tr", r => r.length));
  // Settings › Activity log present; Reports has no activity tab
  await p.goto(base + "/settings?tab=activity", D); await wait(500); console.log("settings activity rows:", await p.$$eval("tbody tr", r => r.length));
  await p.screenshot({ path: "/tmp/ui-settings.png" });
  console.log("errors:", errs); await b.close();
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
