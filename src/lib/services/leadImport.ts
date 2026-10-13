// Lead CSV import (Spec 2.5): preview with duplicate flags, then create one Client per accepted row.
import { and, eq, isNull } from "drizzle-orm";
import Papa from "papaparse";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import { logActivity } from "../tenant";
import * as R from "../rules";
import { authorityMap } from "./queries";

export type PreviewRow = { index: number; lead: R.ImportedLead; flags: string[]; duplicates: string[]; name: string };

export function parseLeadCSV(text: string) {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim() });
  const missing = ["Surname", "First Name", "Amount"].filter(c => !res.meta.fields?.includes(c));
  return { rows: res.data, fields: res.meta.fields ?? [], missing, errors: res.errors.map(e => `Row ${(e.row ?? 0) + 1}: ${e.message}`) };
}

export async function previewImport(t: Tenant, text: string): Promise<{ rows: PreviewRow[]; missing: string[]; errors: string[] }> {
  const { rows, missing, errors } = parseLeadCSV(text);
  const existing = await db.select({ clientType: schema.clients.clientType, surname: schema.clients.surname, firstName: schema.clients.firstName, businessNames: schema.clients.businessNames }).from(schema.clients).where(and(eq(schema.clients.orgId, t.org.id), isNull(schema.clients.deletedAt)));
  const existingKeys = new Map(existing.map(c => [R.nameKey(c), R.displayName(c)]));
  const { list } = await authorityMap(t); const known = new Set(list.map(a => a.name.toLowerCase()));
  const seen = new Map<string, number>();
  const out = rows.map((row, index) => {
    const { lead, flags } = R.importRow(row, t.today);
    const key = R.nameKey(lead), duplicates: string[] = [];
    if (existingKeys.has(key)) duplicates.push(`existing record ${existingKeys.get(key)}`);
    if (seen.has(key)) duplicates.push(`row ${seen.get(key)! + 1} in this file`);
    seen.set(key, index);
    for (const a of lead.searchAuthorities) if (!known.has(a.toLowerCase()) && !R.mapAuthorityName(a)) flags.push(`'${a}' is not a known Holding Authority name`);
    return { index, lead, flags, duplicates, name: R.displayName(lead) };
  });
  return { rows: out, missing, errors };
}

export async function runImport(t: Tenant, text: string, source: string, skip: number[]) {
  const { rows } = await previewImport(t, text);
  const { list } = await authorityMap(t); const canon = (n: string) => list.find(a => a.name.toLowerCase() === n.toLowerCase())?.name ?? R.mapAuthorityName(n) ?? n;
  let n = 0;
  await db.transaction(async tx => {
    for (const r of rows) {
      if (skip.includes(r.index)) continue;
      const L = r.lead;
      const [c] = await tx.insert(schema.clients).values({
        orgId: t.org.id, clientType: L.clientType, surname: L.surname || null, firstName: L.firstName || null, middleName: L.middleName || null, businessNames: L.businessNames,
        stage: "LEAD", leadIdentifier: "New import", source, ownerCode: t.org.defaultOwnerCode || t.membership.userCode, leadAmount: L.leadAmount == null ? null : L.leadAmount.toFixed(2), addressOnUCM: L.addressOnUCM || null,
        specialConditions: L.specialConditions, email: L.email || null, phoneMobile: L.phoneMobile || null, phoneOther: L.phoneOther || null, dob: L.dob, abn: L.abn || null, currentAddress: L.currentAddress || null,
        previousAddresses: L.previousAddresses, lastContact: L.lastContact, dateEntered: t.today, lastUpdatedBy: t.membership.userCode,
      }).returning();
      if (L.searchAuthorities.length) await tx.insert(schema.searchLog).values({ clientId: c.id, date: t.today, authorities: L.searchAuthorities.map(canon) });
      for (const note of L.notes) await tx.insert(schema.notes).values({ clientId: c.id, date: note.date, authorCode: "Import", system: true, text: note.text });
      if (L.lastContact) await tx.insert(schema.notes).values({ clientId: c.id, date: L.lastContact, authorCode: "Import", system: true, text: "Last contact date from the import file" });
      await logActivity(tx, t.org.id, t.membership.userCode, { action: "CREATED", entityType: "Client", entityId: c.id, recordRef: R.displayName(c), newValue: "Lead CSV import" });
      n++;
    }
  });
  return n;
}
