import { desc, eq } from "drizzle-orm";
import { auditLogs, platformAdmins, users } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createAdminClient } from "../../lib/supabase/server";
import type { PlatformRole } from "../../lib/supabase/session";
import { endActiveGrantsForAdmin } from "./impersonation";

// Mismo criterio que businesses.ts (vive bajo app/admin/, sin "use
// server", recibe identidad/rol del admin como parámetro). createAdminClient()
// acá es la Admin API de Supabase Auth (crear auth.users real para un
// nuevo admin de plataforma), no adminDb/Postgres — misma superficie que
// ya usa app/admin/actions.ts para invitar dueños de negocio, extendida
// acá con el mismo criterio angosto ya establecido en
// apps/web/tests/prod-readiness.test.ts (un archivo más en el allowlist,
// con su propio motivo documentado).

function requireOwner(platformRole: PlatformRole): void {
  if (platformRole !== "owner") {
    throw new Error("Solo un admin de plataforma con rol owner puede gestionar cuentas.");
  }
}

export async function listPlatformAdmins() {
  const rows = await adminDb
    .select({
      authUserId: platformAdmins.authUserId,
      platformRole: platformAdmins.platformRole,
      isActive: platformAdmins.isActive,
      createdAt: platformAdmins.createdAt,
    })
    .from(platformAdmins)
    .orderBy(desc(platformAdmins.createdAt));

  // El email vive en auth.users (Supabase Auth), no en platform_admins —
  // se resuelve aparte vía Admin API (mismo patrón que cualquier lectura
  // de identidad de auth en este repo, nunca guardamos una copia propia).
  const admin = createAdminClient();
  const emailByAuthUserId = new Map<string, string>();
  for (const row of rows) {
    const { data } = await admin.auth.admin.getUserById(row.authUserId);
    if (data.user?.email) emailByAuthUserId.set(row.authUserId, data.user.email);
  }

  return rows.map((row) => ({ ...row, email: emailByAuthUserId.get(row.authUserId) ?? "—" }));
}

export async function invitePlatformAdmin(
  actingAdminAuthUserId: string,
  actingAdminPlatformRole: PlatformRole,
  email: string,
  platformRole: PlatformRole,
  siteUrl: string,
): Promise<void> {
  requireOwner(actingAdminPlatformRole);

  // Hallazgo real de una revisión ofensiva: invitar por error (o a
  // propósito) el email de un dueño/staff real de un negocio le da
  // is_platform_admin=true en su próximo login — getVerifiedSession()
  // (lib/supabase/session.ts) corta ahí primero, así que esa persona
  // pierde silenciosamente su acceso normal de tenant. Mismo bug ya
  // diagnosticado y corregido a mano esta sesión para
  // iancarlo1203@gmail.com en Chilaquikes — este chequeo evita que vuelva
  // a pasar por accidente.
  const [existingTenantUser] = await adminDb
    .select({ businessId: users.businessId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingTenantUser) {
    throw new Error(
      `${email} ya es dueño/staff de un negocio (business_id ${existingTenantUser.businessId}) — invitarlo como admin de plataforma le quitaría su acceso normal de tenant en su próximo login. Desactiva esa membresía primero si esto es intencional.`,
    );
  }

  const supabaseAdmin = createAdminClient();
  const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/set-password`,
  });
  if (invite.error || !invite.data.user) {
    throw new Error(`No se pudo invitar a la cuenta: ${invite.error?.message ?? "error desconocido"}`);
  }

  const newAdminAuthUserId = invite.data.user.id;

  try {
    await adminDb
      .insert(platformAdmins)
      .values({ authUserId: newAdminAuthUserId, platformRole, isActive: true });

    // business_id null a propósito — ver el comentario en
    // packages/db/src/schema/auditLogs.ts (gestión de cuentas de
    // plataforma, sin ningún negocio al que asociarla).
    await adminDb.insert(auditLogs).values({
      businessId: null,
      actorAuthUserId: actingAdminAuthUserId,
      action: "platform_admin.invited",
      entityType: "platform_admin",
      entityId: newAdminAuthUserId,
      metadata: { email, platformRole },
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(newAdminAuthUserId).catch(() => {
      // Best-effort, mismo criterio que createBusinessAction.
    });
    throw error;
  }
}

export async function setPlatformAdminActive(
  actingAdminAuthUserId: string,
  actingAdminPlatformRole: PlatformRole,
  targetAuthUserId: string,
  isActive: boolean,
): Promise<void> {
  requireOwner(actingAdminPlatformRole);

  if (targetAuthUserId === actingAdminAuthUserId && !isActive) {
    throw new Error("No puedes desactivar tu propia cuenta de plataforma.");
  }

  await adminDb.transaction(async (tx) => {
    await tx
      .update(platformAdmins)
      .set({ isActive })
      .where(eq(platformAdmins.authUserId, targetAuthUserId));

    // Hallazgo de seguridad real: desactivar la CUENTA no terminaba
    // ningún grant de impersonación en curso de ese admin — si nunca hizo
    // "Salir" (o el TTL de 24h todavía no venció), la fila de `users`
    // provisionada seguía activa y el hook de auth (0029...sql) la
    // resolvía como una sesión de tenant real (role: owner,
    // impersonation: null) en su siguiente login/refresh — acceso
    // completo indefinido al negocio impersonado, indistinguible del
    // dueño real, pese a que la cuenta de plataforma ya está desactivada.
    // Misma transacción que el UPDATE de arriba: si esto falla, la
    // desactivación tampoco queda a medias.
    if (!isActive) {
      await endActiveGrantsForAdmin(tx, targetAuthUserId, "cuenta de plataforma desactivada");
    }

    await tx.insert(auditLogs).values({
      businessId: null,
      actorAuthUserId: actingAdminAuthUserId,
      action: isActive ? "platform_admin.activated" : "platform_admin.deactivated",
      entityType: "platform_admin",
      entityId: targetAuthUserId,
      metadata: {},
    });
  });
}

export async function changePlatformAdminRole(
  actingAdminAuthUserId: string,
  actingAdminPlatformRole: PlatformRole,
  targetAuthUserId: string,
  platformRole: PlatformRole,
): Promise<void> {
  requireOwner(actingAdminPlatformRole);

  if (targetAuthUserId === actingAdminAuthUserId && platformRole !== "owner") {
    throw new Error("No puedes quitarte tu propio rol owner.");
  }

  await adminDb
    .update(platformAdmins)
    .set({ platformRole })
    .where(eq(platformAdmins.authUserId, targetAuthUserId));

  await adminDb.insert(auditLogs).values({
    businessId: null,
    actorAuthUserId: actingAdminAuthUserId,
    action: "platform_admin.role_changed",
    entityType: "platform_admin",
    entityId: targetAuthUserId,
    metadata: { platformRole },
  });
}
