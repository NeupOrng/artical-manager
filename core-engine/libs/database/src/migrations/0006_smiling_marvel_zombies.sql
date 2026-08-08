CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kratos_identity_id" uuid NOT NULL,
	"username" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_kratos_identity_id_unique" UNIQUE("kratos_identity_id"),
	CONSTRAINT "platform_admins_username_unique" UNIQUE("username")
);
