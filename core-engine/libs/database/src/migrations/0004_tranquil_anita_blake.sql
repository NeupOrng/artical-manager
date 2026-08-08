ALTER TABLE "authors" ADD COLUMN "username" varchar(64);--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "quote" text;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "telegram" varchar(64);--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "contact_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_tenant_username_key" UNIQUE("tenant_id","username");