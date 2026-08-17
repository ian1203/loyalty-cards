-- Extiende el custom access token hook (0010_supabase_auth_bridge.sql) para
-- soportar impersonación de negocio por un platform admin. Migración
-- SEPARADA del esquema (0028) a propósito: este es el archivo de más riesgo
-- del sistema — la función que firma TODO JWT de TODO login — así que el
-- cambio se aísla acá y se mantiene mínimo. No se edita 0010 (las
-- migraciones son historia inmutable); esta reemplaza la función completa
-- vía CREATE OR REPLACE, pero el ÚNICO comportamiento nuevo real es: (a)
-- ahora se lee platform_admins.platform_role/is_active en vez de solo
-- EXISTS, y (b) si hay un grant de impersonación activo, business_id/
-- tenant_role/location_id se resuelven desde ESE grant en vez de (o
-- ausentes, como antes) — todo lo demás es idéntico a 0010.

-- Función separada, mismo motivo que ya justifica separar el hook del resto
-- de la app: aísla el cambio y el resultado de una revisión de seguridad.
-- REVOKE/GRANT explícitos por el mismo motivo que custom_access_token_hook
-- ya los tiene — si cualquier usuario autenticado pudiera invocarla, podría
-- sondear existencia/timing de grants de impersonación ajenos (oráculo).
-- LANGUAGE sql (no SECURITY DEFINER): corre con los privilegios del rol que
-- llama (supabase_auth_admin), por eso más abajo se le da GRANT SELECT
-- directo sobre platform_impersonation_grants, mismo patrón que
-- custom_access_token_hook ya usa para users/roles/employees/platform_admins.
CREATE FUNCTION public.resolve_impersonation_claims(p_admin_auth_user uuid)
RETURNS TABLE(business_id uuid, platform_role text)
LANGUAGE sql
STABLE
AS $$
  SELECT g.business_id, g.platform_role_at_grant_time::text
  FROM public.platform_impersonation_grants g
  WHERE g.platform_admin_auth_user_id = p_admin_auth_user
    AND g.ended_at IS NULL
    AND g.expires_at > now()
  ORDER BY g.created_at DESC
  LIMIT 1;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.resolve_impersonation_claims TO supabase_auth_admin;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.resolve_impersonation_claims FROM authenticated, anon, public;
--> statement-breakpoint

-- Único GRANT nuevo hacia supabase_auth_admin en toda esta migración —
-- platform_impersonation_grants sigue sin ningún acceso para app_user/
-- authenticated/anon (ver comentario al final de 0028).
GRANT SELECT ON public.platform_impersonation_grants TO supabase_auth_admin;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  auth_user uuid := (event->>'user_id')::uuid;
  is_admin boolean;
  v_platform_role text;
  v_business_id uuid;
  v_role text;
  v_location_id uuid;
  v_imp_business_id uuid;
  v_imp_platform_role text;
BEGIN
  claims := event->'claims';
  IF claims IS NULL OR jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    claims := '{}'::jsonb;
  END IF;

  -- Antes: EXISTS(...). Ahora también trae el rol — is_active=false
  -- (offboarding de un admin de plataforma, mismo criterio que
  -- users.is_active) lo deja fuera exactamente como si nunca hubiera sido
  -- admin: is_admin queda false, sin platform_role, sin poder impersonar.
  SELECT platform_admins.platform_role::text INTO v_platform_role
  FROM public.platform_admins
  WHERE platform_admins.auth_user_id = auth_user
    AND platform_admins.is_active = true;
  is_admin := v_platform_role IS NOT NULL;

  -- Idéntica a 0010, con un LIMIT 1 defensivo: desde esta migración
  -- auth_user_id ya no es único por sí solo en `users` (ver 0028 — un
  -- admin impersonando puede tener una fila real por cada negocio
  -- impersonado). El invariante real es que a lo más UNA de esas filas
  -- está is_active=true a la vez (terminar un grant desactiva su fila en
  -- la MISMA transacción — ver lib/impersonation.ts), así que este LIMIT 1
  -- nunca debería importar en la práctica; se agrega solo para no depender
  -- de ese invariante en silencio.
  SELECT u.business_id, r.name, e.primary_location_id
    INTO v_business_id, v_role, v_location_id
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  LEFT JOIN public.employees e
    ON e.user_id = u.id AND e.business_id = u.business_id
  WHERE u.auth_user_id = auth_user
    AND u.is_active = true
  LIMIT 1;

  -- Solo se consulta si es admin — cero queries extra para el >99% de
  -- logins que no lo son.
  IF is_admin THEN
    SELECT g.business_id, g.platform_role
      INTO v_imp_business_id, v_imp_platform_role
    FROM public.resolve_impersonation_claims(auth_user) g;
  END IF;

  claims := jsonb_set(claims, '{is_platform_admin}', to_jsonb(COALESCE(is_admin, false)));
  claims := jsonb_set(claims, '{platform_role}', COALESCE(to_jsonb(v_platform_role), 'null'::jsonb));

  IF v_imp_business_id IS NOT NULL THEN
    -- Impersonación activa: business_id/tenant_role/location_id quedan
    -- exactamente como los de un tenant_user real de ESE negocio — para
    -- que TODO el código de producto existente (getVerifiedSession,
    -- resolveActor, requireOperationContext, RLS) funcione sin cambios.
    -- tenant_role SIEMPRE 'owner' para AMBOS roles de plataforma — el
    -- nivel de acceso real (lectura vs. escritura completa) lo decide
    -- impersonating_platform_role en la capa de aplicación, nunca este
    -- claim. location_id siempre null: ninguna sucursal fija, el operador
    -- la elige y se valida contra la DB (mismo patrón que ya usa el dueño
    -- real hoy en el scanner).
    claims := jsonb_set(claims, '{business_id}', to_jsonb(v_imp_business_id));
    claims := jsonb_set(claims, '{tenant_role}', to_jsonb('owner'::text));
    claims := jsonb_set(claims, '{location_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{impersonating_platform_admin_id}', to_jsonb(auth_user));
    claims := jsonb_set(claims, '{impersonating_platform_role}', to_jsonb(v_imp_platform_role));
  ELSE
    claims := jsonb_set(claims, '{business_id}', COALESCE(to_jsonb(v_business_id), 'null'::jsonb));
    claims := jsonb_set(claims, '{tenant_role}', COALESCE(to_jsonb(v_role), 'null'::jsonb));
    claims := jsonb_set(claims, '{location_id}', COALESCE(to_jsonb(v_location_id), 'null'::jsonb));
    claims := jsonb_set(claims, '{impersonating_platform_admin_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{impersonating_platform_role}', 'null'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
