import { and, eq } from "drizzle-orm";
import { walletPasses, withTenantContext, type VerifiedBusinessId } from "@loyalty/db";
import { buildGoogleSaveLinkForCustomer } from "./googleSaveLink";
import { ensureWalletPass } from "./ensurePass";
import { generateApplePkpassForCustomer } from "./passGeneration";
import { verifyBusinessIdForPassToken } from "./passAuth";

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
  // URL navegable real (GET /api/wallet/apple/download/{serial}?t=...),
  // NUNCA un data: URI — Safari solo dispara la hoja nativa "Agregar a
  // Wallet" sobre una respuesta HTTP con Content-Type
  // application/vnd.apple.pkpass, no sobre un data: URI con download (bug
  // real encontrado en producción: el botón no hacía nada, sin error).
  appleWalletDownloadUrl: string | null;
  googleSaveLink: string | null;
};

export async function buildWalletArtifactsForNewEnrollment(
  rawBusinessId: string,
  customerId: string,
): Promise<PublicEnrollWalletResult> {
  const businessId = rawBusinessId as VerifiedBusinessId;

  return withTenantContext(businessId, async (tx) => {
    const applePass = await ensureWalletPass(tx, businessId, customerId, "apple");
    // Solo para confirmar que ESTE cliente puede generar un pase real ahora
    // mismo (programa activo, etc.) antes de ofrecer el botón — los bytes
    // se descartan, downloadEnrollmentApplePass los vuelve a generar al
    // tocar el botón (misma función, siempre el estado más fresco).
    const appleResult = await generateApplePkpassForCustomer(tx, businessId, customerId);
    let googleSaveLink: string | null = null;
    try {
      googleSaveLink = await buildGoogleSaveLinkForCustomer(tx, businessId, customerId);
    } catch (error) {
      console.error("buildGoogleSaveLinkForCustomer DIAGNOSTIC:", error);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const appleWalletDownloadUrl =
      appleResult.ok && siteUrl
        ? `${siteUrl}/api/wallet/apple/download/${applePass.id}?t=${encodeURIComponent(applePass.authenticationToken)}`
        : null;

    return { appleWalletDownloadUrl, googleSaveLink };
  });
}

export type DownloadEnrollmentApplePassResult = { ok: true; pkpass: Buffer } | { ok: false };

// GET público (apps/web/app/api/wallet/apple/download/[serial]/route.ts):
// entrega el .pkpass generado arriba como una respuesta HTTP real, no como
// el data: URI roto de antes. Reusa verifyBusinessIdForPassToken tal
// cual — el SEGUNDO sitio sancionado de VerifiedBusinessId
// (lib/wallet/passAuth.ts) — el token viaja en el query string en vez del
// header Authorization porque este es un <a href> de navegador tocado por
// un humano, no un cliente PassKit que pueda mandar headers custom; es el
// MISMO secreto que ya viaja embebido en pass.json dentro del .pkpass, no
// una superficie nueva.
export async function downloadEnrollmentApplePass(
  serialNumber: string,
  token: string,
): Promise<DownloadEnrollmentApplePassResult> {
  const auth = await verifyBusinessIdForPassToken(serialNumber, token);
  if (!auth) {
    return { ok: false };
  }

  return withTenantContext(auth.businessId, async (tx) => {
    const [row] = await tx
      .select({ customerId: walletPasses.customerId })
      .from(walletPasses)
      .where(and(eq(walletPasses.id, auth.walletPassId), eq(walletPasses.businessId, auth.businessId)))
      .limit(1);
    if (!row) {
      return { ok: false };
    }

    let result;
    try {
      result = await generateApplePkpassForCustomer(tx, auth.businessId, row.customerId);
    } catch (error) {
      console.error("downloadEnrollmentApplePass:", error);
      return { ok: false };
    }
    if (!result.ok) {
      return { ok: false };
    }
    return { ok: true, pkpass: result.pkpass };
  });
}
