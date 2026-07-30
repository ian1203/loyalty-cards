import type { Brand } from "@loyalty/shared";
import { sql } from "drizzle-orm";
import { appDb } from "./client";

// Tipo nominal: withTenantContext exige esto, no un string crudo. Solo
// apps/web/lib/supabase/session.ts puede producirlo (con un cast explícito,
// justo después de verificar el JWT) — cualquier otro sitio que necesite
// pasar un "as VerifiedBusinessId" es exactamente el punto a auditar. La
// barrera de seguridad real es la verificación de la firma del JWT, no este
// tipo; esto solo convierte "pasar un business_id que no vino de una sesión
// verificada" en un error de compilación en vez de un descuido silencioso.
export type VerifiedBusinessId = Brand<string, "VerifiedBusinessId">;

export type TenantTransaction = Parameters<
  Parameters<(typeof appDb)["transaction"]>[0]
>[0];

// Único punto de entrada sancionado para acceso a datos de tenant: abre una
// transacción con el rol app_user (sin BYPASSRLS) y fija
// app.current_business_id vía set_config parametrizado (nunca interpolación
// de string) antes de correr `fn`. set_config(..., true) = local a la
// transacción, seguro con pooling tipo pgbouncer en modo transacción.
export async function withTenantContext<T>(
  businessId: VerifiedBusinessId,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_business_id', ${businessId}, true)`,
    );
    return fn(tx);
  });
}
