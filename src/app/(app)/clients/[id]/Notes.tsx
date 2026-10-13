import Link from "next/link";
import * as R from "@/lib/rules";
import { NoteBox, NoteDate } from "@/components/actionsClient";
import { Section, Empty } from "@/components/ui";
import type { Ctx } from "./ctx";
import { claimRef } from "./ctx";

/** All notes for a client live in one list; the Claims tab shows the same list filtered to that claim (not copies). */
export function Notes({ c, t, byId, claimId, bare }: Pick<Ctx, "c" | "t" | "byId"> & { claimId?: string; bare?: boolean }) {
  const notes = c.notes.filter(n => !claimId || n.claimId === claimId);
  const body = (
    <>
      <NoteBox clientId={c.id} claimId={claimId} today={t.today} placeholder={claimId ? "Type a note for this claim…" : "Type a call note… Enter to save, Shift+Enter for a new line"} />
      <div className="flex flex-col gap-2 mt-3.5">
        {notes.map(n => { const k = n.claimId ? c.claims.find(x => x.id === n.claimId) : null; return (
          <div key={n.id} className={`border-t border-line pt-2.5 ${n.system ? "opacity-75 italic" : ""}`}>
            <div className="meta flex flex-wrap items-center gap-x-1.5"><b>{n.authorCode}</b> · {n.system ? R.fmtDate(n.date) : <NoteDate noteId={n.id} value={n.date} />}{k && <> · <Link href={`/clients/${c.id}?tab=claims&claim=${k.id}`} className="chip !text-[12px] !py-px no-underline">{claimRef(k, byId[k.authorityId]?.name ?? "")} ›</Link></>}</div>
            <div className="mt-1 whitespace-pre-line">{n.text}</div>
          </div>); })}
        {!notes.length && <Empty>No notes yet.</Empty>}
      </div>
    </>
  );
  return bare ? <div><h2>{claimId ? "Notes for this claim" : "Notes"}</h2>{body}</div> : <Section id="notes" title={claimId ? "Notes for this claim" : "Notes"}>{body}</Section>;
}
