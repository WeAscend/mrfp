import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenant } from "@/lib/tenant";
import { activity, listClaims } from "@/lib/services/queries";
import { members } from "@/lib/services/org";
import * as R from "@/lib/rules";
import { ClientLink, ClaimLink, Empty } from "@/components/ui";
import { FilterBar, ExportCsvButton } from "@/components/listClient";

type SP = { tab?: string; user?: string; entity?: string; ref?: string; from?: string; to?: string };
export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await requireTenant(); const sp = await searchParams; const tab = sp.tab || "sources";
  const tabs = [["sources", "Lead Source"], ["pipeline", "Monthly pipeline"], ["checklist", "Migration check-list"], ...(t.isAdmin ? [["activity", "Activity Log"]] : [])];
  let body: React.ReactNode = null;
  if (tab === "sources") {
    const cs = await db.select({ source: schema.clients.source, stage: schema.clients.stage }).from(schema.clients).where(and(eq(schema.clients.orgId, t.org.id), isNull(schema.clients.deletedAt)));
    const by: Record<string, { n: number; active: number }> = {}; for (const c of cs) { const k = c.source || "(blank)"; by[k] = by[k] || { n: 0, active: 0 }; by[k].n++; if (c.stage === "ACTIVE") by[k].active++; }
    const max = Math.max(1, ...Object.values(by).map(x => x.n));
    body = <div className="card"><h2>Lead Source report</h2><p className="meta mb-3">Clients by Source — all stages, with how many are Active now.</p><div className="flex flex-col gap-2">{Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([s, v]) => <div key={s} className="grid grid-cols-[200px_1fr_80px] gap-3 items-center text-[14px]"><span>{s}</span><div className="bg-chip rounded h-[18px]"><div className="bg-lime h-full rounded" style={{ width: `${v.n / max * 100}%` }} /></div><b className="text-right tabular-nums">{v.n} <span className="meta font-normal">({v.active} active)</span></b></div>)}{!Object.keys(by).length && <Empty>No clients yet.</Empty>}</div></div>;
  } else if (tab === "pipeline") {
    const ks = await listClaims(t, { view: "all" });
    const csv = [["Client", "Source", "Date entered", "A2A Sent", "A2A Signed", "Claim", "Authority", "Date Submitted", "Refund Received", "Closed", "Became Non-Active", "Fee %", "Fee (AUD)"], ...ks.map(k => [R.displayName(k.client), k.client.source ?? "", k.client.dateEntered, k.client.a2aSent ?? "", k.client.a2aSigned ?? "", k.claimId, k.authority.name, k.dateSubmitted ?? "", k.refundReceived ?? "", k.closedOn ?? "", k.client.becameNonActive ?? "", k.feePct ?? "", R.feeAUD(k) ?? ""])];
    body = <div className="card"><div className="flex justify-between items-center gap-3 mb-3"><h2 className="!mb-0">Monthly pipeline (Phase 2 preview)</h2><ExportCsvButton rows={csv} filename="pipeline.csv" /></div><div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Client</th><th>Source</th><th>Entered</th><th>A2A Sent</th><th>A2A Signed</th><th>Claim</th><th>Submitted</th><th>Refund</th><th>Closed</th><th>Non-Active</th><th className="num">Fee %</th><th className="num">Fee (AUD)</th></tr></thead><tbody>
      {ks.map(k => <tr key={k.id}><td><ClientLink c={k.client} /></td><td>{k.client.source}</td><td>{R.fmtDate(k.client.dateEntered, false)}</td><td>{R.fmtDate(k.client.a2aSent, false) || "—"}</td><td>{R.fmtDate(k.client.a2aSigned, false) || "—"}</td><td><ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} /></td><td>{R.fmtDate(k.dateSubmitted, false) || "—"}</td><td>{R.fmtDate(k.refundReceived, false) || "—"}</td><td>{R.fmtDate(k.closedOn, false) || "—"}</td><td>{R.fmtDate(k.client.becameNonActive, false) || "—"}</td><td className="num">{k.feePct ? `${Number(k.feePct)}%` : "—"}</td><td className="num">{R.money(R.feeAUD(k))}</td></tr>)}
      {!ks.length && <tr><td colSpan={12}><Empty>No claims yet.</Empty></td></tr>}</tbody></table></div></div>;
  } else if (tab === "checklist") {
    const cs = await db.select().from(schema.clients).where(and(eq(schema.clients.orgId, t.org.id), isNull(schema.clients.deletedAt)));
    const ks = await db.query.claims.findMany({ where: and(eq(schema.claims.orgId, t.org.id), isNull(schema.claims.deletedAt)) });
    const items = [...cs.filter(c => c.checklist).map(c => ({ key: c.id, who: <ClientLink c={c} />, what: c.checklist! })), ...ks.filter(k => k.checklist).map(k => ({ key: k.id, who: <ClaimLink clientId={k.clientId} id={k.id} claimId={k.claimId} />, what: k.checklist! }))];
    body = <div className="card"><h2>Migration check-list</h2><p className="meta mb-3">Things the migration could not decide, to sort out by hand. Clear a record's check-list note on its Profile tab once done.</p><div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Record</th><th>What to do</th></tr></thead><tbody>{items.map(i => <tr key={i.key}><td>{i.who}</td><td>{i.what}</td></tr>)}{!items.length && <tr><td colSpan={2}><Empty>Nothing on the check-list.</Empty></td></tr>}</tbody></table></div></div>;
  } else if (tab === "activity" && t.isAdmin) {
    const [rows, users] = await Promise.all([activity(t, sp), members(t)]);
    body = <div className="card"><h2>Activity Log</h2><p className="meta mb-3">Every add, edit and delete, read-only. Claim close dates come from the Claim Progress entries here.</p>
      <div className="flex flex-wrap items-end gap-2.5 mb-3"><FilterBar base="/reports?tab=activity&" current={sp as Record<string, string>} filters={[{ key: "user", label: "User", options: [...users.map(u => [u.userCode, u.userCode]), ["Migration", "Migration"], ["Import", "Import"]] }, { key: "entity", label: "Entity", options: ["Client", "Claim", "Note", "File", "Holding Authority", "Originating Company", "User"].map(x => [x, x]) }]} dateRange={{ fromKey: "from", toKey: "to", label: "Date" }} /><span className="meta">{rows.length} entries (latest 300)</span></div>
      <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Record</th><th>Field</th><th>Old value</th><th>New value</th></tr></thead><tbody>
        {rows.map(a => <tr key={String(a.id)}><td className="whitespace-nowrap">{a.timestamp.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{a.userCode}</td><td>{a.action.toLowerCase()}</td><td>{a.entityType}</td><td>{a.recordRef}</td><td>{a.field}</td><td className="max-w-[220px] truncate" title={a.oldValue ?? ""}>{a.oldValue}</td><td className="max-w-[260px] truncate" title={a.newValue ?? ""}>{a.newValue}</td></tr>)}
        {!rows.length && <tr><td colSpan={8}><Empty>No entries.</Empty></td></tr>}</tbody></table></div></div>;
  }
  return <><h1 className="mb-4">Reports</h1><div className="views mb-3.5"><Link href="/clients">Client reports ›</Link><Link href="/claims">Claim reports ›</Link>{tabs.map(([k, l]) => <Link key={k} href={`/reports?tab=${k}`} className={tab === k ? "on" : ""}>{l}</Link>)}</div>{body}</>;
}
