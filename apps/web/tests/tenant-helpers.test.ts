import type { CookieMethodsServer } from "@supabase/ssr";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  customers,
  platformAdmins,
  users,
  withTenantContext,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { findInTenant, isUuid, resolveActor, writeAuditLog } from "../lib/tenant";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Paso 1 de Fase 2: el primitivo tenant-scoped que usan todas las features.
// Se prueba con una sesión REAL (login real → claims reales del hook), no
// con un business_id de fixture casteado — el mismo camino que recorre una
// página de producción.
describe("lib/tenant — primitivos tenant-scoped", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "tenant-helpers-test-password-1";

  let platformAdminAuthUserId: string;
  let ownerAAuthUserId: string;
  let ownerBAuthUserId: string;
  let businessAId: string;
  let businessBId: string;
  let customerAId: string;
  let customerBId: string;
  let ownerACookies: CookieMethodsServer;
  let sessionA: TenantSession;

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(
      `tenant-helpers-admin-${suffix}@test.dev`,
      password,
    );

    const a = await createBusinessWithRealOwner({
      businessName: `Tenant Helpers A ${suffix}`,
      slug: `tenant-helpers-a-${suffix}`,
      ownerEmail: `tenant-helpers-owner-a-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessAId = a.business.id;
    ownerAAuthUserId = a.ownerAuthUserId;

    const b = await createBusinessWithRealOwner({
      businessName: `Tenant Helpers B ${suffix}`,
      slug: `tenant-helpers-b-${suffix}`,
      ownerEmail: `tenant-helpers-owner-b-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessBId = b.business.id;
    ownerBAuthUserId = b.ownerAuthUserId;

    const [customerA] = await adminDb
      .insert(customers)
      .values({ businessId: businessAId, fullName: "Cliente A", walletToken: `th-a-${suffix}` })
      .returning();
    customerAId = customerA.id;
    const [customerB] = await adminDb
      .insert(customers)
      .values({ businessId: businessBId, fullName: "Cliente B", walletToken: `th-b-${suffix}` })
      .returning();
    customerBId = customerB.id;

    ownerACookies = await signInAsCookieJar(
      `tenant-helpers-owner-a-${suffix}@test.dev`,
      password,
    );
    const maybeSession = await requireTenantSession(ownerACookies);
    if (!maybeSession) throw new Error("sesión A inválida");
    sessionA = maybeSession;
  });

  afterAll(async () => {
    for (const businessId of [businessAId, businessBId]) {
      await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
      await adminDb.delete(customers).where(eq(customers.businessId, businessId));
      await adminDb.delete(users).where(eq(users.businessId, businessId));
      await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    }
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerAAuthUserId);
    await admin.auth.admin.deleteUser(ownerBAuthUserId);
    await admin.auth.admin.deleteUser(platformAdminAuthUserId);
  });

  it("isUuid rechaza basura y acepta UUIDs válidos", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("findInTenant devuelve el recurso propio", async () => {
    const row = await withTenantContext(sessionA.businessId, (tx) =>
      findInTenant(tx, sessionA, customers, customerAId),
    );
    expect(row?.id).toBe(customerAId);
    expect(row?.fullName).toBe("Cliente A");
  });

  it("findInTenant con el id de OTRO negocio devuelve null — idéntico a un id inexistente (sin oráculo IDOR)", async () => {
    const ajeno = await withTenantContext(sessionA.businessId, (tx) =>
      findInTenant(tx, sessionA, customers, customerBId),
    );
    const inexistente = await withTenantContext(sessionA.businessId, (tx) =>
      findInTenant(tx, sessionA, customers, "00000000-0000-0000-0000-0000000000aa"),
    );

    expect(ajeno).toBeNull();
    expect(inexistente).toBeNull();
    // Mismo resultado exacto: null y null — nada distingue "existe en otro
    // tenant" de "no existe".
    expect(ajeno).toEqual(inexistente);
  });

  it("findInTenant con id malformado devuelve null sin tocar la DB (sin 500 por cast inválido)", async () => {
    const row = await withTenantContext(sessionA.businessId, (tx) =>
      findInTenant(tx, sessionA, customers, "'; drop table customers; --"),
    );
    expect(row).toBeNull();
  });

  it("resolveActor devuelve la fila de users del dueño de la sesión", async () => {
    const actor = await withTenantContext(sessionA.businessId, (tx) =>
      resolveActor(tx, sessionA),
    );
    expect(actor.authUserId).toBe(ownerAAuthUserId);
    expect(actor.businessId).toBe(businessAId);
  });

  it("writeAuditLog inserta con actor_user_id (nunca actor_auth_user_id) en la misma transacción", async () => {
    await withTenantContext(sessionA.businessId, async (tx) => {
      const actor = await resolveActor(tx, sessionA);
      await writeAuditLog(tx, sessionA, actor.id, {
        action: "test.helper",
        entityType: "customer",
        entityId: customerAId,
        metadata: { prueba: true },
      });
    });

    // El alta del negocio en el setup ya dejó su propio "business.created"
    // — filtrar por la acción de ESTE test.
    const [log] = await adminDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "test.helper"));

    expect(log?.businessId).toBe(businessAId);
    expect(log?.actorUserId).not.toBeNull();
    expect(log?.actorAuthUserId).toBeNull();
    expect(log?.entityId).toBe(customerAId);
  });
});
