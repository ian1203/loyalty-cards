import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { walletPasses } from "./walletPasses";

// Fase 4: registro de un dispositivo (iPhone) para recibir push de un pase
// — lo que Apple crea/borra vía POST/DELETE en el web service de PassKit.
// businessId va directo en la fila (no derivado por join) porque RLS lo
// necesita así, igual que toda tabla tenant.
export const deviceRegistrations = pgTable(
  "device_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    walletPassId: uuid("wallet_pass_id").notNull(),
    deviceLibraryIdentifier: text("device_library_identifier").notNull(),
    pushToken: text("push_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("device_registrations_business_id_idx").on(table.businessId),
    index("device_registrations_wallet_pass_id_idx").on(table.walletPassId),
    // Registro idempotente: Apple puede re-registrar el mismo dispositivo
    // para el mismo pase sin que eso duplique la fila.
    unique("device_registrations_device_wallet_pass_key").on(
      table.deviceLibraryIdentifier,
      table.walletPassId,
    ),
    foreignKey({
      columns: [table.walletPassId, table.businessId],
      foreignColumns: [walletPasses.id, walletPasses.businessId],
      name: "device_registrations_wallet_pass_id_business_id_wallet_passes_fk",
    }),
  ],
);
