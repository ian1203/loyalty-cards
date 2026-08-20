import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// @sentry/nextjs congela su namespace de exports (ESM real, no
// reconfigurable) — vi.spyOn directo sobre el módulo revienta con
// "Cannot redefine property". vi.mock con importOriginal es el patrón
// estándar de Vitest para este caso: mantiene el resto del SDK real,
// reemplaza SOLO captureException por un vi.fn() espiable.
vi.mock("@sentry/nextjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/nextjs")>();
  return { ...actual, captureException: vi.fn() };
});
import * as Sentry from "@sentry/nextjs";
import * as core from "@loyalty/core";
import {
  auditLogs,
  businesses,
  customerBalances,
  customers,
  employees,
  loyaltyPrograms,
  platformAdmins,
  redemptions,
  rewardRules,
  transactions,
  users,
  walletPasses,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import * as enrollDb from "@loyalty/db/enroll";
import { createCustomerForSession } from "../app/(product)/customers/logic";
import { saveProgramForSession, saveRewardRuleForSession } from "../app/(product)/rewards/logic";
import { registerStampForSession, redeemRewardForSession } from "../app/(product)/scanner/logic";
import { enrollCustomerForSlug } from "../app/(marketing)/enroll/[slug]/logic";
import * as publicEnrollWallet from "../lib/wallet/publicEnrollWallet";
import { notifyWalletOfTransaction } from "../lib/wallet/notify";
import * as adapters from "../lib/wallet/adapters";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import { createBusinessWithRealOwner, createPlatformAdmin, createRealStaffUser, form, signInAsCookieJar } from "./support/testAuth";

// captureException acepta Scope | Partial<ScopeContext> | EventHint — el tipo
// unión no expone .tags/.extra sin angostar; en el test solo nos interesa
// leer lo que captureServerError() realmente le pasa (siempre
// { tags, extra }), así que se lee con un cast angosto y explícito.
type CapturedContext = { tags?: Record<string, string>; extra?: Record<string, unknown> };
function contextOf(call: unknown[]): CapturedContext {
  return call[1] as CapturedContext;
}

// Paso 4 del pedido de observabilidad: "no des esto por hecho solo porque
// el SDK está instalado". Este archivo provoca una excepción REAL (no
// simulada a mano) en cada uno de los 4 puntos de captura, a través del
// código de producción real (registerStampForSession/redeemRewardForSession/
// enrollCustomerForSlug/notifyWalletOfTransaction) — solo se sustituye UNA
// dependencia de bajo nivel por caso (evaluateStamp/evaluateRedemption/
// enrollCustomerPublic/sender de Apple/cliente de Google) para forzar el
// fallo de forma determinística, sin tocar ninguna línea de lógica de
// negocio real. Confirma DOS cosas por caso: (1) Sentry.captureException
// se llamó con el tag `operation`/`severity` correcto y un business_id real,
// y (2) ninguna PII real de un cliente sembrado a propósito (nombre/
// teléfono/email reconocibles) aparece en NINGÚN argumento capturado.

const PII_MARKER_SUFFIX = `${Date.now()}${Math.random().toString(36).slice(2)}`;
const PII_FULL_NAME = `Ana ProvocadaTest ${PII_MARKER_SUFFIX}`;
const PII_PHONE = `+5299${PII_MARKER_SUFFIX.slice(0, 8)}`;
const PII_EMAIL = `ana.provocada.${PII_MARKER_SUFFIX}@test.dev`;

function assertNoPiiLeaked(captureSpy: ReturnType<typeof vi.spyOn>) {
  const serialized = JSON.stringify(captureSpy.mock.calls);
  expect(serialized).not.toContain(PII_FULL_NAME);
  expect(serialized).not.toContain(PII_PHONE);
  expect(serialized).not.toContain(PII_EMAIL);
}

describe("Observabilidad — verificación end-to-end con errores reales provocados", () => {
  const suffix = `obs-verify-${PII_MARKER_SUFFIX}`;
  const password = "observability-verify-password-1";

  let platformAdminAuthUserId: string;
  let businessId: string;
  let businessSlug: string;
  let ownerAuthUserId: string;
  let staffAuthUserId: string;
  let locationId: string;
  let sessionOwner: TenantSession;
  let sessionStaff: TenantSession;
  let piiCustomerId: string;

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(`obs-verify-admin-${suffix}@test.dev`, password);
    const ownerEmail = `obs-verify-owner-${suffix}@test.dev`;
    const biz = await createBusinessWithRealOwner({
      businessName: `Obs Verify ${suffix}`,
      slug: `obs-verify-${suffix}`,
      ownerEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessId = biz.business.id;
    businessSlug = biz.business.slug;
    ownerAuthUserId = biz.ownerAuthUserId;

    const staffEmail = `obs-verify-staff-${suffix}@test.dev`;
    staffAuthUserId = await createRealStaffUser({ businessId, email: staffEmail, password });

    const { locations } = await import("@loyalty/db");
    const [loc] = await adminDb.insert(locations).values({ businessId, name: "Sucursal Obs Verify" }).returning();
    locationId = loc.id;

    const [staffUserRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessId), eq(users.authUserId, staffAuthUserId)));
    await adminDb.insert(employees).values({
      businessId,
      userId: staffUserRow.id,
      primaryLocationId: locationId,
      fullName: "Staff Obs Verify",
      isActive: true,
    });

    sessionOwner = (await requireTenantSession(await signInAsCookieJar(ownerEmail, password)))!;
    sessionStaff = (await requireTenantSession(await signInAsCookieJar(staffEmail, password)))!;

    const program = await saveProgramForSession(
      sessionOwner,
      form({ name: "Programa Obs Verify", stampsRequired: "6", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!program.success) throw new Error(`setup programa: ${program.error}`);
    await saveRewardRuleForSession(sessionOwner, form({ name: "Recompensa Obs Verify", stampsRequired: "6" }));

    // Cliente sembrado con PII RECONOCIBLE — lo que este archivo confirma
    // es que, aunque exista y participe en el sello/canje que provoca el
    // error, su nombre/teléfono/email nunca llegan a Sentry.
    const created = await createCustomerForSession(
      sessionOwner,
      form({ fullName: PII_FULL_NAME, phone: PII_PHONE, email: PII_EMAIL, dateOfBirth: "1990-01-01" }),
    );
    if (!created.success) throw new Error(`setup cliente PII: ${created.error}`);
    const [piiCustomerRow] = await adminDb
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.businessId, businessId), eq(customers.phone, PII_PHONE)));
    piiCustomerId = piiCustomerRow.id;
  });

  afterAll(async () => {
    const { deviceRegistrations } = await import("@loyalty/db");
    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
    await adminDb.delete(deviceRegistrations).where(eq(deviceRegistrations.businessId, businessId));
    await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, businessId));
    await adminDb.delete(redemptions).where(eq(redemptions.businessId, businessId));
    await adminDb.delete(transactions).where(eq(transactions.businessId, businessId));
    await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, businessId));
    await adminDb.delete(customers).where(eq(customers.businessId, businessId));
    await adminDb.delete(rewardRules).where(eq(rewardRules.businessId, businessId));
    await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
    await adminDb.delete(employees).where(eq(employees.businessId, businessId));
    const { locations } = await import("@loyalty/db");
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

  afterEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    vi.restoreAllMocks();
  });

  it("scanner.stamp: excepción real en evaluateStamp llega a Sentry con operation/severity/business_id, sin PII", async () => {
    const captureSpy = vi.mocked(Sentry.captureException);
    vi.spyOn(core, "evaluateStamp").mockImplementation(() => {
      throw new Error("boom-stamp-test (provocado por observability-verification.test.ts)");
    });

    const result = await registerStampForSession(sessionStaff, {
      customerId: piiCustomerId,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(result.ok).toBe(false);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const capturedError = captureSpy.mock.calls[0][0];
    const context = contextOf(captureSpy.mock.calls[0]);
    expect((capturedError as Error).message).toContain("boom-stamp-test");
    expect(context?.tags?.operation).toBe("scanner.stamp");
    expect(context?.tags?.severity).toBe("critical");
    expect(context?.extra?.businessId).toBe(businessId);
    assertNoPiiLeaked(captureSpy);
  });

  it("scanner.redeem: excepción real en evaluateRedemption llega a Sentry con operation/severity/business_id, sin PII", async () => {
    const captureSpy = vi.mocked(Sentry.captureException);
    const [rule] = await adminDb.select().from(rewardRules).where(eq(rewardRules.businessId, businessId));
    vi.spyOn(core, "evaluateRedemption").mockImplementation(() => {
      throw new Error("boom-redeem-test (provocado por observability-verification.test.ts)");
    });

    const result = await redeemRewardForSession(sessionStaff, {
      customerId: piiCustomerId,
      ruleId: rule.id,
      locationId,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(result.ok).toBe(false);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const context = contextOf(captureSpy.mock.calls[0]);
    expect(context?.tags?.operation).toBe("scanner.redeem");
    expect(context?.tags?.severity).toBe("critical");
    expect(context?.extra?.businessId).toBe(businessId);
    assertNoPiiLeaked(captureSpy);
  });

  it("enroll.customer: excepción real en enrollCustomerPublic llega a Sentry con operation/severity, sin PII del formulario", async () => {
    const captureSpy = vi.mocked(Sentry.captureException);
    vi.spyOn(enrollDb, "enrollCustomerPublic").mockRejectedValue(
      new Error("boom-enroll-test (provocado por observability-verification.test.ts)"),
    );

    const result = await enrollCustomerForSlug(
      businessSlug,
      form({
        firstName: "Ana",
        lastName: `ProvocadaTest ${PII_MARKER_SUFFIX}`,
        dateOfBirth: "1990-01-01",
        email: PII_EMAIL,
        phone: PII_PHONE,
        consent: "on",
      }),
      "203.0.113.77",
    );

    expect(result.error).toBeTruthy();
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const context = contextOf(captureSpy.mock.calls[0]);
    expect(context?.tags?.operation).toBe("enroll.customer");
    expect(context?.tags?.severity).toBe("critical");
    expect(context?.extra?.businessSlug).toBe(businessSlug);
    assertNoPiiLeaked(captureSpy);
  });

  it("enroll.wallet_artifacts: excepción real generando el pase post-alta llega a Sentry, sin bloquear el alta ya confirmada", async () => {
    const captureSpy = vi.mocked(Sentry.captureException);
    vi.spyOn(publicEnrollWallet, "buildWalletArtifactsForNewEnrollment").mockRejectedValue(
      new Error("boom-enroll-wallet-test (provocado por observability-verification.test.ts)"),
    );

    const uniquePhone = `+5298${PII_MARKER_SUFFIX.slice(0, 8)}`;
    const result = await enrollCustomerForSlug(
      businessSlug,
      form({
        firstName: "Beto",
        lastName: "WalletBoom",
        dateOfBirth: "1990-01-01",
        email: `beto.walletboom.${PII_MARKER_SUFFIX}@test.dev`,
        phone: uniquePhone,
        consent: "on",
      }),
      "203.0.113.78",
    );

    // El alta del cliente SIGUE exitosa — best-effort, ver notify.ts/logic.ts.
    expect(result.success).toBeTruthy();
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const context = contextOf(captureSpy.mock.calls[0]);
    expect(context?.tags?.operation).toBe("enroll.wallet_artifacts");
    expect(context?.tags?.severity).toBe("warning");
    expect(context?.extra?.businessId).toBe(businessId);
  });

  it("wallet.notify.apple: excepción real del sender de APNs llega a Sentry, sin exponer el push token", async () => {
    const captureSpy = vi.mocked(Sentry.captureException);
    const { walletPasses: wp, deviceRegistrations: dr } = await import("@loyalty/db");
    const [pass] = await adminDb
      .insert(wp)
      .values({ businessId, customerId: piiCustomerId, platform: "apple", authenticationToken: `tok-${crypto.randomUUID()}` })
      .returning();
    const secretPushToken = `SECRET-PUSH-TOKEN-${PII_MARKER_SUFFIX}`;
    await adminDb.insert(dr).values({
      businessId,
      walletPassId: pass.id,
      deviceLibraryIdentifier: `device-${crypto.randomUUID()}`,
      pushToken: secretPushToken,
    });

    vi.spyOn(adapters, "getApnsSender").mockReturnValue(async () => {
      throw new Error("boom-apns-test (provocado por observability-verification.test.ts)");
    });

    await notifyWalletOfTransaction(sessionOwner.businessId, piiCustomerId);

    expect(captureSpy).toHaveBeenCalledTimes(1);
    const context = contextOf(captureSpy.mock.calls[0]);
    expect(context?.tags?.operation).toBe("wallet.notify.apple");
    expect(context?.tags?.severity).toBe("warning");
    expect(context?.extra?.businessId).toBe(businessId);
    // El push token es un secreto — nunca debe salir hacia Sentry.
    expect(JSON.stringify(captureSpy.mock.calls)).not.toContain(secretPushToken);
  });

  it("wallet.notify.google: excepción real del cliente de Google llega a Sentry, sin exponer credenciales", async () => {
    const captureSpy = vi.mocked(Sentry.captureException);
    const { walletPasses: wp } = await import("@loyalty/db");
    await adminDb
      .insert(wp)
      .values({ businessId, customerId: piiCustomerId, platform: "google", authenticationToken: `tok-${crypto.randomUUID()}` });

    vi.spyOn(adapters, "getGoogleWalletClient").mockReturnValue({
      upsertLoyaltyObject: vi.fn().mockRejectedValue(new Error("boom-google-test (provocado por observability-verification.test.ts)")),
    } as unknown as ReturnType<typeof adapters.getGoogleWalletClient>);

    await notifyWalletOfTransaction(sessionOwner.businessId, piiCustomerId);

    expect(captureSpy).toHaveBeenCalledTimes(1);
    const context = contextOf(captureSpy.mock.calls[0]);
    expect(context?.tags?.operation).toBe("wallet.notify.google");
    expect(context?.tags?.severity).toBe("warning");
    expect(context?.extra?.businessId).toBe(businessId);
    assertNoPiiLeaked(captureSpy);
  });
});
