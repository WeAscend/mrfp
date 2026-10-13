// Claim services: open claim (Claim ID), 21-step progress with milestone stamping, A2A/resubmission logs, Chased, field edits.
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import { logActivity, ownClaim, ownClient } from "../tenant";
import * as R from "../rules";
import { recomputeStage, recordRef } from "./clients";

const C = schema.clients, K = schema.claims;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function touch(tx: Tx, t: Tenant, k: { id: string; clientId: string }) {
  await tx.update(K).set({ lastUpdatedBy: t.membership.userCode, lastUpdatedAt: new Date() }).where(eq(K.id, k.id));
  await tx.update(C).set({ lastUpdatedBy: t.membership.userCode, lastUpdatedAt: new Date() }).where(eq(C.id, k.clientId));
}
const stepLabel = (t: Tenant, n: number | null) => (n ? `${n} ${R.stepName(n, t.org.shortName)}` : "");

/** Claims can only be opened for Active clients (or an Inactive client returning) — never for a Lead. */
export async function openClaim(t: Tenant, clientId: string, authorityId: string) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  if (c.stage === "LEAD") throw new Error("Claims cannot be opened for a Lead. Enter A2A Signed & Received first.");
  if (!c.clientCode) throw new Error("This client has no Client Code yet.");
  const ha = await db.query.holdingAuthorities.findFirst({ where: and(eq(schema.holdingAuthorities.id, authorityId), eq(schema.holdingAuthorities.orgId, t.org.id)) });
  if (!ha) throw new Error("Holding Authority not found");
  if (!ha.code) throw new Error(`${ha.name} has no Authority Code, so MRFP cannot generate a Claim ID. An Admin can add one in Settings.`);
  return db.transaction(async tx => {
    const existing = new Set((await tx.select({ id: K.claimId }).from(K).where(eq(K.orgId, t.org.id))).map(r => r.id));
    const claimId = R.nextClaimId(ha.code, c.clientCode!, existing)!;
    const first = (await tx.select({ id: K.id }).from(K).where(and(eq(K.clientId, clientId), isNull(K.deletedAt)))).length === 0;
    const prefill = first && !!c.a2aSent; // only claims opened at first signing get the client's A2A dates
    const [k] = await tx.insert(K).values({ orgId: t.org.id, clientId, claimId, authorityId, progress: prefill && c.a2aSigned ? 3 : prefill ? 2 : 1, currency: "AUD", feePct: "20", gstTreatment: "+ GST", addressOnRegister: c.currentAddress, lastUpdatedBy: t.membership.userCode }).returning();
    if (prefill) await tx.insert(schema.a2aEntries).values({ claimId: k.id, sent: c.a2aSent, signed: c.a2aSigned, order: 0 });
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Claim", entityId: k.id, recordRef: claimId, newValue: ha.name });
    if (c.stage === "INACTIVE") {
      await tx.update(C).set({ stage: "ACTIVE", becameNonActive: null, inactiveReason: null }).where(eq(C.id, clientId));
      await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: "Stage", oldValue: "Inactive", newValue: "Active (new claim opened)" });
    }
    await touch(tx, t, k);
    return k;
  });
}

/** Spec 5.2: the status is chosen; the date follows — only if that date is blank. Repeating steps (2, 3, 9) add log entries. */
export async function setProgress(t: Tenant, id: string, step: number | null) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id), with: { a2aLog: { orderBy: (a, { asc }) => [asc(a.order), asc(a.sent)] } } }); if (!k) throw new Error("Claim not found");
  if (step != null && (step < 1 || step > 21)) throw new Error("Invalid step");
  await db.transaction(async tx => {
    const set: Partial<schema.Claim> = { progress: step };
    if (step === 2) { if (!k.a2aLog.some(e => e.sent && !e.signed)) await tx.insert(schema.a2aEntries).values({ claimId: id, sent: t.today, order: k.a2aLog.length }); }
    if (step === 3) { const open = k.a2aLog.filter(e => e.sent && !e.signed).pop(); if (open) await tx.update(schema.a2aEntries).set({ signed: t.today }).where(eq(schema.a2aEntries.id, open.id)); else if (!k.a2aLog.length) await tx.insert(schema.a2aEntries).values({ claimId: id, signed: t.today, order: 0 }); }
    if (step === 9) await tx.insert(schema.resubmissions).values({ claimId: id, date: t.today });
    const f = step ? R.MILESTONE_FIELD[step] : undefined;
    if (f && !(k as Record<string, unknown>)[f]) (set as Record<string, unknown>)[f] = t.today;
    if (step === 12) set.feeManual = "0.00";
    set.closedOn = step != null && R.CLOSING_STEPS.includes(step) ? (k.closedOn ?? t.today) : null;
    await tx.update(K).set(set).where(eq(K.id, id));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: "Claim Progress", oldValue: stepLabel(t, k.progress), newValue: stepLabel(t, step) });
    if (f && set[f as keyof schema.Claim]) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: f, oldValue: null, newValue: t.today });
    await touch(tx, t, k);
    await recomputeStage(tx as unknown as typeof db, t, k.clientId);
  });
}

const EDITABLE = new Set(["amount", "currency", "accountName", "reference", "year", "addressOnRegister", "addressVerification", "haFormSent", "haFormSigned", "dateSubmitted", "claimApproved", "refundReceived", "invoiceSent", "paymentReceived", "reviewRequested", "reviewCompleted", "feePct", "feeManual", "gstTreatment", "followUp", "followUpReason", "checklist", "lastChased"]);
const MONEY = new Set(["amount", "feeManual", "feePct"]);
export async function updateClaimField(t: Tenant, id: string, field: string, value: unknown) {
  if (!EDITABLE.has(field)) throw new Error(`Field ${field} is not editable`);
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id) }); if (!k) throw new Error("Claim not found");
  let v: unknown = value;
  if (MONEY.has(field)) { const n = R.parseMoney(String(value ?? "").replace("%", "")); v = n == null ? null : n.toFixed(2); }
  else if (typeof v === "string") v = v.trim() === "" ? null : v.trim();
  const old = (k as Record<string, unknown>)[field];
  await db.transaction(async tx => {
    await tx.update(K).set({ [field]: v } as Partial<schema.Claim>).where(eq(K.id, id));
    if (field === "followUp" && v) await tx.update(K).set({ followUpSetBy: t.membership.userCode }).where(eq(K.id, id));
    if (field === "addressOnRegister" && v) { // a new address is added to the client's Previous Addresses automatically
      const c = await tx.query.clients.findFirst({ where: eq(C.id, k.clientId) });
      if (c && c.currentAddress !== v && !c.previousAddresses.includes(v as string)) await tx.update(C).set({ previousAddresses: [...c.previousAddresses, v as string] }).where(eq(C.id, c.id));
    }
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field, oldValue: old, newValue: v });
    await touch(tx, t, k);
  });
}
export async function setClaimCompanies(t: Tenant, id: string, companyIds: string[]) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id) }); if (!k) throw new Error("Claim not found");
  const valid = (await db.select({ id: schema.originatingCompanies.id }).from(schema.originatingCompanies).where(eq(schema.originatingCompanies.orgId, t.org.id))).map(r => r.id);
  const ids = companyIds.filter(x => valid.includes(x));
  await db.transaction(async tx => {
    await tx.delete(schema.claimCompanies).where(eq(schema.claimCompanies.claimId, id));
    if (ids.length) await tx.insert(schema.claimCompanies).values(ids.map(companyId => ({ claimId: id, companyId })));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: "Originating Company", newValue: ids.length + " linked" });
    await touch(tx, t, k);
  });
}
export async function setJointOwners(t: Tenant, id: string, clientIds: string[]) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id) }); if (!k) throw new Error("Claim not found");
  const valid = (await db.select({ id: C.id }).from(C).where(eq(C.orgId, t.org.id))).map(r => r.id);
  const ids = clientIds.filter(x => valid.includes(x) && x !== k.clientId);
  await db.transaction(async tx => {
    await tx.delete(schema.claimJointOwners).where(eq(schema.claimJointOwners.claimId, id));
    if (ids.length) await tx.insert(schema.claimJointOwners).values(ids.map(clientId => ({ claimId: id, clientId })));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: "Joint with", newValue: ids.length + " linked" });
    await touch(tx, t, k);
  });
}
/** 'Add A2A' on an existing claim: re-sending the A2A for this same claim (provisional — Spec Open Items). */
export async function addA2AEntry(t: Tenant, id: string, sent: string, reason?: string | null) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id), with: { a2aLog: true } }); if (!k) throw new Error("Claim not found");
  await db.transaction(async tx => {
    await tx.insert(schema.a2aEntries).values({ claimId: id, sent, reason: reason || null, order: k.a2aLog.length });
    if (k.progress != null && k.progress < 2) await tx.update(K).set({ progress: 2 }).where(eq(K.id, id));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: "A2A Log", newValue: `Sent ${sent}${reason ? ` (${reason})` : ""}` });
    await touch(tx, t, k);
  });
}
export async function setA2AEntry(t: Tenant, entryId: string, patch: { sent?: string | null; signed?: string | null; reason?: string | null }) {
  const e = await db.query.a2aEntries.findFirst({ where: eq(schema.a2aEntries.id, entryId), with: { claim: true } });
  if (!e || e.claim.orgId !== t.org.id) throw new Error("Entry not found");
  await db.transaction(async tx => {
    await tx.update(schema.a2aEntries).set(patch).where(eq(schema.a2aEntries.id, entryId));
    if (patch.signed && e.claim.progress === 2) await tx.update(K).set({ progress: 3 }).where(eq(K.id, e.claimId));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: e.claimId, recordRef: e.claim.claimId, field: "A2A Log", oldValue: `${e.sent ?? ""}/${e.signed ?? ""}`, newValue: `${patch.sent ?? e.sent ?? ""}/${patch.signed ?? e.signed ?? ""}` });
    await touch(tx, t, e.claim);
  });
}
export async function addResubmission(t: Tenant, id: string, date: string) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id) }); if (!k) throw new Error("Claim not found");
  await db.transaction(async tx => {
    await tx.insert(schema.resubmissions).values({ claimId: id, date });
    if (k.progress !== 9) await tx.update(K).set({ progress: 9 }).where(eq(K.id, id));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: "Date Resubmitted", newValue: date });
    await touch(tx, t, k);
  });
}
/** Chased: records Last Chased + user code, adds a tagged note, next follow-up = chase date + Re-chase after days (Spec 5.3). */
export async function chased(t: Tenant, id: string) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, id), with: { authority: true } }); if (!k) throw new Error("Claim not found");
  const next = R.addDays(t.today, k.authority.rechaseAfter || 7);
  await db.transaction(async tx => {
    await tx.update(K).set({ lastChased: t.today, lastChasedBy: t.membership.userCode }).where(eq(K.id, id));
    await tx.insert(schema.notes).values({ clientId: k.clientId, claimId: id, date: t.today, authorCode: t.membership.userCode, system: true, text: `Chased ${k.authority.name} (${t.membership.userCode}). Next follow-up ${R.fmtDate(next)}.` });
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: id, recordRef: k.claimId, field: "Last Chased", oldValue: k.lastChased, newValue: t.today });
    await touch(tx, t, k);
  });
  return next;
}
export async function binClaim(t: Tenant, id: string, restore = false) {
  if (!t.isAdmin) throw new Error("Only an Admin can delete");
  const k = await db.query.claims.findFirst({ where: and(eq(K.orgId, t.org.id), eq(K.id, id)) }); if (!k) throw new Error("Claim not found");
  await db.transaction(async tx => {
    await tx.update(K).set({ deletedAt: restore ? null : new Date() }).where(eq(K.id, id));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: restore ? "RESTORED" : "DELETED", entityType: "Claim", entityId: id, recordRef: k.claimId });
    await recomputeStage(tx as unknown as typeof db, t, k.clientId);
  });
}
