// OJO: este archivo NO lleva "use server" — mismo motivo que en /rewards y
// /customers: estas funciones reciben la sesión como parámetro y en un
// archivo "use server" quedarían expuestas como endpoints invocables con
// una sesión forjada. Solo actions.ts (que resuelve la sesión desde cookies
// verificadas) y los tests las llaman.
import { randomInt } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { employees, locations, roles, users, withTenantContext, type TenantTransaction } from "@loyalty/db";
import { banEmployeeAuth } from "../../../lib/employeeOffboarding";
// createAdminClient() acá es la MISMA excepción angosta que ya usa
// employeeOffboarding.ts (Supabase Auth Admin API, no adminDb/Postgres):
// dar de alta un staff real exige una cuenta real de auth.users, y no hay
// flujo de invitación por email para staff (a diferencia del alta de dueño
// en /admin) — el password se genera localmente en createStaffForSession.
// Este archivo está en el allowlist de
// apps/web/tests/prod-readiness.test.ts (ALLOWED_CREATE_ADMIN_CLIENT_IMPORTERS).
import { createAdminClient } from "../../../lib/supabase/server";
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

const MAX_STAFF_NAME_LENGTH = 120;
const MAX_STAFF_EMAIL_LENGTH = 254;
const STAFF_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateStaffActionState = TeamActionState & {
  // Viaja UNA SOLA VEZ en el estado devuelto por la Server Action — nunca
  // se persiste ni se loguea. La UI lo muestra con una nota de "cópialo
  // ahora" y no vuelve a aparecer tras el siguiente submit.
  credentials?: { email: string; password: string; fullName: string };
};

// Mismo generador que apps/web/scripts/create-chilaquikes-employees.ts /
// create-iriz-style-staff.ts: 8 caracteres, mayúscula+minúscula+dígito+
// símbolo garantizados, sin glifos ambiguos (I/l/1/O/0).
function generateStaffPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 8) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

class DuplicateStaffEmailError extends Error {}
class InvalidStaffLocationError extends Error {}

// Alta de staff: MISMO gate que desactivar (ownerGateError — owner/admin,
// staff rebotado). Es también el camino que un platform admin
// impersonando "owner" de un negocio ajeno usa para dar de alta staff en
// el negocio que está soportando — misma sesión tenant_user, sin ningún
// código nuevo en /admin.
//
// Sin flujo de invitación por email (a diferencia del alta de DUEÑO en
// /admin, que sí invita vía inviteUserByEmail): el password se genera
// LOCALMENTE (generateStaffPassword) y viaja una sola vez en el estado
// devuelto para que la UI se lo muestre al dueño, que se lo pasa al
// empleado por su cuenta.
export async function createStaffForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<CreateStaffActionState> {
  const gateError = ownerGateError(session);
  if (gateError || !session) return { error: gateError ?? "No autorizado." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName || fullName.length > MAX_STAFF_NAME_LENGTH) {
    return { error: "El nombre es obligatorio (máx. 120 caracteres)." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > MAX_STAFF_EMAIL_LENGTH || !STAFF_EMAIL_RE.test(email)) {
    return { error: "El email es obligatorio y debe tener un formato válido." };
  }

  const rawLocationId = String(formData.get("primaryLocationId") ?? "").trim();

  // Pre-chequeos DENTRO del tenant, ANTES de crear ningún auth.users real:
  // Supabase Auth exige email único a nivel de proyecto, así que crear la
  // cuenta primero y descubrir el duplicado/sucursal inválida después
  // dejaría una cuenta huérfana sin necesidad. resolveActor corre primero
  // acá también — mismo motivo que en cualquier logic.ts de feature: sin
  // actor real no hay a quién auditar como creador. El pre-chequeo de
  // dedupe es cortesía de UX (mismo criterio que createCustomerForSession);
  // el backstop real sigue siendo el UNIQUE (business_id, email) de
  // `users`, atrapado más abajo.
  let primaryLocationId: string | null = null;
  try {
    await withTenantContext(session.businessId, async (tx) => {
      await resolveActor(tx, session);

      const [dup] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.businessId, session.businessId), eq(users.email, email)))
        .limit(1);
      if (dup) throw new DuplicateStaffEmailError();

      if (rawLocationId) {
        const location = await findInTenant(tx, session, locations, rawLocationId);
        if (!location) throw new InvalidStaffLocationError();
        primaryLocationId = location.id;
      }
    });
  } catch (error) {
    if (error instanceof DuplicateStaffEmailError) {
      return { error: "Ya existe un usuario con ese email en tu negocio." };
    }
    if (error instanceof InvalidStaffLocationError) {
      return { error: "La sucursal seleccionada no es válida." };
    }
    console.error("createStaffForSession (pre-check):", error);
    return { error: "No se pudo dar de alta al empleado. Intenta de nuevo." };
  }

  const password = generateStaffPassword();
  const supabaseAdmin = createAdminClient();
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    return {
      error: `No se pudo crear la cuenta: ${created.error?.message ?? "error desconocido"}`,
    };
  }
  const authUserId = created.data.user.id;

  try {
    await withTenantContext(session.businessId, async (tx) => {
      const actor = await resolveActor(tx, session);

      const [staffRole] = await tx.select().from(roles).where(eq(roles.name, "staff")).limit(1);
      if (!staffRole) {
        throw new Error("No existe el rol global 'staff' — revisa el seed de roles.");
      }

      const [userRow] = await tx
        .insert(users)
        .values({
          businessId: session.businessId,
          authUserId,
          email,
          roleId: staffRole.id,
          fullName,
        })
        .returning();

      const [employee] = await tx
        .insert(employees)
        .values({
          businessId: session.businessId,
          userId: userRow.id,
          primaryLocationId,
          fullName,
        })
        .returning();

      await writeAuditLog(tx, session, actor.id, {
        action: "staff.created",
        entityType: "employee",
        entityId: employee.id,
        metadata: { email, primaryLocationId },
      });
    });
  } catch (error) {
    // Compensación best-effort — mismo patrón que createBusinessAction en
    // app/admin/actions.ts: el auth.users ya se creó, si el resto falla no
    // lo dejamos huérfano.
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {
      // Best-effort: si ni siquiera esto funciona, queda un auth.users
      // huérfano visible en Studio para limpieza manual.
    });

    // Backstop real de la carrera del pre-chequeo de arriba (dos altas casi
    // simultáneas del mismo email dentro del mismo negocio) — mismo
    // desempaquetado que createCustomerForSession/enrollCustomerPublic.
    const cause = (error as { cause?: unknown }).cause;
    const code = (cause as { code?: string })?.code ?? (error as { code?: string }).code;
    if (code === "23505") {
      return { error: "Ya existe un usuario con ese email en tu negocio." };
    }

    console.error("createStaffForSession:", error);
    return { error: "No se pudo dar de alta al empleado. Intenta de nuevo." };
  }

  return {
    success: `Empleado "${fullName}" dado de alta.`,
    credentials: { email, password, fullName },
  };
}
