import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// Catálogo global de plataforma, separado a propósito de `users`: un admin
// general no pertenece a ningún negocio, así que no tiene fila en `users`
// (que exige business_id NOT NULL). Sin business_id, sin RLS, sin ningún
// grant para app_user (ni siquiera SELECT) — solo adminDb puede leerla o
// escribirla, y el hook de auth (como supabase_auth_admin) para construir
// el claim is_platform_admin.
//
// auth_user_id NO se declara con .references() de Drizzle: apunta a
// auth.users, una tabla que administra Supabase Auth y que nuestras
// migraciones nunca crean. drizzle-kit no sabe distinguir "esta tabla ya
// existe, no la generes" de "gestiona esta tabla" cuando se declara como
// pgTable — así que la FK real a auth.users(id) se agrega a mano en SQL
// (mismo patrón que ya usamos para RLS/roles/triggers).
export const platformAdmins = pgTable("platform_admins", {
  authUserId: uuid("auth_user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
