import { and, eq } from "drizzle-orm";
import { buildLoyaltyObjectId, buildLoyaltyObjectPayload, CURRENT_GOOGLE_LOYALTY_CLASS_VERSION } from "@loyalty/wallet";
import { deviceRegistrations, walletPasses, withTenantContext, type VerifiedBusinessId } from "@loyalty/db";
import { getApnsSender, getApplePassTypeIdentifier, getGoogleIssuerId, getGoogleWalletClient } from "./adapters";
import { loadCustomerLoyaltySnapshot } from "./loyaltySnapshot";
import { captureServerError } from "../observability/captureServerError";

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

    // Bug real encontrado y confirmado por lectura de código (no
    // hipótesis): wallet_passes.updated_at SÍ está diseñado como el tag
    // de "passesUpdatedSince" (ver comentario en el schema,
    // packages/db/src/schema/walletPasses.ts) — listUpdatedSerialsForDevice
    // (el endpoint "What Changed?" que Apple consulta tras el push) filtra
    // por esta columna. Pero NADA la tocaba desde la creación de la fila:
    // ensureWalletPass solo hace INSERT, nunca UPDATE. Resultado real: el
    // push SÍ llegaba, el dispositivo SÍ preguntaba "¿qué cambió?", pero
    // la respuesta decía "nada tuyo" para siempre si el pase se creó antes
    // del último checkpoint del dispositivo — sin importar cuántos sellos
    // recibiera después. Se bumpea SIEMPRE que hay un pase real, incluso
    // sin ningún dispositivo registrado hoy — uno que se registre después
    // también necesita ver el estado de sync correcto.
    await tx.update(walletPasses).set({ updatedAt: new Date() }).where(eq(walletPasses.id, pass.id));

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
          eq(deviceRegistrations.walletPassId, pass.id),
        ),
      );
  });

  if (registrations.length === 0) return;

  const sender = getApnsSender();
  const passTypeIdentifier = getApplePassTypeIdentifier();

  // Cada dispositivo se reintenta y se atrapa POR SEPARADO: que uno falle
  // (token vencido, dispositivo offline) nunca debe impedir el push a los
  // demás dispositivos del mismo cliente. deviceLibraryIdentifier/
  // walletPassId van en el log — SIN eso, un timeout de APNs (ver
  // apns.ts) es imposible de correlacionar con QUÉ pase/dispositivo
  // falló sin entrar al dashboard de Vercel a mano (incidente real: cero
  // señal para diagnosticar el sello de un cliente real que no se
  // propagó).
  await Promise.all(
    registrations.map((reg) =>
      withRetries(() => sender({ pushToken: reg.pushToken, passTypeIdentifier }), RETRY_DELAYS_MS).catch(
        (error) => {
          console.error(
            `[wallet:notify:apple] push falló tras reintentos (walletPassId=${reg.walletPassId}, deviceLibraryIdentifier=${reg.deviceLibraryIdentifier}):`,
            error,
          );
          // "warning": un dispositivo individual fallando (token vencido,
          // offline) es esperado — un negocio real acumula churn de
          // dispositivos. Si esto se vuelve un patrón (varios dispositivos
          // del mismo negocio, o un pico repentino), la regla de alerta por
          // volumen en Sentry escala solo — ver docs/HISTORY.md, ronda de
          // observabilidad. NUNCA se pasa el pushToken (secreto de push).
          captureServerError(error, {
            operation: "wallet.notify.apple",
            businessId,
            severity: "warning",
            extra: {
              customerId,
              walletPassId: reg.walletPassId,
              deviceLibraryIdentifier: reg.deviceLibraryIdentifier,
            },
          });
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
    stampsRequired: snapshot.stampsRequired,
    cycleStamps: snapshot.cycleStamps,
    // nextRewardName, NO rewardName — mismo motivo que googleSaveLink.ts
    // (ver su comentario): Google necesita el mensaje motivador desde el
    // primer sello, no solo cuando la recompensa ya está desbloqueada.
    // BUG encontrado y corregido acá (auditoría del punto 4, verificación
    // de propagación dinámica): este PATCH mandaba rewardName (null hasta
    // desbloquear), así que textModulesData.progress desaparecía en SILENCIO
    // de cada pase de Google después del primer sello, hasta el sello que
    // desbloqueaba la recompensa — sin romper nada visible (el pase seguía
    // actualizando loyaltyPoints.balance bien), solo perdía el mensaje
    // motivador. googleSaveLink.ts (el link inicial) nunca tuvo este bug.
    rewardName: snapshot.nextRewardName,
    availableRewardsCount: snapshot.availableRewardsCount,
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
    // "warning" por el mismo criterio que Apple arriba: un PATCH aislado
    // fallando (Google devolviendo 5xx puntual) es ruido normal de una API
    // externa — un pico real lo agarra la regla de alerta por volumen.
    captureServerError(error, {
      operation: "wallet.notify.google",
      businessId,
      severity: "warning",
      extra: { customerId },
    });
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
    captureServerError(error, {
      operation: "wallet.notify.query",
      businessId,
      severity: "warning",
      extra: { customerId },
    });
  }
}
