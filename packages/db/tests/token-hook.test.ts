import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "../src/client";
import {
  businesses,
  employees,
  locations,
  platformAdmins,
  roles,
  users,
} from "../src/schema";

// Test DIRECTO de public.custom_access_token_hook (la función Postgres que
// GoTrue llama antes de firmar cada JWT — ver la migración
// 0010_supabase_auth_bridge.sql). Se invoca acá vía SQL con un `event`
// construido a mano, igual en forma al que manda GoTrue.
//
// Dos limitaciones deliberadas, y cómo queda cubierto lo que no se prueba
// acá:
// - Corre como el rol de adminDb, no como supabase_auth_admin (postgres no
//   tiene permiso de SET ROLE hacia ese rol reservado). Los GRANTs y
//   políticas de supabase_auth_admin quedan cubiertos por CADA login real
//   de la suite E2E de apps/web: GoTrue ejecuta este hook como
//   supabase_auth_admin en cada signInWithPassword — si esos grants se
//   rompieran, toda esa suite fallaría.
// - "Si el hook falla, no se emite token": el comportamiento de GoTrue ante
//   un hook que lanza error (o que devuelve claims inválidos) es devolver
//   500 y NO emitir token — observado empíricamente durante Fase 1, cuando
//   el hook sobrescribía el claim reservado "role" y cada login devolvía
//   {"code":"unexpected_failure","message":"output claims do not conform to
//   the expected schema"}. Acá se prueba la mitad que es nuestra: la
//   función LANZA ante input malformado en vez de tragarse el error y
//   devolver un event sin claims (que es lo que permitiría a GoTrue emitir
//   un token sin contexto de tenant).
describe("custom_access_token_hook — test directo de la función", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownerAuthUserId = crypto.randomUUID();
  const inactiveAuthUserId = crypto.randomUUID();
  const staffAuthUserId = crypto.randomUUID();
  const platformAdminAuthUserId = crypto.randomUUID();
  const orphanAuthUserId = crypto.randomUUID();

  let businessId: string;
  let locationId: string;

  async function callHook(event: unknown): Promise<Record<string, unknown>> {
    const result = await adminDb.execute<{ hook_result: Record<string, unknown> }>(
      sql`select public.custom_access_token_hook(${JSON.stringify(event)}::jsonb) as hook_result`,
    );
    return result.rows[0]!.hook_result;
  }

  beforeAll(async () => {
    for (const id of [
      ownerAuthUserId,
      inactiveAuthUserId,
      staffAuthUserId,
      platformAdminAuthUserId,
      orphanAuthUserId,
    ]) {
      await adminDb.execute(
        sql`insert into auth.users (id) values (${id}) on conflict do nothing`,
      );
    }

    const [ownerRole] = await adminDb.select().from(roles).where(eq(roles.name, "owner"));
    const [staffRole] = await adminDb.select().from(roles).where(eq(roles.name, "staff"));
    if (!ownerRole || !staffRole) {
      throw new Error("Faltan los roles globales 'owner'/'staff' — revisa el seed.");
    }

    const [business] = await adminDb
      .insert(businesses)
      .values({ name: `Hook Test ${suffix}`, slug: `hook-test-${suffix}` })
      .returning();
    businessId = business.id;

    const [location] = await adminDb
      .insert(locations)
      .values({ businessId, name: "Hook Test Location" })
      .returning();
    locationId = location.id;

    await adminDb.insert(users).values({
      businessId,
      authUserId: ownerAuthUserId,
      email: `hook-owner-${suffix}@test.dev`,
      roleId: ownerRole.id,
    });

    await adminDb.insert(users).values({
      businessId,
      authUserId: inactiveAuthUserId,
      email: `hook-inactive-${suffix}@test.dev`,
      roleId: ownerRole.id,
      isActive: false,
    });

    const [staffUser] = await adminDb
      .insert(users)
      .values({
        businessId,
        authUserId: staffAuthUserId,
        email: `hook-staff-${suffix}@test.dev`,
        roleId: staffRole.id,
      })
      .returning();
    await adminDb.insert(employees).values({
      businessId,
      userId: staffUser.id,
      primaryLocationId: locationId,
      fullName: "Hook Test Staff",
    });

    await adminDb.insert(platformAdmins).values({ authUserId: platformAdminAuthUserId });
  });

  afterAll(async () => {
    await adminDb.delete(employees).where(eq(employees.businessId, businessId));
    await adminDb.delete(users).where(eq(users.businessId, businessId));
    await adminDb.delete(locations).where(eq(locations.businessId, businessId));
    await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, platformAdminAuthUserId));
    for (const id of [
      ownerAuthUserId,
      inactiveAuthUserId,
      staffAuthUserId,
      platformAdminAuthUserId,
      orphanAuthUserId,
    ]) {
      await adminDb.execute(sql`delete from auth.users where id = ${id}`);
    }
  });

  it("usuario activo del negocio A recibe los claims de A (business_id, tenant_role)", async () => {
    const event = await callHook({
      user_id: ownerAuthUserId,
      claims: { role: "authenticated" },
    });
    const claims = event.claims as Record<string, unknown>;

    expect(claims.business_id).toBe(businessId);
    expect(claims.tenant_role).toBe("owner");
    expect(claims.is_platform_admin).toBe(false);
    expect(claims.location_id).toBeNull();
    // No pisa el claim reservado de GoTrue.
    expect(claims.role).toBe("authenticated");
  });

  it("empleado (staff con fila en employees) recibe además su location_id", async () => {
    const event = await callHook({
      user_id: staffAuthUserId,
      claims: { role: "authenticated" },
    });
    const claims = event.claims as Record<string, unknown>;

    expect(claims.business_id).toBe(businessId);
    expect(claims.tenant_role).toBe("staff");
    expect(claims.location_id).toBe(locationId);
  });

  it("platform admin recibe is_platform_admin: true y NINGÚN claim de tenant", async () => {
    const event = await callHook({
      user_id: platformAdminAuthUserId,
      claims: { role: "authenticated" },
    });
    const claims = event.claims as Record<string, unknown>;

    expect(claims.is_platform_admin).toBe(true);
    expect(claims.business_id).toBeNull();
    expect(claims.tenant_role).toBeNull();
  });

  it("usuario sin negocio (auth.users huérfano) queda sin claim de tenant y sin admin", async () => {
    const event = await callHook({
      user_id: orphanAuthUserId,
      claims: { role: "authenticated" },
    });
    const claims = event.claims as Record<string, unknown>;

    expect(claims.is_platform_admin).toBe(false);
    expect(claims.business_id).toBeNull();
    expect(claims.tenant_role).toBeNull();
  });

  it("usuario desactivado (is_active = false) queda sin claim de tenant aunque su fila exista", async () => {
    const event = await callHook({
      user_id: inactiveAuthUserId,
      claims: { role: "authenticated" },
    });
    const claims = event.claims as Record<string, unknown>;

    expect(claims.business_id).toBeNull();
    expect(claims.tenant_role).toBeNull();
  });

  it("claims ausentes o jsonb null no revientan: devuelve un objeto de claims válido igual", async () => {
    // GoTrue siempre manda claims, pero la función se defiende de ambas
    // variantes de "no hay claims" (clave ausente y jsonb null) — ver el
    // guard jsonb_typeof en la migración.
    const sinClave = await callHook({ user_id: orphanAuthUserId });
    expect((sinClave.claims as Record<string, unknown>).is_platform_admin).toBe(false);

    const nullExplicito = await callHook({ user_id: orphanAuthUserId, claims: null });
    expect((nullExplicito.claims as Record<string, unknown>).is_platform_admin).toBe(false);
  });

  it("input malformado (user_id no-uuid) LANZA — GoTrue no recibe un event sin claims que firmar", async () => {
    await expect(
      callHook({ user_id: "not-a-uuid", claims: { role: "authenticated" } }),
    ).rejects.toThrow();
  });
});
