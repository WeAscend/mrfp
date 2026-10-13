import Link from "next/link";
import * as R from "@/lib/rules";
import type { FollowUpRow } from "@/lib/services/queries";
import { DoneButton, ChasedButton } from "./actionsClient";

type NameLike = { id: string; clientType: string; surname?: string | null; firstName?: string | null; businessNames?: string[] | null; clientCode?: string | null; stage?: string; specialConditions?: string[]; checklist?: string | null };
export const StageChip = ({ stage }: { stage: string }) => <span className={`chip ${stage === "ACTIVE" ? "chip-lime" : stage === "LEAD" ? "chip-blue" : ""}`}>{stage === "LEAD" ? "Lead" : stage === "ACTIVE" ? "Active" : "Inactive"}</span>;
export const SCChips = ({ list, empty = "—" }: { list: string[]; empty?: string }) => list.length ? <span className="inline-flex flex-wrap gap-1.5">{list.map(s => <span key={s} className="chip chip-lime">{s}</span>)}</span> : <span className="meta">{empty}</span>;
export const ClientLink = ({ c, tab }: { c: NameLike; tab?: string }) => <Link href={`/clients/${c.id}${tab ? `?tab=${tab}` : ""}`} className="link">{R.displayName(c)}</Link>;
export const ClaimLink = ({ clientId, id, claimId }: { clientId: string; id: string; claimId: string }) => <Link href={`/clients/${clientId}?tab=claims&claim=${id}`} className="link">{claimId}</Link>;
export const ChecklistChip = ({ text }: { text?: string | null }) => text ? <span className="chip chip-amber ml-1" title={text}>check-list</span> : null;
export const Overdue = ({ date, today }: { date: string | null | undefined; today: string }) => !date ? <>—</> : <span className={date < today ? "red font-semibold" : ""}>{R.fmtDate(date, false)}{date < today ? " · overdue" : ""}</span>;

/** One follow-up line, as used on the client's Upcoming follow-ups panel and the Follow Up due list. */
export function FollowUpItem({ f, showClient, today }: { f: FollowUpRow; showClient?: boolean; today: string }) {
  return (
    <div className={`fu ${f.overdue ? "over" : ""}`}>
      <div className={`basis-[110px] shrink-0 font-bold ${f.overdue ? "red" : ""}`}>{R.fmtDate(f.date, false)}{f.overdue ? " · overdue" : ""}</div>
      <div className="flex-1 min-w-0">
        <b className="block">{showClient && <><ClientLink c={f.client} /> · </>}{f.claim ? <><ClaimLink clientId={f.clientId} id={f.claim.id} claimId={f.claim.claimId} />{f.label.slice(f.label.indexOf(" ·"))}</> : f.label}</b>
        <small className="meta">{f.sub}{f.setBy && f.setBy !== "Automatic" ? ` · set by ${f.setBy}` : ""}{showClient ? ` · Owner ${f.client.ownerCode}` : ""}</small>
      </div>
      {f.kind === "ha" && f.claim && <ChasedButton claimId={f.claim.id} />}
      {(f.kind === "client" || f.kind === "claim") && <DoneButton kind={f.kind} clientId={f.clientId} claimId={f.claim?.id} />}
      {f.kind === "a2a" && <span className="meta">{today >= f.date ? "Chase the A2A" : "Not yet due"}</span>}
    </div>
  );
}
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="meta text-center p-4">{children}</div>;
export const Section = ({ title, children, right, className, id }: { title?: string; children: React.ReactNode; right?: React.ReactNode; className?: string; id?: string }) => (
  <section id={id} className={`card-plain ${className ?? ""}`}>{(title || right) && <div className="flex justify-between items-center gap-3 mb-3.5"><h2 className="!mb-0">{title}</h2>{right}</div>}{children}</section>
);

/** "Fill form" links for a client/claim: plain downloads of the mapped PDFs (Decisions 6.5). */
export const FillFormLinks = ({ forms, clientId, claimId }: { forms: { id: string; name: string; scope: string }[]; clientId: string; claimId?: string | null }) => {
  const list = forms.filter(f => claimId ? true : f.scope === "CLIENT");
  if (!list.length) return null;
  return <span className="inline-flex flex-wrap gap-1.5 items-center"><span className="meta">Fill form:</span>{list.map(f => <a key={f.id} href={`/api/forms/${f.id}?client=${clientId}${claimId ? `&claim=${claimId}` : ""}`} className="btn btn-sm">{f.name}</a>)}</span>;
};
