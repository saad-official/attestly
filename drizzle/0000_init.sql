-- pgvector: on Neon (and PGlite with @electric-sql/pglite-pgvector) the extension is
-- created in the default schema (public), so vector(768) and <=> resolve via search_path.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "attestly";
--> statement-breakpoint
CREATE TYPE "attestly"."actor" AS ENUM('agent', 'user', 'system', 'cron', 'webhook');--> statement-breakpoint
CREATE TYPE "attestly"."document_kind" AS ENUM('policy', 'past_questionnaire', 'pasted');--> statement-breakpoint
CREATE TYPE "attestly"."document_status" AS ENUM('indexing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "attestly"."email_provider" AS ENUM('outbox', 'resend');--> statement-breakpoint
CREATE TYPE "attestly"."library_source" AS ENUM('import', 'questionnaire', 'manual');--> statement-breakpoint
CREATE TYPE "attestly"."membership_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "attestly"."outbox_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "attestly"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "attestly"."question_status" AS ENUM('pending', 'drafted', 'needs_evidence', 'not_applicable', 'approved');--> statement-breakpoint
CREATE TYPE "attestly"."questionnaire_status" AS ENUM('mapping', 'drafting', 'review', 'done');--> statement-breakpoint
CREATE TABLE "attestly"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor" "attestly"."actor" NOT NULL,
	"type" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"input" jsonb,
	"output" jsonb,
	"model" text,
	"prompt_version" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"heading_path" text[] DEFAULT '{}'::text[] NOT NULL,
	"text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "attestly"."document_kind" DEFAULT 'policy' NOT NULL,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"original" "bytea",
	"text" text DEFAULT '' NOT NULL,
	"status" "attestly"."document_status" DEFAULT 'indexing' NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."library_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"source" "attestly"."library_source" DEFAULT 'manual' NOT NULL,
	"questionnaire_id" uuid,
	"question_id" uuid,
	"embedding" vector(768),
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."memberships" (
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "attestly"."membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "attestly"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "attestly"."plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "organizations_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "attestly"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text,
	"text" text NOT NULL,
	"provider" "attestly"."email_provider" DEFAULT 'outbox' NOT NULL,
	"provider_message_id" text,
	"delivered_to" text,
	"status" "attestly"."outbox_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"customer" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"original" "bytea" NOT NULL,
	"sheet_name" text,
	"header_row" integer,
	"id_col" integer,
	"question_col" integer,
	"answer_col" integer,
	"comment_col" integer,
	"status" "attestly"."questionnaire_status" DEFAULT 'mapping' NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"drafted_count" integer DEFAULT 0 NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"needs_evidence_count" integer DEFAULT 0 NOT NULL,
	"public_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaires_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "attestly"."questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"section" text,
	"external_id" text,
	"text" text NOT NULL,
	"draft" text,
	"final" text,
	"status" "attestly"."question_status" DEFAULT 'pending' NOT NULL,
	"confidence" real,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieval" jsonb,
	"notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestly"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "attestly"."share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "attestly"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"business_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "attestly"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attestly"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "attestly"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."agent_events" ADD CONSTRAINT "agent_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "attestly"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."chunks" ADD CONSTRAINT "chunks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."library_answers" ADD CONSTRAINT "library_answers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."library_answers" ADD CONSTRAINT "library_answers_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "attestly"."questionnaires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."library_answers" ADD CONSTRAINT "library_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "attestly"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "attestly"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."outbox" ADD CONSTRAINT "outbox_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."questionnaires" ADD CONSTRAINT "questionnaires_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."questions" ADD CONSTRAINT "questions_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "attestly"."questionnaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."questions" ADD CONSTRAINT "questions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."questions" ADD CONSTRAINT "questions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "attestly"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "attestly"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."share_links" ADD CONSTRAINT "share_links_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "attestly"."questionnaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestly"."share_links" ADD CONSTRAINT "share_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "attestly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "attestly"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_events_org_created_idx" ON "attestly"."agent_events" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_events_entity_idx" ON "attestly"."agent_events" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST) WHERE "attestly"."agent_events"."entity_id" is not null;--> statement-breakpoint
CREATE INDEX "chunks_document_position_idx" ON "attestly"."chunks" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "chunks_org_idx" ON "attestly"."chunks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "documents_org_created_idx" ON "attestly"."documents" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_org_status_idx" ON "attestly"."documents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "library_answers_org_created_idx" ON "attestly"."library_answers" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "library_answers_question_key" ON "attestly"."library_answers" USING btree ("question_id") WHERE "attestly"."library_answers"."question_id" is not null;--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "attestly"."memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_org_created_idx" ON "attestly"."outbox" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "questionnaires_org_created_idx" ON "attestly"."questionnaires" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "questionnaires_org_status_idx" ON "attestly"."questionnaires" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "questions_questionnaire_row_idx" ON "attestly"."questions" USING btree ("questionnaire_id","row_number");--> statement-breakpoint
CREATE INDEX "questions_questionnaire_status_idx" ON "attestly"."questions" USING btree ("questionnaire_id","status");--> statement-breakpoint
CREATE INDEX "questions_org_status_idx" ON "attestly"."questions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "attestly"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_links_questionnaire_idx" ON "attestly"."share_links" USING btree ("questionnaire_id");--> statement-breakpoint
CREATE INDEX "share_links_expires_idx" ON "attestly"."share_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "attestly"."verification" USING btree ("identifier");