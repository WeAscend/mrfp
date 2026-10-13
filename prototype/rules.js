// MRFP business rules — pure functions, no DOM. Ported to TypeScript in the app.
// Dates are ISO strings "YYYY-MM-DD".

const STEPS = [
  [1, "Not Started"], [2, "Authority to Act Sent"], [3, "Authority to Act Signed & Received"],
  [4, "Awaiting ID & Address Evidence"], [5, "Holding Authority Forms Sent for Signature"],
  [6, "Holding Authority Forms Signed & Received"], [7, "Submitted to Holding Authority"],
  [8, "Awaiting more info required for Holding Authority"], [9, "Resent to Holding Authority"],
  [10, "Approved - Waiting on Refund"], [11, "Refund Received"], [12, "Refund Received - No Client Fee"],
  [13, "MRF Invoice Sent"], [14, "MRF Payment Received"], [15, "Review Requested"],
  [16, "Review Completed"], [17, "Review not received"], [18, "Unable to Claim"], [19, "Incomplete"],
  [20, "Client went to another MRA"], [21, "No Contact from Client"],
];
const STEP_NAME = Object.fromEntries(STEPS);
const CLOSING_STEPS = [16, 17, 18, 19, 20, 21];
const PAID_STEP = 14; // "paid" = reached MRF Payment Received
// Milestone -> date field stamped (only if blank). Repeating steps (2,3,9) handled separately.
const MILESTONE_FIELD = { 5: "haFormSent", 6: "haFormSigned", 7: "dateSubmitted", 10: "claimApproved", 11: "refundReceived", 12: "refundReceived", 13: "invoiceSent", 14: "paymentReceived", 15: "reviewRequested", 16: "reviewCompleted" };
const MANUAL_CLOSE_OPTIONS = [21, 19, 18, 20];

const LEAD_IDENTIFIERS = ["New import", "Calling", "Need more info", "Hard to find", "Deep Research", "Info sent - waiting on response", "No response - revisit in 3 months", "A2A sent", "Leads No List"];
const INACTIVE_REASONS = ["Completed", "Free Search - nothing found", "Not interested", "Recovering themselves", "Told client to recover themselves", "Went to another MRA", "Dead end - not recoverable", "No response", "Rude DNC"];
const SOURCES = ["MT Cold Call", "MRF Free Search Request", "MRF Contact Form", "MT Family/Friends", "Referral", "Referral from Existing Client", "Call from Google Search"];
const SPECIAL_CONDITIONS = ["Deceased Estate", "Overseas", "NZ", "WA", "Charity", "POA", "Super Fund Account"];
const FEE_OPTIONS = [0, 5, 10, 12, 15, 20];

// ---------- dates ----------
function iso(d) { return d.toISOString().slice(0, 10); }
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function addDays(s, n) { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function addMonths(s, n) { const d = parseISO(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return iso(d); }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function fmtDate(s, withYear = true) { if (!s) return ""; const d = parseISO(s); const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]; return withYear ? `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${m}`; }
function parseAUDate(s) { // D/MM/YYYY -> ISO
  if (!s) return null; const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// NSW + VIC + national public holidays. Bundled data set; the app loads these from data.gov.au each year.
const HOLIDAYS = new Set([
  "2026-01-01","2026-01-26","2026-03-09","2026-04-03","2026-04-04","2026-04-05","2026-04-06","2026-04-25","2026-06-08","2026-10-05","2026-11-03","2026-12-25","2026-12-26","2026-12-28",
  "2027-01-01","2027-01-26","2027-03-08","2027-03-26","2027-03-27","2027-03-28","2027-03-29","2027-04-25","2027-04-26","2027-06-14","2027-10-04","2027-11-02","2027-12-25","2027-12-26","2027-12-27","2027-12-28",
]);
function isBusinessDay(s) { const wd = parseISO(s).getUTCDay(); return wd !== 0 && wd !== 6 && !HOLIDAYS.has(s); }
function addBusinessDays(s, n) { let d = s, c = 0; while (c < n) { d = addDays(d, 1); if (isBusinessDay(d)) c++; } return d; }

// ---------- money ----------
function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function money(x, cur) { if (x == null || x === "" || isNaN(x)) return "—"; const s = "$" + Number(x).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return cur ? `${s} ${cur}` : s; }
function parseMoney(s) { if (s == null || s === "") return null; const n = Number(String(s).replace(/[$,\s]/g, "")); return isNaN(n) ? null : n; }
function feeAUD(claim) { // AUD: Amount x %; NZD: manual; step 12 -> 0
  if (claim.progress === 12) return 0;
  if (claim.currency === "NZD") return claim.feeManual ?? null;
  if (claim.amount == null || claim.feePct == null) return null;
  return round2(claim.amount * claim.feePct / 100);
}
function gstBreakdown(fee, treatment) {
  if (fee == null) return { exGst: null, gst: null, total: null };
  if (treatment === "Inclusive of GST") { const gst = round2(fee / 11); return { exGst: round2(fee - gst), gst, total: round2(fee) }; }
  const gst = round2(fee * 0.1); return { exGst: round2(fee), gst, total: round2(fee + gst) };
}

// ---------- Client Code (Appendix A) ----------
function deaccent(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function individualCodeBase(surname, firstName) {
  let s = deaccent(surname || "").toUpperCase().replace(/'/g, "");
  const first = s.trim().split(/\s+/)[0] || "";          // multi-word: first word only
  let core = first.replace(/[^A-Z0-9]/g, "");              // hyphens read continuously
  core = (core + "XXX").slice(0, 3);
  const init = (deaccent(firstName || "").toUpperCase().replace(/[^A-Z]/g, "")[0]) || "X";
  return core + init;
}
const STOP_WORDS = ["THE", "PTY", "LTD", "LIMITED", "P/L"]; // confirm with MT (Open item)
function businessCodeBase(name) {
  let s = deaccent(name || "").toUpperCase();
  s = s.replace(/\bATF\b.*$/, "");                           // 'ATF' and after ignored
  s = s.replace(/&/g, " ").replace(/\bAND\b/g, " ");          // dropped entirely
  s = s.replace(/[.,()']/g, "");                            // ignored
  let words = s.split(/\s+/).filter(Boolean).filter(w => !STOP_WORDS.includes(w));
  words = words.map(w => w.replace(/[-\/]/g, "")).filter(Boolean); // dashes/slashes read continuously
  let code;
  if (words.length === 0) code = "XXXX";
  else if (/^\d/.test(words[0])) {
    const digits = words[0].match(/^\d+/)[0].slice(0, 2);
    const rest = words[0].slice(words[0].match(/^\d+/)[0].length);
    const next = (rest || words[1] || "").replace(/[^A-Z0-9]/g, "").slice(0, 2);
    code = (digits + next + "XX").slice(0, 4);
  } else if (words.length === 1) code = (words[0].replace(/[^A-Z0-9]/g, "") + "XXXX").slice(0, 4);
  else code = (words[0].slice(0, 2) + words[1].slice(0, 2) + "XX").slice(0, 4); // stated rule; Spec example "A Plus Plumbing -> 9APPL1" is inconsistent (MT question)
  return "9" + code;
}
function assignCode(base, existingCodes) { // disambiguation digit 1,2,...,10,11
  let n = 1; while (existingCodes.has(base + n)) n++; return base + n;
}
function clientCodeFor(client, existingCodes) {
  const base = client.clientType === "Business" ? businessCodeBase((client.businessNames || [])[0] || "") : individualCodeBase(client.surname, client.firstName);
  return assignCode(base, existingCodes);
}
function nextClaimId(authorityCode, clientCode, existingClaimIds) {
  if (!authorityCode) return null;
  const prefix = authorityCode + clientCode + "-";
  let n = 1; while (existingClaimIds.has(prefix + String(n).padStart(4, "0"))) n++;
  return prefix + String(n).padStart(4, "0");
}

// ---------- names ----------
function displayName(c) {
  if (c.clientType === "Business") return (c.businessNames && c.businessNames[0]) || "(unnamed business)";
  return `${(c.surname || "").toUpperCase()}, ${c.firstName || ""}`.replace(/, $/, "");
}
function isClosed(claim) { return CLOSING_STEPS.includes(claim.progress); }
function isOpen(claim) { return claim.progress != null && !isClosed(claim); }

// ---------- follow-up computations ----------
// Next HA follow-up: only steps 7-9, with a submitted date, authority with a rule.
function nextHAFollowUp(claim, authority) {
  if (![7, 8, 9].includes(claim.progress) || !authority || !authority.chaseAfter) return null;
  const latest = [claim.dateSubmitted, ...(claim.resubmissions || [])].filter(Boolean).sort().pop();
  if (!latest) return null;
  if (claim.lastChased && claim.lastChased >= latest) return addDays(claim.lastChased, authority.rechaseAfter || 7);
  return addDays(latest, authority.chaseAfter);
}
// A2A chase date: 6th business day after the Sent date; null when matching Signed exists or lead ended.
function a2aChaseDate(sentISO) { return sentISO ? addBusinessDays(sentISO, 6) : null; }

// Build every follow-up item for a client. Each: {date, kind, label, sub, clientId, claimId?, setBy, auto}
function followUpsForClient(client, claims, authoritiesById, today) {
  const out = [];
  if (client.followUp) out.push({ date: client.followUp, kind: "client", label: "Client follow-up", sub: client.followUpReason || "", clientId: client.id, setBy: client.followUpSetBy || "MT1" });
  const leadEnded = client.stage === "Inactive" || client.leadIdentifier === "Leads No List";
  if (client.stage === "Lead" && client.a2aSent && !client.a2aSigned && !leadEnded) {
    const d = a2aChaseDate(client.a2aSent); out.push({ date: d, kind: "a2a", label: "A2A chase", sub: `Automatic: A2A sent ${fmtDate(client.a2aSent)} + 6 business days`, clientId: client.id, setBy: "Automatic" });
  }
  for (const cl of claims.filter(c => c.clientId === client.id)) {
    const ha = authoritiesById[cl.authorityId];
    if (cl.followUp) out.push({ date: cl.followUp, kind: "claim", label: `${cl.claimId} · ${ha ? ha.name : ""} - claim follow-up`, sub: cl.followUpReason || "", clientId: client.id, claimId: cl.id, setBy: cl.followUpSetBy || "MT1" });
    const next = nextHAFollowUp(cl, ha);
    if (next) { const latest = [cl.dateSubmitted, ...(cl.resubmissions || [])].filter(Boolean).sort().pop(); out.push({ date: next, kind: "ha", label: `${cl.claimId} · ${ha.name} - authority follow-up`, sub: cl.lastChased && cl.lastChased >= latest ? `Automatic: chased ${fmtDate(cl.lastChased)} + ${ha.rechaseAfter} days` : `Automatic: submitted ${fmtDate(latest)} + ${ha.chaseAfter} days`, clientId: client.id, claimId: cl.id, setBy: "Automatic" }); }
    if (isOpen(cl) && client.stage !== "Inactive") { // claim-level A2A chase: any Sent entry with no Signed date yet
      const open = (cl.a2aLog || []).filter(e => e.sent && !e.signed).sort((a, b) => a.sent < b.sent ? 1 : -1)[0];
      if (open) out.push({ date: a2aChaseDate(open.sent), kind: "a2a", label: `${cl.claimId} · ${ha ? ha.name : ""} - A2A chase`, sub: `Automatic: A2A sent ${fmtDate(open.sent)} + 6 business days`, clientId: client.id, claimId: cl.id, setBy: "Automatic" });
    }
  }
  return out.map(f => ({ ...f, overdue: f.date < today, due: f.date <= today })).sort((a, b) => (a.overdue === b.overdue ? (a.date < b.date ? -1 : 1) : a.overdue ? -1 : 1));
}

// Lead CSV import: map one row -> client draft + flags
function importRow(row, importDate, source) {
  const flags = [];
  const surname = (row["Surname"] || "").trim();
  const sc = (row["Special Condition"] || "").trim();
  const isBusiness = sc === "Business" || (!row["First Name"] && /\b(PTY|LTD|LIMITED|P\/L|INC)\b/i.test(surname));
  const status = (row["Status"] || "").trim();
  if (status && status !== "LEADS - NEW") flags.push(`Status '${status}' is not LEADS - NEW; imported as New import`);
  const special = [];
  if (sc && sc !== "Business") special.push(sc === "Super Fund" ? "Super Fund Account" : sc);
  const prev = ["Previous Address 1", "Previous Address 2", "Previous Address 3"].map(k => (row[k] || "").trim()).filter(Boolean);
  const notes = [];
  if ((row["Notes"] || "").trim()) notes.push({ date: importDate, text: row["Notes"].trim(), author: "Import", system: true });
  const lc = parseAUDate(row["Last Contact Date"]);
  if (lc) notes.push({ date: lc, text: "Last contact date from import file", author: "Import", system: true });
  const c = {
    clientType: isBusiness ? "Business" : "Individual",
    surname: isBusiness ? "" : surname, firstName: isBusiness ? "" : (row["First Name"] || "").trim(), middleName: (row["Middle Name"] || "").trim(),
    businessNames: isBusiness ? [surname] : [],
    stage: "Lead", leadIdentifier: "New import", source, owner: "MT1",
    leadAmount: parseMoney(row["Amount"]), addressOnUCM: (row["Address on UCM"] || "").trim(),
    specialConditions: special, email: (row["Email"] || "").trim(), phoneMobile: (row["Phone - Mobile"] || "").trim(), phoneOther: (row["Phone - Other"] || "").trim(),
    dob: parseAUDate(row["DOB"]), abn: (row["ABN"] || "").trim(), currentAddress: (row["Current Address"] || "").trim(), previousAddresses: prev,
    searchLog: (row["Search Results"] || "").trim() ? [{ date: importDate, authorities: row["Search Results"].split(",").map(s => s.trim()).filter(Boolean) }] : [],
    notes, lastContact: lc, dateEntered: importDate,
  };
  return { client: c, flags };
}
function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(x => x.trim() !== "")).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
function nameKey(c) { return c.clientType === "Business" ? ((c.businessNames || [])[0] || "").trim().toLowerCase() : `${(c.surname || "").trim().toLowerCase()}|${(c.firstName || "").trim().toLowerCase()}`; }

const R = { STEPS, STEP_NAME, CLOSING_STEPS, PAID_STEP, MILESTONE_FIELD, MANUAL_CLOSE_OPTIONS, LEAD_IDENTIFIERS, INACTIVE_REASONS, SOURCES, SPECIAL_CONDITIONS, FEE_OPTIONS, iso, parseISO, addDays, addMonths, daysBetween, fmtDate, parseAUDate, isBusinessDay, addBusinessDays, round2, money, parseMoney, feeAUD, gstBreakdown, individualCodeBase, businessCodeBase, assignCode, clientCodeFor, nextClaimId, displayName, isClosed, isOpen, nextHAFollowUp, a2aChaseDate, followUpsForClient, importRow, parseCSV, nameKey };
if (typeof module !== "undefined") module.exports = R;
