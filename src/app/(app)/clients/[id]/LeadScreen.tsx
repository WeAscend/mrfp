import Link from "next/link";
import * as R from "@/lib/rules";
import { Section, SCChips, FollowUpItem } from "@/components/ui";
import { TextField, TextArea, SelectField, DateField, ChipMulti, MoneyField, Static } from "@/components/fields";
import { LeadIdentifierSelect, A2ASignedField, SetInactiveButton, FileUpload } from "@/components/actionsClient";
import { Notes } from "./Notes";
import { Attachments } from "./DocumentsTab";
import type { Ctx } from "./ctx";

/** Spec 4.1: a single compact screen — typing kept to phones, contact details and notes as calls happen. */
export function LeadScreen({ t, c, fus, byId }: Ctx) {
  const search = c.searchLog[0];
  return (
    <>
      <div className="meta mb-2.5"><Link href="/leads" className="text-ink3">Leads</Link> › {c.leadIdentifier || "No identifier"}</div>
      {c.checklist && <div className="warn-box mb-3.5">Migration check-list: {c.checklist}</div>}
      <Section className="!bg-panel">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex-1 basis-[360px]"><h1>{R.displayName(c)}</h1><div className="flex flex-wrap gap-2 items-center mt-2"><span className="chip">Lead</span><SCChips list={c.specialConditions} empty="" /><span className="meta">{c.clientType === "BUSINESS" ? "Business" : "Individual"} · Owner <b>{c.ownerCode}</b> · Last updated by <b>{c.lastUpdatedBy ?? "—"}</b>, {R.fmtDate(c.lastUpdatedAt.toISOString().slice(0, 10))}</span></div></div>
          <label className="label uppercase tracking-wider text-[12px]">Lead Identifier<LeadIdentifierSelect clientId={c.id} value={c.leadIdentifier} /></label>
          <div className="flex gap-2.5 flex-wrap"><Link href={`/clients/${c.id}?tab=profile`} className="btn">Show full record</Link><a href="#noteBox" className="btn btn-primary">Log a call note</a><SetInactiveButton clientId={c.id} openClaims={0} name={R.displayName(c)} /></div>
        </div>
      </Section>
      <div className="flex flex-wrap gap-5 items-start mt-5">
        <div className="flex-1 basis-[420px] flex flex-col gap-5 min-w-0">
          <Section title="Contact"><div className="grid2">
            {c.clientType === "BUSINESS" ? <TextArea kind="client" id={c.id} field="businessNames" label="Business Names (first is the main name)" value={c.businessNames} lines className="span2" /> : <><TextField kind="client" id={c.id} field="surname" label="Surname" value={c.surname} /><TextField kind="client" id={c.id} field="firstName" label="First Name" value={c.firstName} /></>}
            <TextField kind="client" id={c.id} field="phoneMobile" label="Phone - Mobile" value={c.phoneMobile} hint="Any text, e.g. '0412 345 678 ext 22'" /><TextField kind="client" id={c.id} field="phoneOther" label="Phone - Other" value={c.phoneOther} />
            <TextArea kind="client" id={c.id} field="email" label="Email" value={c.email} placeholder="One per line" className="span2" />
            <SelectField kind="client" id={c.id} field="source" label="Source" value={c.source} options={R.SOURCES} blank="—" />
            <ChipMulti kind="client" id={c.id} field="specialConditions" label="Special Condition" value={c.specialConditions} options={R.SPECIAL_CONDITIONS} />
          </div></Section>
          <Section title="What we found">
            <div className="flex items-baseline gap-3 flex-wrap"><span className="font-head text-[30px] font-bold">{R.money(c.leadAmount)}</span><span className="meta">Lead Amount (estimate)</span></div>
            <div className="grid2 mt-3"><MoneyField kind="client" id={c.id} field="leadAmount" label="Lead Amount" value={c.leadAmount} /><Static label="Found at">{search ? <span className="inline-flex flex-wrap gap-1.5">{search.authorities.map(a => <span key={a} className="chip chip-outline">{a}</span>)}<span className="meta self-center">{R.fmtDate(search.date, false)}</span></span> : <span className="meta">No search logged — add one on the full record</span>}</Static>
            <TextField kind="client" id={c.id} field="addressOnUCM" label="Address on UCM" value={c.addressOnUCM} className="span2" hint="Exactly as written on the register" /></div>
          </Section>
          <Section title="Follow up"><div className="grid2">
            <DateField kind="client" id={c.id} field="followUp" label="Follow Up" value={c.followUp} /><TextField kind="client" id={c.id} field="followUpReason" label="Reason" value={c.followUpReason} list="fu-reasons" />
            <Static label="Last Contact">{c.lastContact ? `${R.fmtDate(c.lastContact)} · ${R.daysBetween(c.lastContact, t.today)} days ago` : "—"}</Static>
            <DateField kind="client" id={c.id} field="infoEmailSent" label="Info Email Sent" value={c.infoEmailSent} />
            <DateField kind="client" id={c.id} field="a2aSent" label="A2A Sent" value={c.a2aSent} hint="Starts the A2A chase" /><A2ASignedField clientId={c.id} value={c.a2aSigned} />
          </div>{fus.length > 0 && <div className="flex flex-col gap-2 mt-3.5">{fus.map((f, i) => <FollowUpItem key={i} f={f} today={t.today} />)}</div>}
          <datalist id="fu-reasons">{R.FOLLOW_UP_REASONS.map(r => <option key={r} value={r} />)}</datalist></Section>
        </div>
        <div className="flex-1 basis-[520px] flex flex-col gap-5 min-w-0">
          <Section title="Attachments" right={<FileUpload clientId={c.id} compact label="Add file" />}>
            <Attachments c={c} grid />
            <div className="mt-3.5"><FileUpload clientId={c.id} label="Drop register or Acceleon screenshots here" /></div>
          </Section>
          <Notes c={c} t={t} byId={byId} />
        </div>
      </div>
    </>
  );
}
