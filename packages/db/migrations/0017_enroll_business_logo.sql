-- Expone logo_url (0016_lively_wither.sql) a través de la función pública
-- que ya resuelve el negocio por slug para /enroll — mismo criterio que
-- name: dato no sensible, pensado para mostrarse a un visitante sin
-- sesión. Postgres no permite CREATE OR REPLACE cuando cambia el shape de
-- RETURNS TABLE (error 42P13, "Row type defined by OUT parameters is
-- different") — hace falta DROP + CREATE, y por eso hay que repetir el
-- REVOKE/GRANT de 0014 (se pierden al hacer DROP).
DROP FUNCTION public.get_active_business_by_slug(text);
--> statement-breakpoint
CREATE FUNCTION public.get_active_business_by_slug(p_slug text)
RETURNS TABLE (id uuid, name text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.name, b.logo_url
  FROM public.businesses b
  WHERE b.slug = p_slug
    AND b.status = 'active';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_active_business_by_slug FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_active_business_by_slug TO app_user;
