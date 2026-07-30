import { boolean, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { roles } from "./roles";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    // Supabase Auth es dueño de las credenciales (nunca guardamos password
    // hashes propios); este es el único vínculo entre nuestra fila de
    // negocio y la identidad real en auth.users. Sin .references() de
    // Drizzle: auth.users la administra Supabase, no nuestras migraciones —
    // la FK real se agrega a mano en SQL (ver migración de auth).
    authUserId: uuid("auth_user_id").notNull().unique(),
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    fullName: text("full_name"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("users_business_id_email_key").on(table.businessId, table.email),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> users e impedir referencias cross-tenant.
    unique("users_id_business_id_key").on(table.id, table.businessId),
  ],
);
