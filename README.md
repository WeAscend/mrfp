# MRFP — My Refund Finder Platform

Multi-tenant SaaS for unclaimed-money recovery businesses: leads → clients → claims → follow-ups → reports, with an audit trail.
Built from the MRFP v7 handover pack (Spec, Field Reference, mockups, test data). The first tenant is My Refund Finder (MRF).

## Stack

- **Next.js 15** (App Router, server actions) + TypeScript + Tailwind 4
- **PostgreSQL** via **Drizzle ORM** (pure JS, no native binaries) — migrations in `drizzle/`
- Sessions with `iron-session` (email + password, bcrypt); roles **Admin / User** per organisation
- File storage behind one interface: local disk (`STORAGE_DRIVER=local`) or S3-compatible (`STORAGE_DRIVER=s3`)
- Tests: Vitest for the rules; Playwright smoke test for the flows

## Layout

```
src/lib/rules.ts            every business rule as pure functions (codes, steps, fees/GST, follow-ups, business days, CSV)
src/lib/rules.test.ts       spec examples as tests (Appendix A codes, GST, chase dates, acceptance checks)
src/lib/services/           rules applied to the database: clients, claims, queries, org/users, lead import, migration
src/lib/tenant.ts           who is logged in, which organisation, today, holidays; tenant-scoped helpers; activity log
src/actions/index.ts        server actions the UI calls (thin, validated, always resolve the tenant first)
src/app/(app)/              screens: leads, clients/[id] (lead screen + Summary/Profile/Claims/Documents), claims, followups, reports, import, settings
src/db/schema.ts            multi-tenant schema — every business table carries org_id
scripts/migrate-airtable.ts Airtable → MRFP migration (Spec 10) with counts + check-list
scripts/seed-dev.ts         demo org + migration of the FAKE export
prototype/                  the single-file clickable prototype (same rules, browser-only)
```

## Run locally

```bash
cp .env.example .env            # set DATABASE_URL, SESSION_SECRET
npm install
npx drizzle-kit migrate         # create the tables
npx tsx scripts/seed-dev.ts --dir test-data/airtable_export_FAKE --date 2026-10-13
npm run dev                     # http://localhost:3000 — mt@example.test / password1234 (Admin), jb@example.test (User)
```

`npm test` runs the rules tests. `node scripts/e2e-smoke.js` drives a running server (BASE=http://localhost:3000).

## Deploy (hosted SaaS)

Any Node host plus a Postgres database works — Vercel + Neon/Supabase, Railway, Render, or a VPS with the Dockerfile.

1. Create a Postgres database; set `DATABASE_URL`.
2. Set `SESSION_SECRET` (32+ random chars), `APP_URL`.
3. Files: `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION` (and `S3_ENDPOINT` for R2/MinIO) plus AWS credentials in the environment. Local disk is fine for a single-machine install.
5. `npx drizzle-kit migrate` on deploy, then `npm run build && npm start`.

Sign-up at `/signup` creates an organisation with the standard Holding Authorities, a 30-day trial subscription and the first Admin.

## Build Decisions Reference (MT, 14 Oct 2026) — what changed

Where this and the Spec disagree, the Decisions document wins. Implemented:

- **Removed:** online A2A signing, A2A send-by-link and automatic reminders, the "Email chase" button, any sending of
  email/SMS. The dormant email/SMS plumbing (`src/lib/mail.ts`, `sms.ts`, consent, unsubscribe routes) stays behind
  Settings › Outreach (later), switched off, for the marketing outreach to be discussed later.
- **1.4** Holding Authority follow-up covers steps 7 and 9 only; step 8 drops off; step 9 restarts from the resubmission.
- **1.7** Completed = a claim reached step 16. Step 17 is not a closing step and never sets a client Inactive.
- **2.4** Stop-words: The, Pty, Ltd, Limited, P/L, Co, Inc; "Trading As" / "T/A" and everything after it ignored (like ATF).
- **2.5** Search Results SA / WA / ACT map to SA Treasury / WA Treasury / Treasury ACT.
- **2.6** Owner defaults to Settings › Users › Default owner (set to the first Admin on sign-up); Admin-only to change.
- **3.7** Fee % options editable under Settings › Dropdown options.
- **4.7** "Info sent - waiting on response" stamps Info Email Sent and sets Follow Up = Info Email Sent + 3 business days.
- **4.8 / 6.4** "Prepare … email" buttons fill a template from the record and show it to copy or open in Outlook
  (`mailto:`). Nothing is sent or drafted by MRFP. Admin edits and adds templates under Settings › Email templates.
- **4.9** Chased records today's date + user code, adds a note, resets the next follow-up — nothing else.
- **6.1** Settings holds Users, Dropdown options, Email templates, Holding Authorities & Companies, Public holidays,
  PDF forms, Organisation, Activity Log, Bin.
- **6.2** Reports › Weekly report: the eight figures for any Monday–Sunday week, each drill-down to its records, CSV export.
- **6.5** Settings › PDF forms: upload an editable (AcroForm) PDF, map each field to a client/claim/business value or
  fixed text, then "Fill form" on a claim card / Documents downloads it filled and still editable. Admin can add forms
  herself; no developer needed. Scanned or flattened PDFs can't be filled — the upload says so.

## For MT — things the Decisions asked the builder to explain

- **Importing leads:** sidebar › Setup › *Import leads*, or the *Import leads from CSV* button on Leads. Paste or choose
  the CSV, Preview (duplicates and odd statuses are flagged), untick anything to skip, Import.
- **Public holidays each year:** Settings › Public holidays. The bundled list covers 2026–2027 (national, NSW, VIC). When
  a state gazettes next year's dates (usually mid-year), add them there — date, region, name. Business-day counts use the
  regions in Settings › Organisation.
- **Backups (hosted on Neon + object storage):** the database is backed up continuously with point-in-time restore
  (7 days on the free tier, 30 on paid); files in object storage are versioned. A restore is: pick the time in the Neon
  console → restore to a branch → point the app at it (minutes, not hours). A full restore test is part of go-live.
- **Dates** are DD/MM/YYYY in every date box whatever the browser locale (type 14/10/2026, or use the calendar button); lists show "14 Oct 2026".

## Migrating a business from Airtable

```bash
npx tsx scripts/migrate-airtable.ts --org <slug> --user <admin email> --dir <folder with Clients/Leads/Claims/Holding_Authorities CSVs>
```
Prints the counts against the expected-count formula and the check-list for the owner. Before exporting, add `Record ID` formula fields and the linked-record lookup fields described in Spec 10, and a **Created time** field on Leads.

## Rules worth knowing (all in `rules.ts`)

- Client Code generated when a lead becomes Active (A2A Signed & Received entered); Claim ID = authority code + client code + 4-digit sequence.
- Picking a Claim Progress step stamps its date only if blank; steps 2/3/9 add log entries; 16–21 close the claim; step 12 forces the fee to $0.
- Last claim closes → client Inactive (Completed if any claim was paid); a new claim or reopened claim → Active again.
- Holding Authority follow-up = latest submission + Chase after days; Chased → + Re-chase days. A2A chase = 6th business day after A2A Sent (NSW/VIC/national holidays bundled; regions per organisation).
- Last Contact = date of the latest note written by a person; system/import/migration notes don't count.
