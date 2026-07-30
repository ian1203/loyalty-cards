import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { users } from "./users";

export const loyaltyProgramTypeEnum = pgEnum("loyalty_program_type", [
  "stamps",
]);

export const loyaltyPrograms = pgTable(
  "loyalty_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    type: loyaltyProgramTypeEnum("type").notNull().default("stamps"),
    stampsRequired: integer("stamps_required").notNull(),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
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
    index("loyalty_programs_business_id_idx").on(table.businessId),
    check(
      "loyalty_programs_stamps_required_check",
      sql`${table.stampsRequired} > 0`,
    ),
    check(
      "loyalty_programs_cooldown_seconds_check",
      sql`${table.cooldownSeconds} >= 0`,
    ),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> loyalty_programs e impedir referencias
    // cross-tenant.
    unique("loyalty_programs_id_business_id_key").on(table.id, table.businessId),
    foreignKey({
      columns: [table.createdBy, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "loyalty_programs_created_by_business_id_users_fk",
    }),
    foreignKey({
      columns: [table.updatedBy, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "loyalty_programs_updated_by_business_id_users_fk",
    }),
  ],
);
