// Fillable PDF forms (Decisions 6.5): Admin uploads an editable PDF (AcroForm), maps each field to a record value,
// and anyone can download it filled in for a client/claim. The PDF stays editable — nothing is flattened.
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import { logActivity, ownClient, ownClaim } from "../tenant";
import { storage, safeName } from "../storage";
import * as R from "../rules";

export type PdfField = { name: string; type: "text" | "checkbox" | "radio" | "dropdown" | "other"; options?: string[] };
export type Source = { key: string; label: string; group: "Client" | "Claim" | "Business" | "Other" };
export const SOURCES: Source[] = [
  ...[["client.fullName", "Full name (First Surname)"], ["client.displayName", "Name (Surname, First)"], ["client.surname", "Surname"], ["client.firstName", "First name"], ["client.middleName", "Middle name"], ["client.otherNames", "Other names"], ["client.dob", "Date of birth"], ["client.email", "Email"], ["client.phoneMobile", "Phone - mobile"], ["client.phoneOther", "Phone - other"], ["client.currentAddress", "Current address"], ["client.currentPOBox", "PO Box"], ["client.previousAddress1", "Previous address 1"], ["client.previousAddress2", "Previous address 2"], ["client.addressOnUCM", "Address on UCM"], ["client.businessName", "Business name"], ["client.abn", "ABN"], ["client.acn", "ACN"], ["client.businessContact", "Business contact"], ["client.clientCode", "Client Code"]].map(([key, label]) => ({ key, label, group: "Client" as const })),
  ...[["claim.claimId", "Claim ID"], ["claim.reference", "OTN / Reference"], ["claim.amount", "Amount"], ["claim.authority", "Holding Authority"], ["claim.accountName", "Account name"], ["claim.year", "Year"], ["claim.addressOnRegister", "Address on register"], ["claim.companies", "Originating company"], ["claim.feePct", "Fee %"], ["claim.fee", "Fee (AUD)"], ["claim.dateSubmitted", "Date submitted"]].map(([key, label]) => ({ key, label, group: "Claim" as const })),
  ...[["org.name", "Business name"], ["org.shortName", "Short name"], ["org.postalAddress", "Postal address"], ["org.phone", "Phone"], ["org.website", "Website"], ["org.fromEmail", "Email"], ["user.name", "Your name"], ["user.code", "Your user code"]].map(([key, label]) => ({ key, label, group: "Business" as const })),
  ...[["today", "Today's date"], ["yes", "Tick / Yes"], ["blank", "Leave blank"]].map(([key, label]) => ({ key, label, group: "Other" as const })),
];

const F = schema.formTemplates;
export async function listForms(t: Tenant) { return db.select().from(F).where(and(eq(F.orgId, t.org.id), isNull(F.deletedAt))).orderBy(F.name); }

/** Read the fillable fields out of a PDF. Throws a plain message for PDFs without a form (scans, XFA). */
export async function inspectPdf(buf: Buffer): Promise<PdfField[]> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = await import("pdf-lib");
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const form = doc.getForm(); const fields = form.getFields();
  if (!fields.length) throw new Error("This PDF has no fillable fields. It needs to be an editable (AcroForm) PDF — a scan or a flattened PDF can't be filled.");
  return fields.map(f => { const name = f.getName(); if (f instanceof PDFTextField) return { name, type: "text" as const }; if (f instanceof PDFCheckBox) return { name, type: "checkbox" as const }; if (f instanceof PDFRadioGroup) return { name, type: "radio" as const, options: f.getOptions() }; if (f instanceof PDFDropdown || f instanceof PDFOptionList) return { name, type: "dropdown" as const, options: f.getOptions() }; return { name, type: "other" as const }; });
}
export async function addForm(t: Tenant, i: { name: string; fileName: string; buf: Buffer; scope: "CLAIM" | "CLIENT" }) {
  if (!t.isAdmin) throw new Error("Admin only");
  const fields = await inspectPdf(i.buf);
  const [row] = await db.insert(F).values({ orgId: t.org.id, name: i.name.trim() || i.fileName, storageKey: "pending", fileName: safeName(i.fileName), fields, scope: i.scope }).returning();
  const key = `${t.org.id}/forms/${row.id}-${safeName(i.fileName)}`; await storage().put(key, i.buf, "application/pdf");
  await db.update(F).set({ storageKey: key }).where(eq(F.id, row.id));
  await logActivity(db, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Form", entityId: row.id, recordRef: row.name, newValue: `${fields.length} fields` });
  return { ...row, storageKey: key };
}
export async function updateForm(t: Tenant, id: string, patch: { name?: string; mapping?: Record<string, string>; scope?: "CLAIM" | "CLIENT" }) {
  if (!t.isAdmin) throw new Error("Admin only");
  const f = await db.query.formTemplates.findFirst({ where: and(eq(F.id, id), eq(F.orgId, t.org.id)) }); if (!f) throw new Error("Form not found");
  await db.update(F).set(patch).where(eq(F.id, id));
  await logActivity(db, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Form", entityId: id, recordRef: f.name, field: Object.keys(patch).join(", ") });
}
export async function removeForm(t: Tenant, id: string) {
  if (!t.isAdmin) throw new Error("Admin only");
  const f = await db.query.formTemplates.findFirst({ where: and(eq(F.id, id), eq(F.orgId, t.org.id)) }); if (!f) throw new Error("Form not found");
  await db.update(F).set({ deletedAt: new Date() }).where(eq(F.id, id));
  await logActivity(db, t.org.id, t.membership.userCode, { action: "DELETED", entityType: "Form", entityId: id, recordRef: f.name });
}

/** Every value a mapping can draw on, for one client (+ optional claim). */
export async function sourceValues(t: Tenant, clientId: string, claimId?: string | null): Promise<Record<string, string>> {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  const k = claimId ? await db.query.claims.findFirst({ where: ownClaim(t.org.id, claimId), with: { authority: true, companies: { with: { company: true } } } }) : null;
  const d = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "");
  const v: Record<string, string> = {
    "client.fullName": c.clientType === "BUSINESS" ? (c.businessNames[0] || "") : [c.firstName, c.middleName, c.surname].filter(Boolean).join(" "), "client.displayName": R.displayName(c),
    "client.surname": c.surname || "", "client.firstName": c.firstName || "", "client.middleName": c.middleName || "", "client.otherNames": c.otherNames || "", "client.dob": d(c.dob), "client.email": (c.email || "").split(/\n/)[0] || "",
    "client.phoneMobile": c.phoneMobile || "", "client.phoneOther": c.phoneOther || "", "client.currentAddress": c.currentAddress || "", "client.currentPOBox": c.currentPOBox || "", "client.previousAddress1": c.previousAddresses[0] || "", "client.previousAddress2": c.previousAddresses[1] || "",
    "client.addressOnUCM": c.addressOnUCM || "", "client.businessName": c.businessNames[0] || "", "client.abn": c.abn || "", "client.acn": c.acn || "", "client.businessContact": c.businessContact || "", "client.clientCode": c.clientCode || "",
    "org.name": t.org.name, "org.shortName": t.org.shortName, "org.postalAddress": t.org.postalAddress || "", "org.phone": t.org.phone || "", "org.website": t.org.website || "", "org.fromEmail": t.org.fromEmail || "", "user.name": t.user.name, "user.code": t.membership.userCode,
    today: d(t.today), yes: "Yes", blank: "",
  };
  if (k) Object.assign(v, { "claim.claimId": k.claimId, "claim.reference": k.reference || "", "claim.amount": k.amount ? R.money(k.amount) : "", "claim.authority": k.authority.name, "claim.accountName": k.accountName || "", "claim.year": k.year || "", "claim.addressOnRegister": k.addressOnRegister || "", "claim.companies": k.companies.map(x => x.company.name).join(", "), "claim.feePct": k.feePct ? String(Number(k.feePct)) : "", "claim.fee": R.money(R.feeAUD(k)), "claim.dateSubmitted": d(k.dateSubmitted) });
  return v;
}
/** Fill the form for a client/claim. Returns the PDF bytes and a sensible file name. */
export async function fillForm(t: Tenant, formId: string, clientId: string, claimId?: string | null) {
  const f = await db.query.formTemplates.findFirst({ where: and(eq(F.id, formId), eq(F.orgId, t.org.id), isNull(F.deletedAt)) }); if (!f) throw new Error("Form not found");
  if (f.scope === "CLAIM" && !claimId) throw new Error("This form needs a claim — open it from the claim card");
  const vals = await sourceValues(t, clientId, claimId);
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = await import("pdf-lib");
  const doc = await PDFDocument.load(await storage().get(f.storageKey), { ignoreEncryption: true }); const form = doc.getForm();
  const mapping = (f.mapping || {}) as Record<string, string>; let filled = 0;
  for (const [field, src] of Object.entries(mapping)) {
    if (!src || src === "blank") continue;
    const value = src.startsWith("text:") ? src.slice(5) : vals[src] ?? "";
    let fld; try { fld = form.getField(field); } catch { continue; }
    try {
      if (fld instanceof PDFTextField) { fld.setText(value); filled++; }
      else if (fld instanceof PDFCheckBox) { if (/^(yes|true|x|1|on)$/i.test(value) || (src !== "yes" && value)) fld.check(); else fld.uncheck(); filled++; }
      else if (fld instanceof PDFRadioGroup) { const o = fld.getOptions().find(x => x.toLowerCase() === value.toLowerCase()); if (o) { fld.select(o); filled++; } }
      else if (fld instanceof PDFDropdown || fld instanceof PDFOptionList) { const o = fld.getOptions().find(x => x.toLowerCase() === value.toLowerCase()); if (o) { fld.select(o); filled++; } }
    } catch { /* leave the field as it was */ }
  }
  try { form.updateFieldAppearances(); } catch { /* some PDFs lack a default font; viewers regenerate appearances */ }
  const bytes = Buffer.from(await doc.save());
  const who = vals["client.displayName"] || "client";
  return { bytes, fileName: `${f.name} - ${who}${claimId ? ` - ${vals["claim.claimId"]}` : ""}.pdf`.replace(/[\\/:*?"<>|]/g, "-"), filled, total: Object.keys(mapping).length };
}
