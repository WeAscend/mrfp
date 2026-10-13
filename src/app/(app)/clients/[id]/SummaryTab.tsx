import * as R from "@/lib/rules";
import { Section, FollowUpItem, ClaimLink, ClientLink, Empty } from "@/components/ui";
import { DateField, SelectField, Static } from "@/components/fields";
import { Notes } from "./Notes";
import type { Ctx } from "./ctx";

export function SummaryTab({ t, c, fus, byId, related }: Ctx) {
  const open = c.claims.filter(R.isOpen);
  const ids: [string, "idLicence" | "idPassport" | "idMedicare" | "idOther"][] = [["Licence", "idLicence"], ["Passport", "idPassport"], ["Medicare", "idMedicare"], ["Other", "idOther"]];
  return (
    <div className="flex flex-wrap gap-5 items-start">
      <div className="flex-1 basis-[520px] flex flex-col gap-5 min-w-0">
        <Section id="followups" title="Upcoming follow-ups"><div className="flex flex-col gap-2">{fus.map((f, i) => <FollowUpItem key={i} f={f} today={t.today} />)}{!fus.length && <Empty>Nothing scheduled.</Empty>}</div></Section>
        <Section title="Active claims"><div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Claim ID</th><th>Holding Authority</th><th>Claim Progress</th><th className="num">Amount</th></tr></thead><tbody>
          {open.map(k => <tr key={k.id}><td><ClaimLink clientId={c.id} id={k.id} claimId={k.claimId} /></td><td>{byId[k.authorityId]?.name}{k.companies.length ? ` · ${k.companies.map(x => x.company.name).join(", ")}` : ""}</td><td>{k.progress ? `${k.progress} · ${R.stepName(k.progress, t.org.shortName)}` : <span className="chip chip-amber">blank</span>}</td><td className="num">{R.money(k.amount, k.currency)}</td></tr>)}
          {!open.length && <tr><td colSpan={4}><Empty>No open claims.</Empty></td></tr>}
        </tbody></table></div></Section>
        <Notes c={c} t={t} byId={byId} />
      </div>
      <div className="flex-1 basis-[380px] flex flex-col gap-5 min-w-0">
        <Section title="Contact"><div className="grid2"><Static label="Mobile">{c.phoneMobile}</Static><Static label="Other">{c.phoneOther}</Static><Static label="Email" className="span2">{c.email}</Static><Static label="Current address" className="span2">{c.currentAddress}</Static>{c.clientType === "BUSINESS" && <Static label="Business contact" className="span2">{c.businessContact}</Static>}{c.addressOnUCM && <Static label="Address on UCM" className="span2">{c.addressOnUCM}</Static>}</div></Section>
        <Section title="ID received"><dl className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1.5 text-[14px]">{ids.map(([l, k]) => <div key={k} className="contents"><dt>{l}</dt><dd className={`text-right m-0 ${c[k] ? "font-semibold" : "text-ink3"}`}>{c[k] ? R.fmtDate(c[k]!) : "Not yet"}</dd></div>)}</dl>
          <div className="grid2 mt-3">{ids.map(([l, k]) => <DateField key={k} kind="client" id={c.id} field={k} label={`${l} received`} value={c[k]} />)}</div></Section>
        <Section title="A2A & related"><div className="grid2"><Static label="A2A Sent">{c.a2aSent ? R.fmtDate(c.a2aSent) : "—"}</Static><Static label="A2A Signed & Received">{c.a2aSigned ? R.fmtDate(c.a2aSigned) : "—"}</Static>
          <Static label="Related clients" className="span2">{related.length ? <span className="inline-flex flex-wrap gap-2">{related.map(r => <ClientLink key={r.id} c={r} />)}</span> : "—"}</Static>
          {c.stage === "INACTIVE" && <><DateField kind="client" id={c.id} field="becameNonActive" label="Became Non-Active" value={c.becameNonActive} /><SelectField kind="client" id={c.id} field="inactiveReason" label="Inactive Reason" value={c.inactiveReason} options={R.INACTIVE_REASONS} blank="(blank)" /></>}
          {c.stage !== "LEAD" && c.leadIdentifier && <Static label="Lead Identifier (history)">{c.leadIdentifier}</Static>}
        </div></Section>
      </div>
    </div>
  );
}
