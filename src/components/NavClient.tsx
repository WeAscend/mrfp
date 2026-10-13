"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logOutAction } from "@/actions";

type Group = { label: string; items: { href: string; label: string; badge?: number }[] };
export function SideNav({ groups }: { groups: Group[] }) {
  const path = usePathname();
  const on = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <nav aria-label="Main" className="border-b md:border-b-0 md:border-r border-line px-3 py-2 md:py-4 md:pb-6 md:overflow-y-auto bg-bg flex md:block gap-1 overflow-x-auto md:row-start-2">
      {groups.map(g => (
        <div key={g.label} className="flex md:block gap-1 items-center">
          <div className="hidden md:block text-[12px] text-ink3 px-3 pt-5 pb-1.5 first:pt-1">{g.label}</div>
          {g.items.map(i => (
            <Link key={i.href} href={i.href} aria-current={on(i.href) ? "page" : undefined} className={`flex items-center justify-between md:w-full rounded-lg px-3 py-[7px] text-[14.5px] no-underline whitespace-nowrap ${on(i.href) ? "text-ink bg-panel font-semibold shadow-[inset_3px_0_0_var(--color-lime)]" : "text-ink2 hover:text-ink hover:bg-panel"}`}>
              <span>{i.label}</span>
              {i.badge ? <span className="ml-2 bg-red text-white rounded-full px-1.5 py-px text-[12px] font-semibold leading-tight" aria-label={`${i.badge} due`}>{i.badge}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
export function UserMenu({ code, name, role, org }: { code: string; name: string; role: string; org: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="rounded-full border border-line px-3.5 h-[34px] text-[14px] font-semibold text-ink hover:border-ink" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Account menu">{code}</button>
      {open && <div className="absolute right-0 top-11 bg-bg rounded-xl shadow-xl border border-line p-3.5 min-w-[230px] z-30 text-[14px]">
        <div className="font-semibold">{name} <span className="meta">· {code}</span></div><div className="meta">{role === "ADMIN" ? "Admin" : "User"} · {org}</div>
        <form action={logOutAction} className="mt-3"><button className="btn btn-sm w-full">Log out</button></form>
      </div>}
    </div>
  );
}
