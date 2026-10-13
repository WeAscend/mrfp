// Read-side queries: follow-up lists, search, report views. All scoped by orgId.
import { and, eq, isNull, or, ilike, sql, desc, asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import * as R from "../rules";

const C = schema.clients, K = schema.claims, HA = schema.holdingAuthorities;

export async function authorityMap(t: Tenant) {
  const rows = await db.select().from(HA).where(and(eq(HA.orgId, t.org.id), isNull(HA.deletedAt))).orderBy(asc(HA.sortOrder), asc(HA.name));
  return { list: rows, byId: Object.fromEntries(rows.map(a => [a.id, a])) as Record<string, schema.HoldingAuthority> };
}
export async function companies(t: Tenant) { return db.select().from(schema.originatingCompanies).where(and(eq(schema.originatingCompanies.orgId, t.org.id), isNull(schema.originatingCompanies.deletedAt))).orderBy(asc(schema.originatingCompanies.name)); }

/** Claims shaped for the follow-up rules, for one client or the whole org. */
export async function claimsForFU(t: Tenant, clientId?: string): Promise<R.ClaimForFU[]> {
  const ks = await db.query.claims.findMany({ where: and(eq(K.orgId, t.org.id), isNull(K.deletedAt), clientId ? eq(K.clientId, clientId) : undefined), with: { resubmissions: true, a2aLog: true } });
  return ks.map(k => ({ id: k.id, claimId: k.claimId, clientId: k.clientId, authorityId: k.authorityId, progress: k.progress, dateSubmitted: k.dateSubmitted, resubmissions: k.resubmissions.map(r => r.date), lastChased: k.lastChased, followUp: k.followUp, followUpReason: k.followUpReason, followUpSetBy: k.followUpSetBy, a2aLog: k.a2aLog.map(e => ({ sent: e.sent, signed: e.signed })) }));
}
export type FollowUpRow = R.FollowUp & { client: schema.Client; claim?: { id: string; claimId: string; authorityName: string } };
/** Every follow-up across the org (Follow Up due, A2A chase, HA follow-up views all filter this). */
export async function allFollowUps(t: Tenant): Promise<FollowUpRow[]> {
  const [cs, ks, { byId }] = await Promise.all([db.select().from(C).where(and(eq(C.orgId, t.org.id), isNull(C.deletedAt))), claimsForFU(t), authorityMap(t)]);
  const byClient = new Map(cs.map(c => [c.id, c]));
  const kById = new Map(ks.map(k => [k.id, k]));
  const out: FollowUpRow[] = [];
  for (const c of cs) for (const f of R.followUpsForClient(c, ks, byId, t.today, t.holidays, t.org.a2aChaseBusinessDays)) {
    const k = f.claimId ? kById.get(f.claimId) : undefined;
    out.push({ ...f, client: byClient.get(f.clientId)!, claim: k ? { id: k.id, claimId: k.claimId, authorityName: byId[k.authorityId]?.name ?? "" } : undefined });
  }
  return out.sort((a, b) => (a.overdue === b.overdue ? (a.date < b.date ? -1 : 1) : a.overdue ? -1 : 1));
}
export async function dueCount(t: Tenant) { return (await allFollowUps(t)).filter(f => f.due).length; }

/** One search box: surname, business name, OTN / Reference Number, Claim ID, phone, email — not case-sensitive (Spec 2.4). */
export async function search(t: Tenant, q: string) {
  q = q.trim(); if (!q) return { clients: [], claims: [] };
  const like = `%${q}%`, digits = q.replace(/\s/g, "");
  const cs = await db.select().from(C).where(and(eq(C.orgId, t.org.id), isNull(C.deletedAt), or(ilike(C.surname, like), ilike(C.firstName, like), sql`array_to_string(${C.businessNames}, ' ') ILIKE ${like}`, ilike(C.email, like), ilike(C.phoneMobile, like), ilike(C.phoneOther, like), ilike(C.clientCode, like), digits ? sql`replace(coalesce(${C.phoneMobile},''), ' ', '') ILIKE ${"%" + digits + "%"}` : sql`false`, digits ? sql`replace(coalesce(${C.phoneOther},''), ' ', '') ILIKE ${"%" + digits + "%"}` : sql`false`))).limit(20);
  const ks = await db.query.claims.findMany({ where: and(eq(K.orgId, t.org.id), isNull(K.deletedAt), or(ilike(K.claimId, like), ilike(K.reference, like))), with: { client: true, authority: true }, limit: 20 });
  return { clients: cs, claims: ks };
}

export async function listClients(t: Tenant, f: { view?: string; stage?: string; ident?: string; source?: string; sc?: string; owner?: string; enteredFrom?: string; enteredTo?: string }) {
  const where = [eq(C.orgId, t.org.id), isNull(C.deletedAt)];
  if (f.view === "active") where.push(eq(C.stage, "ACTIVE"));
  if (f.stage) where.push(eq(C.stage, f.stage as "LEAD" | "ACTIVE" | "INACTIVE"));
  if (f.ident) where.push(or(eq(C.leadIdentifier, f.ident), eq(C.inactiveReason, f.ident))!);
  if (f.source) where.push(eq(C.source, f.source));
  if (f.sc) where.push(sql`${f.sc} = ANY(${C.specialConditions})`);
  if (f.owner) where.push(eq(C.ownerCode, f.owner));
  if (f.enteredFrom) where.push(sql`${C.dateEntered} >= ${f.enteredFrom}::date`);
  if (f.enteredTo) where.push(sql`${C.dateEntered} <= ${f.enteredTo}::date`);
  const rows = await db.select().from(C).where(and(...where)).orderBy(asc(C.surname), asc(C.firstName));
  const open = await db.select({ clientId: K.clientId, n: sql<number>`count(*)::int` }).from(K).where(and(eq(K.orgId, t.org.id), isNull(K.deletedAt), sql`${K.progress} IS NOT NULL AND ${K.progress} NOT IN (16,17,18,19,20,21)`)).groupBy(K.clientId);
  const openBy = Object.fromEntries(open.map(o => [o.clientId, o.n]));
  const fus = await allFollowUps(t); const nextBy = new Map<string, R.FollowUp>(); for (const x of fus) if (!nextBy.has(x.clientId)) nextBy.set(x.clientId, x);
  const logs = rows.length ? await db.select({ clientId: schema.searchLog.clientId, authorities: schema.searchLog.authorities, date: schema.searchLog.date }).from(schema.searchLog).where(inArray(schema.searchLog.clientId, rows.map(r => r.id))).orderBy(desc(schema.searchLog.date)) : [];
  const foundBy = new Map<string, string[]>(); for (const l of logs) if (!foundBy.has(l.clientId)) foundBy.set(l.clientId, l.authorities);
  return rows.map(c => ({ ...c, openClaims: openBy[c.id] ?? 0, next: nextBy.get(c.id) ?? null, foundAt: foundBy.get(c.id) ?? [] })).sort((a, b) => R.displayName(a).localeCompare(R.displayName(b)));
}
export const CLAIM_VIEWS: { key: string; label: string; test: (p: number | null) => boolean }[] = [
  { key: "all", label: "All claims", test: () => true }, { key: "notstarted", label: "Not Started", test: p => p === 1 },
  { key: "pipeline", label: "Pipeline - All", test: p => p != null && p >= 1 && p <= 13 }, { key: "viable", label: "Pipeline - Viable", test: p => p != null && p >= 2 && p <= 13 },
  { key: "sent", label: "Sent to Holding Authority", test: p => p === 7 }, { key: "approved", label: "Approved - Waiting on Refund", test: p => p === 10 },
  { key: "waiting", label: "{ORG} Waiting on Payment", test: p => p === 13 }, { key: "paid", label: "{ORG} Invoice Paid", test: p => p === 14 }, { key: "review", label: "Review Not Completed", test: p => p === 15 },
];
export async function listClaims(t: Tenant, f: { view?: string; ha?: string; owner?: string; client?: string }) {
  const ks = await db.query.claims.findMany({ where: and(eq(K.orgId, t.org.id), isNull(K.deletedAt), f.ha ? eq(K.authorityId, f.ha) : undefined, f.client ? eq(K.clientId, f.client) : undefined), with: { client: true, authority: true, companies: { with: { company: true } }, a2aLog: { orderBy: (a, { asc }) => [asc(a.order)] } }, orderBy: [asc(K.claimId)] });
  const v = CLAIM_VIEWS.find(x => x.key === (f.view || "all")) ?? CLAIM_VIEWS[0];
  return ks.filter(k => v.test(k.progress) && (!f.owner || k.client.ownerCode === f.owner));
}
export async function activity(t: Tenant, f: { user?: string; entity?: string; ref?: string; from?: string; to?: string; limit?: number }) {
  const A = schema.activityLog; const where = [eq(A.orgId, t.org.id)];
  if (f.user) where.push(eq(A.userCode, f.user)); if (f.entity) where.push(eq(A.entityType, f.entity)); if (f.ref) where.push(ilike(A.recordRef, `%${f.ref}%`));
  if (f.from) where.push(sql`${A.timestamp} >= ${f.from}::date`); if (f.to) where.push(sql`${A.timestamp} < (${f.to}::date + 1)`);
  return db.select().from(A).where(and(...where)).orderBy(desc(A.timestamp), desc(A.id)).limit(f.limit ?? 300);
}
