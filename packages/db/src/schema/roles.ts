import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Catálogo global de plataforma, NO tenant-scoped: 'owner'/'admin'/'staff'
// significan lo mismo para todos los negocios. Sin business_id, sin RLS.
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
