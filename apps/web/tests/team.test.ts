import type { CookieMethodsServer } from "@supabase/ssr";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  employees,
  locations,
  platformAdmins,
  roles,
  users,
  withTenantContext,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { registerStampForSession } from "../app/(product)/scanner/logic";
import {
  createStaffForSession,
  deactivateEmployeeForSession,
  listEmployeesForSession,
} from "../app/(product)/team/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import {
  anonClient,
  createBusinessWithRealOwner,
  createOwnerAuthUser,
  createPlatformAdmin,
  createRealStaffUser,
  form,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Offboarding real de empleados: desactivación efectiva en DB (no solo
// borrar de la tabla), auditada, con bloqueo de login futuro vía Admin
// API. Sesiones REALES en todo el archivo, mismo criterio que Fase 2/3.

async function tenantSession(jar: CookieMethodsServer): Promise<TenantSession> {
  const session = await requireTenantSession(jar);
  if (!session) throw new Error("sesión de tenant inválida en el setup");
  return session;
}

// No hay helper para un usuario real de rol 'admin' en testAuth.ts (solo
// 'staff') — se necesita acá para el caso de autodesactivación, mismo
// patrón que createRealStaffUser pero con el rol 'admin'.
async function createRealAdminUser(input: {
  businessId: string;
  email: string;
  password: string;
}): Promise<string> {
  const adminAuthUserId = await createOwnerAuthUser(input.email, input.password);
  const [adminRole] = await adminDb.select().from(roles).where(eq(roles.name, "admin"));
  if (!adminRole) {
    throw new Error("No existe el rol global 'admin' — revisa el seed de roles.");
  }
  await adminDb.insert(users).values({
    businessId: input.businessId,
    authUserId: adminAuthUserId,
    email: input.email,
    roleId: adminRole.id,
  });
  return adminAuthUserId;
}

describe("Offboarding de empleados — /team", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "team-offboard-password-1";

  let platformAdminAuthUserId: string;

  let businessAId: string;
  let ownerAAuthUserId: string;
  let staffAAuthUserId: string;
  let adminAAuthUserId: string;
  let locationAId: string;
  let sessionOwnerA: TenantSession;
  let sessionStaffA: TenantSession;
  let staffAEmail: string;
  let staffAEmployeeId: string;
  let sessionAdminA: TenantSession;
  let adminAEmployeeId: string;

  let businessBId: string;
  let ownerBAuthUserId: string;
  let staffBAuthUserId: string;
  let staffBEmployeeId: string;
  let locationBId: string;
  let sessionOwnerB: TenantSession;

  // auth.users creados por los tests de ALTA de staff (no por el setup de
  // beforeAll) — se limpian junto con el resto en afterAll.
  const extraAuthUserIds: string[] = [];

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(
      `team-admin-${suffix}@test.dev`,
      password,
    );

    // --- Negocio A ---
    const ownerAEmail = `team-owner-a-${suffix}@test.dev`;
    const a = await createBusinessWithRealOwner({
      businessName: `Team A ${suffix}`,
      slug: `team-a-${suffix}`,
      ownerEmail: ownerAEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessAId = a.business.id;
    ownerAAuthUserId = a.ownerAuthUserId;

    const [locA] = await adminDb
      .insert(locations)
      .values({ businessId: businessAId, name: "Sucursal A" })
      .returning();
    locationAId = locA.id;

    staffAEmail = `team-staff-a-${suffix}@test.dev`;
    staffAAuthUserId = await createRealStaffUser({
      businessId: businessAId,
      email: staffAEmail,
      password,
    });
    const [staffAUserRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessAId), eq(users.authUserId, staffAAuthUserId)));
    const [employeeA] = await adminDb
      .insert(employees)
      .values({
        businessId: businessAId,
        userId: staffAUserRow.id,
        primaryLocationId: locationAId,
        fullName: "Staff A",
        isActive: true,
      })
      .returning();
    staffAEmployeeId = employeeA.id;

    const adminAEmail = `team-adminuser-a-${suffix}@test.dev`;
    adminAAuthUserId = await createRealAdminUser({
      businessId: businessAId,
      email: adminAEmail,
      password,
    });
    const [adminAUserRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessAId), eq(users.authUserId, adminAAuthUserId)));
    const [employeeAdminA] = await adminDb
      .insert(employees)
      .values({
        businessId: businessAId,
        userId: adminAUserRow.id,
        fullName: "Admin con ficha A",
        isActive: true,
      })
      .returning();
    adminAEmployeeId = employeeAdminA.id;

    sessionOwnerA = await tenantSession(await signInAsCookieJar(ownerAEmail, password));
    sessionStaffA = await tenantSession(await signInAsCookieJar(staffAEmail, password));
    sessionAdminA = await tenantSession(await signInAsCookieJar(adminAEmail, password));

    // --- Negocio B (solo aislamiento) ---
    const ownerBEmail = `team-owner-b-${suffix}@test.dev`;
    const b = await createBusinessWithRealOwner({
      businessName: `Team B ${suffix}`,
      slug: `team-b-${suffix}`,
      ownerEmail: ownerBEmail,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessBId = b.business.id;
    ownerBAuthUserId = b.ownerAuthUserId;
    sessionOwnerB = await tenantSession(await signInAsCookieJar(ownerBEmail, password));

    const [locB] = await adminDb
      .insert(locations)
      .values({ businessId: businessBId, name: "Sucursal B" })
      .returning();
    locationBId = locB.id;

    const staffBEmail = `team-staff-b-${suffix}@test.dev`;
    staffBAuthUserId = await createRealStaffUser({
      businessId: businessBId,
      email: staffBEmail,
      password,
    });
    const [staffBUserRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessBId), eq(users.authUserId, staffBAuthUserId)));
    const [employeeB] = await adminDb
      .insert(employees)
      .values({
        businessId: businessBId,
        userId: staffBUserRow.id,
        fullName: "Staff B",
        isActive: true,
      })
      .returning();
    staffBEmployeeId = employeeB.id;
  });

  afterAll(async () => {
    for (const businessId of [businessAId, businessBId]) {
      await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
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
      adminAAuthUserId,
      ownerBAuthUserId,
      staffBAuthUserId,
      platformAdminAuthUserId,
      ...extraAuthUserIds,
    ]) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  });

  it("el dueño desactiva a un staff real: employees.is_active y users.is_active quedan en false, con audit log", async () => {
    const result = await deactivateEmployeeForSession(
      sessionOwnerA,
      form({ employeeId: staffAEmployeeId }),
    );
    expect(result.success).toBeTruthy();

    const [employeeRow] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.id, staffAEmployeeId));
    expect(employeeRow.isActive).toBe(false);

    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessAId), eq(users.email, staffAEmail)));
    expect(userRow.isActive).toBe(false);

    const [log] = await adminDb
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityId, staffAEmployeeId), eq(auditLogs.action, "employee.deactivated")),
      );
    expect(log).toBeTruthy();
    expect(log.businessId).toBe(businessAId);
  });

  it("el ban real bloquea el login: signInWithPassword falla después de desactivar", async () => {
    const { error } = await anonClient().auth.signInWithPassword({
      email: staffAEmail,
      password,
    });
    expect(error).toBeTruthy();
  });

  it("la sesión YA emitida del empleado desactivado ahora falla en operaciones sensibles (requireOperationContext)", async () => {
    const result = await registerStampForSession(sessionStaffA, {
      customerId: crypto.randomUUID(),
      locationId: locationAId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/desactivad/);
  });

  it("staff no puede desactivar empleados (gate) — corre ANTES de tocar DB, sirve aunque la sesión ya esté desactivada", async () => {
    const staffResult = await deactivateEmployeeForSession(
      sessionStaffA,
      form({ employeeId: adminAEmployeeId }),
    );
    expect(staffResult.error).toMatch(/dueño/);

    const [employeeRow] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.id, adminAEmployeeId));
    expect(employeeRow.isActive).toBe(true);
  });

  it("un admin no puede desactivarse a sí mismo", async () => {
    const result = await deactivateEmployeeForSession(
      sessionAdminA,
      form({ employeeId: adminAEmployeeId }),
    );
    expect(result.error).toMatch(/ti mismo/);

    const [employeeRow] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.id, adminAEmployeeId));
    expect(employeeRow.isActive).toBe(true);
  });

  it("IDOR cross-tenant: el dueño de A no puede desactivar una ficha de B (mismo mensaje que inexistente)", async () => {
    const result = await deactivateEmployeeForSession(
      sessionOwnerA,
      form({ employeeId: staffBEmployeeId }),
    );
    expect(result.error).toBe("El empleado no existe.");

    const [employeeRow] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.id, staffBEmployeeId));
    expect(employeeRow.isActive).toBe(true);
  });

  it("listEmployeesForSession solo devuelve empleados del propio negocio", async () => {
    const rows = await withTenantContext(sessionOwnerA.businessId, (tx) =>
      listEmployeesForSession(tx, sessionOwnerA),
    );
    expect(rows.some((row) => row.id === staffBEmployeeId)).toBe(false);
    expect(rows.some((row) => row.id === adminAEmployeeId)).toBe(true);
  });

  it("el dueño da de alta a un staff nuevo: el password devuelto una sola vez sirve para iniciar sesión, con audit log", async () => {
    const newStaffEmail = `team-new-staff-${suffix}@test.dev`;

    const result = await createStaffForSession(
      sessionOwnerA,
      form({ fullName: "Staff Nuevo", email: newStaffEmail, primaryLocationId: locationAId }),
    );
    expect(result.success).toBeTruthy();
    expect(result.credentials?.email).toBe(newStaffEmail);
    expect(result.credentials?.password).toBeTruthy();
    const newPassword = result.credentials!.password;

    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessAId), eq(users.email, newStaffEmail)));
    expect(userRow).toBeTruthy();
    extraAuthUserIds.push(userRow.authUserId);

    const [employeeRow] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.userId, userRow.id));
    expect(employeeRow).toBeTruthy();
    expect(employeeRow.primaryLocationId).toBe(locationAId);
    expect(employeeRow.isActive).toBe(true);

    const [log] = await adminDb
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, employeeRow.id), eq(auditLogs.action, "staff.created")));
    expect(log).toBeTruthy();
    expect(log.businessId).toBe(businessAId);

    // El password generado (nunca logueado) viaja UNA VEZ en el estado —
    // la única forma de confirmar que es real es usarlo para loguearse.
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: newStaffEmail,
      password: newPassword,
    });
    expect(error).toBeFalsy();
    expect(data.session).toBeTruthy();
  });

  it("dedupe de email dentro del negocio: rechaza un email ya usado por otro usuario del mismo tenant, sin 500 de constraint", async () => {
    const result = await createStaffForSession(
      sessionOwnerA,
      form({ fullName: "Staff Duplicado", email: staffAEmail }),
    );
    expect(result.error).toMatch(/ya existe/i);
    expect(result.credentials).toBeUndefined();
  });

  it("staff no puede dar de alta a nadie (gate) — corre ANTES de tocar Auth/DB", async () => {
    const attemptedEmail = `team-staff-attempt-${suffix}@test.dev`;

    const result = await createStaffForSession(
      sessionStaffA,
      form({ fullName: "Intento de Staff", email: attemptedEmail }),
    );
    expect(result.error).toMatch(/dueño/);
    expect(result.credentials).toBeUndefined();

    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessAId), eq(users.email, attemptedEmail)));
    expect(userRow).toBeUndefined();
  });

  it("aislamiento cross-tenant: el dueño de A no puede asignar una sucursal de B al staff nuevo", async () => {
    const attemptedEmail = `team-cross-location-${suffix}@test.dev`;

    const result = await createStaffForSession(
      sessionOwnerA,
      form({ fullName: "Staff Cross Tenant", email: attemptedEmail, primaryLocationId: locationBId }),
    );
    expect(result.error).toMatch(/sucursal/i);
    expect(result.credentials).toBeUndefined();

    // Ni el auth.users ni la fila de users quedaron creados — el
    // pre-chequeo corta ANTES de tocar Auth.
    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessAId), eq(users.email, attemptedEmail)));
    expect(userRow).toBeUndefined();
  });

  it("el dueño de B sí puede usar su propia sucursal (control positivo del test anterior)", async () => {
    const newStaffEmail = `team-owner-b-staff-${suffix}@test.dev`;

    const result = await createStaffForSession(
      sessionOwnerB,
      form({ fullName: "Staff B Nuevo", email: newStaffEmail, primaryLocationId: locationBId }),
    );
    expect(result.success).toBeTruthy();

    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.businessId, businessBId), eq(users.email, newStaffEmail)));
    expect(userRow).toBeTruthy();
    extraAuthUserIds.push(userRow.authUserId);
  });
});
