import { sql } from "drizzle-orm";
import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { businesses } from "./businesses";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    fullName: text("full_name"),
    email: text("email"),
    phone: text("phone"),
    // Token opaco referenciado por el QR del cliente — nunca datos ni saldos.
    walletToken: text("wallet_token").notNull().unique(),
    // Fecha real (no edad calculada) para poder correr campañas de
    // cumpleaños después. Nullable: el alta manual (dueño/staff) no la pide.
    dateOfBirth: date("date_of_birth"),
    occupation: text("occupation"),
    // now() solo cuando el cliente se auto-registra en /enroll y aceptó el
    // checkbox de consentimiento LFPDPPP — NULL para altas manuales, que no
    // pasan por ese consentimiento.
    privacyConsentAt: timestamp("privacy_consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customers_business_id_idx").on(table.businessId),
    index("customers_email_idx").on(table.email),
    index("customers_phone_idx").on(table.phone),
    // Requerido para que otras tablas puedan tener una FK compuesta
    // (id, business_id) -> customers e impedir referencias cross-tenant.
    unique("customers_id_business_id_key").on(table.id, table.businessId),
    // Dedupe de auto-registro público (/enroll): un mismo teléfono no puede
    // registrarse dos veces dentro del mismo negocio. Parcial (WHERE phone
    // IS NOT NULL) porque el alta manual existente permite dejar el
    // teléfono vacío.
    uniqueIndex("customers_business_id_phone_key")
      .on(table.businessId, table.phone)
      .where(sql`${table.phone} is not null`),
    // Mismo criterio que el de phone arriba, pero para el hueco real que sí
    // existía: el alta manual (/customers, apps/web/.../customers/logic.ts)
    // dedupeaba por SELECT-antes-de-INSERT a nivel app, sin ningún
    // constraint que lo respaldara — dos altas casi simultáneas del mismo
    // email (doble clic, reintento de red) podían ambas pasar el SELECT
    // antes de que cualquiera confirmara el INSERT. El email ya se guarda
    // siempre en minúsculas antes de insertar (único punto de escritura,
    // customers/logic.ts), así que un índice simple alcanza — no hace
    // falta lower(email) para normalizar acá también.
    uniqueIndex("customers_business_id_email_key")
      .on(table.businessId, table.email)
      .where(sql`${table.email} is not null`),
  ],
);
