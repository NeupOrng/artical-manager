CREATE TYPE "public"."media_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "original_filename" varchar(255);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "status" "media_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "variants" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "processing_error" text;--> statement-breakpoint
CREATE INDEX "media_tenant_status_idx" ON "media" USING btree ("tenant_id","status");