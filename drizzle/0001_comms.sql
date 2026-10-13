CREATE TYPE "public"."channel" AS ENUM('EMAIL', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'BOUNCED', 'FAILED', 'RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."sign_status" AS ENUM('SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"outcome" text NOT NULL,
	"number" text,
	"note" text,
	"user_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"granted" boolean NOT NULL,
	"method" text NOT NULL,
	"captured_by" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"channel" "channel" NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text,
	"claim_id" text,
	"channel" "channel" NOT NULL,
	"direction" text DEFAULT 'OUT' NOT NULL,
	"to_address" text NOT NULL,
	"to_name" text,
	"subject" text,
	"body" text NOT NULL,
	"template_key" text,
	"status" "message_status" DEFAULT 'QUEUED' NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sign_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"claim_id" text,
	"token" text NOT NULL,
	"kind" text DEFAULT 'A2A' NOT NULL,
	"status" "sign_status" DEFAULT 'SENT' NOT NULL,
	"document_text" text NOT NULL,
	"signer_email" text,
	"signer_name" text,
	"signer_ip" text,
	"signer_agent" text,
	"signature_data" text,
	"attachment_id" text,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp,
	"sent_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"viewed_at" timestamp,
	"signed_at" timestamp,
	"expires_at" timestamp,
	CONSTRAINT "sign_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_opt_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_opt_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "unsub_token" text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "from_email" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "reply_to" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "postal_address" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "sms_sender_id" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "a2a_template" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "a2a_reminder_days" text DEFAULT '3,6' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "info_follow_up_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_client" ON "calls" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "consents_client" ON "consents" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tpl_org_key" ON "message_templates" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "messages_client" ON "messages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "messages_org_created" ON "messages" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "sign_client" ON "sign_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "sign_org_status" ON "sign_requests" USING btree ("org_id","status");