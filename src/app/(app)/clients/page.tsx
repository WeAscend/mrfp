import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { listClients } from "@/lib/services/queries";
import { members } from "@/lib/services/org";
import * as R from "@/lib/rules";
import { opts } from "@/lib/options";
import { ClientLink, SCChips, StageChip, ChecklistChip, Overdue, Empty } from "@/components/ui";
import { FilterBar, ExportCsvButton } from "@/components/listClient";
import { PageHead } from "@/components/PageHead";

type SP = { view?: string; stage?: string; ident?: string; source?: string; sc?: string; owner?: string; enteredFrom?: string; enteredTo?: string };
export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await requireTenant(); const sp = await searchParams;
  const [rows, all, users] = await Promise.all([listClients(t, sp), listClients(t, {}), members(t)]);
  const n = (s: string) => all.filter(c => c.stage === s).length;
  const csv = [["Client name", "Client Code", "Stage", "Lead Identifier / Inactive Reason", "Source", "Special Condition", "Open claims", "Last Contact", "Next follow-up", "Date entered", "Owner"], ...rows.map(c => [R.displayName(c), c.clientCode || "", c.stage, c.leadIdentifier || c.inactiveReason || "", c.source || "", c.specialConditions.join("; "), c.openClaims, c.lastContact || "", c.next?.date || "", c.dateEntered, c.ownerCode])];
  const O = opts(t.org);
  const filters = [
    { key: "stage", label: "Stage", options: [["LEAD", "Lead"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"]] },
    { key: "ident", label: "Identifier / Reason", options: [...R.LEAD_IDENTIFIERS, ...O.inactiveReasons].map(x => [x, x]) },
    { key: "source", label: "Source", options: O.sources.map(x => [x, x]) }, { key: "sc", label: "Special Condition", options: O.specialConditions.map(x => [x, x]) },
    { key: "owner", label: "Owner", options: users.map(u => [u.userCode, u.userCode]) },
  ];
  return (
    <>
      <PageHead title="Clients" lede="Every record from first lead to finished client. Filter by any field; export what you see." />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">{[["Clients", all.length], ["Leads", n("LEAD")], ["Active", n("ACTIVE")], ["Inactive", n("INACTIVE")]].map(([l, v]) => <div key={l} className="stat card-plain !py-4"><div className="n">{v}</div><div className="l">{l}</div></div>)}</div>
      <div className="card-plain">
        <div className="flex flex-wrap items-end gap-2.5 mb-3.5">
          <div className="views"><Link href="/clients" className={sp.view !== "active" ? "on" : ""}>All clients</Link><Link href="/clients?view=active" className={sp.view === "active" ? "on" : ""}>Active clients</Link></div>
          <FilterBar base="/clients" current={sp as Record<string, string>} filters={filters} dateRange={{ fromKey: "enteredFrom", toKey: "enteredTo", label: "Date entered" }} />
          <ExportCsvButton rows={csv} filename="clients.csv" /><span className="meta">{rows.length} rows</span>
        </div>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Client name</th><th>Code</th><th>Stage</th><th>Identifier / Reason</th><th>Source</th><th>Special</th><th className="num">Open claims</th><th>Last contact</th><th>Next follow-up</th><th>Date entered</th><th>Owner</th></tr></thead><tbody>
          {rows.map(c => <tr key={c.id}><td><ClientLink c={c} /><ChecklistChip text={c.checklist} /></td><td>{c.clientCode || "—"}</td><td><StageChip stage={c.stage} /></td><td>{c.leadIdentifier || c.inactiveReason || "—"}</td><td>{c.source || "—"}</td><td><SCChips list={c.specialConditions} /></td><td className="num">{c.openClaims}</td><td>{c.lastContact ? R.fmtDate(c.lastContact, false) : "—"}</td><td><Overdue date={c.next?.date} today={t.today} /></td><td>{R.fmtDate(c.dateEntered, false)}</td><td>{c.ownerCode}</td></tr>)}
          {!rows.length && <tr><td colSpan={11}><Empty>No clients match these filters.</Empty></td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
