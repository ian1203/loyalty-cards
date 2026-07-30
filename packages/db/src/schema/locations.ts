import { boolean, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { users } from "./users";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    address: text("address"),
    timezone: text("timezone").notNull().default("UTC"),
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
    index("locations_business_id_idx").on(table.businessId),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> locations e impedir referencias cross-tenant.
    unique("locations_id_business_id_key").on(table.id, table.businessId),
    // FK compuesta: created_by/updated_by deben pertenecer al MISMO
    // business_id que la propia fila, no solo existir en users en general.
    foreignKey({
      columns: [table.createdBy, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "locations_created_by_business_id_users_fk",
    }),
    foreignKey({
      columns: [table.updatedBy, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "locations_updated_by_business_id_users_fk",
    }),
  ],
);
