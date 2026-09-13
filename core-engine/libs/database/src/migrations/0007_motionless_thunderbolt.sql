ALTER TABLE "categories" DROP CONSTRAINT "categories_tenant_slug_key";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_slug_key" ON "categories" USING btree ("tenant_id","slug") WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "categories_tenant_live_idx" ON "categories" USING btree ("tenant_id","deleted_at");