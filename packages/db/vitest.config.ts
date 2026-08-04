import { defineConfig } from "vitest/config";

// Los tests siempre corren contra loyalty_test, nunca contra loyalty_dev:
// TEST_DATABASE_URL/TEST_APP_DATABASE_URL son la fuente de verdad, y se
// mapean aquí a los nombres que packages/db/src/client.ts espera.
export default defineConfig({
  test: {
    passWithNoTests: true,
    // El default de vitest (5000ms) es más ajustado que el costo real de
    // una conexión FRÍA a Postgres cuando varios archivos de este paquete
    // abren su pool en paralelo (confirmado con psql directo: ~6.5s la
    // primera conexión, ~0.05s ya caliente bajo la carga acumulada de una
    // sesión larga de desarrollo) — mismo margen que apps/web/vitest.config.ts.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      APP_DATABASE_URL: process.env.TEST_APP_DATABASE_URL ?? "",
      // Ver el comentario en src/client.ts: acota conexiones físicas por
      // archivo de test para no exceder max_connections de Postgres
      // cuando varios archivos corren en paralelo.
      PG_POOL_MAX: "4",
    },
  },
});
