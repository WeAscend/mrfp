"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewImportAction, runImportAction } from "@/actions";
import type { PreviewRow } from "@/lib/services/leadImport";
import * as R from "@/lib/rules";
import { useOptions } from "@/components/Options";
import { useToast } from "@/components/Toast";

export function ImportWizard({ userCode }: { userCode: string }) {
  const O = useOptions(); const [text, setText] = useState(""); const [source, setSource] = useState(O.sources[0]); const [preview, setPreview] = useState<{ rows: PreviewRow[]; missing: string[]; errors: string[] } | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set()); const [pending, start] = useTransition(); const { report, toast } = useToast(); const router = useRouter();
  const doPreview = (t = text) => start(async () => { const r = await previewImportAction(t); if (report(r) && r.ok) { setPreview(r.data as typeof preview); setSkip(new Set()); } });
  const onFile = async (f: File | undefined) => { if (!f) return; const t = await f.text(); setText(t); doPreview(t); };
  const toImport = preview ? preview.rows.length - preview.rows.filter(r => skip.has(r.index)).length : 0;
  const run = () => start(async () => { const r = await runImportAction(text, source, [...skip]); if (report(r) && r.ok) { toast(`${(r.data as { n: number }).n} leads imported as ${userCode}`); router.push("/leads?id=New%20import"); } });
  return (
    <div className="flex flex-wrap gap-5 items-start">
      <section className="card flex-1 basis-[380px] min-w-0"><h2>File</h2>
        <p className="meta mb-3">Fixed columns with a header row (Surname, First Name, Middle Name, Search Results, Amount, Last Contact Date, Notes, Status, Address on UCM, Special Condition, Email, Phone - Mobile, Phone - Other, DOB, ABN, Current Address, Previous Address 1-3, Attachments). Values import exactly: amounts with cents, surnames in capitals, register addresses as written.</p>
        <input type="file" accept=".csv,text/csv" className="block mb-3 text-[14px]" onChange={e => onFile(e.target.files?.[0])} />
        <textarea className="input font-mono text-[12px] whitespace-pre" rows={8} placeholder="…or paste the CSV here" value={text} onChange={e => setText(e.target.value)} />
        <div className="flex flex-wrap items-end gap-2.5 mt-3"><label className="label text-[12px]">Source for this batch<select className="input !w-auto" value={source} onChange={e => setSource(e.target.value)}>{O.sources.map(s => <option key={s}>{s}</option>)}</select></label><button className="btn" disabled={pending || !text.trim()} onClick={() => doPreview()}>Preview</button></div>
        {preview?.missing.length ? <div className="warn-box mt-3">Missing columns: {preview.missing.join(", ")}. Check the header row.</div> : null}
        {preview?.errors.length ? <div className="warn-box mt-3">{preview.errors.slice(0, 5).join(" · ")}</div> : null}
      </section>
      <section className="card flex-1 basis-[560px] min-w-0">
        <div className="flex justify-between items-center gap-3 mb-3"><h2 className="!mb-0">Preview{preview ? ` - ${preview.rows.length} rows` : ""}</h2><button className="btn btn-primary" disabled={pending || !preview || !toImport} onClick={run}>Import {toImport} lead{toImport === 1 ? "" : "s"}</button></div>
        <p className="meta mb-3">Each row becomes a Lead (Stage = Lead, Lead Identifier = New import, Owner = {userCode}). Possible duplicates (same surname + first name, not case-sensitive) are flagged for you to accept or skip. Nothing is blocked or merged automatically.</p>
        {preview ? <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Import</th><th>Name</th><th>Type</th><th className="num">Amount</th><th>Found at</th><th>Special</th><th>Flags</th></tr></thead><tbody>
          {preview.rows.map(r => <tr key={r.index} className={r.duplicates.length ? "over" : ""}>
            <td><input type="checkbox" checked={!skip.has(r.index)} onChange={e => setSkip(s => { const n = new Set(s); if (e.target.checked) n.delete(r.index); else n.add(r.index); return n; })} aria-label={`Import ${r.name}`} /></td>
            <td><b>{r.name}</b>{r.lead.dob && <><br /><small className="meta">DOB {R.fmtDate(r.lead.dob)}</small></>}{(r.lead.phoneMobile || r.lead.phoneOther) && <><br /><small className="meta">{r.lead.phoneMobile || r.lead.phoneOther}</small></>}</td>
            <td>{r.lead.clientType === "BUSINESS" ? "Business" : "Individual"}</td><td className="num">{R.money(r.lead.leadAmount)}</td><td>{r.lead.searchAuthorities.join(", ")}</td><td>{r.lead.specialConditions.map(s => <span key={s} className="chip chip-lime mr-1">{s}</span>)}</td>
            <td className="space-x-1">{r.duplicates.map(d => <span key={d} className="chip chip-red">Possible duplicate of {d}</span>)}{r.flags.map(f => <span key={f} className="chip chip-amber">{f}</span>)}{r.lead.previousAddresses.length > 0 && <span className="meta">{r.lead.previousAddresses.length} previous addresses</span>}{r.lead.lastContact && <span className="meta"> Last contact {R.fmtDate(r.lead.lastContact)}</span>}</td>
          </tr>)}
        </tbody></table></div> : <div className="meta text-center p-6">Choose or paste a file, then Preview.</div>}
      </section>
    </div>
  );
}
