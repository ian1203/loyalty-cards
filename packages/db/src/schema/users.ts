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
    //
    // Deliberadamente SIN .unique() acá: no es único global, ver el UNIQUE
    // compuesto (auth_user_id, business_id) abajo — un platform admin que
    // impersona a un dueño necesita una fila real de `users` por cada
    // negocio impersonado, con el MISMO auth_user_id (su login real de
    // plataforma) en negocios distintos (ver
    // platformImpersonationGrants.ts).
    authUserId: uuid("auth_user_id").notNull(),
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
    // Reemplaza el UNIQUE global de auth_user_id (ver comentario arriba):
    // preserva la garantía real para usuarios normales (nunca dos filas
    // activas del mismo auth_user_id en el MISMO negocio) sin bloquear el
    // caso legítimo de impersonación (mismo auth_user_id, negocios
    // distintos).
    unique("users_auth_user_id_business_id_key").on(
      table.authUserId,
      table.businessId,
    ),
  ],
);
