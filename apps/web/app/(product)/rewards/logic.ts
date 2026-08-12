// OJO: este archivo NO lleva "use server" a propósito — mismo motivo que
// app/customers/logic.ts: estas funciones reciben la sesión como parámetro
// y en un archivo "use server" quedarían expuestas como endpoints
// invocables con una sesión forjada. Solo actions.ts (que resuelve la
// sesión desde cookies verificadas) y los tests las llaman.
import { and, asc, eq } from "drizzle-orm";
import { loyaltyPrograms, rewardRules, withTenantContext } from "@loyalty/db";
import {
  findInTenant,
  resolveActor,
  writeAuditLog,
  type TenantSession,
} from "../../../lib/tenant";

export type RewardsActionState = {
  error?: string;
  success?: string;
};

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

function parseBoundedInt(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
): number | null {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

// Config del programa y reglas: SOLO el dueño. Staff/admin de tenant ven
// pero no editan (el gate corre acá, en cada invocación, no solo en la UI).
// Nombre histórico (era literal "solo owner"); el modelo RBAC nuevo trata
// admin igual que owner (acceso total) — solo staff queda excluido. No
// renombrado a propósito para minimizar el diff de este fix de seguridad.
function ownerGateError(session: TenantSession | null): string | null {
  if (!session) return "No autorizado.";
  if (session.role !== "owner" && session.role !== "admin") {
    return "Solo el dueño puede configurar el programa.";
  }
  return null;
}

class RuleNotFoundError extends Error {}
class ProgramMissingError extends Error {}
class RuleExceedsProgramCycleError extends Error {
  constructor(public readonly programStampsRequired: number) {
    super("rule stampsRequired no puede superar el stampsRequired del programa");
  }
}

// PROPAGACIÓN A WALLET — comportamiento actual, documentado tras una
// auditoría explícita (no es un bug, es el diseño de hoy): tanto
// saveProgramForSession (stampsRequired) como saveRewardRuleForSession
// (nombre/descripción de una recompensa) escriben en DB de inmediato y
// quedan disponibles para lectura en el momento — loadCustomerLoyaltySnapshot
// (apps/web/lib/wallet/loyaltySnapshot.ts) siempre lee estas tablas en
// vivo, nunca desde una copia cacheada.
//
// PERO ninguna de las dos funciones dispara notifyWalletOfTransaction
// (apps/web/lib/wallet/notify.ts) — ese hook solo corre después de un
// sello/canje real (scanner/logic.ts). Así que un cambio acá NO empuja de
// inmediato a los pases YA INSTALADOS: se refleja recién en el pase de un
// cliente específico la PRÓXIMA VEZ que ese cliente reciba un sello o
// canje. Un cliente inactivo puede quedarse con datos viejos en su pase
// (stamps_required u el texto de una recompensa) indefinidamente, hasta
// su siguiente visita.
//
// Deliberadamente NO implementado: un job que notifique a TODOS los
// pases de un negocio en cada edición de /rewards — tiene costo real de
// rate-limit contra las APIs de Apple/Google (un negocio con cientos de
// clientes dispararía cientos de pushes/PATCHes por cada guardado) y no
// se ha pedido. Si se decide construirlo, replicar el criterio
// best-effort de notifyWalletOfTransaction (nunca bloquear el guardado
// esperando la propagación, cada pase aislado en su propio catch).
export async function saveProgramForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<RewardsActionState> {
  const gateError = ownerGateError(session);
  if (gateError || !session) return { error: gateError ?? "No autorizado." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return { error: "El nombre del programa es obligatorio (máx. 120 caracteres)." };
  }
  const stampsRequired = parseBoundedInt(formData.get("stampsRequired"), 1, 100);
  if (stampsRequired === null) {
    return { error: "Los sellos requeridos deben ser un entero entre 1 y 100." };
  }
  const cooldownMinutes = parseBoundedInt(formData.get("cooldownMinutes"), 0, 1440);
  if (cooldownMinutes === null) {
    return { error: "El cooldown debe ser un entero entre 0 y 1440 minutos." };
  }
  const isActive = formData.get("isActive") === "on";
  const cooldownSeconds = cooldownMinutes * 60;

  try {
    await withTenantContext(session.businessId, async (tx) => {
      const actor = await resolveActor(tx, session);
      // MVP: un programa por negocio — se resuelve por business_id de la
      // sesión, NUNCA por un id que venga del cliente.
      const [existing] = await tx
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, session.businessId))
        .orderBy(asc(loyaltyPrograms.createdAt))
        .limit(1);

      if (existing) {
        await tx
          .update(loyaltyPrograms)
          .set({ name, stampsRequired, cooldownSeconds, isActive, updatedBy: actor.id })
          .where(
            and(
              eq(loyaltyPrograms.id, existing.id),
              eq(loyaltyPrograms.businessId, session.businessId),
            ),
          );
        await writeAuditLog(tx, session, actor.id, {
          action: "loyalty_program.updated",
          entityType: "loyalty_program",
          entityId: existing.id,
          metadata: { name, stampsRequired, cooldownSeconds, isActive },
        });
      } else {
        const [created] = await tx
          .insert(loyaltyPrograms)
          .values({
            businessId: session.businessId,
            name,
            stampsRequired,
            cooldownSeconds,
            isActive,
            createdBy: actor.id,
          })
          .returning();
        await writeAuditLog(tx, session, actor.id, {
          action: "loyalty_program.created",
          entityType: "loyalty_program",
          entityId: created.id,
          metadata: { name, stampsRequired, cooldownSeconds, isActive },
        });
      }
    });
  } catch (error) {
    console.error("saveProgramForSession:", error);
    return { error: "No se pudo guardar el programa. Intenta de nuevo." };
  }

  return { success: "Programa guardado." };
}

export async function saveRewardRuleForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<RewardsActionState> {
  const gateError = ownerGateError(session);
  if (gateError || !session) return { error: gateError ?? "No autorizado." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return { error: "El nombre de la recompensa es obligatorio (máx. 120 caracteres)." };
  }
  const rawDescription = String(formData.get("description") ?? "").trim();
  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return { error: "La descripción supera los 500 caracteres." };
  }
  const description = rawDescription || null;
  const stampsRequired = parseBoundedInt(formData.get("stampsRequired"), 1, 100);
  if (stampsRequired === null) {
    return { error: "Los sellos requeridos deben ser un entero entre 1 y 100." };
  }
  // Vacío = crear; con valor = editar esa regla (verificada en el tenant).
  const ruleId = String(formData.get("ruleId") ?? "").trim();

  try {
    await withTenantContext(session.businessId, async (tx) => {
      const actor = await resolveActor(tx, session);

      // Resuelto SIEMPRE, tanto en alta como en edición — necesario para
      // validar el tope (ver RuleExceedsProgramCycleError abajo). Decisión
      // de producto: program.stampsRequired es el número que define el
      // ciclo completo; ninguna recompensa puede pedir más sellos que eso
      // (el ciclo ya se reinició antes de llegar ahí — ver
      // evaluateRedemption en packages/core/src/loyalty.ts, que usa
      // rule.stampsRequired, no el del programa, para decidir el canje).
      const [program] = await tx
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, session.businessId))
        .orderBy(asc(loyaltyPrograms.createdAt))
        .limit(1);
      if (!program) {
        throw new ProgramMissingError();
      }
      if (stampsRequired > program.stampsRequired) {
        throw new RuleExceedsProgramCycleError(program.stampsRequired);
      }

      if (ruleId) {
        const rule = await findInTenant(tx, session, rewardRules, ruleId);
        if (!rule) {
          // Id ajeno o inexistente: mismo mensaje, sin oráculo.
          throw new RuleNotFoundError();
        }
        await tx
          .update(rewardRules)
          .set({ name, description, stampsRequired, updatedBy: actor.id })
          .where(
            and(
              eq(rewardRules.id, rule.id),
              eq(rewardRules.businessId, session.businessId),
            ),
          );
        await writeAuditLog(tx, session, actor.id, {
          action: "reward_rule.updated",
          entityType: "reward_rule",
          entityId: rule.id,
          metadata: { name, stampsRequired },
        });
        return;
      }

      const [created] = await tx
        .insert(rewardRules)
        .values({
          businessId: session.businessId,
          loyaltyProgramId: program.id,
          name,
          description,
          stampsRequired,
          createdBy: actor.id,
        })
        .returning();
      await writeAuditLog(tx, session, actor.id, {
        action: "reward_rule.created",
        entityType: "reward_rule",
        entityId: created.id,
        metadata: { name, stampsRequired },
      });
    });
  } catch (error) {
    if (error instanceof RuleNotFoundError) {
      return { error: "La recompensa no existe." };
    }
    if (error instanceof ProgramMissingError) {
      return { error: "Primero configura el programa de sellos." };
    }
    if (error instanceof RuleExceedsProgramCycleError) {
      return {
        error: `El número de sellos de una recompensa no puede superar los sellos del ciclo completo (${error.programStampsRequired}).`,
      };
    }
    console.error("saveRewardRuleForSession:", error);
    return { error: "No se pudo guardar la recompensa. Intenta de nuevo." };
  }

  return { success: "Recompensa guardada." };
}

export async function toggleRewardRuleForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<RewardsActionState> {
  const gateError = ownerGateError(session);
  if (gateError || !session) return { error: gateError ?? "No autorizado." };

  const ruleId = String(formData.get("ruleId") ?? "").trim();

  try {
    await withTenantContext(session.businessId, async (tx) => {
      const actor = await resolveActor(tx, session);
      const rule = await findInTenant(tx, session, rewardRules, ruleId);
      if (!rule) {
        throw new RuleNotFoundError();
      }

      const nextActive = !rule.isActive;
      await tx
        .update(rewardRules)
        .set({ isActive: nextActive, updatedBy: actor.id })
        .where(
          and(
            eq(rewardRules.id, rule.id),
            eq(rewardRules.businessId, session.businessId),
          ),
        );
      await writeAuditLog(tx, session, actor.id, {
        action: nextActive ? "reward_rule.activated" : "reward_rule.deactivated",
        entityType: "reward_rule",
        entityId: rule.id,
        metadata: { name: rule.name },
      });
    });
  } catch (error) {
    if (error instanceof RuleNotFoundError) {
      return { error: "La recompensa no existe." };
    }
    console.error("toggleRewardRuleForSession:", error);
    return { error: "No se pudo actualizar la recompensa. Intenta de nuevo." };
  }

  return { success: "Recompensa actualizada." };
}
