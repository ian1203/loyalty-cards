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
