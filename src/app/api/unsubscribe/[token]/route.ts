import { NextResponse } from "next/server";
import { optOutByToken } from "@/lib/services/comms";
/** RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post). Email channel only. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) { const { token } = await ctx.params; const r = await optOutByToken(token, "EMAIL"); return NextResponse.json({ ok: !!r }); }
