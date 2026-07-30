-- Vincula nuestras tablas con la identidad real que administra Supabase
-- Auth (auth.users, tabla que Supabase crea — nuestras migraciones nunca la
-- tocan). Sin FK explícita de Drizzle (ver schema/users.ts y
-- schema/platformAdmins.ts) porque drizzle-kit no distingue "esta tabla ya
-- existe, no la generes" de "gestiona esta tabla". Sin ON DELETE CASCADE a
-- propósito: si se borra un auth.users, preferimos que el borrado falle
-- (RESTRICT, el comportamiento por defecto) antes que perder en silencio el
-- rastro de auditoría o la membresía de negocio.
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_auth_users_id_fk"
  FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");
--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_auth_user_id_auth_users_id_fk"
  FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");
--> statement-breakpoint

-- Custom Access Token Hook: Supabase Auth llama esta función justo antes de
-- firmar cada JWT (login, refresh) y permite añadir claims personalizados.
-- Inyecta business_id/tenant_role/location_id/is_platform_admin YA
-- VALIDADOS — ver apps/web/lib/supabase/session.ts para cómo se leen por
-- request. Un usuario con is_active = false no recibe business_id/
-- tenant_role (queda sin acceso a ningún tenant aunque su JWT siga siendo
-- válido).
--
-- El claim se llama "tenant_role", NUNCA "role": GoTrue reserva "role" como
-- claim del sistema (el rol de Postgres/PostgREST del request, típicamente
-- "authenticated") y valida que sea siempre un string no-nulo — sobrescribir
-- "role" con nuestro rol de negocio (o null para un admin de plataforma sin
-- negocio) rompe esa validación y GoTrue devuelve 500 en cada login
-- ("output claims do not conform to the expected schema").
CREATE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  auth_user uuid := (event->>'user_id')::uuid;
  is_admin boolean;
  v_business_id uuid;
  v_role text;
  v_location_id uuid;
BEGIN
  -- event->'claims' puede venir como NULL de SQL (clave ausente) o como el
  -- literal jsonb `null` (clave presente con valor null) — COALESCE por sí
  -- solo no atrapa el segundo caso, y jsonb_set sobre un `null` de jsonb
  -- falla o no hace nada, devolviendo un token con claims inválidos.
  claims := event->'claims';
  IF claims IS NULL OR jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    claims := '{}'::jsonb;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.platform_admins WHERE platform_admins.auth_user_id = auth_user
  ) INTO is_admin;

  SELECT u.business_id, r.name, e.primary_location_id
    INTO v_business_id, v_role, v_location_id
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  LEFT JOIN public.employees e
    ON e.user_id = u.id AND e.business_id = u.business_id
  WHERE u.auth_user_id = auth_user
    AND u.is_active = true;

  -- to_jsonb(NULL::algo) devuelve NULL de SQL, no el literal jsonb `null` —
  -- y jsonb_set es estricta: un solo argumento NULL colapsa TODO el
  -- resultado a NULL (exactamente el bug que rompía el login: business_id/
  -- role/location_id son NULL en el caso normal — sin negocio, sin location
  -- — y eso volvía nulo el token entero). COALESCE después de to_jsonb
  -- convierte ese NULL de SQL en el `null` de jsonb que sí queremos.
  claims := jsonb_set(claims, '{is_platform_admin}', to_jsonb(COALESCE(is_admin, false)));
  claims := jsonb_set(claims, '{business_id}', COALESCE(to_jsonb(v_business_id), 'null'::jsonb));
  claims := jsonb_set(claims, '{tenant_role}', COALESCE(to_jsonb(v_role), 'null'::jsonb));
  claims := jsonb_set(claims, '{location_id}', COALESCE(to_jsonb(v_location_id), 'null'::jsonb));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
--> statement-breakpoint

-- supabase_auth_admin es el rol interno que usa el servicio de Auth para
-- llamar este hook — nunca es alcanzable por clientes/app code. Necesita
-- leer users/employees ANTES de que exista ningún contexto de tenant
-- (set_config nunca se llamó todavía en esta conexión), así que RLS lo
-- bloquearía por completo. "supabase_auth_admin" es un rol reservado de la
-- plataforma — ni siquiera nuestro rol de migración puede hacerle
-- ALTER ROLE ... BYPASSRLS (Postgres lo rechaza: "reserved role, only
-- superusers can modify it"). En vez de eso, se le da una política de
-- lectura acotada por tabla — más preciso que un bypass total, y no
-- requiere tocar el rol en absoluto. roles y platform_admins no tienen RLS
-- (son catálogos globales desde Fase 0/Fase 1), así que ahí basta el GRANT.
CREATE POLICY "supabase_auth_admin_read" ON public.users
  FOR SELECT TO supabase_auth_admin
  USING (true);
--> statement-breakpoint
CREATE POLICY "supabase_auth_admin_read" ON public.employees
  FOR SELECT TO supabase_auth_admin
  USING (true);
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON public.users TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON public.roles TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON public.employees TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON public.platform_admins TO supabase_auth_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
