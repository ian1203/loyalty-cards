import { desc, eq, isNotNull } from "drizzle-orm";
import { auditLogs, businesses } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createAdminClient } from "../../lib/supabase/server";

// Hallazgo real de una revisión ofensiva: las acciones sensibles de
// plataforma (impersonar, cambiar estado de un negocio, gestionar
// cuentas) ya quedaban en audit_logs, pero NINGUNA vista las mostraba —
// era auditoría write-only, indistinguible de no tener auditoría en
// absoluto. Esta es la primera lectura real: últimos N eventos con
// actor_auth_user_id (acciones de plataforma, nunca de tenant — ver
// resolveActor/writeAuditLog, que usan actor_user_id), con el email del
// admin y el nombre del negocio ya resueltos.
const RECENT_ACTIVITY_LIMIT = 30;

export type PlatformActivityRow = {
  id: string;
  action: string;
  createdAt: Date;
  actorEmail: string;
  businessName: string | null;
  metadata: unknown;
};

export async function listRecentPlatformActivity(): Promise<PlatformActivityRow[]> {
  const rows = await adminDb
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      actorAuthUserId: auditLogs.actorAuthUserId,
      businessName: businesses.name,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(businesses, eq(auditLogs.businessId, businesses.id))
    .where(isNotNull(auditLogs.actorAuthUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(RECENT_ACTIVITY_LIMIT);

  // El email vive en auth.users, no en audit_logs — se resuelve aparte
  // vía Admin API (mismo patrón que listPlatformAdmins en accounts.ts),
  // pero UNA sola vez por actor único, no por fila, para no hacer N
  // llamadas repetidas cuando el mismo admin aparece varias veces en la
  // ventana reciente.
  const uniqueActorIds = [...new Set(rows.map((row) => row.actorAuthUserId).filter((id): id is string => !!id))];
  const admin = createAdminClient();
  const emailByAuthUserId = new Map<string, string>();
  for (const authUserId of uniqueActorIds) {
    const { data } = await admin.auth.admin.getUserById(authUserId);
    if (data.user?.email) emailByAuthUserId.set(authUserId, data.user.email);
  }

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    createdAt: row.createdAt,
    actorEmail: row.actorAuthUserId ? (emailByAuthUserId.get(row.actorAuthUserId) ?? "—") : "—",
    businessName: row.businessName,
    metadata: row.metadata,
  }));
}
