import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { auditLogs, users, type TenantTransaction } from "@loyalty/db";
import type { VerifiedSession } from "./supabase/session";

// Primitivos tenant-scoped que usan TODAS las rutas de feature (/rewards,
// /customers, …). Complementan a withTenantContext() (que fija el contexto
// RLS): estos estandarizan el "cinturón y tirantes" — filtro explícito por
// business_id a nivel de app — y los dos patrones que la revisión de
// seguridad exige en cada feature: lecturas por id sin IDOR y audit logs
// con el actor correcto.

export type TenantSession = Extract<VerifiedSession, { kind: "tenant_user" }>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Tabla tenant: toda tabla de negocio tiene id + business_id (regla de
// CLAUDE.md). El tipo exige ambas columnas presentes en el objeto Drizzle.
type TenantTable = PgTable & { id: PgColumn; businessId: PgColumn };

// Lectura por id SIN IDOR, estandarizada: el id SIEMPRE se combina con el
// business_id de la sesión verificada. Un id de otro negocio devuelve null
// — exactamente igual que un id inexistente o malformado, sin oráculo de
// existencia. La página convierte null en notFound().
export async function findInTenant<T extends TenantTable>(
  tx: TenantTransaction,
  session: TenantSession,
  table: T,
  id: string,
): Promise<InferSelectModel<T> | null> {
  if (!isUuid(id)) {
    // Malformado = inexistente. Ni siquiera toca la DB (un cast ::uuid
    // inválido lanzaría y terminaría en un 500 distinguible).
    return null;
  }

  const rows = (await tx
    .select()
    .from(table as PgTable)
    .where(and(eq(table.id, id), eq(table.businessId, session.businessId)))
    .limit(1)) as InferSelectModel<T>[];

  return rows[0] ?? null;
}

// Resuelve la fila de public.users del actor de la sesión — necesaria para
// audit_logs.actor_user_id y created_by/updated_by, que llevan FK compuesta
// (id, business_id) → users. OJO: audit_logs.actor_auth_user_id NO sirve
// para actores de tenant (su FK apunta a platform_admins y rechazaría el
// auth id de un dueño/staff).
export async function resolveActor(
  tx: TenantTransaction,
  session: TenantSession,
): Promise<InferSelectModel<typeof users>> {
  const [actor] = await tx
    .select()
    .from(users)
    .where(
      and(
        eq(users.authUserId, session.authUserId),
        eq(users.businessId, session.businessId),
      ),
    )
    .limit(1);

  if (!actor) {
    // Una sesión de tenant válida siempre tiene fila en users (el hook la
    // exige para emitir los claims) — si no está, algo se corrompió entre
    // el login y ahora; mejor reventar la transacción que auditar sin actor.
    throw new Error("El actor de la sesión no existe en users para este negocio.");
  }
  return actor;
}

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

// Registra el cambio en audit_logs DENTRO de la misma transacción que lo
// hizo (si el cambio se revierte, el log también). actor_user_id = fila de
// users del actor; location_id viene del claim de la sesión (solo staff con
// sucursal asignada lo tiene).
export async function writeAuditLog(
  tx: TenantTransaction,
  session: TenantSession,
  actorUserId: string,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLogs).values({
    businessId: session.businessId,
    actorUserId,
    locationId: session.locationId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
  });
}
