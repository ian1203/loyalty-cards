import { buildLoyaltyClassPayload, buildLoyaltyObjectPayload } from "@loyalty/wallet";
import type { TenantTransaction, VerifiedBusinessId } from "@loyalty/db";
import { getGoogleIssuerId, getGoogleWalletClient } from "./adapters";
import { deriveBrandColor } from "./brandColor";
import { ensureWalletPass } from "./ensurePass";
import { loadCustomerLoyaltySnapshot } from "./loyaltySnapshot";

// Google no tiene web service propio (ver skill wallet-integration): el
// link firmado "Add to Google Wallet" EMBEBE el payload de Loyalty
// Class+Object completo, así que no hace falta haber llamado
// upsertLoyaltyClass/Object antes para la PRIMERA alta. Pero SÍ hace falta
// registrar wallet_passes(platform='google') acá (hallazgo de la segunda
// revisión de seguridad): notifyWalletOfTransaction (notify.ts) solo hace
// PATCH del Loyalty Object si existe esa fila — sin este ensureWalletPass,
// el pase de Google queda congelado en el balance del momento de la alta
// para siempre, porque el hook nunca encuentra a quién actualizarle.
export async function buildGoogleSaveLinkForCustomer(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<string | null> {
  const snapshot = await loadCustomerLoyaltySnapshot(tx, businessId, customerId);
  if (!snapshot) {
    return null;
  }

  await ensureWalletPass(tx, businessId, customerId, "google");

  const issuerId = getGoogleIssuerId();

  const classPayload = buildLoyaltyClassPayload({
    issuerId,
    businessId,
    businessName: snapshot.businessName,
    programName: snapshot.programName,
    backgroundRgb: deriveBrandColor(businessId),
  });

  const objectPayload = buildLoyaltyObjectPayload({
    issuerId,
    businessId,
    customerId,
    customerFirstName: snapshot.customerFirstName,
    currentStamps: snapshot.currentStamps,
    stampsRequired: snapshot.stampsRequired,
    // nextRewardName (no rewardName): Google no tiene rejilla gráfica de
    // sellos, el texto motivador de buildProgressMessage es la única
    // forma de comunicar avance — necesita el nombre de la recompensa
    // DESDE el primer sello, no solo cuando ya está lista (eso sí aplica
    // a Apple, ver rewardName/passGeneration.ts).
    rewardName: snapshot.nextRewardName,
    walletToken: snapshot.walletToken,
  });

  // origins: dominios autorizados a disparar el guardado — mismo criterio
  // "sin fallback silencioso a localhost" que NEXT_PUBLIC_SITE_URL en
  // passGeneration.ts (un link firmado con el origin equivocado en
  // producción fallaría en silencio para el cliente final, no para
  // nosotros).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL no está configurado.");
  }

  return getGoogleWalletClient().buildSaveLink({
    loyaltyClasses: [classPayload],
    loyaltyObjects: [objectPayload],
    origins: [siteUrl],
  });
}
