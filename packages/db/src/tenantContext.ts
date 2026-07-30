import { sql } from "drizzle-orm";
import { appDb } from "./client";

type TenantTransaction = Parameters<
  Parameters<(typeof appDb)["transaction"]>[0]
>[0];

// Único punto de entrada sancionado para acceso a datos de tenant: abre una
// transacción con el rol app_user (sin BYPASSRLS) y fija
// app.current_business_id vía set_config parametrizado (nunca interpolación
// de string) antes de correr `fn`. set_config(..., true) = local a la
// transacción, seguro con pooling tipo pgbouncer en modo transacción.
export async function withTenantContext<T>(
  businessId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_business_id', ${businessId}, true)`,
    );
    return fn(tx);
  });
}
