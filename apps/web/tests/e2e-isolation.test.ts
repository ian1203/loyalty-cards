import type { CookieMethodsServer } from "@supabase/ssr";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, businesses, platformAdmins, users, withTenantContext } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { getVerifiedSession } from "../lib/supabase/session";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Definición de "listo" de la Fase 1 (CLAUDE.md): un test que demuestra, con
// requests autenticadas de verdad (login real, JWT real firmado por
// Supabase Auth, claims reales del hook), que el dueño del Negocio A no
// puede leer NI ESCRIBIR datos del Negocio B. A diferencia del suite de
// aislamiento de Fase 0 (packages/db/tests/isolation.test.ts), que fija el
// contexto de tenant con un id de fixture casteado a mano, acá el
// business_id sale de getVerifiedSession() — el mismo código que corre en
// producción — a partir de una sesión real.

describe("Fase 1 — aislamiento de tenant de punta a punta (login real → sesión verificada → RLS)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "isolation-test-password-1";

  let platformAdminAuthUserId: string;
  let ownerAAuthUserId: string;
  let ownerBAuthUserId: string;
  let businessA: Awaited<ReturnType<typeof createBusinessWithRealOwner>>["business"];
  let businessB: Awaited<ReturnType<typeof createBusinessWithRealOwner>>["business"];
  let ownerACookies: CookieMethodsServer;
  let ownerBCookies: CookieMethodsServer;

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(
      `e2e-isolation-admin-${suffix}@test.dev`,
      password,
    );

    const ownerAEmail = `e2e-isolation-owner-a-${suffix}@test.dev`;
    const ownerBEmail = `e2e-isolation-owner-b-${suffix}@test.dev`;

    const ownerA = await createBusinessWithRealOwner({
      businessName: `E2E Isolation A ${suffix}`,
      slug: `e2e-isolation-a-${suffix}`,
      ownerEmail: ownerAEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessA = ownerA.business;
    ownerAAuthUserId = ownerA.ownerAuthUserId;

    const ownerB = await createBusinessWithRealOwner({
      businessName: `E2E Isolation B ${suffix}`,
      slug: `e2e-isolation-b-${suffix}`,
      ownerEmail: ownerBEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessB = ownerB.business;
    ownerBAuthUserId = ownerB.ownerAuthUserId;

    ownerACookies = await signInAsCookieJar(ownerAEmail, password);
    ownerBCookies = await signInAsCookieJar(ownerBEmail, password);
  });

  afterAll(async () => {
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessA.id));
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessB.id));
    await adminDb.delete(users).where(eq(users.businessId, businessA.id));
    await adminDb.delete(users).where(eq(users.businessId, businessB.id));
    await adminDb.delete(businesses).where(eq(businesses.id, businessA.id));
    await adminDb.delete(businesses).where(eq(businesses.id, businessB.id));
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    // auth.users al final: users/platform_admins llevan FK RESTRICT hacia
    // auth.users (ver packages/db/migrations/0010_supabase_auth_bridge.sql,
    // deliberado — no ON DELETE CASCADE), así que solo se puede borrar una
    // vez que ninguna fila de arriba lo referencia.
    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerAAuthUserId);
    await admin.auth.admin.deleteUser(ownerBAuthUserId);
    await admin.auth.admin.deleteUser(platformAdminAuthUserId);
  });

  it("el login real de cada dueño produce un business_id verificado que coincide con SU negocio", async () => {
    const sessionA = await getVerifiedSession(ownerACookies);
    const sessionB = await getVerifiedSession(ownerBCookies);

    if (!sessionA.authenticated || sessionA.kind !== "tenant_user") {
      throw new Error("sesión A inválida");
    }
    if (!sessionB.authenticated || sessionB.kind !== "tenant_user") {
      throw new Error("sesión B inválida");
    }

    expect(sessionA.businessId).toBe(businessA.id);
    expect(sessionA.role).toBe("owner");
    expect(sessionB.businessId).toBe(businessB.id);
    expect(sessionB.role).toBe("owner");
  });

  it("con la sesión real de A, withTenantContext solo devuelve el negocio de A", async () => {
    const sessionA = await getVerifiedSession(ownerACookies);
    if (!sessionA.authenticated || sessionA.kind !== "tenant_user") {
      throw new Error("sesión A inválida");
    }

    const rows = await withTenantContext(sessionA.businessId, (tx) =>
      tx.select().from(businesses),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(businessA.id);
  });

  it("con la sesión real de A, pedir el negocio de B por su id no filtra nada (RLS, no la app)", async () => {
    const sessionA = await getVerifiedSession(ownerACookies);
    if (!sessionA.authenticated || sessionA.kind !== "tenant_user") {
      throw new Error("sesión A inválida");
    }

    // Escenario de ataque real: algo en la capa de aplicación terminó
    // filtrando por el id de B (query param, body, bug) mientras el
    // contexto de tenant seguía siendo el de A, verificado desde la sesión.
    // RLS tiene que negarlo igual — es la defensa en profundidad, no debe
    // depender de que la app "se acuerde" de validar el id.
    const rows = await withTenantContext(sessionA.businessId, (tx) =>
      tx.select().from(businesses).where(eq(businesses.id, businessB.id)),
    );
    expect(rows).toHaveLength(0);
  });

  it("con la sesión real de B, el mismo patrón aísla en la dirección contraria", async () => {
    const sessionB = await getVerifiedSession(ownerBCookies);
    if (!sessionB.authenticated || sessionB.kind !== "tenant_user") {
      throw new Error("sesión B inválida");
    }

    const rows = await withTenantContext(sessionB.businessId, (tx) =>
      tx.select().from(businesses).where(eq(businesses.id, businessA.id)),
    );
    expect(rows).toHaveLength(0);
  });

  // CLAUDE.md pide explícitamente "ni escribir" datos de B, no solo lectura
  // — las aserciones de arriba solo cubren SELECT. Estas dos prueban que un
  // UPDATE con la sesión real de un dueño, apuntado (por bug o ataque) al id
  // del OTRO negocio, tampoco modifica nada.
  it("con la sesión real de A, un UPDATE contra el id del negocio de B no modifica nada", async () => {
    const sessionA = await getVerifiedSession(ownerACookies);
    if (!sessionA.authenticated || sessionA.kind !== "tenant_user") {
      throw new Error("sesión A inválida");
    }

    const updated = await withTenantContext(sessionA.businessId, (tx) =>
      tx
        .update(businesses)
        .set({ name: "Hijacked by A" })
        .where(eq(businesses.id, businessB.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const stillIntact = await adminDb
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessB.id));
    expect(stillIntact[0]?.name).toBe(businessB.name);
  });

  it("con la sesión real de B, un UPDATE contra el id del negocio de A no modifica nada", async () => {
    const sessionB = await getVerifiedSession(ownerBCookies);
    if (!sessionB.authenticated || sessionB.kind !== "tenant_user") {
      throw new Error("sesión B inválida");
    }

    const updated = await withTenantContext(sessionB.businessId, (tx) =>
      tx
        .update(businesses)
        .set({ name: "Hijacked by B" })
        .where(eq(businesses.id, businessA.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const stillIntact = await adminDb
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessA.id));
    expect(stillIntact[0]?.name).toBe(businessA.name);
  });
});
