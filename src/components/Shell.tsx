import Link from "next/link";
import Image from "next/image";
import type { Tenant } from "@/lib/tenant";
import { SearchBox } from "./SearchBox";
import { NavLinks, UserMenu } from "./NavClient";

export function Shell({ t, due, children }: { t: Tenant; due: number; children: React.ReactNode }) {
  const items = [["/leads", "Leads"], ["/clients", "Clients"], ["/claims", "Claims"], ["/followups", "Follow-ups"], ["/reports", "Reports"], ["/import", "Import"]];
  if (t.isAdmin) items.push(["/settings", "Settings"]);
  return (
    <div className="min-h-screen">
      <header className="bg-navy px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-3 sticky top-0 z-20">
        <Link href="/leads" className="bg-white rounded-lg px-2.5 py-1 flex items-center" aria-label="Home"><Image src="/mrf-logo.png" alt={t.org.name} width={48} height={40} className="h-10 w-auto" priority /></Link>
        <NavLinks items={items} due={due} />
        <SearchBox />
        <UserMenu code={t.membership.userCode} name={t.user.name} role={t.membership.role} org={t.org.name} />
      </header>
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
