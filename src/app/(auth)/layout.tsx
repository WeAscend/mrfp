import Image from "next/image";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-[460px]">
        <div className="flex items-center gap-3 mb-6"><div className="bg-white rounded-lg px-2.5 py-1 shadow-card"><Image src="/mrf-logo.png" alt="MRFP" width={56} height={46} className="h-11 w-auto" /></div><div><div className="font-display font-bold text-[20px]">MRFP</div><div className="meta">Leads, clients, claims and follow-ups for refund finders</div></div></div>
        {children}
      </div>
    </div>
  );
}
