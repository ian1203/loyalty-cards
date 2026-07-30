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

// Rol admin/migrador: owner de las tablas, bypassa RLS. Solo para
// migraciones y setup/teardown de tests — nunca para servir requests.
export const adminPool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
export const adminDb = drizzle(adminPool, { schema });

// Rol de aplicación (app_user): sin BYPASSRLS. Toda request real debe pasar
// por withTenantContext(), que usa este pool.
export const appPool = new Pool({ connectionString: requireEnv("APP_DATABASE_URL") });
export const appDb = drizzle(appPool, { schema });
