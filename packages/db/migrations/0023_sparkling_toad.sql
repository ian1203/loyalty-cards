CREATE TYPE "public"."business_plan" AS ENUM('basico', 'negocio', 'intelligence');--> statement-breakpoint
CREATE TABLE "promo_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"sent_by_user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "plan" "business_plan" DEFAULT 'basico' NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_broadcasts" ADD CONSTRAINT "promo_broadcasts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_broadcasts" ADD CONSTRAINT "promo_broadcasts_sent_by_user_id_business_id_users_fk" FOREIGN KEY ("sent_by_user_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_broadcasts_business_id_created_at_idx" ON "promo_broadcasts" USING btree ("business_id","created_at");
--> statement-breakpoint
-- promo_broadcasts: ledger append-only (mismo criterio que
-- transactions/redemptions/audit_logs, ver 0002_rls_policies.sql) — solo
-- SELECT/INSERT, sin UPDATE ni DELETE (un envío ya hecho no se edita ni
-- se borra).
GRANT SELECT, INSERT ON TABLE "promo_broadcasts" TO app_user;
--> statement-breakpoint
ALTER TABLE "promo_broadcasts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "promo_broadcasts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "promo_broadcasts"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);