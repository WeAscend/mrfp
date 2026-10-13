"use client";
import { useRouter } from "next/navigation";

export function FilterBar({ base, current, filters, dateRange }: { base: string; current: Record<string, string>; filters: { key: string; label: string; options: string[][] }[]; dateRange?: { fromKey: string; toKey: string; label: string } }) {
  const router = useRouter();
  const go = (k: string, v: string) => { const p = new URLSearchParams(current); if (v) p.set(k, v); else p.delete(k); router.push(`${base}?${p.toString()}`); };
  return (
    <>
      {filters.map(f => <label key={f.key} className="label text-[12px]">{f.label}<select className="input !h-[34px] !w-auto text-[14px] min-w-[130px]" value={current[f.key] || ""} onChange={e => go(f.key, e.target.value)}><option value="">Any</option>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>)}
      {dateRange && <label className="label text-[12px]">{dateRange.label}<span className="flex gap-1 items-center"><input type="date" className="input !h-[34px] !w-auto text-[13px]" value={current[dateRange.fromKey] || ""} onChange={e => go(dateRange.fromKey, e.target.value)} /><span className="meta">to</span><input type="date" className="input !h-[34px] !w-auto text-[13px]" value={current[dateRange.toKey] || ""} onChange={e => go(dateRange.toKey, e.target.value)} /></span></label>}
      {Object.keys(current).some(k => current[k] && k !== "view" && k !== "tab") && <button className="btn btn-sm" onClick={() => router.push(base + (current.view ? `?view=${current.view}` : ""))}>Clear filters</button>}
    </>
  );
}
export function ExportCsvButton({ rows, filename }: { rows: (string | number | null)[][]; filename: string }) {
  const download = () => {
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  };
  return <button className="btn btn-sm" onClick={download}>Export CSV</button>;
}
