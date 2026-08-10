import { and, eq } from "drizzle-orm";
import { buildLoyaltyObjectId, buildLoyaltyObjectPayload, CURRENT_GOOGLE_LOYALTY_CLASS_VERSION } from "@loyalty/wallet";
import { deviceRegistrations, walletPasses, withTenantContext, type VerifiedBusinessId } from "@loyalty/db";
import { getApnsSender, getApplePassTypeIdentifier, getGoogleIssuerId, getGoogleWalletClient } from "./adapters";
import { loadCustomerLoyaltySnapshot } from "./loyaltySnapshot";

// Encola la actualización de Wallet tras un sello/canje. BEST-EFFORT
// (ver skill wallet-integration): la transacción de negocio YA se
// confirmó en la DB antes de que esto se llame — nada acá puede
// revertirla. Esta función NUNCA lanza; cada fallo se atrapa y loguea.
//
// Apple: push vacío a cada device_registrations (el dispositivo hace pull
// del .pkpass actualizado). Google no usa push — se actualiza con un PATCH
// directo (upsertLoyaltyObject) al Loyalty Object, solo si el cliente ya
// tiene un wallet_passes de plataforma google (si nunca agregó el pase, no
// hay nada que actualizar — evita llamadas a la API de Google en vano).

const RETRY_DELAYS_MS = [2000, 8000];

async function withRetries(fn: () => Promise<void>, delaysMs: number[]): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < delaysMs.length) {
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
  }
  throw lastError;
}

async function notifyAppleDevices(
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<void> {
  const registrations = await withTenantContext(businessId, async (tx) => {
    const [pass] = await tx
      .select({ id: walletPasses.id })
      .from(walletPasses)
      .where(
        and(
          eq(walletPasses.businessId, businessId),
          eq(walletPasses.customerId, customerId),
          eq(walletPasses.platform, "apple"),
        ),
      )
      .limit(1);
    if (!pass) return [];

    return tx
      .select({ pushToken: deviceRegistrations.pushToken })
      .from(deviceRegistrations)
      .where(
        and(
          eq(deviceRegistrations.businessId, businessId),
          eq(deviceRegistrations.walletPassId, pass.id),
        ),
      );
  });

  if (registrations.length === 0) return;

  const sender = getApnsSender();
  const passTypeIdentifier = getApplePassTypeIdentifier();

  // Cada dispositivo se reintenta y se atrapa POR SEPARADO: que uno falle
  // (token vencido, dispositivo offline) nunca debe impedir el push a los
  // demás dispositivos del mismo cliente.
  await Promise.all(
    registrations.map((reg) =>
      withRetries(() => sender({ pushToken: reg.pushToken, passTypeIdentifier }), RETRY_DELAYS_MS).catch(
        (error) => {
          console.error("[wallet:notify:apple] push falló tras reintentos:", error);
        },
      ),
    ),
  );
}

async function notifyGoogleObject(businessId: VerifiedBusinessId, customerId: string): Promise<void> {
  const walletPassId = await withTenantContext(businessId, async (tx) => {
    const [pass] = await tx
      .select({ id: walletPasses.id })
      .from(walletPasses)
      .where(
        and(
          eq(walletPasses.businessId, businessId),
          eq(walletPasses.customerId, customerId),
          eq(walletPasses.platform, "google"),
        ),
      )
      .limit(1);
    return pass?.id ?? null;
  });
  if (!walletPassId) return;

  const snapshot = await withTenantContext(businessId, (tx) =>
    loadCustomerLoyaltySnapshot(tx, businessId, customerId),
  );
  if (!snapshot) return;

  const issuerId = getGoogleIssuerId();
  const objectPayload = buildLoyaltyObjectPayload({
    issuerId,
    businessId,
    customerId,
    customerFirstName: snapshot.customerFirstName,
    currentStamps: snapshot.currentStamps,
    stampsRequired: snapshot.stampsRequired,
    rewardName: snapshot.rewardName,
    walletToken: snapshot.walletToken,
    // Sin esto, cada sello/canje después de la migración a _v2
    // (googleSaveLink.ts) volvería a escribir el classId VIEJO en el
    // objeto ya migrado — este PATCH pisaría la migración en el próximo
    // movimiento del cliente. Debe coincidir siempre con el version que
    // usa googleSaveLink.ts para la MISMA clase.
    classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
  });

  await withRetries(
    () => getGoogleWalletClient().upsertLoyaltyObject(buildLoyaltyObjectId(issuerId, customerId), objectPayload),
    RETRY_DELAYS_MS,
  ).catch((error) => {
    console.error("[wallet:notify:google] upsertLoyaltyObject falló tras reintentos:", error);
  });
}

export async function notifyWalletOfTransaction(
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<void> {
  try {
    await Promise.all([
      notifyAppleDevices(businessId, customerId),
      notifyGoogleObject(businessId, customerId),
    ]);
  } catch (error) {
    // notifyAppleDevices/notifyGoogleObject ya atrapan sus propios fallos
    // de red/proveedor — esto solo cubre un fallo en la QUERY misma
    // (p.ej. la DB no responde), que nunca debe propagar hacia el caller
    // de un sello/canje ya confirmado.
    console.error("[wallet:notify] fallo inesperado:", error);
  }
}
