-- Auto-registro público de clientes (/enroll): una request SIN sesión de
-- tenant necesita crear una fila en "customers" (RLS FORCE ROW LEVEL
-- SECURITY, solo visible/insertable con app.current_business_id fijado por
-- withTenantContext()) sin que exista ningún tenant al que fijar contexto
-- de antemano. adminDb nunca sirve una request normal (regla no
-- negociable), así que en vez de eso esta migración crea dos funciones
-- SECURITY DEFINER — el patrón estándar de Postgres para "escritura pública
-- angosta contra una tabla con RLS", análogo en espíritu al custom access
-- token hook de 0010_supabase_auth_bridge.sql. Ambas funciones las crea el
-- rol de migración (dueño real de "customers"), que en este clúster tiene
-- BYPASSRLS — SECURITY DEFINER hace que se ejecuten con esos privilegios
-- sin importar qué rol las invoque, así que app_user puede llamarlas sin
-- necesitar su propio bypass. SET search_path fija el schema explícitamente
-- (evita que un caller manipule search_path para colar un objeto homónimo).
-- GRANT EXECUTE acotado a app_user, nunca a PUBLIC/anon/authenticated —
-- mismo criterio de scoping que ya usa marketing_leads en
-- 0012_careful_killer_shrike.sql.

-- Lookup público mínimo: solo negocios activos son visibles por slug. Vacío
-- (0 filas) tanto si el slug no existe como si el negocio está suspendido
-- — nunca un error distinto que sirva de oráculo para enumerar negocios.
CREATE FUNCTION public.get_active_business_by_slug(p_slug text)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.name
  FROM public.businesses b
  WHERE b.slug = p_slug
    AND b.status = 'active';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_active_business_by_slug FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_active_business_by_slug TO app_user;

-- Alta del propio cliente. Deliberadamente sin parámetro p_business_id: el
-- único negocio posible es el que resuelve p_business_slug, así que es
-- estructuralmente imposible inyectar un business_id que no corresponda al
-- slug. privacy_consent_at siempre queda en now() — esta función solo la
-- invoca el flujo de auto-registro con consentimiento ya validado en
-- apps/web antes de llamarla, así que no hace falta un parámetro booleano
-- separado (el alta manual de dueño/staff sigue sin pasar por aquí, sigue
-- dejando privacy_consent_at en NULL).
--> statement-breakpoint
CREATE FUNCTION public.enroll_customer_public(
  p_business_slug text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_date_of_birth date,
  p_occupation text,
  p_wallet_token text
)
RETURNS TABLE (
  customer_id uuid,
  business_id uuid,
  business_name text,
  program_name text,
  stamps_required int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_business_name text;
  v_customer_id uuid;
  v_program_id uuid;
  v_program_name text;
  v_stamps_required int;
BEGIN
  SELECT b.id, b.name
    INTO v_business_id, v_business_name
  FROM public.businesses b
  WHERE b.slug = p_business_slug
    AND b.status = 'active';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'business_not_found';
  END IF;

  -- Defensa en profundidad: apps/web ya valida esto antes de llamar, pero
  -- la función queda expuesta vía GRANT EXECUTE a app_user, así que no debe
  -- confiar ciegamente en el caller.
  IF trim(coalesce(p_full_name, '')) = ''
    OR trim(coalesce(p_phone, '')) = ''
    OR trim(coalesce(p_email, '')) = ''
    OR trim(coalesce(p_wallet_token, '')) = ''
  THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  -- Si esto viola customers_business_id_phone_key (unique_violation,
  -- SQLSTATE 23505) la excepción se propaga tal cual — apps/web hace match
  -- por error.code, no por mensaje, para ese caso.
  INSERT INTO public.customers (
    business_id,
    full_name,
    phone,
    email,
    wallet_token,
    date_of_birth,
    occupation,
    privacy_consent_at
  ) VALUES (
    v_business_id,
    p_full_name,
    p_phone,
    p_email,
    p_wallet_token,
    p_date_of_birth,
    p_occupation,
    now()
  )
  RETURNING id INTO v_customer_id;

  -- Mismo criterio que loadCustomerLoyaltySnapshot
  -- (apps/web/lib/wallet/loyaltySnapshot.ts), pero SÍ filtrando is_active —
  -- un programa desactivado no debe recibir balance inicial de un alta
  -- nueva.
  SELECT lp.id, lp.name, lp.stamps_required
    INTO v_program_id, v_program_name, v_stamps_required
  FROM public.loyalty_programs lp
  WHERE lp.business_id = v_business_id
    AND lp.is_active = true
  ORDER BY lp.created_at ASC
  LIMIT 1;

  IF v_program_id IS NOT NULL THEN
    INSERT INTO public.customer_balances (business_id, customer_id, loyalty_program_id)
    VALUES (v_business_id, v_customer_id, v_program_id);
  END IF;

  RETURN QUERY
    SELECT v_customer_id, v_business_id, v_business_name, v_program_name, v_stamps_required;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enroll_customer_public FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.enroll_customer_public TO app_user;
