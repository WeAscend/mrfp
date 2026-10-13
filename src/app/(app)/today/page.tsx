import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { todayData } from "@/lib/services/comms";
import { mailDriver } from "@/lib/mail";
import { smsDriver } from "@/lib/sms";
import * as R from "@/lib/rules";
import { ClientLink, ClaimLink, Empty, Section } from "@/components/ui";
import { ChasedButton } from "@/components/actionsClient";
import { ChaseEmailButton, SendMessageButton, CancelSignButton } from "@/components/commsClient";
import { authorityMap } from "@/lib/services/queries";
import { PageHead } from "@/components/PageHead";

/** Landing page: the day's work in four lists, plus what the automation did. */
export default async function TodayPage() {
  const t = await requireTenant();
  const [d, { list: has }] = await Promise.all([todayData(t), authorityMap(t)]);
  const haEmail = (id: string) => has.find(h => h.id === id)?.emails?.[0];
  const hour = Number(new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const noProvider = mailDriver() === "log";
  return (
    <>
      <PageHead title={`${greet}, ${t.user.name.split(" ")[0]}`} lede={`${R.fmtDate(t.today)}. ${d.dueTotal} follow-up${d.dueTotal === 1 ? "" : "s"} due, ${d.awaiting.length} ${d.awaiting.length === 1 ? "Authority" : "Authorities"} to Act out for signature.`} right={<Link href="/followups" className="btn">All follow-ups</Link>} />
      {noProvider && t.isAdmin && <div className="warn-box mb-5">Email isn't connected yet — messages are recorded but not delivered. Add <code>RESEND_API_KEY</code> and a verified sender domain when you go live.{smsDriver() === "log" ? " SMS is the same (Twilio)." : ""}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[[d.calls.length, "calls to make"], [d.awaiting.length, "awaiting signature"], [d.chase.length, "authorities to chase"], [d.refunds.length, "refunds to invoice"]].map(([n, l]) => <div key={String(l)} className="card-plain stat !py-4"><div className="n">{n}</div><div className="l">{l}</div></div>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Section title="Calls to make" right={<span className="meta">leads with a number, oldest contact first</span>}>
          {!d.calls.length ? <Empty>No one to call — import leads or clear the follow-ups.</Empty> : <table className="tbl"><tbody>{d.calls.map(c => { const f = d.fuBy.get(c.id); return <tr key={c.id}><td><ClientLink c={c} /><div className="meta">{c.leadIdentifier || "No identifier"}{c.lastContact ? ` · last contact ${R.daysBetween(c.lastContact, t.today)}d ago` : " · never contacted"}{f?.due ? ` · ${f.label}` : ""}</div></td><td className="num whitespace-nowrap">{R.money(c.leadAmount)}</td><td className="whitespace-nowrap"><a href={`tel:${(c.phoneMobile || c.phoneOther || "").replace(/\s/g, "")}`} className="link">{c.phoneMobile || c.phoneOther}</a></td><td><Link href={`/clients/${c.id}`} className="btn btn-sm">Open</Link></td></tr>; })}</tbody></table>}
        </Section>
        <Section title="Authority to Act — awaiting signature" right={<span className="meta">reminders go on days {t.org.a2aReminderDays}</span>}>
          {!d.awaiting.length ? <Empty>Nothing out for signature.</Empty> : <table className="tbl"><tbody>{d.awaiting.map(s => { const age = Math.floor((Date.now() - s.createdAt.getTime()) / 86400000); return <tr key={s.id}><td><ClientLink c={s.client} /><div className="meta">sent {age === 0 ? "today" : `${age}d ago`} · {s.status === "VIEWED" ? "opened" : "not opened"} · {s.remindersSent} reminder(s)</div></td><td className="whitespace-nowrap">{age >= 7 && <span className="chip chip-amber">call them</span>}</td><td className="whitespace-nowrap"><span className="inline-flex gap-1.5"><Link href={`/clients/${s.clientId}`} className="btn btn-sm">Open</Link><CancelSignButton id={s.id} /></span></td></tr>; })}</tbody></table>}
        </Section>
        <Section title="Holding authorities to chase">
          {!d.chase.length ? <Empty>Nothing due.</Empty> : <table className="tbl"><tbody>{d.chase.map((f, i) => <tr key={i} className={f.overdue ? "over" : ""}><td><ClientLink c={f.client} /><div className="meta">{f.claim && <ClaimLink clientId={f.clientId} id={f.claim.id} claimId={f.claim.claimId} />} · {f.claim?.authorityName} · {f.kind === "a2a" ? "A2A chase" : f.sub}</div></td><td className={`whitespace-nowrap ${f.overdue ? "red" : ""}`}>{R.fmtDate(f.date, false)}</td><td className="whitespace-nowrap">{f.kind === "ha" ? <span className="inline-flex gap-1.5"><ChasedButton claimId={f.claim!.id} /><ChaseEmailButton claimId={f.claim!.id} to={haEmail(has.find(h => h.name === f.claim!.authorityName)?.id || "")} small /></span> : <Link href={`/clients/${f.clientId}`} className="btn btn-sm">Open</Link>}</td></tr>)}</tbody></table>}
        </Section>
        <Section title="Money in — invoice the client" right={<span className="meta">claims at step 11</span>}>
          {!d.refunds.length ? <Empty>No refunds waiting to be invoiced.</Empty> : <table className="tbl"><tbody>{d.refunds.map(k => <tr key={k.id}><td><ClientLink c={k.client} /><div className="meta"><ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} /> · {k.authority.name} · received {k.refundReceived ? R.fmtDate(k.refundReceived, false) : "—"}</div></td><td className="num whitespace-nowrap">{R.money(k.amount, k.currency === "NZD" ? "NZD" : undefined)}<div className="meta">fee {R.money(R.feeAUD(k))}</div></td><td className="whitespace-nowrap"><SendMessageButton clientId={k.clientId} claimId={k.id} templateKey="invoice" label="Email invoice" small /></td></tr>)}</tbody></table>}
          {d.idNeeded.length > 0 && <div className="mt-4 pt-3 border-t border-line"><div className="font-semibold text-[14px] mb-2">Waiting on ID & address evidence ({d.idNeeded.length})</div><table className="tbl"><tbody>{d.idNeeded.map(k => <tr key={k.id}><td><ClientLink c={k.client} /> <span className="meta">· <ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} /> · {k.authority.name}</span></td><td className="whitespace-nowrap"><SendMessageButton clientId={k.clientId} claimId={k.id} templateKey="id_request" label="Email ID request" small /></td></tr>)}</tbody></table></div>}
        </Section>
      </div>
      <p className="meta mt-6">This week: {d.sentWeek} message{d.sentWeek === 1 ? "" : "s"} sent · {d.signedWeek} Authority to Act signed online · {d.optOuts} opt-out{d.optOuts === 1 ? "" : "s"}.</p>
    </>
  );
}
