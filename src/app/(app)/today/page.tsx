import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { todayData } from "@/lib/services/comms";
import * as R from "@/lib/rules";
import { ClientLink, ClaimLink, Empty, Section } from "@/components/ui";
import { ChasedButton } from "@/components/actionsClient";
import { PrepareEmailButton } from "@/components/commsClient";
import { PageHead } from "@/components/PageHead";

/** Landing page: the day's work in four lists. Nothing here sends anything — it points at the record to act on. */
export default async function TodayPage() {
  const t = await requireTenant();
  const d = await todayData(t);
  const hour = Number(new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <PageHead title={`${greet}, ${t.user.name.split(" ")[0]}`} lede={`${R.fmtDate(t.today)}. ${d.dueTotal} follow-up${d.dueTotal === 1 ? "" : "s"} due, ${d.a2aChase.length} Authority to Act${d.a2aChase.length === 1 ? "" : "s"} to chase.`} right={<Link href="/followups" className="btn">All follow-ups</Link>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[[d.calls.length, "calls to make"], [d.a2aChase.length, "A2As to chase"], [d.chase.length, "authorities to chase"], [d.refunds.length, "refunds to invoice"]].map(([n, l]) => <div key={String(l)} className="card-plain stat !py-4"><div className="n">{n}</div><div className="l">{l}</div></div>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Section title="Calls to make" right={<span className="meta">leads with a number, oldest contact first</span>}>
          {!d.calls.length ? <Empty>No one to call — import leads or clear the follow-ups.</Empty> : <table className="tbl"><tbody>{d.calls.map(c => { const f = d.fuBy.get(c.id); return <tr key={c.id}><td><ClientLink c={c} /><div className="meta">{c.leadIdentifier || "No identifier"}{c.lastContact ? ` · last contact ${R.daysBetween(c.lastContact, t.today)}d ago` : " · never contacted"}{f?.due ? ` · ${f.label}` : ""}</div></td><td className="num whitespace-nowrap">{R.money(c.leadAmount)}</td><td className="whitespace-nowrap"><a href={`tel:${(c.phoneMobile || c.phoneOther || "").replace(/\s/g, "")}`} className="link">{c.phoneMobile || c.phoneOther}</a></td><td><Link href={`/clients/${c.id}`} className="btn btn-sm">Open</Link></td></tr>; })}</tbody></table>}
        </Section>
        <Section title="Authority to Act — chase" right={<span className="meta">{t.org.a2aChaseBusinessDays} business days after A2A Sent, until signed</span>}>
          {!d.a2aChase.length ? <Empty>No A2As waiting.</Empty> : <table className="tbl"><tbody>{d.a2aChase.map((f, i) => <tr key={i} className={f.overdue ? "over" : ""}><td><ClientLink c={f.client} /><div className="meta">{f.claim ? <><ClaimLink clientId={f.clientId} id={f.claim.id} claimId={f.claim.claimId} /> · </> : null}{f.sub}</div></td><td className={`whitespace-nowrap ${f.overdue ? "red" : ""}`}>{R.fmtDate(f.date, false)}</td><td className="whitespace-nowrap"><Link href={`/clients/${f.clientId}`} className="btn btn-sm">Open</Link></td></tr>)}</tbody></table>}
        </Section>
        <Section title="Holding authorities to chase" right={<span className="meta">Chased records today's date and resets the follow-up</span>}>
          {!d.chase.length ? <Empty>Nothing due.</Empty> : <table className="tbl"><tbody>{d.chase.map((f, i) => <tr key={i} className={f.overdue ? "over" : ""}><td><ClientLink c={f.client} /><div className="meta">{f.claim && <ClaimLink clientId={f.clientId} id={f.claim.id} claimId={f.claim.claimId} />} · {f.claim?.authorityName} · {f.sub}</div></td><td className={`whitespace-nowrap ${f.overdue ? "red" : ""}`}>{R.fmtDate(f.date, false)}</td><td className="whitespace-nowrap"><span className="inline-flex gap-1.5"><ChasedButton claimId={f.claim!.id} /><PrepareEmailButton clientId={f.clientId} claimId={f.claim!.id} templateKey="ha_chase" label="Prepare email" small /></span></td></tr>)}</tbody></table>}
        </Section>
        <Section title="Money in — invoice the client" right={<span className="meta">claims at step 11</span>}>
          {!d.refunds.length ? <Empty>No refunds waiting to be invoiced.</Empty> : <table className="tbl"><tbody>{d.refunds.map(k => <tr key={k.id}><td><ClientLink c={k.client} /><div className="meta"><ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} /> · {k.authority.name} · received {k.refundReceived ? R.fmtDate(k.refundReceived, false) : "—"}</div></td><td className="num whitespace-nowrap">{R.money(k.amount, k.currency === "NZD" ? "NZD" : undefined)}<div className="meta">fee {R.money(R.feeAUD(k))}</div></td><td className="whitespace-nowrap"><PrepareEmailButton clientId={k.clientId} claimId={k.id} templateKey="invoice" label="Prepare email" small /></td></tr>)}</tbody></table>}
          {d.idNeeded.length > 0 && <div className="mt-4 pt-3 border-t border-line"><div className="font-semibold text-[14px] mb-2">Waiting on ID & address evidence ({d.idNeeded.length})</div><table className="tbl"><tbody>{d.idNeeded.map(k => <tr key={k.id}><td><ClientLink c={k.client} /> <span className="meta">· <ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} /> · {k.authority.name}</span></td><td className="whitespace-nowrap"><PrepareEmailButton clientId={k.clientId} claimId={k.id} templateKey="id_request" label="Prepare email" small /></td></tr>)}</tbody></table></div>}
        </Section>
      </div>
    </>
  );
}
