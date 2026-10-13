CREATE TYPE "public"."action_type" AS ENUM('CREATED', 'EDITED', 'DELETED', 'RESTORED');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('INDIVIDUAL', 'BUSINESS');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('LEAD', 'ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');--> statement-breakpoint
CREATE TABLE "a2a_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"sent" date,
	"signed" date,
	"reason" text,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_code" text NOT NULL,
	"action" "action_type" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"record_ref" text NOT NULL,
	"field" text,
	"old_value" text,
	"new_value" text
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"claim_id" text,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "claim_companies" (
	"claim_id" text NOT NULL,
	"company_id" text NOT NULL,
	CONSTRAINT "claim_companies_claim_id_company_id_pk" PRIMARY KEY("claim_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "claim_joint_owners" (
	"claim_id" text NOT NULL,
	"client_id" text NOT NULL,
	CONSTRAINT "claim_joint_owners_claim_id_client_id_pk" PRIMARY KEY("claim_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"authority_id" text NOT NULL,
	"progress" integer,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'AUD' NOT NULL,
	"account_name" text,
	"reference" text,
	"year" text,
	"address_on_register" text,
	"address_verification" date,
	"ha_form_sent" date,
	"ha_form_signed" date,
	"date_submitted" date,
	"claim_approved" date,
	"refund_received" date,
	"invoice_sent" date,
	"payment_received" date,
	"review_requested" date,
	"review_completed" date,
	"closed_on" date,
	"fee_pct" numeric(6, 2),
	"fee_manual" numeric(14, 2),
	"gst_treatment" text DEFAULT '+ GST' NOT NULL,
	"follow_up" date,
	"follow_up_reason" text,
	"follow_up_set_by" text,
	"last_chased" date,
	"last_chased_by" text,
	"screenshot_id" text,
	"checklist" text,
	"migration_ref" text,
	"migrated_no" text,
	"last_updated_by" text,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_code" text,
	"client_type" "client_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"surname" text,
	"first_name" text,
	"middle_name" text,
	"preferred_name" text,
	"other_names" text,
	"dob" date,
	"email" text,
	"phone_mobile" text,
	"phone_other" text,
	"current_address" text,
	"current_po_box" text,
	"previous_addresses" text[] DEFAULT '{}' NOT NULL,
	"address_on_ucm" text,
	"business_names" text[] DEFAULT '{}' NOT NULL,
	"website" text,
	"abn" text,
	"acn" text,
	"business_contact" text,
	"special_conditions" text[] DEFAULT '{}' NOT NULL,
	"stage" "stage" DEFAULT 'LEAD' NOT NULL,
	"lead_identifier" text,
	"inactive_reason" text,
	"became_non_active" date,
	"lead_amount" numeric(14, 2),
	"source" text,
	"last_contact" date,
	"follow_up" date,
	"follow_up_reason" text,
	"follow_up_set_by" text,
	"info_email_sent" date,
	"a2a_sent" date,
	"a2a_signed" date,
	"owner_code" text NOT NULL,
	"id_licence" date,
	"id_passport" date,
	"id_medicare" date,
	"id_other" date,
	"date_entered" date NOT NULL,
	"checklist" text,
	"migration_ref" text,
	"last_updated_by" text,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "holding_authorities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"chase_after" integer,
	"rechase_after" integer,
	"details" text,
	"emails" text[] DEFAULT '{}' NOT NULL,
	"phones" text[] DEFAULT '{}' NOT NULL,
	"website" text,
	"address" text,
	"mailing_address" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date NOT NULL,
	"region" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "holidays_date_region_pk" PRIMARY KEY("date","region")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"user_code" text NOT NULL,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_code" text NOT NULL,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"claim_id" text,
	"date" date NOT NULL,
	"author_code" text NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text DEFAULT 'AU' NOT NULL,
	"holiday_regions" text DEFAULT 'NAT,NSW,VIC' NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '10' NOT NULL,
	"a2a_chase_business_days" integer DEFAULT 6 NOT NULL,
	"revisit_months" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "originating_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"details" text,
	"emails" text[] DEFAULT '{}' NOT NULL,
	"phones" text[] DEFAULT '{}' NOT NULL,
	"website" text,
	"address" text,
	"mailing_address" text,
	"previous_names" text[] DEFAULT '{}' NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "related_clients" (
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	CONSTRAINT "related_clients_from_id_to_id_pk" PRIMARY KEY("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE "resubmissions" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"date" date NOT NULL,
	"authorities" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"status" "subscription_status" DEFAULT 'TRIALING' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"trial_ends_at" timestamp,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "a2a_entries" ADD CONSTRAINT "a2a_entries_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_companies" ADD CONSTRAINT "claim_companies_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_companies" ADD CONSTRAINT "claim_companies_company_id_originating_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."originating_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_joint_owners" ADD CONSTRAINT "claim_joint_owners_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_joint_owners" ADD CONSTRAINT "claim_joint_owners_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_authority_id_holding_authorities_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."holding_authorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_authorities" ADD CONSTRAINT "holding_authorities_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "originating_companies" ADD CONSTRAINT "originating_companies_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_clients" ADD CONSTRAINT "related_clients_from_id_clients_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_clients" ADD CONSTRAINT "related_clients_to_id_clients_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resubmissions" ADD CONSTRAINT "resubmissions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_log" ADD CONSTRAINT "search_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "a2a_claim" ON "a2a_entries" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "activity_org_ts" ON "activity_log" USING btree ("org_id","timestamp");--> statement-breakpoint
CREATE INDEX "activity_org_ref" ON "activity_log" USING btree ("org_id","record_ref");--> statement-breakpoint
CREATE INDEX "attachments_client" ON "attachments" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_org_claimid" ON "claims" USING btree ("org_id","claim_id");--> statement-breakpoint
CREATE INDEX "claims_org_progress" ON "claims" USING btree ("org_id","progress");--> statement-breakpoint
CREATE INDEX "claims_client" ON "claims" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_org_code" ON "clients" USING btree ("org_id","client_code");--> statement-breakpoint
CREATE INDEX "clients_org_stage" ON "clients" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "clients_org_name" ON "clients" USING btree ("org_id","surname","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "ha_org_name" ON "holding_authorities" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_code" ON "memberships" USING btree ("org_id","user_code");--> statement-breakpoint
CREATE INDEX "notes_client_date" ON "notes" USING btree ("client_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "oc_org_name" ON "originating_companies" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "resub_claim" ON "resubmissions" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "search_log_client" ON "search_log" USING btree ("client_id");