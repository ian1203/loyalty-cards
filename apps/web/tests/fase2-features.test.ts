import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { CookieMethodsServer } from "@supabase/ssr";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  businesses,
  customerBalances,
  customers,
  loyaltyPrograms,
  platformAdmins,
  rewardRules,
  users,
  withTenantContext,
} from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { createCustomerForSession, searchCustomers } from "../app/(product)/customers/logic";
import {
  saveProgramForSession,
  saveRewardRuleForSession,
  toggleRewardRuleForSession,
} from "../app/(product)/rewards/logic";
import { requireTenantSession } from "../lib/supabase/session";
import { findInTenant, type TenantSession } from "../lib/tenant";
import {
  createBusinessWithRealOwner,
  createPlatformAdmin,
  createRealStaffUser,
  signInAsCookieJar,
  supabaseAdminClient,
} from "./support/testAuth";

// Definición de "listo" de Fase 2: IDOR (dueño de A no ve clientes de B),
// listado sin fuga cross-tenant, autorización dueño-vs-staff en el programa,
// alta de cliente con balance y dedupe — todo con sesiones REALES (login
// real → claims del hook → getVerifiedSession) y ejercitando EXACTAMENTE el
// mismo código que usan las páginas/actions (logic.ts + lib/tenant.ts),
// nunca una réplica del query.

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("Fase 2 — aislamiento y autorización de /rewards y /customers", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "fase2-features-password-1";

  let platformAdminAuthUserId: string;
  let ownerAAuthUserId: string;
  let staffAAuthUserId: string;
  let ownerBAuthUserId: string;
  let businessAId: string;
  let businessBId: string;
  let customerBId: string;
  let ruleBId: string;

  let sessionOwnerA: TenantSession;
  let sessionStaffA: TenantSession;
  let sessionOwnerB: TenantSession;

  async function tenantSession(jar: CookieMethodsServer): Promise<TenantSession> {
    const session = await requireTenantSession(jar);
    if (!session) throw new Error("sesión de tenant inválida en el setup");
    return session;
  }

  beforeAll(async () => {
    platformAdminAuthUserId = await createPlatformAdmin(
      `fase2-admin-${suffix}@test.dev`,
      password,
    );

    const a = await createBusinessWithRealOwner({
      businessName: `Fase2 A ${suffix}`,
      slug: `fase2-a-${suffix}`,
      ownerEmail: `fase2-owner-a-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessAId = a.business.id;
    ownerAAuthUserId = a.ownerAuthUserId;

    const b = await createBusinessWithRealOwner({
      businessName: `Fase2 B ${suffix}`,
      slug: `fase2-b-${suffix}`,
      ownerEmail: `fase2-owner-b-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessBId = b.business.id;
    ownerBAuthUserId = b.ownerAuthUserId;

    staffAAuthUserId = await createRealStaffUser({
      businessId: businessAId,
      email: `fase2-staff-a-${suffix}@test.dev`,
      password,
    });

    sessionOwnerA = await tenantSession(
      await signInAsCookieJar(`fase2-owner-a-${suffix}@test.dev`, password),
    );
    sessionStaffA = await tenantSession(
      await signInAsCookieJar(`fase2-staff-a-${suffix}@test.dev`, password),
    );
    sessionOwnerB = await tenantSession(
      await signInAsCookieJar(`fase2-owner-b-${suffix}@test.dev`, password),
    );

    // Programa + regla en B, y un cliente en B — los blancos del IDOR. Todo
    // creado por el MISMO código de producción, con la sesión real de B.
    const programB = await saveProgramForSession(
      sessionOwnerB,
      form({ name: "Programa B", stampsRequired: "10", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!programB.success) throw new Error(`setup programa B: ${programB.error}`);

    const ruleB = await saveRewardRuleForSession(
      sessionOwnerB,
      form({ name: "Recompensa B", stampsRequired: "10" }),
    );
    if (!ruleB.success) throw new Error(`setup regla B: ${ruleB.error}`);
    const [ruleBRow] = await adminDb
      .select()
      .from(rewardRules)
      .where(eq(rewardRules.businessId, businessBId));
    ruleBId = ruleBRow.id;

    const customerB = await createCustomerForSession(
      sessionOwnerB,
      form({ fullName: `Cliente B Exclusivo ${suffix}`, phone: "+52 555 000 0001" }),
    );
    if (!customerB.success) throw new Error(`setup cliente B: ${customerB.error}`);
    const [customerBRow] = await adminDb
      .select()
      .from(customers)
      .where(eq(customers.businessId, businessBId));
    customerBId = customerBRow.id;
  });

  afterAll(async () => {
    for (const businessId of [businessAId, businessBId]) {
      await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, businessId));
      await adminDb
        .delete(customerBalances)
        .where(eq(customerBalances.businessId, businessId));
      await adminDb.delete(customers).where(eq(customers.businessId, businessId));
      await adminDb.delete(rewardRules).where(eq(rewardRules.businessId, businessId));
      await adminDb
        .delete(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, businessId));
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
      ownerBAuthUserId,
      platformAdminAuthUserId,
    ]) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  });

  describe("IDOR — detalle de cliente", () => {
    it("el dueño de A pide el cliente de B por id → null, idéntico a un id inexistente", async () => {
      const ajeno = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        findInTenant(tx, sessionOwnerA, customers, customerBId),
      );
      const inexistente = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        findInTenant(tx, sessionOwnerA, customers, "00000000-0000-0000-0000-0000000000bb"),
      );

      expect(ajeno).toBeNull();
      expect(inexistente).toBeNull();
      expect(ajeno).toEqual(inexistente);
    });

    it("el dueño de B SÍ carga su propio cliente (control positivo)", async () => {
      const propio = await withTenantContext(sessionOwnerB.businessId, (tx) =>
        findInTenant(tx, sessionOwnerB, customers, customerBId),
      );
      expect(propio?.id).toBe(customerBId);
    });
  });

  describe("listado — sin fuga cross-tenant", () => {
    it("buscar desde A el nombre EXACTO del cliente de B devuelve cero filas", async () => {
      const rows = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        searchCustomers(tx, sessionOwnerA, `Cliente B Exclusivo ${suffix}`),
      );
      expect(rows).toHaveLength(0);
    });

    it("el listado completo de A solo contiene filas de A", async () => {
      const rows = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        searchCustomers(tx, sessionOwnerA, ""),
      );
      expect(rows.every((row) => row.businessId === businessAId)).toBe(true);
      expect(rows.some((row) => row.id === customerBId)).toBe(false);
    });

    it("los comodines de LIKE van escapados: buscar '%' no devuelve todo", async () => {
      // Con el escape, '%' se busca literal (ningún nombre lo contiene);
      // sin escape sería el comodín "todo" — incluida una falsa sensación
      // de que el filtro funciona. Cero filas = escapado correcto.
      const rows = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        searchCustomers(tx, sessionOwnerA, "%"),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("autorización — dueño vs. staff en /rewards", () => {
    it("staff real NO puede crear/editar el programa; la DB queda intacta", async () => {
      const result = await saveProgramForSession(
        sessionStaffA,
        form({ name: "Hackeado por staff", stampsRequired: "5", cooldownMinutes: "0" }),
      );
      expect(result.error).toBe("Solo el dueño puede configurar el programa.");

      const programsA = await adminDb
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, businessAId));
      expect(programsA).toHaveLength(0);
    });

    it("staff tampoco puede crear reglas ni togglearlas", async () => {
      const rule = await saveRewardRuleForSession(
        sessionStaffA,
        form({ name: "Regla de staff", stampsRequired: "5" }),
      );
      expect(rule.error).toBe("Solo el dueño puede configurar el programa.");

      const toggle = await toggleRewardRuleForSession(
        sessionStaffA,
        form({ ruleId: ruleBId }),
      );
      expect(toggle.error).toBe("Solo el dueño puede configurar el programa.");
    });

    it("el dueño SÍ crea el programa, con audit log y su actor_user_id", async () => {
      const result = await saveProgramForSession(
        sessionOwnerA,
        form({ name: "Programa A", stampsRequired: "8", cooldownMinutes: "30", isActive: "on" }),
      );
      expect(result.success).toBeDefined();

      const [ownerARow] = await adminDb
        .select()
        .from(users)
        .where(
          and(eq(users.businessId, businessAId), eq(users.authUserId, ownerAAuthUserId)),
        );
      const [log] = await adminDb
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.businessId, businessAId),
            eq(auditLogs.action, "loyalty_program.created"),
          ),
        );
      expect(log?.actorUserId).toBe(ownerARow.id);
      expect(log?.actorAuthUserId).toBeNull();
    });

    it("el dueño de A no puede togglear una regla de B — mismo mensaje que una inexistente", async () => {
      const ajena = await toggleRewardRuleForSession(
        sessionOwnerA,
        form({ ruleId: ruleBId }),
      );
      const inexistente = await toggleRewardRuleForSession(
        sessionOwnerA,
        form({ ruleId: "00000000-0000-0000-0000-0000000000cc" }),
      );
      expect(ajena.error).toBe("La recompensa no existe.");
      expect(inexistente.error).toBe("La recompensa no existe.");

      const [ruleBRow] = await adminDb
        .select()
        .from(rewardRules)
        .where(eq(rewardRules.id, ruleBId));
      expect(ruleBRow.isActive).toBe(true);
    });
  });

  describe("alta de cliente", () => {
    it("staff da de alta un cliente: balance inicial 0 contra el programa activo + audit", async () => {
      const result = await createCustomerForSession(
        sessionStaffA,
        form({ fullName: "Cliente de Staff A", phone: "+52 555 000 0002" }),
      );
      expect(result.success).toBeDefined();

      const [customerRow] = await adminDb
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.businessId, businessAId),
            eq(customers.phone, "+52 555 000 0002"),
          ),
        );
      expect(customerRow).toBeDefined();
      expect(customerRow.walletToken.length).toBeGreaterThanOrEqual(32);

      const [balance] = await adminDb
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.customerId, customerRow.id));
      expect(balance?.currentStamps).toBe(0);

      const [log] = await adminDb
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.businessId, businessAId),
            eq(auditLogs.action, "customer.created"),
          ),
        );
      expect(log?.actorUserId).not.toBeNull();
    });

    it("dedupe: mismo teléfono dentro del tenant rechaza con mensaje claro", async () => {
      const result = await createCustomerForSession(
        sessionOwnerA,
        form({ fullName: "Duplicado", phone: "+52 555 000 0002" }),
      );
      expect(result.error).toBe("Ya existe un cliente con ese teléfono en tu negocio.");
    });

    it("el MISMO teléfono en OTRO negocio sí se permite (el dedupe es por tenant, no global)", async () => {
      const result = await createCustomerForSession(
        sessionOwnerB,
        form({ fullName: "Cliente B con tel de A", phone: "+52 555 000 0002" }),
      );
      expect(result.success).toBeDefined();
    });
  });

  describe("cero adminDb en rutas de feature", () => {
    // Único árbol exento por completo: app/admin/ (alta de negocios — no
    // hay tenant todavía). Excepciones puntuales, cada una UN solo
    // archivo con su propio comentario extenso in situ:
    // - app/api/wallet/apple/logic.ts: el web service PÚBLICO de Apple
    //   PassKit (Fase 4) no tiene sesión de Supabase — su endpoint
    //   "listar seriales actualizados" tampoco recibe un
    //   authenticationToken (lo define el protocolo de Apple, no
    //   nosotros), así que no hay un solo negocio al que fijar contexto
    //   de antemano. Query MUY acotada: solo wallet_passes.id + updated_at,
    //   nunca datos de negocio. Ver el comentario en
    //   listUpdatedSerialsForDevice.
    // - lib/wallet/passAuth.ts: el segundo (y único otro) punto sancionado
    //   para producir un VerifiedBusinessId, a partir de un
    //   authenticationToken de PassKit en vez de una sesión — adminDb
    //   toca EXCLUSIVAMENTE esa única fila de auth, nunca datos de
    //   negocio. Ver verifyBusinessIdForPassToken.
    const ALLOWED_ADMIN_DB_FILES = new Set([
      "app/api/wallet/apple/logic.ts",
      "lib/wallet/passAuth.ts",
    ]);

    // Mismo espíritu para el otro invariante de seguridad de esta fase: el
    // cast `as VerifiedBusinessId` (packages/db/src/tenantContext.ts) solo
    // debería existir en los DOS puntos sancionados — sesión de Supabase
    // (lib/supabase/session.ts) y token de PassKit (lib/wallet/passAuth.ts).
    // Cualquier otro sitio es exactamente lo que un review de seguridad
    // debe auditar.
    const ALLOWED_VERIFIED_BUSINESS_ID_CAST_FILES = new Set([
      "lib/supabase/session.ts",
      "lib/wallet/passAuth.ts",
    ]);

    function walkTsFiles(rootDir: string, onFile: (relPath: string, content: string) => void) {
      function walk(dir: string) {
        for (const entry of readdirSync(dir)) {
          const fullPath = join(dir, entry);
          if (statSync(fullPath).isDirectory()) {
            walk(fullPath);
            continue;
          }
          if (!/\.(ts|tsx)$/.test(entry)) continue;
          if (fullPath.endsWith(".test.ts")) continue;
          onFile(relative(rootDir, fullPath), readFileSync(fullPath, "utf8"));
        }
      }
      walk(rootDir);
    }

    it("ningún archivo bajo app/ o lib/ importa @loyalty/db/admin salvo app/admin/ y las excepciones documentadas", () => {
      const webDir = join(__dirname, "..");
      const offenders: string[] = [];

      for (const subdir of ["app", "lib"]) {
        walkTsFiles(join(webDir, subdir), (relPath, content) => {
          if (!content.includes("@loyalty/db/admin")) return;
          const rel = `${subdir}/${relPath}`;
          if (rel.startsWith("app/admin/")) return;
          if (ALLOWED_ADMIN_DB_FILES.has(rel)) return;
          offenders.push(rel);
        });
      }

      expect(offenders).toEqual([]);
    });

    it("ningún archivo castea 'as VerifiedBusinessId' salvo los dos puntos sancionados", () => {
      const webDir = join(__dirname, "..");
      const offenders: string[] = [];

      for (const subdir of ["app", "lib"]) {
        walkTsFiles(join(webDir, subdir), (relPath, content) => {
          if (!content.includes("as VerifiedBusinessId")) return;
          const rel = `${subdir}/${relPath}`;
          if (ALLOWED_VERIFIED_BUSINESS_ID_CAST_FILES.has(rel)) return;
          offenders.push(rel);
        });
      }

      expect(offenders).toEqual([]);
    });
  });
});
