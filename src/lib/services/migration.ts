// Airtable -> MRFP migration (Spec 10 + Migration Map sheet). Runs with the automatic rules OFF: dates and statuses are
// copied as they are, Activity Log entries are written as user 'Migration', and anything that doesn't add up goes on the check-list.
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "../tenant";
import { logActivity } from "../tenant";
import * as R from "../rules";

export type MigrationFiles = { clients: string; leads: string; claims: string; haoc: string };
export type MigrationReport = { counts: { clients: number; claims: number; authorities: number; companies: number; expectedClients: number; expectedClaims: number }; checklist: { record: string; issue: string }[]; warnings: string[] };

const parse = (text: string) => Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" }).data;
const g = (row: Record<string, string>, ...keys: string[]) => { for (const k of keys) { const v = row[k]; if (v != null && v.trim() !== "") return v.trim(); } return ""; };
const d = (s: string) => R.parseAUDate(s);
const money = (s: string) => { const n = R.parseMoney(s); return n == null ? null : n.toFixed(2); };
const list = (s: string) => s ? s.split(",").map(x => x.trim()).filter(Boolean) : [];

const CLIENT_STATUS: Record<string, { stage: "LEAD" | "ACTIVE" | "INACTIVE"; ident?: string; reason?: string; source?: string }> = {
  "active client": { stage: "ACTIVE" }, "cold call - no contact yet": { stage: "LEAD", ident: "New import" }, "cold call - waiting on response": { stage: "LEAD", ident: "Info sent - waiting on response" },
  "cold call - no response - leave for 3 months": { stage: "LEAD", ident: "No response - revisit in 3 months" }, "free search - waiting for response": { stage: "LEAD", ident: "Info sent - waiting on response", source: "MRF Free Search Request" },
  "authority to act sent": { stage: "LEAD", ident: "A2A sent" }, "contact form": { stage: "LEAD", ident: "New import", source: "MRF Contact Form" }, "completed": { stage: "INACTIVE", reason: "Completed" }, "inactive": { stage: "INACTIVE" },
  "free search - nothing found": { stage: "INACTIVE", reason: "Free Search - nothing found" }, "told client to recover themselves": { stage: "INACTIVE", reason: "Told client to recover themselves" }, "client decided to go with another mra": { stage: "INACTIVE", reason: "Went to another MRA" },
  "not interested": { stage: "INACTIVE", reason: "Not interested" }, "dead end - probably not recoverable": { stage: "INACTIVE", reason: "Dead end - not recoverable" }, "cold call - recovering themselves": { stage: "INACTIVE", reason: "Recovering themselves" },
  "cold call - no response": { stage: "INACTIVE", reason: "No response" }, "cold call - rude dnc": { stage: "INACTIVE", reason: "Rude DNC" },
};
const LEAD_STATUS: Record<string, string> = { "leads - new": "New import", "lead - green": "Calling", "big fish": "Deep Research", "lead - need more info": "Need more info", "leads - hard to find": "Hard to find", "no": "Leads No List" };
const CLAIM_STATUS: Record<string, number | null> = { "not started": 1, "authority to act sent": 2, "awaiting id & address evidence": 4, "holding authority forms to be signed": 5, "sent to holding authority": 7, "awaiting more info required for holding authority": 8, "resent to holding authority": 9, "approved - waiting on refund": 10, "refund received": 11, "refund received - no client fee": 12, "mfr payment received": 14, "mrf payment received": 14, "review completed": 16, "unable to claim": 18, "incomplete": 19, "client went to another mra": 20, "no contact from client": 21, "personal details form sent for completion": null };

export async function migrateAirtable(t: Tenant, files: MigrationFiles, ownerCode = t.org.defaultOwnerCode || t.membership.userCode, migrationDate = t.today): Promise<MigrationReport> {
  const clientsRows = parse(files.clients), leadRows = parse(files.leads), claimRows = parse(files.claims), haocRows = parse(files.haoc);
  const checklist: MigrationReport["checklist"] = [], warnings: string[] = [];
  const MIG = "Migration";
  const expectedClients = clientsRows.length + leadRows.filter(r => g(r, "Status").toLowerCase() !== "cold call - client table").length;

  return db.transaction(async tx => {
    const log = (e: Parameters<typeof logActivity>[3]) => logActivity(tx, t.org.id, MIG, { ...e, userCode: MIG });
    // ---- Holding Authorities & Originating Companies ----
    const has = await tx.select().from(schema.holdingAuthorities).where(eq(schema.holdingAuthorities.orgId, t.org.id));
    const haByRec = new Map<string, string>(), ocByRec = new Map<string, string>(); let companiesCreated = 0;
    const ocByName = new Map<string, string>();
    const placeholders: { rec: string; oldName: string; target: string }[] = [];
    for (const row of haocRows) {
      const rec = g(row, "Record ID"), name = g(row, "Holding Authority"), kind = g(row, "Holding Authority or Company").toLowerCase();
      if (kind.startsWith("holding")) {
        const std = R.mapAuthorityName(name) ?? name; let ha = has.find(a => a.name.toLowerCase() === std.toLowerCase());
        if (!ha) { [ha] = await tx.insert(schema.holdingAuthorities).values({ orgId: t.org.id, name: std, sortOrder: has.length }).returning(); has.push(ha); checklist.push({ record: std, issue: `Holding Authority '${name}' is not a standard name — check its Authority Code and chase days` }); }
        const patch: Partial<schema.HoldingAuthority> = {}; if (g(row, "Notes")) patch.details = g(row, "Notes");
        const phones = [g(row, "Phone Number"), g(row, "Phone Number - other")].filter(Boolean); if (phones.length) patch.phones = phones;
        if (g(row, "Email")) patch.emails = [g(row, "Email")]; if (g(row, "Website")) patch.website = g(row, "Website"); if (g(row, "Address")) patch.address = g(row, "Address"); if (g(row, "Mailing Address")) patch.mailingAddress = g(row, "Mailing Address");
        if (Object.keys(patch).length) await tx.update(schema.holdingAuthorities).set(patch).where(eq(schema.holdingAuthorities.id, ha.id));
        haByRec.set(rec, ha.id);
      } else {
        const m = name.match(/^(.*?)\s*-\s*see\s+(.+)$/i);
        if (m) { placeholders.push({ rec, oldName: m[1].trim(), target: m[2].trim() }); continue; }
        const fm = name.match(/^(.*?)\s*\((?:formerly|previously|was)\s+(.+)\)$/i);
        const cleanName = fm ? fm[1].trim() : name; const prev = fm ? [fm[2].trim()] : [];
        const [oc] = await tx.insert(schema.originatingCompanies).values({ orgId: t.org.id, name: cleanName, details: g(row, "Notes") || null, phones: [g(row, "Phone Number"), g(row, "Phone Number - other")].filter(Boolean), emails: [g(row, "Email")].filter(Boolean), website: g(row, "Website") || null, address: g(row, "Address") || null, mailingAddress: g(row, "Mailing Address") || null, previousNames: prev }).onConflictDoNothing().returning();
        const id = oc?.id ?? (await tx.query.originatingCompanies.findFirst({ where: and(eq(schema.originatingCompanies.orgId, t.org.id), eq(schema.originatingCompanies.name, cleanName)) }))!.id;
        if (oc) { companiesCreated++; await log({ action: "CREATED", entityType: "Originating Company", entityId: id, recordRef: cleanName, newValue: `Airtable ${rec}` }); }
        ocByRec.set(rec, id); ocByName.set(cleanName.toLowerCase(), id);
      }
    }
    for (const p of placeholders) {
      const targetId = ocByName.get(p.target.toLowerCase()) ?? [...ocByName.entries()].find(([n]) => n.startsWith(p.target.toLowerCase()))?.[1];
      if (!targetId) { checklist.push({ record: p.oldName, issue: `Placeholder 'See ${p.target}' — surviving company not found; claims linked to it need re-pointing` }); continue; }
      const oc = (await tx.query.originatingCompanies.findFirst({ where: eq(schema.originatingCompanies.id, targetId) }))!;
      if (!oc.previousNames.includes(p.oldName)) await tx.update(schema.originatingCompanies).set({ previousNames: [...oc.previousNames, p.oldName] }).where(eq(schema.originatingCompanies.id, targetId));
      ocByRec.set(p.rec, targetId);
    }
    const haById = Object.fromEntries(has.map(a => [a.id, a]));
    const canonHA = (n: string) => has.find(a => a.name.toLowerCase() === (R.mapAuthorityName(n) ?? n).toLowerCase())?.name ?? (checklist.push({ record: n, issue: "Search Results value does not match a Holding Authority name" }), n);

    // ---- Clients ----
    type NewClient = Omit<typeof schema.clients.$inferInsert, "orgId"> & { rec: string; notesText?: string; claimRecs: string[] };
    const clientByRec = new Map<string, string>(); const created: { id: string; dateEntered: string; name: string; rec: string; hasClaims: boolean; clientType: string; surname: string | null; firstName: string | null; businessNames: string[] }[] = [];
    const existingCodes = new Set((await tx.select({ c: schema.clients.clientCode }).from(schema.clients).where(eq(schema.clients.orgId, t.org.id))).map(r => r.c).filter((x): x is string => !!x));
    const addresses = (row: Record<string, string>, n: number) => Array.from({ length: n }, (_, i) => g(row, `Previous Address ${i + 1}`)).filter(Boolean);
    const insertClient = async (v: NewClient, source: "client" | "lead") => {
      const { rec, notesText, claimRecs, ...vals } = v; void claimRecs;
      const [c] = await tx.insert(schema.clients).values({ ...vals, orgId: t.org.id, ownerCode, migrationRef: rec, lastUpdatedBy: MIG }).returning();
      clientByRec.set(rec, c.id);
      if (notesText) await tx.insert(schema.notes).values({ clientId: c.id, date: migrationDate, authorCode: MIG, system: true, text: `Migrated from Airtable: ${notesText}` });
      await log({ action: "CREATED", entityType: "Client", entityId: c.id, recordRef: R.displayName(c), newValue: `Migrated from Airtable ${source} ${rec}` });
      created.push({ id: c.id, dateEntered: c.dateEntered, name: R.displayName(c), rec, hasClaims: claimRecs.length > 0, clientType: c.clientType, surname: c.surname, firstName: c.firstName, businessNames: c.businessNames });
      return c;
    };
    for (const row of clientsRows) {
      const rec = g(row, "Record ID"), status = g(row, "Status"), map = CLIENT_STATUS[status.toLowerCase()];
      const sc = list(g(row, "Special Condition")); const biz = sc.includes("Business");
      const surname = g(row, "Surname"), first = g(row, "First Name"), bizNames = list(g(row, "Business Names"));
      const v: NewClient = {
        rec, claimRecs: list(g(row, "Claims")), clientType: biz ? "BUSINESS" : "INDIVIDUAL", surname: biz ? null : surname || null, firstName: biz ? null : first || null, middleName: g(row, "Middle Name") || null, preferredName: g(row, "Preferred Name") || null, otherNames: g(row, "Other names known by") || null,
        businessNames: biz ? (bizNames.length ? bizNames : [surname].filter(Boolean)) : bizNames, businessContact: g(row, "Executor/Administrator Details or Business Contact") || null, email: g(row, "Email") || null, phoneMobile: g(row, "Phone - Mobile") || null, phoneOther: g(row, "Phone - Other (Text)", "Phone - Other") || null,
        dob: d(g(row, "DOB")), currentAddress: g(row, "Current Address") || null, currentPOBox: g(row, "Current PO Box") || null, previousAddresses: addresses(row, 10), website: g(row, "Website") || null, abn: g(row, "ABN") || null, acn: g(row, "ACN") || null,
        specialConditions: sc.filter(x => x !== "Business").map(x => x === "Super Fund" ? "Super Fund Account" : x), stage: map?.stage ?? "LEAD", leadIdentifier: map?.ident ?? null, inactiveReason: map?.reason ?? null,
        source: map?.source ?? (g(row, "Source") || null), lastContact: d(g(row, "Last Contact Date")), followUp: d(g(row, "Follow Up")), followUpReason: g(row, "Reason for Follow Up") || null, followUpSetBy: d(g(row, "Follow Up")) ? ownerCode : null,
        dateEntered: d(g(row, "Date entered")) ?? migrationDate, infoEmailSent: d(g(row, "Info Email Sent")), becameNonActive: d(g(row, "Became Non-Active")), a2aSent: d(g(row, "Authority to Act Sent")),
        idLicence: d(g(row, "ID  - Licence - Recieved", "ID - Licence - Received", "ID - Licence Received")), idPassport: d(g(row, "ID - Passport Received")), idMedicare: d(g(row, "ID - Medicare Card Received", "ID - Medicare Received")), idOther: d(g(row, "ID - Other Received")),
        notesText: g(row, "Notes") || undefined, ownerCode,
      };
      if (!map && status) { v.checklist = `Airtable status '${status}' is not in the map — set Stage / Identifier by hand`; checklist.push({ record: `${surname}, ${first}`, issue: v.checklist }); }
      if (/\s(&|and)\s/i.test(first)) { v.checklist = [v.checklist, "Joint names in one record — split into separate linked records"].filter(Boolean).join("; "); checklist.push({ record: `${surname}, ${first}`, issue: "Joint names in one record — split into separate linked records" }); }
      const c = await insertClient(v, "client");
      const searched = d(g(row, "Last Searched")), found = list(g(row, "Search Results")).map(canonHA);
      if (searched || found.length) await tx.insert(schema.searchLog).values({ clientId: c.id, date: searched ?? v.dateEntered!, authorities: found });
    }
    // Associated Entry -> Related Client Record (one direction only)
    for (const row of clientsRows) { const a = g(row, "Associated Entry Record ID"), me = clientByRec.get(g(row, "Record ID")), other = clientByRec.get(a); if (me && other) await tx.insert(schema.relatedClients).values({ fromId: me, toId: other }).onConflictDoNothing(); else if (a && me) warnings.push(`Associated Entry ${a} not found for ${g(row, "Surname")}`); }

    // ---- Leads ----
    const leadsNoDate = leadRows.some(r => !g(r, "Date entered") && !g(r, "Created time"));
    if (leadsNoDate) warnings.push("Leads export has no 'Date entered' / 'Created time' column — Date entered set to the migration date (Spec 10: add a Created time field before exporting)");
    for (const row of leadRows) {
      const rec = g(row, "Record ID"), status = g(row, "Status"), surname = g(row, "Surname"), first = g(row, "First Name"); const sc = list(g(row, "Special Condition")); const biz = sc.includes("Business");
      if (status.toLowerCase() === "cold call - client table") { // top up the existing client
        const match = created.filter(c => c.clientType === "INDIVIDUAL" && (c.surname ?? "").toLowerCase() === surname.toLowerCase() && (c.firstName ?? "").toLowerCase() === first.toLowerCase());
        if (match.length !== 1) { checklist.push({ record: `${surname}, ${first}`, issue: `Lead at 'Cold Call - Client Table' matched ${match.length} client records — check by hand` }); continue; }
        const c = (await tx.query.clients.findFirst({ where: eq(schema.clients.id, match[0].id) }))!;
        const patch: Partial<schema.Client> = {}; if (!c.leadAmount && g(row, "Amount")) patch.leadAmount = money(g(row, "Amount")); if (!c.addressOnUCM && g(row, "Address on UCM")) patch.addressOnUCM = g(row, "Address on UCM");
        if (Object.keys(patch).length) await tx.update(schema.clients).set(patch).where(eq(schema.clients.id, c.id));
        const sl = await tx.select().from(schema.searchLog).where(eq(schema.searchLog.clientId, c.id)); const found = list(g(row, "Search Results")).map(canonHA);
        if (!sl.length && found.length) await tx.insert(schema.searchLog).values({ clientId: c.id, date: d(g(row, "Last Searched")) ?? c.dateEntered, authorities: found });
        await log({ action: "EDITED", entityType: "Client", entityId: c.id, recordRef: match[0].name, field: "Lead top-up", newValue: `From Airtable lead ${rec}` });
        continue;
      }
      const ident = LEAD_STATUS[status.toLowerCase()];
      const v: NewClient = {
        rec, claimRecs: [], clientType: biz ? "BUSINESS" : "INDIVIDUAL", surname: biz ? null : surname || null, firstName: biz ? null : first || null, middleName: g(row, "Middle Name") || null, businessNames: biz ? [surname].filter(Boolean) : [],
        email: g(row, "Email") || null, phoneMobile: g(row, "Phone - Mobile") || null, phoneOther: g(row, "Phone - Other") || null, dob: d(g(row, "DOB")), abn: g(row, "ABN") || null, currentAddress: g(row, "Current Address") || null, previousAddresses: addresses(row, 3),
        addressOnUCM: g(row, "Address on UCM") || null, leadAmount: money(g(row, "Amount")), specialConditions: sc.filter(x => x !== "Business").map(x => x === "Super Fund" ? "Super Fund Account" : x),
        stage: "LEAD", leadIdentifier: ident ?? null, source: "MT Cold Call", lastContact: d(g(row, "Last Contact Date")), dateEntered: d(g(row, "Date entered")) ?? d(g(row, "Created time")) ?? migrationDate, followUp: d(g(row, "Follow Up")), notesText: g(row, "Notes") || undefined, ownerCode,
      };
      if (ident === "Leads No List") { v.followUp = R.addMonths(migrationDate, t.org.revisitMonths); v.followUpSetBy = "Automatic"; v.followUpReason = "Check back - said no at migration"; }
      if (!ident && status) { v.checklist = `Airtable lead status '${status}' is not in the map — set Lead Identifier by hand`; checklist.push({ record: `${surname}, ${first}`, issue: v.checklist }); }
      if (biz) { v.checklist = [v.checklist, "Business lead: company name moved from Surname to Business Names — confirm (open question 1)"].filter(Boolean).join("; "); checklist.push({ record: surname, issue: "Business lead: confirm name moved to Business Names" }); }
      const c = await insertClient(v, "lead");
      const found = list(g(row, "Search Results")).map(canonHA); const searched = d(g(row, "Last Searched"));
      if (found.length || searched) await tx.insert(schema.searchLog).values({ clientId: c.id, date: searched ?? v.dateEntered!, authorities: found });
    }

    // ---- Client Codes: fresh, in order of Date entered (ties by name), only for clients with claims ----
    const claimsByClientRec = new Map<string, Record<string, string>[]>(); for (const row of claimRows) { const r = g(row, "Client Record ID"); claimsByClientRec.set(r, [...(claimsByClientRec.get(r) ?? []), row]); }
    const codeById = new Map<string, string>();
    for (const c of created.filter(c => claimsByClientRec.has(c.rec)).sort((a, b) => a.dateEntered.localeCompare(b.dateEntered) || a.name.localeCompare(b.name))) {
      const code = R.clientCodeFor(c, existingCodes); existingCodes.add(code); codeById.set(c.id, code);
      await tx.update(schema.clients).set({ clientCode: code }).where(eq(schema.clients.id, c.id));
      await log({ action: "EDITED", entityType: "Client", entityId: c.id, recordRef: code, field: "Client Code", newValue: code });
    }

    // ---- Claims ----
    const existingClaimIds = new Set((await tx.select({ c: schema.claims.claimId }).from(schema.claims).where(eq(schema.claims.orgId, t.org.id))).map(r => r.c));
    const signedByClient = new Map<string, string>(); let claimsCreated = 0;
    const sortedClaims = claimRows.slice().sort((a, b) => Number(g(a, "Claim ID")) - Number(g(b, "Claim ID")));
    for (const row of sortedClaims) {
      const rec = g(row, "Record ID"), clientRec = g(row, "Client Record ID"), clientId = clientByRec.get(clientRec); const airtableNo = g(row, "Claim ID"), label = `Airtable claim ${airtableNo} (${g(row, "Client")})`;
      if (!clientId) { checklist.push({ record: label, issue: "Client Record ID not found — claim not migrated" }); continue; }
      const code = codeById.get(clientId)!; const client = created.find(c => c.id === clientId)!;
      const haRecs = list(g(row, "Holding Authority Record ID")); const haId = haRecs.map(r => haByRec.get(r)).find(Boolean); const ocIds = haRecs.map(r => ocByRec.get(r)).filter((x): x is string => !!x);
      if (!haId) { checklist.push({ record: label, issue: "No Holding Authority-type link — claim not migrated" }); continue; }
      const ha = haById[haId]; if (!ha.code) checklist.push({ record: label, issue: `${ha.name} has no Authority Code — Claim ID could not be generated` });
      const claimId = R.nextClaimId(ha.code, code, existingClaimIds) ?? `?${code}-${airtableNo}`; existingClaimIds.add(claimId);
      const status = g(row, "Status"), progress = status ? CLAIM_STATUS[status.toLowerCase()] : null;
      const aud = money(g(row, "Amount - AUD")), nzd = money(g(row, "Amount - NZD")); const currency = aud == null && nzd != null ? "NZD" : "AUD";
      const feePct = money(g(row, "Fee for Service %").replace("%", "")); const becameNonActive = d(g(row, "Became Non-Active"));
      const closed = progress != null && R.CLOSING_STEPS.includes(progress);
      const signed = d(g(row, "Authority to Act - Signed & Received"));
      const [k] = await tx.insert(schema.claims).values({
        orgId: t.org.id, clientId, claimId, authorityId: haId, progress: progress ?? null, amount: aud ?? nzd, currency, accountName: g(row, "Account Name on Register") || null, reference: g(row, "Reference Number") || null, year: g(row, "Year") || null,
        addressOnRegister: g(row, "Address on Register") || null, followUp: d(g(row, "Follow up", "Follow Up")), followUpReason: g(row, "Follow Up Reason") || null, followUpSetBy: d(g(row, "Follow up", "Follow Up")) ? ownerCode : null,
        addressVerification: d(g(row, "Address Evidence Received")), haFormSent: d(g(row, "Holding Authority Form Sent for Sig")), haFormSigned: d(g(row, "Holding Authority Form - Signed & Received")), dateSubmitted: d(g(row, "Date Submitted to Holding Authority")),
        claimApproved: d(g(row, "Claim Approved")), refundReceived: d(g(row, "Refund Received")), invoiceSent: d(g(row, "Invoice Sent")), paymentReceived: d(g(row, "MRF Payment Received")), reviewRequested: d(g(row, "Review Request Sent")), reviewCompleted: d(g(row, "Review Complete")),
        feePct, feeManual: currency === "NZD" ? null : null, gstTreatment: "+ GST", closedOn: closed ? becameNonActive : null, migrationRef: rec, migratedNo: airtableNo || null, lastUpdatedBy: MIG,
      }).returning();
      claimsCreated++;
      await log({ action: "CREATED", entityType: "Claim", entityId: k.id, recordRef: claimId, newValue: `Migrated from Airtable claim ${airtableNo}` });
      if (ocIds.length) await tx.insert(schema.claimCompanies).values(ocIds.map(companyId => ({ claimId: k.id, companyId }))).onConflictDoNothing();
      const resub = d(g(row, "Date Resubmitted")); if (resub) await tx.insert(schema.resubmissions).values({ claimId: k.id, date: resub });
      const cRow = (await tx.query.clients.findFirst({ where: eq(schema.clients.id, clientId) }))!;
      const sent = cRow.a2aSent ?? d(g(row, "Authority to Act Sent"));
      if (sent || signed) await tx.insert(schema.a2aEntries).values({ claimId: k.id, sent, signed, order: 0 });
      if (signed && (!signedByClient.has(clientId) || signed < signedByClient.get(clientId)!)) signedByClient.set(clientId, signed);
      // notes
      const tag = { clientId, claimId: k.id, date: migrationDate, authorCode: MIG, system: true };
      if (g(row, "Claim Notes")) await tx.insert(schema.notes).values({ ...tag, text: g(row, "Claim Notes") });
      if (g(row, "Client Notes")) await tx.insert(schema.notes).values({ ...tag, text: g(row, "Client Notes") });
      const hist = [["Airtable claim no.", airtableNo], ["Date Opened", g(row, "Date Opened")], ["Became Non-Active", g(row, "Became Non-Active")], ["Airtable Claim ID", g(row, "Claim No.")]].filter(([, v]) => v).map(([k2, v]) => `${k2}: ${v}`).join(" · ");
      if (hist) await tx.insert(schema.notes).values({ ...tag, text: `Migration history — ${hist}` });
      // close date for reports
      if (closed) { if (becameNonActive) await log({ action: "EDITED", entityType: "Claim", entityId: k.id, recordRef: claimId, field: "Claim Progress", newValue: `${progress} ${R.stepName(progress!, t.org.shortName)}`, timestamp: new Date(becameNonActive + "T09:00:00+10:00") }); else checklist.push({ record: claimId, issue: "Closed claim with no Became Non-Active date — close date unknown" }); }
      // check-list items
      const issues: string[] = [];
      if (status && progress === undefined) issues.push(`Airtable status '${status}' not in the map — Claim Progress left blank`);
      if (status && progress === null) issues.push(`Airtable status '${status}' — set Claim Progress by hand`);
      if (!status) issues.push("No Airtable status — set Claim Progress by hand");
      if (currency === "NZD") issues.push("NZD claim — enter Fee (AUD) by hand");
      if (!ha.code) issues.push("Claim ID could not be generated (authority has no code)");
      if (issues.length) { await tx.update(schema.claims).set({ checklist: issues.join("; ") }).where(eq(schema.claims.id, k.id)); for (const i of issues) checklist.push({ record: claimId, issue: i }); }
      // Address on Register -> Previous Addresses
      const addr = g(row, "Address on Register"); if (addr && cRow.currentAddress !== addr && !cRow.previousAddresses.includes(addr)) await tx.update(schema.clients).set({ previousAddresses: [...cRow.previousAddresses, addr] }).where(eq(schema.clients.id, clientId));
      void client;
    }
    // Client A2A Signed = earliest claim-level signed; consistency check-list
    for (const [clientId, signed] of signedByClient) await tx.update(schema.clients).set({ a2aSigned: signed }).where(eq(schema.clients.id, clientId));
    for (const c of created.filter(c => c.hasClaims)) {
      const ks = await tx.select({ progress: schema.claims.progress }).from(schema.claims).where(eq(schema.claims.clientId, c.id)); const row = (await tx.query.clients.findFirst({ where: eq(schema.clients.id, c.id) }))!;
      if (row.stage === "ACTIVE" && ks.length && ks.every(k => R.isClosed(k))) { const issue = "Active but every claim is closed — set Inactive by hand or reopen a claim"; await tx.update(schema.clients).set({ checklist: [row.checklist, issue].filter(Boolean).join("; ") }).where(eq(schema.clients.id, c.id)); checklist.push({ record: c.name, issue }); }
    }
    return { counts: { clients: created.length, claims: claimsCreated, authorities: has.length, companies: companiesCreated, expectedClients, expectedClaims: claimRows.length }, checklist, warnings };
  });
}
