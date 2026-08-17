import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { locations } from "./locations";
import { platformAdmins } from "./platformAdmins";
import { users } from "./users";

// Append-only: sin updated_at ni trigger.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable desde el Panel de Admin de Plataforma: la gestión de
    // CUENTAS de plataforma (invitar/desactivar/cambiar rol de un
    // platform_admin) es una acción sensible sin ningún negocio al que
    // asociarla — a diferencia de business.created, que sí tiene un
    // business_id real. RLS sigue protegiendo a app_user igual que antes:
    // una fila con business_id NULL nunca calza contra
    // current_setting('app.current_business_id') (comparación NULL, nunca
    // true), así que sigue siendo estructuralmente invisible para
    // cualquier sesión de tenant — solo adminDb (bypassa RLS) las
    // lee/escribe.
    businessId: uuid("business_id").references(() => businesses.id),
    actorUserId: uuid("actor_user_id"),
    actorEmployeeId: uuid("actor_employee_id"),
    // Acciones de plataforma (p.ej. alta de negocio) las hace un admin
    // general, no un users.id de ese negocio — no es FK compuesta con
    // business_id porque el admin no pertenece a ningún tenant.
    actorAuthUserId: uuid("actor_auth_user_id").references(() => platformAdmins.authUserId),
    locationId: uuid("location_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_business_id_idx").on(table.businessId),
    foreignKey({
      columns: [table.actorUserId, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "audit_logs_actor_user_id_business_id_users_fk",
    }),
    foreignKey({
      columns: [table.actorEmployeeId, table.businessId],
      foreignColumns: [employees.id, employees.businessId],
      name: "audit_logs_actor_employee_id_business_id_employees_fk",
    }),
    foreignKey({
      columns: [table.locationId, table.businessId],
      foreignColumns: [locations.id, locations.businessId],
      name: "audit_logs_location_id_business_id_locations_fk",
    }),
  ],
);
