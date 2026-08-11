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
  transactions,
  users,
  walletPasses,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createCustomerForSession } from "../app/(product)/customers/logic";
import { saveProgramForSession, saveRewardRuleForSession } from "../app/(product)/rewards/logic";
import { registerStampForSession } from "../app/(product)/scanner/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import {
  __resetWalletAdaptersForTests,
  getFakeApnsSentPushes,
  getFakeGoogleWalletCalls,
} from "../lib/wallet/adapters";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  createRealStaffUser,
  form,
  signInAsCookieJar,
} from "./support/testAuth";

// Definición de "listo" del hook post-transacción (paso g/j de Fase 4):
// UN sello real (mismo código que /scanner) encola EXACTAMENTE un push a
// Apple por dispositivo registrado y EXACTAMENTE un PATCH a Google si el
// cliente tiene un pase de esa plataforma — con las impls FAKE activas
// (sin WALLET_APPLE_*/WALLET_GOOGLE_* en el entorno de test). Un push que
// falla NUNCA revierte el sello (la transacción de negocio ya se confirmó
// en DB antes de que notify.ts corra) — CLAUDE.md, regla no negociable.
//
// El hook corre vía scheduleAfterResponse: fuera de una request real de
// Next.js (este test llama registerStampForSession directo, como toda la
// suite desde Fase 2), cae a un fire-and-forget SIN awaitear — por eso las
// aserciones usan waitFor() en vez de leer el array inmediatamente después
// del await a registerStampForSession.

async function tenantSession(jar: CookieMethodsServer): Promise<TenantSession> {
  const session = await requireTenantSession(jar);
  if (!session) throw new Error("sesión de tenant inválida en el setup");
  return session;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: tiempo agotado esperando la condición");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// Este archivo exige las impls FAKE de Apple y Google — es lo único que
// puede grabar llamadas (getFakeApnsSentPushes/getFakeGoogleWalletCalls).
// resolveWalletConfig() (packages/wallet/src/config.ts) decide real-vs-fake
// leyendo process.env directo, así que NO basta con que el entorno de CI no
// tenga WALLET_GOOGLE_*/WALLET_APPLE_* — un .env.local de desarrollo con
// credenciales reales de Google (necesarias para probar el link real de
// "Agregar a Google Wallet" en otras partes de la app) activaría la impl
// real acá también y getFakeGoogleWalletCalls() devolvería null. Por eso
// este archivo borra esas variables del process.env SOLO durante su propia
// ejecución y fuerza __resetWalletAdaptersForTests() (lib/wallet/adapters.ts
// ya la expone para exactamente este caso: "los tests... cambian
// process.env entre casos... sin esto los adaptadores memoizados
// contaminarían") — nunca toca el archivo .env.local en sí.
const WALLET_ENV_KEYS = [
  "WALLET_APPLE_TEAM_ID",
  "WALLET_APPLE_PASS_TYPE_IDENTIFIER",
  "WALLET_APPLE_PASS_CERT_PEM",
  "WALLET_APPLE_PASS_KEY_PEM",
  "WALLET_APPLE_WWDR_CERT_PEM",
  "WALLET_APPLE_APNS_KEY_ID",
  "WALLET_APPLE_APNS_PRIVATE_KEY_PEM",
  "WALLET_GOOGLE_ISSUER_ID",
  "WALLET_GOOGLE_SERVICE_ACCOUNT_JSON",
] as const;

describe("notifyWalletOfTransaction — hook post-sello, Apple + Google, impls fake", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "wallet-notify-password-1";
  const originalWalletEnv: Partial<Record<(typeof WALLET_ENV_KEYS)[number], string>> = {};

  let platformAdminAuthUserId: string;
  let businessId: string;
  let ownerAuthUserId: string;
  let staffAuthUserId: string;
  let locationId: string;
  let sessionOwner: TenantSession;
  let sessionStaff: TenantSession;
  let programId: string;

  beforeAll(async () => {
    for (const key of WALLET_ENV_KEYS) {
      const value = process.env[key];
      if (value !== undefined) {
        originalWalletEnv[key] = value;
        delete process.env[key];
      }
    }
    __resetWalletAdaptersForTests();

    platformAdminAuthUserId = await createPlatformAdmin(`wallet-notify-admin-${suffix}@test.dev`, password);
    const ownerEmail = `wallet-notify-owner-${suffix}@test.dev`;
    const biz = await createBusinessWithRealOwner({
      businessName: `Wallet Notify ${suffix}`,
      slug: `wallet-notify-${suffix}`,
      ownerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessId = biz.business.id;
    ownerAuthUserId = biz.ownerAuthUserId;

    const staffEmail = `wallet-notify-staff-${suffix}@test.dev`;
    staffAuthUserId = await createRealStaffUser({ businessId, email: staffEmail, password });

    const [loc] = await adminDb.insert(locations).values({ businessId, name: "Sucursal Notify" }).returning();
    locationId = loc.id;

    const [staffUserRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessId), eq(users.authUserId, staffAuthUserId)));
    await adminDb.insert(employees).values({
      businessId,
      userId: staffUserRow.id,
      primaryLocationId: locationId,
      fullName: "Staff Notify",
      isActive: true,
    });

    sessionOwner = await tenantSession(await signInAsCookieJar(ownerEmail, password));
    sessionStaff = await tenantSession(await signInAsCookieJar(staffEmail, password));

    const program = await saveProgramForSession(
      sessionOwner,
      form({ name: "Programa Notify", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!program.success) throw new Error(`setup programa: ${program.error}`);
    const [programRow] = await adminDb.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
    programId = programRow.id;

    await saveRewardRuleForSession(sessionOwner, form({ name: "Recompensa Notify", stampsRequired: "6" }));
  });

  afterAll(async () => {
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
    await adminDb.delete(deviceRegistrations).where(eq(deviceRegistrations.businessId, businessId));
    await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, businessId));
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

    // Restaura el process.env real (p.ej. las credenciales de Google de
    // .env.local) para que archivos de test que corran DESPUÉS de este en
    // el mismo proceso (fileParallelism: false, ver vitest.config.ts) vean
    // el entorno tal cual estaba — nunca dejar el override global filtrado.
    for (const key of WALLET_ENV_KEYS) {
      if (originalWalletEnv[key] !== undefined) {
        process.env[key] = originalWalletEnv[key];
      }
    }
    __resetWalletAdaptersForTests();
  });

  async function freshCustomer(name: string) {
    const result = await createCustomerForSession(sessionOwner, form({ fullName: name }));
    if (!result.success) throw new Error(`freshCustomer: ${result.error}`);
    const [row] = await adminDb
      .select()
      .from(customers)
      .where(and(eq(customers.businessId, businessId), eq(customers.fullName, name)));
    return row;
  }

  it("sin wallet_passes/device_registrations, un sello no encola ningún push ni PATCH", async () => {
    const customer = await freshCustomer(`Sin pase ${suffix}`);
    const before = getFakeApnsSentPushes().length;

    const result = await registerStampForSession(sessionStaff, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);

    // No hay predicado positivo que esperar (nada debería pasar) — un
    // margen corto es suficiente para detectar un push indebido sin hacer
    // el test lento.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getFakeApnsSentPushes().length).toBe(before);
  });

  it("con un dispositivo Apple registrado, un sello encola EXACTAMENTE un push a ese dispositivo", async () => {
    const customer = await freshCustomer(`Con Apple ${suffix}`);
    const [pass] = await adminDb
      .insert(walletPasses)
      .values({
        businessId,
        customerId: customer.id,
        platform: "apple",
        authenticationToken: `tok-${crypto.randomUUID()}`,
      })
      .returning();
    await adminDb.insert(deviceRegistrations).values({
      businessId,
      walletPassId: pass.id,
      deviceLibraryIdentifier: `device-${crypto.randomUUID()}`,
      pushToken: `push-token-${crypto.randomUUID()}`,
    });

    const before = getFakeApnsSentPushes().length;
    const result = await registerStampForSession(sessionStaff, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);

    await waitFor(() => getFakeApnsSentPushes().length === before + 1);
    const pushes = getFakeApnsSentPushes();
    expect(pushes.at(-1)?.passTypeIdentifier).toBe("pass.dev.loyalty.fake");

    // Estable un momento más: no debería llegar un SEGUNDO push tardío.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getFakeApnsSentPushes().length).toBe(before + 1);
  });

  // Bug real encontrado y confirmado: listUpdatedSerialsForDevice (el
  // endpoint "What Changed?" que Apple consulta tras el push, ver
  // apps/web/app/api/wallet/apple/logic.ts) filtra por
  // wallet_passes.updated_at — sin este bump, un pase creado antes del
  // último checkpoint del dispositivo NUNCA calificaba como "cambiado",
  // sin importar cuántos sellos recibiera después. El push llegaba, el
  // dispositivo preguntaba, pero la respuesta decía "nada tuyo" para
  // siempre.
  it("un sello bumpea wallet_passes.updated_at — sin esto, el dispositivo nunca sabe que hay algo nuevo que pedir", async () => {
    const customer = await freshCustomer(`Bump updated_at ${suffix}`);
    const backdated = new Date(Date.now() - 60_000); // 1 minuto atrás
    const [pass] = await adminDb
      .insert(walletPasses)
      .values({
        businessId,
        customerId: customer.id,
        platform: "apple",
        authenticationToken: `tok-${crypto.randomUUID()}`,
        updatedAt: backdated,
      })
      .returning();

    const result = await registerStampForSession(sessionStaff, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);

    // El bump corre dentro del mismo hook post-transacción — sin
    // dispositivo registrado no hay push que esperar, pero el bump SÍ
    // debe correr igual (un dispositivo que se registre después también
    // necesita ver el estado de sync correcto).
    await waitFor(async () => {
      const [row] = await adminDb
        .select({ updatedAt: walletPasses.updatedAt })
        .from(walletPasses)
        .where(eq(walletPasses.id, pass.id))
        .limit(1);
      return (row?.updatedAt.getTime() ?? 0) > backdated.getTime();
    });
  });

  it("un replay (misma idempotency_key) NO dispara un push nuevo", async () => {
    const customer = await freshCustomer(`Replay notify ${suffix}`);
    const [pass] = await adminDb
      .insert(walletPasses)
      .values({
        businessId,
        customerId: customer.id,
        platform: "apple",
        authenticationToken: `tok-${crypto.randomUUID()}`,
      })
      .returning();
    await adminDb.insert(deviceRegistrations).values({
      businessId,
      walletPassId: pass.id,
      deviceLibraryIdentifier: `device-${crypto.randomUUID()}`,
      pushToken: `push-token-${crypto.randomUUID()}`,
    });

    const key = crypto.randomUUID();
    const beforeFirst = getFakeApnsSentPushes().length;
    await registerStampForSession(sessionStaff, { customerId: customer.id, locationId, idempotencyKey: key });
    await waitFor(() => getFakeApnsSentPushes().length === beforeFirst + 1);
    const afterFirst = getFakeApnsSentPushes().length;

    const replay = await registerStampForSession(sessionStaff, {
      customerId: customer.id,
      locationId,
      idempotencyKey: key,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.replayed).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(getFakeApnsSentPushes().length).toBe(afterFirst);
  });

  it("con un pase de Google, un sello dispara EXACTAMENTE un upsertLoyaltyObject con el balance nuevo", async () => {
    const customer = await freshCustomer(`Con Google ${suffix}`);
    await adminDb.insert(walletPasses).values({
      businessId,
      customerId: customer.id,
      platform: "google",
      authenticationToken: `tok-${crypto.randomUUID()}`,
    });

    const fakeGoogle = getFakeGoogleWalletCalls();
    expect(fakeGoogle).not.toBeNull();
    const before = fakeGoogle!.patchCalls.length + fakeGoogle!.insertCalls.length;

    const result = await registerStampForSession(sessionStaff, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);

    await waitFor(() => fakeGoogle!.patchCalls.length + fakeGoogle!.insertCalls.length === before + 1);
    const allCalls = [...fakeGoogle!.insertCalls, ...fakeGoogle!.patchCalls];
    const lastCall = allCalls.at(-1)!;
    expect(lastCall.url).toContain("loyaltyObject");
    expect((lastCall.payload as { id: string }).id).toContain(customer.id);
    const points = lastCall.payload as { loyaltyPoints: { balance: { string: string } } };
    expect(points.loyaltyPoints.balance.string).toBe("1 / 6");
  });

  it("un push que falla NUNCA revierte el sello ya confirmado en DB", async () => {
    // No hace falta forzar un fallo del sender fake: basta con confirmar
    // que registerStampForSession resuelve y persiste el balance INDEPEN-
    // DIENTEMENTE del resultado del hook — notifyWalletOfTransaction corre
    // DESPUÉS de que withTenantContext ya confirmó (ver scanner/logic.ts),
    // así que un fallo ahí no tiene ningún camino de vuelta hacia la
    // transacción. Esto ejercita esa garantía con datos reales, sin
    // necesidad de un sender que lance para probarlo — la propiedad es
    // estructural (orden de las operaciones), no condicional a que falle.
    const customer = await freshCustomer(`Push no revierte ${suffix}`);
    const [pass] = await adminDb
      .insert(walletPasses)
      .values({
        businessId,
        customerId: customer.id,
        platform: "apple",
        authenticationToken: `tok-${crypto.randomUUID()}`,
      })
      .returning();
    await adminDb.insert(deviceRegistrations).values({
      businessId,
      walletPassId: pass.id,
      deviceLibraryIdentifier: `device-${crypto.randomUUID()}`,
      pushToken: `push-token-${crypto.randomUUID()}`,
    });

    const result = await registerStampForSession(sessionStaff, {
      customerId: customer.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.progress.currentStamps).toBe(1);
    }

    const [balance] = await adminDb
      .select()
      .from(customerBalances)
      .where(and(eq(customerBalances.customerId, customer.id), eq(customerBalances.loyaltyProgramId, programId)));
    expect(balance.currentStamps).toBe(1);
  });
});
