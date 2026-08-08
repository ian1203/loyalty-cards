import { and, eq } from "drizzle-orm";
import { buildLogoImage, buildPassJson, buildPkpass, buildStripImage, type RgbColor } from "@loyalty/wallet";
import { walletPasses, type TenantTransaction, type VerifiedBusinessId } from "@loyalty/db";
import { getApplePassTypeIdentifier, getAppleTeamIdentifier, getPkpassSigner } from "./adapters";
import { deriveBrandColor, hexToRgb } from "./brandColor";
import { loadCustomerLoyaltySnapshot } from "./loyaltySnapshot";
import { resolveBusinessAssetBuffer } from "./businessAssets";

export type GeneratePkpassResult =
  | { ok: true; pkpass: Buffer; walletPassId: string }
  | { ok: false; reason: "no_program" | "no_pass_row" };

// Genera el .pkpass más reciente para un cliente — usado tanto por el web
// service público (GET /v1/passes/..., sirve la ACTUALIZACIÓN a un pase ya
// instalado) como por la entrega inicial autenticada (paso h, primera
// instalación). Misma función, dos callers con auth distinta — la
// diferencia de auth vive en cada route.ts, no acá.
export async function generateApplePkpassForCustomer(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<GeneratePkpassResult> {
  const snapshot = await loadCustomerLoyaltySnapshot(tx, businessId, customerId);
  if (!snapshot) {
    return { ok: false, reason: "no_program" };
  }

  const [walletPass] = await tx
    .select()
    .from(walletPasses)
    .where(
      and(
        eq(walletPasses.businessId, businessId),
        eq(walletPasses.customerId, customerId),
        eq(walletPasses.platform, "apple"),
      ),
    )
    .limit(1);
  if (!walletPass) {
    return { ok: false, reason: "no_pass_row" };
  }

  // Sin fallback silencioso a localhost (sería un .pkpass firmado y
  // distribuido con un webServiceURL roto en producción, que nunca se
  // detectaría solo) — mismo criterio que admin/actions.ts para esta
  // misma variable: si falta, falla fuerte, no en silencio.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL no está configurado.");
  }

  // Branding real (businesses.brand_color_hex) SOLO cambia la paleta —
  // sin él, el pase se ve EXACTAMENTE como antes (fondo blanco, texto gris
  // oscuro, ícono hash-derivado): cero cambio de comportamiento para
  // negocios sin marca cargada todavía.
  const brandColorHex = snapshot.businessBrandColorHex;
  const backgroundRgb: RgbColor = brandColorHex ? hexToRgb(brandColorHex) : [255, 255, 255];
  const foregroundRgb: RgbColor = brandColorHex ? [255, 244, 227] : [30, 30, 30];
  const labelRgb: RgbColor = brandColorHex ? [255, 217, 179] : [110, 110, 110];
  const iconRgb: RgbColor = brandColorHex ? backgroundRgb : deriveBrandColor(businessId);

  // logo.png/strip.png son best-effort DE VERDAD (antes solo lo decía el
  // comentario, el código no lo hacía): un asset roto/ausente, O sharp
  // fallando a cargar su binario nativo en este runtime (bug real de
  // producción, ver git log — ERR_DLOPEN_FAILED pese a varios intentos de
  // arreglarlo a nivel de bundler), no debe tumbar el pase COMPLETO. Sin
  // logo/strip el pase sigue siendo válido e instalable — QR, sellos y
  // recompensa intactos — solo sin esa pieza visual. Antes de este fix,
  // un fallo acá abortaba generateApplePkpassForCustomer entero: un
  // cliente de un negocio con branding real (Chilaquikes) no recibía
  // NINGÚN pase, ni siquiera el plano.
  const [logoBuffer, heroBuffer] = await Promise.all([
    resolveBusinessAssetBuffer(snapshot.businessWalletLogoUrl),
    resolveBusinessAssetBuffer(snapshot.businessWalletHeroUrl),
  ]);

  let logoPng: { at1x: Buffer; at2x: Buffer; at3x: Buffer } | undefined;
  if (logoBuffer) {
    try {
      logoPng = {
        at1x: await buildLogoImage(logoBuffer, 1),
        at2x: await buildLogoImage(logoBuffer, 2),
        at3x: await buildLogoImage(logoBuffer, 3),
      };
    } catch (error) {
      console.error("buildLogoImage:", error);
    }
  }

  let stripPng: { at1x: Buffer; at2x: Buffer; at3x: Buffer } | undefined;
  if (heroBuffer) {
    try {
      stripPng = {
        at1x: await buildStripImage({
          heroImageBuffer: heroBuffer,
          bandRgb: backgroundRgb,
          currentStamps: snapshot.currentStamps,
          stampsRequired: snapshot.stampsRequired,
          scale: 1,
        }),
        at2x: await buildStripImage({
          heroImageBuffer: heroBuffer,
          bandRgb: backgroundRgb,
          currentStamps: snapshot.currentStamps,
          stampsRequired: snapshot.stampsRequired,
          scale: 2,
        }),
        at3x: await buildStripImage({
          heroImageBuffer: heroBuffer,
          bandRgb: backgroundRgb,
          currentStamps: snapshot.currentStamps,
          stampsRequired: snapshot.stampsRequired,
          scale: 3,
        }),
      };
    } catch (error) {
      console.error("buildStripImage:", error);
    }
  }

  const passJson = buildPassJson({
    serialNumber: walletPass.id,
    authenticationToken: walletPass.authenticationToken,
    webServiceUrl: `${siteUrl}/api/wallet/apple`,
    passTypeIdentifier: getApplePassTypeIdentifier(),
    teamIdentifier: getAppleTeamIdentifier(),
    organizationName: snapshot.businessName,
    programName: snapshot.programName,
    customerFirstName: snapshot.customerFirstName,
    currentStamps: snapshot.currentStamps,
    stampsRequired: snapshot.stampsRequired,
    rewardName: snapshot.rewardName,
    walletToken: snapshot.walletToken,
    colors: { backgroundRgb, foregroundRgb, labelRgb },
  });

  const pkpass = await buildPkpass({
    passJson,
    signer: getPkpassSigner(),
    iconRgb,
    logoPng,
    stripPng,
  });

  return { ok: true, pkpass, walletPassId: walletPass.id };
}
