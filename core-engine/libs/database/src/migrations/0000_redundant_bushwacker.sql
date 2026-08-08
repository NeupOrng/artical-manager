CREATE TYPE "public"."article_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."author_role" AS ENUM('admin', 'editor', 'contributor');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"domain" varchar(253) NOT NULL,
	"niche_label" varchar(60) NOT NULL,
	"fb_page_id" varchar(64),
	"fb_page_access_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kratos_identity_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" "author_role" DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_kratos_identity_id_unique" UNIQUE("kratos_identity_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"category_id" uuid,
	"title" varchar(300) NOT NULL,
	"slug" varchar(320) NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excerpt" varchar(500),
	"cover_image" text,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"hook_text" text,
	"fb_post_id" varchar(64),
	"fb_comment_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_tenant_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"object_key" text NOT NULL,
	"type" varchar(100) NOT NULL,
	"size" bigint NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authors_tenant_idx" ON "authors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "authors_tenant_email_idx" ON "authors" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "articles_tenant_status_published_idx" ON "articles" USING btree ("tenant_id","status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_tenant_category_published_idx" ON "articles" USING btree ("tenant_id","category_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_tenant_status_scheduled_idx" ON "articles" USING btree ("tenant_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "articles_tenant_author_idx" ON "articles" USING btree ("tenant_id","author_id");--> statement-breakpoint
CREATE INDEX "media_tenant_created_idx" ON "media" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_tenant_object_key_idx" ON "media" USING btree ("tenant_id","object_key");