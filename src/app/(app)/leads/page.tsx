import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { listClients } from "@/lib/services/queries";
import * as R from "@/lib/rules";
import { ClientLink, SCChips, ChecklistChip, Overdue, Empty } from "@/components/ui";
import { NewLeadButton } from "@/components/actionsClient";
import { PageHead } from "@/components/PageHead";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const t = await requireTenant(); const { id: filt = "" } = await searchParams;
  const all = (await listClients(t, { stage: "LEAD" }));
  const leads = filt ? all.filter(c => (c.leadIdentifier || "") === filt) : all;
  const counts: Record<string, number> = {}; for (const c of all) counts[c.leadIdentifier || "(blank)"] = (counts[c.leadIdentifier || "(blank)"] || 0) + 1;
  return (
    <>
      <PageHead title="Leads" count={`${leads.length} shown`} lede="Everyone not yet signed. Work the call list by Lead Identifier; a signed A2A moves a lead to Clients." right={<><NewLeadButton /><Link href="/import" className="btn btn-primary">Import leads from CSV</Link></>} />
      <div className="card-plain">
        <div className="flex flex-wrap items-center gap-2.5 mb-3.5"><span className="meta">Lead Identifier</span><div className="views"><Link href="/leads" className={!filt ? "on" : ""}>All ({all.length})</Link>{R.LEAD_IDENTIFIERS.map(i => <Link key={i} href={`/leads?id=${encodeURIComponent(i)}`} className={filt === i ? "on" : ""}>{i}{counts[i] ? ` (${counts[i]})` : ""}</Link>)}{counts["(blank)"] ? <Link href="/leads?id=(blank)" className={filt === "(blank)" ? "on" : ""}>No identifier ({counts["(blank)"]})</Link> : null}</div></div>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Name</th><th>Identifier</th><th>Special</th><th className="num">Lead amount</th><th>Found at</th><th>Phone</th><th>Last contact</th><th>Follow up</th><th>Source</th><th>Owner</th></tr></thead><tbody>
          {leads.map(c => <tr key={c.id}><td><ClientLink c={c} /><ChecklistChip text={c.checklist} /></td><td>{c.leadIdentifier || "—"}</td><td><SCChips list={c.specialConditions} /></td><td className="num">{R.money(c.leadAmount)}</td><td>{c.foundAt.length ? <span className="inline-flex flex-wrap gap-1">{c.foundAt.map(a => <span key={a} className="chip chip-outline !text-[12px] !py-px">{a}</span>)}</span> : "—"}</td><td>{c.phoneMobile || c.phoneOther || "—"}</td><td>{c.lastContact ? `${R.fmtDate(c.lastContact, false)} · ${R.daysBetween(c.lastContact, t.today)}d` : "—"}</td><td><Overdue date={c.next?.date} today={t.today} /></td><td>{c.source || "—"}</td><td>{c.ownerCode}</td></tr>)}
          {!leads.length && <tr><td colSpan={10}><Empty>No leads match. Import a CSV or add one.</Empty></td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
