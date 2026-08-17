import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { platformAdmins, platformRoleEnum } from "./platformAdmins";
import { users } from "./users";

// Ledger de sesiones de impersonación de negocio por un admin de
// plataforma. Tabla 100% interna de plataforma, mismo criterio que
// platform_admins: sin business_id propio como columna de tenencia (vive
// FUERA del modelo RLS-por-fila de negocio, aunque referencia un
// business_id), sin RLS, sin ningún GRANT para app_user/authenticated/
// anon — solo adminDb la escribe/lee desde la app. Una migración FUTURA
// (fuera de esta) le da a supabase_auth_admin un GRANT SELECT puntual
// para que el hook de auth pueda resolver el claim de impersonación
// activa, mismo patrón que ya usa platform_admins.
export const platformImpersonationGrants = pgTable(
  "platform_impersonation_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platformAdminAuthUserId: uuid("platform_admin_auth_user_id")
      .notNull()
      .references(() => platformAdmins.authUserId),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    // Copiado al crear el grant, no relee platform_admins en cada
    // resolución de claims — un cambio de rol del admin DESPUÉS de
    // otorgado el grant no debe alterar retroactivamente los permisos de
    // una sesión de impersonación ya en curso.
    platformRoleAtGrantTime: platformRoleEnum(
      "platform_role_at_grant_time",
    ).notNull(),
    // Fila de `users` provisionada para que el admin escriba como el
    // dueño impersonado (FK compuesta abajo). SOLO grants de rol owner
    // la tienen — los de rol viewer se quedan NULL a propósito: nunca se
    // provisiona fila de users para un viewer, así que estructuralmente
    // no puede escribir nada mientras impersona.
    impersonatedUsersId: uuid("impersonated_users_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Red de seguridad ("dead man's switch") fijada por la app a
    // created_at + 24h al insertar — el mecanismo real de terminación es
    // la acción explícita "salir de impersonación" (ended_at), esto NO es
    // pensado como una sesión corta a propósito.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    // La resolución de claims de impersonación en el hook de auth hace
    // WHERE platform_admin_auth_user_id = X AND ended_at IS NULL AND
    // expires_at > now() ORDER BY created_at DESC LIMIT 1 — necesita ser
    // rápido.
    index("platform_impersonation_grants_platform_admin_auth_user_id_idx").on(
      table.platformAdminAuthUserId,
    ),
    // Invariante real a nivel de DB, no solo de aplicación: a lo más UN
    // grant activo (ended_at NULL) por admin a la vez — startImpersonation
    // ya termina cualquier grant previo del mismo admin antes de crear uno
    // nuevo, pero eso por sí solo no cierra una carrera real (dos requests
    // concurrentes de startImpersonation para el mismo admin). Sin este
    // índice, esa carrera podría dejar DOS filas de `users` activas
    // simultáneas para el mismo (auth_user_id, business_id) — el hook de
    // auth (LIMIT 1, sin ORDER BY determinista sobre esa ambigüedad)
    // quedaría dependiendo de cuál matchee primero. Un índice único
    // PARCIAL (mismo patrón que customers.ts para phone/email) hace que la
    // segunda transacción falle con un error de constraint en vez de
    // completar en silencio.
    uniqueIndex("platform_impersonation_grants_one_active_per_admin_idx")
      .on(table.platformAdminAuthUserId)
      .where(sql`${table.endedAt} is null`),
    // FK compuesta: la fila de users provisionada debe pertenecer al
    // MISMO business_id que el grant, no solo existir en users en
    // general (mismo patrón que locations.created_by/updated_by en
    // packages/db/src/schema/locations.ts).
    foreignKey({
      columns: [table.impersonatedUsersId, table.businessId],
      foreignColumns: [users.id, users.businessId],
      name: "platform_impersonation_grants_impersonated_users_id_business_id_users_fk",
    }),
  ],
);
