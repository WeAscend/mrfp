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
