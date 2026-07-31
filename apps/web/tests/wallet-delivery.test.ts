import { withTenantContext } from "@loyalty/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@loyalty/db/admin";
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
import { eq } from "drizzle-orm";
import { createCustomerForSession } from "../app/customers/logic";
import { downloadApplePassForSession } from "../app/customers/[id]/wallet/apple/logic";
import { buildGoogleSaveLinkForCustomer } from "../lib/wallet/googleSaveLink";
import { saveProgramForSession } from "../app/rewards/logic";
import { requireTenantSession } from "../lib/supabase/session";
import { createBusinessWithRealOwner, createPlatformAdmin, form, signInAsCookieJar } from "./support/testAuth";

// Definición de "listo" de la entrega mínima (paso h/i de Fase 4): un
// dueño/staff logueado puede pedir el .pkpass real (firmado con el
// adaptador fake) y el link real de Google de UN cliente de su propio
// tenant — nunca de otro (IDOR). Primera vez que producción crea filas en
// wallet_passes (ensureWalletPass): se prueba que no duplica en pedidos
// repetidos.

describe("entrega mínima de Wallet — descarga de .pkpass + link de Google, sesión autenticada", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "wallet-delivery-password-1";
  let platformAdminAuthUserId: string;
  let ownerAuthUserId: string;
  let businessId: string;
  let customerId: string;
  let session: Awaited<ReturnType<typeof requireTenantSession>>;

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(`wallet-delivery-admin-${suffix}@test.dev`, password);
    const { business, ownerAuthUserId: ownerId } = await createBusinessWithRealOwner({
      businessName: `Wallet Delivery ${suffix}`,
      slug: `wallet-delivery-${suffix}`,
      ownerEmail: `wallet-delivery-owner-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessId = business.id;
    ownerAuthUserId = ownerId;

    const jar = await signInAsCookieJar(`wallet-delivery-owner-${suffix}@test.dev`, password);
    session = await requireTenantSession(jar);
    if (!session) throw new Error("sesión inválida en setup");

    const program = await saveProgramForSession(
      session,
      form({ name: "Programa Delivery", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!program.success) throw new Error(`setup programa: ${program.error}`);

    const customer = await createCustomerForSession(session, form({ fullName: "Cliente Delivery" }));
    if (!customer.success) throw new Error(`setup cliente: ${customer.error}`);
    const [customerRow] = await adminDb.select().from(customers).where(eq(customers.businessId, businessId));
    customerId = customerRow.id;
  });

  afterAll(async () => {
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
    await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, businessId));
    await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, businessId));
    await adminDb.delete(customers).where(eq(customers.businessId, businessId));
    await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
    await adminDb.delete(users).where(eq(users.businessId, businessId));
    await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const { supabaseAdminClient } = await import("./support/testAuth");
    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerAuthUserId);
    await admin.auth.admin.deleteUser(platformAdminAuthUserId);
  });

  it("genera un .pkpass real (zip firmado no vacío) y crea la fila wallet_passes", async () => {
    if (!session) throw new Error("sin sesión");
    const result = await downloadApplePassForSession(session, customerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkpass.length).toBeGreaterThan(500);
    expect(result.pkpass[0]).toBe(0x50);
    expect(result.pkpass[1]).toBe(0x4b);

    const [pass] = await adminDb.select().from(walletPasses).where(eq(walletPasses.businessId, businessId));
    expect(pass).toBeTruthy();
    expect(pass.platform).toBe("apple");
    expect(pass.authenticationToken.length).toBeGreaterThan(10);
  });

  it("pedirlo dos veces reusa la MISMA fila de wallet_passes (no duplica)", async () => {
    if (!session) throw new Error("sin sesión");
    await downloadApplePassForSession(session, customerId);
    await downloadApplePassForSession(session, customerId);
    const rows = await adminDb.select().from(walletPasses).where(eq(walletPasses.businessId, businessId));
    expect(rows.filter((r) => r.platform === "apple")).toHaveLength(1);
  });

  it("un id de cliente inexistente/malformado no genera nada (mismo camino que IDOR)", async () => {
    if (!session) throw new Error("sin sesión");
    const result = await downloadApplePassForSession(session, "00000000-0000-0000-0000-000000000000");
    expect(result.ok).toBe(false);
  });

  it("un cliente de OTRO negocio no puede descargar el pase de este (IDOR)", async () => {
    const admin2 = await createPlatformAdmin(`wallet-delivery-admin2-${suffix}@test.dev`, password);
    const { business: otherBiz, ownerAuthUserId: otherOwnerId } = await createBusinessWithRealOwner({
      businessName: `Wallet Delivery Other ${suffix}`,
      slug: `wallet-delivery-other-${suffix}`,
      ownerEmail: `wallet-delivery-owner-other-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: admin2,
    });
    const jar2 = await signInAsCookieJar(`wallet-delivery-owner-other-${suffix}@test.dev`, password);
    const session2 = await requireTenantSession(jar2);
    if (!session2) throw new Error("sin sesión 2");

    const result = await downloadApplePassForSession(session2, customerId);
    expect(result.ok).toBe(false);

    const { supabaseAdminClient } = await import("./support/testAuth");
    const admin = supabaseAdminClient();
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, otherBiz.id));
    await adminDb.delete(users).where(eq(users.businessId, otherBiz.id));
    await adminDb.delete(businesses).where(eq(businesses.id, otherBiz.id));
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, admin2));
    await admin.auth.admin.deleteUser(otherOwnerId);
    await admin.auth.admin.deleteUser(admin2);
  });

  it("arma un link real de Google Wallet: JWT RS256 válido con el classId/objectId, el token y el origin correctos", async () => {
    if (!session) throw new Error("sin sesión");
    const link = await withTenantContext(session.businessId, (tx) =>
      buildGoogleSaveLinkForCustomer(tx, session!.businessId, customerId),
    );
    expect(link).toBeTruthy();
    expect(link!.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);

    const jwt = link!.replace("https://pay.google.com/gp/v/save/", "");
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      payload: {
        loyaltyClasses: Array<{ id: string }>;
        loyaltyObjects: Array<{ id: string; barcode: { value: string } }>;
      };
      origins: string[];
    };
    expect(claims.payload.loyaltyClasses[0].id).toContain(businessId);
    expect(claims.payload.loyaltyObjects[0].id).toContain(customerId);
    expect(claims.origins).toEqual(["http://127.0.0.1:3000"]);

    const walletToken = (
      await adminDb.select({ t: customers.walletToken }).from(customers).where(eq(customers.id, customerId))
    )[0].t;
    expect(claims.payload.loyaltyObjects[0].barcode.value).toBe(walletToken);
  });

  it("un cliente inexistente no arma link de Google (null, no un error)", async () => {
    if (!session) throw new Error("sin sesión");
    const link = await withTenantContext(session.businessId, (tx) =>
      buildGoogleSaveLinkForCustomer(tx, session!.businessId, "00000000-0000-0000-0000-000000000000"),
    );
    expect(link).toBeNull();
  });
});
