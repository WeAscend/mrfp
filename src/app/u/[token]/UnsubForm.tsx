"use client";
import { useState } from "react";
import { unsubscribeAction } from "./actions";
export function UnsubForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const go = async (ch: "EMAIL" | "SMS" | "BOTH") => { setBusy(true); await unsubscribeAction(token, ch); };
  return <div className="flex flex-wrap gap-2.5 mt-5"><button className="btn btn-primary" disabled={busy} onClick={() => go("EMAIL")}>Stop emails</button><button className="btn" disabled={busy} onClick={() => go("SMS")}>Stop text messages</button><button className="btn" disabled={busy} onClick={() => go("BOTH")}>Stop both</button></div>;
}
