import { buildLoyaltyClassPayload, buildLoyaltyObjectPayload, CURRENT_GOOGLE_LOYALTY_CLASS_VERSION } from "@loyalty/wallet";
import type { TenantTransaction, VerifiedBusinessId } from "@loyalty/db";
import { getGoogleIssuerId, getGoogleWalletClient } from "./adapters";
import { resolveBrandColorRgb } from "./brandColor";
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
    // Antes: siempre deriveBrandColor(businessId) (color hash-derivado,
    // nunca el real) — ningún cliente real había visto la marca real de
    // Google Wallet, pese a que la clase de referencia (chilaquikes_prod,
    // aprobada) sí la tenía. resolveBrandColorRgb prefiere el hex real
    // cuando existe, cae al hash solo para negocios sin branding cargado.
    backgroundRgb: resolveBrandColorRgb(businessId, snapshot.businessBrandColorHex),
    programLogoUri: snapshot.businessGoogleLogoUri ?? undefined,
    // heroImageUri: re-agregado en _v3 — el hero de _v2 (foto de producto
    // suelta) se veía fuera de lugar y competía con "Powered by Pragmia";
    // este es un asset DISTINTO (mismo lockup wordmark+mascot que ya se
    // ve en programLogo, sobre un patrón de marca, no una foto de comida
    // suelta) generado offline en
    // apps/web/public/passes/chilaquikes/hero-v3.jpg (ver
    // packages/wallet/scripts/generate-pass-assets.ts para el criterio de
    // pre-generación — este resize puntual se hizo a mano porque es un
    // asset de UN negocio, no parte del pipeline por-conteo-de-sellos).
    // businessGoogleHeroUri es null para cualquier negocio sin ese asset
    // cargado — mismo criterio nullable que el resto de la marca.
    heroImageUri: snapshot.businessGoogleHeroUri ?? undefined,
    // wideProgramLogoUri: sigue bloqueado. El asset que Ian mandó
    // (logo-wordmark.png, 2048x768) es para heroImageUri arriba, NO para
    // este campo — wideProgramLogo espera un wordmark limpio/transparente
    // sin fondo decorativo (reemplaza el logo circular pequeño del header
    // por una versión ancha), y este asset trae fondo rojo sólido +
    // patrón de mini-mascots de borde a borde: se vería como un rectángulo
    // rojo intruso en el header de Google, no un logotipo. Sigue
    // pendiente el asset transparente dedicado de Narciso.
    wideProgramLogoUri: snapshot.businessGoogleWideLogoUri ?? undefined,
    merchantLocations: snapshot.businessLocations.length > 0 ? snapshot.businessLocations : undefined,
    classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
  });

  const objectPayload = buildLoyaltyObjectPayload({
    issuerId,
    businessId,
    customerId,
    customerFirstName: snapshot.customerFirstName,
    stampsRequired: snapshot.stampsRequired,
    cycleStamps: snapshot.cycleStamps,
    // nextRewardName (no rewardName): Google no tiene rejilla gráfica de
    // sellos, el texto motivador de buildProgressMessage es la única
    // forma de comunicar avance — necesita el nombre de la recompensa
    // DESDE el primer sello, no solo cuando ya está lista (eso sí aplica
    // a Apple, ver rewardName/passGeneration.ts).
    rewardName: snapshot.nextRewardName,
    availableRewardsCount: snapshot.availableRewardsCount,
    walletToken: snapshot.walletToken,
    classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
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
