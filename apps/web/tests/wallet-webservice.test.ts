import type { CookieMethodsServer } from "@supabase/ssr";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  customerBalances,
  customers,
  deviceRegistrations,
  employees,
  locations,
  loyaltyPrograms,
  platformAdmins,
  rewardRules,
  users,
  walletPasses,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createCustomerForSession } from "../app/customers/logic";
import { saveProgramForSession } from "../app/rewards/logic";
import {
  getLatestPass,
  listUpdatedSerialsForDevice,
  logDeviceErrors,
  registerDeviceForPass,
  unregisterDeviceForPass,
} from "../app/api/wallet/apple/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import { createBusinessWithRealOwner, createPlatformAdmin, form, signInAsCookieJar } from "./support/testAuth";

// Definición de "listo" del web service PÚBLICO de PassKit (paso e/j): sin
// sesión de Supabase — la identidad es 100% el authenticationToken de CADA
// pase (ver passAuth.ts + skill wallet-integration). El caso que importa
// más: un authenticationToken válido de un pase del negocio B nunca debe
// leer ni mutar nada del negocio A, aunque pida exactamente el mismo
// passTypeIdentifier (de plataforma, no de tenant).

const PASS_TYPE = "pass.dev.loyalty.fake"; // fallback de getApplePassTypeIdentifier() sin credenciales reales

async function tenantSession(jar: CookieMethodsServer): Promise<TenantSession> {
  const session = await requireTenantSession(jar);
  if (!session) throw new Error("sesión de tenant inválida en el setup");
  return session;
}

describe("web service público de Apple PassKit — tenant-scoped por authenticationToken", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "wallet-webservice-password-1";

  let platformAdminAuthUserId: string;
  let businessAId: string;
  let ownerAAuthUserId: string;
  let businessBId: string;
  let ownerBAuthUserId: string;

  let passA: { id: string; authenticationToken: string };
  let passB: { id: string; authenticationToken: string };

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(`wallet-ws-admin-${suffix}@test.dev`, password);

    const ownerAEmail = `wallet-ws-owner-a-${suffix}@test.dev`;
    const a = await createBusinessWithRealOwner({
      businessName: `Wallet WS A ${suffix}`,
      slug: `wallet-ws-a-${suffix}`,
      ownerEmail: ownerAEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessAId = a.business.id;
    ownerAAuthUserId = a.ownerAuthUserId;
    const sessionA = await tenantSession(await signInAsCookieJar(ownerAEmail, password));
    await saveProgramForSession(
      sessionA,
      form({ name: "Programa A", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    const customerA = await createCustomerForSession(sessionA, form({ fullName: `Cliente A ${suffix}` }));
    if (!customerA.success) throw new Error(`setup cliente A: ${customerA.error}`);
    const [customerARow] = await adminDb.select().from(customers).where(eq(customers.businessId, businessAId));
    const [passARow] = await adminDb
      .insert(walletPasses)
      .values({
        businessId: businessAId,
        customerId: customerARow.id,
        platform: "apple",
        authenticationToken: `auth-a-${suffix}`,
      })
      .returning();
    passA = { id: passARow.id, authenticationToken: passARow.authenticationToken };

    const ownerBEmail = `wallet-ws-owner-b-${suffix}@test.dev`;
    const b = await createBusinessWithRealOwner({
      businessName: `Wallet WS B ${suffix}`,
      slug: `wallet-ws-b-${suffix}`,
      ownerEmail: ownerBEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessBId = b.business.id;
    ownerBAuthUserId = b.ownerAuthUserId;
    const sessionB = await tenantSession(await signInAsCookieJar(ownerBEmail, password));
    await saveProgramForSession(
      sessionB,
      form({ name: "Programa B", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    const customerB = await createCustomerForSession(sessionB, form({ fullName: `Cliente B ${suffix}` }));
    if (!customerB.success) throw new Error(`setup cliente B: ${customerB.error}`);
    const [customerBRow] = await adminDb.select().from(customers).where(eq(customers.businessId, businessBId));
    const [passBRow] = await adminDb
      .insert(walletPasses)
      .values({
        businessId: businessBId,
        customerId: customerBRow.id,
        platform: "apple",
        authenticationToken: `auth-b-${suffix}`,
      })
      .returning();
    passB = { id: passBRow.id, authenticationToken: passBRow.authenticationToken };
  });

  afterAll(async () => {
    for (const businessId of [businessAId, businessBId]) {
      await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
      await adminDb.delete(deviceRegistrations).where(eq(deviceRegistrations.businessId, businessId));
      await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, businessId));
      await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, businessId));
      await adminDb.delete(customers).where(eq(customers.businessId, businessId));
      await adminDb.delete(rewardRules).where(eq(rewardRules.businessId, businessId));
      await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
      await adminDb.delete(employees).where(eq(employees.businessId, businessId));
      await adminDb.delete(locations).where(eq(locations.businessId, businessId));
      await adminDb.delete(users).where(eq(users.businessId, businessId));
      await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    }
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const { supabaseAdminClient } = await import("./support/testAuth");
    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerAAuthUserId);
    await admin.auth.admin.deleteUser(ownerBAuthUserId);
    await admin.auth.admin.deleteUser(platformAdminAuthUserId);
  });

  describe("registro/desregistro de dispositivo", () => {
    it("con el token correcto, registra el dispositivo dentro del tenant del pase", async () => {
      const result = await registerDeviceForPass({
        deviceLibraryIdentifier: `device-${suffix}-1`,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
        pushToken: `push-${suffix}-1`,
      });
      expect(result.status).toBe(200);
      expect(result.headers?.["cache-control"]).toBe("no-store");

      const [row] = await adminDb
        .select()
        .from(deviceRegistrations)
        .where(
          and(
            eq(deviceRegistrations.walletPassId, passA.id),
            eq(deviceRegistrations.deviceLibraryIdentifier, `device-${suffix}-1`),
          ),
        );
      expect(row).toBeTruthy();
      expect(row.businessId).toBe(businessAId);
    });

    it("registrar dos veces el mismo dispositivo es idempotente (actualiza, no duplica)", async () => {
      const deviceId = `device-${suffix}-idem`;
      await registerDeviceForPass({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
        pushToken: "push-v1",
      });
      await registerDeviceForPass({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
        pushToken: "push-v2",
      });
      const rows = await adminDb
        .select()
        .from(deviceRegistrations)
        .where(
          and(
            eq(deviceRegistrations.walletPassId, passA.id),
            eq(deviceRegistrations.deviceLibraryIdentifier, deviceId),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].pushToken).toBe("push-v2");
    });

    it("el token de B contra el serialNumber de A: 401 genérico, ningún registro creado", async () => {
      const result = await registerDeviceForPass({
        deviceLibraryIdentifier: `device-${suffix}-cross`,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passB.authenticationToken}`,
        pushToken: `push-${suffix}-cross`,
      });
      expect(result.status).toBe(401);

      const rows = await adminDb
        .select()
        .from(deviceRegistrations)
        .where(eq(deviceRegistrations.deviceLibraryIdentifier, `device-${suffix}-cross`));
      expect(rows).toHaveLength(0);
    });

    it("un token que no coincide con ningún pase: 401, indistinguible de un token cruzado", async () => {
      const result = await registerDeviceForPass({
        deviceLibraryIdentifier: `device-${suffix}-bad`,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: "ApplePass token-que-no-existe",
        pushToken: "push-x",
      });
      expect(result.status).toBe(401);
    });

    it("un passTypeIdentifier distinto al de la plataforma: 401, sin tocar la DB", async () => {
      const result = await registerDeviceForPass({
        deviceLibraryIdentifier: `device-${suffix}-wrongtype`,
        passTypeIdentifier: "pass.otro.identificador",
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
        pushToken: "push-x",
      });
      expect(result.status).toBe(401);
    });

    it("desregistrar con el token correcto borra la fila; con el de otro tenant, 401 y no borra", async () => {
      const deviceId = `device-${suffix}-unreg`;
      await registerDeviceForPass({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
        pushToken: "push-unreg",
      });

      const crossAttempt = await unregisterDeviceForPass({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passB.authenticationToken}`,
      });
      expect(crossAttempt.status).toBe(401);
      const stillThere = await adminDb
        .select()
        .from(deviceRegistrations)
        .where(
          and(
            eq(deviceRegistrations.walletPassId, passA.id),
            eq(deviceRegistrations.deviceLibraryIdentifier, deviceId),
          ),
        );
      expect(stillThere).toHaveLength(1);

      const result = await unregisterDeviceForPass({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
      });
      expect(result.status).toBe(200);
      const gone = await adminDb
        .select()
        .from(deviceRegistrations)
        .where(
          and(
            eq(deviceRegistrations.walletPassId, passA.id),
            eq(deviceRegistrations.deviceLibraryIdentifier, deviceId),
          ),
        );
      expect(gone).toHaveLength(0);
    });
  });

  describe("listado de seriales actualizados por dispositivo", () => {
    it("respeta passesUpdatedSince: solo lista pases con updated_at posterior", async () => {
      const deviceId = `device-${suffix}-list`;
      await registerDeviceForPass({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
        pushToken: "push-list",
      });

      const cutoff = new Date(Date.now() + 1000).toISOString();
      const emptyResult = await listUpdatedSerialsForDevice({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
        passesUpdatedSince: cutoff,
      });
      expect(emptyResult.status).toBe(204);

      const fullResult = await listUpdatedSerialsForDevice({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: PASS_TYPE,
      });
      expect(fullResult.status).toBe(200);
      const body = fullResult.body as { serialNumbers: string[] };
      expect(body.serialNumbers).toContain(passA.id);
    });

    it("un dispositivo sin pases registrados: 204, no un error", async () => {
      const result = await listUpdatedSerialsForDevice({
        deviceLibraryIdentifier: `device-${suffix}-nunca-registrado`,
        passTypeIdentifier: PASS_TYPE,
      });
      expect(result.status).toBe(204);
    });
  });

  describe("descarga del pase más reciente", () => {
    it("con el token correcto, sirve el .pkpass (zip) con no-store", async () => {
      const result = await getLatestPass({
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passA.authenticationToken}`,
      });
      expect(result.status).toBe(200);
      expect(result.headers?.["cache-control"]).toBe("no-store");
      expect(result.headers?.["content-type"]).toBe("application/vnd.apple.pkpass");
      const body = result.body as Buffer;
      expect(body[0]).toBe(0x50);
      expect(body[1]).toBe(0x4b);
    });

    it("el token de B no sirve el pase de A (401, no 404 con datos)", async () => {
      const result = await getLatestPass({
        passTypeIdentifier: PASS_TYPE,
        serialNumber: passA.id,
        authorizationHeader: `ApplePass ${passB.authenticationToken}`,
      });
      expect(result.status).toBe(401);
      expect(result.body).toBeUndefined();
    });
  });

  it("el log de errores del dispositivo (público, sin auth) siempre responde 200", async () => {
    const result = await logDeviceErrors({ logs: ["algo salió mal en el dispositivo"] });
    expect(result.status).toBe(200);
  });
});
