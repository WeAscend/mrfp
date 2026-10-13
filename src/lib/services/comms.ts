// Communications & automation: consent, opt-out, templates, sending (email/SMS), call logging, in-house e-sign,
// the daily automation run and the data behind the Today page.
//
// Compliance model (Spam Act 2003, Cth): a commercial email or SMS goes out only with consent recorded on the
// client, never after an opt-out, and always carrying the sender's identity and a working unsubscribe. Letters and
// phone calls are not covered here (phone follows the Do Not Call Register, handled outside the app).
import { and, eq, isNull, inArray, desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import { logActivity, ownClient, ownClaim, systemTenant } from "../tenant";
import * as R from "../rules";
import { sendMail } from "../mail";
import { sendSms, toE164, digitsOnly } from "../sms";
import { DEFAULT_TEMPLATES, DEFAULT_A2A_TEMPLATE, render, type TemplateKey } from "../templates";
import { recordRef, setLeadIdentifier, setA2ASigned, addNote } from "./clients";
import { chased } from "./claims";
import { storage } from "../storage";

const C = schema.clients, K = schema.claims, M = schema.messages, T = schema.messageTemplates, S = schema.signRequests;
import { CALL_OUTCOMES, type Channel, type ChannelState, type CallOutcome } from "../commsTypes";
export { CALL_OUTCOMES }; export type { Channel, ChannelState, CallOutcome };
const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

// ---------- templates ----------
export async function ensureTemplates(orgId: string) {
  const have = new Set((await db.select({ key: T.key }).from(T).where(eq(T.orgId, orgId))).map(r => r.key));
  const missing = DEFAULT_TEMPLATES.filter(d => !have.has(d.key));
  if (missing.length) await db.insert(T).values(missing.map(d => ({ orgId, key: d.key, channel: d.channel, name: d.name, subject: d.subject ?? null, body: d.body })));
}
export async function templates(t: Tenant) { await ensureTemplates(t.org.id); const rows = await db.select().from(T).where(eq(T.orgId, t.org.id)); const order = DEFAULT_TEMPLATES.map(d => d.key); return rows.sort((a, b) => order.indexOf(a.key as TemplateKey) - order.indexOf(b.key as TemplateKey)); }
export async function updateTemplate(t: Tenant, key: string, patch: { subject?: string | null; body?: string; active?: boolean }) {
  if (!t.isAdmin) throw new Error("Admin only");
  const row = await db.query.messageTemplates.findFirst({ where: and(eq(T.orgId, t.org.id), eq(T.key, key)) }); if (!row) throw new Error("Template not found");
  await db.update(T).set({ ...patch, updatedAt: new Date() }).where(eq(T.id, row.id));
  await logActivity(db, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Template", entityId: row.id, recordRef: row.name, field: Object.keys(patch).join(", ") });
}

// ---------- consent & opt-out ----------
export function channelState(c: schema.Client, ch: Channel): ChannelState {
  if (ch === "EMAIL") { if (c.emailOptOutAt) return "opted-out"; if (!firstEmail(c.email)) return "no-address"; return c.emailConsentAt ? "ok" : "no-consent"; }
  if (c.smsOptOutAt) return "opted-out"; if (!toE164(c.phoneMobile)) return "no-address"; return c.smsConsentAt ? "ok" : "no-consent";
}
export const firstEmail = (s: string | null | undefined) => (s || "").split(/[\n,;]/).map(x => x.trim()).find(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) || null;

export async function recordConsent(t: Tenant, clientId: string, ch: Channel, granted: boolean, method: string, note?: string | null, capturedBy?: string) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  const by = capturedBy || t.membership.userCode, now = new Date();
  const set: Partial<schema.Client> = ch === "EMAIL" ? (granted ? { emailConsentAt: now, emailOptOutAt: null } : { emailOptOutAt: now }) : (granted ? { smsConsentAt: now, smsOptOutAt: null } : { smsOptOutAt: now });
  await db.transaction(async tx => {
    await tx.insert(schema.consents).values({ orgId: t.org.id, clientId, channel: ch, granted, method, capturedBy: by, note: note || null });
    await tx.update(C).set(set).where(eq(C.id, clientId));
    await logActivity(tx, t.org.id, by, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: `${ch === "EMAIL" ? "Email" : "SMS"} consent`, oldValue: ch === "EMAIL" ? (c.emailOptOutAt ? "Opted out" : c.emailConsentAt ? "Consented" : "None") : (c.smsOptOutAt ? "Opted out" : c.smsConsentAt ? "Consented" : "None"), newValue: `${granted ? "Consented" : "Opted out"} (${method})` });
    if (!granted) await tx.insert(schema.notes).values({ clientId, date: t.today, authorCode: by, system: true, text: `${ch === "EMAIL" ? "Email" : "SMS"} opt-out recorded (${method}). No further ${ch === "EMAIL" ? "emails" : "texts"} will be sent.` });
  });
}

/** Unsubscribe link from an email. Public: no session. Returns what was done, for the confirmation page. */
export async function optOutByToken(token: string, ch: Channel | "BOTH" = "EMAIL") {
  const c = await db.query.clients.findFirst({ where: and(eq(C.unsubToken, token), isNull(C.deletedAt)) });
  if (!c) return null;
  const t = await systemTenant(c.orgId, "Client");
  for (const x of (ch === "BOTH" ? ["EMAIL", "SMS"] : [ch]) as Channel[]) { const already = x === "EMAIL" ? c.emailOptOutAt : c.smsOptOutAt; if (!already) await recordConsent(t, c.id, x, false, x === "EMAIL" ? "Unsubscribe link" : "Unsubscribe page", null, "Client"); }
  return { org: t.org, client: c };
}
export async function clientByUnsubToken(token: string) { const c = await db.query.clients.findFirst({ where: and(eq(C.unsubToken, token), isNull(C.deletedAt)) }); if (!c) return null; const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, c.orgId) }); return { client: c, org: org! }; }

/** Inbound SMS "STOP" from a number: opts out every client carrying that mobile. Returns how many were updated. */
export async function optOutSmsByNumber(from: string) {
  const d = digitsOnly(from).replace(/^61/, "0"); if (d.length < 8) return 0;
  const rows = await db.select().from(C).where(and(isNull(C.deletedAt), isNull(C.smsOptOutAt), sql`regexp_replace(coalesce(${C.phoneMobile},''), '\\D', '', 'g') LIKE ${"%" + d.slice(-9)}`));
  for (const c of rows) await recordConsent(await systemTenant(c.orgId, "Client"), c.id, "SMS", false, "SMS STOP", `From ${from}`, "Client");
  return rows.length;
}

// ---------- rendering ----------
type Vars = Record<string, string | number | null | undefined>;
function clientVars(t: Tenant, c: schema.Client, foundAt: string[] = []): Vars {
  const first = c.clientType === "BUSINESS" ? (c.businessContact || "there") : (c.preferredName || c.firstName || c.surname || "there");
  const fullName = c.clientType === "BUSINESS" ? R.displayName(c) : [c.firstName, c.middleName, c.surname].filter(Boolean).join(" ") || R.displayName(c);
  return { firstName: first, name: R.displayName(c), fullName, org: t.org.name, orgShort: t.org.shortName, userName: t.user.name || t.membership.userCode, leadAmount: c.leadAmount ? R.money(c.leadAmount) : "an amount still being confirmed", foundAt: foundAt.join(", "), foundAtClause: foundAt.length ? ` held by ${foundAt.join(" and ")}` : "", phone: t.org.phone || "us", website: t.org.website || "", clientCode: c.clientCode || "" };
}
function claimVars(t: Tenant, k: schema.Claim & { authority?: schema.HoldingAuthority | null }): Vars {
  const fee = R.feeAUD(k), g = R.gstBreakdown(fee, k.gstTreatment, Number(t.org.gstRate));
  return { authority: k.authority?.name || "", claimId: k.claimId, reference: k.reference || "", amount: R.money(k.amount, k.currency === "NZD" ? "NZD" : undefined), dateSubmitted: k.dateSubmitted ? R.fmtDate(k.dateSubmitted) : "", fee: fee == null ? "" : `${R.money(g.total)} (${R.money(g.exGst)} + ${R.money(g.gst)} GST)`, feePct: k.feePct || "" };
}
/** Spam Act s17/s18: identify the sender and give a functional unsubscribe that works for at least 30 days. */
function emailFooter(t: Tenant, c: schema.Client | null) {
  const id = [t.org.name, t.org.postalAddress, t.org.phone, t.org.website].filter(Boolean).join(" · ");
  return `\n\n—\n${id}${c ? `\nYou're receiving this because you agreed to hear from ${t.org.name}. To stop emails: ${appUrl()}/u/${c.unsubToken}` : ""}`;
}
const smsFooter = (t: Tenant) => ` ${t.org.shortName}. Reply STOP to opt out`;

async function template(t: Tenant, key: string) { await ensureTemplates(t.org.id); const row = await db.query.messageTemplates.findFirst({ where: and(eq(T.orgId, t.org.id), eq(T.key, key)) }); if (!row) throw new Error(`No template '${key}'`); if (!row.active) throw new Error(`Template '${row.name}' is switched off in Settings`); return row; }

export async function preview(t: Tenant, clientId: string, key: string, claimId?: string | null, extra: Vars = {}) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId), with: { searchLog: { orderBy: (s, { desc }) => [desc(s.date)], limit: 1 } } }); if (!c) throw new Error("Client not found");
  const k = claimId ? await db.query.claims.findFirst({ where: ownClaim(t.org.id, claimId), with: { authority: true } }) : null;
  const tpl = await template(t, key);
  const vars = { ...clientVars(t, c, c.searchLog[0]?.authorities ?? []), ...(k ? claimVars(t, k) : {}), ...extra };
  return { channel: tpl.channel as Channel, subject: tpl.subject ? render(tpl.subject, vars) : null, body: render(tpl.body, vars) + (tpl.channel === "EMAIL" ? emailFooter(t, c) : smsFooter(t)), state: channelState(c, tpl.channel as Channel), to: tpl.channel === "EMAIL" ? firstEmail(c.email) : toE164(c.phoneMobile) };
}

// ---------- sending ----------
export type SendOpts = { clientId: string; key: string; claimId?: string | null; extra?: Vars; overrideBody?: string; overrideSubject?: string | null; transactional?: boolean };
/**
 * Send a templated message to a client. Hard rules: an opted-out channel never sends; a channel without recorded
 * consent sends only when `transactional` (a document the client asked for, e.g. the A2A they agreed to on the phone).
 * Records the message, a system note, the Activity Log entry, and runs the template's side effects.
 */
export async function sendToClient(t: Tenant, o: SendOpts) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, o.clientId), with: { searchLog: { orderBy: (s, { desc }) => [desc(s.date)], limit: 1 } } }); if (!c) throw new Error("Client not found");
  const tpl = await template(t, o.key); const ch = tpl.channel as Channel;
  const state = channelState(c, ch);
  if (state === "opted-out") throw new Error(`${R.displayName(c)} has opted out of ${ch === "EMAIL" ? "email" : "SMS"} — nothing sent`);
  if (state === "no-address") throw new Error(ch === "EMAIL" ? "No valid email address on the record" : "No valid mobile number on the record (needs an Australian 04… number)");
  if (state === "no-consent" && !o.transactional) throw new Error(`No ${ch === "EMAIL" ? "email" : "SMS"} consent recorded. Log the call and tick consent first.`);
  const k = o.claimId ? await db.query.claims.findFirst({ where: ownClaim(t.org.id, o.claimId), with: { authority: true } }) : null;
  const vars = { ...clientVars(t, c, c.searchLog[0]?.authorities ?? []), ...(k ? claimVars(t, k) : {}), ...(o.extra || {}) };
  const subject = o.overrideSubject !== undefined ? o.overrideSubject : tpl.subject ? render(tpl.subject, vars) : null;
  const body = (o.overrideBody ?? render(tpl.body, vars)) + (ch === "EMAIL" ? emailFooter(t, c) : smsFooter(t));
  const to = ch === "EMAIL" ? firstEmail(c.email)! : toE164(c.phoneMobile)!;
  const [m] = await db.insert(M).values({ orgId: t.org.id, clientId: c.id, claimId: k?.id ?? null, channel: ch, toAddress: to, toName: R.displayName(c), subject, body, templateKey: tpl.key, status: "QUEUED", sentBy: t.membership.userCode }).returning();
  try {
    const r = ch === "EMAIL"
      ? await sendMail({ to, toName: R.displayName(c), from: fromAddress(t), replyTo: t.org.replyTo || t.user.email || null, subject: subject || tpl.name, text: body, headers: { "List-Unsubscribe": `<${appUrl()}/u/${c.unsubToken}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, tags: { org: t.org.slug, template: tpl.key } })
      : await sendSms(to, body);
    await db.update(M).set({ status: "SENT", providerId: r.id, sentAt: new Date() }).where(eq(M.id, m.id));
  } catch (e) {
    await db.update(M).set({ status: "FAILED", error: (e as Error).message }).where(eq(M.id, m.id));
    throw e;
  }
  await db.transaction(async tx => {
    await tx.insert(schema.notes).values({ clientId: c.id, claimId: k?.id ?? null, date: t.today, authorCode: t.membership.userCode, system: true, text: `${ch === "EMAIL" ? "Email" : "SMS"} sent: ${tpl.name}${subject ? ` — "${subject}"` : ""} (to ${to})` });
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Message", entityId: m.id, recordRef: k?.claimId || recordRef(c), field: ch === "EMAIL" ? "Email" : "SMS", newValue: tpl.name });
    await tx.update(C).set({ lastContact: sql`GREATEST(COALESCE(${C.lastContact}, ${t.today}::date), ${t.today}::date)`, lastUpdatedBy: t.membership.userCode, lastUpdatedAt: new Date() }).where(eq(C.id, c.id));
  });
  await afterSend(t, c, tpl.key as TemplateKey, k ?? null);
  return m.id;
}
const fromAddress = (t: Tenant) => t.org.fromEmail ? `${t.org.name} <${t.org.fromEmail}>` : process.env.MAIL_FROM || `${t.org.name} <onboarding@resend.dev>`;

/** Template side effects — the automation Marta used to do by hand after each send. */
async function afterSend(t: Tenant, c: schema.Client, key: TemplateKey, k: (schema.Claim & { authority?: schema.HoldingAuthority | null }) | null) {
  if (key === "info_email" || key === "info_sms") {
    const set: Partial<schema.Client> = {};
    if (!c.infoEmailSent) set.infoEmailSent = t.today;
    if (!c.followUp) { set.followUp = R.addDays(t.today, t.org.infoFollowUpDays); set.followUpReason = "Follow up on initial email"; set.followUpSetBy = "Automatic"; }
    if (Object.keys(set).length) await db.transaction(async tx => { await tx.update(C).set(set).where(eq(C.id, c.id)); for (const [f, v] of Object.entries(set)) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: c.id, recordRef: recordRef(c), field: f, oldValue: (c as Record<string, unknown>)[f] as string, newValue: v as string }); });
    if (c.stage === "LEAD" && c.leadIdentifier !== "Info sent - waiting on response" && c.leadIdentifier !== "A2A sent") await setLeadIdentifier(t, c.id, "Info sent - waiting on response");
  }
  if (key === "ha_chase" && k) await chased(t, k.id);
}

/** Chase a holding authority by email about a claim. Not a client message, so no consent gate — but still identified. */
export async function chaseAuthority(t: Tenant, claimId: string, opts: { to?: string; overrideBody?: string; overrideSubject?: string } = {}) {
  const k = await db.query.claims.findFirst({ where: ownClaim(t.org.id, claimId), with: { authority: true, client: true } }); if (!k) throw new Error("Claim not found");
  const to = opts.to || k.authority.emails[0]; if (!to) throw new Error(`${k.authority.name} has no email address — add one under Settings › Holding authorities, or chase by phone and press Chased.`);
  const tpl = await template(t, "ha_chase");
  const vars = { ...clientVars(t, k.client), ...claimVars(t, k) };
  const subject = opts.overrideSubject ?? (tpl.subject ? render(tpl.subject, vars) : `Status request ${k.claimId}`);
  const body = (opts.overrideBody ?? render(tpl.body, vars)) + emailFooter(t, null);
  const [m] = await db.insert(M).values({ orgId: t.org.id, clientId: k.clientId, claimId: k.id, channel: "EMAIL", toAddress: to, toName: k.authority.name, subject, body, templateKey: "ha_chase", status: "QUEUED", sentBy: t.membership.userCode }).returning();
  try { const r = await sendMail({ to, toName: k.authority.name, from: fromAddress(t), replyTo: t.org.replyTo || t.user.email || null, subject, text: body }); await db.update(M).set({ status: "SENT", providerId: r.id, sentAt: new Date() }).where(eq(M.id, m.id)); }
  catch (e) { await db.update(M).set({ status: "FAILED", error: (e as Error).message }).where(eq(M.id, m.id)); throw e; }
  await logActivity(db, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Message", entityId: m.id, recordRef: k.claimId, field: "Email", newValue: `Chase to ${k.authority.name}` });
  const next = await chased(t, k.id);
  return { messageId: m.id, next };
}

// ---------- calls ----------
export type CallInput = { outcome: CallOutcome; note?: string; consentEmail?: boolean; consentSms?: boolean; callBack?: string | null; sendInfo?: boolean; number?: string | null };
/** Log a call and do the bookkeeping: note (moves Last Contact), consent, Lead Identifier, follow-up, optional info email. */
export async function logCall(t: Tenant, clientId: string, i: CallInput) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  await db.insert(schema.calls).values({ orgId: t.org.id, clientId, outcome: i.outcome, number: i.number || c.phoneMobile || c.phoneOther, note: i.note || null, userCode: t.membership.userCode });
  await addNote(t, clientId, `Call — ${i.outcome}${i.note ? `: ${i.note}` : ""}`);
  if (i.consentEmail) await recordConsent(t, clientId, "EMAIL", true, "Phone call", i.note || null);
  if (i.consentSms) await recordConsent(t, clientId, "SMS", true, "Phone call", i.note || null);
  const set: Partial<schema.Client> = {};
  let ident: string | null | undefined;
  if (c.stage === "LEAD") {
    if (i.outcome === "No answer" || i.outcome === "Voicemail") { ident = "Calling"; if (!c.followUp || c.followUp < t.today) { set.followUp = R.addDays(t.today, 2); set.followUpReason = "Call again"; set.followUpSetBy = "Automatic"; } }
    if (i.outcome === "Wrong number") ident = "Hard to find";
    if (i.outcome === "Not interested") ident = "Leads No List";
    if (i.outcome === "Spoke" && !c.leadIdentifier?.startsWith("Info sent") && c.leadIdentifier !== "A2A sent") ident = "Calling";
  }
  if (i.outcome === "Call back" && i.callBack) { set.followUp = i.callBack; set.followUpReason = "Client asked for a call back"; set.followUpSetBy = t.membership.userCode; }
  if (Object.keys(set).length) await db.transaction(async tx => { await tx.update(C).set(set).where(eq(C.id, clientId)); if (set.followUp) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: "Follow Up", oldValue: c.followUp, newValue: set.followUp }); });
  if (ident && ident !== c.leadIdentifier) await setLeadIdentifier(t, clientId, ident);
  let sent: string | null = null;
  if (i.sendInfo && i.consentEmail) { await sendToClient(t, { clientId, key: "info_email" }); sent = "info_email"; }
  return { sent };
}

// ---------- e-sign ----------
export async function createSignRequest(t: Tenant, clientId: string, o: { via: "EMAIL" | "SMS" | "BOTH"; feePct: number; claimId?: string | null; expiresDays?: number }) {
  const c = await db.query.clients.findFirst({ where: ownClient(t.org.id, clientId) }); if (!c) throw new Error("Client not found");
  if (o.via !== "SMS" && !firstEmail(c.email)) throw new Error("No valid email address on the record");
  if (o.via !== "EMAIL" && !toE164(c.phoneMobile)) throw new Error("No valid mobile number on the record");
  if (c.emailOptOutAt && o.via !== "SMS") throw new Error("Client has opted out of email");
  if (c.smsOptOutAt && o.via !== "EMAIL") throw new Error("Client has opted out of SMS");
  const open = await db.query.signRequests.findFirst({ where: and(eq(S.clientId, clientId), inArray(S.status, ["SENT", "VIEWED"])) });
  if (open) await db.update(S).set({ status: "CANCELLED" }).where(eq(S.id, open.id));
  const cv = clientVars(t, c); const docText = render(t.org.a2aTemplate || DEFAULT_A2A_TEMPLATE, { ...cv, name: cv.fullName, feePct: o.feePct, date: R.fmtDate(t.today) });
  const [req] = await db.insert(S).values({ orgId: t.org.id, clientId, claimId: o.claimId ?? null, documentText: docText, signerEmail: firstEmail(c.email), sentBy: t.membership.userCode, expiresAt: new Date(Date.now() + (o.expiresDays ?? 30) * 86400000) }).returning();
  const signLink = `${appUrl()}/sign/${req.token}`;
  if (o.via !== "SMS") await sendToClient(t, { clientId, key: "a2a_sign", extra: { signLink }, transactional: true });
  if (o.via !== "EMAIL") await sendToClient(t, { clientId, key: "a2a_sms", extra: { signLink }, transactional: true });
  const set: Partial<schema.Client> = {}; if (!c.a2aSent) set.a2aSent = t.today;
  if (Object.keys(set).length) await db.transaction(async tx => { await tx.update(C).set(set).where(eq(C.id, clientId)); await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Client", entityId: clientId, recordRef: recordRef(c), field: "a2aSent", oldValue: c.a2aSent, newValue: t.today }); });
  await logActivity(db, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Signature request", entityId: req.id, recordRef: recordRef(c), field: "Authority to Act", newValue: `Sent for e-signature via ${o.via.toLowerCase()}` });
  if (c.stage === "LEAD" && c.leadIdentifier !== "A2A sent") await setLeadIdentifier(t, clientId, "A2A sent");
  return req;
}
export async function cancelSignRequest(t: Tenant, id: string) {
  const r = await db.query.signRequests.findFirst({ where: and(eq(S.id, id), eq(S.orgId, t.org.id)) }); if (!r) throw new Error("Not found");
  await db.update(S).set({ status: "CANCELLED" }).where(eq(S.id, id));
  await logActivity(db, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Signature request", entityId: id, recordRef: "", field: "Status", oldValue: r.status, newValue: "CANCELLED" });
}
/** Public: what the signing page shows. Marks VIEWED the first time. */
export async function signRequestByToken(token: string) {
  const r = await db.query.signRequests.findFirst({ where: eq(S.token, token), with: { client: true } }); if (!r) return null;
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, r.orgId) });
  if ((r.status === "SENT") && (!r.expiresAt || r.expiresAt > new Date())) { await db.update(S).set({ status: "VIEWED", viewedAt: new Date() }).where(eq(S.id, r.id)); r.status = "VIEWED"; }
  if (r.expiresAt && r.expiresAt < new Date() && (r.status === "SENT" || r.status === "VIEWED")) { await db.update(S).set({ status: "EXPIRED" }).where(eq(S.id, r.id)); r.status = "EXPIRED"; }
  return { req: r, org: org! };
}
/** Public: the client signs. Stores the evidence, renders a PDF into Attachments, and runs the A2A Signed rule (-> Active + Client Code). */
export async function completeSignature(token: string, i: { name: string; signatureData: string; ip: string; agent: string; agreed: boolean }) {
  const r = await db.query.signRequests.findFirst({ where: eq(S.token, token), with: { client: true } }); if (!r) throw new Error("This link is not valid");
  if (r.status === "SIGNED") return r;
  if (r.status !== "SENT" && r.status !== "VIEWED") throw new Error("This document is no longer open for signing");
  if (!i.agreed) throw new Error("Please tick the box to confirm you have read the document");
  const name = i.name.trim(); if (name.length < 3) throw new Error("Please type your full name");
  if (!i.signatureData || i.signatureData.length < 20) throw new Error("Please sign in the box");
  const t = await systemTenant(r.orgId, "Client");
  const signedAt = new Date();
  const pdf = await signedPdf({ org: t.org, text: r.documentText, name, signedAt, ip: i.ip, agent: i.agent, signature: i.signatureData, requestId: r.id });
  const [a] = await db.insert(schema.attachments).values({ orgId: r.orgId, clientId: r.clientId, claimId: r.claimId, name: `Authority to Act - signed ${signedAt.toISOString().slice(0, 10)}.pdf`, mime: "application/pdf", size: pdf.length, storageKey: "pending", uploadedBy: "Client" }).returning();
  const key = `${r.orgId}/${r.clientId}/${a.id}-a2a-signed.pdf`; await storage().put(key, pdf, "application/pdf"); await db.update(schema.attachments).set({ storageKey: key }).where(eq(schema.attachments.id, a.id));
  await db.update(S).set({ status: "SIGNED", signedAt, signerName: name, signerIp: i.ip, signerAgent: i.agent.slice(0, 300), signatureData: i.signatureData, attachmentId: a.id }).where(eq(S.id, r.id));
  await logActivity(db, r.orgId, "Client", { action: "EDITED", entityType: "Signature request", entityId: r.id, recordRef: recordRef(r.client), field: "Status", oldValue: r.status, newValue: `SIGNED by ${name}` });
  await addNote(t, r.clientId, `Authority to Act signed online by ${name} (IP ${i.ip}). Signed copy saved to Documents.`, { system: true, author: "System" });
  if (!r.client.a2aSigned) await setA2ASigned({ ...t, membership: { ...t.membership, userCode: "System" } }, r.clientId, t.today);
  // Signed copy to the client (transactional — they just asked for it) and a heads-up to the sender.
  const email = r.signerEmail || firstEmail(r.client.email);
  if (email && !r.client.emailOptOutAt) { try { await sendMail({ to: email, from: t.org.fromEmail ? `${t.org.name} <${t.org.fromEmail}>` : process.env.MAIL_FROM || `${t.org.name} <onboarding@resend.dev>`, subject: `Your signed Authority to Act — ${t.org.name}`, text: `Hi ${name},\n\nThanks — your Authority to Act for ${t.org.name} was signed on ${R.fmtDate(t.today)}. A copy is kept on your file and we'll be in touch as the claim progresses.${emailFooter(t, null)}` }); } catch { /* best effort */ } }
  const sender = await db.query.memberships.findFirst({ where: and(eq(schema.memberships.orgId, r.orgId), eq(schema.memberships.userCode, r.sentBy)), with: { user: true } });
  if (sender?.user.email) { try { await sendMail({ to: sender.user.email, from: process.env.MAIL_FROM || `${t.org.name} <onboarding@resend.dev>`, subject: `Signed: ${R.displayName(r.client)} — Authority to Act`, text: `${name} signed the Authority to Act just now. The record is now Active${r.client.clientCode ? "" : " with a new Client Code"}.\n\n${appUrl()}/clients/${r.clientId}` }); } catch { /* best effort */ } }
  return { ...r, status: "SIGNED" as const, signerName: name };
}

async function signedPdf(p: { org: schema.Organisation; text: string; name: string; signedAt: Date; ip: string; agent: string; signature: string; requestId: string }) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, m = 56, size = 10.5, lh = 15; let page = doc.addPage([W, H]); let y = H - m;
  const wrap = (s: string, f = font, sz = size) => { const out: string[] = []; for (const para of s.split("\n")) { let line = ""; for (const w of para.split(" ")) { const tryL = line ? line + " " + w : w; if (f.widthOfTextAtSize(tryL, sz) > W - 2 * m) { out.push(line); line = w; } else line = tryL; } out.push(line); } return out; };
  const put = (s: string, f = font, sz = size) => { for (const l of wrap(s, f, sz)) { if (y < m + 40) { page = doc.addPage([W, H]); y = H - m; } page.drawText(l, { x: m, y, size: sz, font: f, color: rgb(0.05, 0.24, 0.38) }); y -= lh * (sz / size); } };
  put(p.org.name, bold, 16); y -= 6; put(p.text); y -= 14;
  put("Electronic signature", bold, 12); y -= 2;
  put(`Signed by: ${p.name}\nDate/time: ${p.signedAt.toISOString().replace("T", " ").slice(0, 19)} UTC\nIP address: ${p.ip}\nDevice: ${p.agent.slice(0, 90)}\nDocument ID: ${p.requestId}\nSigned electronically under the Electronic Transactions Act 1999 (Cth).`);
  try { if (p.signature.startsWith("data:image/png;base64,")) { const img = await doc.embedPng(Buffer.from(p.signature.split(",")[1], "base64")); const w = 180, h = (img.height / img.width) * w; if (y - h < m) { page = doc.addPage([W, H]); y = H - m; } page.drawImage(img, { x: m, y: y - h, width: w, height: h }); y -= h + 8; } else { y -= 6; put(p.signature, bold, 18); } } catch { put(`(signature: ${p.name})`); }
  return Buffer.from(await doc.save());
}

// ---------- automation (daily) ----------
export async function runDaily(orgId?: string) {
  const orgs = orgId ? [orgId] : (await db.select({ id: schema.organisations.id }).from(schema.organisations)).map(o => o.id);
  const report: { org: string; reminders: number; expired: number; errors: string[] }[] = [];
  for (const id of orgs) {
    const t = await systemTenant(id); const rep = { org: t.org.slug, reminders: 0, expired: 0, errors: [] as string[] };
    const days = t.org.a2aReminderDays.split(",").map(s => parseInt(s.trim(), 10)).filter(n => n > 0).sort((a, b) => a - b);
    const open = await db.query.signRequests.findMany({ where: and(eq(S.orgId, id), inArray(S.status, ["SENT", "VIEWED"])), with: { client: true } });
    for (const r of open) {
      if (r.expiresAt && r.expiresAt < new Date()) { await db.update(S).set({ status: "EXPIRED" }).where(eq(S.id, r.id)); rep.expired++; continue; }
      const age = Math.floor((Date.now() - r.createdAt.getTime()) / 86400000);
      const due = days.filter(d => d <= age).length; // how many reminders should have gone by now
      if (due > r.remindersSent) {
        const signLink = `${appUrl()}/sign/${r.token}`; const sentVia: string[] = [];
        try { if (r.signerEmail && !r.client.emailOptOutAt) { await sendToClient(t, { clientId: r.clientId, key: "a2a_reminder", extra: { signLink }, transactional: true }); sentVia.push("email"); } } catch (e) { rep.errors.push(`${r.clientId}: ${(e as Error).message}`); }
        try { if (!r.signerEmail && toE164(r.client.phoneMobile) && !r.client.smsOptOutAt) { await sendToClient(t, { clientId: r.clientId, key: "a2a_reminder_sms", extra: { signLink }, transactional: true }); sentVia.push("sms"); } } catch (e) { rep.errors.push(`${r.clientId}: ${(e as Error).message}`); }
        await db.update(S).set({ remindersSent: due, lastReminderAt: new Date() }).where(eq(S.id, r.id));
        if (sentVia.length) rep.reminders++;
      }
    }
    report.push(rep);
  }
  return report;
}

// ---------- reading ----------
export type TimelineItem = { at: Date; kind: "email" | "sms" | "call" | "consent" | "sign" | "note"; title: string; detail?: string | null; status?: string | null; by: string; id: string };
export async function timeline(t: Tenant, clientId: string): Promise<TimelineItem[]> {
  const [ms, cs, cons, sr] = await Promise.all([
    db.select().from(M).where(and(eq(M.orgId, t.org.id), eq(M.clientId, clientId))).orderBy(desc(M.createdAt)),
    db.select().from(schema.calls).where(eq(schema.calls.clientId, clientId)).orderBy(desc(schema.calls.createdAt)),
    db.select().from(schema.consents).where(eq(schema.consents.clientId, clientId)).orderBy(desc(schema.consents.createdAt)),
    db.select().from(S).where(eq(S.clientId, clientId)).orderBy(desc(S.createdAt)),
  ]);
  const items: TimelineItem[] = [
    ...ms.map(m => ({ at: m.createdAt, kind: (m.channel === "EMAIL" ? "email" : "sms") as "email" | "sms", title: `${m.channel === "EMAIL" ? "Email" : "SMS"} ${m.direction === "IN" ? "from" : "to"} ${m.toName || m.toAddress}${m.subject ? `: ${m.subject}` : ""}`, detail: m.body, status: m.status + (m.error ? ` — ${m.error}` : ""), by: m.sentBy, id: m.id })),
    ...cs.map(c => ({ at: c.createdAt, kind: "call" as const, title: `Call — ${c.outcome}${c.number ? ` (${c.number})` : ""}`, detail: c.note, by: c.userCode, id: c.id })),
    ...cons.map(c => ({ at: c.createdAt, kind: "consent" as const, title: `${c.channel === "EMAIL" ? "Email" : "SMS"} ${c.granted ? "consent given" : "opt-out"} — ${c.method}`, detail: c.note, by: c.capturedBy, id: c.id })),
    ...sr.map(s => ({ at: s.createdAt, kind: "sign" as const, title: `Authority to Act sent for e-signature`, detail: s.status === "SIGNED" ? `Signed by ${s.signerName} on ${s.signedAt?.toISOString().slice(0, 10)}` : s.status === "VIEWED" ? `Opened ${s.viewedAt?.toISOString().slice(0, 10)}, not yet signed · ${s.remindersSent} reminder(s)` : `${s.status.toLowerCase()} · ${s.remindersSent} reminder(s)`, status: s.status, by: s.sentBy, id: s.id })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
export async function openSignRequest(t: Tenant, clientId: string) { return db.query.signRequests.findFirst({ where: and(eq(S.orgId, t.org.id), eq(S.clientId, clientId), inArray(S.status, ["SENT", "VIEWED"])) }); }

/** The Today page: what needs a human now. */
export async function todayData(t: Tenant) {
  const { allFollowUps } = await import("./queries");
  const fus = await allFollowUps(t);
  const leads = await db.select().from(C).where(and(eq(C.orgId, t.org.id), isNull(C.deletedAt), eq(C.stage, "LEAD")));
  const fuBy = new Map<string, typeof fus[number]>(); for (const f of fus) if (!fuBy.has(f.clientId)) fuBy.set(f.clientId, f);
  // Calls: leads with a phone that are new, being called, or whose follow-up is due — oldest contact first
  const calls = leads.filter(c => (c.phoneMobile || c.phoneOther) && (["New import", "Calling", "Need more info", null, ""].includes(c.leadIdentifier) || (fuBy.get(c.id)?.due && fuBy.get(c.id)?.kind === "client")) && !(c.followUp && c.followUp > t.today))
    .sort((a, b) => (a.lastContact || "0000") < (b.lastContact || "0000") ? -1 : 1).slice(0, 40);
  const awaiting = await db.query.signRequests.findMany({ where: and(eq(S.orgId, t.org.id), inArray(S.status, ["SENT", "VIEWED"])), with: { client: true }, orderBy: [desc(S.createdAt)] });
  const chase = fus.filter(f => f.due && f.claimId && (f.kind === "ha" || f.kind === "a2a"));
  const refunds = await db.query.claims.findMany({ where: and(eq(K.orgId, t.org.id), isNull(K.deletedAt), inArray(K.progress, [11])), with: { client: true, authority: true } });
  const idNeeded = await db.query.claims.findMany({ where: and(eq(K.orgId, t.org.id), isNull(K.deletedAt), eq(K.progress, 4)), with: { client: true, authority: true } });
  const since = new Date(Date.now() - 7 * 86400000);
  const optOuts = await db.select().from(schema.consents).where(and(eq(schema.consents.orgId, t.org.id), eq(schema.consents.granted, false), sql`${schema.consents.createdAt} > ${since}`));
  const sentWeek = await db.select({ n: sql<number>`count(*)::int` }).from(M).where(and(eq(M.orgId, t.org.id), eq(M.status, "SENT"), sql`${M.createdAt} > ${since}`));
  const signedWeek = await db.select({ n: sql<number>`count(*)::int` }).from(S).where(and(eq(S.orgId, t.org.id), eq(S.status, "SIGNED"), sql`${S.signedAt} > ${since}`));
  return { calls, awaiting, chase, refunds, idNeeded, optOuts: optOuts.length, sentWeek: sentWeek[0]?.n ?? 0, signedWeek: signedWeek[0]?.n ?? 0, dueTotal: fus.filter(f => f.due).length, fuBy };
}
