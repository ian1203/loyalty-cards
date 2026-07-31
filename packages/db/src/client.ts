import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// pg.Pool usa max=10 por default. Bajo vitest, cada archivo de test corre
// con su propio registro de módulos (aislamiento por archivo), así que
// cada archivo que importa este módulo abre SU PROPIO adminPool+appPool —
// con varios archivos de test en paralelo (packages/db + apps/web), eso
// escala a más conexiones físicas simultáneas que max_connections de
// Postgres (100 en local), causando fallas en cascada (timeouts de
// conexión, no lentitud real). PG_POOL_MAX permite acotarlo — los
// vitest.config.ts de packages/db y apps/web lo fijan bajo; sin la env
// var (dev/prod), se mantiene el default de pg intacto.
const poolMax = process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : undefined;

// Rol admin/migrador: owner de las tablas, bypassa RLS. Solo para
// migraciones y setup/teardown de tests — nunca para servir requests.
export const adminPool = new Pool({ connectionString: requireEnv("DATABASE_URL"), max: poolMax });
export const adminDb = drizzle(adminPool, { schema });

// Rol de aplicación (app_user): sin BYPASSRLS. Toda request real debe pasar
// por withTenantContext(), que usa este pool.
export const appPool = new Pool({ connectionString: requireEnv("APP_DATABASE_URL"), max: poolMax });
export const appDb = drizzle(appPool, { schema });
