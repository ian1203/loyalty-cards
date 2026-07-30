-- No-op deliberado. drizzle-kit generate detectó esto como "drift" porque su
-- snapshot interno (migrations/meta/*.json) solo se actualiza vía `generate`,
-- no cuando una migración --custom (como 0005_roles_to_global_catalog.sql)
-- cambia el esquema a mano con SQL crudo. El DDL real (quitar business_id de
-- roles, cambiar el unique constraint, etc.) ya se aplicó en 0005; correrlo
-- de nuevo aquí fallaría porque esas constraints ya no existen con esos
-- nombres. Este archivo solo existe para que el snapshot de drizzle-kit
-- quede sincronizado con packages/db/src/schema/roles.ts — no ejecuta nada.
SELECT 1;
