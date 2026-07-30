import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    fullName: text("full_name"),
    email: text("email"),
    phone: text("phone"),
    // Token opaco referenciado por el QR del cliente — nunca datos ni saldos.
    walletToken: text("wallet_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customers_business_id_idx").on(table.businessId),
    index("customers_email_idx").on(table.email),
    index("customers_phone_idx").on(table.phone),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> customers e impedir referencias cross-tenant.
    unique("customers_id_business_id_key").on(table.id, table.businessId),
  ],
);
