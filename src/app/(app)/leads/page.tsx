import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { listClients } from "@/lib/services/queries";
import * as R from "@/lib/rules";
import { ClientLink, SCChips, ChecklistChip, Overdue, Empty } from "@/components/ui";
import { NewLeadButton } from "@/components/actionsClient";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const t = await requireTenant(); const { id: filt = "" } = await searchParams;
  const all = (await listClients(t, { stage: "LEAD" }));
  const leads = filt ? all.filter(c => (c.leadIdentifier || "") === filt) : all;
  const counts: Record<string, number> = {}; for (const c of all) counts[c.leadIdentifier || "(blank)"] = (counts[c.leadIdentifier || "(blank)"] || 0) + 1;
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h1>Leads <span className="meta text-[15px] font-normal">{leads.length} shown</span></h1><div className="flex gap-2"><Link href="/import" className="btn btn-primary">Import leads from CSV</Link><NewLeadButton /></div></div>
      <div className="card">
        <div className="flex flex-wrap items-center gap-2.5 mb-3.5"><span className="meta">Lead Identifier</span><div className="views"><Link href="/leads" className={!filt ? "on" : ""}>All ({all.length})</Link>{R.LEAD_IDENTIFIERS.map(i => <Link key={i} href={`/leads?id=${encodeURIComponent(i)}`} className={filt === i ? "on" : ""}>{i}{counts[i] ? ` (${counts[i]})` : ""}</Link>)}{counts["(blank)"] ? <Link href="/leads?id=(blank)" className={filt === "(blank)" ? "on" : ""}>No identifier ({counts["(blank)"]})</Link> : null}</div></div>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Name</th><th>Identifier</th><th>Special</th><th className="num">Lead amount</th><th>Found at</th><th>Phone</th><th>Last contact</th><th>Follow up</th><th>Source</th><th>Owner</th></tr></thead><tbody>
          {leads.map(c => <tr key={c.id}><td><ClientLink c={c} /><ChecklistChip text={c.checklist} /></td><td>{c.leadIdentifier || "—"}</td><td><SCChips list={c.specialConditions} /></td><td className="num">{R.money(c.leadAmount)}</td><td>{/* latest search snapshot shown on the lead screen */}</td><td>{c.phoneMobile || c.phoneOther || "—"}</td><td>{c.lastContact ? `${R.fmtDate(c.lastContact, false)} · ${R.daysBetween(c.lastContact, t.today)}d` : "—"}</td><td><Overdue date={c.next?.date} today={t.today} /></td><td>{c.source || "—"}</td><td>{c.ownerCode}</td></tr>)}
          {!leads.length && <tr><td colSpan={10}><Empty>No leads match. Import a CSV or add one.</Empty></td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
