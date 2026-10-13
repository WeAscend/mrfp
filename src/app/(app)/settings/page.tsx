import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/tenant";
import { authorityMap, companies } from "@/lib/services/queries";
import { members, listHolidays } from "@/lib/services/org";
import { activity } from "@/lib/services/queries";
import { opts } from "@/lib/options";
import { FilterBar } from "@/components/listClient";
import { listForms, SOURCES } from "@/lib/services/forms";
import { FormUpload, FormMapper } from "./FormsAdmin";
import * as R from "@/lib/rules";
import { Empty } from "@/components/ui";
import { AuthorityRow, CompanyForm, AddUserForm, OrgForm, OutreachForm, OutreachSwitch, TemplateEditor, NewTemplateForm, DropdownEditor, DefaultOwnerSelect, HolidayAdmin } from "./SettingsClient";
import { templates } from "@/lib/services/comms";
import { PLACEHOLDERS, DEFAULT_TEMPLATES } from "@/lib/templates";
import { mailDriver } from "@/lib/mail";
import { smsDriver } from "@/lib/sms";
import { BinButton } from "@/components/actionsClient";
import { PageHead } from "@/components/PageHead";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; user?: string; entity?: string; ref?: string; from?: string; to?: string }> }) {
  const t = await requireAdmin(); const sp = await searchParams; const { tab = "users" } = sp;
  const tabs = [["users", "Users"], ["dropdowns", "Dropdown options"], ["templates", "Email templates"], ["authorities", "Holding Authorities & Companies"], ["holidays", "Public holidays"], ["forms", "PDF forms"], ["org", "Organisation"], ["activity", "Activity Log"], ["bin", "Bin"], ["outreach", "Outreach (later)"]];
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
  } else if (tab === "templates") {
    const tpls = await templates(t);
    body = <div className="card"><h2>Email templates</h2><p className="meta mb-3">MRFP fills these in from the record and shows them as text to copy or open in Outlook — it never sends. Plain text; placeholders: {PLACEHOLDERS.map(([k]) => <code key={k} className="mr-1.5">{k}</code>)}</p>
      <div className="flex flex-col gap-3">{tpls.map(x => { const d = DEFAULT_TEMPLATES.find(d => d.key === x.key); return <div key={x.key}><TemplateEditor t={x} custom={!d} />{d && <div className="meta mt-1 ml-1">{d.when}</div>}</div>; })}</div>
      <div className="mt-4"><NewTemplateForm /></div></div>;
  } else if (tab === "dropdowns") {
    body = <><p className="meta mb-3">The lists behind each dropdown. Lead Identifiers are fixed because the follow-up rules depend on them.</p><DropdownEditor current={opts(t.org)} /></>;
  } else if (tab === "holidays") {
    const rows = await listHolidays();
    body = <div className="card"><h2>Public holidays</h2><p className="meta mb-3">Business-day counts (A2A chase, Info-sent follow-up) skip the dates for the regions in Organisation › Public-holiday regions ({t.org.holidayRegions}). The bundled list covers 2026–2027; add each new year here when the states gazette their dates (usually mid-year).</p><HolidayAdmin rows={rows} /></div>;
  } else if (tab === "forms") {
    const forms = await listForms(t);
    body = <div className="card"><h2>Fillable PDF forms</h2><p className="meta mb-3">Upload an editable PDF (Authority to Act, Revenue NSW claim form, ASIC forms…), map its fields once, and every claim card gets a "Fill form" download with the client's details in it. The PDF stays editable; MT checks and signs as today (Decisions 6.5).</p>
      <FormUpload />
      <div className="flex flex-col gap-3 mt-5">{forms.map(f => <FormMapper key={f.id} f={f} sources={SOURCES} />)}{!forms.length && <Empty>No forms yet. Upload the first one above.</Empty>}</div></div>;
  } else if (tab === "activity") {
    const [rows, users] = await Promise.all([activity(t, sp), members(t)]);
    body = <div className="card"><h2>Activity Log</h2><p className="meta mb-3">Every add, edit and delete, read-only.</p>
      <div className="flex flex-wrap items-end gap-2.5 mb-3"><FilterBar base="/settings?tab=activity&" current={sp as Record<string, string>} filters={[{ key: "user", label: "User", options: [...users.map(u => [u.userCode, u.userCode]), ["Migration", "Migration"], ["Import", "Import"], ["System", "System"]] }, { key: "entity", label: "Entity", options: ["Client", "Claim", "Note", "File", "Holding Authority", "Originating Company", "User", "Template", "Holiday"].map(x => [x, x]) }]} dateRange={{ fromKey: "from", toKey: "to", label: "Date" }} /><span className="meta">{rows.length} entries (latest 300)</span></div>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Record</th><th>Field</th><th>Old value</th><th>New value</th></tr></thead><tbody>
        {rows.map(a => <tr key={String(a.id)}><td className="whitespace-nowrap">{a.timestamp.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{a.userCode}</td><td>{a.action.toLowerCase()}</td><td>{a.entityType}</td><td>{a.recordRef}</td><td>{a.field}</td><td className="max-w-[220px] truncate" title={a.oldValue ?? ""}>{a.oldValue}</td><td className="max-w-[260px] truncate" title={a.newValue ?? ""}>{a.newValue}</td></tr>)}
        {!rows.length && <tr><td colSpan={8}><Empty>No entries.</Empty></td></tr>}</tbody></table></div></div>;
  } else if (tab === "outreach") {
    body = <>
      <div className="warn-box mb-5">On hold (Decisions 4.3–4.5, 4.10): MRFP does not send email or SMS in the trial. These settings are kept for the marketing outreach to be discussed later.</div>
      <div className="card !py-4 mb-5"><OutreachSwitch on={t.org.outreachEnabled} /></div>
      <div className="card"><h2>Sender identity</h2><p className="meta mb-3">Email: <b>{mailDriver() === "resend" ? "connected (Resend)" : "not connected — messages are logged only"}</b> · SMS: <b>{smsDriver() === "twilio" ? "connected (Twilio)" : "not connected"}</b>. Every email carries these details and an unsubscribe link; every SMS ends with "Reply STOP to opt out".</p><OutreachForm org={t.org} /></div>
    </>;
  } else if (tab === "users") {
    const ms = await members(t);
    body = <div className="card"><h2>Users</h2><p className="meta mb-3">User codes (initials + number, e.g. MT1) are shown everywhere instead of names. A User can never delete, see the Activity Log or change settings.</p>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{ms.map(m => <tr key={m.id}><td><b>{m.userCode}</b></td><td>{m.user.name}</td><td>{m.user.email}</td><td>{m.role === "ADMIN" ? "Admin" : "User"}</td><td>{m.active ? "Active" : "Disabled"}</td></tr>)}</tbody></table></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><div><div className="font-semibold text-[14px]">Default owner for new records</div><div className="meta">Every new lead, import and migrated record is owned by this user; only an Admin can change Owner (Decisions 2.6).</div></div><DefaultOwnerSelect value={t.org.defaultOwnerCode} codes={ms.filter(m => m.active).map(m => m.userCode)} /></div>
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
  return <><PageHead title="Settings" lede="Users, dropdowns, templates, reference data, holidays, the Activity Log and the Bin. Admin only." /><div className="views mb-3.5">{tabs.map(([k, l]) => <Link key={k} href={`/settings?tab=${k}`} className={tab === k ? "on" : ""}>{l}</Link>)}</div>{body}</>;
}
