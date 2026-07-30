import { foreignKey, index, pgEnum, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { customers } from "./customers";
import { loyaltyPrograms } from "./loyaltyPrograms";
import { rewardRules } from "./rewardRules";

export const rewardStatusEnum = pgEnum("reward_status", [
  "earned",
  "redeemed",
  "expired",
  "void",
]);

export const rewards = pgTable(
  "rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: uuid("customer_id").notNull(),
    loyaltyProgramId: uuid("loyalty_program_id").notNull(),
    rewardRuleId: uuid("reward_rule_id").notNull(),
    status: rewardStatusEnum("status").notNull().default("earned"),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rewards_business_id_customer_id_idx").on(
      table.businessId,
      table.customerId,
    ),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> rewards e impedir referencias cross-tenant.
    unique("rewards_id_business_id_key").on(table.id, table.businessId),
    foreignKey({
      columns: [table.customerId, table.businessId],
      foreignColumns: [customers.id, customers.businessId],
      name: "rewards_customer_id_business_id_customers_fk",
    }),
    foreignKey({
      columns: [table.loyaltyProgramId, table.businessId],
      foreignColumns: [loyaltyPrograms.id, loyaltyPrograms.businessId],
      name: "rewards_loyalty_program_id_business_id_loyalty_programs_fk",
    }),
    foreignKey({
      columns: [table.rewardRuleId, table.businessId],
      foreignColumns: [rewardRules.id, rewardRules.businessId],
      name: "rewards_reward_rule_id_business_id_reward_rules_fk",
    }),
  ],
);
