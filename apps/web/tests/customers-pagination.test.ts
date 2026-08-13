import { beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@loyalty/db";
import {
  countCustomers,
  createCustomerForSession,
  parsePage,
  parsePageSize,
  searchCustomers,
  searchCustomersForSession,
} from "../app/(product)/customers/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import { createBusinessWithRealOwner, createPlatformAdmin, form, signInAsCookieJar } from "./support/testAuth";

// Definición de "listo" de la paginación real de /customers: LIMIT/OFFSET
// tenant-scoped (mismo mecanismo de aislamiento de siempre, withTenantContext
// + filtro explícito por business_id), COUNT tenant-scoped para el total de
// páginas (nunca trae todo el directorio solo para contarlo), y búsqueda +
// paginación combinadas correctamente (el total de páginas sale de los
// resultados FILTRADOS, no del total del negocio) — todo con sesiones
// reales, mismo patrón que fase2-features.test.ts.
describe("Paginación de /customers — aislamiento tenant y combinación con búsqueda", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Solo dígitos — PHONE_RE (customers/logic.ts) rechaza letras después del
  // primer carácter, y `suffix` trae base36 (puede tener letras).
  const numericId = String(Date.now()).slice(-6);
  const password = "customers-pagination-password-1";

  let sessionOwnerA: TenantSession;
  let sessionOwnerB: TenantSession;
  const CUSTOMERS_A = 7;
  const CUSTOMERS_B = 3;

  beforeAll(async () => {
    const platformAdminAuthUserId = await createPlatformAdmin(
      `custpag-admin-${suffix}@test.dev`,
      password,
    );

    await createBusinessWithRealOwner({
      businessName: `CustPag A ${suffix}`,
      slug: `custpag-a-${suffix}`,
      ownerEmail: `custpag-owner-a-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    await createBusinessWithRealOwner({
      businessName: `CustPag B ${suffix}`,
      slug: `custpag-b-${suffix}`,
      ownerEmail: `custpag-owner-b-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });

    sessionOwnerA = (await requireTenantSession(
      await signInAsCookieJar(`custpag-owner-a-${suffix}@test.dev`, password),
    ))!;
    sessionOwnerB = (await requireTenantSession(
      await signInAsCookieJar(`custpag-owner-b-${suffix}@test.dev`, password),
    ))!;
    if (!sessionOwnerA || !sessionOwnerB) throw new Error("sesión de tenant inválida en el setup");

    // Sellos de orden reales (createdAt distinto, no simultáneo) para que
    // "página 1 / página 2" sea determinístico bajo orderBy(desc(createdAt)).
    for (let i = 0; i < CUSTOMERS_A; i++) {
      const created = await createCustomerForSession(
        sessionOwnerA,
        form({
          fullName: `Cliente Pag A ${suffix} ${String(i).padStart(2, "0")}`,
          phone: `+52 555 ${numericId} ${String(1000 + i)}`,
          dateOfBirth: "1990-01-01",
        }),
      );
      if (!created.success) throw new Error(`setup cliente A ${i}: ${created.error}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    for (let i = 0; i < CUSTOMERS_B; i++) {
      const created = await createCustomerForSession(
        sessionOwnerB,
        form({
          fullName: `Cliente Pag B ${suffix} ${String(i).padStart(2, "0")}`,
          phone: `+52 555 ${numericId} ${String(2000 + i)}`,
          dateOfBirth: "1990-01-01",
        }),
      );
      if (!created.success) throw new Error(`setup cliente B ${i}: ${created.error}`);
    }
  });

  describe("parseo de parámetros — nunca confía en el input crudo del query string", () => {
    it("pageSize inválido/fuera de [25,50,100] cae al default (25)", () => {
      expect(parsePageSize(undefined)).toBe(25);
      expect(parsePageSize("")).toBe(25);
      expect(parsePageSize("10")).toBe(25);
      expect(parsePageSize("100000")).toBe(25);
      expect(parsePageSize("abc")).toBe(25);
      expect(parsePageSize("50")).toBe(50);
      expect(parsePageSize("100")).toBe(100);
    });

    it("page inválido/cero/negativo cae a 1", () => {
      expect(parsePage(undefined)).toBe(1);
      expect(parsePage("0")).toBe(1);
      expect(parsePage("-3")).toBe(1);
      expect(parsePage("abc")).toBe(1);
      expect(parsePage("3.5")).toBe(1);
      expect(parsePage("3")).toBe(3);
    });
  });

  describe("COUNT tenant-scoped", () => {
    it("countCustomers de A no incluye a los de B, y viceversa", async () => {
      const totalA = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        countCustomers(tx, sessionOwnerA, ""),
      );
      const totalB = await withTenantContext(sessionOwnerB.businessId, (tx) =>
        countCustomers(tx, sessionOwnerB, ""),
      );
      expect(totalA).toBe(CUSTOMERS_A);
      expect(totalB).toBe(CUSTOMERS_B);
    });
  });

  describe("LIMIT/OFFSET tenant-scoped", () => {
    it("página 1 y página 2 (pageSize=5) de A no se solapan y cubren los 7 sin filas de B", async () => {
      const [page1, page2] = await withTenantContext(sessionOwnerA.businessId, async (tx) => [
        await searchCustomers(tx, sessionOwnerA, "", { page: 1, pageSize: 5 }),
        await searchCustomers(tx, sessionOwnerA, "", { page: 2, pageSize: 5 }),
      ]);

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(CUSTOMERS_A - 5);

      const idsPage1 = new Set(page1.map((r) => r.id));
      const overlap = page2.filter((r) => idsPage1.has(r.id));
      expect(overlap).toHaveLength(0);

      const allIds = new Set([...page1, ...page2].map((r) => r.id));
      expect(allIds.size).toBe(CUSTOMERS_A);

      expect([...page1, ...page2].every((r) => r.businessId === sessionOwnerA.businessId)).toBe(true);
    });

    it("cambiar de página en A jamás devuelve una fila de B", async () => {
      const rows = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        searchCustomers(tx, sessionOwnerA, "", { page: 1, pageSize: 100 }),
      );
      expect(rows.every((r) => r.businessId === sessionOwnerA.businessId)).toBe(true);
      expect(rows).toHaveLength(CUSTOMERS_A);
    });

    it("una página más allá del total devuelve cero filas, no un error", async () => {
      const rows = await withTenantContext(sessionOwnerA.businessId, (tx) =>
        searchCustomers(tx, sessionOwnerA, "", { page: 99, pageSize: 25 }),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("búsqueda + paginación combinadas", () => {
    it("el total de páginas sale de los resultados FILTRADOS, no del total del negocio", async () => {
      const uniqueName = `Cliente Pag A ${suffix} 00`;
      const result = await searchCustomersForSession(sessionOwnerA, uniqueName, {
        page: 1,
        pageSize: 25,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.total).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].fullName).toBe(uniqueName);
    });

    it("searchCustomersForSession devuelve page/pageSize/total tenant-scoped de punta a punta", async () => {
      const result = await searchCustomersForSession(sessionOwnerB, "", { page: 1, pageSize: 25 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.total).toBe(CUSTOMERS_B);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.rows.every((r) => r.businessId === sessionOwnerB.businessId)).toBe(true);
    });
  });
});
