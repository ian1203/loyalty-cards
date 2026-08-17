import { and, eq, isNull } from "drizzle-orm";
import { auditLogs, platformImpersonationGrants, roles, users } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import type { PlatformRole } from "../../lib/supabase/session";

// Sin "use server" a propósito, mismo patrón que cualquier logic.ts de
// feature: recibe la identidad del admin ya resuelta por
// requirePlatformAdmin() como parámetro — en un archivo "use server"
// quedaría expuesta como endpoint invocable con una identidad forjada.
// Vive bajo app/admin/ (no lib/) porque ese árbol completo ya está exento
// del guard "cero @loyalty/db/admin fuera de /admin"
// (apps/web/tests/fase2-features.test.ts) — es, literalmente, la lógica de
// escritura del panel de admin, no un helper genérico.

export type AdminTransaction = Parameters<Parameters<typeof adminDb.transaction>[0]>[0];

// Red de seguridad ("dead man's switch") del grant — el mecanismo real de
// terminación es la acción explícita "salir de impersonación"
// (endImpersonation), NO este TTL. 24h da margen de sobra para una sesión
// de soporte real sin dejar un grant abierto para siempre si el admin
// cierra la laptop sin salir explícitamente.
const GRANT_SAFETY_NET_HOURS = 24;

// Email reconociblemente interno para la fila de `users` provisionada
// durante una impersonación de rol owner — NUNCA el email personal del
// admin (si algún día una vista lista `users` crudo de un negocio, esto se
// lee como "cuenta interna de la plataforma", no como una persona
// confundida con acceso). Estable POR ADMIN, no por grant: la misma fila
// se reactiva en impersonaciones futuras del mismo negocio en vez de crear
// una nueva cada vez (ver startImpersonation). Dominio .invalid (RFC 2606):
// nunca se resuelve, nunca se le manda correo real.
function impersonationUserEmail(adminAuthUserId: string): string {
  return `platform-admin+${adminAuthUserId}@pragmia-internal.invalid`;
}

// Termina TODO grant activo de este admin (debería ser a lo más uno — ver
// el invariante que startImpersonation mantiene) y desactiva, en la MISMA
// transacción, la fila de `users` provisionada de cada uno. Esa
// simultaneidad no es cosmética: el hook de auth
// (0029_platform_admin_impersonation_hook.sql) resuelve business_id/
// tenant_role de un admin sin grant activo a partir de si tiene una fila
// de `users` ACTIVA — si esta función terminara el grant sin desactivar la
// fila (o viceversa), el próximo login de ese admin recibiría claims de
// tenant "fantasma" del negocio que ya dejó de impersonar.
// Exportada: setPlatformAdminActive (accounts.ts) también debe llamarla al
// DESACTIVAR una cuenta de plataforma — un admin desactivado con un grant
// de impersonación todavía activo (nunca hizo "Salir", TTL de 24h todavía
// no venció) debe perder ese acceso EN EL MISMO MOMENTO que se le
// desactiva la cuenta, no seguir con la fila de `users` provisionada
// activa hasta que él mismo (ya desactivado) o alguien más la cierre a
// mano. Ver el hallazgo de seguridad que motivó esto: sin este llamado, el
// hook de auth (0029...sql) resuelve esa fila `users` huérfana como una
// sesión de tenant real (`role: owner`, `impersonation: null`,
// indistinguible del dueño real) en el siguiente login/refresh del admin
// ya desactivado.
export async function endActiveGrantsForAdmin(
  tx: AdminTransaction,
  adminAuthUserId: string,
  reason: string,
): Promise<void> {
  const activeGrants = await tx
    .select()
    .from(platformImpersonationGrants)
    .where(
      and(
        eq(platformImpersonationGrants.platformAdminAuthUserId, adminAuthUserId),
        isNull(platformImpersonationGrants.endedAt),
      ),
    );

  for (const grant of activeGrants) {
    await tx
      .update(platformImpersonationGrants)
      .set({ endedAt: new Date() })
      .where(eq(platformImpersonationGrants.id, grant.id));

    if (grant.impersonatedUsersId) {
      await tx
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, grant.impersonatedUsersId));
    }

    await tx.insert(auditLogs).values({
      businessId: grant.businessId,
      actorAuthUserId: adminAuthUserId,
      action: "impersonation.ended",
      entityType: "business",
      entityId: grant.businessId,
      metadata: { reason, grantId: grant.id },
    });
  }
}

// Inicia impersonación de `targetBusinessId` para el admin dado, con el
// rol de plataforma que YA tiene (no es una elección del caller: un admin
// viewer siempre impersona en modo lectura, un owner siempre en modo
// completo — ver getVerifiedSession/requirePlatformAdmin).
export async function startImpersonation(
  adminAuthUserId: string,
  adminPlatformRole: PlatformRole,
  targetBusinessId: string,
): Promise<void> {
  await adminDb.transaction(async (tx) => {
    // Invariante que el hook de auth necesita: a lo más UN grant activo
    // por admin a la vez (y por lo tanto, a lo más una fila de `users`
    // activa para ese auth_user_id). Terminar cualquier grant previo
    // ANTES de crear el nuevo, en la misma transacción.
    await endActiveGrantsForAdmin(tx, adminAuthUserId, "nueva impersonación iniciada");

    let impersonatedUsersId: string | null = null;

    if (adminPlatformRole === "owner") {
      const [existing] = await tx
        .select()
        .from(users)
        .where(and(eq(users.authUserId, adminAuthUserId), eq(users.businessId, targetBusinessId)))
        .limit(1);

      if (existing) {
        // Reactiva la fila de una impersonación anterior de ESTE MISMO
        // negocio — nunca se borró (ver endActiveGrantsForAdmin), así que
        // cualquier reward/sucursal/promo que haya creado antes sigue
        // siendo el mismo actor real.
        await tx.update(users).set({ isActive: true }).where(eq(users.id, existing.id));
        impersonatedUsersId = existing.id;
      } else {
        const [ownerRole] = await tx.select().from(roles).where(eq(roles.name, "owner"));
        if (!ownerRole) {
          throw new Error("No existe el rol global 'owner' — revisa el seed de roles.");
        }
        const [created] = await tx
          .insert(users)
          .values({
            businessId: targetBusinessId,
            authUserId: adminAuthUserId,
            email: impersonationUserEmail(adminAuthUserId),
            roleId: ownerRole.id,
            fullName: "Acceso de soporte de Pragmia",
          })
          .returning();
        impersonatedUsersId = created.id;
      }
    }
    // Rol viewer: impersonatedUsersId se queda null a propósito — nunca se
    // provisiona fila de users, así que resolveActor/requireOperationContext
    // no encuentran actor y cualquier escritura falla estructuralmente (ver
    // esos dos archivos, más el guard explícito que además tienen).

    const [grant] = await tx
      .insert(platformImpersonationGrants)
      .values({
        platformAdminAuthUserId: adminAuthUserId,
        businessId: targetBusinessId,
        platformRoleAtGrantTime: adminPlatformRole,
        impersonatedUsersId,
        expiresAt: new Date(Date.now() + GRANT_SAFETY_NET_HOURS * 60 * 60 * 1000),
      })
      .returning();

    await tx.insert(auditLogs).values({
      businessId: targetBusinessId,
      actorAuthUserId: adminAuthUserId,
      action: "impersonation.started",
      entityType: "business",
      entityId: targetBusinessId,
      metadata: { platformRole: adminPlatformRole, grantId: grant.id },
    });
  });
}

export async function endImpersonation(adminAuthUserId: string): Promise<void> {
  await adminDb.transaction(async (tx) => {
    await endActiveGrantsForAdmin(
      tx,
      adminAuthUserId,
      "el admin terminó la sesión de impersonación",
    );
  });
}
