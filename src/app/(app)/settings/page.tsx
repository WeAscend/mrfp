import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/tenant";
import { authorityMap, companies } from "@/lib/services/queries";
import { members } from "@/lib/services/org";
import { PLANS, stripeEnabled } from "@/lib/billing";
import * as R from "@/lib/rules";
import { Empty } from "@/components/ui";
import { AuthorityRow, CompanyForm, AddUserForm, OrgForm, PlanButtons } from "./SettingsClient";
import { BinButton } from "@/components/actionsClient";
import { PageHead } from "@/components/PageHead";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; billing?: string }> }) {
  const t = await requireAdmin(); const { tab = "authorities", billing } = await searchParams;
  const tabs = [["authorities", "Holding Authorities & Companies"], ["users", "Users"], ["org", "Organisation & plan"], ["bin", "Bin"]];
  let body: React.ReactNode = null;
  if (tab === "authorities") {
    const [{ list }, ocs] = await Promise.all([authorityMap(t), companies(t)]);
    const counts = Object.fromEntries((await db.select({ a: schema.claims.authorityId }).from(schema.claims).where(and(eq(schema.claims.orgId, t.org.id), isNull(schema.claims.deletedAt)))).reduce((m, r) => m.set(r.a, (m.get(r.a) ?? 0) + 1), new Map<string, number>()));
    body = <>
      <div className="card"><h2>Holding Authorities</h2><p className="meta mb-3">Authority Code is the first letter of every Claim ID — a claim cannot be opened against an authority without one. Chase after / Re-chase after (days) drive the Holding Authority follow-up list. Names must match the Search Results values used on leads.</p>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Name</th><th>Code</th><th className="num">Chase after (days)</th><th className="num">Re-chase after</th><th>Processing details</th><th className="num">Claims</th></tr></thead><tbody>{list.map(a => <AuthorityRow key={a.id} a={a} claims={counts[a.id] ?? 0} />)}</tbody></table></div></div>
      <div className="card mt-5"><h2>Originating Companies</h2><p className="meta mb-3">The company the money originated from (bank, insurer, employer). Previous Names / Acquired By records mergers and renames on the surviving company so searches still find it.</p>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Name</th><th>Previous names / acquired by</th><th>Mailing address</th><th>Details</th><th></th></tr></thead><tbody>{ocs.map(o => <CompanyForm key={o.id} o={o} />)}{!ocs.length && <tr><td colSpan={5}><Empty>None yet.</Empty></td></tr>}</tbody></table></div>
        <div className="mt-3"><CompanyForm /></div></div>
    </>;
  } else if (tab === "users") {
    const ms = await members(t);
    body = <div className="card"><h2>Users</h2><p className="meta mb-3">User codes (initials + number, e.g. MT1) are shown everywhere instead of names. A User can never delete, see the Activity Log or change settings.</p>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{ms.map(m => <tr key={m.id}><td><b>{m.userCode}</b></td><td>{m.user.name}</td><td>{m.user.email}</td><td>{m.role === "ADMIN" ? "Admin" : "User"}</td><td>{m.active ? "Active" : "Disabled"}</td></tr>)}</tbody></table></div>
      <h2 className="mt-5">Add user</h2><AddUserForm /></div>;
  } else if (tab === "org") {
    const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.orgId, t.org.id) });
    body = <>
      {billing === "success" && <div className="bg-lime-soft border border-lime rounded-lg px-3.5 py-2.5 mb-4 text-[14px]">Subscription started. It can take a moment for the plan below to update.</div>}
      <div className="card"><h2>Organisation</h2><OrgForm org={t.org} /></div>
      <div className="card mt-5"><h2>Plan</h2>
        <p className="meta mb-3">Current plan: <b>{sub?.plan ?? "trial"}</b> · {sub?.status.toLowerCase()}{sub?.trialEndsAt && sub.status === "TRIALING" ? ` · trial ends ${R.fmtDate(sub.trialEndsAt.toISOString().slice(0, 10))}` : ""} · {sub?.seats ?? 1} seat{(sub?.seats ?? 1) === 1 ? "" : "s"}{sub?.currentPeriodEnd ? ` · renews ${R.fmtDate(sub.currentPeriodEnd.toISOString().slice(0, 10))}` : ""}</p>
        <div className="flex flex-wrap gap-4">{PLANS.map(p => <div key={p.key} className={`border rounded-[10px] p-4 flex-1 basis-[200px] ${sub?.plan === p.key ? "border-lime shadow-[0_0_0_3px_#EEF5D6]" : "border-line"}`}><div className="font-head font-semibold">{p.name}{sub?.plan === p.key && <span className="chip chip-lime ml-2">current</span>}</div><div className="font-head text-[26px] font-bold">{p.priceId ? "See checkout" : "$— / mo"}</div><div className="meta">{p.seats} seat{p.seats > 1 ? "s" : ""} · {p.blurb}</div></div>)}</div>
        <div className="mt-4"><PlanButtons enabled={stripeEnabled()} plans={PLANS.map(p => ({ key: p.key, name: p.name, available: !!p.priceId }))} hasBilling={!!sub?.stripeCustomerId} /></div>
      </div>
    </>;
  } else {
    const cs = await db.query.clients.findMany({ where: (c, { and, eq, isNotNull }) => and(eq(c.orgId, t.org.id), isNotNull(c.deletedAt)) });
    const ks = await db.query.claims.findMany({ where: (k, { and, eq, isNotNull }) => and(eq(k.orgId, t.org.id), isNotNull(k.deletedAt)), with: { client: true } });
    body = <div className="card"><h2>Bin</h2><p className="meta mb-3">Deleted records sit here with their claims, notes and files, restorable for the 7-year retention period. Nothing is permanently removed.</p>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Record</th><th>Type</th><th>Deleted</th><th></th></tr></thead><tbody>
        {cs.map(c => <tr key={c.id}><td>{R.displayName(c)} {c.clientCode}</td><td>Client</td><td>{R.fmtDate(c.deletedAt!.toISOString().slice(0, 10))}</td><td><BinButton kind="client" id={c.id} restore /></td></tr>)}
        {ks.filter(k => !k.client.deletedAt).map(k => <tr key={k.id}><td>{k.claimId}</td><td>Claim · {R.displayName(k.client)}</td><td>{R.fmtDate(k.deletedAt!.toISOString().slice(0, 10))}</td><td><BinButton kind="claim" id={k.id} restore /></td></tr>)}
        {!cs.length && !ks.length && <tr><td colSpan={4}><Empty>The bin is empty.</Empty></td></tr>}</tbody></table></div></div>;
  }
  return <><PageHead title="Settings" lede="Reference data, people and plan for this organisation. Admin only." /><div className="views mb-3.5">{tabs.map(([k, l]) => <Link key={k} href={`/settings?tab=${k}`} className={tab === k ? "on" : ""}>{l}</Link>)}</div>{body}</>;
}
