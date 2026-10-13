import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/tenant";
import { authorityMap, companies } from "@/lib/services/queries";
import { members } from "@/lib/services/org";
import * as R from "@/lib/rules";
import { Empty } from "@/components/ui";
import { AuthorityRow, CompanyForm, AddUserForm, OrgForm, OutreachForm, OutreachSwitch, TemplateEditor } from "./SettingsClient";
import { templates } from "@/lib/services/comms";
import { PLACEHOLDERS, DEFAULT_TEMPLATES } from "@/lib/templates";
import { RunAutomationButton } from "@/components/commsClient";
import { mailDriver } from "@/lib/mail";
import { smsDriver } from "@/lib/sms";
import { BinButton } from "@/components/actionsClient";
import { PageHead } from "@/components/PageHead";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await requireAdmin(); const { tab = "authorities" } = await searchParams;
  const tabs = [["authorities", "Holding Authorities & Companies"], ["outreach", "Outreach & templates"], ["users", "Users"], ["org", "Organisation"], ["bin", "Bin"]];
  let body: React.ReactNode = null;
  if (tab === "authorities") {
    const [{ list }, ocs] = await Promise.all([authorityMap(t), companies(t)]);
    const counts = Object.fromEntries((await db.select({ a: schema.claims.authorityId }).from(schema.claims).where(and(eq(schema.claims.orgId, t.org.id), isNull(schema.claims.deletedAt)))).reduce((m, r) => m.set(r.a, (m.get(r.a) ?? 0) + 1), new Map<string, number>()));
    body = <>
      <div className="card"><h2>Holding Authorities</h2><p className="meta mb-3">Authority Code is the first letter of every Claim ID — a claim cannot be opened against an authority without one. Chase after / Re-chase after (days) drive the Holding Authority follow-up list. Names must match the Search Results values used on leads.</p>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Name</th><th>Code</th><th className="num">Chase after (days)</th><th className="num">Re-chase after</th><th>Processing details</th><th>Chase email</th><th className="num">Claims</th></tr></thead><tbody>{list.map(a => <AuthorityRow key={a.id} a={a} claims={counts[a.id] ?? 0} />)}</tbody></table></div></div>
      <div className="card mt-5"><h2>Originating Companies</h2><p className="meta mb-3">The company the money originated from (bank, insurer, employer). Previous Names / Acquired By records mergers and renames on the surviving company so searches still find it.</p>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Name</th><th>Previous names / acquired by</th><th>Mailing address</th><th>Details</th><th></th></tr></thead><tbody>{ocs.map(o => <CompanyForm key={o.id} o={o} />)}{!ocs.length && <tr><td colSpan={5}><Empty>None yet.</Empty></td></tr>}</tbody></table></div>
        <div className="mt-3"><CompanyForm /></div></div>
    </>;
  } else if (tab === "outreach") {
    const tpls = await templates(t);
    body = <>
      <div className="card !py-4 mb-5"><OutreachSwitch on={t.org.outreachEnabled} /></div>
      <div className="card"><h2>Sender identity & automation</h2><p className="meta mb-3">Email: <b>{mailDriver() === "resend" ? "connected (Resend)" : "not connected — messages are logged only"}</b> · SMS: <b>{smsDriver() === "twilio" ? "connected (Twilio)" : "not connected"}</b>. Every email carries these details and an unsubscribe link; every SMS ends with "Reply STOP to opt out".</p><OutreachForm org={t.org} /><div className="mt-4 pt-3 border-t border-line flex items-center gap-3"><RunAutomationButton /><span className="meta">Reminders normally run once a day (vercel.json cron). Use this to send any that are due right now.</span></div></div>
      <div className="card mt-5"><h2>Templates</h2><p className="meta mb-3">Plain text. Placeholders: {PLACEHOLDERS.map(([k]) => <code key={k} className="mr-1.5">{k}</code>)}</p>
        <div className="flex flex-col gap-3">{tpls.map(x => <div key={x.key}><TemplateEditor t={x} /><div className="meta mt-1 ml-1">{DEFAULT_TEMPLATES.find(d => d.key === x.key)?.when}</div></div>)}</div></div>
    </>;
  } else if (tab === "users") {
    const ms = await members(t);
    body = <div className="card"><h2>Users</h2><p className="meta mb-3">User codes (initials + number, e.g. MT1) are shown everywhere instead of names. A User can never delete, see the Activity Log or change settings.</p>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{ms.map(m => <tr key={m.id}><td><b>{m.userCode}</b></td><td>{m.user.name}</td><td>{m.user.email}</td><td>{m.role === "ADMIN" ? "Admin" : "User"}</td><td>{m.active ? "Active" : "Disabled"}</td></tr>)}</tbody></table></div>
      <h2 className="mt-5">Add user</h2><AddUserForm /></div>;
  } else if (tab === "org") {
    body = <div className="card"><h2>Organisation</h2><OrgForm org={t.org} /></div>;
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
