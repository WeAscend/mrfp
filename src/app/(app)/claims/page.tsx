import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { listClaims, authorityMap, CLAIM_VIEWS } from "@/lib/services/queries";
import { members } from "@/lib/services/org";
import * as R from "@/lib/rules";
import { ClientLink, ClaimLink, Empty } from "@/components/ui";
import { FilterBar, ExportCsvButton } from "@/components/listClient";
import { PageHead } from "@/components/PageHead";

type SP = { view?: string; ha?: string; owner?: string };
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await requireTenant(); const sp = await searchParams;
  const [rows, all, { list: has }, users] = await Promise.all([listClaims(t, sp), listClaims(t, { view: "all" }), authorityMap(t), members(t)]);
  const org = t.org.shortName; const lbl = (s: string) => s.replace("{ORG}", org);
  const q = (k: string, v: string) => { const p = new URLSearchParams(sp as Record<string, string>); p.set(k, v); return `/claims?${p}`; };
  const totFee = rows.reduce((s, k) => s + (R.feeAUD(k) ?? 0), 0);
  const csv = [["Claim ID", "Client", "Holding Authority", "Originating Company", "Claim Progress", "Amount", "Currency", "Fee (AUD)", "A2A Sent", "A2A Signed", "Date Submitted", "Claim Approved", "Refund Received", "Invoice Sent", "Payment Received", "Closed"],
    ...rows.map(k => [k.claimId, R.displayName(k.client), k.authority.name, k.companies.map(x => x.company.name).join("; "), k.progress ? `${k.progress} ${R.stepName(k.progress, org)}` : "", k.amount ?? "", k.currency, R.feeAUD(k) ?? "", k.a2aLog[0]?.sent ?? "", k.a2aLog[0]?.signed ?? "", k.dateSubmitted ?? "", k.claimApproved ?? "", k.refundReceived ?? "", k.invoiceSent ?? "", k.paymentReceived ?? "", k.closedOn ?? ""])];
  return (
    <>
      <PageHead title="Claims" lede="Report views across every claim, in pipeline order. Fees are AUD and add up across the view." />
      <div className="card-plain">
        <div className="views mb-3">{CLAIM_VIEWS.map(v => <Link key={v.key} href={q("view", v.key)} className={(sp.view || "all") === v.key ? "on" : ""}>{lbl(v.label)} ({all.filter(k => v.test(k.progress)).length})</Link>)}</div>
        <div className="flex flex-wrap items-end gap-2.5 mb-3.5"><FilterBar base="/claims" current={sp as Record<string, string>} filters={[{ key: "ha", label: "Holding Authority", options: has.map(a => [a.id, a.name]) }, { key: "owner", label: "Owner", options: users.map(u => [u.userCode, u.userCode]) }]} /><ExportCsvButton rows={csv} filename="claims.csv" /><span className="meta">{rows.length} claims · fees {R.money(totFee)} AUD</span></div>
        <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Claim ID</th><th>Client</th><th>Holding Authority</th><th>Originating Company</th><th>Claim Progress</th><th className="num">Amount</th><th className="num">Fee (AUD)</th><th>A2A sent</th><th>Submitted</th><th>Approved</th><th>Refund</th><th>Closed</th></tr></thead><tbody>
          {rows.map(k => <tr key={k.id}><td><ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} /></td><td><ClientLink c={k.client} /></td><td>{k.authority.name}</td><td>{k.companies.map(x => x.company.name).join(", ") || "—"}</td><td>{k.progress ? `${k.progress} · ${R.stepName(k.progress, org)}` : <span className="chip chip-amber">blank</span>}</td><td className="num">{R.money(k.amount, k.currency)}</td><td className="num">{R.money(R.feeAUD(k))}</td><td>{R.fmtDate(k.a2aLog[0]?.sent, false) || "—"}</td><td>{R.fmtDate(k.dateSubmitted, false) || "—"}</td><td>{R.fmtDate(k.claimApproved, false) || "—"}</td><td>{R.fmtDate(k.refundReceived, false) || "—"}</td><td>{R.fmtDate(k.closedOn, false) || "—"}</td></tr>)}
          {!rows.length && <tr><td colSpan={12}><Empty>No claims in this view.</Empty></td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
