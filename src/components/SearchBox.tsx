"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hit = { href: string; title: string; sub: string };
export function SearchBox() {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[] | null>(null); const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!q.trim()) { setHits(null); return; }
    const h = setTimeout(async () => { const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`); setHits(await r.json()); setOpen(true); }, 200);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  return (
    <div ref={box} className="relative flex items-center gap-2 bg-white rounded-md px-3 h-[38px] flex-[0_1_340px] min-w-[200px]">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6B7A" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} onFocus={() => hits && setOpen(true)} placeholder="Surname, business, OTN, Claim ID, phone, email" aria-label="Search" className="flex-1 min-w-0 border-0 outline-none text-[14px] text-navy bg-transparent placeholder:text-[#7a8894]" />
      {open && hits && <div className="absolute left-0 right-0 top-11 bg-white border border-line rounded-lg shadow-xl max-h-[360px] overflow-auto z-30 text-ink">
        {hits.length ? hits.map((h, i) => <Link key={i} href={h.href} onClick={() => { setOpen(false); setQ(""); }} className="block px-3 py-2 border-b border-line text-[14px] no-underline hover:bg-chip"><div className="font-semibold">{h.title}</div><div className="meta">{h.sub}</div></Link>) : <div className="p-3 meta">No matches</div>}
      </div>}
    </div>
  );
}
