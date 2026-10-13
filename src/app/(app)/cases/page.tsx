import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { listClaims, allFollowUps, authorityMap } from "@/lib/services/queries";
import * as R from "@/lib/rules";
import { PageHead } from "@/components/PageHead";

/** Cases: every open claim on a board of six stages, so the 21 sub-steps read as a pipeline. */
export default async function CasesPage({ searchParams }: { searchParams: Promise<{ ha?: string; owner?: string; closed?: string }> }) {
  const t = await requireTenant(); const sp = await searchParams;
  const [ks, fus, { list: has }] = await Promise.all([listClaims(t, { view: "all", ha: sp.ha, owner: sp.owner }), allFollowUps(t), authorityMap(t)]);
  const nextBy = new Map<string, R.FollowUp>(); for (const f of fus) if (f.claimId && !nextBy.has(f.claimId)) nextBy.set(f.claimId, f);
  const open = ks.filter(k => k.progress != null && !R.CLOSING_STEPS.includes(k.progress)), closed = ks.filter(k => k.progress != null && R.CLOSING_STEPS.includes(k.progress)), blank = ks.filter(k => k.progress == null);
  const owners = Array.from(new Set(ks.map(k => k.client.ownerCode))).sort();
  const total = open.reduce((s, k) => s + (Number(k.amount) || 0), 0);
  const q = (patch: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) u.set(k, v); const s = u.toString(); return `/cases${s ? `?${s}` : ""}`; };
  return (
    <>
      <PageHead title="Cases" count={`${open.length} open · ${R.money(total)}`} lede="Every open claim, left to right from opened to paid. A red edge means its follow-up is overdue." right={<Link href="/claims" className="btn">Claims list & views</Link>} />
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 items-center">
        <div className="views"><Link href={q({ ha: undefined })} className={!sp.ha ? "on" : ""}>All authorities</Link>{has.filter(h => ks.some(k => k.authorityId === h.id)).map(h => <Link key={h.id} href={q({ ha: h.id })} className={sp.ha === h.id ? "on" : ""}>{h.name}</Link>)}</div>
        {owners.length > 1 && <div className="views"><span className="meta self-center">Owner</span><Link href={q({ owner: undefined })} className={!sp.owner ? "on" : ""}>All</Link>{owners.map(o => <Link key={o} href={q({ owner: o })} className={sp.owner === o ? "on" : ""}>{o}</Link>)}</div>}
      </div>
      <div className="board">
        {R.CASE_STAGES.map(st => { const cards = open.filter(k => st.steps.includes(k.progress!)); const sum = cards.reduce((s, k) => s + (Number(k.amount) || 0), 0); return (
          <div key={st.key} className="col"><h3>{st.label}<span>{cards.length}{sum ? ` · ${R.money(sum).replace(/\.\d\d$/, "")}` : ""}</span></h3>
            {cards.map(k => { const nf = nextBy.get(k.id); return <Link key={k.id} href={`/clients/${k.clientId}?tab=claims&claim=${k.id}`} className={`ccard ${nf?.overdue ? "over" : ""}`}>
              <b>{R.displayName(k.client)}</b>
              <span className="meta">{k.claimId} · {k.authority.name}</span>
              <div className="mt-1.5 font-semibold tabular-nums">{R.money(k.amount, k.currency === "NZD" ? "NZD" : undefined)}</div>
              <div className="meta">{k.progress} · {R.stepName(k.progress, t.org.shortName).replace(/^Holding Authority /, "HA ").replace("Authority to Act", "A2A")}</div>
              {nf && <div className={`meta mt-1 ${nf.overdue ? "red" : ""}`}>{nf.overdue ? "Overdue " : "Follow up "}{R.fmtDate(nf.date, false)} · {nf.kind === "ha" ? "chase authority" : nf.kind === "a2a" ? "chase A2A" : nf.sub || "follow-up"}</div>}
            </Link>; })}
            {!cards.length && <div className="meta px-1.5 pb-1">{st.hint}</div>}
          </div>); })}
      </div>
      <div className="flex flex-wrap gap-5 mt-5 meta">
        <span>{closed.length} closed claim{closed.length === 1 ? "" : "s"} — <Link href="/claims?view=all" className="link">see the full list</Link></span>
        {blank.length > 0 && <span className="chip chip-amber">{blank.length} with no progress set (migration check-list)</span>}
      </div>
    </>
  );
}
