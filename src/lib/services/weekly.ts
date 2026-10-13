// Weekly report (Decisions 6.2): MT's eight figures for a Monday–Sunday week, each with the records behind it.
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import * as R from "../rules";

const C = schema.clients, K = schema.claims;
export const weekStart = (iso: string) => { const d = R.parseISO(iso); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return R.iso(d); };
export type WeeklyRow = { client: schema.Client; claim?: schema.Claim & { authority: schema.HoldingAuthority }; date?: string | null; detail?: string };
export type WeeklyFigure = { n: number; label: string; note: string; rows: WeeklyRow[] };

export async function weeklyReport(t: Tenant, start: string) {
  const end = R.addDays(start, 6);
  const inWeek = (d: string | null | undefined) => !!d && d >= start && d <= end;
  const cs = await db.select().from(C).where(and(eq(C.orgId, t.org.id), isNull(C.deletedAt)));
  const ks = await db.query.claims.findMany({ where: and(eq(K.orgId, t.org.id), isNull(K.deletedAt)), with: { authority: true, client: true, a2aLog: true } });
  const byC = new Map(cs.map(c => [c.id, c]));
  // 1 & 3: client-level A2A plus claim-level re-sends
  const sentWeek: WeeklyRow[] = [...cs.filter(c => inWeek(c.a2aSent)).map(c => ({ client: c, date: c.a2aSent })), ...ks.flatMap(k => k.a2aLog.filter(e => inWeek(e.sent)).map(e => ({ client: k.client, claim: k, date: e.sent, detail: "re-sent" })))];
  const signedWeek: WeeklyRow[] = [...cs.filter(c => inWeek(c.a2aSigned)).map(c => ({ client: c, date: c.a2aSigned })), ...ks.flatMap(k => k.a2aLog.filter(e => inWeek(e.signed)).map(e => ({ client: k.client, claim: k, date: e.signed, detail: "re-sent" })))];
  // 2: out in total = sent, not yet signed, lead not ended
  const outTotal: WeeklyRow[] = [...cs.filter(c => c.a2aSent && !c.a2aSigned && c.stage !== "INACTIVE" && c.leadIdentifier !== "Leads No List").map(c => ({ client: c, date: c.a2aSent })), ...ks.filter(R.isOpen).flatMap(k => k.a2aLog.filter(e => e.sent && !e.signed).map(e => ({ client: k.client, claim: k, date: e.sent, detail: "re-sent" })))];
  const open = ks.filter(R.isOpen);
  const stageRows = (f: (k: typeof ks[number]) => boolean) => open.filter(f).map(k => ({ client: k.client, claim: k, date: null, detail: `${k.progress} · ${R.stepName(k.progress, t.org.shortName)}` }));
  const figures: WeeklyFigure[] = [
    { n: sentWeek.length, label: "A2As sent out this week", note: `A2A Sent dated ${R.fmtDate(start, false)}–${R.fmtDate(end, false)}, including re-sends`, rows: sentWeek },
    { n: outTotal.length, label: "A2As out in total", note: "Sent and not yet signed, on open leads/claims", rows: outTotal },
    { n: signedWeek.length, label: "A2As signed and returned this week", note: "A2A Signed & Received dated this week", rows: signedWeek },
    { n: open.length, label: "Claims pipeline — all stages", note: "Every open claim, by step", rows: stageRows(() => true) },
    { n: open.filter(k => k.progress !== 1).length, label: "Claims pipeline — excluding Not Started", note: "Open claims past step 1", rows: stageRows(k => k.progress !== 1) },
    { n: open.filter(k => k.progress != null && [7, 8, 9].includes(k.progress)).length, label: "Claims with the Holding Authority", note: `Steps 7–9 now · ${ks.filter(k => inWeek(k.dateSubmitted)).length} submitted this week`, rows: stageRows(k => k.progress != null && [7, 8, 9].includes(k.progress)) },
    { n: open.filter(k => k.progress != null && k.progress >= 10 && k.progress <= 12).length, label: "Claims approved", note: `Steps 10–12 now · ${ks.filter(k => inWeek(k.claimApproved)).length} approved this week`, rows: stageRows(k => k.progress != null && k.progress >= 10 && k.progress <= 12) },
    { n: open.filter(k => k.progress === 13).length, label: `${t.org.shortName} awaiting payment`, note: "Step 13, oldest invoice first", rows: open.filter(k => k.progress === 13).sort((a, b) => (a.invoiceSent || "") < (b.invoiceSent || "") ? -1 : 1).map(k => ({ client: k.client, claim: k, date: k.invoiceSent, detail: `invoice sent ${k.invoiceSent ? R.fmtDate(k.invoiceSent, false) : "—"} · fee ${R.money(R.feeAUD(k))}` })) },
  ];
  void byC;
  return { start, end, figures };
}
