-- Permite auditar acciones de gestión de CUENTAS de plataforma (invitar/
-- desactivar/cambiar rol de un platform_admin, ver Panel de Admin de
-- Plataforma) que no tienen ningún negocio al que asociarse — a diferencia
-- de business.created, que sí. RLS sigue protegiendo a app_user igual que
-- antes: business_id NULL nunca calza contra
-- current_setting('app.current_business_id'), así que estas filas siguen
-- siendo estructuralmente invisibles para cualquier sesión de tenant.
ALTER TABLE "audit_logs" ALTER COLUMN "business_id" DROP NOT NULL;