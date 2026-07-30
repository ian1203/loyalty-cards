-- Los atributos de app_user (NOSUPERUSER, NOBYPASSRLS, ...) hoy son solo los
-- valores por defecto de CREATE ROLE — nunca se fijaron explícitamente. Nada
-- detecta ni revierte un `ALTER ROLE app_user BYPASSRLS` accidental o mal
-- intencionado hecho después. Esta migración es idempotente (ALTER ROLE con
-- el valor que ya tiene no falla) y sirve como assertion explícita del
-- estado de seguridad esperado, versionada como el resto del esquema.
--
-- En Postgres plano el rol que migra es superusuario de verdad y esto
-- corre sin problema. En Supabase (Fase 1+) el rol `postgres` NO es
-- superusuario real — supautils bloquea ALTER ROLE sobre atributos
-- SUPERUSER/BYPASSRLS incluso en sentido seguro (negativo), porque esa
-- plataforma reserva ese control para su propio control plane. Eso en
-- realidad refuerza la garantía que esta migración busca (nadie que no sea
-- Supabase puede tocar BYPASSRLS de ningún rol), así que si falla por
-- privilegio insuficiente se omite en vez de romper la cadena de
-- migraciones — no hace falta reafirmar algo que la plataforma ya impide.
DO $$
BEGIN
  ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ALTER ROLE app_user omitido: el rol de migración no tiene privilegio (plataforma tipo Supabase que ya restringe BYPASSRLS/SUPERUSER a su propio control plane).';
END
$$;
