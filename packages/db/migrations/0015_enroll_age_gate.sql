-- Hallazgo MEDIO de la revisión de seguridad de /enroll (0014): el gate de
-- mayoría de edad (18+, necesario porque el checkbox de consentimiento
-- LFPDPPP lo firma el propio titular de los datos) solo vivía en
-- apps/web/app/(marketing)/enroll/[slug]/logic.ts — inconsistente con el
-- propio principio de esta función ("defensa en profundidad: apps/web ya
-- valida esto, pero la función queda expuesta vía GRANT EXECUTE a
-- app_user, así que no debe confiar ciegamente en el caller") que sí se
-- aplicaba a full_name/phone/email/wallet_token pero no a la edad. Replica
-- el mismo gate acá para que un futuro segundo caller (import masivo, una
-- herramienta de /admin, una API nueva) no pueda saltárselo en silencio.
-- CREATE OR REPLACE, no una función nueva: misma firma, mismo GRANT ya
-- vigente desde 0014, nada más cambia el cuerpo.
CREATE OR REPLACE FUNCTION public.enroll_customer_public(
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

  -- Gate de mayoría de edad — solo aplica a ESTE camino de autoconsenti-
  -- miento (el alta manual de dueño/staff en /customers no pasa por esta
  -- función, no tiene este gate: ahí el consentimiento no depende del
  -- propio cliente). p_date_of_birth es NOT NULL por firma de esta función
  -- (apps/web siempre lo manda), pero una fecha futura o que dé menos de
  -- 18 años se rechaza acá, no solo en la capa de aplicación.
  IF p_date_of_birth IS NULL OR p_date_of_birth > current_date THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF extract(year FROM age(current_date, p_date_of_birth)) < 18 THEN
    RAISE EXCEPTION 'must_be_adult';
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
