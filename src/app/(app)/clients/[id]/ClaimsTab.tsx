import Link from "next/link";
import * as R from "@/lib/rules";
import { Section, ClaimLink, ClientLink, Empty } from "@/components/ui";
import { TextField, SelectField, DateField, MoneyField, Static } from "@/components/fields";
import { OpenClaimForm, ProgressSelect, ChasedButton, AddA2AButton, A2ASignedInput, AddResubmissionButton, MultiLink, FileUpload, BinButton } from "@/components/actionsClient";
import { Notes } from "./Notes";
import type { Ctx } from "./ctx";

export function ClaimsTab(ctx: Ctx & { focus?: string }) {
  const { t, c, authorities, byId, focus } = ctx;
  const ks = c.claims, open = ks.filter(R.isOpen), closed = ks.filter(R.isClosed);
  const f = (focus && ks.find(k => k.id === focus)) || ks[0];
  const disabledReason = c.stage === "LEAD" ? "Claims cannot be opened for a Lead — enter A2A Signed & Received first" : !c.clientCode ? "No Client Code yet" : undefined;
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><div className="flex gap-3 items-center"><span className="chip">{open.length} open</span><span className="meta">{closed.length} closed{ks.length - open.length - closed.length ? ` · ${ks.length - open.length - closed.length} no status` : ""}</span></div><OpenClaimForm clientId={c.id} authorities={authorities.map(a => ({ id: a.id, name: a.name, code: a.code }))} disabledReason={disabledReason} /></div>
      {f ? <ClaimCard {...ctx} k={f} /> : <Section><Empty>No claims yet.</Empty></Section>}
      <div className="flex flex-col gap-2 mt-4">{ks.filter(k => k !== f).map(k => { const fu = ctx.fus.find(x => x.claimId === k.id); return (
        <div key={k.id} className="card-plain !py-3.5 flex flex-wrap gap-x-5 gap-y-2 items-center"><span className="font-bold basis-[140px]"><ClaimLink clientId={c.id} id={k.id} claimId={k.claimId} /></span><span>{byId[k.authorityId]?.name}</span><span className="flex-1 min-w-[120px]">{k.progress ? `${k.progress} · ${R.stepName(k.progress, t.org.shortName)}` : <span className="chip chip-amber">no status</span>}</span><span>{R.money(k.amount, k.currency)}</span><span className={`meta ${fu?.overdue ? "red" : ""}`}>{fu ? `${fu.kind === "ha" ? "Next follow-up" : fu.kind === "a2a" ? "A2A chase" : "Follow-up"} ${R.fmtDate(fu.date, false)}${fu.overdue ? " · overdue" : ""}` : ""}</span><Link href={`/clients/${c.id}?tab=claims&claim=${k.id}`} className="btn btn-sm">Open</Link></div>); })}</div>
    </>
  );
}

function ClaimCard({ t, c, k, byId, ocs, others, fus }: Ctx & { k: Ctx["c"]["claims"][number] }) {
  const ha = byId[k.authorityId]; const fee = R.feeAUD(k); const g = R.gstBreakdown(fee, k.gstTreatment, Number(t.org.gstRate));
  const kfu = { ...k, resubmissions: k.resubmissions.map(r => r.date), a2aLog: k.a2aLog }; const next = R.nextHAFollowUp(kfu, ha); const latest = R.latestSubmission(kfu);
  const chasedAfter = !!(k.lastChased && latest && k.lastChased >= latest);
  const joint = k.jointOwners.map(j => j.client);
  const idLine = (x: { idLicence: string | null; idMedicare: string | null; idPassport: string | null; idOther: string | null }) => [["Licence", x.idLicence], ["Medicare", x.idMedicare], ["Passport", x.idPassport], ["Other", x.idOther]].map(([l, d]) => d ? `${l} ${R.fmtDate(d, false)}` : `${l} not yet`).join(" · ");
  const D = (label: string, field: string, value: string | null) => <div className="flex justify-between items-center gap-2.5 py-1.5 border-b border-line text-[14px]"><span className="flex-1">{label}</span><DateField kind="claim" id={k.id} field={field} value={value} className="!w-[150px] !h-[30px] text-[13px] shrink-0" /></div>;
  const addrs = [c.currentAddress, ...c.previousAddresses].filter(Boolean) as string[];
  const screenshot = c.attachments.find(a => a.id === k.screenshotId);
  const a2aChase = fus.find(x => x.kind === "a2a" && x.claimId === k.id);
  return (
    <div className="card-plain !px-6 !py-5 !border-ink3">
      {k.checklist && <div className="warn-box mb-3">Migration check-list: {k.checklist}</div>}
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 items-start">
        <div><h2 className="text-[22px] !mb-0">{k.claimId} <span className="meta font-body font-normal text-[15px]">{ha?.name}{k.companies.length ? ` · ${k.companies.map(x => x.company.name).join(", ")}` : ""}</span></h2>
          <div className="meta mt-1">{joint.length > 0 && <>Joint with {joint.map((j, i) => <span key={j.id}>{i > 0 && ", "}<ClientLink c={j} /></span>)} · </>}Last updated by <b>{k.lastUpdatedBy}</b>, {R.fmtDate(k.lastUpdatedAt.toISOString().slice(0, 10))}{k.migratedNo ? ` · Airtable claim no. ${k.migratedNo}` : ""}</div></div>
        <div className="flex gap-3 items-end"><label className="label uppercase tracking-wider text-[12px] min-w-[300px]">Claim Progress<ProgressSelect claimId={k.id} value={k.progress} org={t.org.shortName} /></label>{t.isAdmin && <BinButton kind="claim" id={k.id} />}</div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1 text-[12px] my-4">{R.STEPS.map(([n, l]) => <span key={n} title={l} className={`px-1.5 py-1 rounded-md border ${k.progress && n < k.progress && !R.CLOSING_STEPS.includes(n) ? "bg-lime-soft border-transparent text-ink" : "border-line text-ink3"} ${k.progress === n ? "!bg-lime !border-lime !text-navy font-semibold" : ""}`}>{n} {l.replace("{ORG}", t.org.shortName).slice(0, 22)}{l.length > 22 ? "…" : ""}</span>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-7 gap-y-5">
        <div>
          <h3 className="text-[12px] uppercase tracking-wider text-ink3 font-bold mb-2.5">Claim details</h3>
          <div className="grid2">
            <MoneyField kind="claim" id={k.id} field="amount" label="Amount" value={k.amount} /><SelectField kind="claim" id={k.id} field="currency" label="Currency" value={k.currency} options={["AUD", "NZD"]} />
            <TextField kind="claim" id={k.id} field="accountName" label="Account Name on Register" value={k.accountName} className="span2" />
            <TextField kind="claim" id={k.id} field="reference" label="Reference Number (OTN)" value={k.reference} hint="Stored as text" /><TextField kind="claim" id={k.id} field="year" label="Year" value={k.year} hint="SRO Vic: full date as shown" />
            <TextField kind="claim" id={k.id} field="addressOnRegister" label="Address on Register" value={k.addressOnRegister} className="span2" list={`addr-${k.id}`} hint="Pick or type; a new one is added to Previous Addresses" /><datalist id={`addr-${k.id}`}>{addrs.map(a => <option key={a} value={a} />)}</datalist>
            <div className="span2"><MultiLink label="Originating Company (one or more)" value={k.companies.map(x => x.companyId)} options={ocs.map(o => ({ id: o.id, name: o.name }))} target="companies" id={k.id} /></div>
            <div className="span2"><MultiLink label="Joint with" value={joint.map(j => j.id)} options={others} target="joint" id={k.id} /></div>
          </div>
          <h3 className="text-[12px] uppercase tracking-wider text-ink3 font-bold mt-4 mb-2.5">Fee</h3>
          <div className="grid3">
            <TextField kind="claim" id={k.id} field="feePct" label="Fee for Service %" value={k.feePct ? String(Number(k.feePct)) : ""} list={`fees-${k.id}`} /><datalist id={`fees-${k.id}`}>{R.FEE_OPTIONS.map(x => <option key={x} value={x} />)}</datalist>
            {k.currency === "NZD" && k.progress !== 12 ? <MoneyField kind="claim" id={k.id} field="feeManual" label="Fee (AUD) — typed" value={k.feeManual} /> : <Static label="Fee (AUD)">{R.money(fee)}</Static>}
            <SelectField kind="claim" id={k.id} field="gstTreatment" label="GST Treatment" value={k.gstTreatment} options={["+ GST", "Inclusive of GST"]} />
            <Static label="Fee ex GST">{R.money(g.exGst)}</Static><Static label="GST">{R.money(g.gst)}</Static><Static label="Total Invoiced"><b>{R.money(g.total)}</b></Static>
          </div>
          {k.currency === "NZD" && <div className="meta mt-1.5">NZD claim: the fee is typed in AUD at the rate on the day the A2A was written.</div>}
          <h3 className="text-[12px] uppercase tracking-wider text-ink3 font-bold mt-4 mb-2">ID status (from Client)</h3>
          <div className="text-[14px]"><b>{c.firstName || R.displayName(c)}:</b> {idLine(c)}{joint.map(j => <div key={j.id}><b>{j.firstName || R.displayName(j)} (joint):</b> {idLine(j)}</div>)}</div>
        </div>
        <div>
          <h3 className="text-[12px] uppercase tracking-wider text-ink3 font-bold mb-2.5">Dates</h3>
          <div className="flex justify-between items-center py-1.5 border-b border-line text-[14px]"><span>Authority to Act</span><AddA2AButton claimId={k.id} today={t.today} /></div>
          {k.a2aLog.map((e, i) => <div key={e.id} className="flex justify-between items-center gap-2 py-1.5 pl-3 border-b border-line text-[14px]"><span className="meta flex-1">{i + 1} · Sent {e.sent ? R.fmtDate(e.sent) : "—"}{e.reason ? ` (${e.reason})` : ""}</span>{e.signed ? <b>Signed {R.fmtDate(e.signed)}</b> : <A2ASignedInput entryId={e.id} value={e.signed} />}</div>)}
          {!k.a2aLog.length && <div className="meta py-1.5 pl-3 border-b border-line">None yet</div>}
          {a2aChase && <div className={`meta pl-3 py-1 ${a2aChase.overdue ? "red" : ""}`}>A2A chase from {R.fmtDate(a2aChase.date)}</div>}
          {D("Address Verification Received", "addressVerification", k.addressVerification)}{D("HA Forms Sent for Signature", "haFormSent", k.haFormSent)}{D("HA Forms Signed & Received", "haFormSigned", k.haFormSigned)}{D("Date Submitted", "dateSubmitted", k.dateSubmitted)}
          <div className="flex justify-between items-center py-1.5 border-b border-line text-[14px]"><span>Date Resubmitted</span><AddResubmissionButton claimId={k.id} today={t.today} /></div>
          {k.resubmissions.map(r => <div key={r.id} className="meta py-1.5 pl-3 border-b border-line">{R.fmtDate(r.date)}</div>)}{!k.resubmissions.length && <div className="meta py-1.5 pl-3 border-b border-line">None yet</div>}
          {D("Claim Approved", "claimApproved", k.claimApproved)}{D("Refund Received", "refundReceived", k.refundReceived)}{D(`${t.org.shortName} Invoice Sent`, "invoiceSent", k.invoiceSent)}{D(`${t.org.shortName} Payment Received`, "paymentReceived", k.paymentReceived)}{D("Review Requested", "reviewRequested", k.reviewRequested)}{D("Review Completed", "reviewCompleted", k.reviewCompleted)}
          {k.closedOn && <div className="flex justify-between py-1.5 text-[14px]"><span>Closed (from Activity Log)</span><b>{R.fmtDate(k.closedOn)}</b></div>}
        </div>
        <div>
          <section className="card !p-4"><h2 className="text-[15px]">Follow-ups</h2>
            {ha?.chaseAfter ? <div className="text-[14px]"><b>Next {ha.name} follow-up:</b> {next ? <span className={next < t.today ? "red" : ""}>{R.fmtDate(next)}{next < t.today ? " · overdue" : ""}</span> : "—"}<div className="meta">{latest ? `Submitted ${R.fmtDate(latest)} + ${ha.chaseAfter} days` : "Not submitted yet"} · last chased {k.lastChased ? `${R.fmtDate(k.lastChased)} by ${k.lastChasedBy}` : "—"}{chasedAfter ? ` → +${ha.rechaseAfter} days` : ""}</div>{next && <ChasedButton claimId={k.id} className="mt-2" />}</div> : <div className="meta">{ha?.name} has no follow-up rule.</div>}
            <div className="grid2 mt-3"><DateField kind="claim" id={k.id} field="followUp" label="Claim Follow Up" value={k.followUp} /><TextField kind="claim" id={k.id} field="followUpReason" label="Reason" value={k.followUpReason} list="fu-reasons-k" /><datalist id="fu-reasons-k">{R.FOLLOW_UP_REASONS.map(r => <option key={r} value={r} />)}</datalist></div>
          </section>
          <h3 className="text-[12px] uppercase tracking-wider text-ink3 font-bold mt-4 mb-2">Holding Authority screenshot</h3>
          {screenshot ? <a href={`/api/files/${screenshot.id}`} target="_blank" rel="noopener" className="block border border-line rounded-lg overflow-hidden"><img src={`/api/files/${screenshot.id}`} alt={screenshot.name} className="max-h-[220px] w-full object-contain bg-panel" /><div className="meta px-2.5 py-1.5">{screenshot.name} · click to open full size</div></a> : null}
          <div className="mt-2"><FileUpload clientId={c.id} claimId={k.id} label={screenshot ? "Replace screenshot" : "Drop the register screenshot here"} accept="image/*,.pdf" /></div>
          <div className="mt-4"><Notes c={c} t={t} byId={byId} claimId={k.id} bare /></div>
        </div>
      </div>
    </div>
  );
}
