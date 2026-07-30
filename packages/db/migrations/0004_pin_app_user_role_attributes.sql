-- Los atributos de app_user (NOSUPERUSER, NOBYPASSRLS, ...) hoy son solo los
-- valores por defecto de CREATE ROLE — nunca se fijaron explícitamente. Nada
-- detecta ni revierte un `ALTER ROLE app_user BYPASSRLS` accidental o mal
-- intencionado hecho después. Esta migración es idempotente (ALTER ROLE con
-- el valor que ya tiene no falla) y sirve como assertion explícita del
-- estado de seguridad esperado, versionada como el resto del esquema.
ALTER ROLE app_user
  NOSUPERUSER
  NOBYPASSRLS;
