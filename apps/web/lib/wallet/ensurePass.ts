import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { walletPasses, type TenantTransaction, type VerifiedBusinessId } from "@loyalty/db";

// Primera vez que un dueño/staff pide el pase de un cliente (paso h): crea
// la fila de wallet_passes si no existe todavía — hasta este paso, NADA en
// producción creaba una. authenticationToken sigue el mismo patrón que
// customers.walletToken (randomBytes(24).base64url): un secreto opaco por
// pase, nunca reusado entre negocios/clientes/plataformas (constraint
// unique en el esquema). Para Google esta fila no se usa para autenticar
// (no tiene web service propio) pero mantiene el mismo invariante "un
// wallet_passes por cliente por plataforma" que Apple, y es donde el
// paso i (PATCH del Loyalty Object) va a leer "¿este cliente ya tiene un
// pase de Google?" antes de notificar.
export async function ensureWalletPass(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
  platform: "apple" | "google",
): Promise<{ id: string }> {
  const existing = await selectWalletPass(tx, businessId, customerId, platform);
  if (existing) return existing;

  const [created] = await tx
    .insert(walletPasses)
    .values({
      businessId,
      customerId,
      platform,
      authenticationToken: randomBytes(24).toString("base64url"),
    })
    .onConflictDoNothing({ target: [walletPasses.customerId, walletPasses.platform] })
    .returning({ id: walletPasses.id });
  if (created) return created;

  // onConflictDoNothing sin retorno = otro request ganó la carrera entre
  // el SELECT de arriba y este INSERT (poco probable en este flujo
  // disparado por un solo dueño/staff, pero el constraint unique lo hace
  // posible) — releer en vez de asumir.
  const raced = await selectWalletPass(tx, businessId, customerId, platform);
  if (!raced) {
    throw new Error("No se pudo crear ni encontrar el wallet_pass tras una carrera de inserción.");
  }
  return raced;
}

async function selectWalletPass(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
  platform: "apple" | "google",
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: walletPasses.id })
    .from(walletPasses)
    .where(
      and(
        eq(walletPasses.businessId, businessId),
        eq(walletPasses.customerId, customerId),
        eq(walletPasses.platform, platform),
      ),
    )
    .limit(1);
  return row ?? null;
}
