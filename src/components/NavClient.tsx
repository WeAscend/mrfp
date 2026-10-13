"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logOutAction } from "@/actions";

export function NavLinks({ items, due }: { items: string[][]; due: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1.5 flex-1 basis-[380px]">
      {items.map(([href, label]) => {
        const on = path === href || path.startsWith(href + "/") || (href === "/clients" && path.startsWith("/clients"));
        return <Link key={href} href={href} className={`no-underline px-3.5 py-2 rounded-md font-display text-[14px] ${on ? "bg-lime text-navy font-semibold" : "text-white font-medium hover:bg-white/10"}`}>{label}{href === "/followups" && due > 0 && <span className="ml-1 bg-alert text-white rounded-full px-1.5 py-px text-[12px]" aria-label={`${due} due`}>{due}</span>}</Link>;
      })}
    </nav>
  );
}
export function UserMenu({ code, name, role, org }: { code: string; name: string; role: string; org: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="bg-white text-navy rounded-full w-[38px] h-[38px] flex items-center justify-center font-display font-semibold text-[13px]" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Account menu">{code}</button>
      {open && <div className="absolute right-0 top-11 bg-white rounded-lg shadow-lg border border-line p-3 min-w-[220px] z-30 text-[14px]">
        <div className="font-semibold">{name} <span className="meta">· {code}</span></div><div className="meta">{role === "ADMIN" ? "Admin" : "User"} · {org}</div>
        <form action={logOutAction} className="mt-3"><button className="btn btn-sm w-full">Log out</button></form>
      </div>}
    </div>
  );
}
