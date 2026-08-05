// Entrega mínima autenticada (paso h de Fase 4): un dueño/staff logueado
// pide el .pkpass de UN cliente de SU tenant — a diferencia del web
// service público (app/api/wallet/apple/logic.ts), acá SÍ hay sesión de
// Supabase, así que la identidad es requireTenantSession() + findInTenant
// (mismo patrón anti-IDOR de siempre), nunca el authenticationToken del
// pase. Es el único lugar de producción que llama ensureWalletPass — la
// primera vez que se pide el pase de un cliente, se crea la fila.
import { customers, withTenantContext } from "@loyalty/db";
import { findInTenant, type TenantSession } from "../../../../../../lib/tenant";
import { ensureWalletPass } from "../../../../../../lib/wallet/ensurePass";
import { generateApplePkpassForCustomer } from "../../../../../../lib/wallet/passGeneration";

export type DownloadApplePassResult = { ok: true; pkpass: Buffer } | { ok: false };

export async function downloadApplePassForSession(
  session: TenantSession,
  customerId: string,
): Promise<DownloadApplePassResult> {
  return withTenantContext(session.businessId, async (tx) => {
    const customer = await findInTenant(tx, session, customers, customerId);
    if (!customer) {
      return { ok: false };
    }

    await ensureWalletPass(tx, session.businessId, customerId, "apple");
    const result = await generateApplePkpassForCustomer(tx, session.businessId, customerId);
    if (!result.ok) {
      return { ok: false };
    }
    return { ok: true, pkpass: result.pkpass };
  });
}
