"use client";
// Auto-saving fields: edit, blur/change, saved. Each one calls the matching server action and reports the result.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClientFieldAction, updateClaimFieldAction } from "@/actions";
import { useToast } from "./Toast";

type Base = { kind: "client" | "claim"; id: string; field: string; label?: string; className?: string; disabled?: boolean; onSaved?: () => void; hint?: string };

function useSave(kind: "client" | "claim", id: string) {
  const { report } = useToast(); const router = useRouter(); const [pending, start] = useTransition();
  const save = (field: string, value: unknown, after?: () => void) => start(async () => {
    const r = kind === "client" ? await updateClientFieldAction(id, field, value) : await updateClaimFieldAction(id, field, value);
    if (report(r)) { after?.(); router.refresh(); }
  });
  return { save, pending };
}

export function TextField({ kind, id, field, label, value, placeholder, type = "text", className, disabled, onSaved, list, hint }: Base & { value: string | null | undefined; placeholder?: string; type?: string; list?: string }) {
  const [v, setV] = useState(value ?? ""); const { save, pending } = useSave(kind, id);
  const commit = () => { if ((value ?? "") !== v) save(field, v, onSaved); };
  const input = <input type={type} className={`input ${pending ? "opacity-60" : ""}`} value={v} placeholder={placeholder} disabled={disabled} list={list} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter" && type !== "textarea") (e.target as HTMLInputElement).blur(); }} />;
  return label ? <label className={`label ${className ?? ""}`}>{label}{input}{hint && <span className="meta font-normal">{hint}</span>}</label> : input;
}
export function DateField(p: Base & { value: string | null | undefined }) {
  const [v, setV] = useState(p.value ?? ""); const { save, pending } = useSave(p.kind, p.id);
  const input = <input type="date" className={`input ${pending ? "opacity-60" : ""} ${p.label ? "" : p.className ?? ""}`} value={v} disabled={p.disabled} onChange={e => { setV(e.target.value); if (e.target.value !== (p.value ?? "")) save(p.field, e.target.value || null, p.onSaved); }} />;
  return p.label ? <label className={`label ${p.className ?? ""}`}>{p.label}{input}{p.hint && <span className="meta font-normal">{p.hint}</span>}</label> : input;
}
export function TextArea({ kind, id, field, label, value, rows = 2, placeholder, className, lines }: Base & { value: string | string[] | null | undefined; rows?: number; placeholder?: string; lines?: boolean }) {
  const init = Array.isArray(value) ? value.join("\n") : value ?? "";
  const [v, setV] = useState(init); const { save, pending } = useSave(kind, id);
  return <label className={`label ${className ?? ""}`}>{label}<textarea rows={rows} className={`input ${pending ? "opacity-60" : ""}`} placeholder={placeholder} value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== init) save(field, lines ? v.split("\n").map(s => s.trim()).filter(Boolean) : v); }} /></label>;
}
export function SelectField({ kind, id, field, label, value, options, blank, className, disabled, onSaved }: Base & { value: string | null | undefined; options: (string | { value: string; label: string })[]; blank?: string }) {
  const [v, setV] = useState(value ?? ""); const { save, pending } = useSave(kind, id);
  const sel = <select className={`input ${pending ? "opacity-60" : ""}`} value={v} disabled={disabled} onChange={e => { setV(e.target.value); save(field, e.target.value || null, onSaved); }}>
    {blank !== undefined && <option value="">{blank}</option>}
    {options.map(o => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
  return label ? <label className={`label ${className ?? ""}`}>{label}{sel}</label> : sel;
}
export function MoneyField(p: Base & { value: string | number | null | undefined; placeholder?: string }) {
  const n = p.value == null || p.value === "" ? "" : Number(p.value).toFixed(2);
  return <TextField {...p} value={n} placeholder={p.placeholder ?? "0.00"} />;
}
/** Multi-select rendered as lime chips (Special Condition). */
export function ChipMulti({ kind, id, field, label, value, options }: Base & { value: string[]; options: string[] }) {
  const [v, setV] = useState<string[]>(value); const { save } = useSave(kind, id);
  const toggle = (o: string) => { const nv = v.includes(o) ? v.filter(x => x !== o) : [...v, o]; setV(nv); save(field, options.filter(x => nv.includes(x))); };
  return <div className={`label`}>{label}<div className="flex flex-wrap gap-1.5">{options.map(o => <button type="button" key={o} className={`chip cursor-pointer ${v.includes(o) ? "chip-lime" : ""}`} onClick={() => toggle(o)} aria-pressed={v.includes(o)}>{o}</button>)}</div></div>;
}
export const Static = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => <div className={`label ${className ?? ""}`}>{label}<span className="value">{children ?? "—"}</span></div>;
