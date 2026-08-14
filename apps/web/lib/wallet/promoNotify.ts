import { and, eq, inArray } from "drizzle-orm";
import { buildLoyaltyClassId, CURRENT_GOOGLE_LOYALTY_CLASS_VERSION } from "@loyalty/wallet";
import { deviceRegistrations, walletPasses, withTenantContext, type VerifiedBusinessId } from "@loyalty/db";
import { getApnsSender, getApplePassTypeIdentifier, getGoogleIssuerId, getGoogleWalletClient } from "./adapters";

// Encola el broadcast de una promoción a TODOS los clientes del negocio
// con el pase guardado (ver app/(product)/promotions/logic.ts) — paralelo
// a notify.ts (que reacciona a UN sello/canje de UN cliente), no se toca
// notify.ts: es un trigger conceptualmente distinto. BEST-EFFORT, mismo
// contrato que notifyWalletOfTransaction: la fila de promo_broadcasts YA
// se confirmó en la DB antes de que esto se llame, nada acá puede
// revertirla, nunca lanza.
//
// Apple no tiene equivalente a "nivel clase" (ver skill
// wallet-integration): hay que bumpear updated_at de CADA wallet_pass
// Apple del negocio (para que passesUpdatedSince los detecte, mismo
// motivo que notifyAppleDevices) y pushear a cada device_registrations.
// Google sí: un solo addLoyaltyClassMessage a la clase compartida del
// negocio notifica (según documentación — sin confirmar contra la API
// real todavía, ver plan) a todos los objetos que la referencian.

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

async function notifyAppleDevicesForBusiness(
  businessId: VerifiedBusinessId,
  broadcastId: string,
): Promise<void> {
  console.info(`[wallet:promoNotify:apple] broadcastId=${broadcastId} iniciando — businessId=${businessId}`);
  const registrations = await withTenantContext(businessId, async (tx) => {
    const applePasses = await tx
      .update(walletPasses)
      .set({ updatedAt: new Date() })
      .where(and(eq(walletPasses.businessId, businessId), eq(walletPasses.platform, "apple")))
      .returning({ id: walletPasses.id });

    if (applePasses.length === 0) return [];

    return tx
      .select({
        pushToken: deviceRegistrations.pushToken,
        deviceLibraryIdentifier: deviceRegistrations.deviceLibraryIdentifier,
        walletPassId: deviceRegistrations.walletPassId,
      })
      .from(deviceRegistrations)
      .where(
        and(
          eq(deviceRegistrations.businessId, businessId),
          inArray(
            deviceRegistrations.walletPassId,
            applePasses.map((pass) => pass.id),
          ),
        ),
      );
  });

  console.info(
    `[wallet:promoNotify:apple] broadcastId=${broadcastId} encontró ${registrations.length} device_registrations`,
  );
  if (registrations.length === 0) {
    console.info(`[wallet:promoNotify:apple] broadcastId=${broadcastId} sin dispositivos — no se intenta ningún push`);
    return;
  }

  const sender = getApnsSender();
  const passTypeIdentifier = getApplePassTypeIdentifier();

  // Cada dispositivo se reintenta y se atrapa POR SEPARADO — mismo motivo
  // que notifyAppleDevices: uno fallando (token vencido, offline) nunca
  // debe impedir el push a los demás clientes del broadcast.
  await Promise.all(
    registrations.map((reg) =>
      withRetries(() => sender({ pushToken: reg.pushToken, passTypeIdentifier }), RETRY_DELAYS_MS)
        .then(() => {
          console.info(
            `[wallet:promoNotify:apple] broadcastId=${broadcastId} push OK (walletPassId=${reg.walletPassId}, deviceLibraryIdentifier=${reg.deviceLibraryIdentifier})`,
          );
        })
        .catch((error) => {
          console.error(
            `[wallet:promoNotify:apple] broadcastId=${broadcastId} push falló tras reintentos (walletPassId=${reg.walletPassId}, deviceLibraryIdentifier=${reg.deviceLibraryIdentifier}):`,
            error,
          );
        }),
    ),
  );
  console.info(`[wallet:promoNotify:apple] broadcastId=${broadcastId} terminó de procesar los ${registrations.length} dispositivos`);
}

async function notifyGoogleClassForBusiness(businessId: VerifiedBusinessId, message: string): Promise<void> {
  // Evita llamar a la API en vano si el negocio nunca tuvo un cliente con
  // pase Google (la clase podría ni existir todavía) — mismo criterio que
  // notifyGoogleObject en notify.ts.
  const hasGoogleCustomers = await withTenantContext(businessId, async (tx) => {
    const [row] = await tx
      .select({ id: walletPasses.id })
      .from(walletPasses)
      .where(and(eq(walletPasses.businessId, businessId), eq(walletPasses.platform, "google")))
      .limit(1);
    return Boolean(row);
  });
  if (!hasGoogleCustomers) return;

  const issuerId = getGoogleIssuerId();
  const classId = buildLoyaltyClassId(issuerId, businessId, CURRENT_GOOGLE_LOYALTY_CLASS_VERSION);

  await withRetries(
    () =>
      getGoogleWalletClient().addLoyaltyClassMessage(classId, {
        header: "Nueva promoción",
        body: message,
        messageType: "TEXT_AND_NOTIFY",
      }),
    RETRY_DELAYS_MS,
  ).catch((error) => {
    console.error("[wallet:promoNotify:google] addLoyaltyClassMessage falló tras reintentos:", error);
  });
}

export async function notifyWalletOfPromoBroadcast(
  businessId: VerifiedBusinessId,
  message: string,
  broadcastId: string,
): Promise<void> {
  // Instrumentación de diagnóstico: START/END del callback diferido
  // (scheduleAfterResponse/after()) con un id único (la fila de
  // promo_broadcasts) — sin esto no había forma de confirmar en los logs
  // de Vercel si after() corrió de principio a fin o se cortó a medias.
  console.info(`[wallet:promoNotify] broadcastId=${broadcastId} callback diferido INICIO — businessId=${businessId}`);
  try {
    await Promise.all([
      notifyAppleDevicesForBusiness(businessId, broadcastId),
      notifyGoogleClassForBusiness(businessId, message),
    ]);
  } catch (error) {
    // notifyAppleDevicesForBusiness/notifyGoogleClassForBusiness ya
    // atrapan sus propios fallos de red/proveedor — esto solo cubre un
    // fallo en la QUERY misma, que nunca debe propagar hacia el caller
    // de un envío ya confirmado.
    console.error("[wallet:promoNotify] fallo inesperado:", error);
  }
  console.info(`[wallet:promoNotify] broadcastId=${broadcastId} callback diferido FIN`);
}
