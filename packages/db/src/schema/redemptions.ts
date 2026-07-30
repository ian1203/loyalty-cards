import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { locations } from "./locations";
import { rewards } from "./rewards";

// Acto de canje, separado de `rewards` (qué se ganó) — solo created_at, sin
// updated_at ni trigger.
export const redemptions = pgTable(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    rewardId: uuid("reward_id").notNull(),
    locationId: uuid("location_id").notNull(),
    employeeId: uuid("employee_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("redemptions_business_id_idempotency_key_key").on(
      table.businessId,
      table.idempotencyKey,
    ),
    index("redemptions_business_id_idx").on(table.businessId),
    foreignKey({
      columns: [table.rewardId, table.businessId],
      foreignColumns: [rewards.id, rewards.businessId],
      name: "redemptions_reward_id_business_id_rewards_fk",
    }),
    foreignKey({
      columns: [table.locationId, table.businessId],
      foreignColumns: [locations.id, locations.businessId],
      name: "redemptions_location_id_business_id_locations_fk",
    }),
    foreignKey({
      columns: [table.employeeId, table.businessId],
      foreignColumns: [employees.id, employees.businessId],
      name: "redemptions_employee_id_business_id_employees_fk",
    }),
  ],
);
