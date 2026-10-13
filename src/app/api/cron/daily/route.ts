import { NextResponse } from "next/server";
import { runDaily } from "@/lib/services/comms";
/** Daily automation: A2A reminders and expiries. Vercel Cron calls this (vercel.json) with Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), report: await runDaily() });
}
export const dynamic = "force-dynamic";
