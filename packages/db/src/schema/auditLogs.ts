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
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
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
