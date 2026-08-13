// OJO: este archivo NO lleva "use server" a propósito — mismo motivo que
// rewards/logic.ts/team/logic.ts: recibe la sesión como parámetro, y en un
// archivo "use server" quedaría expuesto como endpoint invocable con una
// sesión forjada. Solo actions.ts (sesión desde cookies verificadas) y los
// tests la llaman.
import { and, count, eq, gte } from "drizzle-orm";
import { businesses, promoBroadcasts, withTenantContext } from "@loyalty/db";
import { resolveActor, writeAuditLog, type TenantSession } from "../../../lib/tenant";
import { notifyWalletOfPromoBroadcast } from "../../../lib/wallet/promoNotify";
import { scheduleAfterResponse } from "../../../lib/wallet/scheduleAfterResponse";

export type PromotionsActionState = {
  error?: string;
  success?: string;
};

export const MAX_PROMO_MESSAGE_LENGTH = 180;

// Límites por plan (ver tabla de precios, fila "Notificaciones de
// Wallet") — propuestos, no un número documentado por Apple/Google,
// ajustable con uso real igual que el resto de límites de la plataforma.
// "basico" no aparece: se bloquea por completo antes de llegar a esta
// tabla (ver planGateError).
export const DAILY_LIMIT = 1;
export const MONTHLY_LIMIT_BY_PLAN: Record<"negocio" | "intelligence", number> = {
  negocio: 5,
  intelligence: 10,
};

// Envío de broadcast: SOLO el dueño (mismo criterio/copia local que
// rewards/logic.ts y team/logic.ts — "cada feature mantiene su propia
// copia", ya establecido).
function ownerGateError(session: TenantSession | null): string | null {
  if (!session) return "No autorizado.";
  if (session.role !== "owner" && session.role !== "admin") {
    return "Solo el dueño puede enviar una promoción.";
  }
  return null;
}

class PlanNotEligibleError extends Error {}
class DailyLimitReachedError extends Error {}
class MonthlyLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super("límite mensual de promociones alcanzado");
  }
}

export function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function sendPromoBroadcastForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<PromotionsActionState> {
  const gateError = ownerGateError(session);
  if (gateError || !session) return { error: gateError ?? "No autorizado." };

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    return { error: "El mensaje de la promoción no puede estar vacío." };
  }
  if (message.length > MAX_PROMO_MESSAGE_LENGTH) {
    return { error: `El mensaje no puede superar los ${MAX_PROMO_MESSAGE_LENGTH} caracteres.` };
  }

  try {
    await withTenantContext(session.businessId, async (tx) => {
      // Lock de fila: serializa envíos concurrentes del mismo negocio
      // (doble clic, doble pestaña, reintento de red) — sin esto, dos
      // requests podrían leer ambos COUNT en 0 antes de que cualquiera
      // inserte y las dos pasarían el límite diario/mensual. Mismo
      // criterio que el lock de customer_balances en scanner/logic.ts
      // (SELECT ... FOR UPDATE serializa por la fila que importa, acá la
      // fila del negocio en vez de la del cliente+programa).
      const [business] = await tx
        .select({ plan: businesses.plan })
        .from(businesses)
        .where(eq(businesses.id, session.businessId))
        .limit(1)
        .for("update");

      if (!business || business.plan === "basico") {
        throw new PlanNotEligibleError();
      }
      const monthlyLimit = MONTHLY_LIMIT_BY_PLAN[business.plan];

      const now = new Date();

      const [todayCount] = await tx
        .select({ value: count() })
        .from(promoBroadcasts)
        .where(
          and(
            eq(promoBroadcasts.businessId, session.businessId),
            gte(promoBroadcasts.createdAt, startOfTodayUtc(now)),
          ),
        );
      if ((todayCount?.value ?? 0) >= DAILY_LIMIT) {
        throw new DailyLimitReachedError();
      }

      const [monthCount] = await tx
        .select({ value: count() })
        .from(promoBroadcasts)
        .where(
          and(
            eq(promoBroadcasts.businessId, session.businessId),
            gte(promoBroadcasts.createdAt, startOfMonthUtc(now)),
          ),
        );
      if ((monthCount?.value ?? 0) >= monthlyLimit) {
        throw new MonthlyLimitReachedError(monthlyLimit);
      }

      const actor = await resolveActor(tx, session);
      const [created] = await tx
        .insert(promoBroadcasts)
        .values({ businessId: session.businessId, sentByUserId: actor.id, message })
        .returning();
      await writeAuditLog(tx, session, actor.id, {
        action: "promo_broadcast.sent",
        entityType: "promo_broadcast",
        entityId: created.id,
        metadata: { message },
      });
    });
  } catch (error) {
    if (error instanceof PlanNotEligibleError) {
      return { error: "Esta función requiere plan Negocio o Intelligence." };
    }
    if (error instanceof DailyLimitReachedError) {
      return { error: "Ya enviaste una promoción hoy. Vuelve a intentar mañana." };
    }
    if (error instanceof MonthlyLimitReachedError) {
      return { error: `Alcanzaste el límite de ${error.limit} promociones de tu plan este mes.` };
    }
    console.error("sendPromoBroadcastForSession:", error);
    return { error: "No se pudo enviar la promoción. Intenta de nuevo." };
  }

  // Best-effort, DESPUÉS de que la transacción ya confirmó — mismo
  // contrato que notifyWalletOfTransaction, nunca revierte el envío ya
  // registrado.
  scheduleAfterResponse(() => notifyWalletOfPromoBroadcast(session.businessId, message));

  return { success: "Promoción enviada." };
}
