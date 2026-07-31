import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Carga .env.local igual que Next.js, para que los tests tengan las mismas
// variables (NEXT_PUBLIC_SUPABASE_URL, etc.) sin duplicarlas. En CI no
// existe .env.local — ahí esas variables se fijan a nivel de job (ver
// .github/workflows/ci.yml), así que el guard evita que falle por archivo
// ausente.
const envLocalPath = new URL("./.env.local", import.meta.url);
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

export default defineConfig({
  test: {
    // Causa raíz real de la intermitencia investigada en Fase 4 (no CPU):
    // pg.Pool tiene max=10 por default, y vitest aísla cada archivo de test
    // con su propio registro de módulos — cada uno de los 6 archivos de
    // apps/web/tests importa client.ts y abre SU PROPIO adminPool+appPool.
    // Con varios archivos corriendo en paralelo (más los de packages/db),
    // el total de conexiones físicas superaba max_connections de Postgres
    // (100 en local), lo que se manifestaba como fallas en cascada de un
    // archivo entero (timeouts de conexión en beforeAll, no lentitud de un
    // solo query). Ver src/client.ts (PG_POOL_MAX) — acá se acota a 4 por
    // pool por archivo. El margen de timeout se deja en 20s de todos modos,
    // como colchón razonable, no como el fix real.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      PG_POOL_MAX: "4",
    },
    // El pool de Postgres ya no es el cuello de botella (ver arriba), pero
    // cada archivo de este paquete hace llamadas REALES a Supabase Auth
    // local (GoTrue) en su beforeAll — signInWithPassword/admin.createUser.
    // Con los ~6 archivos corriendo en paralelo (default de vitest), GoTrue
    // local recibe ráfagas concurrentes de requests y ocasionalmente no
    // responde a tiempo (confirmado: "Hook timed out" y errores de
    // auth-js con {} como cuerpo de error, no un fallo de lógica). Serializar
    // los archivos de ESTE paquete evita esa ráfaga concurrente contra
    // GoTrue — el costo en tiempo total es mínimo (la suite corre en
    // segundos), y es el que hace requests reales de red a un servicio
    // externo al proceso de test.
    fileParallelism: false,
  },
});
