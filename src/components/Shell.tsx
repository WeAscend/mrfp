import Link from "next/link";
import Image from "next/image";
import type { Tenant } from "@/lib/tenant";
import { SearchBox } from "./SearchBox";
import { SideNav, UserMenu } from "./NavClient";
import { OptionsProvider } from "./Options";
import { opts } from "@/lib/options";

/** App frame: brand block + navigation down the left, search and account across the top, calm content area. */
export function Shell({ t, due, children }: { t: Tenant; due: number; children: React.ReactNode }) {
  const groups: { label: string; items: { href: string; label: string; badge?: number }[] }[] = [
    { label: "Work", items: [{ href: "/today", label: "Today" }, { href: "/leads", label: "Leads" }, { href: "/clients", label: "Clients" }, { href: "/cases", label: "Cases" }, { href: "/followups", label: "Follow-ups", badge: due }] },
    { label: "Insight", items: [{ href: "/claims", label: "Claims" }, { href: "/reports", label: "Reports" }] },
    { label: "Setup", items: [{ href: "/import", label: "Import leads" }, ...(t.isAdmin ? [{ href: "/settings", label: "Settings" }] : [])] },
  ];
  return (
    <OptionsProvider value={opts(t.org)}><div className="h-screen grid grid-cols-1 md:grid-cols-[var(--navW)_1fr] grid-rows-[var(--topH)_auto_1fr] md:grid-rows-[var(--topH)_1fr]">
      <Link href="/today" aria-label="Home" className="brand hidden md:flex row-span-1 md:row-start-1 md:col-start-1 items-center gap-3 px-5 border-b border-r border-line no-underline">
        <Image src="/brand/mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px]" priority />
        <span className="leading-none"><span className="block font-head font-semibold text-[15.5px] tracking-[-.01em] text-ink">My Refund Finder</span><span className="block text-[11.5px] text-ink3 mt-1">{t.org.shortName} workspace</span></span>
      </Link>
      <header className="col-span-full md:col-span-1 md:col-start-2 md:row-start-1 flex items-center gap-4 px-4 sm:px-7 border-b border-line bg-bg">
        <Link href="/today" aria-label="Home" className="md:hidden flex items-center"><Image src="/brand/mark.png" alt="" width={30} height={30} priority /></Link>
        <SearchBox />
        <div className="flex-1" />
        <UserMenu code={t.membership.userCode} name={t.user.name} role={t.membership.role} org={t.org.name} />
      </header>
      <SideNav groups={groups} />
      <main className="overflow-y-auto overflow-x-hidden bg-bg md:col-start-2 md:row-start-2">
        <div className="px-4 sm:px-10 py-6 sm:py-9 max-w-[1240px]">{children}</div>
      </main>
    </div></OptionsProvider>
  );
}
