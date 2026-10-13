import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getTenant } from "@/lib/tenant";
import { storage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTenant(); if (!t) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const a = await db.query.attachments.findFirst({ where: and(eq(schema.attachments.id, id), eq(schema.attachments.orgId, t.org.id)) });
  if (!a || a.deletedAt) return new NextResponse("Not found", { status: 404 });
  const buf = await storage().get(a.storageKey);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": a.mime, "Content-Disposition": `inline; filename="${a.name}"`, "Cache-Control": "private, max-age=3600" } });
}
