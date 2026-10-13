// Organisation lifecycle: sign-up creates the tenant with standard reference data, a trial subscription and the first Admin.
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, schema } from "@/db";
import * as R from "../rules";
import { logActivity, type Tenant } from "../tenant";
import holidaysAU from "@/data/holidays-au.json";

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "org";
export const userCodeFor = (name: string, taken: Set<string>) => { const init = name.split(/\s+/).map(w => w[0] || "").join("").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "XX"; let n = 1; while (taken.has(init + n)) n++; return init + n; };

export async function ensureHolidays() {
  for (const h of holidaysAU as { date: string; region: string; name: string }[]) await db.insert(schema.holidays).values(h).onConflictDoNothing();
}

export async function signUp(input: { orgName: string; shortName: string; name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (await db.query.users.findFirst({ where: eq(schema.users.email, email) })) throw new Error("An account with that email already exists. Log in instead.");
  if (input.password.length < 10) throw new Error("Use a password of at least 10 characters.");
  const passwordHash = await bcrypt.hash(input.password, 12);
  let slug = slugify(input.orgName); if (await db.query.organisations.findFirst({ where: eq(schema.organisations.slug, slug) })) slug += "-" + randomBytes(2).toString("hex");
  return db.transaction(async tx => {
    const [org] = await tx.insert(schema.organisations).values({ name: input.orgName.trim(), shortName: input.shortName.trim().toUpperCase().slice(0, 6) || "ORG", slug }).returning();
    const [user] = await tx.insert(schema.users).values({ email, name: input.name.trim(), passwordHash }).returning();
    const userCode = userCodeFor(input.name, new Set());
    const [m] = await tx.insert(schema.memberships).values({ orgId: org.id, userId: user.id, userCode, role: "ADMIN" }).returning();
    await tx.insert(schema.subscriptions).values({ orgId: org.id, plan: "trial", status: "TRIALING", seats: 1, trialEndsAt: new Date(Date.now() + 30 * 86400000) });
    await tx.insert(schema.holdingAuthorities).values(R.STANDARD_AUTHORITIES.map((a, i) => ({ orgId: org.id, name: a.name, code: a.code, chaseAfter: a.chaseAfter, rechaseAfter: a.rechaseAfter, sortOrder: i })));
    await logActivity(tx, org.id, userCode, { action: "CREATED", entityType: "User", entityId: m.id, recordRef: userCode, newValue: "Organisation created" });
    return { org, user, membership: m };
  });
}

export async function logIn(email: string, password: string) {
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, email.trim().toLowerCase()), with: { memberships: { with: { org: true } } } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new Error("Email or password is wrong.");
  const m = u.memberships.find(x => x.active); if (!m) throw new Error("This account is not a member of any organisation.");
  return { userId: u.id, orgId: m.orgId };
}

export async function addMember(t: Tenant, input: { name: string; email: string; userCode: string; role: "ADMIN" | "USER"; password: string }) {
  if (!t.isAdmin) throw new Error("Admin only");
  const code = input.userCode.trim().toUpperCase(); if (!/^[A-Z]{1,3}\d{1,2}$/.test(code)) throw new Error("User code is initials + a number, e.g. MT2");
  const email = input.email.trim().toLowerCase();
  const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.orgId, t.org.id) });
  const members = await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, t.org.id), eq(schema.memberships.active, true)));
  if (sub && sub.plan !== "trial" && members.length >= sub.seats) throw new Error(`Your plan has ${sub.seats} seat(s). Add seats under Settings › Organisation & plan.`);
  if (members.some(m => m.userCode === code)) throw new Error(`User code ${code} is taken`);
  return db.transaction(async tx => {
    let u = await tx.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!u) [u] = await tx.insert(schema.users).values({ email, name: input.name.trim(), passwordHash: await bcrypt.hash(input.password, 12) }).returning();
    const [m] = await tx.insert(schema.memberships).values({ orgId: t.org.id, userId: u.id, userCode: code, role: input.role }).returning();
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "User", entityId: m.id, recordRef: code, newValue: `${input.role}` });
    return m;
  });
}
export async function members(t: Tenant) { return db.query.memberships.findMany({ where: eq(schema.memberships.orgId, t.org.id), with: { user: true }, orderBy: (m, { asc }) => [asc(m.userCode)] }); }
export async function updateAuthority(t: Tenant, id: string, patch: { code?: string | null; chaseAfter?: number | null; rechaseAfter?: number | null; details?: string | null; name?: string; emails?: string[] }) {
  if (!t.isAdmin) throw new Error("Admin only");
  const a = await db.query.holdingAuthorities.findFirst({ where: and(eq(schema.holdingAuthorities.id, id), eq(schema.holdingAuthorities.orgId, t.org.id)) }); if (!a) throw new Error("Not found");
  if (patch.code != null) patch.code = patch.code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1) || null;
  await db.transaction(async tx => {
    await tx.update(schema.holdingAuthorities).set(patch).where(eq(schema.holdingAuthorities.id, id));
    for (const [k, v] of Object.entries(patch)) await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Holding Authority", entityId: id, recordRef: a.name, field: k, oldValue: (a as Record<string, unknown>)[k], newValue: v });
  });
}
export async function upsertCompany(t: Tenant, input: { id?: string; name: string; details?: string | null; previousNames?: string[]; mailingAddress?: string | null; emails?: string[]; phones?: string[] }) {
  const OC = schema.originatingCompanies;
  return db.transaction(async tx => {
    if (input.id) {
      const o = await tx.query.originatingCompanies.findFirst({ where: and(eq(OC.id, input.id), eq(OC.orgId, t.org.id)) }); if (!o) throw new Error("Not found");
      await tx.update(OC).set({ name: input.name.trim(), details: input.details ?? o.details, previousNames: input.previousNames ?? o.previousNames, mailingAddress: input.mailingAddress ?? o.mailingAddress, emails: input.emails ?? o.emails, phones: input.phones ?? o.phones }).where(eq(OC.id, o.id));
      await logActivity(tx, t.org.id, t.membership.userCode, { action: "EDITED", entityType: "Originating Company", entityId: o.id, recordRef: input.name });
      return o.id;
    }
    const [o] = await tx.insert(OC).values({ orgId: t.org.id, name: input.name.trim(), details: input.details ?? null, previousNames: input.previousNames ?? [], mailingAddress: input.mailingAddress ?? null, emails: input.emails ?? [], phones: input.phones ?? [] }).returning();
    await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Originating Company", entityId: o.id, recordRef: o.name });
    return o.id;
  });
}
export async function updateOrg(t: Tenant, patch: { name?: string; shortName?: string; holidayRegions?: string; gstRate?: string; a2aChaseBusinessDays?: number; revisitMonths?: number; fromEmail?: string | null; replyTo?: string | null; postalAddress?: string | null; phone?: string | null; website?: string | null; smsSenderId?: string | null; a2aTemplate?: string | null; a2aReminderDays?: string; infoFollowUpDays?: number }) {
  if (!t.isAdmin) throw new Error("Admin only");
  await db.update(schema.organisations).set(patch).where(eq(schema.organisations.id, t.org.id));
}
