"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUpAction } from "@/actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUpAction, null);
  return (
    <form action={action} className="card flex flex-col gap-3.5">
      <h1 className="text-[22px]">Create your organisation</h1>
      <p className="meta">30-day trial, no card needed. You become the first Admin; add staff under Settings.</p>
      {state && !state.ok && <div className="warn-box">{state.error}</div>}
      <div className="grid2">
        <label className="label span2">Organisation name<input name="orgName" className="input" required placeholder="My Refund Finder" /></label>
        <label className="label">Short name<input name="shortName" className="input" required maxLength={6} placeholder="MRF" /><span className="meta font-normal">Used in labels like "MRF Invoice Sent"</span></label>
        <label className="label">Your name<input name="name" className="input" required placeholder="Marta Taylor" /></label>
        <label className="label span2">Email<input name="email" type="email" className="input" required autoComplete="email" /></label>
        <label className="label span2">Password<input name="password" type="password" className="input" required minLength={10} autoComplete="new-password" /><span className="meta font-normal">At least 10 characters</span></label>
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create organisation"}</button>
      <div className="meta">Already have an account? <Link href="/login" className="link">Log in</Link></div>
    </form>
  );
}
