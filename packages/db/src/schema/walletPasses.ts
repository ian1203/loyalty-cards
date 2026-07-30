import { foreignKey, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { customers } from "./customers";

export const walletPassPlatformEnum = pgEnum("wallet_pass_platform", [
  "apple",
  "google",
]);

// Stub para Fase 1+: sin lógica de integración todavía.
export const walletPasses = pgTable(
  "wallet_passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: uuid("customer_id").notNull(),
    platform: walletPassPlatformEnum("platform").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wallet_passes_business_id_idx").on(table.businessId),
    foreignKey({
      columns: [table.customerId, table.businessId],
      foreignColumns: [customers.id, customers.businessId],
      name: "wallet_passes_customer_id_business_id_customers_fk",
    }),
  ],
);
