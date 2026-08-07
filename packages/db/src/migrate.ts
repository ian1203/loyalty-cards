import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// pg_advisory_lock es de SESIÓN (no de transacción) — drizzle's migrate()
// ya envuelve todas las migraciones pendientes en su propia transacción
// interna (verificado leyendo pg-core/dialect.js: un solo BEGIN/COMMIT
// para todo el lote, así que un fallo a media aplicación revierte
// completo, sin intervención nuestra). Lo que el migrator NO tiene es
// protección contra dos invocaciones CONCURRENTES de este script (dos
// deploys casi simultáneos) — el lock de sesión cierra ese hueco. Para que
// el lock y la transacción interna de migrate() compartan la misma
// conexión física (requisito de un lock de sesión), el Pool se fija a
// max:1 — este script es de un solo uso, no necesita más de una conexión.
const MIGRATION_LOCK_KEY = "loyalty-cards:schema-migrations";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  console.log(`[migrate] adquiriendo lock (${MIGRATION_LOCK_KEY})…`);
  await pool.query("select pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
  console.log("[migrate] lock adquirido — aplicando migraciones pendientes…");

  try {
    await migrate(db, { migrationsFolder: "./migrations" });
    console.log("[migrate] listo.");
  } finally {
    // Liberación explícita (además de la implícita al cerrar la conexión)
    // para que quede clara en los logs incluso si pool.end() tarda.
    await pool.query("select pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
