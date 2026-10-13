import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { search } from "@/lib/services/queries";
import { displayName } from "@/lib/rules";

export async function GET(req: Request) {
  const t = await getTenant(); if (!t) return NextResponse.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  const r = await search(t, q);
  const hits = [
    ...r.clients.map(c => ({ href: `/clients/${c.id}`, title: displayName(c), sub: [c.stage === "LEAD" ? "Lead" : c.stage === "ACTIVE" ? "Active" : "Inactive", c.clientCode, c.phoneMobile].filter(Boolean).join(" · ") })),
    ...r.claims.map(k => ({ href: `/clients/${k.clientId}?tab=claims&claim=${k.id}`, title: k.claimId, sub: `${displayName(k.client)} · ${k.authority.name}${k.reference ? ` · OTN ${k.reference}` : ""}` })),
  ].slice(0, 15);
  return NextResponse.json(hits);
}
