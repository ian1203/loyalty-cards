-- Panel de Admin de Plataforma: rol owner/viewer para platform_admins,
-- dos estados nuevos de negocio (unpaid/deleted, ambos soft — nunca DELETE
-- físico, ver comentario en businesses.ts) y el ledger de impersonación de
-- negocio. El cambio al custom access token hook que consume todo esto se
-- agrega aparte, en una migración propia (mayor riesgo, fuera de alcance
-- acá).
CREATE TYPE "public"."platform_role" AS ENUM('owner', 'viewer');--> statement-breakpoint
-- Dos ALTER TYPE ADD VALUE separados por statement-breakpoint: Postgres no
-- permite usar un valor de enum agregado por ALTER TYPE ADD VALUE dentro de
-- la MISMA transacción en la que se agregó (esta migración no los usa en
-- ningún UPDATE/INSERT, así que no aplicaría de todas formas, pero se
-- mantiene el patrón por consistencia con el resto del archivo).
ALTER TYPE "public"."business_status" ADD VALUE 'unpaid';--> statement-breakpoint
ALTER TYPE "public"."business_status" ADD VALUE 'deleted';--> statement-breakpoint
CREATE TABLE "platform_impersonation_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_admin_auth_user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"platform_role_at_grant_time" "platform_role" NOT NULL,
	"impersonated_users_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
-- Reemplaza el UNIQUE global de una sola columna sobre auth_user_id (creado
-- en 0008_breezy_jack_power.sql como "users_auth_user_id_unique") por el
-- compuesto (auth_user_id, business_id) de más abajo — necesario para que
-- un platform admin que impersona pueda tener una fila real de `users` por
-- cada negocio impersonado, mismo auth_user_id en negocios distintos (ver
-- platformImpersonationGrants.ts). Sigue impidiendo dos filas activas del
-- mismo auth_user_id en el MISMO negocio.
ALTER TABLE "users" DROP CONSTRAINT "users_auth_user_id_unique";--> statement-breakpoint
-- DEFAULT 'owner' a nivel de DB (no solo en Drizzle) a propósito: ya
-- existen filas reales de platform_admins en prod sembradas antes de que
-- existiera el concepto de rol (acceso total sin distinción) y varios
-- sitios de test que insertan sin especificar rol — el default preserva
-- ese comportamiento para todas esas filas/inserts sin tocarlos.
ALTER TABLE "platform_admins" ADD COLUMN "platform_role" "platform_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
-- Mismo criterio de soft-deactivation que users.is_active/
-- employees.is_active: nunca DELETE, porque audit_logs.actor_auth_user_id
-- referencia esta tabla.
ALTER TABLE "platform_admins" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_impersonation_grants" ADD CONSTRAINT "platform_impersonation_grants_platform_admin_auth_user_id_platform_admins_auth_user_id_fk" FOREIGN KEY ("platform_admin_auth_user_id") REFERENCES "public"."platform_admins"("auth_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_impersonation_grants" ADD CONSTRAINT "platform_impersonation_grants_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_impersonation_grants" ADD CONSTRAINT "platform_impersonation_grants_impersonated_users_id_business_id_users_fk" FOREIGN KEY ("impersonated_users_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_impersonation_grants_platform_admin_auth_user_id_idx" ON "platform_impersonation_grants" USING btree ("platform_admin_auth_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_business_id_key" UNIQUE("auth_user_id","business_id");

-- Nota deliberada, no un olvido: platform_impersonation_grants NO recibe
-- ningún GRANT hacia app_user/authenticated/anon en esta migración — mismo
-- patrón que platform_admins (tabla 100% interna de plataforma, sin RLS,
-- sin GRANT a nadie salvo el rol de servicio). Postgres no otorga
-- privilegios a PUBLIC sobre una tabla nueva por defecto, así que la
-- ausencia de GRANT ya es deny-by-default — no hace falta ALTER TABLE ...
-- ENABLE ROW LEVEL SECURITY encima (platform_admins tampoco lo tiene). El
-- GRANT SELECT puntual para supabase_auth_admin (necesario para que el
-- hook de auth resuelva el claim de impersonación) se agrega en la
-- migración del hook, fuera de este cambio.