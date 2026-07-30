-- `roles` no es dato de tenant: 'owner'/'admin'/'staff' significan lo mismo
-- para todos los negocios y no hay ninguna columna que varíe su semántica
-- por business_id (no hay permisos por fila). Mantenerlo tenant-scoped solo
-- duplicaba las mismas 3 filas por cada negocio sin ganar nada a cambio.
-- Se convierte en catálogo global de plataforma: sin business_id, sin RLS,
-- de solo lectura para app_user. users.role_id sigue siendo la misma FK de
-- siempre, ahora apuntando a un catálogo compartido en vez de una copia por
-- negocio.
--
-- No hay filas existentes que migrar (roles nace vacío en todos los
-- entornos de Fase 0 hasta ahora); si algo estuviera sembrado, esta
-- migración asume que puede vaciarse sin pérdida real de datos.
--> statement-breakpoint
DELETE FROM roles;
--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "roles";
--> statement-breakpoint
ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_business_id_businesses_id_fk";
--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_business_id_name_key";
--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "business_id";
--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_name_key" UNIQUE ("name");
--> statement-breakpoint
REVOKE INSERT, UPDATE ON TABLE "roles" FROM app_user;
--> statement-breakpoint
INSERT INTO "roles" ("name") VALUES ('owner'), ('admin'), ('staff');
