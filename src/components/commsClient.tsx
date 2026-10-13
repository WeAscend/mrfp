"use client";
// Outreach controls: log a call (with consent capture), send a templated email/SMS with preview, send the A2A for
// e-signature, chase a holding authority by email, consent chips. All compliance gating happens server-side; these
// just show the state and the reason when a channel can't be used.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as A from "@/actions";
import { useToast } from "./Toast";
import { Modal } from "./actionsClient";
import { CALL_OUTCOMES, type CallOutcome, type ChannelState } from "@/lib/commsTypes";

function useAct() { const { report } = useToast(); const router = useRouter(); const [pending, start] = useTransition(); return { pending, act: (fn: () => Promise<A.ActionResult>, after?: (r: A.ActionResult) => void) => start(async () => { const r = await fn(); if (report(r)) { router.refresh(); after?.(r); } }) }; }

const STATE_LABEL: Record<ChannelState, string> = { ok: "consented", "no-consent": "no consent", "opted-out": "opted out", "no-address": "no address" };
export function ConsentChips({ clientId, email, sms, compact }: { clientId: string; email: ChannelState; sms: ChannelState; compact?: boolean }) {
  const { act, pending } = useAct(); const [open, setOpen] = useState<"EMAIL" | "SMS" | null>(null); const [method, setMethod] = useState("Phone call"); const [note, setNote] = useState("");
  const chip = (ch: "EMAIL" | "SMS", s: ChannelState) => <button key={ch} type="button" title={`${ch === "EMAIL" ? "Email" : "SMS"}: ${STATE_LABEL[s]} — click to change`} onClick={() => setOpen(ch)} className={`chip ${s === "ok" ? "chip-lime" : s === "opted-out" ? "chip-red" : s === "no-consent" ? "chip-amber" : ""} cursor-pointer`}>{ch === "EMAIL" ? "Email" : "SMS"}{compact ? ` ${s === "ok" ? "✓" : s === "opted-out" ? "✕" : "?"}` : ` · ${STATE_LABEL[s]}`}</button>;
  return <>
    <span className="inline-flex gap-1.5 flex-wrap items-center">{chip("EMAIL", email)}{chip("SMS", sms)}</span>
    {open && <Modal title={`${open === "EMAIL" ? "Email" : "SMS"} consent`} onClose={() => setOpen(null)}>
      <p className="meta mt-1">Under the Spam Act we can only email or text people who've agreed to it. Record how consent was given, or record an opt-out.</p>
      <label className="label mt-3">How was consent given?<select className="input" value={method} onChange={e => setMethod(e.target.value)}>{["Phone call", "Web form", "Written (email/letter)", "Existing client relationship", "In person"].map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="label mt-3">Note (optional)<input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Agreed on call 13 Oct, wants info by email" /></label>
      <div className="flex justify-between gap-2 mt-4 flex-wrap"><button className="btn btn-danger" disabled={pending} onClick={() => act(() => A.recordConsentAction(clientId, open, false, "Told us by " + method.toLowerCase(), note), () => setOpen(null))}>Record opt-out</button><div className="flex gap-2"><button className="btn" onClick={() => setOpen(null)}>Cancel</button><button className="btn btn-primary" disabled={pending} onClick={() => act(() => A.recordConsentAction(clientId, open, true, method, note), () => setOpen(null))}>Record consent</button></div></div>
    </Modal>}
  </>;
}

export function LogCallButton({ clientId, hasEmail, emailState, primary, outreach, label = "Log a call" }: { clientId: string; hasEmail: boolean; emailState: ChannelState; primary?: boolean; outreach?: boolean; label?: string }) {
  const [open, setOpen] = useState(false); const [outcome, setOutcome] = useState<CallOutcome>("Spoke"); const [note, setNote] = useState(""); const [cE, setCE] = useState(false); const [cS, setCS] = useState(false); const [send, setSend] = useState(false); const [cb, setCb] = useState("");
  const { act, pending } = useAct();
  const spoke = outcome === "Spoke" || outcome === "Call back";
  return <>
    <button className={`btn ${primary ? "btn-primary" : ""}`} onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title="Log a call" onClose={() => setOpen(false)}>
      <div className="views mt-3">{CALL_OUTCOMES.map(o => <button key={o} type="button" className={outcome === o ? "on" : ""} onClick={() => setOutcome(o)}>{o}</button>)}</div>
      {outcome === "Call back" && <label className="label mt-3">Call back on<input type="date" className="input !w-[180px]" value={cb} onChange={e => setCb(e.target.value)} /></label>}
      <label className="label mt-3">What was said<textarea className="input" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Short note — this becomes the call note and updates Last Contact" /></label>
      {spoke && outreach && <div className="card mt-4 !py-3">
        <div className="font-semibold text-[14px] mb-1.5">Consent given on this call</div>
        <label className="flex gap-2 items-center text-[14.5px]"><input type="checkbox" checked={cE} onChange={e => setCE(e.target.checked)} /> OK to email them {!hasEmail && <span className="meta">(no email on record yet — add it first to send)</span>}</label>
        <label className="flex gap-2 items-center text-[14.5px] mt-1"><input type="checkbox" checked={cS} onChange={e => setCS(e.target.checked)} /> OK to text them</label>
        {(cE || emailState === "ok") && hasEmail && <label className="flex gap-2 items-center text-[14.5px] mt-2.5 pt-2.5 border-t border-line"><input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} /> Send the information email now <span className="meta">(sets Info Email Sent + follow-up in a week)</span></label>}
      </div>}
      <p className="meta mt-3">{outcome === "No answer" || outcome === "Voicemail" ? "Sets Lead Identifier to Calling and a follow-up in 2 days." : outcome === "Wrong number" ? "Sets Lead Identifier to Hard to find." : outcome === "Not interested" ? "Sets Lead Identifier to Leads No List and a revisit in 3 months." : outcome === "Call back" ? "Sets the follow-up to the date above." : "Adds the note and any consent."}</p>
      <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending || (outcome === "Call back" && !cb)} onClick={() => act(() => A.logCallAction(clientId, { outcome, note, consentEmail: !!outreach && spoke && cE, consentSms: !!outreach && spoke && cS, sendInfo: !!outreach && spoke && send && (cE || emailState === "ok"), callBack: cb || null }), () => setOpen(false))}>Save call</button></div>
    </Modal>}
  </>;
}

type Preview = { channel: "EMAIL" | "SMS"; subject: string | null; body: string; state: ChannelState; to: string | null };
export function SendMessageButton({ clientId, claimId, templateKey, label, small, transactional }: { clientId: string; claimId?: string | null; templateKey: string; label: string; small?: boolean; transactional?: boolean }) {
  const [open, setOpen] = useState(false); const [p, setP] = useState<Preview | null>(null); const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [err, setErr] = useState<string | null>(null);
  const { act, pending } = useAct();
  useEffect(() => { if (!open) return; setP(null); setErr(null); A.previewMessageAction(clientId, templateKey, claimId).then(r => { if (r.ok) { const d = r.data as Preview; setP(d); setSubject(d.subject || ""); setBody(d.body.split("\n\n—\n")[0]); } else setErr(r.error); }); }, [open, clientId, templateKey, claimId]);
  const blocked = p && p.state !== "ok" && !(transactional && p.state === "no-consent");
  return <>
    <button className={`btn ${small ? "btn-sm" : ""}`} onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title={label} onClose={() => setOpen(false)}>
      {err && <div className="warn-box mt-3">{err}</div>}
      {!p && !err && <p className="meta mt-3">Preparing preview…</p>}
      {p && <>
        <div className="meta mt-2">{p.channel === "EMAIL" ? "Email" : "SMS"} to <b>{p.to || "—"}</b>{p.state !== "ok" && <span className={`chip ml-2 ${p.state === "opted-out" ? "chip-red" : "chip-amber"}`}>{STATE_LABEL[p.state]}</span>}</div>
        {blocked && <div className="warn-box mt-3">{p.state === "opted-out" ? "This person has opted out of this channel. It can't be sent." : p.state === "no-address" ? "No usable address or mobile on the record. Add one on the profile first." : "No consent recorded for this channel. Log the call and tick consent, or record consent on the chips above."}</div>}
        {p.channel === "EMAIL" && <label className="label mt-3">Subject<input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></label>}
        <label className="label mt-3">Message<textarea className="input !text-[14px]" rows={p.channel === "SMS" ? 4 : 12} value={body} onChange={e => setBody(e.target.value)} /></label>
        {p.channel === "EMAIL" && <p className="meta mt-2">Your sender details and the unsubscribe link are added automatically at the bottom.</p>}
        {p.channel === "SMS" && <p className="meta mt-2">{body.length} characters · "Reply STOP to opt out" is added automatically.</p>}
        <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending || !!blocked} onClick={() => act(() => A.sendMessageAction({ clientId, key: templateKey, claimId, overrideBody: body, overrideSubject: p.channel === "EMAIL" ? subject : null, transactional }), () => setOpen(false))}>Send</button></div>
      </>}
    </Modal>}
  </>;
}




/** Decisions 4.8: MRFP prepares the email as text; MT sends it herself from Outlook. Nothing is sent or drafted by the app. */
export function PrepareEmailButton({ clientId, claimId, templateKey, label, small, markInfoSent }: { clientId: string; claimId?: string | null; templateKey: string; label: string; small?: boolean; markInfoSent?: boolean }) {
  const [open, setOpen] = useState(false); const [p, setP] = useState<Preview | null>(null); const [err, setErr] = useState<string | null>(null); const [copied, setCopied] = useState<string | null>(null);
  const { act, pending } = useAct();
  useEffect(() => { if (!open) return; setP(null); setErr(null); setCopied(null); A.previewMessageAction(clientId, templateKey, claimId, false).then(r => { if (r.ok) setP(r.data as Preview); else setErr(r.error); }); }, [open, clientId, templateKey, claimId]);
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { setErr("Couldn't copy — select the text and copy it by hand."); } };
  const mailto = p ? `mailto:${encodeURIComponent(p.to || "")}?subject=${encodeURIComponent(p.subject || "")}&body=${encodeURIComponent(p.body)}` : "#";
  return <>
    <button className={`btn ${small ? "btn-sm" : ""}`} onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title={label} onClose={() => setOpen(false)}>
      {err && <div className="warn-box mt-3">{err}</div>}
      {!p && !err && <p className="meta mt-3">Preparing…</p>}
      {p && <>
        <p className="meta mt-1">Filled in from this record. Open it in Outlook, or copy the subject and text into your own email. MRFP doesn't send anything.</p>
        <div className="flex items-center justify-between gap-2 mt-3"><span className="meta">To <b>{p.to || "no email on record"}</b></span></div>
        <label className="label mt-3">Subject<div className="flex gap-2"><input className="input" readOnly value={p.subject || ""} onFocus={e => e.target.select()} /><button className="btn btn-sm shrink-0" onClick={() => copy("subject", p.subject || "")}>{copied === "subject" ? "Copied" : "Copy"}</button></div></label>
        <label className="label mt-3">Message<textarea className="input !text-[14px]" readOnly rows={12} value={p.body} onFocus={e => e.target.select()} /></label>
        <div className="flex flex-wrap justify-between gap-2 mt-4">
          <button className="btn" onClick={() => copy("body", p.body)}>{copied === "body" ? "Copied" : "Copy message"}</button>
          <div className="flex gap-2 flex-wrap">
            <a className="btn btn-primary" href={mailto} onClick={() => { if (markInfoSent && templateKey === "info_email") act(() => A.setLeadIdentifierAction(clientId, "Info sent - waiting on response")); }}>Open in Outlook</a>
            {markInfoSent && templateKey === "info_email" && <button className="btn" disabled={pending} onClick={() => act(() => A.setLeadIdentifierAction(clientId, "Info sent - waiting on response"), () => setOpen(false))}>I've sent it — mark Info sent</button>}
          </div>
        </div>
      </>}
    </Modal>}
  </>;
}
