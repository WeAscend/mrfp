"use server";
import { headers } from "next/headers";
import { completeSignature } from "@/lib/services/comms";
export async function signAction(token: string, i: { name: string; signatureData: string; agreed: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "unknown").split(",")[0].trim(), agent = h.get("user-agent") || "";
  try { await completeSignature(token, { ...i, ip, agent }); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}
