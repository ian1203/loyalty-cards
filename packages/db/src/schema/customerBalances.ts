import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { customers } from "./customers";
import { loyaltyPrograms } from "./loyaltyPrograms";

export const customerBalances = pgTable(
  "customer_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: uuid("customer_id").notNull(),
    loyaltyProgramId: uuid("loyalty_program_id").notNull(),
    currentStamps: integer("current_stamps").notNull().default(0),
    cycleStartedAt: timestamp("cycle_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastStampAt: timestamp("last_stamp_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("customer_balances_customer_id_loyalty_program_id_key").on(
      table.customerId,
      table.loyaltyProgramId,
    ),
    index("customer_balances_business_id_customer_id_idx").on(
      table.businessId,
      table.customerId,
    ),
    check("customer_balances_current_stamps_check", sql`${table.currentStamps} >= 0`),
    foreignKey({
      columns: [table.customerId, table.businessId],
      foreignColumns: [customers.id, customers.businessId],
      name: "customer_balances_customer_id_business_id_customers_fk",
    }),
    foreignKey({
      columns: [table.loyaltyProgramId, table.businessId],
      foreignColumns: [loyaltyPrograms.id, loyaltyPrograms.businessId],
      name: "customer_balances_loyalty_program_id_business_id_loyalty_programs_fk",
    }),
  ],
);
