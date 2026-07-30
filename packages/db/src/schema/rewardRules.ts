import { boolean, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { loyaltyPrograms } from "./loyaltyPrograms";
import { users } from "./users";

export const rewardRules = pgTable(
  "reward_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    loyaltyProgramId: uuid("loyalty_program_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    stampsRequired: integer("stamps_required").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    index("reward_rules_business_id_idx").on(table.businessId),
    index("reward_rules_loyalty_program_id_idx").on(table.loyaltyProgramId),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> reward_rules e impedir referencias cross-tenant.
    unique("reward_rules_id_business_id_key").on(table.id, table.businessId),
    foreignKey({
      columns: [table.loyaltyProgramId, table.businessId],
      foreignColumns: [loyaltyPrograms.id, loyaltyPrograms.businessId],
      name: "reward_rules_loyalty_program_id_business_id_loyalty_programs_fk",
    }),
    foreignKey({
      columns: [table.createdBy, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "reward_rules_created_by_business_id_users_fk",
    }),
    foreignKey({
      columns: [table.updatedBy, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "reward_rules_updated_by_business_id_users_fk",
    }),
  ],
);
