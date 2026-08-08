ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
-- Hand-added: drizzle-kit cannot know the data transformation, and the cast
-- back to the new enum below fails on any row still holding 'scheduled'
-- ("invalid input value for enum"). Scheduling was removed, so those articles
-- revert to drafts and an editor publishes them when they choose.
UPDATE "articles" SET "status" = 'draft' WHERE "status" = 'scheduled';--> statement-breakpoint
DROP TYPE "public"."article_status";--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."article_status";--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE "public"."article_status" USING "status"::"public"."article_status";--> statement-breakpoint
DROP INDEX "articles_tenant_status_scheduled_idx";--> statement-breakpoint
ALTER TABLE "articles" DROP COLUMN "scheduled_at";