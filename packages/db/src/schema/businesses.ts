import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const businessStatusEnum = pgEnum("business_status", [
  "active",
  "suspended",
]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: businessStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Sin FK a users.id: crearla generaría un ciclo de dependencia con
  // users.business_id -> businesses.id, y un negocio puede existir antes de
  // que exista ningún usuario (alta/provisioning).
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
});
