// OJO: este archivo NO lleva "use server" — mismo motivo que en /rewards y
// /customers: estas funciones reciben la sesión como parámetro y en un
// archivo "use server" quedarían expuestas como endpoints invocables con
// una sesión forjada. Solo actions.ts (que resuelve la sesión desde cookies
// verificadas) y los tests las llaman.
import { and, asc, eq } from "drizzle-orm";
import { employees, locations, users, withTenantContext, type TenantTransaction } from "@loyalty/db";
import { banEmployeeAuth } from "../../../lib/employeeOffboarding";
import { findInTenant, resolveActor, writeAuditLog, type TenantSession } from "../../../lib/tenant";

export type TeamActionState = {
  error?: string;
  success?: string;
};

// Mismo nombre histórico que rewards/logic.ts — el modelo RBAC trata
// admin igual que owner (acceso total), solo staff queda excluido. Cada
// feature mantiene su propia copia (sin helper cross-feature, criterio ya
// establecido).
function ownerGateError(session: TenantSession | null): string | null {
  if (!session) return "No autorizado.";
  if (session.role !== "owner" && session.role !== "admin") {
    return "Solo el dueño puede administrar al equipo.";
  }
  return null;
}

class EmployeeNotFoundError extends Error {}
class SelfDeactivationError extends Error {}

// Lectura tenant-scoped para /team — sin gate propio en la query, el gate
// vive en page.tsx (staff redirige fuera de la ruta completa, igual que
// /rewards). LEFT JOIN porque employees.userId y primaryLocationId son
// nullable (una ficha sin cuenta vinculada, o sin sucursal fija).
export async function listEmployeesForSession(tx: TenantTransaction, session: TenantSession) {
  return tx
    .select({
      id: employees.id,
      fullName: employees.fullName,
      isActive: employees.isActive,
      createdAt: employees.createdAt,
      userEmail: users.email,
      primaryLocationName: locations.name,
    })
    .from(employees)
    .leftJoin(
      users,
      and(eq(users.id, employees.userId), eq(users.businessId, employees.businessId)),
    )
    .leftJoin(
      locations,
      and(
        eq(locations.id, employees.primaryLocationId),
        eq(locations.businessId, employees.businessId),
      ),
    )
    .where(eq(employees.businessId, session.businessId))
    .orderBy(asc(employees.createdAt));
}

// Offboarding real: desactiva la ficha de empleado Y su cuenta (si tiene
// una vinculada), audita, y bloquea su login futuro vía Admin API —
// "no solo borrar de la tabla" (pedido explícito del ticket). NO revoca un
// access token ya emitido y aún vigente (imposible con JWT stateless, ver
// CLAUDE.md) — eso ya lo cubre requireOperationContext en vivo para
// sellar/canjear; el resto de las rutas queda expuesto hasta que ese token
// expire (≤1h), riesgo aceptado explícitamente para esta ronda.
export async function deactivateEmployeeForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<TeamActionState> {
  const gateError = ownerGateError(session);
  if (gateError || !session) return { error: gateError ?? "No autorizado." };

  const employeeId = String(formData.get("employeeId") ?? "").trim();

  let authUserIdToBan: string | null = null;

  try {
    await withTenantContext(session.businessId, async (tx) => {
      const actor = await resolveActor(tx, session);

      const employee = await findInTenant(tx, session, employees, employeeId);
      if (!employee) {
        throw new EmployeeNotFoundError();
      }
      if (!employee.isActive) {
        // Ya estaba desactivado — idempotente, sin error (doble clic).
        return;
      }

      let linkedUser: typeof users.$inferSelect | null = null;
      if (employee.userId) {
        const [row] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, employee.userId), eq(users.businessId, session.businessId)))
          .limit(1);
        linkedUser = row ?? null;
      }

      // Nota: no hace falta un guard adicional de "no dejar el negocio sin
      // ningún owner/admin activo" — el dueño real (creado por
      // createBusinessWithOwner) nunca tiene ficha de employees, así que
      // nunca es un target posible de esta acción, y el propio actor
      // (siempre owner/admin activo, por ownerGateError) nunca puede ser el
      // target gracias al check de abajo. Sacar a CUALQUIER otro
      // owner/admin con ficha de empleado nunca deja el negocio en cero.
      if (linkedUser && linkedUser.authUserId === session.authUserId) {
        throw new SelfDeactivationError();
      }

      await tx
        .update(employees)
        .set({ isActive: false })
        .where(and(eq(employees.id, employee.id), eq(employees.businessId, session.businessId)));

      if (linkedUser) {
        await tx
          .update(users)
          .set({ isActive: false })
          .where(and(eq(users.id, linkedUser.id), eq(users.businessId, session.businessId)));
        authUserIdToBan = linkedUser.authUserId;
      }

      await writeAuditLog(tx, session, actor.id, {
        action: "employee.deactivated",
        entityType: "employee",
        entityId: employee.id,
        metadata: { fullName: employee.fullName, userLinked: Boolean(linkedUser) },
      });
    });
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) {
      return { error: "El empleado no existe." };
    }
    if (error instanceof SelfDeactivationError) {
      return { error: "No puedes desactivarte a ti mismo." };
    }
    console.error("deactivateEmployeeForSession:", error);
    return { error: "No se pudo desactivar al empleado. Intenta de nuevo." };
  }

  // Best-effort, DESPUÉS de que la transacción ya confirmó — la
  // desactivación en DB (lo que requireOperationContext chequea en vivo)
  // ya protege sellar/canjear independientemente de si esto tiene éxito.
  if (authUserIdToBan) {
    const banResult = await banEmployeeAuth(authUserIdToBan).catch((error) => {
      console.error("deactivateEmployeeForSession: banEmployeeAuth:", error);
      return { ok: false };
    });
    if (!banResult.ok) {
      return {
        success:
          "Empleado desactivado. Advertencia: no se pudo bloquear su login — contacta soporte.",
      };
    }
  }

  return { success: "Empleado desactivado." };
}
