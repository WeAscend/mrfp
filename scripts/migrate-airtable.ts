// Run the Airtable -> MRFP migration from the command line.
//   npx tsx scripts/migrate-airtable.ts --org <slug> --user <email> --dir <folder with the 4 CSVs> [--date 2026-10-13]
// The folder must hold Clients*.csv, Leads*.csv, Claims*.csv and Holding_Authorities*.csv (the FAKE set from the handover pack works).
import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../src/db";
import { migrateAirtable } from "../src/lib/services/migration";
import type { Tenant } from "../src/lib/tenant";
import { todayInZone } from "../src/lib/rules";

const arg = (k: string, def?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : def; };
export async function tenantFor(slug: string, email: string): Promise<Tenant> {
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.slug, slug) }); if (!org) throw new Error(`No organisation with slug ${slug}`);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) }); if (!user) throw new Error(`No user ${email}`);
  const m = await db.query.memberships.findFirst({ where: and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, user.id)) }); if (!m) throw new Error("Not a member");
  const regions = org.holidayRegions.split(",").map(r => r.trim()).filter(Boolean);
  const hol = await db.select({ date: schema.holidays.date }).from(schema.holidays).where(inArray(schema.holidays.region, regions));
  return { org, membership: m, user: { id: user.id, email: user.email, name: user.name }, isAdmin: m.role === "ADMIN", today: arg("date", todayInZone())!, holidays: new Set(hol.map(h => h.date)) };
}
export function readFiles(dir: string) {
  const files = readdirSync(dir); const pick = (p: RegExp) => { const f = files.find(x => p.test(x)); if (!f) throw new Error(`No file matching ${p} in ${dir}`); return readFileSync(path.join(dir, f), "utf8"); };
  return { clients: pick(/^Clients.*\.csv$/i), leads: pick(/^Leads.*\.csv$/i), claims: pick(/^Claims.*\.csv$/i), haoc: pick(/^Holding_Authorities.*\.csv$/i) };
}
if (require.main === module) (async () => {
  const t = await tenantFor(arg("org")!, arg("user")!);
  const report = await migrateAirtable(t, readFiles(arg("dir")!), arg("owner", t.membership.userCode), t.today);
  console.log("Counts:", report.counts);
  console.log(`Expected: ${report.counts.expectedClients} clients, ${report.counts.expectedClaims} claims -> ${report.counts.clients === report.counts.expectedClients && report.counts.claims === report.counts.expectedClaims ? "MATCH" : "MISMATCH"}`);
  console.log("\nCheck-list for MT:"); for (const c of report.checklist) console.log(` - ${c.record}: ${c.issue}`);
  if (report.warnings.length) { console.log("\nWarnings:"); for (const w of report.warnings) console.log(` - ${w}`); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
