import { and, eq } from "drizzle-orm";
import { buildPassJson, buildPkpass } from "@loyalty/wallet";
import { walletPasses, type TenantTransaction, type VerifiedBusinessId } from "@loyalty/db";
import { getApplePassTypeIdentifier, getAppleTeamIdentifier, getPkpassSigner } from "./adapters";
import { deriveBrandColor } from "./brandColor";
import { loadCustomerLoyaltySnapshot } from "./loyaltySnapshot";

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
    colors: {
      backgroundRgb: [255, 255, 255],
      foregroundRgb: [30, 30, 30],
      labelRgb: [110, 110, 110],
    },
  });

  const pkpass = await buildPkpass({
    passJson,
    signer: getPkpassSigner(),
    iconRgb: deriveBrandColor(businessId),
  });

  return { ok: true, pkpass, walletPassId: walletPass.id };
}
