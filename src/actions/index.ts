"use server";
// Server actions: thin, validated wrappers around the services. Every one resolves the tenant first.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireTenant, requireAdmin } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import * as Clients from "@/lib/services/clients";
import * as Claims from "@/lib/services/claims";
import * as Org from "@/lib/services/org";
import * as Imp from "@/lib/services/leadImport";
import * as Comms from "@/lib/services/comms";
import * as Forms from "@/lib/services/forms";
import { db, schema } from "@/db";
import { storage, safeName } from "@/lib/storage";
import { logActivity } from "@/lib/tenant";

export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };
const run = async (fn: () => Promise<unknown>, message?: string): Promise<ActionResult> => { try { const data = await fn(); return { ok: true, message, data }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" }; } };
const refresh = () => { revalidatePath("/", "layout"); };

// ---- auth ----
export async function signUpAction(_: unknown, form: FormData): Promise<ActionResult> {
  const p = z.object({ orgName: z.string().min(2), shortName: z.string().min(1).max(6), name: z.string().min(2), email: z.string().email(), password: z.string().min(10) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, error: "Check the form: organisation name, short name (e.g. MRF), your name, a valid email and a password of 10+ characters." };
  try { await Org.ensureHolidays(); const r = await Org.signUp(p.data); const s = await getSession(); s.userId = r.user.id; s.orgId = r.org.id; await s.save(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  redirect("/today");
}
export async function logInAction(_: unknown, form: FormData): Promise<ActionResult> {
  try { const r = await Org.logIn(String(form.get("email") || ""), String(form.get("password") || "")); const s = await getSession(); s.userId = r.userId; s.orgId = r.orgId; await s.save(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  redirect("/today");
}
export async function logOutAction() { const s = await getSession(); s.destroy(); redirect("/login"); }

// ---- clients ----
export async function updateClientFieldAction(id: string, field: string, value: unknown) { const t = await requireTenant(); const r = await run(() => Clients.updateClientField(t, id, field, value)); refresh(); return r; }
export async function setLeadIdentifierAction(id: string, v: string | null) { const t = await requireTenant(); const r = await run(() => Clients.setLeadIdentifier(t, id, v)); refresh(); return r; }
export async function setA2ASignedAction(id: string, date: string | null) { const t = await requireTenant(); const r = await run(async () => { const x = await Clients.setA2ASigned(t, id, date); return x; }); refresh(); return r; }
export async function setInactiveAction(id: string, reason: string | null, closeStep: number) { const t = await requireTenant(); const r = await run(() => Clients.setInactiveByHand(t, id, reason, closeStep), "Set Inactive"); refresh(); return r; }
export async function addNoteAction(clientId: string, text: string, claimId?: string | null, date?: string) { const t = await requireTenant(); const r = await run(() => Clients.addNote(t, clientId, text, { claimId, date }), "Note saved"); refresh(); return r; }
export async function updateNoteDateAction(noteId: string, date: string) { const t = await requireTenant(); const r = await run(() => Clients.updateNoteDate(t, noteId, date)); refresh(); return r; }
export async function followUpDoneAction(kind: "client" | "claim", clientId: string, claimId?: string | null) { const t = await requireTenant(); const r = await run(() => Clients.followUpDone(t, kind, clientId, claimId), `Done by ${t.membership.userCode}`); refresh(); return r; }
export async function createLeadAction(input: Parameters<typeof Clients.createLead>[1]) { const t = await requireTenant(); const r = await run(() => Clients.createLead(t, input)); refresh(); return r; }
export async function setRelatedAction(id: string, ids: string[]) { const t = await requireTenant(); const r = await run(() => Clients.setRelated(t, id, ids)); refresh(); return r; }
export async function addSearchLogAction(id: string, date: string, authorities: string[]) { const t = await requireTenant(); const r = await run(() => Clients.addSearchLog(t, id, date, authorities)); refresh(); return r; }
export async function binClientAction(id: string, restore = false) { const t = await requireAdmin(); const r = await run(() => Clients.binClient(t, id, restore), restore ? "Restored" : "Moved to the bin"); refresh(); return r; }

// ---- claims ----
export async function openClaimAction(clientId: string, authorityId: string) { const t = await requireTenant(); const r = await run(() => Claims.openClaim(t, clientId, authorityId)); refresh(); return r; }
export async function setProgressAction(id: string, step: number | null) { const t = await requireTenant(); const r = await run(() => Claims.setProgress(t, id, step)); refresh(); return r; }
export async function updateClaimFieldAction(id: string, field: string, value: unknown) { const t = await requireTenant(); const r = await run(() => Claims.updateClaimField(t, id, field, value)); refresh(); return r; }
export async function setClaimCompaniesAction(id: string, ids: string[]) { const t = await requireTenant(); const r = await run(() => Claims.setClaimCompanies(t, id, ids)); refresh(); return r; }
export async function setJointOwnersAction(id: string, ids: string[]) { const t = await requireTenant(); const r = await run(() => Claims.setJointOwners(t, id, ids)); refresh(); return r; }
export async function addA2AEntryAction(id: string, sent: string, reason?: string | null) { const t = await requireTenant(); const r = await run(() => Claims.addA2AEntry(t, id, sent, reason), "A2A entry added"); refresh(); return r; }
export async function setA2AEntryAction(entryId: string, patch: { sent?: string | null; signed?: string | null; reason?: string | null }) { const t = await requireTenant(); const r = await run(() => Claims.setA2AEntry(t, entryId, patch)); refresh(); return r; }
export async function addResubmissionAction(id: string, date: string) { const t = await requireTenant(); const r = await run(() => Claims.addResubmission(t, id, date), "Resubmission added"); refresh(); return r; }
export async function chasedAction(id: string) { const t = await requireTenant(); const r = await run(async () => ({ next: await Claims.chased(t, id) }), "Chased"); refresh(); return r; }
export async function binClaimAction(id: string, restore = false) { const t = await requireAdmin(); const r = await run(() => Claims.binClaim(t, id, restore)); refresh(); return r; }

// ---- files ----
export async function uploadFileAction(form: FormData) {
  const t = await requireTenant();
  return run(async () => {
    const clientId = String(form.get("clientId")), claimId = form.get("claimId") ? String(form.get("claimId")) : null; const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("No file");
    if (file.size > 25 * 1024 * 1024) throw new Error("Files up to 25 MB");
    const c = await db.query.clients.findFirst({ where: (cl, { and, eq }) => and(eq(cl.id, clientId), eq(cl.orgId, t.org.id)) }); if (!c) throw new Error("Client not found");
    const [a] = await db.insert(schema.attachments).values({ orgId: t.org.id, clientId, claimId, name: safeName(file.name), mime: file.type || "application/octet-stream", size: file.size, storageKey: "pending", uploadedBy: t.membership.userCode }).returning();
    const key = `${t.org.id}/${clientId}/${a.id}-${safeName(file.name)}`;
    await storage().put(key, Buffer.from(await file.arrayBuffer()), a.mime);
    await db.update(schema.attachments).set({ storageKey: key }).where(eq(schema.attachments.id, a.id));
    if (claimId) await db.update(schema.claims).set({ screenshotId: a.id }).where(eq(schema.claims.id, claimId));
    await logActivity(db, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "File", entityId: a.id, recordRef: Clients.recordRef(c), field: "Attachments", newValue: file.name });
    refresh();
  }, "File added");
}

// ---- import ----
export async function previewImportAction(text: string) { const t = await requireTenant(); return run(() => Imp.previewImport(t, text)); }
export async function runImportAction(text: string, source: string, skip: number[]) { const t = await requireTenant(); const r = await run(async () => ({ n: await Imp.runImport(t, text, source, skip) })); refresh(); return r; }

// ---- settings ----
export async function updateAuthorityAction(id: string, patch: Parameters<typeof Org.updateAuthority>[2]) { const t = await requireAdmin(); const r = await run(() => Org.updateAuthority(t, id, patch)); refresh(); return r; }
export async function upsertCompanyAction(input: Parameters<typeof Org.upsertCompany>[1]) { const t = await requireTenant(); const r = await run(() => Org.upsertCompany(t, input)); refresh(); return r; }
export async function addMemberAction(input: Parameters<typeof Org.addMember>[1]) { const t = await requireAdmin(); const r = await run(() => Org.addMember(t, input), "User added"); refresh(); return r; }
export async function updateOrgAction(patch: Parameters<typeof Org.updateOrg>[1]) { const t = await requireAdmin(); const r = await run(() => Org.updateOrg(t, patch), "Saved"); refresh(); return r; }

// ---- communications & automation ----
export async function logCallAction(clientId: string, input: Comms.CallInput) { const t = await requireTenant(); const r = await run(() => Comms.logCall(t, clientId, input), "Call logged"); refresh(); return r; }
export async function recordConsentAction(clientId: string, channel: Comms.Channel, granted: boolean, method: string, note?: string) { const t = await requireTenant(); const r = await run(() => Comms.recordConsent(t, clientId, channel, granted, method, note), granted ? "Consent recorded" : "Opt-out recorded"); refresh(); return r; }
export async function previewMessageAction(clientId: string, key: string, claimId?: string | null, withFooter = true) { const t = await requireTenant(); return run(() => Comms.preview(t, clientId, key, claimId, {}, withFooter)); }
export async function sendMessageAction(input: Comms.SendOpts) { const t = await requireTenant(); const r = await run(() => Comms.sendToClient(t, input), "Sent"); refresh(); return r; }
export async function createTemplateAction(i: { name: string; subject?: string | null; body: string }) { const t = await requireAdmin(); const r = await run(() => Comms.createTemplate(t, i), "Template added"); refresh(); return r; }
export async function deleteTemplateAction(key: string) { const t = await requireAdmin(); const r = await run(() => Comms.deleteTemplate(t, key), "Template deleted"); refresh(); return r; }
export async function addHolidayAction(h: { date: string; region: string; name: string }) { const t = await requireAdmin(); const r = await run(() => Org.addHoliday(t, h), "Holiday added"); refresh(); return r; }
export async function removeHolidayAction(date: string, region: string) { const t = await requireAdmin(); const r = await run(() => Org.removeHoliday(t, date, region), "Holiday removed"); refresh(); return r; }
export async function updateTemplateAction(key: string, patch: { subject?: string | null; body?: string; active?: boolean; name?: string }) { const t = await requireAdmin(); const r = await run(() => Comms.updateTemplate(t, key, patch), "Template saved"); refresh(); return r; }

// ---- fillable PDF forms (Decisions 6.5) ----
export async function addFormAction(form: FormData) {
  const t = await requireAdmin();
  const r = await run(async () => { const file = form.get("file"); if (!(file instanceof File) || !file.size) throw new Error("Choose a PDF"); if (file.size > 15 * 1024 * 1024) throw new Error("PDFs up to 15 MB"); return Forms.addForm(t, { name: String(form.get("name") || ""), fileName: file.name, buf: Buffer.from(await file.arrayBuffer()), scope: String(form.get("scope")) === "CLIENT" ? "CLIENT" : "CLAIM" }); }, "Form added — now map its fields");
  refresh(); return r;
}
export async function updateFormAction(id: string, patch: { name?: string; mapping?: Record<string, string>; scope?: "CLAIM" | "CLIENT" }) { const t = await requireAdmin(); const r = await run(() => Forms.updateForm(t, id, patch), "Form saved"); refresh(); return r; }
export async function removeFormAction(id: string) { const t = await requireAdmin(); const r = await run(() => Forms.removeForm(t, id), "Form removed"); refresh(); return r; }
