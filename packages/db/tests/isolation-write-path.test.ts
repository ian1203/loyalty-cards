import { randomUUID } from "node:crypto";
import { eq, sql, type AnyColumn } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "../src/client";
import {
  auditLogs,
  businesses,
  campaigns,
  customerBalances,
  customers,
  employees,
  locations,
  loyaltyPrograms,
  redemptions,
  rewardRules,
  rewards,
  roles,
  transactions,
  users,
  walletPasses,
} from "../src/schema";
import { withTenantContext, type VerifiedBusinessId } from "../src/tenantContext";

// Complementa isolation.test.ts: en vez de probar solo un par de tablas a
// mano, recorre las 13 tablas con business_id (todas las tenant-scoped
// menos `businesses`, que se prueba aparte porque su política usa "id", y
// `roles`, que ya no es tenant-scoped — ver 0005_roles_to_global_catalog.sql)
// y prueba, para cada una, el camino de ESCRITURA con el rol app_user normal:
//   1. INSERT con business_id ajeno debe fallar (viola WITH CHECK).
//   2. UPDATE que mueve business_id de una fila propia a otro tenant debe
//      fallar (viola WITH CHECK sobre la fila nueva).

let owner: typeof businesses.$inferSelect;
let foreign: typeof businesses.$inferSelect;
// Único cast de este archivo: fixture de adminDb, fuente confiable
// equivalente a una sesión verificada en producción.
let ownerBusinessId: VerifiedBusinessId;

type Fixture = {
  role: typeof roles.$inferSelect;
  user: typeof users.$inferSelect;
  location: typeof locations.$inferSelect;
  employee: typeof employees.$inferSelect;
  customer: typeof customers.$inferSelect;
  loyaltyProgram: typeof loyaltyPrograms.$inferSelect;
  rewardRule: typeof rewardRules.$inferSelect;
  customerBalance: typeof customerBalances.$inferSelect;
  transaction: typeof transactions.$inferSelect;
  reward: typeof rewards.$inferSelect;
  redemption: typeof redemptions.$inferSelect;
  auditLog: typeof auditLogs.$inferSelect;
  walletPass: typeof walletPasses.$inferSelect;
  campaign: typeof campaigns.$inferSelect;
};

let fx: Fixture;

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  [owner] = await adminDb
    .insert(businesses)
    .values({ name: "Write Path Owner", slug: `write-path-owner-${suffix}` })
    .returning();
  [foreign] = await adminDb
    .insert(businesses)
    .values({ name: "Write Path Foreign", slug: `write-path-foreign-${suffix}` })
    .returning();

  const businessId = owner.id;
  ownerBusinessId = businessId as VerifiedBusinessId;

  // roles ya no es tenant-scoped (catálogo global sembrado por migración):
  // se referencia, no se crea.
  const [role] = await adminDb.select().from(roles).where(eq(roles.name, "owner"));

  // users.auth_user_id tiene FK real a auth.users(id) (Fase 1). Este test
  // opera a nivel de DB, no de Supabase Auth, así que sembramos directo una
  // fila mínima en auth.users (solo "id" es NOT NULL sin default) —
  // suficiente para satisfacer la FK, no crea una identidad real con la que
  // se pueda hacer login.
  const authUserId = randomUUID();
  await adminDb.execute(sql`insert into auth.users (id) values (${authUserId})`);
  const [user] = await adminDb
    .insert(users)
    .values({ businessId, authUserId, email: `u-${suffix}@test.dev`, roleId: role.id })
    .returning();
  const [location] = await adminDb.insert(locations).values({ businessId, name: `Loc ${suffix}` }).returning();
  const [employee] = await adminDb
    .insert(employees)
    .values({ businessId, userId: user.id, primaryLocationId: location.id, fullName: `Emp ${suffix}` })
    .returning();
  const [customer] = await adminDb
    .insert(customers)
    .values({ businessId, walletToken: `tok-${suffix}` })
    .returning();
  const [loyaltyProgram] = await adminDb
    .insert(loyaltyPrograms)
    .values({ businessId, name: `Prog ${suffix}`, stampsRequired: 5 })
    .returning();
  const [rewardRule] = await adminDb
    .insert(rewardRules)
    .values({ businessId, loyaltyProgramId: loyaltyProgram.id, name: `Rule ${suffix}`, stampsRequired: 5 })
    .returning();
  const [customerBalance] = await adminDb
    .insert(customerBalances)
    .values({ businessId, customerId: customer.id, loyaltyProgramId: loyaltyProgram.id })
    .returning();
  const [transaction] = await adminDb
    .insert(transactions)
    .values({
      businessId,
      customerId: customer.id,
      loyaltyProgramId: loyaltyProgram.id,
      locationId: location.id,
      idempotencyKey: `txn-${suffix}`,
    })
    .returning();
  const [reward] = await adminDb
    .insert(rewards)
    .values({ businessId, customerId: customer.id, loyaltyProgramId: loyaltyProgram.id, rewardRuleId: rewardRule.id })
    .returning();
  const [redemption] = await adminDb
    .insert(redemptions)
    .values({ businessId, rewardId: reward.id, locationId: location.id, idempotencyKey: `red-${suffix}` })
    .returning();
  const [auditLog] = await adminDb
    .insert(auditLogs)
    .values({ businessId, action: "test.seed", entityType: "customer", entityId: customer.id })
    .returning();
  const [walletPass] = await adminDb
    .insert(walletPasses)
    .values({ businessId, customerId: customer.id, platform: "apple" })
    .returning();
  const [campaign] = await adminDb.insert(campaigns).values({ businessId, name: `Campaign ${suffix}` }).returning();

  fx = {
    role,
    user,
    location,
    employee,
    customer,
    loyaltyProgram,
    rewardRule,
    customerBalance,
    transaction,
    reward,
    redemption,
    auditLog,
    walletPass,
    campaign,
  };
});

afterAll(async () => {
  // Orden inverso a las dependencias de FK.
  await adminDb.delete(redemptions).where(eq(redemptions.businessId, owner.id));
  await adminDb.delete(rewards).where(eq(rewards.businessId, owner.id));
  await adminDb.delete(transactions).where(eq(transactions.businessId, owner.id));
  await adminDb.delete(customerBalances).where(eq(customerBalances.businessId, owner.id));
  await adminDb.delete(rewardRules).where(eq(rewardRules.businessId, owner.id));
  await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, owner.id));
  await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, owner.id));
  await adminDb.delete(walletPasses).where(eq(walletPasses.businessId, owner.id));
  await adminDb.delete(campaigns).where(eq(campaigns.businessId, owner.id));
  await adminDb.delete(employees).where(eq(employees.businessId, owner.id));
  await adminDb.delete(customers).where(eq(customers.businessId, owner.id));
  await adminDb.delete(locations).where(eq(locations.businessId, owner.id));
  await adminDb.delete(users).where(eq(users.businessId, owner.id));
  // roles es catálogo global compartido — no se borra en el teardown.
  await adminDb.delete(businesses).where(eq(businesses.id, owner.id));
  await adminDb.delete(businesses).where(eq(businesses.id, foreign.id));
});

type TenantTableSpec = {
  name: string;
  table: PgTable & { id: AnyColumn; businessId: AnyColumn };
  ownRowId: (fx: Fixture) => string;
  insertValues: (fx: Fixture, businessId: string) => Record<string, unknown>;
};

function specs(): TenantTableSpec[] {
  return [
    // roles NO va aquí: dejó de ser tenant-scoped (ver
    // 0005_roles_to_global_catalog.sql), ahora es catálogo global sin
    // business_id ni RLS — no hay aislamiento de tenant que probar.
    {
      name: "users",
      table: users as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.user.id,
      insertValues: (f, businessId) => ({
        businessId,
        email: `insert-${randomUUID()}@test.dev`,
        roleId: f.role.id,
      }),
    },
    {
      name: "locations",
      table: locations as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.location.id,
      insertValues: (_f, businessId) => ({ businessId, name: `insert-${randomUUID()}` }),
    },
    {
      name: "employees",
      table: employees as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.employee.id,
      insertValues: (_f, businessId) => ({ businessId, fullName: `insert-${randomUUID()}` }),
    },
    {
      name: "customers",
      table: customers as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.customer.id,
      insertValues: (_f, businessId) => ({ businessId, walletToken: `insert-${randomUUID()}` }),
    },
    {
      name: "loyalty_programs",
      table: loyaltyPrograms as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.loyaltyProgram.id,
      insertValues: (_f, businessId) => ({
        businessId,
        name: `insert-${randomUUID()}`,
        stampsRequired: 5,
      }),
    },
    {
      name: "reward_rules",
      table: rewardRules as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.rewardRule.id,
      insertValues: (f, businessId) => ({
        businessId,
        loyaltyProgramId: f.loyaltyProgram.id,
        name: `insert-${randomUUID()}`,
        stampsRequired: 5,
      }),
    },
    {
      name: "customer_balances",
      table: customerBalances as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.customerBalance.id,
      insertValues: (f, businessId) => ({
        businessId,
        customerId: f.customer.id,
        loyaltyProgramId: f.loyaltyProgram.id,
      }),
    },
    {
      name: "transactions",
      table: transactions as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.transaction.id,
      insertValues: (f, businessId) => ({
        businessId,
        customerId: f.customer.id,
        loyaltyProgramId: f.loyaltyProgram.id,
        locationId: f.location.id,
        idempotencyKey: `insert-${randomUUID()}`,
      }),
    },
    {
      name: "rewards",
      table: rewards as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.reward.id,
      insertValues: (f, businessId) => ({
        businessId,
        customerId: f.customer.id,
        loyaltyProgramId: f.loyaltyProgram.id,
        rewardRuleId: f.rewardRule.id,
      }),
    },
    {
      name: "redemptions",
      table: redemptions as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.redemption.id,
      insertValues: (f, businessId) => ({
        businessId,
        rewardId: f.reward.id,
        locationId: f.location.id,
        idempotencyKey: `insert-${randomUUID()}`,
      }),
    },
    {
      name: "audit_logs",
      table: auditLogs as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.auditLog.id,
      insertValues: (_f, businessId) => ({
        businessId,
        action: "test.insert",
        entityType: "customer",
        entityId: randomUUID(),
      }),
    },
    {
      name: "wallet_passes",
      table: walletPasses as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.walletPass.id,
      insertValues: (f, businessId) => ({ businessId, customerId: f.customer.id, platform: "apple" }),
    },
    {
      name: "campaigns",
      table: campaigns as unknown as TenantTableSpec["table"],
      ownRowId: (f) => f.campaign.id,
      insertValues: (_f, businessId) => ({ businessId, name: `insert-${randomUUID()}` }),
    },
  ];
}

// drizzle-orm envuelve el error real de Postgres en `.cause` (el `.message`
// del error externo es solo "Failed query: ..."), así que hay que revisar
// `.cause.code` para distinguir un rechazo de RLS (42501, insufficient_
// privilege) de cualquier otro tipo de fallo — no basta con "algo lanzó".
async function expectRlsViolation(promise: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  expect(caught, "se esperaba que la operación fuera rechazada por RLS, pero no lanzó").toBeDefined();
  const cause = (caught as { cause?: { code?: string; message?: string } }).cause;
  expect(
    cause?.code,
    `se esperaba el código Postgres 42501 (RLS); error real: ${cause?.message ?? String(caught)}`,
  ).toBe("42501");
}

describe.each(specs())("aislamiento de tenant — write path — $name", (spec) => {
  it("INSERT con business_id ajeno falla (viola WITH CHECK)", async () => {
    await expectRlsViolation(
      withTenantContext(ownerBusinessId, (tx) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx.insert(spec.table) as any).values(spec.insertValues(fx, foreign.id)),
      ),
    );
  });

  it("UPDATE que mueve business_id de una fila propia a otro tenant falla", async () => {
    const ownId = spec.ownRowId(fx);

    await expectRlsViolation(
      withTenantContext(ownerBusinessId, (tx) =>
        tx
          .update(spec.table)
          .set({ businessId: foreign.id })
          .where(eq(spec.table.id, ownId)),
      ),
    );

    // La fila debe seguir intacta, todavía en el tenant original.
    const [stillOwned] = await withTenantContext(ownerBusinessId, (tx) =>
      tx.select().from(spec.table).where(eq(spec.table.id, ownId)),
    );
    expect((stillOwned as { businessId: string } | undefined)?.businessId).toBe(owner.id);
  });
});

describe("aislamiento de tenant — write path — businesses (raíz, política por id)", () => {
  it("A no puede leer ni escribir la fila de negocio B (política por id, no business_id)", async () => {
    const rows = await withTenantContext(ownerBusinessId, (tx) =>
      tx.select().from(businesses).where(eq(businesses.id, foreign.id)),
    );
    expect(rows).toHaveLength(0);

    const updated = await withTenantContext(ownerBusinessId, (tx) =>
      tx.update(businesses).set({ name: "Hacked" }).where(eq(businesses.id, foreign.id)).returning(),
    );
    expect(updated).toHaveLength(0);
  });
});
