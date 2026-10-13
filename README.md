# MRFP — My Refund Finder Platform

Multi-tenant SaaS for unclaimed-money recovery businesses: leads → clients → claims → follow-ups → reports, with an audit trail.
Built from the MRFP v7 handover pack (Spec, Field Reference, mockups, test data). The first tenant is My Refund Finder (MRF).

## Stack

- **Next.js 15** (App Router, server actions) + TypeScript + Tailwind 4
- **PostgreSQL** via **Drizzle ORM** (pure JS, no native binaries) — migrations in `drizzle/`
- Sessions with `iron-session` (email + password, bcrypt); roles **Admin / User** per organisation
- File storage behind one interface: local disk (`STORAGE_DRIVER=local`) or S3-compatible (`STORAGE_DRIVER=s3`)
- **Stripe** subscriptions (plumbing wired; plan prices are placeholders until pricing is set)
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
4. Billing (optional until pricing is set): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO|TEAM|AGENCY`; point a Stripe webhook at `/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated|deleted`.
5. `npx drizzle-kit migrate` on deploy, then `npm run build && npm start`.

Sign-up at `/signup` creates an organisation with the standard Holding Authorities, a 30-day trial subscription and the first Admin.

## Outreach, consent and automation

Built for the Spam Act 2003 (Cth): a marketing email or SMS to a client goes out only when consent is recorded on the
record for that channel and never after an opt-out; every email carries the organisation's identity (Settings › Outreach)
and an unsubscribe link (`/u/<token>`, plus RFC 8058 one-click), every SMS ends "Reply STOP to opt out" (handled by
`/api/sms/inbound`). Cold contact stays on the phone (Do Not Call Register washing happens outside the app).

- **Log a call** (lead screen / summary): outcome buttons set the Lead Identifier and follow-up, tick boxes capture
  email/SMS consent with who/when/how, and can send the information email in the same step.
- **Templates** (Settings › Outreach): info email, A2A sign link + reminders, ID request, holding-authority chase,
  invoice, SMS variants. Plain text with `{{placeholders}}`; previewed and editable before each send.
- **In-house e-sign** for the Authority to Act: `/sign/<token>` shows the wording from Settings, captures a drawn or
  typed signature, name, time, IP and device, writes a PDF into Documents, and runs the A2A Signed rule (lead → Active +
  Client Code). Reminders go on the configured days (`/api/cron/daily`, scheduled in `vercel.json`).
- **Holding-authority chase by email** from the claim card, Follow-ups or Today: sends the status request and records
  Chased.
- **Today** (`/today`): calls to make, A2As awaiting signature, authorities to chase, refunds to invoice.
- Providers: Resend (`RESEND_API_KEY`, `MAIL_FROM`) and Twilio (`TWILIO_*`). With neither set, messages are recorded
  with status SENT and printed to the server log so every flow can be exercised locally. Webhooks: `/api/mail/webhook`
  (delivered / opened / bounced → bounce or complaint records an email opt-out), `/api/sms/inbound`.
- Browser test of the whole loop: `node scripts/e2e-comms.js` against a seeded server on :3100.

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
