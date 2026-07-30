import { describe, expect, it } from "vitest";
import { appPool } from "../src/client";

// Blinda el fix de la migración 0003_fix_rls_empty_string_guard.sql: bajo
// connection pooling, después de que una transacción hace SET LOCAL sobre
// app.current_business_id y hace COMMIT, Postgres deja ese GUC personalizado
// en '' (string vacío) — no en NULL — para transacciones posteriores en la
// MISMA conexión física que no vuelven a fijarlo. Antes del fix,
// ''::uuid lanzaba un error de Postgres; ahora debe resolver a cero filas.
//
// Usa el pool crudo de `pg` (no withTenantContext) para forzar
// deliberadamente que ambas fases corran sobre la misma conexión física —
// exactamente el escenario que expuso el bug original.
describe("regresión: pooling — GUC de tenant tras un commit en la misma conexión", () => {
  it("una conexión reciclada sin nuevo set_config devuelve cero filas, nunca un error", async () => {
    const client = await appPool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_business_id', $1, true)",
        ["00000000-0000-0000-0000-000000000001"],
      );
      await client.query("SELECT 1 FROM customers");
      await client.query("COMMIT");

      await client.query("BEGIN");
      const result = await client.query("SELECT * FROM customers");
      await client.query("COMMIT");

      expect(result.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
