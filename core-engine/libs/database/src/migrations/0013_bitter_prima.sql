ALTER TABLE "authors" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "last_seen_at" timestamp with time zone;