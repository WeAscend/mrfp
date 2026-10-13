// MRFP — multi-tenant schema. Every business record carries orgId; all queries go through the tenant-scoped
// helpers in src/lib/tenant.ts so one organisation can never read another's rows.
import { pgTable, text, integer, bigserial, boolean, timestamp, date, numeric, pgEnum, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const id = () => text("id").primaryKey().$defaultFn(() => createId());
const strArray = (name: string) => text(name).array().notNull().default([]);

export const roleEnum = pgEnum("role", ["ADMIN", "USER"]);
export const stageEnum = pgEnum("stage", ["LEAD", "ACTIVE", "INACTIVE"]);
export const clientTypeEnum = pgEnum("client_type", ["INDIVIDUAL", "BUSINESS"]);
export const actionEnum = pgEnum("action_type", ["CREATED", "EDITED", "DELETED", "RESTORED"]);
export const channelEnum = pgEnum("channel", ["EMAIL", "SMS"]);
export const msgStatusEnum = pgEnum("message_status", ["QUEUED", "SENT", "DELIVERED", "OPENED", "BOUNCED", "FAILED", "RECEIVED"]);
export const signStatusEnum = pgEnum("sign_status", ["SENT", "VIEWED", "SIGNED", "DECLINED", "CANCELLED", "EXPIRED"]);

// ---------------- Tenancy, users, billing ----------------
export const organisations = pgTable("organisations", {
  id: id(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(), // e.g. MRF — used in labels like "MRF Invoice Sent"
  slug: text("slug").notNull().unique(),
  country: text("country").notNull().default("AU"),
  holidayRegions: text("holiday_regions").notNull().default("NAT,NSW,VIC"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  a2aChaseBusinessDays: integer("a2a_chase_business_days").notNull().default(6),
  revisitMonths: integer("revisit_months").notNull().default(3),
  // Outreach identity (Spam Act 2003 s17: every commercial message must identify the sender and how to contact them)
  fromEmail: text("from_email"),
  replyTo: text("reply_to"),
  postalAddress: text("postal_address"),
  phone: text("phone"),
  website: text("website"),
  smsSenderId: text("sms_sender_id"), // alphanumeric sender shown on the phone, e.g. MRF
  a2aTemplate: text("a2a_template"), // Authority to Act wording for in-house e-sign; placeholders like {{name}}
  a2aReminderDays: text("a2a_reminder_days").notNull().default("3,6"),
  infoFollowUpDays: integer("info_follow_up_days").notNull().default(7),
  outreachEnabled: boolean("outreach_enabled").notNull().default(false), // hides email/SMS/e-sign buttons until the business is ready
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userCode: text("user_code").notNull(), // MT1 — shown everywhere instead of names
  role: roleEnum("role").notNull().default("USER"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("memberships_org_user").on(t.orgId, t.userId), uniqueIndex("memberships_org_code").on(t.orgId, t.userCode)]);

export const invites = pgTable("invites", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  userCode: text("user_code").notNull(),
  role: roleEnum("role").notNull().default("USER"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ---------------- Reference data ----------------
export const holdingAuthorities = pgTable("holding_authorities", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"), // Authority Code letter — first character of every Claim ID
  chaseAfter: integer("chase_after"), // days; null = no rule
  rechaseAfter: integer("rechase_after"),
  details: text("details"),
  emails: strArray("emails"),
  phones: strArray("phones"),
  website: text("website"),
  address: text("address"),
  mailingAddress: text("mailing_address"),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [uniqueIndex("ha_org_name").on(t.orgId, t.name)]);

export const originatingCompanies = pgTable("originating_companies", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  details: text("details"),
  emails: strArray("emails"),
  phones: strArray("phones"),
  website: text("website"),
  address: text("address"),
  mailingAddress: text("mailing_address"),
  previousNames: strArray("previous_names"), // Previous Names / Acquired By
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [uniqueIndex("oc_org_name").on(t.orgId, t.name)]);

// ---------------- Clients (a lead is a client with stage LEAD) ----------------
export const clients = pgTable("clients", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientCode: text("client_code"), // generated when first Active; permanent
  clientType: clientTypeEnum("client_type").notNull().default("INDIVIDUAL"),
  surname: text("surname"),
  firstName: text("first_name"),
  middleName: text("middle_name"),
  preferredName: text("preferred_name"),
  otherNames: text("other_names"),
  dob: date("dob"),
  email: text("email"), // multi-line, one address per line
  phoneMobile: text("phone_mobile"),
  phoneOther: text("phone_other"),
  currentAddress: text("current_address"),
  currentPOBox: text("current_po_box"),
  previousAddresses: strArray("previous_addresses"),
  addressOnUCM: text("address_on_ucm"),
  businessNames: strArray("business_names"),
  website: text("website"),
  abn: text("abn"),
  acn: text("acn"),
  businessContact: text("business_contact"), // Executor/Administrator Details / Business Contact
  specialConditions: strArray("special_conditions"),
  stage: stageEnum("stage").notNull().default("LEAD"),
  leadIdentifier: text("lead_identifier"),
  inactiveReason: text("inactive_reason"),
  becameNonActive: date("became_non_active"),
  leadAmount: numeric("lead_amount", { precision: 14, scale: 2 }),
  source: text("source"),
  lastContact: date("last_contact"),
  followUp: date("follow_up"),
  followUpReason: text("follow_up_reason"),
  followUpSetBy: text("follow_up_set_by"), // user code or "Automatic"
  infoEmailSent: date("info_email_sent"),
  a2aSent: date("a2a_sent"),
  a2aSigned: date("a2a_signed"),
  // Consent state per channel (history lives in consents). Opt-out always wins over consent.
  emailConsentAt: timestamp("email_consent_at", { withTimezone: true }),
  smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
  emailOptOutAt: timestamp("email_opt_out_at", { withTimezone: true }),
  smsOptOutAt: timestamp("sms_opt_out_at", { withTimezone: true }),
  unsubToken: text("unsub_token").notNull().default(sql`md5(random()::text || clock_timestamp()::text)`),
  ownerCode: text("owner_code").notNull(),
  idLicence: date("id_licence"),
  idPassport: date("id_passport"),
  idMedicare: date("id_medicare"),
  idOther: date("id_other"),
  dateEntered: date("date_entered").notNull(),
  checklist: text("checklist"), // migration check-list note
  migrationRef: text("migration_ref"),
  lastUpdatedBy: text("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // Bin
}, t => [uniqueIndex("clients_org_code").on(t.orgId, t.clientCode), index("clients_org_stage").on(t.orgId, t.stage), index("clients_org_name").on(t.orgId, t.surname, t.firstName)]);

export const relatedClients = pgTable("related_clients", {
  fromId: text("from_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  toId: text("to_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.fromId, t.toId] })]);

export const searchLog = pgTable("search_log", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  authorities: strArray("authorities"), // snapshot of names, not a relation
}, t => [index("search_log_client").on(t.clientId)]);

// ---------------- Claims ----------------
export const claims = pgTable("claims", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  claimId: text("claim_id").notNull(), // AMOOP1-0001
  authorityId: text("authority_id").notNull().references(() => holdingAuthorities.id),
  progress: integer("progress"), // 1..21; null = blank (migration check-list)
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("AUD"),
  accountName: text("account_name"),
  reference: text("reference"), // OTN — text, never a number
  year: text("year"),
  addressOnRegister: text("address_on_register"),
  addressVerification: date("address_verification"),
  haFormSent: date("ha_form_sent"),
  haFormSigned: date("ha_form_signed"),
  dateSubmitted: date("date_submitted"),
  claimApproved: date("claim_approved"),
  refundReceived: date("refund_received"),
  invoiceSent: date("invoice_sent"),
  paymentReceived: date("payment_received"),
  reviewRequested: date("review_requested"),
  reviewCompleted: date("review_completed"),
  closedOn: date("closed_on"), // mirrors the Activity Log close entry, for fast reporting
  feePct: numeric("fee_pct", { precision: 6, scale: 2 }),
  feeManual: numeric("fee_manual", { precision: 14, scale: 2 }), // NZD claims; step 12 sets 0
  gstTreatment: text("gst_treatment").notNull().default("+ GST"),
  followUp: date("follow_up"),
  followUpReason: text("follow_up_reason"),
  followUpSetBy: text("follow_up_set_by"),
  lastChased: date("last_chased"),
  lastChasedBy: text("last_chased_by"),
  screenshotId: text("screenshot_id"),
  checklist: text("checklist"),
  migrationRef: text("migration_ref"),
  migratedNo: text("migrated_no"),
  lastUpdatedBy: text("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [uniqueIndex("claims_org_claimid").on(t.orgId, t.claimId), index("claims_org_progress").on(t.orgId, t.progress), index("claims_client").on(t.clientId)]);

export const claimCompanies = pgTable("claim_companies", {
  claimId: text("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  companyId: text("company_id").notNull().references(() => originatingCompanies.id),
}, t => [primaryKey({ columns: [t.claimId, t.companyId] })]);

export const claimJointOwners = pgTable("claim_joint_owners", {
  claimId: text("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.claimId, t.clientId] })]);

export const a2aEntries = pgTable("a2a_entries", {
  id: id(),
  claimId: text("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  sent: date("sent"),
  signed: date("signed"),
  reason: text("reason"),
  order: integer("order").notNull().default(0),
}, t => [index("a2a_claim").on(t.claimId)]);

export const resubmissions = pgTable("resubmissions", {
  id: id(),
  claimId: text("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
}, t => [index("resub_claim").on(t.claimId)]);

// ---------------- Notes, files, audit, holidays ----------------
export const notes = pgTable("notes", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  claimId: text("claim_id").references(() => claims.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  authorCode: text("author_code").notNull(), // user code, "Import", "Migration", "System"
  system: boolean("system").notNull().default(false), // system/import/migration notes don't move Last Contact
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [index("notes_client_date").on(t.clientId, t.date)]);

export const attachments = pgTable("attachments", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  claimId: text("claim_id").references(() => claims.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(), // key in the configured storage driver (local disk or S3)
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [index("attachments_client").on(t.clientId)]);

export const activityLog = pgTable("activity_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  userCode: text("user_code").notNull(),
  action: actionEnum("action").notNull(),
  entityType: text("entity_type").notNull(), // Client | Claim | Holding Authority | Originating Company | Note | File | User
  entityId: text("entity_id"),
  recordRef: text("record_ref").notNull(), // Client Code / Claim ID / name
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
}, t => [index("activity_org_ts").on(t.orgId, t.timestamp), index("activity_org_ref").on(t.orgId, t.recordRef)]);

// ---------------- Communications: consent, templates, messages, calls, e-sign ----------------
/** Consent history: one row per grant/withdrawal so we can show who captured consent, when and how. */
export const consents = pgTable("consents", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  channel: channelEnum("channel").notNull(),
  granted: boolean("granted").notNull(), // true = consent given, false = withdrawn / opted out
  method: text("method").notNull(), // Phone call | Web form | Written | Unsubscribe link | SMS STOP | Existing relationship | Import
  capturedBy: text("captured_by").notNull(), // user code or "Client" / "System"
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("consents_client").on(t.clientId)]);

export const messageTemplates = pgTable("message_templates", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // info_email | a2a_sign | a2a_reminder | ha_chase | id_request | invoice | info_sms | a2a_sms
  channel: channelEnum("channel").notNull(),
  name: text("name").notNull(),
  subject: text("subject"),
  body: text("body").notNull(), // plain text with {{placeholders}}
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("tpl_org_key").on(t.orgId, t.key)]);

export const messages = pgTable("messages", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  claimId: text("claim_id").references(() => claims.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  direction: text("direction").notNull().default("OUT"), // OUT | IN
  toAddress: text("to_address").notNull(),
  toName: text("to_name"),
  subject: text("subject"),
  body: text("body").notNull(),
  templateKey: text("template_key"),
  status: msgStatusEnum("status").notNull().default("QUEUED"),
  providerId: text("provider_id"),
  error: text("error"),
  sentBy: text("sent_by").notNull(), // user code or "System"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
}, t => [index("messages_client").on(t.clientId), index("messages_org_created").on(t.orgId, t.createdAt)]);

export const calls = pgTable("calls", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(), // Spoke | No answer | Voicemail | Wrong number | Not interested | Call back
  number: text("number"),
  note: text("note"),
  userCode: text("user_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("calls_client").on(t.clientId)]);

/** In-house e-sign: one request per Authority to Act sent for signature. */
export const signRequests = pgTable("sign_requests", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  claimId: text("claim_id").references(() => claims.id, { onDelete: "set null" }),
  token: text("token").notNull().unique().$defaultFn(() => createId() + createId()),
  kind: text("kind").notNull().default("A2A"),
  status: signStatusEnum("status").notNull().default("SENT"),
  documentText: text("document_text").notNull(), // the exact wording shown to the signer, rendered at send time
  signerEmail: text("signer_email"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signerAgent: text("signer_agent"),
  signatureData: text("signature_data"), // data URL of the drawn signature, or typed name
  attachmentId: text("attachment_id"), // signed PDF stored in attachments
  remindersSent: integer("reminders_sent").notNull().default(0),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  sentBy: text("sent_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, t => [index("sign_client").on(t.clientId), index("sign_org_status").on(t.orgId, t.status)]);

export const holidays = pgTable("holidays", {
  date: date("date").notNull(),
  region: text("region").notNull(), // NAT | NSW | VIC | QLD | SA | WA | TAS | ACT | NT
  name: text("name").notNull(),
}, t => [primaryKey({ columns: [t.date, t.region] })]);

// ---------------- relations (for db.query) ----------------
export const clientRelations = relations(clients, ({ many }) => ({
  claims: many(claims), notes: many(notes), attachments: many(attachments), searchLog: many(searchLog), messages: many(messages), consents: many(consents), calls: many(calls), signRequests: many(signRequests),
  relatedFrom: many(relatedClients, { relationName: "from" }), relatedTo: many(relatedClients, { relationName: "to" }),
}));
export const relatedClientRelations = relations(relatedClients, ({ one }) => ({
  from: one(clients, { fields: [relatedClients.fromId], references: [clients.id], relationName: "from" }),
  to: one(clients, { fields: [relatedClients.toId], references: [clients.id], relationName: "to" }),
}));
export const claimRelations = relations(claims, ({ one, many }) => ({
  client: one(clients, { fields: [claims.clientId], references: [clients.id] }),
  authority: one(holdingAuthorities, { fields: [claims.authorityId], references: [holdingAuthorities.id] }),
  companies: many(claimCompanies), jointOwners: many(claimJointOwners), a2aLog: many(a2aEntries), resubmissions: many(resubmissions), notes: many(notes),
}));
export const claimCompanyRelations = relations(claimCompanies, ({ one }) => ({
  claim: one(claims, { fields: [claimCompanies.claimId], references: [claims.id] }),
  company: one(originatingCompanies, { fields: [claimCompanies.companyId], references: [originatingCompanies.id] }),
}));
export const claimJointRelations = relations(claimJointOwners, ({ one }) => ({
  claim: one(claims, { fields: [claimJointOwners.claimId], references: [claims.id] }),
  client: one(clients, { fields: [claimJointOwners.clientId], references: [clients.id] }),
}));
export const a2aRelations = relations(a2aEntries, ({ one }) => ({ claim: one(claims, { fields: [a2aEntries.claimId], references: [claims.id] }) }));
export const resubRelations = relations(resubmissions, ({ one }) => ({ claim: one(claims, { fields: [resubmissions.claimId], references: [claims.id] }) }));
export const noteRelations = relations(notes, ({ one }) => ({ client: one(clients, { fields: [notes.clientId], references: [clients.id] }), claim: one(claims, { fields: [notes.claimId], references: [claims.id] }) }));
export const searchLogRelations = relations(searchLog, ({ one }) => ({ client: one(clients, { fields: [searchLog.clientId], references: [clients.id] }) }));
export const attachmentRelations = relations(attachments, ({ one }) => ({ client: one(clients, { fields: [attachments.clientId], references: [clients.id] }) }));
export const membershipRelations = relations(memberships, ({ one }) => ({ org: one(organisations, { fields: [memberships.orgId], references: [organisations.id] }), user: one(users, { fields: [memberships.userId], references: [users.id] }) }));
export const orgRelations = relations(organisations, ({ many }) => ({ members: many(memberships) }));
export const haRelations = relations(holdingAuthorities, ({ many }) => ({ claims: many(claims) }));
export const messageRelations = relations(messages, ({ one }) => ({ client: one(clients, { fields: [messages.clientId], references: [clients.id] }), claim: one(claims, { fields: [messages.claimId], references: [claims.id] }) }));
export const consentRelations = relations(consents, ({ one }) => ({ client: one(clients, { fields: [consents.clientId], references: [clients.id] }) }));
export const callRelations = relations(calls, ({ one }) => ({ client: one(clients, { fields: [calls.clientId], references: [clients.id] }) }));
export const signRequestRelations = relations(signRequests, ({ one }) => ({ client: one(clients, { fields: [signRequests.clientId], references: [clients.id] }), claim: one(claims, { fields: [signRequests.claimId], references: [claims.id] }) }));

export type Client = typeof clients.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type HoldingAuthority = typeof holdingAuthorities.$inferSelect;
export type OriginatingCompany = typeof originatingCompanies.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type A2AEntry = typeof a2aEntries.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type SignRequest = typeof signRequests.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export const userRelations = relations(users, ({ many }) => ({ memberships: many(memberships) }));
