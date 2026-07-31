CREATE TABLE "device_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"wallet_pass_id" uuid NOT NULL,
	"device_library_identifier" text NOT NULL,
	"push_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_registrations_device_wallet_pass_key" UNIQUE("device_library_identifier","wallet_pass_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD COLUMN "authentication_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_authentication_token_unique" UNIQUE("authentication_token");--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_customer_id_platform_key" UNIQUE("customer_id","platform");--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_wallet_pass_id_business_id_wallet_passes_fk" FOREIGN KEY ("wallet_pass_id","business_id") REFERENCES "public"."wallet_passes"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_registrations_business_id_idx" ON "device_registrations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "device_registrations_wallet_pass_id_idx" ON "device_registrations" USING btree ("wallet_pass_id");
--> statement-breakpoint
-- device_registrations: mismo trigger de updated_at que toda otra tabla
-- (la función set_updated_at ya existe desde la migración 0001).
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "device_registrations" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
-- device_registrations: RLS + grants, mismo patrón "tenant_isolation" que
-- toda tabla tenant (0002_rls_policies.sql). ÚNICA excepción de grants en
-- todo el esquema: SÍ lleva DELETE. Es un registro de dispositivo
-- puramente efímero (lo que Apple crea/borra vía POST/DELETE en el web
-- service de PassKit) sin valor de auditoría propio — desregistrar borra
-- la fila de verdad, no es un record de negocio que deba preservarse como
-- el resto del esquema (que es deliberadamente append-only / soft-delete).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "device_registrations" TO app_user;
--> statement-breakpoint
ALTER TABLE "device_registrations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "device_registrations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "device_registrations"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
