import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
/** Resend event webhook: keeps message status honest (delivered / opened / bounced / complained). Verify with RESEND_WEBHOOK_SECRET via the svix headers when set. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const { createHmac, timingSafeEqual } = await import("crypto");
    const id = req.headers.get("svix-id") || "", ts = req.headers.get("svix-timestamp") || "", sig = req.headers.get("svix-signature") || "";
    const expected = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
    const ok = sig.split(" ").some(s => { const v = s.split(",")[1] || ""; try { return v.length === expected.length && timingSafeEqual(Buffer.from(v), Buffer.from(expected)); } catch { return false; } });
    if (!ok) return new NextResponse("bad signature", { status: 401 });
  }
  const ev = JSON.parse(raw) as { type: string; data: { email_id: string } };
  const map: Record<string, "DELIVERED" | "OPENED" | "BOUNCED" | "FAILED"> = { "email.delivered": "DELIVERED", "email.opened": "OPENED", "email.bounced": "BOUNCED", "email.complained": "BOUNCED", "email.delivery_delayed": "FAILED" };
  const status = map[ev.type];
  if (status && ev.data?.email_id) await db.update(schema.messages).set({ status, ...(status === "OPENED" ? { openedAt: new Date() } : {}) }).where(eq(schema.messages.providerId, ev.data.email_id));
  // A hard bounce or complaint is an opt-out signal: stop emailing that client.
  if ((ev.type === "email.bounced" || ev.type === "email.complained") && ev.data?.email_id) {
    const m = await db.query.messages.findFirst({ where: eq(schema.messages.providerId, ev.data.email_id) });
    if (m?.clientId) { const { recordConsent } = await import("@/lib/services/comms"); const { systemTenant } = await import("@/lib/tenant"); await recordConsent(await systemTenant(m.orgId), m.clientId, "EMAIL", false, ev.type === "email.complained" ? "Spam complaint" : "Email bounced", null, "System"); }
  }
  return NextResponse.json({ ok: true });
}
