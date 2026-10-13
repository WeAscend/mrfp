// Dev seed: creates the demo organisation (My Refund Finder, Admin MT1 / User JB2) and migrates the FAKE Airtable export.
//   npx tsx scripts/seed-dev.ts [--dir path/to/airtable_export_FAKE] [--date 2026-10-13]
// Login: mt@example.test / password1234  (JB2: jb@example.test / password1234)
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { ensureHolidays, signUp, addMember } from "../src/lib/services/org";
import { migrateAirtable } from "../src/lib/services/migration";
import { tenantFor, readFiles } from "./migrate-airtable";

const arg = (k: string, def?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : def; };
(async () => {
  await ensureHolidays();
  const existing = await db.query.organisations.findFirst({ where: eq(schema.organisations.slug, "my-refund-finder") });
  if (existing) { console.log("Removing previous demo organisation…"); await db.delete(schema.organisations).where(eq(schema.organisations.id, existing.id)); await db.delete(schema.users).where(eq(schema.users.email, "mt@example.test")); await db.delete(schema.users).where(eq(schema.users.email, "jb@example.test")); }
  await signUp({ orgName: "My Refund Finder", shortName: "MRF", name: "Marta Taylor", email: "mt@example.test", password: "password1234" });
  const t = await tenantFor("my-refund-finder", "mt@example.test");
  await db.update(schema.organisations).set({ phone: "1300 000 000", postalAddress: "PO Box 123, Sydney NSW 2000", website: "myrefundfinder.com.au", smsSenderId: "MRF" }).where(eq(schema.organisations.id, t.org.id));
  await addMember(t, { name: "Jo Bloggs", email: "jb@example.test", userCode: "JB2", role: "USER", password: "password1234" });
  const dir = arg("dir"); if (!dir) { console.log("Seeded organisation only (no --dir given)."); process.exit(0); }
  const report = await migrateAirtable(t, readFiles(dir), "MT1", t.today);
  console.log("Counts:", report.counts, "\nCheck-list:"); for (const c of report.checklist) console.log(` - ${c.record}: ${c.issue}`);
  for (const w of report.warnings) console.log(` ! ${w}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
