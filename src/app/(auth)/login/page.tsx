"use client";
import { useActionState } from "react";
import Link from "next/link";
import { logInAction } from "@/actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(logInAction, null);
  return (
    <form action={action} className="card flex flex-col gap-3.5">
      <h1 className="text-[22px]">Log in</h1>
      {state && !state.ok && <div className="warn-box">{state.error}</div>}
      <label className="label">Email<input name="email" type="email" className="input" required autoComplete="email" /></label>
      <label className="label">Password<input name="password" type="password" className="input" required autoComplete="current-password" /></label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
      <div className="meta">New here? <Link href="/signup" className="link">Create an organisation</Link></div>
    </form>
  );
}
