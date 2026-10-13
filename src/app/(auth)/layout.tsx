import Image from "next/image";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-navy text-white px-14 py-12 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60" style={{ ["--grid" as string]: "rgba(255,255,255,.06)", ["--dot" as string]: "rgba(255,255,255,.18)" }} aria-hidden />
        <Image src="/brand/lockup.png" alt="My Refund Finder" width={300} height={200} className="relative w-[280px] h-auto brightness-0 invert" priority />
        <div className="relative max-w-[42ch]">
          <p className="font-head text-[34px] leading-[1.1] tracking-[-.02em] font-semibold">Every lead, claim and follow-up, in one place.</p>
          <p className="mt-4 text-[15.5px] text-white/70">Calls logged, authorities chased, Authority to Act signed online — with the follow-up dates worked out for you.</p>
        </div>
        <p className="relative text-[12.5px] text-white/50">My Refund Finder Platform</p>
      </aside>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <Image src="/brand/lockup.png" alt="My Refund Finder" width={200} height={133} className="lg:hidden w-[170px] h-auto mb-8" priority />
          {children}
        </div>
      </div>
    </div>
  );
}
