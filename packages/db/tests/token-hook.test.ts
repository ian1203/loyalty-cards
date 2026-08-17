import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "../src/client";
import {
  businesses,
  employees,
  locations,
  platformAdmins,
  platformImpersonationGrants,
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
    // La fixture inserta platformAdmins sin especificar rol — el default de
    // DB es 'owner' (ver ALTER TABLE ... DEFAULT 'owner' en 0028 y el
    // comentario en platformAdmins.ts), así que el claim debe traer el rol
    // real, no null. Sin ningún grant de impersonación para este admin, los
    // tres claims de impersonación deben quedar null.
    expect(claims.platform_role).toBe("owner");
    expect(claims.impersonating_platform_admin_id).toBeNull();
    expect(claims.impersonating_platform_role).toBeNull();
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

// Ver 0029_platform_admin_impersonation_hook.sql: extiende el hook para
// resolver business_id/tenant_role/location_id desde
// platform_impersonation_grants cuando un platform admin está impersonando
// un negocio, más los claims nuevos platform_role/
// impersonating_platform_admin_id/impersonating_platform_role. Describe
// separado del de arriba, con su propio negocio destino (compartido entre
// los `it`, nunca mutado) y un admin+grant nuevo POR TEST (creados y
// limpiados dentro de cada `it`, no en beforeAll/afterAll) — cada escenario
// necesita una combinación distinta de is_active/platform_role/expires_at/
// ended_at, así que un fixture único y compartido obligaría a mutar estado
// entre tests o a siempre insertar/borrar de todas formas.
describe("custom_access_token_hook — impersonación de negocio por un platform admin", () => {
  const impSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let targetBusinessId: string;
  let ownerRoleId: string;

  // Misma función que en el describe de arriba — local a este describe
  // porque el `callHook` original está encerrado en el suyo, no en scope de
  // módulo.
  async function callHook(event: unknown): Promise<Record<string, unknown>> {
    const result = await adminDb.execute<{ hook_result: Record<string, unknown> }>(
      sql`select public.custom_access_token_hook(${JSON.stringify(event)}::jsonb) as hook_result`,
    );
    return result.rows[0]!.hook_result;
  }

  beforeAll(async () => {
    const [ownerRole] = await adminDb.select().from(roles).where(eq(roles.name, "owner"));
    if (!ownerRole) {
      throw new Error("Falta el rol global 'owner' — revisa el seed.");
    }
    ownerRoleId = ownerRole.id;

    const [business] = await adminDb
      .insert(businesses)
      .values({
        name: `Hook Impersonation Test ${impSuffix}`,
        slug: `hook-imp-test-${impSuffix}`,
      })
      .returning();
    targetBusinessId = business.id;
  });

  afterAll(async () => {
    // Cada `it` ya limpió su propio admin/grant/fila de users vía
    // cleanupPlatformAdmin — esto solo tira el negocio destino compartido.
    await adminDb.delete(businesses).where(eq(businesses.id, targetBusinessId));
  });

  // Crea un auth.users real + su fila en platform_admins. Retorna el
  // auth_user_id para usarlo como user_id del hook.
  async function createPlatformAdmin(opts: {
    platformRole?: "owner" | "viewer";
    isActive?: boolean;
  }): Promise<string> {
    const authUserId = crypto.randomUUID();
    await adminDb.execute(
      sql`insert into auth.users (id) values (${authUserId}) on conflict do nothing`,
    );
    await adminDb.insert(platformAdmins).values({
      authUserId,
      platformRole: opts.platformRole ?? "owner",
      isActive: opts.isActive ?? true,
    });
    return authUserId;
  }

  // Orden de borrado por las FKs: el grant referencia tanto a
  // platform_admins como (compuesto) a users; la fila de users provisionada
  // referencia auth.users vía auth_user_id.
  async function cleanupPlatformAdmin(authUserId: string): Promise<void> {
    await adminDb
      .delete(platformImpersonationGrants)
      .where(eq(platformImpersonationGrants.platformAdminAuthUserId, authUserId));
    await adminDb.delete(users).where(eq(users.authUserId, authUserId));
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, authUserId));
    await adminDb.execute(sql`delete from auth.users where id = ${authUserId}`);
  }

  it("grant activo (rol owner, con fila real de users) resuelve business_id/tenant_role/location_id del negocio impersonado", async () => {
    const adminAuthUserId = await createPlatformAdmin({ platformRole: "owner" });
    try {
      const [impersonatedUser] = await adminDb
        .insert(users)
        .values({
          businessId: targetBusinessId,
          authUserId: adminAuthUserId,
          email: `hook-imp-owner-${impSuffix}@test.dev`,
          roleId: ownerRoleId,
        })
        .returning();

      await adminDb.insert(platformImpersonationGrants).values({
        platformAdminAuthUserId: adminAuthUserId,
        businessId: targetBusinessId,
        platformRoleAtGrantTime: "owner",
        impersonatedUsersId: impersonatedUser.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const event = await callHook({
        user_id: adminAuthUserId,
        claims: { role: "authenticated" },
      });
      const claims = event.claims as Record<string, unknown>;

      expect(claims.is_platform_admin).toBe(true);
      expect(claims.platform_role).toBe("owner");
      expect(claims.business_id).toBe(targetBusinessId);
      expect(claims.tenant_role).toBe("owner");
      expect(claims.location_id).toBeNull();
      expect(claims.impersonating_platform_admin_id).toBe(adminAuthUserId);
      expect(claims.impersonating_platform_role).toBe("owner");
    } finally {
      await cleanupPlatformAdmin(adminAuthUserId);
    }
  });

  it("grant activo (rol viewer, SIN fila de users) igual resuelve business_id/tenant_role desde el grant — el hook no depende de una fila de users", async () => {
    const adminAuthUserId = await createPlatformAdmin({ platformRole: "viewer" });
    try {
      // A propósito: NO se inserta fila en `users` — un grant viewer nunca
      // provisiona una (ver comentario de impersonatedUsersId en
      // platformImpersonationGrants.ts). Si el hook dependiera de esa fila
      // para resolver business_id/tenant_role, este test fallaría con
      // ambos en null pese al grant activo.
      await adminDb.insert(platformImpersonationGrants).values({
        platformAdminAuthUserId: adminAuthUserId,
        businessId: targetBusinessId,
        platformRoleAtGrantTime: "viewer",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const event = await callHook({
        user_id: adminAuthUserId,
        claims: { role: "authenticated" },
      });
      const claims = event.claims as Record<string, unknown>;

      expect(claims.is_platform_admin).toBe(true);
      expect(claims.business_id).toBe(targetBusinessId);
      expect(claims.tenant_role).toBe("owner");
      expect(claims.location_id).toBeNull();
      expect(claims.impersonating_platform_admin_id).toBe(adminAuthUserId);
      expect(claims.impersonating_platform_role).toBe("viewer");
    } finally {
      await cleanupPlatformAdmin(adminAuthUserId);
    }
  });

  it("grant expirado (expires_at en el pasado, ended_at null) se ignora — sin claims de impersonación ni de tenant", async () => {
    const adminAuthUserId = await createPlatformAdmin({ platformRole: "owner" });
    try {
      await adminDb.insert(platformImpersonationGrants).values({
        platformAdminAuthUserId: adminAuthUserId,
        businessId: targetBusinessId,
        platformRoleAtGrantTime: "owner",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const event = await callHook({
        user_id: adminAuthUserId,
        claims: { role: "authenticated" },
      });
      const claims = event.claims as Record<string, unknown>;

      expect(claims.is_platform_admin).toBe(true);
      expect(claims.impersonating_platform_admin_id).toBeNull();
      expect(claims.impersonating_platform_role).toBeNull();
      // Sin grant vigente y sin ninguna fila de users activa para este
      // admin, el hook cae al camino normal de "sin tenant".
      expect(claims.business_id).toBeNull();
      expect(claims.tenant_role).toBeNull();
    } finally {
      await cleanupPlatformAdmin(adminAuthUserId);
    }
  });

  it("grant terminado (ended_at en el pasado) se ignora sin importar expires_at — sin claims de impersonación ni de tenant", async () => {
    const adminAuthUserId = await createPlatformAdmin({ platformRole: "owner" });
    try {
      await adminDb.insert(platformImpersonationGrants).values({
        platformAdminAuthUserId: adminAuthUserId,
        businessId: targetBusinessId,
        platformRoleAtGrantTime: "owner",
        // expires_at deliberadamente todavía en el futuro — ended_at debe
        // ganar de todas formas.
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        endedAt: new Date(Date.now() - 60 * 1000),
      });

      const event = await callHook({
        user_id: adminAuthUserId,
        claims: { role: "authenticated" },
      });
      const claims = event.claims as Record<string, unknown>;

      expect(claims.is_platform_admin).toBe(true);
      expect(claims.impersonating_platform_admin_id).toBeNull();
      expect(claims.impersonating_platform_role).toBeNull();
      expect(claims.business_id).toBeNull();
      expect(claims.tenant_role).toBeNull();
    } finally {
      await cleanupPlatformAdmin(adminAuthUserId);
    }
  });

  it("platform admin desactivado (is_active = false) no recibe ningún claim de plataforma ni de impersonación, aunque tenga un grant activo", async () => {
    const adminAuthUserId = await createPlatformAdmin({ platformRole: "owner", isActive: false });
    try {
      await adminDb.insert(platformImpersonationGrants).values({
        platformAdminAuthUserId: adminAuthUserId,
        businessId: targetBusinessId,
        platformRoleAtGrantTime: "owner",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const event = await callHook({
        user_id: adminAuthUserId,
        claims: { role: "authenticated" },
      });
      const claims = event.claims as Record<string, unknown>;

      // El offboarding de la CUENTA de plataforma corta todo, incluida
      // cualquier impersonación en curso — se comporta como si nunca
      // hubiera sido admin.
      expect(claims.is_platform_admin).toBe(false);
      expect(claims.platform_role).toBeNull();
      expect(claims.impersonating_platform_admin_id).toBeNull();
      expect(claims.impersonating_platform_role).toBeNull();
      expect(claims.business_id).toBeNull();
      expect(claims.tenant_role).toBeNull();
    } finally {
      await cleanupPlatformAdmin(adminAuthUserId);
    }
  });
});
