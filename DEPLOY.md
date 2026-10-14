# Deploying MRFP (Vercel + Neon) — about 15 minutes

Everything below is free-tier for one business. You need a GitHub account that can see `WeAscend/mrfp`.

## 1. Database — Neon
1. https://neon.tech → Sign up (GitHub login is fine) → **New project**: name `mrfp`, region **AWS Sydney (ap-southeast-2)**, Postgres 16.
2. On the project dashboard copy the **connection string** (starts `postgresql://…neon.tech/neondb?sslmode=require`).

## 2. App — Vercel
1. https://vercel.com → Sign up with GitHub → **Add New… → Project** → import `WeAscend/mrfp` (install the Vercel GitHub app on the WeAscend org when asked).
2. Framework is detected as Next.js. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `SESSION_SECRET` | any random text, 32+ characters |
   | `APP_URL` | leave blank for now; set to the Vercel URL after the first deploy |

3. **Deploy.** The build runs the database migrations first (`vercel-build` in package.json), then builds the app.
4. When it finishes, open the URL Vercel gives you (something like `mrfp-xxxx.vercel.app`). Set `APP_URL` to that and redeploy (Settings → Environment Variables → then Deployments → Redeploy).

## 3. First login
1. Open the URL → **Create an organisation**: My Refund Finder, short name MRF, your name, email, password.
2. You're logged in as the first Admin (code = your initials + 1). Settings › Organisation → **Load sample data** to look around with the fake test pack, or Setup › Import leads with a CSV.
3. Add MT under Settings › Users when she's ready (code MT1); set Settings › Users › Default owner to MT1.

## 4. Before the real trial (not needed for a first look)
- **Files:** uploads on Vercel are kept only in temporary space. Create a Cloudflare R2 bucket (or S3 in Sydney) and set
  `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (R2), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- **Own domain:** Vercel → project → Domains → add e.g. `app.myrefundfinder.com.au` and follow the DNS instruction.
- **Real data:** export Airtable per Spec 10 / Decisions 2.2, then run `npx tsx scripts/migrate-airtable.ts --org my-refund-finder --user <admin email> --dir <folder>` with `DATABASE_URL` pointing at Neon (I can run this for you once you share the connection string).

## Updating
Every push to `main` on GitHub redeploys automatically; migrations run as part of the build.
