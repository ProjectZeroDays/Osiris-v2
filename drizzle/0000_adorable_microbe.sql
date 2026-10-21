CREATE TYPE "public"."attribution_tier" AS ENUM('confirmed', 'probable', 'heuristic');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('observed', 'inferred', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"identifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" text,
	"actor_id" text,
	"device_id" text,
	"tool" text NOT NULL,
	"capability" text NOT NULL,
	"asset_id" text,
	"purpose" text,
	"decision" text NOT NULL,
	"reason" text,
	"result_id" text
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"label" text NOT NULL,
	"secret_hash" text NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drones" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"uas_id" text NOT NULL,
	"operator_id" text,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"alt_m" double precision,
	"speed_mps" double precision,
	"heading_deg" double precision,
	"manufacturer" text,
	"observed_at" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tool_id" text NOT NULL,
	"asset_id" text,
	"source_url" text,
	"observed_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"severity" "severity",
	"confidence" double precision,
	"status" "finding_status" DEFAULT 'unverified' NOT NULL,
	"evidence_hash" text,
	"retention_until" timestamp with time zone,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_counters" (
	"tenant_id" text NOT NULL,
	"tool" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveillance_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"mac" text NOT NULL,
	"vendor" text,
	"device_class" text NOT NULL,
	"attribution" "attribution_tier" DEFAULT 'heuristic' NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"observations" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drones" ADD CONSTRAINT "drones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveillance_devices" ADD CONSTRAINT "surveillance_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_tenant_idx" ON "assets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "integration_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "consents_scope_idx" ON "consents" USING btree ("tenant_id","scope");--> statement-breakpoint
CREATE INDEX "devices_tenant_idx" ON "devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "drones_tenant_idx" ON "drones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "findings_tenant_tool_idx" ON "findings" USING btree ("tenant_id","tool_id");--> statement-breakpoint
CREATE INDEX "findings_retention_idx" ON "findings" USING btree ("retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_pk" ON "quota_counters" USING btree ("tenant_id","tool","day");--> statement-breakpoint
CREATE INDEX "surveillance_mac_geo_idx" ON "surveillance_devices" USING btree ("mac","lat","lon");--> statement-breakpoint
CREATE INDEX "surveillance_tenant_idx" ON "surveillance_devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");