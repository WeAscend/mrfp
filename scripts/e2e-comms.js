// Comms smoke: log call with consent -> info email -> A2A e-sign -> signed => Active + Client Code + PDF -> unsubscribe -> SMS STOP -> cron.
const { chromium } = require("playwright");
const base = process.env.BASE || "http://localhost:3100";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push("PAGEERROR " + e.message)); p.on("console", m => { if (m.type() === "error" && !/fonts|favicon|ERR_FAILED/.test(m.text())) errs.push("CONSOLE " + m.text()); });
  const DCL = { waitUntil: "domcontentloaded" }; const wait = (ms = 1500) => p.waitForTimeout(ms);
  await p.goto(base + "/login", DCL); await p.fill("input[name=email]", "mt@example.test"); await p.fill("input[name=password]", "password1234"); await wait(); await p.click("form button"); await p.waitForURL("**/today", { timeout: 20000, ...DCL });
  console.log("today h1:", await p.$eval("h1", h => h.innerText), "| stats:", await p.$$eval(".stat .n", n => n.map(x => x.innerText)));
  await p.screenshot({ path: "/tmp/shot-today.png" });
  // Lead: NEWLEAD Nina — give her an email + mobile, then log a call with consent + send info
  await p.goto(base + "/leads?id=New%20import", DCL); await p.click("text=NEWLEAD, Nina"); await p.waitForURL("**/clients/**", DCL); await wait(800);
  await p.fill('label:has-text("Email") textarea', "nina@example.test"); await p.press('label:has-text("Email") textarea', "Tab"); await wait(1200);
  await p.fill('label:has-text("Phone - Mobile") input', "0412 345 678"); await p.press('label:has-text("Phone - Mobile") input', "Tab"); await wait(1200); await p.reload(DCL); await wait(800);
  console.log("consent chips before:", await p.$$eval(".chip", c => c.map(x => x.innerText).filter(x => /Email|SMS/.test(x))));
  await p.click('button:has-text("Log a call")'); await wait(500); await p.click('.views button:has-text("Spoke")'); await p.fill("textarea[placeholder*='Short note']", "Happy to proceed, wants info by email");
  await p.check('label:has-text("OK to email them") input'); await p.check('label:has-text("OK to text them") input'); await wait(300); await p.check('label:has-text("Send the information email now") input');
  await p.click('button:has-text("Save call")'); await wait(2500); await p.reload(DCL); await wait(800);
  console.log("consent chips after:", await p.$$eval(".chip", c => c.map(x => x.innerText).filter(x => /Email|SMS/.test(x))), "| identifier:", await p.$eval('label:has-text("Lead Identifier") select', s => s.value), "| info email sent:", await p.$eval('label:has-text("Info Email Sent") input', i => i.value), "| follow up:", await p.$eval('label:has-text("Follow Up") input', i => i.value));
  console.log("timeline:", await p.$$eval("ol li b", b => b.map(x => x.innerText)));
  // Send A2A for e-signature
  await p.click('button:has-text("Send A2A for e-signature")'); await wait(400); await p.click('button:has-text("Send for signature")'); await wait(2500); await p.reload(DCL); await wait(800);
  console.log("after A2A send — identifier:", await p.$eval('label:has-text("Lead Identifier") select', s => s.value), "| A2A Sent:", await p.$eval('label:has-text("A2A Sent") input', i => i.value), "| awaiting chip:", await p.$$eval(".chip-amber", c => c.map(x => x.innerText)));
  await p.screenshot({ path: "/tmp/shot-lead-comms.png", fullPage: true });
  // Pull the sign link from the DB-less route: read the latest message body via the timeline details
  const body = await p.$$eval("ol li details pre", e => e.map(x => x.textContent).find(t => /\/sign\//.test(t)));
  const link = body.match(/https?:\/\/\S+\/sign\/\S+/)[0]; console.log("sign link:", link.replace(/sign\/.{6}.*/, "sign/…"));
  console.log("email footer has unsubscribe:", /\/u\//.test(body), "| sender id:", /My Refund Finder/.test(body));
  const unsub = body.match(/https?:\/\/\S+\/u\/\S+/)[0];
  // Sign as the client in a fresh context
  const c2 = await b.newContext({ viewport: { width: 420, height: 860 } }); await c2.route("https://fonts.googleapis.com/**", r => r.abort()); const q = await c2.newPage();
  await q.goto(link.replace(/^https?:\/\/[^/]+/, base), DCL); await wait(800); console.log("sign page h1:", await q.$eval("h1", h => h.innerText), "| doc has name:", (await q.$eval("article", a => a.innerText)).includes("NEWLEAD"));
  await q.screenshot({ path: "/tmp/shot-sign.png", fullPage: true });
  const cv = await q.$("canvas"); await cv.scrollIntoViewIfNeeded(); await wait(300); const bb = await cv.boundingBox(); await q.mouse.move(bb.x + 20, bb.y + 90); await q.mouse.down(); for (let i = 0; i < 30; i++) await q.mouse.move(bb.x + 20 + i * 8, bb.y + 90 + Math.sin(i / 3) * 30); await q.mouse.up();
  await q.check('input[type=checkbox]'); await q.click('button:has-text("Sign and send")'); await wait(4000); console.log("after sign h1:", await q.$eval("h1", h => h.innerText));
  await p.reload(DCL); await wait(800); console.log("client header after sign:", (await p.$eval("h1", h => h.innerText)).replace(/\s+/g, " "), "| stage chips:", await p.$$eval(".chip", c => c.map(x => x.innerText).slice(0, 3)));
  await p.goto(p.url().split("?")[0] + "?tab=documents", DCL); await wait(600); console.log("documents:", await p.$$eval("a[href^='/api/files/']", a => a.map(x => x.innerText.trim()).filter(Boolean)));
  const pdfHref = await p.$eval("a[href^='/api/files/']", a => a.getAttribute("href")); const pdf = await p.request.get(base + pdfHref); console.log("pdf bytes:", (await pdf.body()).length, "type:", pdf.headers()["content-type"]);
  // Unsubscribe flow (client side)
  await q.goto(unsub.replace(/^https?:\/\/[^/]+/, base), DCL); await wait(500); console.log("unsub h1:", await q.$eval("h1", h => h.innerText)); await q.click('button:has-text("Stop emails")'); await q.waitForURL("**done=EMAIL**", DCL); console.log("unsub done:", await q.$eval("h1", h => h.innerText));
  await p.goto(p.url().split("?")[0] + "?tab=summary", DCL); await wait(800); console.log("chips after unsub:", await p.$$eval(".chip", c => c.map(x => x.innerText).filter(x => /Email|SMS/.test(x))));
  // Blocked send after opt-out
  await p.click('button:has-text("Log call")').catch(() => {}); await wait(300); await p.keyboard.press("Escape"); await p.goto(p.url(), DCL);
  // SMS STOP webhook
  const r = await p.request.post(base + "/api/sms/inbound", { form: { From: "+61412345678", Body: "STOP", MessageSid: "SM123" } }); console.log("sms stop:", r.status(), (await r.text()).slice(0, 80));
  await p.reload(DCL); await wait(800); console.log("chips after STOP:", await p.$$eval(".chip", c => c.map(x => x.innerText).filter(x => /Email|SMS/.test(x))));
  // cron
  const cr = await p.request.get(base + "/api/cron/daily"); console.log("cron:", cr.status(), JSON.stringify(await cr.json()).slice(0, 160));
  // Activity log has the consent + message + signature entries
  await p.goto(base + "/reports?tab=activity", DCL); await wait(600); const acts = await p.$$eval("tbody tr", r => r.map(x => x.innerText.replace(/\s+/g, " ")).filter(x => /consent|Email|Signature|SMS/.test(x)).slice(0, 8)); console.log("activity:", acts);
  // Settings › Outreach
  await p.goto(base + "/settings?tab=outreach", DCL); await wait(600); console.log("templates:", await p.$$eval(".card-plain button.font-head", b => b.length)); await p.screenshot({ path: "/tmp/shot-outreach.png", fullPage: true });
  console.log("errors:", errs); await b.close();
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
