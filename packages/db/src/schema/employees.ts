import { boolean, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { locations } from "./locations";
import { users } from "./users";

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: uuid("user_id"),
    primaryLocationId: uuid("primary_location_id"),
    fullName: text("full_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("employees_business_id_idx").on(table.businessId),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> employees e impedir referencias cross-tenant.
    unique("employees_id_business_id_key").on(table.id, table.businessId),
    foreignKey({
      columns: [table.userId, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "employees_user_id_business_id_users_fk",
    }),
    foreignKey({
      columns: [table.primaryLocationId, table.businessId],
      foreignColumns: [locations.id, locations.businessId],
      name: "employees_primary_location_id_business_id_locations_fk",
    }),
  ],
);
