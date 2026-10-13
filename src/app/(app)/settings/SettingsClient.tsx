"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAuthorityAction, upsertCompanyAction, addMemberAction, updateOrgAction, startCheckoutAction, openBillingPortalAction, type ActionResult } from "@/actions";
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
export function PlanButtons({ enabled, plans, hasBilling }: { enabled: boolean; plans: { key: string; name: string; available: boolean }[]; hasBilling: boolean }) {
  const { toast } = useToast();
  if (!enabled) return <div className="meta">Billing is not connected yet. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the STRIPE_PRICE_* ids in the environment to turn on checkout — the plumbing (customer, checkout, webhook sync, seat limits) is already wired.</div>;
  return <div className="flex flex-wrap gap-2">{plans.map(p => <form key={p.key} action={async () => { const r = await startCheckoutAction(p.key); if (r && !r.ok) toast(r.error, "err"); }}><button className="btn btn-primary" disabled={!p.available}>Choose {p.name}</button></form>)}{hasBilling && <form action={async () => { const r = await openBillingPortalAction(); if (r && !r.ok) toast(r.error, "err"); }}><button className="btn">Manage billing</button></form>}</div>;
}
