import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { getClient, relatedOf } from "@/lib/services/clients";
import { authorityMap, companies, claimsForFU } from "@/lib/services/queries";
import { members } from "@/lib/services/org";
import { timeline, channelState } from "@/lib/services/comms";
import { listForms } from "@/lib/services/forms";
import { db, schema } from "@/db";
import { and, eq, isNull, ne } from "drizzle-orm";
import * as R from "@/lib/rules";
import { StageChip, SCChips } from "@/components/ui";
import { SetInactiveButton, BinButton } from "@/components/actionsClient";
import { SelectField } from "@/components/fields";
import { LeadScreen } from "./LeadScreen";
import { SummaryTab } from "./SummaryTab";
import { ProfileTab } from "./ProfileTab";
import { ClaimsTab } from "./ClaimsTab";
import { DocumentsTab } from "./DocumentsTab";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; claim?: string }> }) {
  const t = await requireTenant(); const { id } = await params; const sp = await searchParams;
  const c = await getClient(t, id); if (!c) notFound();
  const [{ list: authorities, byId }, ocs, users, others] = await Promise.all([authorityMap(t), companies(t), members(t), db.select({ id: schema.clients.id, clientType: schema.clients.clientType, surname: schema.clients.surname, firstName: schema.clients.firstName, businessNames: schema.clients.businessNames }).from(schema.clients).where(and(eq(schema.clients.orgId, t.org.id), isNull(schema.clients.deletedAt), ne(schema.clients.id, id)))]);
  const [kfu, tl, forms] = await Promise.all([claimsForFU(t, id), timeline(t, id), listForms(t)]);
  const fus = R.followUpsForClient(c, kfu, byId, t.today, t.holidays, t.org.a2aChaseBusinessDays).map(f => ({ ...f, client: c, claim: f.claimId ? { id: f.claimId, claimId: kfu.find(k => k.id === f.claimId)!.claimId, authorityName: byId[kfu.find(k => k.id === f.claimId)!.authorityId]?.name ?? "" } : undefined }));
  const tab = sp.tab || (c.stage === "LEAD" ? "lead" : "summary");
  const ctx = { t, c, authorities, byId, ocs, users, others: others.map(o => ({ id: o.id, name: R.displayName(o) })), fus, related: relatedOf(c), forms: forms.map(f => ({ id: f.id, name: f.name, scope: f.scope })), tl, emailState: channelState(c, "EMAIL"), smsState: channelState(c, "SMS") };
  if (tab === "lead" && c.stage === "LEAD") return <LeadScreen {...ctx} />;

  const open = c.claims.filter(R.isOpen), nf = fus[0];
  const tabs = [["summary", "Summary"], ["profile", c.clientType === "BUSINESS" ? "Profile - Business" : "Profile - Personal"], ["claims", `Claims (${c.claims.length})`], ["documents", "Documents"]];
  return (
    <>
      {c.checklist && <div className="warn-box mb-3.5">Migration check-list: {c.checklist}</div>}
      <div className="hero !pb-0">
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-4 items-start">
          <div className="min-w-0"><div className="meta mb-1.5"><Link href={c.stage === "LEAD" ? "/leads" : "/clients"} className="no-underline">{c.stage === "LEAD" ? "Leads" : "Clients"}</Link> › {c.clientCode || "No code yet"}</div><h1>{R.displayName(c)}</h1><div className="flex flex-wrap gap-2 items-center mt-2.5"><StageChip stage={c.stage} /><SCChips list={c.specialConditions} empty="" />{c.stage === "INACTIVE" && c.inactiveReason && <span className="chip">{c.inactiveReason}</span>}{c.stage === "LEAD" && <Link href={`/clients/${c.id}?tab=lead`} className="link text-[13px]">Lead screen</Link>}</div></div>
          <div className="flex gap-2 flex-wrap">{c.stage !== "INACTIVE" && <SetInactiveButton clientId={c.id} openClaims={open.length} name={R.displayName(c)} />}{t.isAdmin && <BinButton kind="client" id={c.id} />}</div>
        </div>
        <div className="stat-row">
          <div>Owner{t.isAdmin ? <SelectField kind="client" id={c.id} field="ownerCode" value={c.ownerCode} options={users.map(u => u.userCode)} className="!h-7 !text-[13px] !w-auto" /> : <span>{c.ownerCode}</span>}</div>
          <div>Last contact<Link href={`/clients/${c.id}?tab=summary#notes`}>{c.lastContact ? `${R.fmtDate(c.lastContact, false)} · ${R.daysBetween(c.lastContact, t.today)} days` : "—"}</Link></div>
          <div>Next follow-up<Link href={`/clients/${c.id}?tab=summary#followups`} className={nf?.overdue ? "red" : ""}>{nf ? `${R.fmtDate(nf.date, false)}${nf.overdue ? " · overdue" : ""}` : "—"}</Link></div>
          <div>Open claims<Link href={`/clients/${c.id}?tab=claims`}>{open.length}</Link></div>
          <div>Lead amount<span>{R.money(c.leadAmount)}</span></div>
          <div>Last updated<span>{c.lastUpdatedBy ?? "—"}, {R.fmtDate(c.lastUpdatedAt.toISOString().slice(0, 10), false)}</span></div>
        </div>
        <nav className="tabs" aria-label="Client tabs">{tabs.map(([k, l]) => <Link key={k} href={`/clients/${c.id}?tab=${k}`} className={tab === k ? "on" : ""}>{l}</Link>)}</nav>
      </div>
      <div className="mt-5">
        {tab === "profile" ? <ProfileTab {...ctx} /> : tab === "claims" ? <ClaimsTab {...ctx} focus={sp.claim} /> : tab === "documents" ? <DocumentsTab {...ctx} /> : <SummaryTab {...ctx} />}
      </div>
    </>
  );
}
