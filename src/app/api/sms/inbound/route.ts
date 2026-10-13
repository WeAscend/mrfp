import { NextResponse } from "next/server";
import { optOutSmsByNumber } from "@/lib/services/comms";
import { db, schema } from "@/db";
/** Twilio inbound webhook (application/x-www-form-urlencoded: From, Body, MessageSid). STOP/UNSUBSCRIBE/CANCEL/END/QUIT opt the number out of SMS. Everything else is stored as an inbound message for the timeline. */
export async function POST(req: Request) {
  const form = await req.formData(); const from = String(form.get("From") || ""), body = String(form.get("Body") || "").trim();
  if (!from) return new NextResponse("missing From", { status: 400 });
  const stop = /^(stop|unsubscribe|cancel|end|quit|stopall)\b/i.test(body);
  let n = 0;
  if (stop) n = await optOutSmsByNumber(from);
  else {
    const d = from.replace(/\D/g, "").slice(-9);
    const rows = await db.select({ id: schema.clients.id, orgId: schema.clients.orgId }).from(schema.clients).where((await import("drizzle-orm")).sql`regexp_replace(coalesce(${schema.clients.phoneMobile},''), '\\D', '', 'g') LIKE ${"%" + d} AND ${schema.clients.deletedAt} IS NULL`);
    for (const c of rows) await db.insert(schema.messages).values({ orgId: c.orgId, clientId: c.id, channel: "SMS", direction: "IN", toAddress: from, body, status: "RECEIVED", sentBy: "Client", providerId: String(form.get("MessageSid") || "") || null, sentAt: new Date() });
    n = rows.length;
  }
  const twiml = stop && n ? `<Response><Message>You've been unsubscribed and won't receive further texts.</Message></Response>` : `<Response></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
