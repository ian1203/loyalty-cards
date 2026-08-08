import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { platformAdmins } from "./platformAdmins";

export const businessStatusEnum = pgEnum("business_status", [
  "active",
  "suspended",
]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: businessStatusEnum("status").notNull().default("active"),
  // URL pública del logo del negocio (para el form de /enroll y futuros
  // usos de marca) — nullable a propósito: un negocio sin logo cargado
  // simplemente no lo muestra, nunca un placeholder inventado. No es dato
  // sensible, no necesita RLS más allá de la política existente de
  // businesses.
  logoUrl: text("logo_url"),
  // Color de marca real en hex (ej. "#DB0A00") — cuando está seteado,
  // reemplaza el color hash-derivado de deriveBrandColor()
  // (apps/web/lib/wallet/brandColor.ts), que sigue como fallback para
  // negocios sin branding real cargado todavía. Mismo criterio nullable
  // que logoUrl: sin valor, sin placeholder inventado.
  brandColorHex: text("brand_color_hex"),
  // URL del hero/strip para el .pkpass de Apple (imagen ancha, ej. foto
  // de producto) — nullable: sin ella, el pase sigue el layout plano
  // actual, nunca un placeholder genérico.
  walletHeroUrl: text("wallet_hero_url"),
  // Logo para el HEADER del .pkpass de Apple — deliberadamente separado
  // de logoUrl (el de /enroll, un crop circular distinto): reusar el
  // mismo campo hubiera cambiado lo que ya se ve en /enroll, que quedó
  // aprobado y no debía tocarse.
  walletLogoUrl: text("wallet_logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // FK real ahora que platform_admins existe (Fase 1): un negocio lo crea
  // un admin general, no un users.id — platform_admins no depende de
  // businesses, así que no hay el ciclo que sí existía contra users.id en
  // Fase 0.
  createdBy: uuid("created_by").references(() => platformAdmins.authUserId),
  updatedBy: uuid("updated_by").references(() => platformAdmins.authUserId),
});
