import { signRequestByToken } from "@/lib/services/comms";
import * as R from "@/lib/rules";
import { SignForm } from "./SignForm";

/** Public e-sign page for an Authority to Act. No login: the token in the link is the credential. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await signRequestByToken(token);
  if (!r) return <Wrap><h1>Link not recognised</h1><p className="lede">This signing link isn't valid. Please contact the sender for a new one.</p></Wrap>;
  const { req, org } = r;
  const cl = req.client; const name = cl.clientType === "BUSINESS" ? R.displayName(cl) : [cl.firstName, cl.surname].filter(Boolean).join(" ") || R.displayName(cl);
  if (req.status === "SIGNED") return <Wrap org={org.name}><h1>Already signed</h1><p className="lede">Thanks {req.signerName} — this Authority to Act was signed on {req.signedAt ? R.fmtDate(req.signedAt.toISOString().slice(0, 10)) : ""}. A copy has been emailed to you.</p></Wrap>;
  if (req.status !== "VIEWED" && req.status !== "SENT") return <Wrap org={org.name}><h1>This document is no longer open</h1><p className="lede">It has {req.status === "EXPIRED" ? "expired" : "been withdrawn"}. Please contact {org.name}{org.phone ? ` on ${org.phone}` : ""} for a new link.</p></Wrap>;
  return (
    <Wrap org={org.name}>
      <h1>Authority to Act</h1>
      <p className="lede">Prepared for <b>{name}</b> by {org.name}. Please read it, then sign below. Signing takes about a minute.</p>
      <article className="card mt-6 whitespace-pre-wrap text-[15px] leading-relaxed">{req.documentText}</article>
      <SignForm token={token} defaultName={name} org={org.name} />
      <p className="meta mt-8">Questions? {org.phone ? `Call ${org.phone}` : "Reply to the email you received"}. {org.name}{org.postalAddress ? ` · ${org.postalAddress}` : ""}</p>
    </Wrap>
  );
}
function Wrap({ children, org }: { children: React.ReactNode; org?: string }) {
  return <main className="min-h-screen px-5 py-10"><div className="max-w-[760px] mx-auto">{org && <div className="eyebrow mb-3">{org}</div>}{children}</div></main>;
}
