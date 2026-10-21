ALTER TABLE "devices" ADD COLUMN "previous_secret_hash" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "secret_rotated_at" timestamp with time zone;