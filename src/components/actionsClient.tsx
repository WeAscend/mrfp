"use client";
// Small interactive controls that call server actions: Done, Chased, note box, lead identifier, A2A signed, progress, open claim, set inactive, new lead, file upload.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as A from "@/actions";
import * as R from "@/lib/rules";
import { useToast } from "./Toast";
import { useOptions } from "./Options";

function useAct() { const { report } = useToast(); const router = useRouter(); const [pending, start] = useTransition(); return { pending, act: (fn: () => Promise<A.ActionResult>, after?: (r: A.ActionResult) => void) => start(async () => { const r = await fn(); if (report(r)) { router.refresh(); after?.(r); } }) }; }

export function DoneButton({ kind, clientId, claimId }: { kind: "client" | "claim"; clientId: string; claimId?: string | null }) {
  const { act, pending } = useAct();
  return <button className="btn btn-sm" disabled={pending} onClick={() => act(() => A.followUpDoneAction(kind, clientId, claimId))}>Done</button>;
}
export function ChasedButton({ claimId, className }: { claimId: string; className?: string }) {
  const { act, pending } = useAct();
  return <button className={`btn btn-sm ${className ?? ""}`} disabled={pending} onClick={() => act(() => A.chasedAction(claimId))}>Chased</button>;
}
export function NoteBox({ clientId, claimId, placeholder, today }: { clientId: string; claimId?: string | null; placeholder?: string; today: string }) {
  const [text, setText] = useState(""); const [date, setDate] = useState(today); const { act, pending } = useAct();
  const save = () => { if (!text.trim()) return; act(() => A.addNoteAction(clientId, text, claimId, date), () => { setText(""); setDate(today); }); };
  return (
    <div>
      <textarea id={claimId ? `note-${claimId}` : "noteBox"} rows={3} className="input" placeholder={placeholder ?? "Type a note… Enter to save, Shift+Enter for a new line"} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }} disabled={pending} />
      <div className="flex flex-wrap items-center gap-3 mt-2"><button className="btn btn-sm btn-primary" onClick={save} disabled={pending || !text.trim()}>Save note</button><label className="meta flex items-center gap-2">Dated <input type="date" className="input !h-8 !w-auto text-[13px]" value={date} onChange={e => setDate(e.target.value)} /></label><span className="meta">A note you write updates Last Contact.</span></div>
    </div>
  );
}
export function NoteDate({ noteId, value }: { noteId: string; value: string }) {
  const { act } = useAct();
  return <input type="date" defaultValue={value} className="bg-transparent border-0 text-[13px] text-ink3 w-[120px]" title="Edit note date" onChange={e => e.target.value && act(() => A.updateNoteDateAction(noteId, e.target.value))} />;
}
export function LeadIdentifierSelect({ clientId, value }: { clientId: string; value: string | null }) {
  const { act, pending } = useAct();
  return <select className="input min-w-[250px]" defaultValue={value ?? ""} disabled={pending} onChange={e => act(() => A.setLeadIdentifierAction(clientId, e.target.value || null))}><option value="">(none)</option>{R.LEAD_IDENTIFIERS.map(i => <option key={i}>{i}</option>)}</select>;
}
export function A2ASignedField({ clientId, value, label = "A2A Signed & Received" }: { clientId: string; value: string | null; label?: string }) {
  const { act, pending } = useAct(); const { toast } = useToast();
  return <label className="label">{label}<input type="date" className="input" defaultValue={value ?? ""} disabled={pending} onChange={e => act(() => A.setA2ASignedAction(clientId, e.target.value || null), r => { if (r.ok && (r.data as { becameActive?: boolean })?.becameActive) toast("Lead is now Active and has a Client Code"); })} /></label>;
}
export function ProgressSelect({ claimId, value, org }: { claimId: string; value: number | null; org: string }) {
  const { act, pending } = useAct();
  return <select className="input" defaultValue={value ?? ""} disabled={pending} onChange={e => act(() => A.setProgressAction(claimId, e.target.value ? Number(e.target.value) : null))}><option value="">(blank)</option>{R.STEPS.map(([n, l]) => <option key={n} value={n}>{n} · {l.replace("{ORG}", org)}</option>)}</select>;
}
export function OpenClaimForm({ clientId, authorities, disabledReason }: { clientId: string; authorities: { id: string; name: string; code: string | null }[]; disabledReason?: string }) {
  const [ha, setHa] = useState(""); const { act, pending } = useAct(); const router = useRouter();
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <select className="input !w-auto" value={ha} onChange={e => setHa(e.target.value)} disabled={!!disabledReason}><option value="">Holding Authority…</option>{authorities.map(a => <option key={a.id} value={a.id}>{a.name}{a.code ? "" : " (no code)"}</option>)}</select>
      <button className="btn btn-primary" disabled={!!disabledReason || !ha || pending} title={disabledReason} onClick={() => act(() => A.openClaimAction(clientId, ha), r => { const k = r.ok ? (r.data as { id: string; claimId: string }) : null; if (k) router.push(`/clients/${clientId}?tab=claims&claim=${k.id}`); })}>Open new claim</button>
      {disabledReason && <span className="meta">{disabledReason}</span>}
    </div>
  );
}
export function SetInactiveButton({ clientId, openClaims, name }: { clientId: string; openClaims: number; name: string }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [step, setStep] = useState(21); const { act, pending } = useAct(); const O = useOptions();
  return (
    <>
      <button className="btn btn-sm btn-danger" onClick={() => setOpen(true)}>Set Inactive</button>
      {open && <Modal title={`Set ${name} Inactive`} onClose={() => setOpen(false)}>
        {openClaims > 0 ? <><p className="mb-2">{openClaims} open claim{openClaims > 1 ? "s" : ""} will be closed. Which closing status applies?</p><label className="label">Closing status<select className="input" value={step} onChange={e => setStep(Number(e.target.value))}>{R.MANUAL_CLOSE_OPTIONS.map(s => <option key={s} value={s}>{s} · {R.stepName(s)}</option>)}</select></label></> : <p className="meta">No open claims.</p>}
        <label className="label mt-3">Inactive Reason<select className="input" value={reason} onChange={e => setReason(e.target.value)}><option value="">(leave blank)</option>{O.inactiveReasons.filter(r => r !== "Completed").map(r => <option key={r}>{r}</option>)}</select></label>
        <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-danger" disabled={pending} onClick={() => act(() => A.setInactiveAction(clientId, reason || null, step), () => setOpen(false))}>Set Inactive</button></div>
      </Modal>}
    </>
  );
}
export function NewLeadButton() {
  const O = useOptions(); const [open, setOpen] = useState(false); const [f, setF] = useState({ clientType: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS", surname: "", firstName: "", businessName: "", source: O.sources[0], leadAmount: "", phoneMobile: "", email: "", addressOnUCM: "" });
  const { act, pending } = useAct(); const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>New lead</button>
      {open && <Modal title="New lead" onClose={() => setOpen(false)}>
        <div className="grid2">
          <label className="label">Client Type<select className="input" value={f.clientType} onChange={set("clientType")}><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select></label>
          <label className="label">Source<select className="input" value={f.source} onChange={set("source")}>{O.sources.map(s => <option key={s}>{s}</option>)}</select></label>
          {f.clientType === "BUSINESS" ? <label className="label span2">Business name<input className="input" value={f.businessName} onChange={set("businessName")} /></label> : <><label className="label">Surname<input className="input" value={f.surname} onChange={set("surname")} /></label><label className="label">First Name<input className="input" value={f.firstName} onChange={set("firstName")} /></label></>}
          <label className="label">Lead Amount (estimate)<input className="input" placeholder="$0.00" value={f.leadAmount} onChange={set("leadAmount")} /></label>
          <label className="label">Phone - Mobile<input className="input" value={f.phoneMobile} onChange={set("phoneMobile")} /></label>
          <label className="label">Email<input className="input" value={f.email} onChange={set("email")} /></label>
          <label className="label">Address on UCM<input className="input" value={f.addressOnUCM} onChange={set("addressOnUCM")} /></label>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending} onClick={() => act(() => A.createLeadAction(f), r => { setOpen(false); const c = r.ok ? (r.data as { id: string }) : null; if (c) router.push(`/clients/${c.id}`); })}>Create lead</button></div>
      </Modal>}
    </>
  );
}
export function FileUpload({ clientId, claimId, label = "Add file", accept, compact }: { clientId: string; claimId?: string | null; label?: string; accept?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null); const { act, pending } = useAct(); const [drag, setDrag] = useState(false);
  const send = (files: FileList | null) => { if (!files?.length) return; for (const file of Array.from(files)) { const fd = new FormData(); fd.set("clientId", clientId); if (claimId) fd.set("claimId", claimId); fd.set("file", file); act(() => A.uploadFileAction(fd)); } };
  return (
    <>
      <input ref={ref} type="file" hidden multiple={!claimId} accept={accept} onChange={e => { send(e.target.files); e.target.value = ""; }} />
      {compact ? <button className="btn btn-sm" disabled={pending} onClick={() => ref.current?.click()}>{pending ? "Uploading…" : label}</button>
        : <div role="button" tabIndex={0} onClick={() => ref.current?.click()} onKeyDown={e => e.key === "Enter" && ref.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }} className={`border border-dashed rounded-xl p-4 text-center meta cursor-pointer ${drag ? "border-lime bg-lime-soft" : "border-line hover:border-ink3"}`}>{pending ? "Uploading…" : label}</div>}
    </>
  );
}
export function AddA2AButton({ claimId, today }: { claimId: string; today: string }) {
  const [open, setOpen] = useState(false); const [sent, setSent] = useState(today); const [reason, setReason] = useState(""); const { act, pending } = useAct(); const O = useOptions();
  return <>
    <button className="btn btn-sm" onClick={() => setOpen(true)}>+ Add A2A</button>
    {open && <Modal title="Add A2A entry" onClose={() => setOpen(false)}>
      <p className="meta mb-3">Re-sending the Authority to Act for this same claim (e.g. a new address found, or ASIC requires its own copy). A newly found amount is opened as a new claim instead.</p>
      <div className="grid2"><label className="label">Sent<input type="date" className="input" value={sent} onChange={e => setSent(e.target.value)} /></label><label className="label">Reason<select className="input" value={reason} onChange={e => setReason(e.target.value)}><option value="">(optional)</option>{O.a2aReasons.map(r => <option key={r}>{r}</option>)}</select></label></div>
      <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending || !sent} onClick={() => act(() => A.addA2AEntryAction(claimId, sent, reason || null), () => setOpen(false))}>Add</button></div>
    </Modal>}
  </>;
}
export function A2ASignedInput({ entryId, value }: { entryId: string; value: string | null }) {
  const { act } = useAct();
  return <input type="date" className="input !h-[30px] !w-[150px] text-[13px]" defaultValue={value ?? ""} title="Signed & Received" onChange={e => act(() => A.setA2AEntryAction(entryId, { signed: e.target.value || null }))} />;
}
export function AddResubmissionButton({ claimId, today }: { claimId: string; today: string }) {
  const [open, setOpen] = useState(false); const [d, setD] = useState(today); const { act, pending } = useAct();
  return <>
    <button className="btn btn-sm" onClick={() => setOpen(true)}>+ Add resubmission</button>
    {open && <Modal title="Add resubmission" onClose={() => setOpen(false)}><label className="label">Date Resubmitted<input type="date" className="input" value={d} onChange={e => setD(e.target.value)} /></label><p className="meta mt-2">Sets Claim Progress to 9 · Resent to Holding Authority and restarts the authority follow-up clock.</p><div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending} onClick={() => act(() => A.addResubmissionAction(claimId, d), () => setOpen(false))}>Add</button></div></Modal>}
  </>;
}
export function MultiLink({ label, value, options, target, id }: { label: string; value: string[]; options: { id: string; name: string }[]; target: "companies" | "joint" | "related"; id: string }) {
  const { act } = useAct();
  const onSave = (ids: string[]) => target === "companies" ? A.setClaimCompaniesAction(id, ids) : target === "joint" ? A.setJointOwnersAction(id, ids) : A.setRelatedAction(id, ids);
  return <label className="label">{label}<select multiple size={Math.min(5, Math.max(3, options.length))} className="input !h-auto" defaultValue={value} onChange={e => act(() => onSave(Array.from(e.target.selectedOptions).map(o => o.value)))}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select><span className="meta font-normal">Ctrl/Cmd-click to pick several</span></label>;
}
export function AddSearchButton({ clientId, authorities, today }: { clientId: string; authorities: string[]; today: string }) {
  const [open, setOpen] = useState(false); const [d, setD] = useState(today); const [sel, setSel] = useState<string[]>([]); const { act, pending } = useAct();
  return <>
    <button className="btn btn-sm" onClick={() => setOpen(true)}>Add search</button>
    {open && <Modal title="Add search" onClose={() => setOpen(false)}><label className="label">Date searched<input type="date" className="input" value={d} onChange={e => setD(e.target.value)} /></label><div className="label mt-3">Found at<div className="flex flex-wrap gap-1.5">{authorities.map(a => <button key={a} type="button" className={`chip cursor-pointer ${sel.includes(a) ? "chip-lime" : ""}`} onClick={() => setSel(s => s.includes(a) ? s.filter(x => x !== a) : [...s, a])}>{a}</button>)}</div></div><div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending} onClick={() => act(() => A.addSearchLogAction(clientId, d, sel), () => { setOpen(false); setSel([]); })}>Add</button></div></Modal>}
  </>;
}
export function BinButton({ kind, id, restore }: { kind: "client" | "claim"; id: string; restore?: boolean }) {
  const { act, pending } = useAct(); const [confirm, setConfirm] = useState(false); const router = useRouter();
  if (restore) return <button className="btn btn-sm" disabled={pending} onClick={() => act(() => kind === "client" ? A.binClientAction(id, true) : A.binClaimAction(id, true))}>Restore</button>;
  return confirm ? <span className="inline-flex gap-1"><button className="btn btn-sm btn-danger" disabled={pending} onClick={() => act(() => kind === "client" ? A.binClientAction(id) : A.binClaimAction(id), () => { if (kind === "client") router.push("/clients"); })}>Confirm delete</button><button className="btn btn-sm" onClick={() => setConfirm(false)}>Cancel</button></span>
    : <button className="btn btn-sm btn-danger" onClick={() => setConfirm(true)}>Delete</button>;
}
export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 bg-[rgba(6,30,51,.55)] flex items-center justify-center p-4 z-40" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
    <div className="bg-bg border border-line rounded-2xl p-6 w-full max-w-[560px] shadow-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}><h2>{title}</h2>{children}</div>
  </div>;
}
