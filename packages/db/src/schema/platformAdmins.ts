import { boolean, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// owner: acceso total (alta de negocios, gestión de otros admins,
// impersonación). viewer: solo lectura + impersonación de solo-lectura
// (nunca provisiona la fila de `users` que le daría capacidad de escribir
// como el dueño impersonado — ver platformImpersonationGrants.ts). La
// aplicación exacta de estos permisos vive en el Panel de Admin de
// Plataforma, no acá.
export const platformRoleEnum = pgEnum("platform_role", ["owner", "viewer"]);

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
  // Default 'owner' a nivel de DB (no solo Drizzle) a propósito: ya
  // existen filas reales en prod creadas antes de que existiera el
  // concepto de rol (todas con acceso total sin distinción) y decenas de
  // sitios de test que insertan sin especificar rol — el default
  // preserva ese comportamiento sin tener que tocar ninguna fila/caller
  // existente.
  platformRole: platformRoleEnum("platform_role").notNull().default("owner"),
  // Mismo criterio de soft-deactivation que users.isActive/
  // employees.isActive: nunca DELETE, porque audit_logs.actor_auth_user_id
  // tiene FK RESTRICT hacia esta tabla.
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
