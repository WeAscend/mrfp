// Tenant context: who is logged in, which organisation, today's date, holidays. Every page and action starts here.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { getSession } from "./session";
import { todayInZone } from "./rules";

export type Tenant = {
  org: schema.Organisation;
  membership: schema.Membership;
  user: { id: string; email: string; name: string };
  isAdmin: boolean;
  today: string;
  holidays: Set<string>;
};

export const getTenant = cache(async (): Promise<Tenant | null> => {
  const s = await getSession();
  if (!s.userId || !s.orgId) return null;
  const m = await db.query.memberships.findFirst({ where: and(eq(schema.memberships.userId, s.userId), eq(schema.memberships.orgId, s.orgId), eq(schema.memberships.active, true)), with: { org: true, user: true } });
  if (!m) return null;
  const regions = m.org.holidayRegions.split(",").map(r => r.trim()).filter(Boolean);
  const hol = regions.length ? await db.select({ date: schema.holidays.date }).from(schema.holidays).where(inArray(schema.holidays.region, regions)) : [];
  return { org: m.org, membership: m, user: { id: m.user.id, email: m.user.email, name: m.user.name }, isAdmin: m.role === "ADMIN", today: todayInZone("Australia/Sydney"), holidays: new Set(hol.map(h => h.date)) };
});

export async function requireTenant(): Promise<Tenant> {
  const t = await getTenant();
  if (!t) redirect("/login");
  return t;
}
export async function requireAdmin(): Promise<Tenant> {
  const t = await requireTenant();
  if (!t.isAdmin) throw new Error("Admin only");
  return t;
}

/** Tenant-scoped where clause helpers — use these so a record from another organisation is never touched. */
export const ownClient = (orgId: string, id: string) => and(eq(schema.clients.orgId, orgId), eq(schema.clients.id, id), isNull(schema.clients.deletedAt));
export const ownClaim = (orgId: string, id: string) => and(eq(schema.claims.orgId, orgId), eq(schema.claims.id, id), isNull(schema.claims.deletedAt));

export type LogEntry = { action: "CREATED" | "EDITED" | "DELETED" | "RESTORED"; entityType: string; entityId?: string | null; recordRef: string; field?: string | null; oldValue?: unknown; newValue?: unknown; userCode?: string; timestamp?: Date };
const str = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v)).slice(0, 500);
export async function logActivity(tx: Pick<typeof db, "insert">, orgId: string, userCode: string, e: LogEntry) {
  await tx.insert(schema.activityLog).values({ orgId, userCode: e.userCode ?? userCode, action: e.action, entityType: e.entityType, entityId: e.entityId ?? null, recordRef: e.recordRef, field: e.field ?? null, oldValue: e.oldValue == null ? null : str(e.oldValue), newValue: e.newValue == null ? null : str(e.newValue), ...(e.timestamp ? { timestamp: e.timestamp } : {}) });
}
