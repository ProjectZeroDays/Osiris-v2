ALTER TABLE "quota_counters" ADD COLUMN "cost_units" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_counters" ADD COLUMN "cost_unit" text DEFAULT 'free' NOT NULL;