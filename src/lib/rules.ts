// MRFP business rules — pure functions, no database, no DOM. Unit-tested in src/lib/rules.test.ts.
// Dates are ISO strings "YYYY-MM-DD" (the DB `date` columns come back as strings).

export const STEPS: [number, string][] = [
  [1, "Not Started"], [2, "Authority to Act Sent"], [3, "Authority to Act Signed & Received"],
  [4, "Awaiting ID & Address Evidence"], [5, "Holding Authority Forms Sent for Signature"],
  [6, "Holding Authority Forms Signed & Received"], [7, "Submitted to Holding Authority"],
  [8, "Awaiting more info required for Holding Authority"], [9, "Resent to Holding Authority"],
  [10, "Approved - Waiting on Refund"], [11, "Refund Received"], [12, "Refund Received - No Client Fee"],
  [13, "{ORG} Invoice Sent"], [14, "{ORG} Payment Received"], [15, "Review Requested"],
  [16, "Review Completed"], [17, "Review not received"], [18, "Unable to Claim"], [19, "Incomplete"],
  [20, "Client went to another MRA"], [21, "No Contact from Client"],
];
export const stepName = (n: number | null | undefined, org = "MRF") => n ? (STEPS.find(s => s[0] === n)?.[1] ?? "").replace("{ORG}", org) : "";
export const CLOSING_STEPS = [16, 17, 18, 19, 20, 21];
export const PAID_STEPS = [14, 15, 16, 17]; // reached MRF Payment Received
export const MANUAL_CLOSE_OPTIONS = [21, 19, 18, 20];
export const MILESTONE_FIELD: Record<number, string> = { 5: "haFormSent", 6: "haFormSigned", 7: "dateSubmitted", 10: "claimApproved", 11: "refundReceived", 12: "refundReceived", 13: "invoiceSent", 14: "paymentReceived", 15: "reviewRequested", 16: "reviewCompleted" };

export const LEAD_IDENTIFIERS = ["New import", "Calling", "Need more info", "Hard to find", "Deep Research", "Info sent - waiting on response", "No response - revisit in 3 months", "A2A sent", "Leads No List"];
export const INACTIVE_REASONS = ["Completed", "Free Search - nothing found", "Not interested", "Recovering themselves", "Told client to recover themselves", "Went to another MRA", "Dead end - not recoverable", "No response", "Rude DNC"];
export const SOURCES = ["MT Cold Call", "MRF Free Search Request", "MRF Contact Form", "MT Family/Friends", "Referral", "Referral from Existing Client", "Call from Google Search"];
export const SPECIAL_CONDITIONS = ["Deceased Estate", "Overseas", "NZ", "WA", "Charity", "POA", "Super Fund Account"];
export const FEE_OPTIONS = [0, 5, 10, 12, 15, 20];
export const FOLLOW_UP_REASONS = ["Follow up on initial email", "Follow up on A2A", "Follow up on ID & Address Evidence"];
export const A2A_REASONS = ["New address found", "ASIC requires separate copy", "Other"];
export const STANDARD_AUTHORITIES = [
  { name: "ASIC", code: "A", chaseAfter: 67, rechaseAfter: 21 }, { name: "Revenue NSW", code: "N", chaseAfter: 37, rechaseAfter: 7 },
  { name: "SRO Vic", code: "V", chaseAfter: 37, rechaseAfter: 7 }, { name: "PT QLD", code: "Q", chaseAfter: null, rechaseAfter: null },
  { name: "SA Treasury", code: "S", chaseAfter: 37, rechaseAfter: 7 }, { name: "WA Treasury", code: "W", chaseAfter: 37, rechaseAfter: 7 },
  { name: "NZ IRD", code: "I", chaseAfter: 67, rechaseAfter: 21 }, { name: "Treasury ACT", code: null, chaseAfter: null, rechaseAfter: null },
  { name: "Public Trust Tasmania", code: null, chaseAfter: null, rechaseAfter: null },
];

// ---------- dates ----------
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parseISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (s: string, n: number) => { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export function addMonths(s: string, n: number) { const d = parseISO(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return iso(d); }
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(s: string | null | undefined, withYear = true) { if (!s) return ""; const d = parseISO(s); return withYear ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
export function parseAUDate(s: string | null | undefined): string | null { // D/MM/YYYY -> ISO
  if (!s) return null; const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null;
  const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return isNaN(parseISO(d).getTime()) ? null : d;
}
export function todayInZone(tz = "Australia/Sydney", now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => p.find(x => x.type === t)!.value; return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Business days skip weekends and the holidays in `holidays` (ISO strings for the org's regions). */
export function isBusinessDay(s: string, holidays: Set<string>) { const wd = parseISO(s).getUTCDay(); return wd !== 0 && wd !== 6 && !holidays.has(s); }
export function addBusinessDays(s: string, n: number, holidays: Set<string>) { let d = s, c = 0; while (c < n) { d = addDays(d, 1); if (isBusinessDay(d, holidays)) c++; } return d; }

// ---------- money ----------
export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export const num = (x: string | number | null | undefined): number | null => (x == null || x === "" ? null : (isNaN(Number(x)) ? null : Number(x)));
export function money(x: string | number | null | undefined, cur?: string) { const n = num(x); if (n == null) return "—"; const s = "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return cur ? `${s} ${cur}` : s; }
export function parseMoney(s: string | null | undefined): number | null { if (s == null || String(s).trim() === "") return null; const n = Number(String(s).replace(/[$,\s]/g, "")); return isNaN(n) ? null : n; }

export type FeeInput = { progress: number | null; currency: string; amount: string | number | null; feePct: string | number | null; feeManual: string | number | null };
/** AUD: Amount x Fee %. NZD: typed by hand. Step 12 (No Client Fee): $0. */
export function feeAUD(c: FeeInput): number | null {
  if (c.progress === 12) return 0;
  if (c.currency === "NZD") return num(c.feeManual);
  const a = num(c.amount), p = num(c.feePct);
  if (a == null || p == null) return null;
  return round2(a * p / 100);
}
export function gstBreakdown(fee: number | null, treatment: string, gstRate = 10) {
  if (fee == null) return { exGst: null, gst: null, total: null };
  const r = gstRate / 100;
  if (treatment === "Inclusive of GST") { const gst = round2(fee - fee / (1 + r)); return { exGst: round2(fee - gst), gst, total: round2(fee) }; }
  const gst = round2(fee * r); return { exGst: round2(fee), gst, total: round2(fee + gst) };
}

// ---------- Client Code (Spec Appendix A) ----------
const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export function individualCodeBase(surname: string | null | undefined, firstName: string | null | undefined) {
  const s = deaccent(surname || "").toUpperCase().replace(/'/g, "");
  const first = s.trim().split(/\s+/)[0] || "";          // multi-word surname: first word only
  const core = (first.replace(/[^A-Z0-9]/g, "") + "XXX").slice(0, 3); // hyphens read continuously; pad with X
  const init = deaccent(firstName || "").toUpperCase().replace(/[^A-Z]/g, "")[0] || "X";
  return core + init;
}
export const STOP_WORDS = ["THE", "PTY", "LTD", "LIMITED", "P/L"]; // Open item: confirm with MT (Holdings, Group, Trading As, Co?)
export function businessCodeBase(name: string | null | undefined, stopWords = STOP_WORDS) {
  let s = deaccent(name || "").toUpperCase();
  s = s.replace(/\bATF\b.*$/, "");                 // 'ATF' and anything after it ignored
  s = s.replace(/&/g, " ").replace(/\bAND\b/g, " "); // dropped entirely, not a word boundary
  s = s.replace(/[.,()']/g, "");                   // ignored
  const words = s.split(/\s+/).filter(Boolean).filter(w => !stopWords.includes(w)).map(w => w.replace(/[-\/]/g, "")).filter(Boolean);
  let code: string;
  if (words.length === 0) code = "XXXX";
  else if (/^\d/.test(words[0])) {
    const digitsAll = words[0].match(/^\d+/)![0]; const digits = digitsAll.slice(0, 2);
    const rest = words[0].slice(digitsAll.length);
    const next = (rest || words[1] || "").replace(/[^A-Z0-9]/g, "").slice(0, 2);
    code = (digits + next + "XX").slice(0, 4);
  } else if (words.length === 1) code = (words[0].replace(/[^A-Z0-9]/g, "") + "XXXX").slice(0, 4);
  else code = (words[0].slice(0, 2) + words[1].slice(0, 2) + "XX").slice(0, 4); // first 2 of word 1 + first 2 of word 2, padded. NOTE: the Spec's 'A Plus Plumbing -> 9APPL1' example does not follow this rule (gives 9APLX1) — on the MT question list.
  return "9" + code;
}
export function assignCode(base: string, existing: Set<string>) { let n = 1; while (existing.has(base + n)) n++; return base + n; }
export function clientCodeFor(c: { clientType: string; surname?: string | null; firstName?: string | null; businessNames?: string[] | null }, existing: Set<string>) {
  const base = c.clientType === "BUSINESS" ? businessCodeBase((c.businessNames || [])[0] || "") : individualCodeBase(c.surname, c.firstName);
  return assignCode(base, existing);
}
export function nextClaimId(authorityCode: string | null | undefined, clientCode: string, existing: Set<string>) {
  if (!authorityCode || !clientCode) return null;
  const prefix = authorityCode + clientCode + "-";
  let n = 1; while (existing.has(prefix + String(n).padStart(4, "0"))) n++;
  return prefix + String(n).padStart(4, "0");
}

// ---------- names, state ----------
export function displayName(c: { clientType: string; surname?: string | null; firstName?: string | null; businessNames?: string[] | null }) {
  if (c.clientType === "BUSINESS") return (c.businessNames && c.businessNames[0]) || "(unnamed business)";
  const s = (c.surname || "").toUpperCase(), f = c.firstName || "";
  return s && f ? `${s}, ${f}` : s || f || "(unnamed)";
}
export const nameKey = (c: { clientType: string; surname?: string | null; firstName?: string | null; businessNames?: string[] | null }) =>
  c.clientType === "BUSINESS" ? `b|${((c.businessNames || [])[0] || "").trim().toLowerCase()}` : `i|${(c.surname || "").trim().toLowerCase()}|${(c.firstName || "").trim().toLowerCase()}`;
export const isClosed = (k: { progress: number | null }) => k.progress != null && CLOSING_STEPS.includes(k.progress);
export const isOpen = (k: { progress: number | null }) => k.progress != null && !CLOSING_STEPS.includes(k.progress);

// ---------- follow-ups ----------
export type AuthorityRule = { id: string; name: string; chaseAfter: number | null; rechaseAfter: number | null };
export type ClaimForFU = { id: string; claimId: string; clientId: string; authorityId: string; progress: number | null; dateSubmitted: string | null; resubmissions: string[]; lastChased: string | null; followUp: string | null; followUpReason: string | null; followUpSetBy: string | null; a2aLog: { sent: string | null; signed: string | null }[] };
export type ClientForFU = { id: string; stage: string; leadIdentifier: string | null; followUp: string | null; followUpReason: string | null; followUpSetBy: string | null; a2aSent: string | null; a2aSigned: string | null; ownerCode: string };
export type FollowUp = { date: string; kind: "client" | "claim" | "ha" | "a2a"; label: string; sub: string; clientId: string; claimId?: string; setBy: string; overdue: boolean; due: boolean };

export function latestSubmission(k: { dateSubmitted: string | null; resubmissions: string[] }) { return [k.dateSubmitted, ...k.resubmissions].filter((x): x is string => !!x).sort().pop() ?? null; }
/** Next HA follow-up: only steps 7-9, with a submitted date, authority with a rule. After Chased: chase date + re-chase days. */
export function nextHAFollowUp(k: ClaimForFU, a: AuthorityRule | undefined): string | null {
  if (!k.progress || ![7, 8, 9].includes(k.progress) || !a || !a.chaseAfter) return null;
  const latest = latestSubmission(k); if (!latest) return null;
  if (k.lastChased && k.lastChased >= latest) return addDays(k.lastChased, a.rechaseAfter || 7);
  return addDays(latest, a.chaseAfter);
}
export function followUpsForClient(c: ClientForFU, claims: ClaimForFU[], authorities: Record<string, AuthorityRule>, today: string, holidays: Set<string>, chaseBusinessDays = 6): FollowUp[] {
  const out: Omit<FollowUp, "overdue" | "due">[] = [];
  if (c.followUp) out.push({ date: c.followUp, kind: "client", label: "Client follow-up", sub: c.followUpReason || "", clientId: c.id, setBy: c.followUpSetBy || "" });
  const leadEnded = c.stage === "INACTIVE" || c.leadIdentifier === "Leads No List";
  if (c.stage === "LEAD" && c.a2aSent && !c.a2aSigned && !leadEnded)
    out.push({ date: addBusinessDays(c.a2aSent, chaseBusinessDays, holidays), kind: "a2a", label: "A2A chase", sub: `Automatic: A2A sent ${fmtDate(c.a2aSent)} + ${chaseBusinessDays} business days`, clientId: c.id, setBy: "Automatic" });
  for (const k of claims.filter(k => k.clientId === c.id)) {
    const a = authorities[k.authorityId];
    if (k.followUp) out.push({ date: k.followUp, kind: "claim", label: `${k.claimId} · ${a?.name ?? ""} - claim follow-up`, sub: k.followUpReason || "", clientId: c.id, claimId: k.id, setBy: k.followUpSetBy || "" });
    const next = nextHAFollowUp(k, a);
    if (next && a) { const latest = latestSubmission(k)!; const chasedAfter = k.lastChased && k.lastChased >= latest; out.push({ date: next, kind: "ha", label: `${k.claimId} · ${a.name} - authority follow-up`, sub: chasedAfter ? `Automatic: chased ${fmtDate(k.lastChased)} + ${a.rechaseAfter} days` : `Automatic: submitted ${fmtDate(latest)} + ${a.chaseAfter} days`, clientId: c.id, claimId: k.id, setBy: "Automatic" }); }
    if (isOpen(k) && c.stage !== "INACTIVE") { // claim-level A2A chase: a Sent entry with no Signed date yet
      const open = k.a2aLog.filter(e => e.sent && !e.signed).sort((x, y) => (x.sent! < y.sent! ? 1 : -1))[0];
      if (open) out.push({ date: addBusinessDays(open.sent!, chaseBusinessDays, holidays), kind: "a2a", label: `${k.claimId} · ${a?.name ?? ""} - A2A chase`, sub: `Automatic: A2A sent ${fmtDate(open.sent)} + ${chaseBusinessDays} business days`, clientId: c.id, claimId: k.id, setBy: "Automatic" });
    }
  }
  return out.map(f => ({ ...f, overdue: f.date < today, due: f.date <= today })).sort((x, y) => (x.overdue === y.overdue ? (x.date < y.date ? -1 : 1) : x.overdue ? -1 : 1));
}

// ---------- Lead CSV import (Lead CSV Import sheet) ----------
export const LEAD_CSV_COLUMNS = ["Surname", "First Name", "Middle Name", "Search Results", "Amount", "Last Contact Date", "Notes", "Status", "Address on UCM", "Special Condition", "Email", "Phone - Mobile", "Phone - Other", "DOB", "ABN", "Current Address", "Previous Address 1", "Previous Address 2", "Previous Address 3", "Attachments", "No. of days since contact"];
export type ImportedLead = {
  clientType: "INDIVIDUAL" | "BUSINESS"; surname: string; firstName: string; middleName: string; businessNames: string[];
  leadAmount: number | null; addressOnUCM: string; specialConditions: string[]; email: string; phoneMobile: string; phoneOther: string;
  dob: string | null; abn: string; currentAddress: string; previousAddresses: string[]; searchAuthorities: string[];
  notes: { date: string; text: string }[]; lastContact: string | null;
};
export function importRow(row: Record<string, string>, importDate: string): { lead: ImportedLead; flags: string[] } {
  const flags: string[] = [];
  const g = (k: string) => (row[k] ?? "").trim();
  const surname = g("Surname"), sc = g("Special Condition");
  const isBusiness = sc === "Business" || (!g("First Name") && /\b(PTY|LTD|LIMITED|P\/L|INC)\b/i.test(surname));
  const status = g("Status");
  if (status && status !== "LEADS - NEW") flags.push(`Status '${status}' is not LEADS - NEW; imported as New import`);
  const special: string[] = []; if (sc && sc !== "Business") special.push(sc === "Super Fund" ? "Super Fund Account" : sc);
  const notes: { date: string; text: string }[] = []; if (g("Notes")) notes.push({ date: importDate, text: g("Notes") });
  const lc = parseAUDate(g("Last Contact Date")); if (g("Last Contact Date") && !lc) flags.push(`Last Contact Date '${g("Last Contact Date")}' is not d/mm/yyyy`);
  const dob = parseAUDate(g("DOB")); if (g("DOB") && !dob) flags.push(`DOB '${g("DOB")}' is not d/mm/yyyy`);
  const amt = parseMoney(g("Amount")); if (g("Amount") && amt == null) flags.push(`Amount '${g("Amount")}' is not a number`);
  return { lead: {
    clientType: isBusiness ? "BUSINESS" : "INDIVIDUAL", surname: isBusiness ? "" : surname, firstName: isBusiness ? "" : g("First Name"), middleName: g("Middle Name"), businessNames: isBusiness ? [surname] : [],
    leadAmount: amt, addressOnUCM: g("Address on UCM"), specialConditions: special, email: g("Email"), phoneMobile: g("Phone - Mobile"), phoneOther: g("Phone - Other"),
    dob, abn: g("ABN"), currentAddress: g("Current Address"), previousAddresses: ["Previous Address 1", "Previous Address 2", "Previous Address 3"].map(g).filter(Boolean),
    searchAuthorities: g("Search Results") ? g("Search Results").split(",").map(s => s.trim()).filter(Boolean) : [], notes, lastContact: lc,
  }, flags };
}
/** Airtable/legacy holding-authority names -> standard names (Spec 9, 10). */
export const HA_NAME_MAP: Record<string, string> = { "sro victoria": "SRO Vic", "sro vic": "SRO Vic", "treasury sa": "SA Treasury", "sa treasury": "SA Treasury", "wa dept of treasury & finance": "WA Treasury", "wa treasury": "WA Treasury", "asic": "ASIC", "revenue nsw": "Revenue NSW", "pt qld": "PT QLD", "qld public trustee": "PT QLD", "nz ird": "NZ IRD", "ird nz": "NZ IRD", "treasury act": "Treasury ACT", "public trust tasmania": "Public Trust Tasmania" };
export const mapAuthorityName = (s: string) => HA_NAME_MAP[s.trim().toLowerCase()] ?? null;
