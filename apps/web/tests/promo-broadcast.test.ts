import type { CookieMethodsServer } from "@supabase/ssr";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  customers,
  deviceRegistrations,
  platformAdmins,
  promoBroadcasts,
  users,
  walletPasses,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { sendPromoBroadcastForSession } from "../app/(product)/promotions/logic";
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
  supabaseAdminClient,
} from "./support/testAuth";

// Definición de "listo" del broadcast de promociones a Wallet (owner
// redacta un mensaje, se empuja a TODOS los clientes del negocio con el
// pase guardado — ver app/(product)/promotions/logic.ts): gate owner-only,
// gate de plan (básico bloqueado), límites diario/mensual server-side,
// aislamiento cross-tenant en los pushes, y auditoría. Mismo armazón que
// wallet-notify.test.ts: impls FAKE de Apple/Google, sesiones reales,
// waitFor() porque el hook corre vía scheduleAfterResponse (fire-and-forget
// fuera de una request real).

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

describe("sendPromoBroadcastForSession — broadcast de promociones a Wallet", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "promo-broadcast-password-1";
  const originalWalletEnv: Partial<Record<(typeof WALLET_ENV_KEYS)[number], string>> = {};

  let platformAdminAuthUserId: string;
  const businessIds: string[] = [];
  const authUserIds: string[] = [];

  let businessAId: string;
  let sessionOwnerA: TenantSession;
  let sessionStaffA: TenantSession;
  let ownerAUserId: string;

  let businessBId: string;
  let sessionOwnerB: TenantSession;

  let businessBasicoId: string;
  let sessionOwnerBasico: TenantSession;

  let businessMonthlyId: string;
  let sessionOwnerMonthly: TenantSession;
  let ownerMonthlyUserId: string;

  let businessConcurrentId: string;
  let sessionOwnerConcurrent: TenantSession;

  async function setupBusiness(label: string, plan: "basico" | "negocio" | "intelligence") {
    const ownerEmail = `promo-${label}-owner-${suffix}@test.dev`;
    const biz = await createBusinessWithRealOwner({
      businessName: `Promo ${label} ${suffix}`,
      slug: `promo-${label}-${suffix}`,
      ownerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessIds.push(biz.business.id);
    authUserIds.push(biz.ownerAuthUserId);
    if (plan !== "basico") {
      await adminDb.update(businesses).set({ plan }).where(eq(businesses.id, biz.business.id));
    }
    const session = await tenantSession(await signInAsCookieJar(ownerEmail, password));
    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, biz.business.id), eq(users.authUserId, biz.ownerAuthUserId)));
    return { businessId: biz.business.id, session, ownerAuthUserId: biz.ownerAuthUserId, userId: userRow.id };
  }

  async function freshCustomer(businessId: string) {
    const [row] = await adminDb
      .insert(customers)
      .values({ businessId, walletToken: crypto.randomUUID() })
      .returning();
    return row;
  }

  async function registerAppleDevice(businessId: string, customerId: string) {
    const [pass] = await adminDb
      .insert(walletPasses)
      .values({
        businessId,
        customerId,
        platform: "apple",
        authenticationToken: `tok-${crypto.randomUUID()}`,
      })
      .returning();
    const pushToken = `push-token-${crypto.randomUUID()}`;
    await adminDb.insert(deviceRegistrations).values({
      businessId,
      walletPassId: pass.id,
      deviceLibraryIdentifier: `device-${crypto.randomUUID()}`,
      pushToken,
    });
    return pushToken;
  }

  async function registerGooglePass(businessId: string, customerId: string) {
    await adminDb.insert(walletPasses).values({
      businessId,
      customerId,
      platform: "google",
      authenticationToken: `tok-${crypto.randomUUID()}`,
    });
  }

  beforeAll(async () => {
    for (const key of WALLET_ENV_KEYS) {
      const value = process.env[key];
      if (value !== undefined) {
        originalWalletEnv[key] = value;
        delete process.env[key];
      }
    }
    __resetWalletAdaptersForTests();

    platformAdminAuthUserId = await createPlatformAdmin(`promo-admin-${suffix}@test.dev`, password);

    const a = await setupBusiness("a", "negocio");
    businessAId = a.businessId;
    sessionOwnerA = a.session;
    ownerAUserId = a.userId;
    const staffAEmail = `promo-a-staff-${suffix}@test.dev`;
    const staffAAuthUserId = await createRealStaffUser({ businessId: businessAId, email: staffAEmail, password });
    authUserIds.push(staffAAuthUserId);
    sessionStaffA = await tenantSession(await signInAsCookieJar(staffAEmail, password));

    const b = await setupBusiness("b", "negocio");
    businessBId = b.businessId;
    sessionOwnerB = b.session;

    const basico = await setupBusiness("basico", "basico");
    businessBasicoId = basico.businessId;
    sessionOwnerBasico = basico.session;

    const monthly = await setupBusiness("monthly", "negocio");
    businessMonthlyId = monthly.businessId;
    sessionOwnerMonthly = monthly.session;
    ownerMonthlyUserId = monthly.userId;

    const concurrent = await setupBusiness("concurrent", "negocio");
    businessConcurrentId = concurrent.businessId;
    sessionOwnerConcurrent = concurrent.session;
  });

  afterAll(async () => {
    for (const businessId of businessIds) {
      await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
      await adminDb.delete(promoBroadcasts).where(eq(promoBroadcasts.businessId, businessId));
      await adminDb.delete(deviceRegistrations).where(eq(deviceRegistrations.businessId, businessId));
      await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, businessId));
      await adminDb.delete(customers).where(eq(customers.businessId, businessId));
      await adminDb.delete(users).where(eq(users.businessId, businessId));
      await adminDb.delete(businesses).where(eq(businesses.id, businessId));
    }
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, platformAdminAuthUserId));

    const admin = supabaseAdminClient();
    for (const authUserId of [...authUserIds, platformAdminAuthUserId]) {
      await admin.auth.admin.deleteUser(authUserId);
    }

    for (const key of WALLET_ENV_KEYS) {
      if (originalWalletEnv[key] !== undefined) {
        process.env[key] = originalWalletEnv[key];
      }
    }
    __resetWalletAdaptersForTests();
  });

  it("owner en plan negocio envía una promoción: fila creada, audit log, push a TODOS los dispositivos del negocio, addLoyaltyClassMessage a Google", async () => {
    const customer1 = await freshCustomer(businessAId);
    const customer2 = await freshCustomer(businessAId);
    const pushToken1 = await registerAppleDevice(businessAId, customer1.id);
    const pushToken2 = await registerAppleDevice(businessAId, customer2.id);
    await registerGooglePass(businessAId, customer1.id);

    const beforeApns = getFakeApnsSentPushes().length;
    const fakeGoogle = getFakeGoogleWalletCalls();
    expect(fakeGoogle).not.toBeNull();
    const beforeGoogle = fakeGoogle!.insertCalls.length + fakeGoogle!.patchCalls.length;

    const result = await sendPromoBroadcastForSession(
      sessionOwnerA,
      form({ message: "2x1 hoy hasta las 8pm" }),
    );
    expect(result.success).toBeDefined();

    const [row] = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessAId));
    expect(row.message).toBe("2x1 hoy hasta las 8pm");
    expect(row.sentByUserId).toBe(ownerAUserId);

    const [log] = await adminDb
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.businessId, businessAId), eq(auditLogs.action, "promo_broadcast.sent")));
    expect(log).toBeDefined();
    expect(log.entityType).toBe("promo_broadcast");

    await waitFor(() => getFakeApnsSentPushes().length === beforeApns + 2);
    const newPushTokens = getFakeApnsSentPushes()
      .slice(beforeApns)
      .map((push) => push.pushToken);
    expect(newPushTokens.sort()).toEqual([pushToken1, pushToken2].sort());

    await waitFor(() => fakeGoogle!.insertCalls.length + fakeGoogle!.patchCalls.length === beforeGoogle + 1);
    const allCalls = [...fakeGoogle!.insertCalls, ...fakeGoogle!.patchCalls];
    const lastCall = allCalls.at(-1)!;
    expect(lastCall.url).toContain("loyaltyClass");
    expect(lastCall.url).toContain("addMessage");
  });

  it("staff NO puede enviar una promoción (gate owner-only), cero filas nuevas", async () => {
    const before = await adminDb.select().from(promoBroadcasts).where(eq(promoBroadcasts.businessId, businessAId));

    const result = await sendPromoBroadcastForSession(sessionStaffA, form({ message: "Intento de staff" }));
    expect(result.error).toBe("Solo el dueño puede enviar una promoción.");

    const after = await adminDb.select().from(promoBroadcasts).where(eq(promoBroadcasts.businessId, businessAId));
    expect(after).toHaveLength(before.length);
  });

  it("plan básico: bloqueado por completo, cero filas", async () => {
    const result = await sendPromoBroadcastForSession(sessionOwnerBasico, form({ message: "Promo bloqueada" }));
    expect(result.error).toBe("Esta función requiere plan Negocio o Intelligence.");

    const rows = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessBasicoId));
    expect(rows).toHaveLength(0);
  });

  it("segundo envío el mismo día: rechazado por el límite diario, el conteo sigue en 1", async () => {
    // businessA ya tiene 1 envío del test "happy path" de arriba, el mismo
    // día — el límite diario es 1 en TODOS los planes habilitados.
    const result = await sendPromoBroadcastForSession(sessionOwnerA, form({ message: "Segundo intento hoy" }));
    expect(result.error).toBe("Ya enviaste una promoción hoy. Vuelve a intentar mañana.");

    const rows = await adminDb.select().from(promoBroadcasts).where(eq(promoBroadcasts.businessId, businessAId));
    expect(rows).toHaveLength(1);
  });

  it("dos envíos concurrentes del mismo negocio: el lock de fila serializa, solo UNO tiene éxito", async () => {
    // Regression del hallazgo de tenant-security-reviewer: SELECT count()
    // + INSERT sin lock permitía que dos requests concurrentes (doble
    // clic, reintento de red) leyeran ambas count=0 antes de que
    // cualquiera insertara, superando el límite diario (1) del propio
    // negocio — no era una fuga cross-tenant, pero sí rompía la única
    // barrera de spam/costo. `.for("update")` sobre la fila de
    // `businesses` (logic.ts) serializa esto — mismo criterio que el
    // lock de customer_balances en scanner/logic.ts, probado acá con
    // Promise.all real contra Postgres, no simulado.
    const [resultA, resultB] = await Promise.all([
      sendPromoBroadcastForSession(sessionOwnerConcurrent, form({ message: "Concurrente A" })),
      sendPromoBroadcastForSession(sessionOwnerConcurrent, form({ message: "Concurrente B" })),
    ]);
    const successes = [resultA, resultB].filter((r) => r.success);
    const failures = [resultA, resultB].filter((r) => r.error);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toBe("Ya enviaste una promoción hoy. Vuelve a intentar mañana.");

    const rows = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessConcurrentId));
    expect(rows).toHaveLength(1);
  });

  it("cross-tenant: el envío de A nunca empuja a dispositivos de B", async () => {
    const customerB = await freshCustomer(businessBId);
    const pushTokenB = await registerAppleDevice(businessBId, customerB.id);

    const beforeApns = getFakeApnsSentPushes().length;
    const result = await sendPromoBroadcastForSession(sessionOwnerB, form({ message: "Promo solo para B" }));
    expect(result.success).toBeDefined();

    await waitFor(() => getFakeApnsSentPushes().length === beforeApns + 1);
    const newPushTokens = getFakeApnsSentPushes()
      .slice(beforeApns)
      .map((push) => push.pushToken);
    expect(newPushTokens).toEqual([pushTokenB]);
    expect(newPushTokens).not.toContain(undefined);

    // Estable: ningún push tardío de más llega para B (que probaría fuga
    // hacia dispositivos de A o viceversa).
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getFakeApnsSentPushes().length).toBe(beforeApns + 1);
  });

  it("sexto envío del mes en plan negocio: rechazado por el límite mensual (5), el conteo sigue en 5", async () => {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // 5 envíos ya sembrados EN DÍAS PASADOS del mismo mes (nunca "hoy" —
    // si cayeran hoy, el límite DIARIO (1) dispararía primero y este test
    // no distinguiría los dos límites).
    for (let i = 0; i < 5; i++) {
      const backdated = new Date(startOfMonth.getTime() + (i + 1) * 60_000);
      if (backdated.getTime() >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()) {
        // Guard defensivo: si el mes es tan corto que esto cayera "hoy",
        // no debería pasar en la práctica (backdated está al inicio del
        // mes), pero se deja explícito en vez de silencioso.
        throw new Error("seed de límite mensual cayó en el día de hoy — ajustar el test");
      }
      await adminDb.insert(promoBroadcasts).values({
        businessId: businessMonthlyId,
        sentByUserId: ownerMonthlyUserId,
        message: `Promo histórica ${i}`,
        createdAt: backdated,
      });
    }

    const result = await sendPromoBroadcastForSession(sessionOwnerMonthly, form({ message: "Sexta del mes" }));
    expect(result.error).toBe("Alcanzaste el límite de 5 promociones de tu plan este mes.");

    const rows = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessMonthlyId));
    expect(rows).toHaveLength(5);
  });

  it("mensaje vacío: rechazado, cero filas", async () => {
    const before = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessBasicoId));

    const result = await sendPromoBroadcastForSession(sessionOwnerBasico, form({ message: "   " }));
    expect(result.error).toBe("El mensaje de la promoción no puede estar vacío.");

    const after = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessBasicoId));
    expect(after).toHaveLength(before.length);
  });

  it("mensaje de más de 180 caracteres: rechazado, cero filas", async () => {
    const before = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessBasicoId));

    const result = await sendPromoBroadcastForSession(sessionOwnerBasico, form({ message: "a".repeat(181) }));
    expect(result.error).toBe("El mensaje no puede superar los 180 caracteres.");

    const after = await adminDb
      .select()
      .from(promoBroadcasts)
      .where(eq(promoBroadcasts.businessId, businessBasicoId));
    expect(after).toHaveLength(before.length);
  });
});
