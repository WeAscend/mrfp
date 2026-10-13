import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { allFollowUps } from "@/lib/services/queries";
import * as R from "@/lib/rules";
import { ClientLink, ClaimLink, SCChips, Empty } from "@/components/ui";
import { DoneButton, ChasedButton } from "@/components/actionsClient";
import { ChaseEmailButton } from "@/components/commsClient";
import { authorityMap } from "@/lib/services/queries";
import { PageHead } from "@/components/PageHead";

const KIND: Record<string, string> = { client: "Client follow-up", claim: "Claim follow-up", ha: "Authority follow-up", a2a: "A2A chase" };
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ tab?: string; ha?: string }> }) {
  const t = await requireTenant(); const { tab = "due", ha = "" } = await searchParams;
  const all = await allFollowUps(t); const { list: has } = await authorityMap(t); const haEmail = (name: string) => has.find(h => h.name === name)?.emails?.[0];
  let rows = tab === "a2a" ? all.filter(f => f.kind === "a2a") : tab === "ha" ? all.filter(f => f.kind === "ha" && f.due) : all.filter(f => f.due);
  if (tab === "ha" && ha) rows = rows.filter(f => f.claim?.authorityName === ha);
  const haNames = Array.from(new Set(all.filter(f => f.kind === "ha").map(f => f.claim!.authorityName))).sort();
  const title = { due: "Every follow-up dated today or earlier, one row per item. Overdue rows are red and at the top, oldest first.", a2a: `A2A chase — on the list from the ${t.org.a2aChaseBusinessDays}th business day after A2A Sent until Signed & Received is entered (or the lead goes Inactive / Leads No List).`, ha: "Holding Authority follow-up — claims past their authority's Chase after days since the latest submission. Chased pushes the next follow-up out by the authority's Re-chase after days." }[tab] ?? "";
  return (
    <>
      <PageHead title="Follow-ups" lede={`What needs a call, a chase or a tick today. Today is ${R.fmtDate(t.today)}.`} />
      <div className="card-plain">
        <div className="views mb-2.5">{[["due", "Follow Up due"], ["a2a", "A2A chase"], ["ha", "Holding Authority follow-up"]].map(([k, l]) => <Link key={k} href={`/followups?tab=${k}`} className={tab === k ? "on" : ""}>{l} ({k === "a2a" ? all.filter(f => f.kind === "a2a").length : k === "ha" ? all.filter(f => f.kind === "ha" && f.due).length : all.filter(f => f.due).length})</Link>)}
          {tab === "ha" && haNames.length > 1 && <span className="ml-3 inline-flex gap-1.5 items-center"><span className="meta">by authority:</span>{haNames.map(n => <Link key={n} href={`/followups?tab=ha&ha=${encodeURIComponent(n)}`} className={ha === n ? "on" : ""}>{n}</Link>)}</span>}</div>
        <p className="meta mb-3.5">{title}</p>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Date</th><th>Client</th><th>Claim</th><th>Type</th><th>Reason / rule</th><th>Owner</th><th>Set by</th><th></th></tr></thead><tbody>
          {rows.map((f, i) => <tr key={i} className={f.overdue ? "over" : ""}>
            <td className={`whitespace-nowrap ${f.overdue ? "red" : ""}`}><b>{R.fmtDate(f.date)}</b>{f.overdue && <><br /><small>{R.daysBetween(f.date, t.today)} days overdue</small></>}</td>
            <td><ClientLink c={f.client} /> <SCChips list={f.client.specialConditions} empty="" /></td>
            <td>{f.claim ? <><ClaimLink clientId={f.clientId} id={f.claim.id} claimId={f.claim.claimId} /><br /><small className="meta">{f.claim.authorityName}</small></> : "—"}</td>
            <td>{KIND[f.kind]}</td><td>{f.sub}</td><td>{f.client.ownerCode}</td><td>{f.setBy || "—"}</td>
            <td className="whitespace-nowrap">{f.kind === "ha" ? <span className="inline-flex gap-1.5"><ChasedButton claimId={f.claim!.id} /><ChaseEmailButton claimId={f.claim!.id} to={haEmail(f.claim!.authorityName)} small /></span> : f.kind === "a2a" ? <Link href={`/clients/${f.clientId}${f.claim ? `?tab=claims&claim=${f.claim.id}` : ""}`} className="btn btn-sm">Open</Link> : <DoneButton kind={f.kind} clientId={f.clientId} claimId={f.claim?.id} />}</td>
          </tr>)}
          {!rows.length && <tr><td colSpan={8}><Empty>Nothing here.</Empty></td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
