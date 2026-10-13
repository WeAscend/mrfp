import { describe, it, expect } from "vitest";
import * as R from "./rules";

const HOL = new Set(["2026-10-05", "2026-04-03", "2026-04-06", "2026-06-08"]); // NSW Labour Day, Easter, King's Birthday

describe("Client Code — Appendix A1 individuals", () => {
  it.each([
    ["Moore", "Peter", "MOOP"], ["Moorehouse", "Paul", "MOOP"], ["Li", "Chen", "LIXC"], ["O'Brien", "Sarah", "OBRS"],
    ["Van Der Berg", "James", "VANJ"], ["Smith-Jones", "Anna", "SMIA"], ["Li-Wang", "Bo", "LIWB"], ["Müller", "Max", "MULM"],
    ["Smith", "", "SMIX"], ["De Souza", "Ana", "DEXA"], ["TESTER", "Alice", "TESA"],
  ])("%s %s -> %s", (s, f, e) => expect(R.individualCodeBase(s, f)).toBe(e));
  it("disambiguation digit increments and passes 9", () => {
    expect(R.assignCode("MOOP", new Set(["MOOP1"]))).toBe("MOOP2");
    expect(R.assignCode("MOOP", new Set([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => "MOOP" + n)))).toBe("MOOP10");
  });
});
describe("Client Code — Appendix A2 businesses", () => {
  it.each([
    ["Boral", "9BORA"], ["BHP", "9BHPX"], ["Smith Constructions Pty Ltd", "9SMCO"], ["Smith Holdings", "9SMHO"], ["Smith & Sons", "9SMSO"],
    ["The Good Guys Electrical", "9GOGU"], ["1300 Plumbing", "913PL"], ["99 Towing", "999TO"], ["24/7 Towing", "924TO"], ["7-Eleven", "97ELX"],
    ["A Plus Plumbing", "9APLX"], ["EXAMPLE HOLDINGS PTY LTD", "9EXHO"], ["Smith Family ATF Smith Trust", "9SMFA"], ["Jones Co Inc", "9JONE"], ["Bob's Plumbing Trading As Fast Flow", "9BOPL"], ["Acme Group T/A Acme Signs", "9ACGR"],
  ])("%s -> %s", (n, e) => expect(R.businessCodeBase(n)).toBe(e));
});
describe("Claim ID", () => {
  it("sequence per client per authority", () => {
    expect(R.nextClaimId("A", "MOOP1", new Set())).toBe("AMOOP1-0001");
    expect(R.nextClaimId("A", "MOOP1", new Set(["AMOOP1-0001"]))).toBe("AMOOP1-0002");
    expect(R.nextClaimId(null, "MOOP1", new Set())).toBeNull();
  });
});
describe("Fees and GST — Spec 7", () => {
  it("AUD fee = amount x %", () => expect(R.feeAUD({ progress: 7, currency: "AUD", amount: "12480.55", feePct: "20", feeManual: null })).toBe(2496.11));
  it("NZD fee is manual, never from the amount", () => expect(R.feeAUD({ progress: 4, currency: "NZD", amount: "3250", feePct: "20", feeManual: null })).toBeNull());
  it("step 12 forces $0", () => expect(R.feeAUD({ progress: 12, currency: "AUD", amount: "1000", feePct: "20", feeManual: null })).toBe(0));
  it("+ GST", () => expect(R.gstBreakdown(2000, "+ GST")).toEqual({ exGst: 2000, gst: 200, total: 2200 }));
  it("Inclusive of GST", () => expect(R.gstBreakdown(2000, "Inclusive of GST")).toEqual({ exGst: 1818.18, gst: 181.82, total: 2000 }));
});
describe("Business days", () => {
  it("A2A sent Friday 2 Oct 2026 skips weekend + NSW Labour Day: 6th business day is 13 Oct", () => expect(R.addBusinessDays("2026-10-02", 6, HOL)).toBe("2026-10-13"));
  it("addMonths clamps to month end", () => { expect(R.addMonths("2026-10-13", 3)).toBe("2027-01-13"); expect(R.addMonths("2026-11-30", 3)).toBe("2027-02-28"); });
});
describe("Holding Authority follow-up — Spec 8", () => {
  const asic = { id: "a", name: "ASIC", chaseAfter: 67, rechaseAfter: 21 }, nsw = { id: "n", name: "Revenue NSW", chaseAfter: 37, rechaseAfter: 7 };
  const base = { id: "k", claimId: "X", clientId: "c", authorityId: "a", progress: 7, dateSubmitted: null as string | null, resubmissions: [] as string[], lastChased: null as string | null, followUp: null, followUpReason: null, followUpSetBy: null, a2aLog: [] };
  it("ASIC submitted 68 days ago is due", () => { const sub = R.addDays("2026-10-13", -68); expect(R.nextHAFollowUp({ ...base, dateSubmitted: sub }, asic)! <= "2026-10-13").toBe(true); });
  it("Revenue NSW resubmitted 10 days ago is not due", () => { expect(R.nextHAFollowUp({ ...base, authorityId: "n", progress: 9, dateSubmitted: "2026-04-20", resubmissions: ["2026-10-03"] }, nsw)).toBe("2026-11-09"); });
  it("step 8 drops off the list; step 9 restarts from the resubmission (Decisions 1.4)", () => { expect(R.nextHAFollowUp({ ...base, progress: 8, dateSubmitted: "2026-01-01" }, asic)).toBeNull(); expect(R.nextHAFollowUp({ ...base, progress: 9, dateSubmitted: "2026-01-01", resubmissions: ["2026-10-01"] }, asic)).toBe(R.addDays("2026-10-01", 67)); });
  it("step 17 is not a closing step; 16 is Completed (Decisions 1.7)", () => { expect(R.isClosed({ progress: 17 })).toBe(false); expect(R.isClosed({ progress: 16 })).toBe(true); expect(R.COMPLETED_STEP).toBe(16); });
  it("Search Results short names map to authorities (Decisions 2.5)", () => { expect(R.mapAuthorityName("SA")).toBe("SA Treasury"); expect(R.mapAuthorityName("WA")).toBe("WA Treasury"); expect(R.mapAuthorityName("ACT")).toBe("Treasury ACT"); });
  it("no submitted date never appears; step 10+ leaves", () => { expect(R.nextHAFollowUp(base, asic)).toBeNull(); expect(R.nextHAFollowUp({ ...base, progress: 10, dateSubmitted: "2026-01-01" }, asic)).toBeNull(); });
  it("Chased pushes out by re-chase days", () => expect(R.nextHAFollowUp({ ...base, dateSubmitted: "2026-07-01", lastChased: "2026-10-13" }, asic)).toBe("2026-11-03"));
});
describe("Follow-ups for a client", () => {
  it("lead with A2A sent is on the chase until signed; Leads No List ends it", () => {
    const c = { id: "c", stage: "LEAD", leadIdentifier: "A2A sent", followUp: null, followUpReason: null, followUpSetBy: null, a2aSent: "2026-10-02", a2aSigned: null, ownerCode: "MT1" };
    const f = R.followUpsForClient(c, [], {}, "2026-10-13", HOL);
    expect(f).toHaveLength(1); expect(f[0].kind).toBe("a2a"); expect(f[0].date).toBe("2026-10-13"); expect(f[0].due).toBe(true);
    expect(R.followUpsForClient({ ...c, a2aSigned: "2026-10-10" }, [], {}, "2026-10-13", HOL)).toHaveLength(0);
    expect(R.followUpsForClient({ ...c, leadIdentifier: "Leads No List" }, [], {}, "2026-10-13", HOL)).toHaveLength(0);
  });
  it("overdue items sort first, oldest first", () => {
    const c = { id: "c", stage: "ACTIVE", leadIdentifier: null, followUp: "2026-10-10", followUpReason: "x", followUpSetBy: "MT1", a2aSent: null, a2aSigned: null, ownerCode: "MT1" };
    const k = { id: "k", claimId: "AX1-0001", clientId: "c", authorityId: "a", progress: 7, dateSubmitted: "2026-07-01", resubmissions: [], lastChased: null, followUp: "2026-12-01", followUpReason: null, followUpSetBy: "MT1", a2aLog: [] };
    const f = R.followUpsForClient(c, [k], { a: { id: "a", name: "ASIC", chaseAfter: 67, rechaseAfter: 21 } }, "2026-10-13", HOL);
    expect(f.map(x => x.date)).toEqual(["2026-09-06", "2026-10-10", "2026-12-01"]);
  });
});
describe("Lead CSV import", () => {
  it("company in Surname becomes a Business; Super Fund maps; odd status flagged; leading zeros kept", () => {
    const a = R.importRow({ Surname: "IMPORT FREIGHT PTY LTD", "Special Condition": "Business", Amount: "$18,200.00" }, "2026-10-13");
    expect(a.lead.clientType).toBe("BUSINESS"); expect(a.lead.businessNames).toEqual(["IMPORT FREIGHT PTY LTD"]); expect(a.lead.leadAmount).toBe(18200);
    const b = R.importRow({ Surname: "IMPORTC", "First Name": "Ivan", "Special Condition": "Super Fund" }, "2026-10-13");
    expect(b.lead.specialConditions).toEqual(["Super Fund Account"]);
    const c = R.importRow({ Surname: "IMPORTD", "First Name": "Ivy", Status: "LEAD - Green", "Phone - Mobile": "0400 111 222", DOB: "05/11/1972" }, "2026-10-13");
    expect(c.flags[0]).toMatch(/not LEADS - NEW/); expect(c.lead.phoneMobile).toBe("0400 111 222"); expect(c.lead.dob).toBe("1972-11-05");
  });
});
