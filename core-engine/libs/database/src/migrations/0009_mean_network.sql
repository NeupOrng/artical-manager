CREATE TABLE "category_slug_redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"old_slug" varchar(120) NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description" varchar(300);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "category_slug_redirects" ADD CONSTRAINT "category_slug_redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_slug_redirects" ADD CONSTRAINT "category_slug_redirects_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_slug_redirects_tenant_slug_key" ON "category_slug_redirects" USING btree ("tenant_id","old_slug");