import type { CookieMethodsServer } from "@supabase/ssr";
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
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createCustomerForSession } from "../app/(product)/customers/logic";
import { saveProgramForSession, saveRewardRuleForSession } from "../app/(product)/rewards/logic";
import {
  checkLookupRateLimit,
  checkStampRateLimit,
  lookupCustomerByTokenForSession,
  recordLookupFailure,
  redeemRewardForSession,
  registerStampForSession,
  resetLookupRateLimiter,
} from "../app/(product)/scanner/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  createRealStaffUser,
  form,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Definición de "listo" de Fase 3: el camino de escritura más sensible de
// la plataforma (sellar/canjear), probado con sesiones REALES contra
// concurrencia, replay, cooldown, cross-tenant, y revocación en vivo — todo
// ejercitando el mismo código que corren las Server Actions (logic.ts), no
// una réplica.

async function tenantSession(jar: CookieMethodsServer): Promise<TenantSession> {
  const session = await requireTenantSession(jar);
  if (!session) throw new Error("sesión de tenant inválida en el setup");
  return session;
}

// Simula el paso del tiempo: el cooldown se mide contra last_stamp_at, así
// que "esperar" es empujarlo al pasado — más rápido y determinista que un
// sleep real.
async function clearCooldown(customerId: string, loyaltyProgramId: string) {
  await adminDb
    .update(customerBalances)
    .set({ lastStampAt: new Date(Date.now() - 24 * 3600_000) })
    .where(
      and(
        eq(customerBalances.customerId, customerId),
        eq(customerBalances.loyaltyProgramId, loyaltyProgramId),
      ),
    );
}

describe("Fase 3 — scanner: sellado y canje", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "fase3-scanner-password-1";

  let platformAdminAuthUserId: string;

  // Negocio principal: dueño + staff asignado a locationA1, + una segunda
  // sucursal (locationA2) para probar "sucursal no asignada", + un staff
  // SEPARADO ya inactivo desde su creación (evita mutar/restaurar estado
  // compartido entre tests, que sería frágil ante reordenamientos).
  let businessAId: string;
  let ownerAAuthUserId: string;
  let staffAAuthUserId: string;
  let inactiveStaffAuthUserId: string;
  let locationA1Id: string;
  let locationA2Id: string;
  let employeeAId: string;
  let programAId: string;
  let ruleAId: string;
  let sessionOwnerA: TenantSession;
  let sessionStaffA: TenantSession;
  let sessionInactiveStaffA: TenantSession;

  // Negocio B: solo para probar aislamiento cross-tenant (token y sucursal).
  let businessBId: string;
  let ownerBAuthUserId: string;
  let locationBId: string;
  let sessionOwnerB: TenantSession;
  let customerBToken: string;

  // Negocio dedicado y suspendido: probar rechazo con sesión válida.
  let suspendedBusinessId: string;
  let suspendedOwnerAuthUserId: string;
  let sessionSuspendedOwner: TenantSession;
  let suspendedLocationId: string;
  let suspendedCustomerId: string;

  beforeAll(async () => {
    resetLookupRateLimiter();
    platformAdminAuthUserId = await createPlatformAdmin(
      `fase3-admin-${suffix}@test.dev`,
      password,
    );

    // --- Negocio A ---
    const ownerAEmail = `fase3-owner-a-${suffix}@test.dev`;
    const a = await createBusinessWithRealOwner({
      businessName: `Fase3 A ${suffix}`,
      slug: `fase3-a-${suffix}`,
      ownerEmail: ownerAEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessAId = a.business.id;
    ownerAAuthUserId = a.ownerAuthUserId;

    const staffAEmail = `fase3-staff-a-${suffix}@test.dev`;
    staffAAuthUserId = await createRealStaffUser({
      businessId: businessAId,
      email: staffAEmail,
      password,
    });
    const inactiveStaffEmail = `fase3-staff-inactive-a-${suffix}@test.dev`;
    inactiveStaffAuthUserId = await createRealStaffUser({
      businessId: businessAId,
      email: inactiveStaffEmail,
      password,
    });

    const [locA1] = await adminDb
      .insert(locations)
      .values({ businessId: businessAId, name: "Sucursal A1" })
      .returning();
    locationA1Id = locA1.id;
    const [locA2] = await adminDb
      .insert(locations)
      .values({ businessId: businessAId, name: "Sucursal A2" })
      .returning();
    locationA2Id = locA2.id;

    const [staffAUserRow] = await adminDb
      .select()
      .from(users)
      .where(
        and(eq(users.businessId, businessAId), eq(users.authUserId, staffAAuthUserId)),
      );
    const [employeeA] = await adminDb
      .insert(employees)
      .values({
        businessId: businessAId,
        userId: staffAUserRow.id,
        primaryLocationId: locationA1Id,
        fullName: "Staff A",
        isActive: true,
      })
      .returning();
    employeeAId = employeeA.id;

    const [inactiveStaffUserRow] = await adminDb
      .select()
      .from(users)
      .where(
        and(
          eq(users.businessId, businessAId),
          eq(users.authUserId, inactiveStaffAuthUserId),
        ),
      );
    await adminDb.insert(employees).values({
      businessId: businessAId,
      userId: inactiveStaffUserRow.id,
      primaryLocationId: locationA1Id,
      fullName: "Staff Inactivo A",
      isActive: false,
    });

    sessionOwnerA = await tenantSession(await signInAsCookieJar(ownerAEmail, password));
    sessionStaffA = await tenantSession(await signInAsCookieJar(staffAEmail, password));
    sessionInactiveStaffA = await tenantSession(
      await signInAsCookieJar(inactiveStaffEmail, password),
    );

    const programResult = await saveProgramForSession(
      sessionOwnerA,
      form({ name: "Programa A", stampsRequired: "5", cooldownMinutes: "60", isActive: "on" }),
    );
    if (!programResult.success) throw new Error(`setup programa: ${programResult.error}`);
    const [programA] = await adminDb
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.businessId, businessAId));
    programAId = programA.id;

    const ruleResult = await saveRewardRuleForSession(
      sessionOwnerA,
      form({ name: "Recompensa A", stampsRequired: "5" }),
    );
    if (!ruleResult.success) throw new Error(`setup regla: ${ruleResult.error}`);
    const [ruleA] = await adminDb
      .select()
      .from(rewardRules)
      .where(eq(rewardRules.businessId, businessAId));
    ruleAId = ruleA.id;

    // --- Negocio B (solo aislamiento) ---
    const ownerBEmail = `fase3-owner-b-${suffix}@test.dev`;
    const b = await createBusinessWithRealOwner({
      businessName: `Fase3 B ${suffix}`,
      slug: `fase3-b-${suffix}`,
      ownerEmail: ownerBEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessBId = b.business.id;
    ownerBAuthUserId = b.ownerAuthUserId;
    const [locB] = await adminDb
      .insert(locations)
      .values({ businessId: businessBId, name: "Sucursal B" })
      .returning();
    locationBId = locB.id;
    sessionOwnerB = await tenantSession(await signInAsCookieJar(ownerBEmail, password));

    const customerB = await createCustomerForSession(
      sessionOwnerB,
      form({ fullName: `Cliente B ${suffix}`, phone: "+52 555 700 0001", dateOfBirth: "1990-01-01" }),
    );
    if (!customerB.success) throw new Error(`setup cliente B: ${customerB.error}`);
    const [customerBRow] = await adminDb
      .select()
      .from(customers)
      .where(eq(customers.businessId, businessBId));
    customerBToken = customerBRow.walletToken;

    // --- Negocio suspendido (dedicado) ---
    const suspendedOwnerEmail = `fase3-owner-susp-${suffix}@test.dev`;
    const susp = await createBusinessWithRealOwner({
      businessName: `Fase3 Suspended ${suffix}`,
      slug: `fase3-susp-${suffix}`,
      ownerEmail: suspendedOwnerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    suspendedBusinessId = susp.business.id;
    suspendedOwnerAuthUserId = susp.ownerAuthUserId;
    const [suspLoc] = await adminDb
      .insert(locations)
      .values({ businessId: suspendedBusinessId, name: "Sucursal Suspendida" })
      .returning();
    suspendedLocationId = suspLoc.id;
    sessionSuspendedOwner = await tenantSession(
      await signInAsCookieJar(suspendedOwnerEmail, password),
    );
    const suspProgram = await saveProgramForSession(
      sessionSuspendedOwner,
      form({ name: "Programa Susp", stampsRequired: "3", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!suspProgram.success) throw new Error(`setup programa suspendido: ${suspProgram.error}`);
    const suspCustomer = await createCustomerForSession(
      sessionSuspendedOwner,
      form({ fullName: "Cliente Susp", phone: "+52 555 700 0002", dateOfBirth: "1990-01-01" }),
    );
    if (!suspCustomer.success) throw new Error(`setup cliente suspendido: ${suspCustomer.error}`);
    const [suspCustomerRow] = await adminDb
      .select()
      .from(customers)
      .where(eq(customers.businessId, suspendedBusinessId));
    suspendedCustomerId = suspCustomerRow.id;
    // Suspender DESPUÉS de crear todo lo anterior (esas operaciones también
    // pasan por requireOperationContext en el caso del scanner, pero acá
    // usan las actions de /rewards y /customers, que no chequean status —
    // ver nota en el cierre de Fase 3 sobre alcance de la revocación).
    await adminDb
      .update(businesses)
      .set({ status: "suspended" })
      .where(eq(businesses.id, suspendedBusinessId));
  });

  afterAll(async () => {
    for (const businessId of [businessAId, businessBId, suspendedBusinessId]) {
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
    }
    await adminDb
      .delete(platformAdmins)
      .where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const admin = supabaseAdminClient();
    for (const authUserId of [
      ownerAAuthUserId,
      staffAAuthUserId,
      inactiveStaffAuthUserId,
      ownerBAuthUserId,
      suspendedOwnerAuthUserId,
      platformAdminAuthUserId,
    ]) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  });

  // Helper: crea un cliente fresco en el negocio A para un test que no
  // quiere compartir balance con otros tests.
  let freshCustomerACounter = 0;
  async function freshCustomerA(name: string) {
    const result = await createCustomerForSession(
      sessionOwnerA,
      form({
        fullName: name,
        phone: `+5282${String(freshCustomerACounter++).padStart(6, "0")}`,
        dateOfBirth: "1990-01-01",
      }),
    );
    if (!result.success) throw new Error(`freshCustomerA: ${result.error}`);
    const [row] = await adminDb
      .select()
      .from(customers)
      .where(and(eq(customers.businessId, businessAId), eq(customers.fullName, name)));
    return row;
  }

  describe("idempotencia y replay", () => {
    it("replay de la misma idempotency_key devuelve el resultado original — un solo sello", async () => {
      const customer = await freshCustomerA(`Replay ${suffix}`);
      const key = crypto.randomUUID();

      const first = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: key,
      });
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.replayed).toBeFalsy();
        expect(first.view.progress.currentStamps).toBe(1);
      }

      const replay = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: key,
      });
      expect(replay.ok).toBe(true);
      if (replay.ok) {
        expect(replay.replayed).toBe(true);
        expect(replay.view.progress.currentStamps).toBe(1);
      }

      const rows = await adminDb
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.businessId, businessAId),
            eq(transactions.idempotencyKey, key),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it("dos requests CONCURRENTES con la misma key producen UN solo sello (no dos)", async () => {
      const customer = await freshCustomerA(`Concurrente misma key ${suffix}`);
      const key = crypto.randomUUID();

      const [r1, r2] = await Promise.all([
        registerStampForSession(sessionStaffA, {
          customerId: customer.id,
          locationId: locationA1Id,
          idempotencyKey: key,
        }),
        registerStampForSession(sessionStaffA, {
          customerId: customer.id,
          locationId: locationA1Id,
          idempotencyKey: key,
        }),
      ]);

      expect(r1.ok && r2.ok).toBe(true);
      // Exactamente una de las dos respuestas es el sello real; la otra es
      // el replay — cuál gana la carrera del lock no es determinista, pero
      // el resultado agregado sí.
      const replayedFlags = [r1, r2].map((r) => (r.ok ? Boolean(r.replayed) : null));
      expect(replayedFlags.sort()).toEqual([false, true]);

      const rows = await adminDb
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.businessId, businessAId),
            eq(transactions.idempotencyKey, key),
          ),
        );
      expect(rows).toHaveLength(1);

      const [balance] = await adminDb
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.customerId, customer.id));
      expect(balance.currentStamps).toBe(1);
    });

    it("dos requests concurrentes con keys DISTINTAS: uno sella, el otro cae en cooldown (nunca dos sellos)", async () => {
      const customer = await freshCustomerA(`Concurrente distinta key ${suffix}`);

      const [r1, r2] = await Promise.all([
        registerStampForSession(sessionStaffA, {
          customerId: customer.id,
          locationId: locationA1Id,
          idempotencyKey: crypto.randomUUID(),
        }),
        registerStampForSession(sessionStaffA, {
          customerId: customer.id,
          locationId: locationA1Id,
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);

      const results = [r1, r2];
      const succeeded = results.filter((r) => r.ok && !r.replayed);
      const rejected = results.filter((r) => !r.ok);
      // El lock serializa: como el programa tiene cooldown de 60 min, el
      // segundo en tomar el lock siempre ve un last_stamp_at recién puesto
      // y cae en cooldown — nunca los dos sellan.
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (!rejected[0].ok) {
        expect(rejected[0].code).toBe("cooldown");
      }

      const [balance] = await adminDb
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.customerId, customer.id));
      expect(balance.currentStamps).toBe(1);
    });
  });

  describe("cooldown", () => {
    it("un intento dentro del cooldown se rechaza y no crea NINGUNA fila nueva", async () => {
      const customer = await freshCustomerA(`Cooldown ${suffix}`);
      const key1 = crypto.randomUUID();
      const first = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: key1,
      });
      expect(first.ok).toBe(true);

      const beforeCount = (
        await adminDb.select().from(transactions).where(eq(transactions.customerId, customer.id))
      ).length;

      const second = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.code).toBe("cooldown");
        expect(second.error).toContain("registrado");
      }

      const afterCount = (
        await adminDb.select().from(transactions).where(eq(transactions.customerId, customer.id))
      ).length;
      expect(afterCount).toBe(beforeCount);
    });

    it("tras 'esperar' (last_stamp_at en el pasado), el siguiente sello sí se permite", async () => {
      const customer = await freshCustomerA(`Cooldown liberado ${suffix}`);
      await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });
      await clearCooldown(customer.id, programAId);

      const result = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.view.progress.currentStamps).toBe(2);
    });
  });

  describe("canje: sellos insuficientes y concurrencia", () => {
    it("canjear sin sellos suficientes se rechaza con el faltante", async () => {
      const customer = await freshCustomerA(`Canje insuficiente ${suffix}`);
      const result = await redeemRewardForSession(sessionStaffA, {
        customerId: customer.id,
        ruleId: ruleAId,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/insuficientes/);
    });

    it("dos canjes concurrentes con sellos para uno solo: UNA sola redemption gana", async () => {
      const customer = await freshCustomerA(`Canje concurrente ${suffix}`);
      // Llega a exactamente 5 sellos (el costo de la regla) sin chocar con
      // el cooldown de 60 min, saltando last_stamp_at hacia atrás entre
      // sellos.
      for (let i = 0; i < 5; i++) {
        await registerStampForSession(sessionStaffA, {
          customerId: customer.id,
          locationId: locationA1Id,
          idempotencyKey: crypto.randomUUID(),
        });
        if (i < 4) await clearCooldown(customer.id, programAId);
      }
      const [balanceBefore] = await adminDb
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.customerId, customer.id));
      expect(balanceBefore.currentStamps).toBe(5);

      const [r1, r2] = await Promise.all([
        redeemRewardForSession(sessionStaffA, {
          customerId: customer.id,
          ruleId: ruleAId,
          locationId: locationA1Id,
          idempotencyKey: crypto.randomUUID(),
        }),
        redeemRewardForSession(sessionStaffA, {
          customerId: customer.id,
          ruleId: ruleAId,
          locationId: locationA1Id,
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);

      const succeeded = [r1, r2].filter((r) => r.ok && !r.replayed);
      const rejected = [r1, r2].filter((r) => !r.ok);
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (!rejected[0].ok) {
        expect(rejected[0].error).toMatch(/insuficientes/);
      }

      const redemptionRows = await adminDb
        .select()
        .from(redemptions)
        .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
        .where(eq(rewards.customerId, customer.id));
      expect(redemptionRows).toHaveLength(1);

      const [balanceAfter] = await adminDb
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.customerId, customer.id));
      expect(balanceAfter.currentStamps).toBe(0);
    });
  });

  describe("cross-tenant (IDOR) y revocación en vivo", () => {
    it("el token de un cliente de OTRO negocio, escaneado por staff de A, da 'no encontrado' — idéntico a un token basura", async () => {
      const crossTenant = await lookupCustomerByTokenForSession(sessionStaffA, customerBToken);
      const garbage = await lookupCustomerByTokenForSession(sessionStaffA, "token-que-no-existe-en-ningun-lado");

      expect(crossTenant.ok).toBe(false);
      expect(garbage.ok).toBe(false);
      if (!crossTenant.ok && !garbage.ok) {
        expect(crossTenant.error).toBe(garbage.error);
      }
    });

    it("negocio suspendido: sellar y canjear se rechazan con una sesión JWT válida", async () => {
      const stampResult = await registerStampForSession(sessionSuspendedOwner, {
        customerId: suspendedCustomerId,
        locationId: suspendedLocationId,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(stampResult.ok).toBe(false);
      if (!stampResult.ok) expect(stampResult.error).toMatch(/suspendido/);

      const redeemResult = await redeemRewardForSession(sessionSuspendedOwner, {
        customerId: suspendedCustomerId,
        ruleId: "00000000-0000-0000-0000-0000000000ff", // no llega a evaluarse: corta antes por negocio suspendido
        locationId: suspendedLocationId,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(redeemResult.ok).toBe(false);
      if (!redeemResult.ok) expect(redeemResult.error).toMatch(/suspendido/);
    });

    it("empleado desactivado: sellar y canjear se rechazan con una sesión JWT válida", async () => {
      const customer = await freshCustomerA(`Empleado inactivo ${suffix}`);
      const stampResult = await registerStampForSession(sessionInactiveStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(stampResult.ok).toBe(false);
      if (!stampResult.ok) expect(stampResult.error).toMatch(/desactivada/);

      const redeemResult = await redeemRewardForSession(sessionInactiveStaffA, {
        customerId: customer.id,
        ruleId: ruleAId,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(redeemResult.ok).toBe(false);
      if (!redeemResult.ok) expect(redeemResult.error).toMatch(/desactivada/);

      const rows = await adminDb
        .select()
        .from(transactions)
        .where(eq(transactions.customerId, customer.id));
      expect(rows).toHaveLength(0);
    });
  });

  describe("sucursal: seleccionada y validada contra la DB", () => {
    it("una sucursal de OTRO negocio se rechaza (nunca confía en el location_id enviado)", async () => {
      const customer = await freshCustomerA(`Sucursal ajena ${suffix}`);
      const result = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationBId,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/sucursal/i);
    });

    it("un empleado con sucursal primaria fijada no puede operar desde OTRA sucursal del mismo negocio", async () => {
      const customer = await freshCustomerA(`Sucursal no asignada ${suffix}`);
      const result = await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA2Id, // staffA está asignado a A1, no A2
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/asignad/);
    });

    it("el dueño (sin ficha de empleado) puede operar en CUALQUIER sucursal activa del negocio", async () => {
      const customer = await freshCustomerA(`Owner cualquier sucursal ${suffix}`);
      const result = await registerStampForSession(sessionOwnerA, {
        customerId: customer.id,
        locationId: locationA2Id,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("auditoría", () => {
    it("un sello deja audit_log con actor_user_id + actor_employee_id + location_id", async () => {
      const customer = await freshCustomerA(`Audit sello ${suffix}`);
      await registerStampForSession(sessionStaffA, {
        customerId: customer.id,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });

      const [log] = await adminDb
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, customer.id), eq(auditLogs.action, "stamp.registered")),
        );
      expect(log).toBeDefined();
      expect(log.actorUserId).not.toBeNull();
      expect(log.actorEmployeeId).toBe(employeeAId);
      expect(log.locationId).toBe(locationA1Id);
      expect(log.actorAuthUserId).toBeNull();
    });

    it("un canje deja audit_log con actor_user_id + actor_employee_id + location_id", async () => {
      const customer = await freshCustomerA(`Audit canje ${suffix}`);
      for (let i = 0; i < 5; i++) {
        await registerStampForSession(sessionStaffA, {
          customerId: customer.id,
          locationId: locationA1Id,
          idempotencyKey: crypto.randomUUID(),
        });
        if (i < 4) await clearCooldown(customer.id, programAId);
      }
      await redeemRewardForSession(sessionStaffA, {
        customerId: customer.id,
        ruleId: ruleAId,
        locationId: locationA1Id,
        idempotencyKey: crypto.randomUUID(),
      });

      const [log] = await adminDb
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, customer.id), eq(auditLogs.action, "reward.redeemed")),
        );
      expect(log).toBeDefined();
      expect(log.actorUserId).not.toBeNull();
      expect(log.actorEmployeeId).toBe(employeeAId);
      expect(log.locationId).toBe(locationA1Id);
    });
  });
});

describe("rate limiter del lookup — funciones puras, sin DB", () => {
  const fakeUser = "rate-limit-test-user-fixed-id";

  it("permite hasta el máximo de la ventana y luego bloquea", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) {
      expect(checkLookupRateLimit(fakeUser, t0 + i).allowed).toBe(true);
    }
    const blocked = checkLookupRateLimit(fakeUser, t0 + 30);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("después de la ventana de bloqueo, vuelve a permitir", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 30; i++) checkLookupRateLimit(`${fakeUser}-2`, t0 + i);
    const blocked = checkLookupRateLimit(`${fakeUser}-2`, t0 + 30);
    expect(blocked.allowed).toBe(false);

    const afterBlock = checkLookupRateLimit(`${fakeUser}-2`, t0 + 30 + 61_000);
    expect(afterBlock.allowed).toBe(true);
  });

  it("fallos repetidos (tokens inválidos) también disparan el bloqueo", () => {
    const t0 = 3_000_000;
    const user = `${fakeUser}-3`;
    for (let i = 0; i < 9; i++) recordLookupFailure(user, t0 + i * 1000);
    // 9 fallos: todavía no bloquea.
    expect(checkLookupRateLimit(user, t0 + 9000).allowed).toBe(true);
    recordLookupFailure(user, t0 + 9000);
    // 10º fallo: dispara el bloqueo.
    const blocked = checkLookupRateLimit(user, t0 + 9500);
    expect(blocked.allowed).toBe(false);
  });
});

describe("rate limiter del sellado — función pura, sin DB", () => {
  const fakeUser = "stamp-rate-limit-test-user-fixed-id";

  it("permite hasta el máximo de la ventana (60/60s) y luego bloquea", () => {
    const t0 = 4_000_000;
    for (let i = 0; i < 60; i++) {
      expect(checkStampRateLimit(fakeUser, t0 + i).allowed).toBe(true);
    }
    const blocked = checkStampRateLimit(fakeUser, t0 + 60);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("dos empleados distintos tienen contadores independientes", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 60; i++) checkStampRateLimit(`${fakeUser}-a`, t0 + i);
    expect(checkStampRateLimit(`${fakeUser}-a`, t0 + 60).allowed).toBe(false);
    // El otro empleado arranca fresco.
    expect(checkStampRateLimit(`${fakeUser}-b`, t0 + 60).allowed).toBe(true);
  });
});

describe("Fase 3 — piso mínimo entre sellos (30s)", () => {
  const suffix = `floor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "fase3-floor-password-1";

  let ownerAuthUserId: string;
  let businessId: string;
  let locationId: string;
  let sessionOwner: TenantSession;

  beforeAll(async () => {
    resetLookupRateLimiter();
    const platformAdminAuthUserId = await createPlatformAdmin(
      `fase3-floor-admin-${suffix}@test.dev`,
      password,
    );
    const ownerEmail = `fase3-floor-owner-${suffix}@test.dev`;
    const business = await createBusinessWithRealOwner({
      businessName: `Fase3 Floor ${suffix}`,
      slug: `fase3-floor-${suffix}`,
      ownerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessId = business.business.id;
    ownerAuthUserId = business.ownerAuthUserId;

    const [loc] = await adminDb
      .insert(locations)
      .values({ businessId, name: "Sucursal única" })
      .returning();
    locationId = loc.id;

    sessionOwner = await tenantSession(await signInAsCookieJar(ownerEmail, password));

    // Cooldown DESACTIVADO a nivel de programa (0 minutos) — el piso duro
    // de 30s debe seguir aplicando de todas formas.
    const programResult = await saveProgramForSession(
      sessionOwner,
      form({ name: "Programa Floor", stampsRequired: "5", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!programResult.success) throw new Error(`setup programa: ${programResult.error}`);
  });

  afterAll(async () => {
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
    await adminDb.delete(transactions).where(eq(transactions.businessId, businessId));
    await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, businessId));
    await adminDb.delete(customers).where(eq(customers.businessId, businessId));
    await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
    await adminDb.delete(locations).where(eq(locations.businessId, businessId));
    await adminDb.delete(users).where(eq(users.businessId, businessId));
    await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    await supabaseAdminClient().auth.admin.deleteUser(ownerAuthUserId);
  });

  it("con cooldown de programa en 0, un segundo sello inmediato igual se rechaza (piso de 30s)", async () => {
    const [customer] = await adminDb
      .insert(customers)
      .values({ businessId, fullName: `Floor ${suffix}`, walletToken: crypto.randomUUID() })
      .returning();

    const first = await registerStampForSession(sessionOwner, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(first.ok).toBe(true);

    const second = await registerStampForSession(sessionOwner, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("cooldown");
  });

  it("31s después (con cooldown de programa en 0), el siguiente sello sí se permite", async () => {
    const [customer] = await adminDb
      .insert(customers)
      .values({ businessId, fullName: `Floor liberado ${suffix}`, walletToken: crypto.randomUUID() })
      .returning();

    await registerStampForSession(sessionOwner, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    await adminDb
      .update(customerBalances)
      .set({ lastStampAt: new Date(Date.now() - 31_000) })
      .where(eq(customerBalances.customerId, customer.id));

    const result = await registerStampForSession(sessionOwner, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);
  });
});
