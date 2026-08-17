import type { CookieMethodsServer } from "@supabase/ssr";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  loyaltyPrograms,
  platformAdmins,
  platformImpersonationGrants,
  users,
  withTenantContext,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { setPlatformAdminActive } from "../app/admin/accounts";
import { endImpersonation, startImpersonation } from "../app/admin/impersonation";
import { saveProgramForSession } from "../app/(product)/rewards/logic";
import { getVerifiedSession } from "../lib/supabase/session";
import { resolveActor } from "../lib/tenant";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  form,
  refreshSessionForCookieJar,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Prueba de sesión REAL (login real, JWT real) del mecanismo de
// impersonación de negocio del Panel de Admin de Plataforma
// (apps/web/app/admin/impersonation.ts) — mismo criterio que
// fase3-scanner.test.ts/e2e-isolation.test.ts: nunca mockear la sesión, el
// business_id/impersonation sale de getVerifiedSession() sobre un JWT
// firmado de verdad por el Supabase Auth local, con el custom access token
// hook resolviendo los claims de impersonación
// (0029_platform_admin_impersonation_hook.sql).
//
// startImpersonation/endImpersonation se llaman DIRECTO (no vía
// startImpersonationAction/endImpersonationAction, que dependen de cookies
// reales vía next/headers fuera de un request real) — mismo patrón que el
// resto de esta suite llama logic.ts en vez de pasar por el Server Action.

describe("Impersonación de negocio — Panel de Admin de Plataforma", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "admin-impersonation-test-password-1";

  let adminOwnerAuthUserId: string;
  let adminOwnerEmail: string;
  let adminViewerAuthUserId: string;
  let adminViewerEmail: string;

  let businessB: Awaited<ReturnType<typeof createBusinessWithRealOwner>>["business"];
  let ownerBAuthUserId: string;
  let ownerBEmail: string;

  beforeAll(async () => {
    adminOwnerEmail = `admin-imp-owner-${suffix}@test.dev`;
    adminOwnerAuthUserId = await createPlatformAdmin(adminOwnerEmail, password, "owner");

    adminViewerEmail = `admin-imp-viewer-${suffix}@test.dev`;
    adminViewerAuthUserId = await createPlatformAdmin(adminViewerEmail, password, "viewer");

    ownerBEmail = `admin-imp-owner-b-${suffix}@test.dev`;
    const b = await createBusinessWithRealOwner({
      businessName: `Admin Impersonation B ${suffix}`,
      slug: `admin-impersonation-b-${suffix}`,
      ownerEmail: ownerBEmail,
      ownerPassword: password,
      createdByAuthUserId: adminOwnerAuthUserId,
    });
    businessB = b.business;
    ownerBAuthUserId = b.ownerAuthUserId;
  });

  afterAll(async () => {
    // Cinturón y tirantes: por si algún test intermedio falló antes de
    // llegar al endImpersonation explícito, no dejar ningún grant activo
    // colgando (rompería el DELETE de abajo por las FKs).
    await endImpersonation(adminOwnerAuthUserId).catch(() => {});
    await endImpersonation(adminViewerAuthUserId).catch(() => {});

    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessB.id));
    // Acciones de gestión de cuentas (setPlatformAdminActive, etc.) auditan
    // con business_id NULL (ver packages/db/src/schema/auditLogs.ts) — el
    // delete de arriba no las cubre, y sin borrarlas la FK
    // audit_logs.actor_auth_user_id bloquea el delete de platform_admins de
    // abajo.
    await adminDb
      .delete(auditLogs)
      .where(inArray(auditLogs.actorAuthUserId, [adminOwnerAuthUserId, adminViewerAuthUserId]));
    await adminDb
      .delete(platformImpersonationGrants)
      .where(eq(platformImpersonationGrants.businessId, businessB.id));
    await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessB.id));
    await adminDb.delete(users).where(eq(users.businessId, businessB.id));
    await adminDb.delete(businesses).where(eq(businesses.id, businessB.id));
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, adminOwnerAuthUserId));
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, adminViewerAuthUserId));

    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerBAuthUserId);
    await admin.auth.admin.deleteUser(adminOwnerAuthUserId);
    await admin.auth.admin.deleteUser(adminViewerAuthUserId);
  });

  describe("Owner impersonando: acceso completo real", () => {
    let adminOwnerCookies: CookieMethodsServer;
    let session: Extract<
      Awaited<ReturnType<typeof getVerifiedSession>>,
      { kind: "tenant_user" }
    >;

    beforeAll(async () => {
      await startImpersonation(adminOwnerAuthUserId, "owner", businessB.id);
      adminOwnerCookies = await signInAsCookieJar(adminOwnerEmail, password);
      const resolved = await getVerifiedSession(adminOwnerCookies);
      if (!resolved.authenticated || resolved.kind !== "tenant_user") {
        throw new Error("sesión de impersonación owner inválida en el setup");
      }
      session = resolved;
    });

    it("getVerifiedSession devuelve tenant_user del negocio impersonado con el contexto de impersonación correcto", async () => {
      expect(session.businessId).toBe(businessB.id);
      expect(session.role).toBe("owner");
      expect(session.impersonation).toEqual({
        byPlatformAdminAuthUserId: adminOwnerAuthUserId,
        platformRole: "owner",
      });
    });

    it("resolveActor no lanza y devuelve un actor válido provisionado en el negocio impersonado", async () => {
      const actor = await withTenantContext(session.businessId, (tx) => resolveActor(tx, session));
      expect(actor.businessId).toBe(businessB.id);
      expect(actor.authUserId).toBe(adminOwnerAuthUserId);
      // Fila provisionada por startImpersonation con un email reconociblemente
      // interno — nunca el email personal del admin (ver impersonation.ts).
      expect(actor.email).toContain(adminOwnerAuthUserId);
      expect(actor.email).toContain("pragmia-internal.invalid");
    });

    it("una escritura real de negocio (guardar el programa de sellos) se ejecuta exitosamente y queda auditada", async () => {
      const result = await saveProgramForSession(
        session,
        form({
          name: "Programa vía impersonación",
          stampsRequired: "5",
          cooldownMinutes: "0",
          isActive: "on",
        }),
      );
      expect(result.success).toBeDefined();
      expect(result.error).toBeUndefined();

      const [program] = await adminDb
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, businessB.id));
      expect(program).toBeDefined();
      expect(program?.name).toBe("Programa vía impersonación");
      expect(program?.stampsRequired).toBe(5);

      const auditRows = await adminDb
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.businessId, businessB.id));
      const createdLog = auditRows.find((row) => row.action === "loyalty_program.created");
      expect(createdLog).toBeDefined();
      expect(createdLog?.entityId).toBe(program?.id);
    });
  });

  describe("Invisibilidad para el dueño real (impersonación de owner sigue activa)", () => {
    it("el login real del dueño de B sigue devolviendo su sesión normal, sin ningún rastro de impersonación", async () => {
      const ownerBCookies = await signInAsCookieJar(ownerBEmail, password);
      const session = await getVerifiedSession(ownerBCookies);
      if (!session.authenticated || session.kind !== "tenant_user") {
        throw new Error("sesión real del dueño de B inválida");
      }
      expect(session.businessId).toBe(businessB.id);
      expect(session.role).toBe("owner");
      expect(session.authUserId).toBe(ownerBAuthUserId);
      expect(session.impersonation).toBeNull();
    });
  });

  describe("Viewer impersonando: bloqueo estructural de escritura", () => {
    let adminViewerCookies: CookieMethodsServer;
    let session: Extract<
      Awaited<ReturnType<typeof getVerifiedSession>>,
      { kind: "tenant_user" }
    >;

    beforeAll(async () => {
      await startImpersonation(adminViewerAuthUserId, "viewer", businessB.id);
      adminViewerCookies = await signInAsCookieJar(adminViewerEmail, password);
      const resolved = await getVerifiedSession(adminViewerCookies);
      if (!resolved.authenticated || resolved.kind !== "tenant_user") {
        throw new Error("sesión de impersonación viewer inválida en el setup");
      }
      session = resolved;
    });

    it("getVerifiedSession refleja el rol de plataforma viewer en impersonation.platformRole", async () => {
      expect(session.businessId).toBe(businessB.id);
      expect(session.impersonation).toEqual({
        byPlatformAdminAuthUserId: adminViewerAuthUserId,
        platformRole: "viewer",
      });
    });

    it("resolveActor lanza: un viewer impersonando nunca tiene fila de users provisionada", async () => {
      await expect(
        withTenantContext(session.businessId, (tx) => resolveActor(tx, session)),
      ).rejects.toThrow(/solo lectura/i);
    });

    it("una escritura real (guardar el programa de sellos) se rechaza server-side, sin modificar nada", async () => {
      const [beforeProgram] = await adminDb
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, businessB.id));

      const result = await saveProgramForSession(
        session,
        form({
          name: "Programa vía impersonación viewer (no debería guardarse)",
          stampsRequired: "9",
          cooldownMinutes: "0",
          isActive: "on",
        }),
      );
      expect(result.error).toBeDefined();
      expect(result.success).toBeUndefined();

      const [afterProgram] = await adminDb
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, businessB.id));
      // El programa creado por el owner impersonando (test anterior) sigue
      // exactamente igual — el intento de escritura del viewer no lo tocó.
      expect(afterProgram?.name).toBe(beforeProgram?.name);
      expect(afterProgram?.stampsRequired).toBe(beforeProgram?.stampsRequired);
    });

    afterAll(async () => {
      await endImpersonation(adminViewerAuthUserId);
    });
  });

  describe("endImpersonation revierte todo", () => {
    it("tras terminar el grant, un login nuevo del admin ya no trae business_id/impersonation — vuelve a platform_admin", async () => {
      await endImpersonation(adminOwnerAuthUserId);

      // El JWT ya emitido conserva los claims viejos hasta que expira/se
      // refresca (documentado en CLAUDE.md) — un login nuevo fuerza a
      // GoTrue a emitir un JWT fresco, que el hook resuelve de nuevo desde
      // cero (sin grant activo → sin business_id/impersonation).
      const freshAdminCookies = await signInAsCookieJar(adminOwnerEmail, password);
      const session = await getVerifiedSession(freshAdminCookies);

      if (!session.authenticated || session.kind !== "platform_admin") {
        throw new Error(
          `se esperaba kind "platform_admin" tras endImpersonation, se obtuvo: ${JSON.stringify(session)}`,
        );
      }
      expect(session.authUserId).toBe(adminOwnerAuthUserId);
      expect(session.platformRole).toBe("owner");
      expect("businessId" in session).toBe(false);
    });
  });

  // Regresión de un hallazgo real de tenant-security-reviewer: desactivar
  // la CUENTA de un admin mientras tiene un grant de impersonación activo
  // (nunca hizo "Salir") debía dejarle acceso completo indefinido al
  // negocio impersonado — setPlatformAdminActive(..., false) ahora termina
  // ese grant y desactiva la fila de `users` provisionada en la MISMA
  // transacción (ver apps/web/app/admin/accounts.ts).
  describe("Desactivar la cuenta de un admin con impersonación activa revoca todo", () => {
    let strayAdminAuthUserId: string;
    let strayAdminEmail: string;

    beforeAll(async () => {
      strayAdminEmail = `admin-imp-stray-${suffix}@test.dev`;
      strayAdminAuthUserId = await createPlatformAdmin(strayAdminEmail, password, "owner");
      await startImpersonation(strayAdminAuthUserId, "owner", businessB.id);
    });

    afterAll(async () => {
      await endImpersonation(strayAdminAuthUserId).catch(() => {});
      await adminDb.delete(auditLogs).where(eq(auditLogs.actorAuthUserId, strayAdminAuthUserId));
      await adminDb
        .delete(platformImpersonationGrants)
        .where(eq(platformImpersonationGrants.platformAdminAuthUserId, strayAdminAuthUserId));
      await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, strayAdminAuthUserId));
      await supabaseAdminClient().auth.admin.deleteUser(strayAdminAuthUserId);
    });

    it("un login nuevo tras la desactivación no recupera NINGÚN acceso — ni de tenant ni de plataforma", async () => {
      // Desactivar la cuenta vía la misma función real que usa /admin/accounts
      // (actingAdmin = el propio adminOwnerAuthUserId del describe de arriba,
      // ya reactivado por ser "owner" — no importa cuál owner real la llame).
      await setPlatformAdminActive(adminOwnerAuthUserId, "owner", strayAdminAuthUserId, false);

      const freshCookies = await signInAsCookieJar(strayAdminEmail, password);
      const session = await getVerifiedSession(freshCookies);

      // Antes del fix: esto resolvía como tenant_user real de businessB,
      // role "owner", impersonation: null — indistinguible del dueño real.
      expect(session.authenticated).toBe(false);
    });
  });

  // Regresión de un bug real reportado en producción: "entré a Chilaquikes
  // e Iriz y ninguna funcionó, me regresa a /admin". Causa real: el admin
  // YA estaba logueado (JWT sin claims de impersonación) ANTES de llamar
  // startImpersonation() — ese JWT ya emitido sigue firmado con los claims
  // viejos hasta que se refresca (el hook de auth solo corre en
  // login/refresh, nunca en cada request). Los tests de arriba nunca
  // atraparon esto porque siempre hacían un LOGIN NUEVO después de
  // impersonar (signInAsCookieJar), lo cual evita el problema por
  // construcción — acá se prueba el flujo real: sesión YA existente,
  // impersonar, refrescar EN EL MISMO jar (sin volver a loguearse, igual
  // que refreshClaims() en impersonation-actions.ts).
  describe("Flujo real: admin YA logueado que impersona (sin volver a loguearse)", () => {
    let strayAdminAuthUserId: string;
    let strayAdminEmail: string;
    let strayAdminCookies: CookieMethodsServer;

    beforeAll(async () => {
      strayAdminEmail = `admin-imp-refresh-${suffix}@test.dev`;
      strayAdminAuthUserId = await createPlatformAdmin(strayAdminEmail, password, "owner");
      // Login ANTES de impersonar — este jar queda con un JWT sin ningún
      // claim de impersonación, exactamente como un admin que ya tenía
      // /admin abierto en el navegador.
      strayAdminCookies = await signInAsCookieJar(strayAdminEmail, password);
    });

    afterAll(async () => {
      await endImpersonation(strayAdminAuthUserId).catch(() => {});
      await adminDb.delete(auditLogs).where(eq(auditLogs.actorAuthUserId, strayAdminAuthUserId));
      await adminDb
        .delete(platformImpersonationGrants)
        .where(eq(platformImpersonationGrants.platformAdminAuthUserId, strayAdminAuthUserId));
      await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, strayAdminAuthUserId));
      await supabaseAdminClient().auth.admin.deleteUser(strayAdminAuthUserId);
    });

    it("sin refrescar, el JWT ya emitido sigue sin claims de impersonación (reproduce el bug)", async () => {
      await startImpersonation(strayAdminAuthUserId, "owner", businessB.id);

      const staleSession = await getVerifiedSession(strayAdminCookies);
      expect(staleSession.authenticated).toBe(true);
      if (!staleSession.authenticated) throw new Error("unreachable");
      // Exactamente el bug reportado: sigue viéndose como platform_admin
      // puro, sin business_id — (product)/layout.tsx lo rebotaría a /admin.
      expect(staleSession.kind).toBe("platform_admin");
    });

    it("tras refrescar la sesión (mismo jar, sin login nuevo), el JWT trae los claims de impersonación", async () => {
      await refreshSessionForCookieJar(strayAdminCookies);

      const freshSession = await getVerifiedSession(strayAdminCookies);
      expect(freshSession.authenticated).toBe(true);
      if (!freshSession.authenticated || freshSession.kind !== "tenant_user") {
        throw new Error(`se esperaba tenant_user tras refrescar, se obtuvo: ${JSON.stringify(freshSession)}`);
      }
      expect(freshSession.businessId).toBe(businessB.id);
      expect(freshSession.role).toBe("owner");
      expect(freshSession.impersonation).toEqual({
        byPlatformAdminAuthUserId: strayAdminAuthUserId,
        platformRole: "owner",
      });
    });
  });
});
