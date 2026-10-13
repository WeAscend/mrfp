import Link from "next/link";
import Image from "next/image";
import type { Tenant } from "@/lib/tenant";
import { SearchBox } from "./SearchBox";
import { SideNav, UserMenu } from "./NavClient";

export function Shell({ t, due, children }: { t: Tenant; due: number; children: React.ReactNode }) {
  const groups: { label: string; items: { href: string; label: string; badge?: number }[] }[] = [
    { label: "Work", items: [{ href: "/leads", label: "Leads" }, { href: "/clients", label: "Clients" }, { href: "/claims", label: "Claims" }, { href: "/followups", label: "Follow-ups", badge: due }] },
    { label: "Insight", items: [{ href: "/reports", label: "Reports" }] },
    { label: "Setup", items: [{ href: "/import", label: "Import leads" }, ...(t.isAdmin ? [{ href: "/settings", label: "Settings" }] : [])] },
  ];
  return (
    <div className="h-screen grid grid-cols-1 md:grid-cols-[var(--navW)_1fr] grid-rows-[var(--topH)_auto_1fr] md:grid-rows-[var(--topH)_1fr]">
      <header className="col-span-full flex items-center gap-[18px] px-4 sm:px-[22px] border-b border-line bg-bg">
        <Link href="/leads" aria-label="Home" className="flex items-center"><Image src="/mrf-logo.png" alt={t.org.name} width={34} height={28} className="h-7 w-auto" priority /></Link>
        <span className="font-head font-medium text-[15px] text-ink2 pl-[18px] border-l border-line hidden sm:inline">{t.org.shortName} · {t.org.name}</span>
        <div className="flex-1" />
        <SearchBox />
        <UserMenu code={t.membership.userCode} name={t.user.name} role={t.membership.role} org={t.org.name} />
      </header>
      <SideNav groups={groups} />
      <main className="overflow-y-auto overflow-x-hidden grid-bg">
        <div className="px-4 sm:px-11 py-7 sm:py-10 max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
