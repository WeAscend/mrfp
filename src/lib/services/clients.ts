// Client/lead services: field edits, lead identifier triggers, A2A signed -> Active, lifecycle, notes, follow-ups.
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import { logActivity, ownClient } from "../tenant";
import * as R from "../rules";

const C = schema.clients, K = schema.claims;

export async function getClient(t: Tenant, id: string) {
  return db.query.clients.findFirst({ where: ownClient(t.org.id, id), with: { claims: { where: isNull(K.deletedAt), with: { authority: true, companies: { with: { company: true } }, jointOwners: { with: { client: true } }, a2aLog: { orderBy: (a, { asc }) => [asc(a.order), asc(a.sent)] }, resubmissions: { orderBy: (r, { asc }) => [asc(r.date)] } }, orderBy: (k, { asc }) => [asc(k.createdAt)] }, notes: { where: isNull(schema.notes.deletedAt), orderBy: (n, { desc }) => [desc(n.date), desc(n.createdAt)] }, attachments: { where: isNull(schema.attachments.deletedAt) }, searchLog: { orderBy: (s, { desc }) => [desc(s.date)] }, relatedFrom: { with: { to: true } }, relatedTo: { with: { from: true } } } });
}
export type ClientFull = NonNullable<Awaited<ReturnType<typeof getClient>>>;
export const relatedOf = (c: ClientFull) => [...c.relatedFrom.map(r => r.to), ...c.relatedTo.map(r => r.from)].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i && !x.deletedAt);

export const recordRef = (c: { clientCode?: string | null; clientType: string; surname?: string | null; firstName?: string | null; businessNames?: string[] | null }) => c.clientCode || R.displayName(c);

async function touchClient(tx: typeof db, t: Tenant, id: string) { await tx.update(C).set({ lastUpdatedBy: t.membership.userCode, lastUpdatedAt: new Date() }).where(eq(C.id, id)); }

const EDITABLE = new Set(["clientType", "surname", "firstName", "middleName", "preferredName", "otherNames", "dob", "email", "phoneMobile", "phoneOther", "currentAddress", "currentPOBox", "previousAddresses", "addressOnUCM", "businessNames", "website", "abn", "acn", "businessContact", "specialConditions", "inactiveReason", "becameNonActive", "leadAmount", "source", "lastContact", "followUp", "followUpReason", "infoEmailSent", "a2aSent", "idLicence", "idPassport", "idMedicare", "idOther", "dateEntered", "ownerCode", "checklist"]);
const ARRAY_FIELDS = new Set(["previousAddresses", "businessNames", "specialConditions"]);
const MONEY_FIELDS = new Set(["leadAmount"]);

/** Generic single-field edit with activity logging. Owner is Admin-only. */
export async function updateClientField(t: Tenant, id: string, field: string, value: unknown) {
  if (!EDITABLE.has(field)) throw new Error(`Field ${field} is not editable`);
  if (field === "ownerCode" && !t.isAdmin) throw new Error("Only an Admin can change Owner");
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, id) });
  if (!c) throw new Error("Client not found");
  let v: unknown = value;
  if (ARRAY_FIELDS.has(field)) v = Array.isArray(value) ? value : String(value ?? "").split("\n").map(s => s.trim()).filter(Boolean);
  else if (MONEY_FIELDS.has(field)) { const n = R.parseMoney(value as string); v = n == null ? null : n.toFixed(2); }
  else if (typeof v === "string") v = v.trim() === "" ? null : v;
  const old = (c as Record<string, unknown>)[field];
  await db.transaction(async tx => {
    await tx.update(C).set({ [field]: v } as Partial<schema.Client>).where(eq(C.id, id));
    if (field === "followUp" && v) await tx.update(C).set({ followUpSetBy: t.membership.userCode }).where(eq(C.id, id));
    await touchClient(tx as unknown as typeof db, t, id);
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: recordRef(c), field, oldValue: old, newValue: v });
  });
}

/** Lead Identifier triggers (Spec 5.1): Info sent -> Info Email Sent; A2A sent -> A2A Sent (only if blank); 3-month tags always move Follow Up. */
export async function setLeadIdentifier(t: Tenant, id: string, v: string | null) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, id) }); if (!c) throw new Error("Client not found");
  const set: Partial<schema.Client> = { leadIdentifier: v || null };
  if (v === "Info sent - waiting on response" && !c.infoEmailSent) set.infoEmailSent = t.today;
  if (v === "A2A sent" && !c.a2aSent) set.a2aSent = t.today;
  if (v === "No response - revisit in 3 months" || v === "Leads No List") { set.followUp = R.addMonths(t.today, t.org.revisitMonths); set.followUpSetBy = "Automatic"; if (!c.followUpReason) set.followUpReason = v === "Leads No List" ? "Check back - said no" : "Revisit after no response"; }
  await db.transaction(async tx => {
    await tx.update(C).set(set).where(eq(C.id, id)); await touchClient(tx as unknown as typeof db, t, id);
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: recordRef(c), field: "Lead Identifier", oldValue: c.leadIdentifier, newValue: v });
    for (const f of ["infoEmailSent", "a2aSent", "followUp"] as const) if (set[f] && set[f] !== c[f]) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: recordRef(c), field: f, oldValue: c[f], newValue: set[f] });
  });
}

/** Entering A2A Signed & Received on a lead moves it to Active and generates the Client Code (Spec 6, Appendix A). */
export async function setA2ASigned(t: Tenant, id: string, date: string | null) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, id) }); if (!c) throw new Error("Client not found");
  await db.transaction(async tx => {
    const set: Partial<schema.Client> = { a2aSigned: date };
    if (date && c.stage === "LEAD") {
      set.stage = "ACTIVE";
      if (!c.clientCode) {
        const existing = new Set((await tx.select({ code: C.clientCode }).from(C).where(eq(C.orgId, t.org.id))).map(r => r.code).filter((x): x is string => !!x));
        set.clientCode = R.clientCodeFor(c, existing);
      }
    }
    await tx.update(C).set(set).where(eq(C.id, id)); await touchClient(tx as unknown as typeof db, t, id);
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: set.clientCode || recordRef(c), field: "A2A Signed & Received", oldValue: c.a2aSigned, newValue: date });
    if (set.stage) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: set.clientCode || recordRef(c), field: "Stage", oldValue: "Lead", newValue: "Active" });
    if (set.clientCode) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: set.clientCode, field: "Client Code", oldValue: null, newValue: set.clientCode });
  });
  return { becameActive: !!(date && c.stage === "LEAD") };
}

/** Last claim closes -> Inactive (Completed if any paid); reopening -> Active. Called after any claim progress change. */
export async function recomputeStage(tx: typeof db, t: Tenant, clientId: string) {
  const c = await tx.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) return;
  const ks = await tx.select({ progress: K.progress }).from(K).where(and(eq(K.clientId, clientId), isNull(K.deletedAt)));
  if (!ks.length) return;
  const allClosed = ks.every(k => R.isClosed(k));
  if (allClosed && c.stage === "ACTIVE") {
    const paid = ks.some(k => k.progress != null && R.PAID_STEPS.includes(k.progress));
    await tx.update(C).set({ stage: "INACTIVE", becameNonActive: t.today, inactiveReason: paid ? "Completed" : null }).where(eq(C.id, clientId));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: "Stage", oldValue: "Active", newValue: `Inactive${paid ? " (Completed)" : ""}` });
    return "INACTIVE";
  }
  if (!allClosed && c.stage === "INACTIVE") {
    await tx.update(C).set({ stage: "ACTIVE", becameNonActive: null, inactiveReason: null }).where(eq(C.id, clientId));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: "Stage", oldValue: "Inactive", newValue: "Active" });
    return "ACTIVE";
  }
}

/** Set Inactive by hand: closes every open claim with the chosen status (Spec 5.1). */
export async function setInactiveByHand(t: Tenant, id: string, reason: string | null, closeStep: number) {
  if (!R.MANUAL_CLOSE_OPTIONS.includes(closeStep)) throw new Error("Invalid closing status");
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, id) }); if (!c) throw new Error("Client not found");
  await db.transaction(async tx => {
    const open = await tx.select().from(K).where(and(eq(K.clientId, id), isNull(K.deletedAt)));
    for (const k of open.filter(R.isOpen)) {
      await tx.update(K).set({ progress: closeStep, closedOn: t.today, lastUpdatedBy: t.membership.userCode, lastUpdatedAt: new Date() }).where(eq(K.id, k.id));
      await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: k.id, recordRef: k.claimId, field: "Claim Progress", oldValue: `${k.progress} ${R.stepName(k.progress, t.org.shortName)}`, newValue: `${closeStep} ${R.stepName(closeStep, t.org.shortName)}` });
    }
    await tx.update(C).set({ stage: "INACTIVE", inactiveReason: reason || null, becameNonActive: t.today }).where(eq(C.id, id));
    await touchClient(tx as unknown as typeof db, t, id);
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: recordRef(c), field: "Stage", oldValue: c.stage, newValue: `Inactive${reason ? ` (${reason})` : ""}` });
  });
}

/** Notes: a person-written note updates Last Contact to the note's own date (Spec 9). System notes never do. */
export async function addNote(t: Tenant, clientId: string, text: string, opts: { claimId?: string | null; date?: string; system?: boolean; author?: string } = {}) {
  text = text.trim(); if (!text) return;
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  const date = opts.date || t.today, system = !!opts.system, author = opts.author || t.membership.userCode;
  await db.transaction(async tx => {
    const [n] = await tx.insert(schema.notes).values({ clientId, claimId: opts.claimId || null, date, authorCode: author, system, text }).returning();
    if (!system) await tx.update(C).set({ lastContact: sql`GREATEST(COALESCE(${C.lastContact}, ${date}::date), ${date}::date)` }).where(eq(C.id, clientId));
    await touchClient(tx as unknown as typeof db, t, clientId);
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Note", entityId: n.id, recordRef: recordRef(c), field: "Notes", newValue: text.slice(0, 120), userCode: author });
  });
}
export async function updateNoteDate(t: Tenant, noteId: string, date: string) {
  const n = await db.query.notes.findFirst({ where: eq(schema.notes.id, noteId), with: { client: true } });
  if (!n || n.client.orgId !== t.org.id) throw new Error("Note not found");
  await db.transaction(async tx => {
    await tx.update(schema.notes).set({ date }).where(eq(schema.notes.id, noteId));
    // Last Contact = most recent person-written note by its own date
    const [latest] = await tx.select({ d: sql<string | null>`MAX(${schema.notes.date})` }).from(schema.notes).where(and(eq(schema.notes.clientId, n.clientId), eq(schema.notes.system, false), isNull(schema.notes.deletedAt)));
    if (latest?.d) await tx.update(C).set({ lastContact: latest.d }).where(eq(C.id, n.clientId));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Note", entityId: noteId, recordRef: recordRef(n.client), field: "Date", oldValue: n.date, newValue: date });
  });
}

/** Done: clears a manual follow-up and adds a note naming the user. */
export async function followUpDone(t: Tenant, kind: "client" | "claim", clientId: string, claimId?: string | null) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  await db.transaction(async tx => {
    if (kind === "client") {
      await tx.update(C).set({ followUp: null, followUpReason: null, followUpSetBy: null }).where(eq(C.id, clientId));
      await tx.insert(schema.notes).values({ clientId, date: t.today, authorCode: t.membership.userCode, system: true, text: `Follow-up done by ${t.membership.userCode}${c.followUpReason ? ` (${c.followUpReason})` : ""}` });
      await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: "Follow Up", oldValue: c.followUp, newValue: "Done" });
    } else {
      const k = await tx.query.claims.findFirst({ where: and(eq(K.id, claimId!), eq(K.orgId, t.org.id)) }); if (!k) throw new Error("Claim not found");
      await tx.update(K).set({ followUp: null, followUpReason: null, followUpSetBy: null, lastUpdatedBy: t.membership.userCode, lastUpdatedAt: new Date() }).where(eq(K.id, k.id));
      await tx.insert(schema.notes).values({ clientId, claimId: k.id, date: t.today, authorCode: t.membership.userCode, system: true, text: `Follow-up done by ${t.membership.userCode}${k.followUpReason ? ` (${k.followUpReason})` : ""}` });
      await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Claim", entityId: k.id, recordRef: k.claimId, field: "Follow Up", oldValue: k.followUp, newValue: "Done" });
    }
    await touchClient(tx as unknown as typeof db, t, clientId);
  });
}

export async function createLead(t: Tenant, input: { clientType: "INDIVIDUAL" | "BUSINESS"; surname?: string; firstName?: string; businessName?: string; source: string; leadAmount?: string; phoneMobile?: string; email?: string; addressOnUCM?: string }) {
  const biz = input.clientType === "BUSINESS";
  const name = biz ? input.businessName?.trim() : input.surname?.trim();
  if (!name) throw new Error("A name is needed");
  const amt = R.parseMoney(input.leadAmount);
  return db.transaction(async tx => {
    const [c] = await tx.insert(C).values({ orgId: t.org.id, clientType: input.clientType, surname: biz ? null : input.surname?.trim(), firstName: biz ? null : input.firstName?.trim() || null, businessNames: biz ? [name] : [], stage: "LEAD", leadIdentifier: "New import", source: input.source, leadAmount: amt == null ? null : amt.toFixed(2), phoneMobile: input.phoneMobile?.trim() || null, email: input.email?.trim() || null, addressOnUCM: input.addressOnUCM?.trim() || null, ownerCode: t.membership.userCode, dateEntered: t.today, lastUpdatedBy: t.membership.userCode }).returning();
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Client", entityId: c.id, recordRef: recordRef(c), newValue: "New lead" });
    return c;
  });
}

export async function setRelated(t: Tenant, id: string, otherIds: string[]) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, id) }); if (!c) throw new Error("Client not found");
  const valid = (await db.select({ id: C.id }).from(C).where(and(eq(C.orgId, t.org.id), ne(C.id, id)))).map(r => r.id);
  const ids = otherIds.filter(x => valid.includes(x));
  await db.transaction(async tx => {
    await tx.delete(schema.relatedClients).where(or(eq(schema.relatedClients.fromId, id), eq(schema.relatedClients.toId, id)));
    if (ids.length) await tx.insert(schema.relatedClients).values(ids.map(o => ({ fromId: id, toId: o })));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: recordRef(c), field: "Related Client Record", newValue: ids.length + " linked" });
  });
}
export async function addSearchLog(t: Tenant, id: string, date: string, authorities: string[]) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, id) }); if (!c) throw new Error("Client not found");
  await db.transaction(async tx => {
    await tx.insert(schema.searchLog).values({ clientId: id, date, authorities });
    await touchClient(tx as unknown as typeof db, t, id);
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: id, recordRef: recordRef(c), field: "Search Log", newValue: `${date}: ${authorities.join(", ")}` });
  });
}

/** Admin delete: moves to the Bin (soft delete) with claims, notes and files. Restorable. */
export async function binClient(t: Tenant, id: string, restore = false) {
  if (!t.isAdmin) throw new Error("Only an Admin can delete");
  const c = await db.query.clients.findFirst({ where: and(eq(C.orgId, t.org.id), eq(C.id, id)) }); if (!c) throw new Error("Client not found");
  const at = restore ? null : new Date();
  await db.transaction(async tx => {
    await tx.update(C).set({ deletedAt: at }).where(eq(C.id, id));
    await tx.update(K).set({ deletedAt: at }).where(eq(K.clientId, id));
    await tx.update(schema.notes).set({ deletedAt: at }).where(eq(schema.notes.clientId, id));
    await tx.update(schema.attachments).set({ deletedAt: at }).where(eq(schema.attachments.clientId, id));
    await logActivity(tx, t.org.id, t.membership.userCode, { action: restore ? "RESTORED" : "DELETED", entityType: "Client", entityId: id, recordRef: recordRef(c) });
  });
}
