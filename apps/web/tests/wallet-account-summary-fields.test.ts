import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  customerBalances,
  customers,
  employees,
  locations,
  loyaltyPrograms,
  platformAdmins,
  redemptions,
  rewardRules,
  rewards,
  transactions,
  users,
  withTenantContext,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createCustomerForSession } from "../app/(product)/customers/logic";
import { loadCustomerLoyaltySnapshot, loadLifetimeStamps } from "../lib/wallet/loyaltySnapshot";
import { saveProgramForSession, saveRewardRuleForSession } from "../app/(product)/rewards/logic";
import { redeemRewardForSession, registerStampForSession } from "../app/(product)/scanner/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import { createBusinessWithRealOwner, createPlatformAdmin, createRealStaffUser, form, signInAsCookieJar } from "./support/testAuth";

// Verificación de estado REAL (no solo valor inicial) de los 3 campos
// dinámicos de resumen de cuenta agregados a los backFields de Chilaquikes
// (ver apps/web/lib/wallet/passBackFieldsConfig.ts). loadLifetimeStamps se
// prueba DESACOPLADA del gate por business_id (que solo Chilaquikes activa
// en producción) — así se ejercita contra Postgres real, sellos y canjes
// reales, sin depender del UUID de producción de Chilaquikes ni arriesgar
// una colisión de PK si el Postgres local de desarrollo ya tiene esa fila
// sembrada por otro script.

async function tenantSession(businessId: string, jar: Awaited<ReturnType<typeof signInAsCookieJar>>): Promise<TenantSession> {
  const session = await requireTenantSession(jar);
  if (!session) throw new Error("sesión de tenant inválida en el setup");
  if (session.businessId !== businessId) throw new Error("sesión de otro negocio en el setup");
  return session;
}

describe("campos dinámicos de resumen de cuenta — lifetimeStamps y el gate por negocio, contra Postgres real", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "account-summary-password-1";

  let platformAdminAuthUserId: string;
  let businessId: string;
  let ownerAuthUserId: string;
  let staffAuthUserId: string;
  let locationId: string;
  let sessionOwner: TenantSession;
  let sessionStaff: TenantSession;
  let programId: string;
  let ruleId: string;

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(`account-summary-admin-${suffix}@test.dev`, password);
    const ownerEmail = `account-summary-owner-${suffix}@test.dev`;
    const biz = await createBusinessWithRealOwner({
      businessName: `Account Summary ${suffix}`,
      slug: `account-summary-${suffix}`,
      ownerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessId = biz.business.id;
    ownerAuthUserId = biz.ownerAuthUserId;

    const staffEmail = `account-summary-staff-${suffix}@test.dev`;
    staffAuthUserId = await createRealStaffUser({ businessId, email: staffEmail, password });

    const [loc] = await adminDb.insert(locations).values({ businessId, name: "Sucursal Account Summary" }).returning();
    locationId = loc.id;

    const [staffUserRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessId), eq(users.authUserId, staffAuthUserId)));
    await adminDb.insert(employees).values({
      businessId,
      userId: staffUserRow.id,
      primaryLocationId: locationId,
      fullName: "Staff Account Summary",
      isActive: true,
    });

    sessionOwner = await tenantSession(businessId, await signInAsCookieJar(ownerEmail, password));
    sessionStaff = await tenantSession(businessId, await signInAsCookieJar(staffEmail, password));

    const program = await saveProgramForSession(
      sessionOwner,
      form({ name: "Programa Account Summary", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!program.success) throw new Error(`setup programa: ${program.error}`);
    const [programRow] = await adminDb.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
    programId = programRow.id;

    const rule = await saveRewardRuleForSession(sessionOwner, form({ name: "Recompensa Account Summary", stampsRequired: "6" }));
    if (!rule.success) throw new Error(`setup regla: ${rule.error}`);
    const [ruleRow] = await adminDb.select().from(rewardRules).where(eq(rewardRules.businessId, businessId));
    ruleId = ruleRow.id;
  });

  afterAll(async () => {
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
    await adminDb.delete(redemptions).where(eq(redemptions.businessId, businessId));
    await adminDb.delete(rewards).where(eq(rewards.businessId, businessId));
    await adminDb.delete(transactions).where(eq(transactions.businessId, businessId));
    await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, businessId));
    await adminDb.delete(customers).where(eq(customers.businessId, businessId));
    await adminDb.delete(rewardRules).where(eq(rewardRules.businessId, businessId));
    await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
    await adminDb.delete(employees).where(eq(employees.businessId, businessId));
    await adminDb.delete(locations).where(eq(locations.businessId, businessId));
    await adminDb.delete(users).where(eq(users.businessId, businessId));
    await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const { supabaseAdminClient } = await import("./support/testAuth");
    const admin = supabaseAdminClient();
    await admin.auth.admin.deleteUser(ownerAuthUserId);
    await admin.auth.admin.deleteUser(staffAuthUserId);
    await admin.auth.admin.deleteUser(platformAdminAuthUserId);
  });

  let freshCustomerCounter = 0;
  async function freshCustomer(name: string) {
    const result = await createCustomerForSession(
      sessionOwner,
      form({ fullName: name, phone: `+5284${String(freshCustomerCounter++).padStart(6, "0")}`, dateOfBirth: "1990-01-01" }),
    );
    if (!result.success) throw new Error(`freshCustomer: ${result.error}`);
    const [row] = await adminDb.select().from(customers).where(and(eq(customers.businessId, businessId), eq(customers.fullName, name)));
    return row;
  }

  async function stamp(customerId: string) {
    const result = await registerStampForSession(sessionStaff, {
      customerId,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);
    // Mismo patrón que wallet-notify.test.ts: empuja last_stamp_at al
    // pasado para saltar el piso duro de cooldown de 30s entre sellos.
    await adminDb.update(customerBalances).set({ lastStampAt: new Date(Date.now() - 31_000) }).where(eq(customerBalances.customerId, customerId));
  }

  it("lifetimeStamps AUMENTA con cada sello real y NO decrece al canjear — a diferencia de currentStamps, que sí decrece (arrastra el sobrante)", async () => {
    const customer = await freshCustomer(`Lifetime ${suffix}`);

    for (let i = 0; i < 6; i++) {
      await stamp(customer.id);
    }

    const lifetimeAt6 = await withTenantContext(sessionOwner.businessId, (tx) =>
      loadLifetimeStamps(tx, sessionOwner.businessId, customer.id, programId),
    );
    expect(lifetimeAt6).toBe(6);

    const [balanceAt6] = await adminDb
      .select()
      .from(customerBalances)
      .where(and(eq(customerBalances.customerId, customer.id), eq(customerBalances.loyaltyProgramId, programId)));
    expect(balanceAt6.currentStamps).toBe(6);

    const redeemResult = await redeemRewardForSession(sessionStaff, {
      customerId: customer.id,
      ruleId,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(redeemResult.ok).toBe(true);

    const [balanceAfterRedeem] = await adminDb
      .select()
      .from(customerBalances)
      .where(and(eq(customerBalances.customerId, customer.id), eq(customerBalances.loyaltyProgramId, programId)));
    // Arrastra el sobrante: 6 - 6 = 0 (nunca negativo, pero SÍ decreció).
    expect(balanceAfterRedeem.currentStamps).toBe(0);

    // El canje NO escribe en transactions (solo redemptions/rewards) — el
    // ledger de sellos queda intacto, así que el total histórico sigue en 6.
    const lifetimeAfterRedeem = await withTenantContext(sessionOwner.businessId, (tx) =>
      loadLifetimeStamps(tx, sessionOwner.businessId, customer.id, programId),
    );
    expect(lifetimeAfterRedeem).toBe(6);

    await stamp(customer.id);

    const [balanceAfterOneMore] = await adminDb
      .select()
      .from(customerBalances)
      .where(and(eq(customerBalances.customerId, customer.id), eq(customerBalances.loyaltyProgramId, programId)));
    expect(balanceAfterOneMore.currentStamps).toBe(1);

    const lifetimeAfterOneMore = await withTenantContext(sessionOwner.businessId, (tx) =>
      loadLifetimeStamps(tx, sessionOwner.businessId, customer.id, programId),
    );
    expect(lifetimeAfterOneMore).toBe(7);
  });

  it("loadCustomerLoyaltySnapshot: sin showAccountSummaryFields (negocio de prueba, NO Chilaquikes), lifetimeStamps y stampsUntilNextReward quedan SIEMPRE null — pese a sellos/canjes reales", async () => {
    const customer = await freshCustomer(`Sin gate ${suffix}`);

    for (let i = 0; i < 3; i++) {
      await stamp(customer.id);
    }

    const snapshot = await withTenantContext(sessionOwner.businessId, (tx) =>
      loadCustomerLoyaltySnapshot(tx, sessionOwner.businessId, customer.id),
    );
    expect(snapshot?.currentStamps).toBe(3);
    // El gate (passBackFieldsConfig.showAccountSummaryFields) solo está
    // activo para Chilaquikes en producción — cualquier otro negocio,
    // incluido este de prueba, nunca ve estos 2 campos calculados.
    expect(snapshot?.lifetimeStamps).toBeNull();
    expect(snapshot?.stampsUntilNextReward).toBeNull();
    expect(snapshot?.passBackFields).toBeNull();
  });
});
