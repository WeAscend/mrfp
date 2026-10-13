import * as R from "@/lib/rules";
import { Section, Empty } from "@/components/ui";
import { TextField, TextArea, SelectField, DateField, ChipMulti, MoneyField, Static } from "@/components/fields";
import { MultiLink, AddSearchButton } from "@/components/actionsClient";
import type { Ctx } from "./ctx";

export function ProfileTab({ t, c, others, related, authorities }: Ctx) {
  const biz = c.clientType === "BUSINESS";
  const F = (p: { field: string; label: string; type?: string; className?: string }) => <TextField kind="client" id={c.id} value={(c as Record<string, unknown>)[p.field] as string | null} {...p} />;
  return (
    <div className="flex flex-wrap gap-5 items-start">
      <div className="flex-1 basis-[460px] flex flex-col gap-5 min-w-0">
        <Section title={biz ? "Business details" : "Personal details"}><div className="grid2">
          <SelectField kind="client" id={c.id} field="clientType" label="Client Type" value={c.clientType} options={[{ value: "INDIVIDUAL", label: "Individual" }, { value: "BUSINESS", label: "Business" }]} />
          <Static label="Client Code">{c.clientCode || "— (generated when Active)"}</Static>
          {biz ? <><TextArea kind="client" id={c.id} field="businessNames" label="Business Names (one per line; the first is the main name)" value={c.businessNames} lines className="span2" /><F field="abn" label="ABN" /><F field="acn" label="ACN" /><F field="website" label="Website" /><F field="businessContact" label="Business Contact (the person)" /></>
            : <><F field="surname" label="Surname" /><F field="firstName" label="First Name" /><F field="middleName" label="Middle Name" /><F field="preferredName" label="Preferred Name" /><F field="otherNames" label="Other names known by" className="span2" /><DateField kind="client" id={c.id} field="dob" label="DOB" value={c.dob} /><F field="businessContact" label="Executor/Administrator Details" /></>}
          <TextArea kind="client" id={c.id} field="email" label="Email (one per line)" value={c.email} className="span2" /><F field="phoneMobile" label="Phone - Mobile" /><F field="phoneOther" label="Phone - Other" />
          <F field="currentAddress" label="Current Address" className="span2" /><F field="currentPOBox" label="Current PO Box" /><F field="addressOnUCM" label="Address on UCM" />
          <TextArea kind="client" id={c.id} field="previousAddresses" label="Previous Addresses (one per line)" value={c.previousAddresses} lines rows={3} className="span2" />
        </div></Section>
      </div>
      <div className="flex-1 basis-[380px] flex flex-col gap-5 min-w-0">
        <Section title="Status & source"><div className="grid2">
          <Static label="Stage">{c.stage === "LEAD" ? "Lead" : c.stage === "ACTIVE" ? "Active" : "Inactive"}</Static><SelectField kind="client" id={c.id} field="source" label="Source" value={c.source} options={R.SOURCES} blank="—" />
          <Static label="Lead Identifier (history)">{c.leadIdentifier || "—"}</Static><DateField kind="client" id={c.id} field="dateEntered" label="Date entered" value={c.dateEntered} />
          <ChipMulti kind="client" id={c.id} field="specialConditions" label="Special Condition" value={c.specialConditions} options={R.SPECIAL_CONDITIONS} />
          <MoneyField kind="client" id={c.id} field="leadAmount" label="Lead Amount (estimate)" value={c.leadAmount} /><Static label="Info Email Sent">{c.infoEmailSent ? R.fmtDate(c.infoEmailSent) : "—"}</Static>
          <DateField kind="client" id={c.id} field="lastContact" label="Last Contact (editable; a later note replaces it)" value={c.lastContact} />
          <div className="span2"><MultiLink label="Related Client Records" value={related.map(r => r.id)} options={others} target="related" id={c.id} /></div>
        </div></Section>
        <Section title="Search log" right={<AddSearchButton clientId={c.id} authorities={authorities.map(a => a.name)} today={t.today} />}>
          <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Date searched</th><th>Holding Authorities found at</th></tr></thead><tbody>{c.searchLog.map(s => <tr key={s.id}><td>{R.fmtDate(s.date)}</td><td>{s.authorities.join(", ")}</td></tr>)}{!c.searchLog.length && <tr><td colSpan={2}><Empty>No searches logged.</Empty></td></tr>}</tbody></table></div>
        </Section>
      </div>
    </div>
  );
}
