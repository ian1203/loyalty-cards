import type { CookieMethodsServer } from "@supabase/ssr";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, businesses, platformAdmins, users } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { requirePlatformAdmin } from "../lib/supabase/session";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Paso (g) del endurecimiento de Fase 1: requirePlatformAdmin() es el ÚNICO
// gate que usan tanto apps/web/app/admin/page.tsx como
// apps/web/app/admin/actions.ts (createBusinessAction, ANTES de tocar
// cualquier dato) — probarlo acá, con una sesión real de dueño, cubre ambos
// puntos de entrada sin necesitar invocar la Server Action directamente
// (que no acepta inyección de cookies; su único caller de producción es el
// formulario renderizado, siempre con next/headers cookies()).
describe("Fase 1 — un dueño (rol owner) no llega a /admin", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "admin-access-test-password-1";

  let platformAdminAuthUserId: string;
  let ownerAuthUserId: string;
  let business: Awaited<ReturnType<typeof createBusinessWithRealOwner>>["business"];
  let ownerCookies: CookieMethodsServer;
  let adminCookies: CookieMethodsServer;

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(
      `admin-access-admin-${suffix}@test.dev`,
      password,
    );

    const ownerEmail = `admin-access-owner-${suffix}@test.dev`;
    const owner = await createBusinessWithRealOwner({
      businessName: `Admin Access Test ${suffix}`,
      slug: `admin-access-test-${suffix}`,
      ownerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    business = owner.business;
    ownerAuthUserId = owner.ownerAuthUserId;

    ownerCookies = await signInAsCookieJar(ownerEmail, password);
    adminCookies = await signInAsCookieJar(
      `admin-access-admin-${suffix}@test.dev`,
      password,
    );
  });

  afterAll(async () => {
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, business.id));
    await adminDb.delete(users).where(eq(users.businessId, business.id));
    await adminDb.delete(businesses).where(eq(businesses.id, business.id));
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerAuthUserId);
    await admin.auth.admin.deleteUser(platformAdminAuthUserId);
  });

  it("con la sesión real de un dueño, requirePlatformAdmin() deniega (null)", async () => {
    expect(await requirePlatformAdmin(ownerCookies)).toBeNull();
  });

  it("control positivo: con la sesión real de un admin de plataforma, requirePlatformAdmin() sí concede", async () => {
    const result = await requirePlatformAdmin(adminCookies);
    expect(result).not.toBeNull();
    expect(result?.authUserId).toBe(platformAdminAuthUserId);
  });
});
