import { withTenantContext, type VerifiedBusinessId } from "@loyalty/db";
import { buildGoogleSaveLinkForCustomer } from "./googleSaveLink";
import { ensureWalletPass } from "./ensurePass";
import { generateApplePkpassForCustomer } from "./passGeneration";

// Igual que getVerifiedSession() (lib/supabase/session.ts) y
// verifyBusinessIdForPassToken() (lib/wallet/passAuth.ts), este es el
// TERCER (y único otro) lugar autorizado a castear VerifiedBusinessId — a
// partir del resultado de enroll_customer_public() (migración 0014) en vez
// de una sesión o un authenticationToken. Esa función Postgres
// SECURITY DEFINER ya resolvió el negocio EXCLUSIVAMENTE por slug con
// status='active' (nunca acepta un business_id como parámetro — ver
// packages/db/src/enroll.ts), así que su resultado es tan confiable como
// una sesión verificada o un token de pase: el business_id que devuelve
// nunca puede ser uno que el visitante público haya elegido directamente.
//
// A partir de acá, cero adminDb: ensureWalletPass/generateApplePkpassForCustomer/
// buildGoogleSaveLinkForCustomer corren dentro de withTenantContext/RLS
// normal, exactamente igual que cuando un dueño/staff pide el pase desde
// /customers/{id}/wallet — la única diferencia es de dónde sale el
// VerifiedBusinessId.
export type PublicEnrollWalletResult = {
  applePkpassBase64: string | null;
  googleSaveLink: string | null;
};

export async function buildWalletArtifactsForNewEnrollment(
  rawBusinessId: string,
  customerId: string,
): Promise<PublicEnrollWalletResult> {
  const businessId = rawBusinessId as VerifiedBusinessId;

  return withTenantContext(businessId, async (tx) => {
    await ensureWalletPass(tx, businessId, customerId, "apple");
    const appleResult = await generateApplePkpassForCustomer(tx, businessId, customerId);
    const googleSaveLink = await buildGoogleSaveLinkForCustomer(tx, businessId, customerId);

    return {
      applePkpassBase64: appleResult.ok ? appleResult.pkpass.toString("base64") : null,
      googleSaveLink,
    };
  });
}
