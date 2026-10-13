import { describe, it, expect } from "vitest";
import { render, DEFAULT_TEMPLATES } from "./templates";
import { toE164, digitsOnly } from "./sms";

describe("template rendering", () => {
  it("fills placeholders and blanks unknown ones", () => {
    expect(render("Hi {{firstName}}, {{ nope }} from {{org}}", { firstName: "Nina", org: "MRF" })).toBe("Hi Nina,  from MRF");
  });
  it("every default template renders without leaking braces", () => {
    const vars = Object.fromEntries(["firstName", "name", "fullName", "org", "orgShort", "userName", "leadAmount", "foundAt", "foundAtClause", "authority", "claimId", "reference", "amount", "dateSubmitted", "signLink", "fee", "phone", "website"].map(k => [k, k]));
    for (const t of DEFAULT_TEMPLATES) { expect(render(t.body, vars)).not.toMatch(/\{\{/); if (t.subject) expect(render(t.subject, vars)).not.toMatch(/\{\{/); }
  });
});
describe("phone normalisation (SMS)", () => {
  it("formats Australian mobiles to E.164", () => {
    expect(toE164("0412 345 678")).toBe("+61412345678"); expect(toE164("+61 412 345 678")).toBe("+61412345678"); expect(toE164("61412345678")).toBe("+61412345678");
  });
  it("rejects landlines and junk", () => { expect(toE164("02 9876 5432")).toBeNull(); expect(toE164("0412 345 678 ext 22")).toBeNull(); expect(toE164("")).toBeNull(); });
  it("digitsOnly", () => expect(digitsOnly("+61 (4) 12")).toBe("61412"));
});
