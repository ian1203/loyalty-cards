CREATE TABLE "platform_admins" (
	"auth_user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_platform_admins_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_admins"("auth_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_updated_by_platform_admins_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."platform_admins"("auth_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_auth_user_id_platform_admins_auth_user_id_fk" FOREIGN KEY ("actor_auth_user_id") REFERENCES "public"."platform_admins"("auth_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id");