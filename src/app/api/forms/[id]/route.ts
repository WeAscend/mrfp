import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { fillForm } from "@/lib/services/forms";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/tenant";
import { eq } from "drizzle-orm";
/** GET /api/forms/<formId>?client=<id>&claim=<id> → the filled, still-editable PDF as a download. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTenant(); if (!t) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params; const u = new URL(req.url); const clientId = u.searchParams.get("client") || "", claimId = u.searchParams.get("claim");
  try {
    const r = await fillForm(t, id, clientId, claimId);
    const c = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
    await logActivity(db, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Form", entityId: id, recordRef: c?.clientCode || r.fileName, field: "Downloaded", newValue: `${r.fileName} (${r.filled}/${r.total} fields)` });
    return new NextResponse(new Uint8Array(r.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.fileName}"` } });
  } catch (e) { return new NextResponse((e as Error).message, { status: 400 }); }
}
