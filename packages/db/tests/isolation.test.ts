import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, appDb } from "../src/client";
import {
  businesses,
  customers,
  locations,
  loyaltyPrograms,
  transactions,
} from "../src/schema";
import { withTenantContext } from "../src/tenantContext";

// Este suite es la definición de "listo" de la Fase 0: demuestra, contra
// Postgres real y usando el rol de aplicación normal `app_user` (nunca el
// rol admin/servicio, que bypassa RLS por definición), que el Negocio A no
// puede leer ni escribir datos del Negocio B.
//
// El rol admin (adminDb) se usa EXCLUSIVAMENTE para sembrar y limpiar los
// datos de prueba en beforeAll/afterAll. Toda aserción de aislamiento pasa
// por withTenantContext(), que abre una transacción con `app_user`.

let businessA: typeof businesses.$inferSelect;
let businessB: typeof businesses.$inferSelect;
let customerA: typeof customers.$inferSelect;
let customerB: typeof customers.$inferSelect;
let locationA: typeof locations.$inferSelect;
let locationB: typeof locations.$inferSelect;
let programA: typeof loyaltyPrograms.$inferSelect;
let programB: typeof loyaltyPrograms.$inferSelect;
let transactionA: typeof transactions.$inferSelect;
let transactionB: typeof transactions.$inferSelect;

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  [businessA] = await adminDb
    .insert(businesses)
    .values({ name: "Isolation Test A", slug: `isolation-a-${suffix}` })
    .returning();
  [businessB] = await adminDb
    .insert(businesses)
    .values({ name: "Isolation Test B", slug: `isolation-b-${suffix}` })
    .returning();

  [customerA] = await adminDb
    .insert(customers)
    .values({ businessId: businessA.id, walletToken: `token-a-${suffix}` })
    .returning();
  [customerB] = await adminDb
    .insert(customers)
    .values({ businessId: businessB.id, walletToken: `token-b-${suffix}` })
    .returning();

  [locationA] = await adminDb
    .insert(locations)
    .values({ businessId: businessA.id, name: "Location A" })
    .returning();
  [locationB] = await adminDb
    .insert(locations)
    .values({ businessId: businessB.id, name: "Location B" })
    .returning();

  [programA] = await adminDb
    .insert(loyaltyPrograms)
    .values({ businessId: businessA.id, name: "Program A", stampsRequired: 5 })
    .returning();
  [programB] = await adminDb
    .insert(loyaltyPrograms)
    .values({ businessId: businessB.id, name: "Program B", stampsRequired: 5 })
    .returning();

  [transactionA] = await adminDb
    .insert(transactions)
    .values({
      businessId: businessA.id,
      customerId: customerA.id,
      loyaltyProgramId: programA.id,
      locationId: locationA.id,
      idempotencyKey: `seed-a-${suffix}`,
    })
    .returning();
  [transactionB] = await adminDb
    .insert(transactions)
    .values({
      businessId: businessB.id,
      customerId: customerB.id,
      loyaltyProgramId: programB.id,
      locationId: locationB.id,
      idempotencyKey: `seed-b-${suffix}`,
    })
    .returning();
});

afterAll(async () => {
  await adminDb.delete(transactions).where(eq(transactions.businessId, businessA.id));
  await adminDb.delete(transactions).where(eq(transactions.businessId, businessB.id));
  await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessA.id));
  await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessB.id));
  await adminDb.delete(locations).where(eq(locations.businessId, businessA.id));
  await adminDb.delete(locations).where(eq(locations.businessId, businessB.id));
  await adminDb.delete(customers).where(eq(customers.businessId, businessA.id));
  await adminDb.delete(customers).where(eq(customers.businessId, businessB.id));
  await adminDb.delete(businesses).where(eq(businesses.id, businessA.id));
  await adminDb.delete(businesses).where(eq(businesses.id, businessB.id));
});

describe("aislamiento de tenant — customers (tabla hoja)", () => {
  it("A no puede leer un customer de B vía SELECT (vacío, no error)", async () => {
    const rows = await withTenantContext(businessA.id, (tx) =>
      tx.select().from(customers).where(eq(customers.id, customerB.id)),
    );

    expect(rows).toHaveLength(0);
  });

  it("A no puede insertar un customer con business_id de B", async () => {
    await expect(
      withTenantContext(businessA.id, (tx) =>
        tx.insert(customers).values({
          businessId: businessB.id,
          walletToken: `hack-${Date.now()}`,
        }),
      ),
    ).rejects.toThrow();
  });

  it("A no puede modificar un customer de B vía UPDATE", async () => {
    const updated = await withTenantContext(businessA.id, (tx) =>
      tx
        .update(customers)
        .set({ fullName: "Hacked by A" })
        .where(eq(customers.id, customerB.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const stillIntact = await withTenantContext(businessB.id, (tx) =>
      tx.select().from(customers).where(eq(customers.id, customerB.id)),
    );
    expect(stillIntact[0]?.fullName).not.toBe("Hacked by A");
  });

  it("A sí puede leer y escribir sus propios datos", async () => {
    const rows = await withTenantContext(businessA.id, (tx) =>
      tx.select().from(customers).where(eq(customers.id, customerA.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(customerA.id);

    const updated = await withTenantContext(businessA.id, (tx) =>
      tx
        .update(customers)
        .set({ fullName: "Updated by A" })
        .where(eq(customers.id, customerA.id))
        .returning(),
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]?.fullName).toBe("Updated by A");
  });

  it("sin contexto de tenant fijado, las queries devuelven cero filas (deny by default)", async () => {
    const rows = await appDb.transaction((tx) => tx.select().from(customers));
    expect(rows).toHaveLength(0);
  });
});

describe("aislamiento de tenant — transactions (tabla relacional)", () => {
  it("A no puede leer las transactions de B", async () => {
    const rows = await withTenantContext(businessA.id, (tx) =>
      tx.select().from(transactions).where(eq(transactions.id, transactionB.id)),
    );
    expect(rows).toHaveLength(0);
  });

  it("A no puede insertar una transaction con business_id de B", async () => {
    await expect(
      withTenantContext(businessA.id, (tx) =>
        tx.insert(transactions).values({
          businessId: businessB.id,
          customerId: customerB.id,
          loyaltyProgramId: programB.id,
          locationId: locationB.id,
          idempotencyKey: `hack-${Date.now()}`,
        }),
      ),
    ).rejects.toThrow();
  });

  it("A sí puede leer su propia transaction", async () => {
    const rows = await withTenantContext(businessA.id, (tx) =>
      tx.select().from(transactions).where(eq(transactions.id, transactionA.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(transactionA.id);
  });

  it("un JOIN no filtra filas de B hacia el contexto de A", async () => {
    const rows = await withTenantContext(businessA.id, (tx) =>
      tx
        .select()
        .from(transactions)
        .innerJoin(customers, eq(transactions.customerId, customers.id)),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.transactions.businessId === businessA.id)).toBe(true);
    expect(rows.some((row) => row.transactions.id === transactionB.id)).toBe(false);
  });
});
