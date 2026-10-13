ALTER TABLE "sign_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sign_requests" CASCADE;--> statement-breakpoint
ALTER TABLE "organisations" ALTER COLUMN "info_follow_up_days" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "default_owner_code" text;--> statement-breakpoint
DROP TYPE "public"."sign_status";