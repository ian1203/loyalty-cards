import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { users } from "./users";

// Ledger inmutable de envíos de broadcast de promociones a Wallet (dueño
// redacta un mensaje, se empuja como notificación a TODOS los clientes
// con el pase guardado — ver apps/web/app/(product)/promotions/logic.ts).
// Mismo molde que transactions.ts/redemptions.ts: solo created_at, sin
// updated_at ni trigger — un envío ya hecho no se edita ni se borra.
// El texto que lee packages/wallet para el pase (backFields de Apple,
// mensaje de clase de Google) es el `message` MÁS RECIENTE de esta tabla
// para el negocio — sin columna duplicada en businesses (evita
// desincronización entre columna y ledger).
export const promoBroadcasts = pgTable(
  "promo_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    sentByUserId: uuid("sent_by_user_id").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Soporta los COUNT de límite diario/mensual (WHERE business_id = ?
    // AND created_at >= ?) sin escanear toda la tabla.
    index("promo_broadcasts_business_id_created_at_idx").on(
      table.businessId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.sentByUserId, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "promo_broadcasts_sent_by_user_id_business_id_users_fk",
    }),
  ],
);
