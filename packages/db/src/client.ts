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

// Cierra un hueco estructural real (mismo tipo de bug que el timeout de
// APNs en packages/wallet/src/apple/apns.ts) — SIN esto, un
// `SELECT ... FOR UPDATE` (scanner/logic.ts, el lock que serializa por
// cliente+programa) que espera un lock sostenido por otra transacción
// espera PARA SIEMPRE, sin límite. Eso deja "Procesando…" colgado en el
// cliente indefinidamente, porque la promesa de la Server Action nunca
// resuelve. Esto NO es la causa confirmada de ningún incidente puntual
// (no hay evidencia de log que lo pruebe) — es un cierre preventivo del
// mismo tipo de hueco, correcto de todos modos.
//
// pg soporta estos dos como parámetros de conexión de primera clase
// (se mandan en el paquete de arranque, sin race condition con un
// `SET` posterior — ver pg/lib/connection-parameters.js).
//
// lock_timeout (5s) < statement_timeout (10s) a propósito: si la causa
// es específicamente un lock esperando, lock_timeout dispara primero con
// un error puntual ("could not obtain lock") — statement_timeout es la
// red de seguridad general para cualquier otro tipo de query lenta.
// 5s para un lock es generoso: el bloque que este proyecto sostiene bajo
// el lock (registerStampForSession/redeemRewardForSession) es una
// transacción chica, sub-100ms en el caso normal — si tarda más de 5s en
// conseguir el lock, hay contención real que investigar, no es
// operación normal esperando su turno.
const STATEMENT_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;

// Rol admin/migrador: owner de las tablas, bypassa RLS. Solo para
// migraciones y setup/teardown de tests — nunca para servir requests.
// Mismos timeouts que appPool a propósito (pedido explícito, no una
// migración pesada corriendo hoy que los necesite más largos) — si algún
// día una migración real necesita más margen, súbelo ahí puntualmente
// (statement_timeout por sesión vía SET, no bajando el default global).
export const adminPool = new Pool({
  connectionString: requireEnv("DATABASE_URL"),
  max: poolMax,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  lock_timeout: LOCK_TIMEOUT_MS,
});
export const adminDb = drizzle(adminPool, { schema });

// Rol de aplicación (app_user): sin BYPASSRLS. Toda request real debe pasar
// por withTenantContext(), que usa este pool.
export const appPool = new Pool({
  connectionString: requireEnv("APP_DATABASE_URL"),
  max: poolMax,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  lock_timeout: LOCK_TIMEOUT_MS,
});
export const appDb = drizzle(appPool, { schema });
