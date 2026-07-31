import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { customers } from "./customers";

export const walletPassPlatformEnum = pgEnum("wallet_pass_platform", [
  "apple",
  "google",
]);

// Fase 4: pase individual por cliente por plataforma. passTypeIdentifier
// (Apple) y el issuer/class id (Google) NO viven acá — son de plataforma
// (una sola Pass Type ID / issuer para todo el negocio), quedan en env var
// y se derivan determinísticamente del id de esta fila / del negocio. Ver
// .claude/skills/wallet-integration/SKILL.md.
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
    // Credencial por pase que Apple manda de vuelta en cada request al web
    // service (header "Authorization: ApplePass <token>") — mismo patrón
    // que customers.wallet_token, pero esta es la identidad de ESTE pase,
    // no del cliente. Nunca se muestra en la UI ni se loguea.
    authenticationToken: text("authentication_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Ya tiene el trigger set_updated_at (migración 0001) — funciona como
    // el tag de "passesUpdatedSince" que pide el web service de Apple, sin
    // columna aparte.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wallet_passes_business_id_idx").on(table.businessId),
    // Un pase por cliente por plataforma.
    unique("wallet_passes_customer_id_platform_key").on(table.customerId, table.platform),
    // Requerido para que device_registrations tenga una FK compuesta
    // (id, business_id) -> wallet_passes e impedir referencias cross-tenant.
    unique("wallet_passes_id_business_id_key").on(table.id, table.businessId),
    foreignKey({
      columns: [table.customerId, table.businessId],
      foreignColumns: [customers.id, customers.businessId],
      name: "wallet_passes_customer_id_business_id_customers_fk",
    }),
  ],
);
