import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  customerBalances,
  customers,
  loyaltyPrograms,
  platformAdmins,
  users,
  walletPasses,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { enrollCustomerPublic } from "@loyalty/db/enroll";
import { enrollCustomerForSlug } from "../app/(marketing)/enroll/[slug]/logic";
import { saveProgramForSession } from "../app/(product)/rewards/logic";
import { requireTenantSession } from "../lib/supabase/session";
import { createBusinessWithRealOwner, createPlatformAdmin, form, signInAsCookieJar } from "./support/testAuth";

// Definición de "listo" de /enroll: un visitante SIN sesión se registra
// solo bajo el negocio de su slug (nunca otro — enroll_customer_public
// resuelve el business_id EXCLUSIVAMENTE por slug, nunca por un parámetro
// que el visitante controle), con balance inicial en 0 contra el programa
// activo, dedupe por teléfono DENTRO del negocio (no global), gate de
// mayoría de edad para el autoconsentimiento LFPDPPP, y entrega best-effort
// de Wallet (adaptador fake en este entorno de test).
describe("/enroll — auto-registro público de clientes", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "enroll-test-password-1";

  let platformAdminAuthUserId: string;
  let businessAId: string;
  let businessASlug: string;
  let businessBId: string;
  let businessBSlug: string;

  function adultDob(): string {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 30);
    return d.toISOString().slice(0, 10);
  }

  function minorDob(): string {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 10);
    return d.toISOString().slice(0, 10);
  }

  function validFields(overrides: Record<string, string> = {}): FormData {
    return form({
      firstName: "Cliente",
      lastName: "De Prueba",
      dateOfBirth: adultDob(),
      email: `cliente-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      phone: `+52 229 ${Math.floor(1000000 + Math.random() * 8999999)}`,
      occupation: "Estudiante",
      consent: "on",
      ...overrides,
    });
  }

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(`enroll-admin-${suffix}@test.dev`, password);

    const a = await createBusinessWithRealOwner({
      businessName: `Enroll A ${suffix}`,
      slug: `enroll-a-${suffix}`,
      ownerEmail: `enroll-owner-a-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessAId = a.business.id;
    businessASlug = a.business.slug;

    const b = await createBusinessWithRealOwner({
      businessName: `Enroll B ${suffix}`,
      slug: `enroll-b-${suffix}`,
      ownerEmail: `enroll-owner-b-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessBId = b.business.id;
    businessBSlug = b.business.slug;

    const jarA = await signInAsCookieJar(`enroll-owner-a-${suffix}@test.dev`, password);
    const sessionA = await requireTenantSession(jarA);
    if (!sessionA) throw new Error("sesión inválida en setup A");
    const programA = await saveProgramForSession(
      sessionA,
      form({ name: "Programa Enroll A", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!programA.success) throw new Error(`setup programa A: ${programA.error}`);

    // B se deja SIN programa activo a propósito — cubre el caso "negocio
    // activo pero sin programa todavía" (el registro debe seguir
    // funcionando, solo sin balance inicial).
  });

  afterAll(async () => {
    for (const businessId of [businessAId, businessBId]) {
      await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
      await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, businessId));
      await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, businessId));
      await adminDb.delete(customers).where(eq(customers.businessId, businessId));
      await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
      await adminDb.delete(users).where(eq(users.businessId, businessId));
      await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    }
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, platformAdminAuthUserId));
  });

  it("registra un cliente adulto con consentimiento, balance en 0 y artefactos de Wallet (fake)", async () => {
    const result = await enrollCustomerForSlug(businessASlug, validFields());

    expect(result.error).toBeUndefined();
    expect(result.success?.businessName).toContain("Enroll A");
    expect(result.success?.programName).toBe("Programa Enroll A");
    expect(result.success?.applePkpassBase64).toBeTruthy();
    expect(result.success?.googleSaveLink).toMatch(/^https:\/\//);

    const [row] = await adminDb.select().from(customers).where(eq(customers.businessId, businessAId));
    expect(row.fullName).toBe("Cliente De Prueba");
    expect(row.dateOfBirth).toBeTruthy();
    expect(row.occupation).toBe("Estudiante");
    expect(row.privacyConsentAt).toBeTruthy();
    expect(row.walletToken).toBeTruthy();

    const [balance] = await adminDb
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, row.id));
    expect(balance.currentStamps).toBe(0);
  });

  it("registra un cliente en un negocio activo SIN programa todavía (sin balance, sin error)", async () => {
    const result = await enrollCustomerForSlug(businessBSlug, validFields());

    expect(result.error).toBeUndefined();
    expect(result.success?.programName).toBeNull();

    const [row] = await adminDb.select().from(customers).where(eq(customers.businessId, businessBId));
    expect(row).toBeDefined();
    const balances = await adminDb
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, row.id));
    expect(balances).toHaveLength(0);
  });

  it("rechaza un slug inexistente sin crear ningún cliente", async () => {
    const result = await enrollCustomerForSlug(`slug-inexistente-${suffix}`, validFields());
    expect(result.error).toBeTruthy();
    expect(result.success).toBeUndefined();
  });

  it("rechaza el registro de un menor de edad (autoconsentimiento LFPDPPP) sin crear cliente", async () => {
    const phone = `+52 229 ${Math.floor(1000000 + Math.random() * 8999999)}`;
    const result = await enrollCustomerForSlug(businessASlug, validFields({ dateOfBirth: minorDob(), phone }));

    expect(result.error).toBeTruthy();
    expect(result.success).toBeUndefined();

    const rows = await adminDb.select().from(customers).where(eq(customers.phone, phone));
    expect(rows).toHaveLength(0);
  });

  it("rechaza sin el checkbox de consentimiento marcado", async () => {
    const phone = `+52 229 ${Math.floor(1000000 + Math.random() * 8999999)}`;
    const result = await enrollCustomerForSlug(businessASlug, validFields({ consent: "off", phone }));

    expect(result.error).toBeTruthy();
    const rows = await adminDb.select().from(customers).where(eq(customers.phone, phone));
    expect(rows).toHaveLength(0);
  });

  it("rechaza un teléfono duplicado DENTRO del mismo negocio", async () => {
    const phone = `+52 229 ${Math.floor(1000000 + Math.random() * 8999999)}`;
    const first = await enrollCustomerForSlug(businessASlug, validFields({ phone }));
    expect(first.success).toBeTruthy();

    const second = await enrollCustomerForSlug(businessASlug, validFields({ phone }));
    expect(second.error).toBeTruthy();
    expect(second.success).toBeUndefined();

    const rows = await adminDb.select().from(customers).where(eq(customers.phone, phone));
    expect(rows).toHaveLength(1);
  });

  it("el gate de mayoría de edad también vive en la función SQL, no solo en la capa de aplicación", async () => {
    // Llama enroll_customer_public() DIRECTO (sin pasar por
    // enrollCustomerForSlug, que ya bloquea esto antes de llegar acá) —
    // prueba la defensa en profundidad agregada en 0015_enroll_age_gate.sql
    // tras el hallazgo MEDIO de la revisión de seguridad: un futuro segundo
    // caller que se salte el gate de apps/web no debe poder registrar un
    // menor de edad.
    const minor = new Date();
    minor.setUTCFullYear(minor.getUTCFullYear() - 10);
    const phone = `+52 229 ${Math.floor(1000000 + Math.random() * 8999999)}`;

    await expect(
      enrollCustomerPublic({
        businessSlug: businessASlug,
        fullName: "Menor De Edad",
        phone,
        email: "menor@example.com",
        dateOfBirth: minor.toISOString().slice(0, 10),
        occupation: null,
        walletToken: `test-token-${Date.now()}`,
      }),
    ).rejects.toThrow();

    const rows = await adminDb.select().from(customers).where(eq(customers.phone, phone));
    expect(rows).toHaveLength(0);
  });

  it("el MISMO teléfono puede registrarse en dos negocios distintos (dedupe es por negocio, no global)", async () => {
    const phone = `+52 229 ${Math.floor(1000000 + Math.random() * 8999999)}`;
    const first = await enrollCustomerForSlug(businessASlug, validFields({ phone }));
    const second = await enrollCustomerForSlug(businessBSlug, validFields({ phone }));

    expect(first.success).toBeTruthy();
    expect(second.success).toBeTruthy();

    const rows = await adminDb.select().from(customers).where(eq(customers.phone, phone));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.businessId))).toEqual(new Set([businessAId, businessBId]));
  });
});
