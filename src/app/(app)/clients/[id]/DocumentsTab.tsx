import * as R from "@/lib/rules";
import { Section, Empty, FillFormLinks } from "@/components/ui";
import { FileUpload } from "@/components/actionsClient";
import type { ClientFull } from "@/lib/services/clients";
import type { Ctx } from "./ctx";

const isImage = (m: string) => m.startsWith("image/");
const kb = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Attachments: images open full size when clicked (Spec 4.3). */
export function Attachments({ c, grid }: { c: ClientFull; grid?: boolean }) {
  const files = c.attachments;
  if (!files.length) return <Empty>No files yet.</Empty>;
  if (grid) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">{files.map(f => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="border border-line rounded-lg overflow-hidden no-underline block">
    {isImage(f.mime) ? <img src={`/api/files/${f.id}`} alt={f.name} className="h-[150px] w-full object-cover bg-panel" /> : <div className="h-[150px] bg-panel flex items-center justify-center meta">{f.mime.split("/")[1]?.toUpperCase() || "FILE"}</div>}
    <div className="px-2.5 py-2 text-[13px]">{f.name}<br /><span className="meta">{f.uploadedBy} · {R.fmtDate(f.createdAt.toISOString().slice(0, 10))}</span></div></a>)}</div>;
  return <div className="overflow-x-auto -mx-2"><table className="tbl"><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Added by</th><th>Date</th><th>Claim</th></tr></thead><tbody>
    {files.map(f => <tr key={f.id}><td><a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="link">{f.name}</a></td><td>{f.mime}</td><td>{kb(f.size)}</td><td>{f.uploadedBy}</td><td>{R.fmtDate(f.createdAt.toISOString().slice(0, 10))}</td><td>{f.claimId ? c.claims.find(k => k.id === f.claimId)?.claimId : "—"}</td></tr>)}
  </tbody></table></div>;
}
export function DocumentsTab({ c, forms }: Ctx) {
  return <Section title="Documents" right={<span className="inline-flex gap-3 items-center flex-wrap"><FillFormLinks forms={forms} clientId={c.id} /><FileUpload clientId={c.id} compact /></span>}>
    <p className="meta mb-3">Files are copied into the organisation's own storage and linked to this client. This is the long-term store.</p>
    <Attachments c={c} />
    <div className="mt-3.5"><FileUpload clientId={c.id} label="Drop files here" /></div>
  </Section>;
}
