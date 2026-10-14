"use client";
// Australian date box (Decisions 2.1): shows and accepts DD/MM/YYYY whatever the browser's locale. Typing 14/10/2026,
// 14-10-26 or 14.10.2026 all work; the calendar button opens the native picker. Value in and out is ISO (YYYY-MM-DD).
import { useEffect, useRef, useState } from "react";

export const isoToDMY = (iso: string | null | undefined) => iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
export function dmyToIso(s: string): string | null | undefined {
  const t = s.trim(); if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; // ISO pasted in is fine too
  const m = t.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/); if (!m) return undefined;
  let y = Number(m[3]); if (m[3].length === 2) y += y < 50 ? 2000 : 1900;
  const mo = Number(m[2]), d = Number(m[1]); if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const chk = new Date(iso + "T00:00:00Z"); if (isNaN(chk.getTime()) || chk.getUTCDate() !== d) return undefined;
  return iso;
}

export function DateInput({ value, onChange, className, disabled, title, placeholder = "DD/MM/YYYY", bare, id, name }: { value: string | null | undefined; onChange: (iso: string) => void; className?: string; disabled?: boolean; title?: string; placeholder?: string; bare?: boolean; id?: string; name?: string }) {
  const [text, setText] = useState(isoToDMY(value)); const [bad, setBad] = useState(false); const native = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(isoToDMY(value)); setBad(false); }, [value]);
  const commit = () => { const iso = dmyToIso(text); if (iso === undefined) { setBad(true); return; } setBad(false); const next = iso ?? ""; setText(isoToDMY(next)); if (next !== (value ?? "")) onChange(next); };
  const openPicker = () => { const n = native.current; if (!n) return; n.value = value ?? ""; try { (n as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { n.click(); } };
  return <span className={`relative inline-flex items-center ${bare ? "" : "w-full"}`}>
    <input id={id} name={name} type="text" inputMode="numeric" className={`${bare ? "" : "input"} ${bad ? "!border-red" : ""} ${className ?? ""} pr-8`} value={text} placeholder={placeholder} title={bad ? "Enter a date as DD/MM/YYYY" : title} disabled={disabled} maxLength={10} onChange={e => { setText(e.target.value); setBad(false); }} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
    <button type="button" aria-label="Pick a date" tabIndex={-1} disabled={disabled} onClick={openPicker} className="absolute right-1.5 text-ink3 hover:text-ink text-[15px] leading-none px-1">▦</button>
    <input ref={native} type="date" tabIndex={-1} aria-hidden className="absolute opacity-0 w-0 h-0 pointer-events-none right-0 bottom-0" onChange={e => { if (e.target.value) { setText(isoToDMY(e.target.value)); setBad(false); if (e.target.value !== (value ?? "")) onChange(e.target.value); } }} />
  </span>;
}
