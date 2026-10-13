"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTemplateAction, createTemplateAction, deleteTemplateAction, addHolidayAction, removeHolidayAction, updateAuthorityAction, upsertCompanyAction, addMemberAction, updateOrgAction, type ActionResult } from "@/actions";
import { OPTION_SETS, type Options } from "@/lib/options";
import type { HoldingAuthority, OriginatingCompany, Organisation } from "@/db/schema";
import { useToast } from "@/components/Toast";

function useAct() { const { report } = useToast(); const router = useRouter(); const [pending, start] = useTransition(); return { pending, act: (fn: () => Promise<ActionResult>, after?: () => void) => start(async () => { if (report(await fn())) { router.refresh(); after?.(); } }) }; }

export function AuthorityRow({ a, claims }: { a: HoldingAuthority; claims: number }) {
  const { act } = useAct();
  const save = (patch: Parameters<typeof updateAuthorityAction>[1]) => act(() => updateAuthorityAction(a.id, patch));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  return <tr><td>{a.name}</td>
    <td><input className="input !h-[30px] !w-[52px]" defaultValue={a.code ?? ""} maxLength={1} onBlur={e => e.target.value.toUpperCase() !== (a.code ?? "") && save({ code: e.target.value })} aria-label={`${a.name} code`} /></td>
    <td className="num"><input className="input !h-[30px] !w-[72px] text-right" defaultValue={a.chaseAfter ?? ""} onBlur={e => numOrNull(e.target.value) !== a.chaseAfter && save({ chaseAfter: numOrNull(e.target.value) })} aria-label="Chase after" /></td>
    <td className="num"><input className="input !h-[30px] !w-[72px] text-right" defaultValue={a.rechaseAfter ?? ""} onBlur={e => numOrNull(e.target.value) !== a.rechaseAfter && save({ rechaseAfter: numOrNull(e.target.value) })} aria-label="Re-chase after" /></td>
    <td><input className="input !h-[30px]" defaultValue={a.details ?? ""} onBlur={e => e.target.value !== (a.details ?? "") && save({ details: e.target.value })} aria-label="Processing details" /></td>
    <td><input className="input !h-[30px] !w-[200px]" defaultValue={a.emails?.[0] ?? ""} placeholder="claims@…" onBlur={e => e.target.value !== (a.emails?.[0] ?? "") && save({ emails: e.target.value.trim() ? [e.target.value.trim()] : [] })} aria-label="Chase email" /></td>
    <td className="num">{claims}</td></tr>;
}
export function CompanyForm({ o }: { o?: OriginatingCompany }) {
  const [f, setF] = useState({ name: o?.name ?? "", previousNames: (o?.previousNames ?? []).join(", "), mailingAddress: o?.mailingAddress ?? "", details: o?.details ?? "" });
  const { act, pending } = useAct();
  const save = () => act(() => upsertCompanyAction({ id: o?.id, name: f.name, previousNames: f.previousNames.split(",").map(s => s.trim()).filter(Boolean), mailingAddress: f.mailingAddress || null, details: f.details || null }), () => { if (!o) setF({ name: "", previousNames: "", mailingAddress: "", details: "" }); });
  const I = (k: keyof typeof f, ph: string) => <input className="input !h-[30px]" placeholder={ph} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} onBlur={() => o && f.name && save()} aria-label={ph} />;
  if (o) return <tr><td>{I("name", "Name")}</td><td>{I("previousNames", "Comma-separated")}</td><td>{I("mailingAddress", "Mailing address")}</td><td>{I("details", "Processing details")}</td><td></td></tr>;
  return <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end"><label className="label text-[12px]">New company{I("name", "Name")}</label><label className="label text-[12px]">Previous names{I("previousNames", "Comma-separated")}</label><label className="label text-[12px]">Mailing address{I("mailingAddress", "Reply Paid / GPO Box")}</label><label className="label text-[12px]">Details{I("details", "Process notes")}</label><button className="btn btn-sm" disabled={pending || !f.name.trim()} onClick={save}>Add</button></div>;
}
export function AddUserForm() {
  const [f, setF] = useState({ name: "", email: "", userCode: "", role: "USER" as "USER" | "ADMIN", password: "" }); const { act, pending } = useAct();
  return <div className="grid2 max-w-[640px]">
    <label className="label">Name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label><label className="label">User code<input className="input" placeholder="e.g. JS2" value={f.userCode} onChange={e => setF({ ...f, userCode: e.target.value.toUpperCase() })} /></label>
    <label className="label">Email<input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label><label className="label">Role<select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value as "USER" | "ADMIN" })}><option value="USER">User</option><option value="ADMIN">Admin</option></select></label>
    <label className="label">Temporary password<input className="input" type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /><span className="meta font-normal">10+ characters; tell them to change it</span></label>
    <div className="flex items-end"><button className="btn btn-primary" disabled={pending || !f.name || !f.email || !f.userCode || f.password.length < 10} onClick={() => act(() => addMemberAction(f), () => setF({ name: "", email: "", userCode: "", role: "USER", password: "" }))}>Add user</button></div>
  </div>;
}
export function OrgForm({ org }: { org: Organisation }) {
  const [f, setF] = useState({ name: org.name, shortName: org.shortName, holidayRegions: org.holidayRegions, gstRate: String(org.gstRate), a2aChaseBusinessDays: org.a2aChaseBusinessDays, revisitMonths: org.revisitMonths }); const { act, pending } = useAct();
  return <div className="grid2 max-w-[720px]">
    <label className="label">Organisation name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label><label className="label">Short name<input className="input" maxLength={6} value={f.shortName} onChange={e => setF({ ...f, shortName: e.target.value.toUpperCase() })} /><span className="meta font-normal">Used in labels like "{f.shortName || "MRF"} Invoice Sent"</span></label>
    <label className="label">Public-holiday regions<input className="input" value={f.holidayRegions} onChange={e => setF({ ...f, holidayRegions: e.target.value })} /><span className="meta font-normal">Comma list of NAT, NSW, VIC, QLD, SA, WA, TAS, ACT, NT — business days skip these</span></label><label className="label">GST rate %<input className="input" value={f.gstRate} onChange={e => setF({ ...f, gstRate: e.target.value })} /></label>
    <label className="label">A2A chase after (business days)<input className="input" type="number" value={f.a2aChaseBusinessDays} onChange={e => setF({ ...f, a2aChaseBusinessDays: Number(e.target.value) })} /></label><label className="label">Revisit leads after (months)<input className="input" type="number" value={f.revisitMonths} onChange={e => setF({ ...f, revisitMonths: Number(e.target.value) })} /></label>
    <div><button className="btn btn-primary" disabled={pending} onClick={() => act(() => updateOrgAction(f))}>Save</button></div>
  </div>;
}

export function OutreachSwitch({ on }: { on: boolean }) {
  const { act, pending } = useAct();
  return <label className="flex items-center gap-3 text-[15px]"><input type="checkbox" className="w-4 h-4" checked={on} disabled={pending} onChange={e => act(() => updateOrgAction({ outreachEnabled: e.target.checked }))} /><span><b>Outreach is {on ? "on" : "off"}.</b> <span className="meta">{on ? "Email, SMS and e-signature buttons are shown across the app." : "Send buttons are hidden; calls, consent and follow-ups still work. Switch on when your sending address is set up."}</span></span></label>;
}
export function OutreachForm({ org }: { org: Organisation }) {
  const [f, setF] = useState({ fromEmail: org.fromEmail ?? "", replyTo: org.replyTo ?? "", postalAddress: org.postalAddress ?? "", phone: org.phone ?? "", website: org.website ?? "", smsSenderId: org.smsSenderId ?? "", infoFollowUpDays: org.infoFollowUpDays });
  const { act, pending } = useAct(); const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return <div className="flex flex-col gap-3.5">
    <div className="grid2">
      <label className="label">From email<input className="input" value={f.fromEmail} onChange={set("fromEmail")} placeholder="hello@myrefundfinder.com.au" /><span className="meta font-normal">Must be on a domain verified with the email provider.</span></label>
      <label className="label">Reply-to<input className="input" value={f.replyTo} onChange={set("replyTo")} placeholder="defaults to the sender's own email" /></label>
      <label className="label">Phone<input className="input" value={f.phone} onChange={set("phone")} /></label>
      <label className="label">Website<input className="input" value={f.website} onChange={set("website")} /></label>
      <label className="label span2">Postal address<input className="input" value={f.postalAddress} onChange={set("postalAddress")} placeholder="Shown in the footer of every email (Spam Act sender identification)" /></label>
      <label className="label">SMS sender name<input className="input" value={f.smsSenderId} onChange={set("smsSenderId")} maxLength={11} placeholder="MRF" /></label>
      <label className="label">Follow-up after Info sent (business days)<input className="input !w-[120px]" type="number" value={f.infoFollowUpDays} onChange={e => setF({ ...f, infoFollowUpDays: Number(e.target.value) })} /><span className="meta font-normal">Picking "Info sent - waiting on response" sets Follow Up = Info Email Sent + this many business days (Decisions 4.7).</span></label>
    </div>
    <div><button className="btn btn-primary" disabled={pending} onClick={() => act(() => updateOrgAction({ ...f, fromEmail: f.fromEmail || null, replyTo: f.replyTo || null, postalAddress: f.postalAddress || null, phone: f.phone || null, website: f.website || null, smsSenderId: f.smsSenderId || null }))}>Save outreach settings</button></div>
  </div>;
}
export function TemplateEditor({ t, custom }: { t: { key: string; name: string; channel: string; subject: string | null; body: string; active: boolean }; custom?: boolean }) {
  const [subject, setSubject] = useState(t.subject ?? ""); const [body, setBody] = useState(t.body); const [name, setName] = useState(t.name); const [open, setOpen] = useState(false); const { act, pending } = useAct();
  const dirty = subject !== (t.subject ?? "") || body !== t.body || name !== t.name;
  return <div className="card-plain">
    <div className="flex flex-wrap items-center gap-3"><button type="button" className="font-head font-semibold text-[16px] text-left" onClick={() => setOpen(o => !o)}>{open ? "▾" : "▸"} {t.name}</button>{custom && <span className="chip chip-outline">custom</span>}<span className="flex-1" /><label className="flex gap-2 items-center text-[14px]"><input type="checkbox" checked={t.active} onChange={e => act(() => updateTemplateAction(t.key, { active: e.target.checked }))} /> Active</label></div>
    {open && <div className="mt-3 flex flex-col gap-3">
      <label className="label">Name<input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
      {t.channel === "EMAIL" && <label className="label">Subject<input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></label>}
      <label className="label">Body<textarea className="input !text-[13.5px]" rows={t.channel === "SMS" ? 4 : 12} value={body} onChange={e => setBody(e.target.value)} /></label>
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending || !dirty} onClick={() => act(() => updateTemplateAction(t.key, { subject: t.channel === "EMAIL" ? subject : null, body, name }))}>Save</button>{dirty && <button className="btn btn-sm" onClick={() => { setSubject(t.subject ?? ""); setBody(t.body); setName(t.name); }}>Reset</button>}{custom && <button className="btn btn-sm btn-danger ml-auto" disabled={pending} onClick={() => { if (confirm(`Delete the template "${t.name}"?`)) act(() => deleteTemplateAction(t.key)); }}>Delete</button>}</div>
    </div>}
  </div>;
}

export function NewTemplateForm() {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const { act, pending } = useAct();
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Add a template</button>;
  return <div className="card-plain flex flex-col gap-3">
    <label className="label">Name<input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Deceased estate — executor letter" /></label>
    <label className="label">Subject<input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></label>
    <label className="label">Body<textarea className="input !text-[13.5px]" rows={8} value={body} onChange={e => setBody(e.target.value)} placeholder="Hi {{firstName}}, …" /></label>
    <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending || !name.trim() || !body.trim()} onClick={() => act(() => createTemplateAction({ name, subject, body }), () => { setOpen(false); setName(""); setSubject(""); setBody(""); })}>Add template</button><button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
  </div>;
}
export function DropdownEditor({ current }: { current: Options }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(OPTION_SETS.map(s => [s.key, current[s.key].join("\n")]))); const { act, pending } = useAct();
  const save = (key: string) => { const list = vals[key].split("\n").map(x => x.trim()).filter(Boolean); act(() => updateOrgAction({ options: { ...Object.fromEntries(OPTION_SETS.map(s => [s.key, current[s.key]])), [key]: list } })); };
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{OPTION_SETS.map(s => <div key={s.key} className="card-plain">
    <div className="font-head font-semibold">{s.label}</div><div className="meta mb-2">{s.help} One per line; order is the order shown.</div>
    <textarea className="input !text-[13.5px]" rows={Math.min(10, Math.max(4, vals[s.key].split("\n").length + 1))} value={vals[s.key]} onChange={e => setVals({ ...vals, [s.key]: e.target.value })} />
    <div className="flex gap-2 mt-2"><button className="btn btn-sm btn-primary" disabled={pending || vals[s.key] === current[s.key].join("\n")} onClick={() => save(s.key)}>Save</button><button className="btn btn-sm" onClick={() => setVals({ ...vals, [s.key]: s.defaults.join("\n") })}>Reset to built-in</button></div>
  </div>)}</div>;
}
export function DefaultOwnerSelect({ value, codes }: { value: string | null; codes: string[] }) {
  const { act, pending } = useAct();
  return <select className="input !w-auto" value={value ?? ""} disabled={pending} onChange={e => act(() => updateOrgAction({ defaultOwnerCode: e.target.value || null }))}><option value="">(whoever creates the record)</option>{codes.map(c => <option key={c}>{c}</option>)}</select>;
}
export function HolidayAdmin({ rows }: { rows: { date: string; region: string; name: string }[] }) {
  const [f, setF] = useState({ date: "", region: "NAT", name: "" }); const [year, setYear] = useState(String(new Date().getFullYear())); const { act, pending } = useAct();
  const years = Array.from(new Set(rows.map(r => r.date.slice(0, 4)))).sort();
  const shown = rows.filter(r => r.date.startsWith(year));
  return <div>
    <div className="flex flex-wrap items-end gap-2.5 mb-3">
      <label className="label">Year<select className="input !w-auto" value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
      <span className="flex-1" />
      <label className="label">Date<input type="date" className="input !w-[160px]" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <label className="label">Region<select className="input !w-auto" value={f.region} onChange={e => setF({ ...f, region: e.target.value })}>{["NAT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"].map(r => <option key={r}>{r}</option>)}</select></label>
      <label className="label">Name<input className="input !w-[220px]" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. King's Birthday" /></label>
      <button className="btn btn-sm btn-primary" disabled={pending || !f.date} onClick={() => act(() => addHolidayAction(f), () => setF({ date: "", region: "NAT", name: "" }))}>Add holiday</button>
    </div>
    <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Date</th><th>Region</th><th>Name</th><th></th></tr></thead><tbody>
      {shown.map(r => <tr key={r.date + r.region}><td className="whitespace-nowrap">{r.date.split("-").reverse().join("/")}</td><td>{r.region}</td><td>{r.name}</td><td className="text-right"><button className="btn btn-sm btn-danger" disabled={pending} onClick={() => act(() => removeHolidayAction(r.date, r.region))}>Remove</button></td></tr>)}
      {!shown.length && <tr><td colSpan={4} className="meta">No holidays loaded for {year} — add them above.</td></tr>}
    </tbody></table></div>
  </div>;
}
