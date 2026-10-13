"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFormAction, updateFormAction, removeFormAction, type ActionResult } from "@/actions";
import { useToast } from "@/components/Toast";
import type { FormTemplate } from "@/db/schema";
import type { PdfField, Source } from "@/lib/services/forms";

function useAct() { const { report } = useToast(); const router = useRouter(); const [pending, start] = useTransition(); return { pending, act: (fn: () => Promise<ActionResult>, after?: () => void) => start(async () => { if (report(await fn())) { router.refresh(); after?.(); } }) }; }

export function FormUpload() {
  const { act, pending } = useAct(); const ref = useRef<HTMLFormElement>(null);
  return <form ref={ref} className="flex flex-wrap items-end gap-2.5" onSubmit={e => { e.preventDefault(); act(() => addFormAction(new FormData(ref.current!)), () => ref.current?.reset()); }}>
    <label className="label">Form name<input name="name" className="input !w-[260px]" placeholder="e.g. Revenue NSW Claim Form" /></label>
    <label className="label">Used for<select name="scope" className="input !w-auto"><option value="CLAIM">A claim (client + claim fields)</option><option value="CLIENT">The client only</option></select></label>
    <label className="label">Editable PDF<input name="file" type="file" accept="application/pdf" className="block text-[14px]" required /></label>
    <button className="btn btn-primary" disabled={pending}>{pending ? "Reading fields…" : "Upload form"}</button>
  </form>;
}

export function FormMapper({ f, sources }: { f: FormTemplate; sources: Source[] }) {
  const fields = (f.fields || []) as PdfField[]; const [map, setMap] = useState<Record<string, string>>((f.mapping || {}) as Record<string, string>); const [open, setOpen] = useState(false); const [name, setName] = useState(f.name);
  const { act, pending } = useAct();
  const dirty = JSON.stringify(map) !== JSON.stringify(f.mapping || {}) || name !== f.name;
  const mapped = fields.filter(x => map[x.name] && map[x.name] !== "blank").length;
  const groups = Array.from(new Set(sources.map(s => s.group)));
  const set = (field: string, v: string) => setMap({ ...map, [field]: v });
  return <div className="card-plain">
    <div className="flex flex-wrap items-center gap-3"><button type="button" className="font-head font-semibold text-[16px] text-left" onClick={() => setOpen(o => !o)}>{open ? "▾" : "▸"} {f.name}</button><span className="chip chip-outline">{f.scope === "CLAIM" ? "claim" : "client"}</span><span className="meta">{mapped} of {fields.length} fields mapped · {f.fileName}</span><span className="flex-1" /><button className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (confirm(`Remove the form "${f.name}"?`)) act(() => removeFormAction(f.id)); }}>Remove</button></div>
    {open && <div className="mt-3">
      <label className="label mb-3">Name<input className="input !w-[320px]" value={name} onChange={e => setName(e.target.value)} /></label>
      <p className="meta mb-2">For each field in the PDF, choose what MRFP should write into it. "Fixed text" writes the same words every time.</p>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>PDF field</th><th>Type</th><th>Fill with</th><th>Fixed text</th></tr></thead><tbody>
        {fields.map(x => { const v = map[x.name] || ""; const isText = v.startsWith("text:"); return <tr key={x.name}><td className="font-mono text-[12.5px]">{x.name}</td><td className="meta">{x.type}{x.options ? ` (${x.options.join(" / ")})` : ""}</td>
          <td><select className="input !h-[30px] !w-[260px]" value={isText ? "text:" : v} onChange={e => set(x.name, e.target.value === "text:" ? "text:" : e.target.value)}><option value="">— not filled —</option>{groups.map(g => <optgroup key={g} label={g}>{sources.filter(s => s.group === g).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}<option value="text:">Fixed text…</option></select></td>
          <td>{isText && <input className="input !h-[30px]" value={v.slice(5)} onChange={e => set(x.name, "text:" + e.target.value)} placeholder={x.options ? x.options[0] : "Text to write"} />}</td></tr>; })}
      </tbody></table></div>
      <div className="flex gap-2 mt-3"><button className="btn btn-sm btn-primary" disabled={pending || !dirty} onClick={() => act(() => updateFormAction(f.id, { mapping: map, name }))}>Save mapping</button>{dirty && <button className="btn btn-sm" onClick={() => { setMap((f.mapping || {}) as Record<string, string>); setName(f.name); }}>Reset</button>}</div>
    </div>}
  </div>;
}
