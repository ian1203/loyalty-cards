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
import {
  buildApplePkpassFromInputs,
  loadApplePassGenerationInputs,
} from "../../../../../../lib/wallet/passGeneration";

export type DownloadApplePassResult = { ok: true; pkpass: Buffer } | { ok: false };

export async function downloadApplePassForSession(
  session: TenantSession,
  customerId: string,
): Promise<DownloadApplePassResult> {
  // FASE 1, dentro de la tx: solo lectura/escritura de DB. FASE 2 (fetches
  // de red + firma PKCS#7, 2-3s reales medidos en producción) corre
  // DESPUÉS de que withTenantContext ya devolvió — nunca mientras la
  // conexión de Postgres sigue abierta esperándola (ver docs/HISTORY.md).
  const loaded = await withTenantContext(session.businessId, async (tx) => {
    const customer = await findInTenant(tx, session, customers, customerId);
    if (!customer) {
      return { ok: false as const };
    }

    await ensureWalletPass(tx, session.businessId, customerId, "apple");
    return loadApplePassGenerationInputs(tx, session.businessId, customerId);
  });
  if (!loaded.ok) {
    return { ok: false };
  }

  try {
    const result = await buildApplePkpassFromInputs(session.businessId, loaded.inputs);
    return { ok: true, pkpass: result.pkpass };
  } catch (error) {
    console.error("downloadApplePassForSession:", error);
    return { ok: false };
  }
}
